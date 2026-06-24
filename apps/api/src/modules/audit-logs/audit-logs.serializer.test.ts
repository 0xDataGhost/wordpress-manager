import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuditLogRow } from "../../db/schema/audit-logs";
import { toAuditLogDto, type AuditLogUserSummary } from "./audit-logs.serializer";

function makeAuditLog(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: "99999999-9999-9999-9999-999999999999",
    storeId: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    action: "product.created",
    entityType: "product",
    entityId: "33333333-3333-3333-3333-333333333333",
    message: "أنشأ منتجاً: قميص",
    metadata: { name: "قميص", status: "active" },
    ipAddress: "203.0.113.5",
    userAgent: "Mozilla/5.0",
    createdAt: new Date("2026-06-10T12:00:00.000Z"),
    ...overrides,
  };
}

test("toAuditLogDto maps every column and attaches the acting user", () => {
  const user: AuditLogUserSummary = {
    id: "22222222-2222-2222-2222-222222222222",
    fullName: "هشام",
    email: "owner@example.com",
  };
  const dto = toAuditLogDto(makeAuditLog(), user);

  assert.equal(dto.id, "99999999-9999-9999-9999-999999999999");
  assert.equal(dto.storeId, "11111111-1111-1111-1111-111111111111");
  assert.equal(dto.userId, "22222222-2222-2222-2222-222222222222");
  assert.deepEqual(dto.user, user);
  assert.equal(dto.action, "product.created");
  assert.equal(dto.entityType, "product");
  assert.equal(dto.entityId, "33333333-3333-3333-3333-333333333333");
  assert.equal(dto.message, "أنشأ منتجاً: قميص");
  assert.deepEqual(dto.metadata, { name: "قميص", status: "active" });
  assert.equal(dto.ipAddress, "203.0.113.5");
  assert.equal(dto.userAgent, "Mozilla/5.0");
});

test("toAuditLogDto handles system actions (no user, null fields)", () => {
  const dto = toAuditLogDto(
    makeAuditLog({
      userId: null,
      action: "webhook.processed",
      entityType: "webhook",
      entityId: "1024",
      metadata: null,
      ipAddress: null,
      userAgent: null,
    }),
  );

  assert.equal(dto.userId, null);
  assert.equal(dto.user, null);
  assert.equal(dto.action, "webhook.processed");
  assert.equal(dto.entityId, "1024");
  assert.equal(dto.metadata, null);
  assert.equal(dto.ipAddress, null);
  assert.equal(dto.userAgent, null);
});

test("toAuditLogDto defaults user to null when not provided", () => {
  const dto = toAuditLogDto(makeAuditLog());
  assert.equal(dto.user, null);
});
