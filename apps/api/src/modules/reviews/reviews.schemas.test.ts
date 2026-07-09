import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listReviewsQuerySchema,
  moderateReviewSchema,
  replyReviewSchema,
} from "./reviews.schemas";

test("moderateReviewSchema accepts known statuses only", () => {
  assert.equal(moderateReviewSchema.parse({ status: "approved" }).status, "approved");
  for (const s of ["hold", "spam", "trash"]) {
    assert.equal(moderateReviewSchema.safeParse({ status: s }).success, true);
  }
  assert.equal(moderateReviewSchema.safeParse({ status: "deleted" }).success, false);
});

test("replyReviewSchema requires non-empty bounded text", () => {
  assert.equal(replyReviewSchema.parse({ reply: "  شكراً  " }).reply, "شكراً");
  assert.equal(replyReviewSchema.safeParse({ reply: "" }).success, false);
});

test("listReviewsQuerySchema filters and paginates", () => {
  const parsed = listReviewsQuerySchema.parse({ status: "hold" });
  assert.equal(parsed.status, "hold");
  assert.equal(parsed.page, 1);
  assert.equal(listReviewsQuerySchema.safeParse({ status: "x" }).success, false);
});
