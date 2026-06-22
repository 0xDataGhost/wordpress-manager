import assert from "node:assert/strict";
import { test } from "node:test";
import type { CustomerRow } from "../../db/schema/customers";
import type { OrderRow } from "../../db/schema/orders";
import {
  toCustomerDetailsDto,
  toCustomerDto,
  toCustomerOrderDto,
  type CustomerMetricsDto,
} from "./customers.serializer";

function makeCustomer(overrides: Partial<CustomerRow> = {}): CustomerRow {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    storeId: "11111111-1111-1111-1111-111111111111",
    wpCustomerId: 77,
    name: "سارة أحمد",
    email: "sara@example.com",
    phone: "+966500000000",
    totalSpent: "1200.00",
    ordersCount: 4,
    lastOrderAt: new Date("2026-02-01T10:00:00.000Z"),
    internalNotes: "عميلة مميزة",
    lastSyncedAt: new Date("2026-02-02T10:00:00.000Z"),
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-02T10:00:00.000Z"),
    ...overrides,
  };
}

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071",
    storeId: "11111111-1111-1111-1111-111111111111",
    wpOrderId: 5001,
    customerId: "22222222-2222-2222-2222-222222222222",
    orderNumber: "#5001",
    status: "completed",
    total: "349.50",
    currency: "SAR",
    paymentMethod: "cod",
    internalNotes: null,
    placedAt: new Date("2026-02-01T10:00:00.000Z"),
    lastSyncedAt: new Date("2026-02-02T10:00:00.000Z"),
    createdAt: new Date("2026-02-01T09:00:00.000Z"),
    updatedAt: new Date("2026-02-02T11:00:00.000Z"),
    ...overrides,
  };
}

test("toCustomerDto maps every column and keeps money as a decimal string", () => {
  const dto = toCustomerDto(makeCustomer());
  assert.equal(dto.id, "22222222-2222-2222-2222-222222222222");
  assert.equal(dto.wpCustomerId, 77);
  assert.equal(dto.name, "سارة أحمد");
  assert.equal(dto.email, "sara@example.com");
  assert.equal(dto.phone, "+966500000000");
  assert.equal(dto.totalSpent, "1200.00");
  assert.equal(typeof dto.totalSpent, "string");
  assert.equal(dto.ordersCount, 4);
  assert.equal(dto.internalNotes, "عميلة مميزة");
});

test("toCustomerOrderDto exposes a slim read-only order with effective date", () => {
  const dto = toCustomerOrderDto(makeOrder());
  assert.equal(dto.id, "3f9a1c7b-2d4e-5f60-8a1b-2c3d4e5f6071");
  assert.equal(dto.orderNumber, "#5001");
  assert.equal(dto.status, "completed");
  assert.equal(dto.total, "349.50");
  assert.deepEqual(dto.orderDate, new Date("2026-02-01T10:00:00.000Z"));
  // No internalNotes/customer leaked onto the slim linked-order shape.
  assert.equal("internalNotes" in dto, false);
  assert.equal("customer" in dto, false);
});

test("toCustomerOrderDto falls back to createdAt when placedAt is null", () => {
  const dto = toCustomerOrderDto(makeOrder({ placedAt: null }));
  assert.deepEqual(dto.orderDate, new Date("2026-02-01T09:00:00.000Z"));
});

test("toCustomerDetailsDto attaches metrics and serialized recent orders", () => {
  const metrics: CustomerMetricsDto = {
    totalOrders: 2,
    totalSpent: "699.00",
    firstOrderAt: new Date("2026-01-01T00:00:00.000Z"),
    lastOrderAt: new Date("2026-02-01T10:00:00.000Z"),
  };
  const details = toCustomerDetailsDto(makeCustomer(), metrics, [
    makeOrder(),
    makeOrder({ id: "44444444-4444-4444-4444-444444444444", orderNumber: "#5002" }),
  ]);
  assert.equal(details.metrics.totalOrders, 2);
  assert.equal(details.metrics.totalSpent, "699.00");
  assert.equal(details.recentOrders.length, 2);
  assert.equal(details.recentOrders[0].orderNumber, "#5001");
  assert.equal(details.recentOrders[1].orderNumber, "#5002");
  assert.equal(details.name, "سارة أحمد");
});
