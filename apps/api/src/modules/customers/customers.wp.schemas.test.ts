import assert from "node:assert/strict";
import { test } from "node:test";
import { updateCustomerWpSchema } from "./customers.schemas";

test("updateCustomerWpSchema allows name/phone/billing/shipping only", () => {
  const parsed = updateCustomerWpSchema.parse({
    firstName: "خالد",
    billing: { city: "الرياض", country: "SA" },
  });
  assert.equal(parsed.firstName, "خالد");
  assert.equal(parsed.billing?.city, "الرياض");
});

test("updateCustomerWpSchema rejects unknown address keys and empty body", () => {
  assert.equal(updateCustomerWpSchema.safeParse({}).success, false);
  // email login / password are NOT accepted at the top level (red line).
  const withExtra = updateCustomerWpSchema.safeParse({
    firstName: "x",
    billing: { role: "administrator" },
  });
  assert.equal(withExtra.success, false);
});
