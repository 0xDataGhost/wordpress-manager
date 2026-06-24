import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { getConnector } from "../../middleware/authenticate-connector";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toWebhookEventDto } from "./webhooks.serializer";
import {
  listRecentWebhookEvents,
  recordAndProcessWebhook,
} from "./webhooks.service";
import type {
  ListWebhookEventsQuery,
  WebhookEntity,
  WebhookInput,
} from "./webhooks.schemas";

/**
 * Builds a connector-authenticated webhook handler for one entity family. The
 * connector API key resolves and scopes the tenant; the body is already
 * validated by the route's Zod schema. The response reports whether the event
 * was a duplicate (ignored) or processed, plus the upsert action taken.
 */
function webhookHandler(entity: WebhookEntity) {
  return async (req: Request, res: Response): Promise<void> => {
    const { storeId } = getConnector(req);
    const input = req.body as WebhookInput;

    // Identifiers only — NEVER the raw payload (input.data is not logged).
    const baseMeta = {
      event: input.event,
      entity,
      externalId: input.externalId,
      eventId: input.eventId,
    };

    let result;
    try {
      result = await recordAndProcessWebhook(storeId, entity, input);
    } catch (err) {
      const message = (
        err instanceof Error ? err.message : "Unexpected error"
      ).slice(0, 500);
      await recordAuditFromRequest(req, {
        action: AUDIT_ACTIONS.WEBHOOK_FAILED,
        entityType: AUDIT_ENTITY_TYPES.WEBHOOK,
        entityId: input.externalId,
        storeId,
        userId: null,
        message: `فشلت معالجة حدث ويب هوك: ${input.event}`,
        metadata: { ...baseMeta, error: message },
      });
      throw err;
    }

    // Only audit genuinely processed events — duplicates are no-ops, not actions.
    if (result.processed) {
      await recordAuditFromRequest(req, {
        action: AUDIT_ACTIONS.WEBHOOK_PROCESSED,
        entityType: AUDIT_ENTITY_TYPES.WEBHOOK,
        entityId: input.externalId,
        storeId,
        userId: null,
        message: `تمت معالجة حدث ويب هوك: ${input.event}`,
        metadata: { ...baseMeta, result: result.action },
      });
    }

    res.status(200).json(
      successResponse(
        {
          webhook: toWebhookEventDto(result.eventRow),
          duplicate: result.duplicate,
          processed: result.processed,
          action: result.action,
        },
        result.duplicate ? "Duplicate webhook ignored" : "Webhook processed",
      ),
    );
  };
}

/** POST /wp/webhooks/products — product created/updated/deleted (connector auth). */
export const productWebhookHandler = webhookHandler("product");

/** POST /wp/webhooks/orders — order created/updated (connector auth). */
export const orderWebhookHandler = webhookHandler("order");

/** POST /wp/webhooks/customers — customer created/updated (connector auth). */
export const customerWebhookHandler = webhookHandler("customer");

/**
 * GET /wp/webhooks — recent webhook events for the store (JWT, settings.view).
 * Read-only status surface for verifying delivery and inspecting failures.
 */
export async function listWebhookEventsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { limit } = req.query as unknown as ListWebhookEventsQuery;
  const events = await listRecentWebhookEvents(storeId, limit);
  res
    .status(200)
    .json(successResponse({ events: events.map(toWebhookEventDto) }, ""));
}
