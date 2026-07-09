import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createCouponSchema,
  updateCouponSchema,
  listCouponsQuerySchema,
} from "./coupons.schemas";

test("createCouponSchema requires a code and defaults the model", () => {
  const parsed = createCouponSchema.parse({ code: "EID25" });
  assert.equal(parsed.code, "EID25");
  assert.equal(parsed.discountType, "fixed_cart");
  assert.equal(parsed.amount, 0);
  assert.equal(parsed.freeShipping, false);
  assert.equal(parsed.individualUse, false);
  assert.equal(createCouponSchema.safeParse({}).success, false);
});

test("createCouponSchema validates discount type and restrictions", () => {
  const parsed = createCouponSchema.parse({
    code: "SUMMER",
    discountType: "percent",
    amount: 15,
    usageLimit: 100,
    productCategoryIds: [3, 4],
    emailRestrictions: ["a@example.com"],
  });
  assert.equal(parsed.discountType, "percent");
  assert.equal(parsed.usageLimit, 100);
  assert.deepEqual(parsed.productCategoryIds, [3, 4]);

  assert.equal(
    createCouponSchema.safeParse({ code: "X", discountType: "bogus" }).success,
    false,
  );
  assert.equal(
    createCouponSchema.safeParse({ code: "X", emailRestrictions: ["not-email"] })
      .success,
    false,
  );
});

test("updateCouponSchema requires at least one field", () => {
  assert.equal(updateCouponSchema.safeParse({}).success, false);
  assert.equal(updateCouponSchema.parse({ amount: 5 }).amount, 5);
});

test("listCouponsQuerySchema defaults and bounds pagination", () => {
  const parsed = listCouponsQuerySchema.parse({});
  assert.equal(parsed.page, 1);
  assert.equal(parsed.limit, 20);
  assert.equal(listCouponsQuerySchema.safeParse({ limit: 999 }).success, false);
});
