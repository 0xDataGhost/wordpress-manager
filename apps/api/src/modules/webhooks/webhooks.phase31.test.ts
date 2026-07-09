import assert from "node:assert/strict";
import { test } from "node:test";
import {
  couponWebhookSchema,
  reviewWebhookSchema,
  WEBHOOK_EVENT_TYPES,
} from "./webhooks.schemas";

test("coupon webhook schema parses created/updated and requires data", () => {
  const parsed = couponWebhookSchema.parse({
    event: "coupon.updated",
    eventId: "evt-c-1",
    externalId: "12",
    data: { wpCouponId: 12, code: "EID", amount: "10" },
  });
  assert.equal(parsed.data?.wpCouponId, 12);
  assert.equal(parsed.data?.amount, "10.00");
  assert.throws(() =>
    couponWebhookSchema.parse({ event: "coupon.created", eventId: "e", externalId: "1" }),
  );
});

test("coupon.deleted needs no data", () => {
  const parsed = couponWebhookSchema.parse({
    event: "coupon.deleted",
    eventId: "evt-c-2",
    externalId: "12",
  });
  assert.equal(parsed.event, "coupon.deleted");
});

test("review webhook schema parses and requires data on non-delete", () => {
  const parsed = reviewWebhookSchema.parse({
    event: "review.created",
    eventId: "evt-r-1",
    externalId: "7",
    data: { wpReviewId: 7, rating: "5", status: "hold" },
  });
  assert.equal(parsed.data?.wpReviewId, 7);
  assert.equal(parsed.data?.rating, 5);
  assert.throws(() =>
    reviewWebhookSchema.parse({ event: "review.updated", eventId: "e", externalId: "7" }),
  );
});

test("the webhook event catalog now includes coupon and review topics", () => {
  for (const t of ["coupon.created", "coupon.deleted", "review.created", "review.deleted"]) {
    assert.ok((WEBHOOK_EVENT_TYPES as readonly string[]).includes(t));
  }
});
