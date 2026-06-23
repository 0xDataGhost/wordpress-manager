import assert from "node:assert/strict";
import { test } from "node:test";
import type { WebhookEventRow } from "../../db/schema/webhook-events";
import { toWebhookEventDto } from "./webhooks.serializer";

function makeRow(overrides: Partial<WebhookEventRow> = {}): WebhookEventRow {
  const now = new Date("2026-06-24T10:00:00Z");
  return {
    id: "11111111-1111-1111-1111-111111111111",
    storeId: "22222222-2222-2222-2222-222222222222",
    source: "woocommerce",
    topic: "order.created",
    externalEventId: "evt-1",
    status: "processed",
    payload: { secret: "do-not-echo" },
    error: null,
    receivedAt: now,
    processedAt: now,
    createdAt: now,
    ...overrides,
  };
}

test("toWebhookEventDto maps topic to event and exposes the status fields", () => {
  const dto = toWebhookEventDto(makeRow());
  assert.equal(dto.event, "order.created");
  assert.equal(dto.status, "processed");
  assert.equal(dto.externalEventId, "evt-1");
  assert.equal(dto.source, "woocommerce");
  assert.equal(dto.error, null);
  assert.ok(dto.processedAt instanceof Date);
});

test("toWebhookEventDto never leaks the raw payload", () => {
  const dto = toWebhookEventDto(makeRow());
  assert.equal("payload" in dto, false);
});

test("toWebhookEventDto carries the error message of a failed event", () => {
  const dto = toWebhookEventDto(
    makeRow({ status: "failed", error: "boom", processedAt: null }),
  );
  assert.equal(dto.status, "failed");
  assert.equal(dto.error, "boom");
  assert.equal(dto.processedAt, null);
});
