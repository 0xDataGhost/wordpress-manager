import type { WebhookEventRow } from "../../db/schema/webhook-events";

/**
 * Public API shape of a webhook event. The raw `payload` jsonb is intentionally
 * omitted — the status surface only needs the event topic, idempotency key and
 * processing outcome, and the payload can carry large/PII-ish entity data we do
 * not want to echo back. `event` is the stored `topic` (e.g. "order.created").
 */
export interface WebhookEventDto {
  id: string;
  storeId: string;
  source: string;
  event: string;
  externalEventId: string | null;
  status: string;
  error: string | null;
  receivedAt: Date;
  processedAt: Date | null;
  createdAt: Date;
}

export function toWebhookEventDto(row: WebhookEventRow): WebhookEventDto {
  return {
    id: row.id,
    storeId: row.storeId,
    source: row.source,
    event: row.topic,
    externalEventId: row.externalEventId,
    status: row.status,
    error: row.error,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}
