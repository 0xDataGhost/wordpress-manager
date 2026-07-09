import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addOrderWpNoteSchema,
  createOrderRefundSchema,
  updateOrderStatusSchema,
} from "./orders.schemas";

test("updateOrderStatusSchema accepts known WooCommerce statuses only", () => {
  assert.equal(
    updateOrderStatusSchema.parse({ status: "completed" }).status,
    "completed",
  );
  assert.equal(
    updateOrderStatusSchema.safeParse({ status: "exploded" }).success,
    false,
  );
  assert.equal(updateOrderStatusSchema.safeParse({}).success, false);
});

test("addOrderWpNoteSchema trims, requires text and defaults customerNote", () => {
  const parsed = addOrderWpNoteSchema.parse({ note: "  تم الشحن  " });
  assert.equal(parsed.note, "تم الشحن");
  assert.equal(parsed.customerNote, false);

  assert.equal(addOrderWpNoteSchema.safeParse({ note: "   " }).success, false);
  assert.equal(
    addOrderWpNoteSchema.parse({ note: "x", customerNote: true }).customerNote,
    true,
  );
});

test("createOrderRefundSchema validates the amount and defaults flags", () => {
  const parsed = createOrderRefundSchema.parse({ amount: 49.5 });
  assert.equal(parsed.amount, 49.5);
  assert.equal(parsed.refundPayment, false);
  assert.equal(parsed.restockItems, false);

  assert.equal(createOrderRefundSchema.safeParse({ amount: 0 }).success, false);
  assert.equal(
    createOrderRefundSchema.safeParse({ amount: -5 }).success,
    false,
  );
  assert.equal(createOrderRefundSchema.safeParse({}).success, false);
});

test("createOrderRefundSchema keeps the money-movement flag explicit", () => {
  const parsed = createOrderRefundSchema.parse({
    amount: 10,
    refundPayment: true,
    reason: "منتج معيب",
  });
  assert.equal(parsed.refundPayment, true);
  assert.equal(parsed.reason, "منتج معيب");
});

test("createOrderRefundSchema accepts an optional idempotency key (uuid)", () => {
  const parsed = createOrderRefundSchema.parse({
    amount: 10,
    idempotencyKey: "0b0e8f6a-1111-4222-8333-444455556666",
  });
  assert.equal(parsed.idempotencyKey, "0b0e8f6a-1111-4222-8333-444455556666");
  // A non-uuid key is rejected — the money-safety key must be well-formed.
  assert.equal(
    createOrderRefundSchema.safeParse({ amount: 10, idempotencyKey: "nope" })
      .success,
    false,
  );
  // Absent is allowed (server mints one).
  assert.equal(createOrderRefundSchema.parse({ amount: 10 }).idempotencyKey, undefined);
});
