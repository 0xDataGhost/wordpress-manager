import assert from "node:assert/strict";
import { test } from "node:test";
import type { WpCommandRow } from "../../db/schema/wp-commands";
import { toWpCommandDto } from "./wp-commands.serializer";

function makeRow(overrides: Partial<WpCommandRow> = {}): WpCommandRow {
  return {
    id: "0b0e8f6a-1111-4222-8333-444455556666",
    storeId: "aaaa1111-2222-4333-8444-555566667777",
    idempotencyKey: "idem-1",
    domain: "product",
    action: "update",
    targetWpId: 42,
    payload: { name: "P", billing: { phone: "0555" } },
    expectedVersion: "2026-07-01T10:00:00",
    status: "succeeded",
    attempts: 1,
    lastError: null,
    result: { wpProductId: 42 },
    createdBy: null,
    createdAt: new Date("2026-07-01T10:00:00Z"),
    updatedAt: new Date("2026-07-01T10:00:01Z"),
    completedAt: new Date("2026-07-01T10:00:01Z"),
    ...overrides,
  };
}

test("toWpCommandDto exposes lifecycle fields", () => {
  const dto = toWpCommandDto(makeRow());
  assert.equal(dto.id, "0b0e8f6a-1111-4222-8333-444455556666");
  assert.equal(dto.domain, "product");
  assert.equal(dto.action, "update");
  assert.equal(dto.targetWpId, 42);
  assert.equal(dto.status, "succeeded");
  assert.equal(dto.attempts, 1);
  assert.equal(dto.expectedVersion, "2026-07-01T10:00:00");
});

test("toWpCommandDto never leaks the payload, result body or idempotency key", () => {
  const dto = toWpCommandDto(makeRow()) as unknown as Record<string, unknown>;
  assert.equal("payload" in dto, false);
  assert.equal("result" in dto, false);
  assert.equal("idempotencyKey" in dto, false);
  const json = JSON.stringify(dto);
  assert.ok(!json.includes("0555"));
  assert.ok(!json.includes("idem-1"));
});

test("toWpCommandDto carries the sanitized error of a failed command", () => {
  const dto = toWpCommandDto(
    makeRow({ status: "failed", lastError: "connector timeout", result: null }),
  );
  assert.equal(dto.status, "failed");
  assert.equal(dto.lastError, "connector timeout");
});
