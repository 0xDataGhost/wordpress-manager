import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import {
  createTaxonomyTerm,
  deleteTaxonomyTerm,
  listTaxonomyTerms,
  updateTaxonomyTerm,
} from "./catalog.service";
import { toTaxonomyTermDto } from "./catalog.serializer";
import {
  taxonomySlugToKind,
  type CreateTaxonomyInput,
  type ListTaxonomyQuery,
  type TaxonomyParams,
  type TaxonomyTermParams,
  type UpdateTaxonomyInput,
} from "./catalog.schemas";

export async function listTaxonomyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { taxonomy } = req.params as TaxonomyParams;
  const query = req.query as unknown as ListTaxonomyQuery;
  const kind = taxonomySlugToKind(taxonomy);
  const result = await listTaxonomyTerms(storeId, kind, query);
  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toTaxonomyTermDto),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
        },
      },
      "",
    ),
  );
}

export async function createTaxonomyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { taxonomy } = req.params as TaxonomyParams;
  const input = req.body as CreateTaxonomyInput;
  const kind = taxonomySlugToKind(taxonomy);
  const term = await createTaxonomyTerm(storeId, kind, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.TAXONOMY_SAVED,
    entityType: AUDIT_ENTITY_TYPES.TAXONOMY,
    entityId: term.id,
    message: `أنشأ ${kind === "category" ? "تصنيفاً" : kind === "tag" ? "وسماً" : "خاصية"}: ${term.name}`,
    metadata: { kind, wpTermId: term.wpTermId, name: term.name },
  });
  res
    .status(201)
    .json(successResponse(toTaxonomyTermDto(term), "Taxonomy term created"));
}

export async function updateTaxonomyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { taxonomy, id } = req.params as TaxonomyTermParams;
  const input = req.body as UpdateTaxonomyInput;
  const kind = taxonomySlugToKind(taxonomy);
  const term = await updateTaxonomyTerm(storeId, kind, id, input, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.TAXONOMY_SAVED,
    entityType: AUDIT_ENTITY_TYPES.TAXONOMY,
    entityId: term.id,
    message: `حدّث ${kind === "category" ? "تصنيفاً" : kind === "tag" ? "وسماً" : "خاصية"}: ${term.name}`,
    metadata: { kind, wpTermId: term.wpTermId, changed: Object.keys(input) },
  });
  res
    .status(200)
    .json(successResponse(toTaxonomyTermDto(term), "Taxonomy term updated"));
}

export async function deleteTaxonomyHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { taxonomy, id } = req.params as TaxonomyTermParams;
  const kind = taxonomySlugToKind(taxonomy);
  const term = await deleteTaxonomyTerm(storeId, kind, id, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.TAXONOMY_DELETED,
    entityType: AUDIT_ENTITY_TYPES.TAXONOMY,
    entityId: term.id,
    message: `حذف ${kind === "category" ? "تصنيفاً" : kind === "tag" ? "وسماً" : "خاصية"}: ${term.name}`,
    metadata: { kind, wpTermId: term.wpTermId, name: term.name },
  });
  res.status(204).send();
}
