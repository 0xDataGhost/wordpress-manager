import assert from "node:assert/strict";
import { test } from "node:test";
import type { DigitalCodeRow } from "../../db/schema/digital-codes";
import {
  toCodeDetailsDto,
  toCodeListItemDto,
  type CodeRowWithNames,
} from "./digital-inventory.serializer";

const RAW_CODE = "PLAINTEXT-SHOULD-NEVER-APPEAR";

function makeRow(overrides: Partial<DigitalCodeRow> = {}): DigitalCodeRow {
  return {
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    storeId: "11111111-1111-1111-1111-111111111111",
    productId: "22222222-2222-2222-2222-222222222222",
    batchId: "33333333-3333-3333-3333-333333333333",
    supplierId: null,
    // Secret material that must NEVER reach a DTO:
    codeCipher: Buffer.from(RAW_CODE).toString("base64"),
    codeIv: "aXYtMTIzNDU2Nzg5MA==",
    codeTag: "dGFnLXZhbHVlLTAwMA==",
    codeHash: "a".repeat(64),
    codePreview: "PLAI••••PEAR",
    status: "available",
    reservedUntil: null,
    assignedOrderId: null,
    assignedOrderItemId: null,
    assignedCustomerId: null,
    soldAt: null,
    deliveredAt: null,
    expiresAt: null,
    costPrice: "2.5000",
    currency: "USD",
    metadata: {},
    createdBy: null,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-02T10:00:00.000Z"),
    ...overrides,
  };
}

function withNames(row: DigitalCodeRow): CodeRowWithNames {
  return { code: row, productName: "Netflix 1 Month", batchName: "June Batch" };
}

test("toCodeListItemDto exposes only masked, non-secret fields", () => {
  const dto = toCodeListItemDto(withNames(makeRow()));
  assert.deepEqual(Object.keys(dto).sort(), [
    "batchId",
    "batchName",
    "codePreview",
    "costPrice",
    "createdAt",
    "currency",
    "expiresAt",
    "id",
    "productId",
    "productName",
    "status",
    "supplierId",
  ]);
  assert.equal(dto.codePreview, "PLAI••••PEAR");
  // Operational (non-secret) fields needed by the inventory table.
  assert.equal(dto.costPrice, "2.5000");
  assert.equal(dto.currency, "USD");
  assert.equal(dto.supplierId, null);
});

test("list DTO never carries cipher / iv / tag / hash or raw code", () => {
  const dto = toCodeListItemDto(withNames(makeRow()));
  const serialized = JSON.stringify(dto);
  assert.ok(!("codeCipher" in dto));
  assert.ok(!("codeIv" in dto));
  assert.ok(!("codeTag" in dto));
  assert.ok(!("codeHash" in dto));
  assert.ok(!serialized.includes(RAW_CODE));
  assert.ok(!serialized.includes("a".repeat(64)), "hash must not leak");
});

test("details DTO adds operational fields but still hides all secret material", () => {
  const dto = toCodeDetailsDto(withNames(makeRow()));
  const serialized = JSON.stringify(dto);
  assert.equal(dto.costPrice, "2.5000");
  assert.equal(dto.currency, "USD");
  assert.ok(!("codeCipher" in dto));
  assert.ok(!("codeHash" in dto));
  assert.ok(!serialized.includes(RAW_CODE));
});
