import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { getConnector } from "../../middleware/authenticate-connector";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { getStoreById } from "../stores/stores.service";
import {
  disconnect,
  getConnectionByStoreId,
  issueApiKey,
  markConnected,
  recordHealthCheck,
} from "./connections.service";
import {
  disconnectedStatusDto,
  toConnectionStatusDto,
} from "./connections.serializer";
import type { WpConnectInput } from "./connections.schemas";

/**
 * POST /stores/current/api-key — dashboard-only (settings.edit). Generates a new
 * connector API key for the current store and returns the plaintext ONCE. Any
 * previously issued key is invalidated.
 */
export async function generateApiKey(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { plaintext, connection } = await issueApiKey(storeId);

  // Audit the change — never log the plaintext key; only the non-secret prefix.
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.CONNECTION_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.CONNECTION,
    entityId: storeId,
    message: "أنشأ مفتاح اتصال جديد",
    metadata: {
      event: "api_key_generated",
      apiKeyPrefix: connection.apiKeyPrefix,
      status: connection.status,
    },
  });

  res.status(201).json(
    successResponse(
      {
        apiKey: plaintext,
        apiKeyPrefix: connection.apiKeyPrefix,
        status: connection.status,
        generatedAt: connection.apiKeyGeneratedAt,
      },
      "API key generated. Copy it now — it will not be shown again.",
    ),
  );
}

/**
 * GET /wp/connection-status — dashboard-only (settings.view). Returns the
 * current store's connection status without any secret key material.
 */
export async function connectionStatus(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const connection = await getConnectionByStoreId(storeId);
  const dto = connection
    ? toConnectionStatusDto(connection)
    : disconnectedStatusDto(storeId);

  res.status(200).json(successResponse(dto, ""));
}

/**
 * POST /stores/current/disconnect — dashboard-only (settings.edit). Lets the
 * store owner revoke the connector key and reset the connection from the
 * dashboard without needing the WordPress plugin. Idempotent: a store with no
 * connection row simply reports "disconnected".
 */
export async function disconnectCurrentStore(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const connection = await getConnectionByStoreId(storeId);

  if (!connection) {
    res
      .status(200)
      .json(successResponse(disconnectedStatusDto(storeId), "Store disconnected"));
    return;
  }

  const updated = await disconnect(connection.id);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.CONNECTION_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.CONNECTION,
    entityId: storeId,
    message: "فصل المتجر من لوحة التحكم",
    metadata: { event: "disconnected", status: updated.status },
  });
  res
    .status(200)
    .json(successResponse(toConnectionStatusDto(updated), "Store disconnected"));
}

/**
 * POST /wp/connect — connector-authenticated. Confirms the WordPress site owns a
 * valid key and records the reported site metadata, marking the store connected.
 */
export async function wpConnect(req: Request, res: Response): Promise<void> {
  const { storeId, connectionId } = getConnector(req);
  const body = req.body as WpConnectInput;

  const connection = await markConnected(connectionId, body);
  const store = await getStoreById(storeId);

  // Connector-driven (no dashboard user): scope to the connector's store, userId null.
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.CONNECTION_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.CONNECTION,
    entityId: storeId,
    storeId,
    userId: null,
    message: "تم ربط المتجر عبر ووردبريس",
    metadata: { event: "connected", status: connection.status },
  });

  res.status(200).json(
    successResponse(
      {
        storeId,
        storeName: store?.name ?? null,
        status: connection.status,
        connectedAt: connection.lastConnectedAt,
      },
      "Store connected",
    ),
  );
}

/**
 * POST /wp/verify — connector-authenticated. Lightweight credential check used
 * by the plugin's "Manual health check"; records the check and echoes status.
 */
export async function wpVerify(req: Request, res: Response): Promise<void> {
  const { storeId, connectionId } = getConnector(req);
  const connection = await recordHealthCheck(connectionId);
  const store = await getStoreById(storeId);

  res.status(200).json(
    successResponse(
      {
        valid: true,
        storeId,
        storeName: store?.name ?? null,
        status: connection.status,
        checkedAt: connection.lastHealthCheckAt,
      },
      "Connector credentials are valid",
    ),
  );
}

/**
 * POST /wp/disconnect — connector-authenticated. Revokes the API key and resets
 * the connection. Idempotent from the caller's perspective.
 */
export async function wpDisconnect(req: Request, res: Response): Promise<void> {
  const { storeId, connectionId } = getConnector(req);
  await disconnect(connectionId);

  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.CONNECTION_CHANGED,
    entityType: AUDIT_ENTITY_TYPES.CONNECTION,
    entityId: storeId,
    storeId,
    userId: null,
    message: "تم فصل المتجر عبر ووردبريس",
    metadata: { event: "disconnected" },
  });

  res
    .status(200)
    .json(successResponse({ status: "disconnected" }, "Store disconnected"));
}
