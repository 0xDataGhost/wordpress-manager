import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customerWebhookSchema,
  listWebhookEventsQuerySchema,
  orderWebhookSchema,
  productWebhookSchema,
} from "./webhooks.schemas";

test("productWebhookSchema parses a product.updated event and normalizes data", () => {
  const parsed = productWebhookSchema.parse({
    event: "product.updated",
    eventId: 99012,
    externalId: 42,
    occurredAt: "2026-06-24T10:00:00Z",
    data: {
      wpProductId: "42",
      name: "قميص",
      price: "199.9",
      stockQuantity: "5",
      status: "publish",
      images: [{ src: "https://cdn.example.com/a.jpg" }],
    },
  });
  // eventId/externalId are normalized to trimmed strings.
  assert.equal(parsed.eventId, "99012");
  assert.equal(parsed.externalId, "42");
  assert.equal(parsed.event, "product.updated");
  assert.equal(parsed.data?.wpProductId, 42);
  assert.equal(parsed.data?.price, "199.90");
});

test("productWebhookSchema requires data for created/updated", () => {
  assert.throws(() =>
    productWebhookSchema.parse({
      event: "product.created",
      eventId: "evt-1",
      externalId: "42",
    }),
  );
});

test("productWebhookSchema allows product.deleted with no data", () => {
  const parsed = productWebhookSchema.parse({
    event: "product.deleted",
    eventId: "evt-del-1",
    externalId: "42",
  });
  assert.equal(parsed.event, "product.deleted");
  assert.equal(parsed.data, undefined);
});

test("productWebhookSchema rejects an event from another entity family", () => {
  assert.throws(() =>
    productWebhookSchema.parse({
      event: "order.created",
      eventId: "evt-2",
      externalId: "42",
      data: { wpProductId: 1, name: "x" },
    }),
  );
});

test("productWebhookSchema rejects an empty eventId", () => {
  assert.throws(() =>
    productWebhookSchema.parse({
      event: "product.deleted",
      eventId: "   ",
      externalId: "42",
    }),
  );
});

test("orderWebhookSchema parses an order.created event with line items", () => {
  const parsed = orderWebhookSchema.parse({
    event: "order.created",
    eventId: "evt-order-1",
    externalId: 1001,
    data: {
      wpOrderId: 1001,
      status: "processing",
      total: "350.5",
      currency: "SAR",
      wpCustomerId: 0,
      lineItems: [
        { wpProductId: 42, name: "قميص", quantity: 2, price: "100", total: "200" },
      ],
    },
  });
  assert.equal(parsed.data.wpOrderId, 1001);
  assert.equal(parsed.data.wpCustomerId, null);
  assert.equal(parsed.data.total, "350.50");
});

test("orderWebhookSchema requires data", () => {
  assert.throws(() =>
    orderWebhookSchema.parse({
      event: "order.updated",
      eventId: "evt-order-2",
      externalId: "1001",
    }),
  );
});

test("customerWebhookSchema parses a customer.created event", () => {
  const parsed = customerWebhookSchema.parse({
    event: "customer.created",
    eventId: "evt-cust-1",
    externalId: 9,
    data: {
      wpCustomerId: 9,
      name: "سارة",
      email: "sara@example.com",
      totalSpent: "1500",
      ordersCount: "4",
    },
  });
  assert.equal(parsed.data.wpCustomerId, 9);
  assert.equal(parsed.data.totalSpent, "1500.00");
});

test("customerWebhookSchema rejects an unknown event", () => {
  assert.throws(() =>
    customerWebhookSchema.parse({
      event: "customer.deleted",
      eventId: "evt-cust-2",
      externalId: "9",
      data: { wpCustomerId: 9, name: "x" },
    }),
  );
});

test("listWebhookEventsQuerySchema coerces and bounds the limit", () => {
  assert.equal(listWebhookEventsQuerySchema.parse({}).limit, 20);
  assert.equal(listWebhookEventsQuerySchema.parse({ limit: "5" }).limit, 5);
  assert.throws(() => listWebhookEventsQuerySchema.parse({ limit: 0 }));
  assert.throws(() => listWebhookEventsQuerySchema.parse({ limit: 1000 }));
});
