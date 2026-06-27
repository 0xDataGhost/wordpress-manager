import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { paginate } from "../../lib/paginate";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { importCodes } from "./digital-inventory.import";
import {
  getBatch,
  getCode,
  getInventorySummary,
  listBatches,
  listCodes,
  revealCode,
  updateCodeStatus,
} from "./digital-inventory.service";
import {
  toBatchDto,
  toCodeDetailsDto,
  toCodeListItemDto,
} from "./digital-inventory.serializer";
import type {
  BatchParams,
  CodeParams,
  ImportCodesInput,
  ListBatchesQuery,
  ListCodesQuery,
  MarkInvalidInput,
  SummaryQuery,
  UpdateCodeStatusInput,
} from "./digital-inventory.schemas";

/** GET /digital-inventory/summary — status counts + low-stock (digital_inventory.view). */
export async function getSummaryHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as SummaryQuery;
  const summary = await getInventorySummary(storeId, query);
  res.status(200).json(successResponse(summary, ""));
}

/** GET /digital-inventory/codes — masked list (digital_inventory.view). */
export async function listCodesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListCodesQuery;
  const result = await listCodes(storeId, query);
  res.status(200).json(
    successResponse({
      items: result.items.map(toCodeListItemDto),
      pagination: paginate(result.total, result.page, result.limit),
    }),
  );
}

/** GET /digital-inventory/codes/:id — masked details (digital_inventory.view). */
export async function getCodeHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CodeParams;
  const row = await getCode(storeId, id);
  if (!row) {
    throw new NotFoundError("Code not found");
  }
  res.status(200).json(successResponse(toCodeDetailsDto(row), ""));
}

/** POST /digital-inventory/import — import codes (digital_inventory.import). */
export async function importHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const input = req.body as ImportCodesInput;
  const result = await importCodes(storeId, userId, input);

  // Audit: never include any raw/encrypted code — counts + ids only.
  if (result.batchId) {
    await recordAuditFromRequest(req, {
      action: AUDIT_ACTIONS.DIGITAL_BATCH_CREATED,
      entityType: AUDIT_ENTITY_TYPES.DIGITAL_BATCH,
      entityId: result.batchId,
      message: "أنشأ دفعة أكواد رقمية",
      metadata: { productId: result.productId, quantity: result.inserted },
    });
  }
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.DIGITAL_CODES_IMPORTED,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_CODE,
    entityId: result.batchId ?? result.productId,
    message: "استورد أكواداً رقمية",
    metadata: {
      productId: result.productId,
      batchId: result.batchId,
      received: result.received,
      inserted: result.inserted,
      duplicatesInFile: result.duplicatesInFile,
      duplicatesExisting: result.duplicatesExisting,
      invalid: result.invalid,
    },
  });

  res.status(201).json(
    successResponse(
      {
        batchId: result.batchId,
        received: result.received,
        inserted: result.inserted,
        duplicatesInFile: result.duplicatesInFile,
        duplicatesExisting: result.duplicatesExisting,
        invalid: result.invalid,
      },
      "Import complete",
    ),
  );
}

/** POST /digital-inventory/codes/:id/reveal — full code once (digital_inventory.reveal). */
export async function revealHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CodeParams;
  const revealed = await revealCode(storeId, id);

  // Audit the reveal — WITHOUT the raw code (preview/status only).
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.DIGITAL_CODE_REVEALED,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_CODE,
    entityId: revealed.id,
    message: "كشف كوداً رقمياً",
    metadata: {
      productId: revealed.productId,
      batchId: revealed.batchId,
      codePreview: revealed.codePreview,
      status: revealed.status,
    },
  });

  // The full code is sensitive: never cache it.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(
    successResponse(
      { id: revealed.id, code: revealed.code, revealedAt: revealed.revealedAt },
      "",
    ),
  );
}

/** PATCH /digital-inventory/codes/:id/status — manual status change (digital_inventory.edit). */
export async function updateStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CodeParams;
  const input = req.body as UpdateCodeStatusInput;
  const result = await updateCodeStatus(storeId, id, input);

  // Audit: status names + ids only — never the reason text or any code.
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.DIGITAL_CODE_STATUS_UPDATED,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_CODE,
    entityId: result.code.id,
    message: "حدّث حالة كود رقمي",
    metadata: {
      productId: result.code.productId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
    },
  });

  res.status(200).json(
    successResponse(
      toCodeDetailsDto({
        code: result.code,
        productName: null,
        batchName: null,
      }),
      "Status updated",
    ),
  );
}

/** POST /digital-inventory/codes/:id/mark-invalid — flag a bad code (digital_inventory.edit). */
export async function markInvalidHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as CodeParams;
  const input = req.body as MarkInvalidInput;
  const result = await updateCodeStatus(storeId, id, {
    status: "invalid",
    reason: input.reason,
  });

  // Audit: ids + status only — never the reason text or any code.
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.DIGITAL_CODE_MARKED_INVALID,
    entityType: AUDIT_ENTITY_TYPES.DIGITAL_CODE,
    entityId: result.code.id,
    message: "علّم كوداً رقمياً كغير صالح",
    metadata: {
      productId: result.code.productId,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
    },
  });

  res.status(200).json(
    successResponse(
      toCodeDetailsDto({
        code: result.code,
        productName: null,
        batchName: null,
      }),
      "Code marked invalid",
    ),
  );
}

/** GET /digital-inventory/batches — batch list (digital_inventory.view). */
export async function listBatchesHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListBatchesQuery;
  const result = await listBatches(storeId, query);
  res.status(200).json(
    successResponse({
      items: result.items.map((row) => toBatchDto(row.batch, row.productName)),
      pagination: paginate(result.total, result.page, result.limit),
    }),
  );
}

/** GET /digital-inventory/batches/:id — batch details (digital_inventory.view). */
export async function getBatchHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as BatchParams;
  const details = await getBatch(storeId, id);
  if (!details) {
    throw new NotFoundError("Batch not found");
  }
  res.status(200).json(
    successResponse({
      ...toBatchDto(details.batch, details.productName),
      statusBreakdown: details.statusBreakdown,
    }),
  );
}
