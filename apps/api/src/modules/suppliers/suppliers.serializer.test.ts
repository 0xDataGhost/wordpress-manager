import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupplierRow } from "../../db/schema/suppliers";
import { toSupplierDto } from "./suppliers.serializer";
import { computeInvalidRate } from "./suppliers.service";

test("computeInvalidRate: 0 when there are no codes", () => {
  assert.equal(computeInvalidRate(0, 0), 0);
  assert.equal(computeInvalidRate(5, 0), 0);
});

test("computeInvalidRate: invalid / total rounded to 4 dp", () => {
  assert.equal(computeInvalidRate(1, 4), 0.25);
  assert.equal(computeInvalidRate(1, 3), 0.3333);
  assert.equal(computeInvalidRate(0, 10), 0);
  assert.equal(computeInvalidRate(10, 10), 1);
});

test("toSupplierDto exposes the public supplier shape", () => {
  const row: SupplierRow = {
    id: "ssssssss-ssss-ssss-ssss-ssssssssssss",
    storeId: "11111111-1111-1111-1111-111111111111",
    name: "Acme Codes",
    contactName: "Jane",
    email: "jane@acme.test",
    phone: null,
    website: null,
    country: null,
    currency: "USD",
    notes: null,
    status: "active",
    isPreferred: true,
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    updatedAt: new Date("2026-06-02T10:00:00.000Z"),
  };
  const dto = toSupplierDto(row);
  assert.equal(dto.name, "Acme Codes");
  assert.equal(dto.isPreferred, true);
  assert.equal(dto.currency, "USD");
});
