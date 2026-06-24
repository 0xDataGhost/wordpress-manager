import assert from "node:assert/strict";
import { test } from "node:test";
import { listAuditLogsQuerySchema } from "./audit-logs.schemas";

test("listAuditLogsQuerySchema defaults and coerces pagination", () => {
  const parsed = listAuditLogsQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);
  assert.equal(parsed.action, undefined);
  assert.equal(parsed.entityType, undefined);
  assert.equal(parsed.userId, undefined);

  const coerced = listAuditLogsQuerySchema.parse({ page: "3", limit: "50" });
  assert.equal(coerced.page, 3);
  assert.equal(coerced.limit, 50);
});

test("listAuditLogsQuerySchema accepts known actions and entity types", () => {
  const parsed = listAuditLogsQuerySchema.parse({
    action: "product.created",
    entityType: "product",
  });
  assert.equal(parsed.action, "product.created");
  assert.equal(parsed.entityType, "product");
});

test("listAuditLogsQuerySchema rejects unknown action / entity type", () => {
  assert.equal(
    listAuditLogsQuerySchema.safeParse({ action: "product.deleted" }).success,
    false,
  );
  assert.equal(
    listAuditLogsQuerySchema.safeParse({ entityType: "invoice" }).success,
    false,
  );
});

test("listAuditLogsQuerySchema validates userId as a uuid", () => {
  assert.equal(
    listAuditLogsQuerySchema.safeParse({
      userId: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    }).success,
    true,
  );
  assert.equal(
    listAuditLogsQuerySchema.safeParse({ userId: "42" }).success,
    false,
  );
});

test("listAuditLogsQuerySchema coerces dates and enforces from <= to", () => {
  const parsed = listAuditLogsQuerySchema.parse({
    dateFrom: "2026-06-01",
    dateTo: "2026-06-30",
  });
  assert.ok(parsed.dateFrom instanceof Date);
  assert.ok(parsed.dateTo instanceof Date);

  assert.equal(
    listAuditLogsQuerySchema.safeParse({
      dateFrom: "2026-06-30",
      dateTo: "2026-06-01",
    }).success,
    false,
  );
});

test("listAuditLogsQuerySchema caps limit and rejects page below 1", () => {
  assert.equal(
    listAuditLogsQuerySchema.safeParse({ limit: "101" }).success,
    false,
  );
  assert.equal(
    listAuditLogsQuerySchema.safeParse({ page: "0" }).success,
    false,
  );
});
