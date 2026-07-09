import assert from "node:assert/strict";
import { test } from "node:test";
import { ValidationError } from "../../lib/errors";
import {
  resolveCommandRoute,
  SUPPORTED_COMMANDS,
} from "./wp-commands.routes-map";

test("product.create maps to POST products", () => {
  const route = resolveCommandRoute("product", "create", {
    targetWpId: null,
    payload: {},
  });
  assert.deepEqual(route, { method: "POST", path: "products" });
});

test("product.update maps to PUT products/{id} and requires a target", () => {
  const route = resolveCommandRoute("product", "update", {
    targetWpId: 42,
    payload: {},
  });
  assert.deepEqual(route, { method: "PUT", path: "products/42" });

  assert.throws(
    () =>
      resolveCommandRoute("product", "update", { targetWpId: null, payload: {} }),
    ValidationError,
  );
  assert.throws(
    () => resolveCommandRoute("product", "update", { targetWpId: 0, payload: {} }),
    ValidationError,
  );
});

test("order.add_digital_note maps to the digital-note route", () => {
  const route = resolveCommandRoute("order", "add_digital_note", {
    targetWpId: 1001,
    payload: { note: "x" },
  });
  assert.deepEqual(route, { method: "POST", path: "orders/1001/digital-note" });
});

test("unsupported commands throw a ValidationError", () => {
  assert.throws(
    () => resolveCommandRoute("settings", "update", { targetWpId: null, payload: {} }),
    ValidationError,
  );
  assert.throws(
    () => resolveCommandRoute("product", "explode", { targetWpId: 1, payload: {} }),
    ValidationError,
  );
});

test("every supported command resolves with a plausible context", () => {
  for (const key of SUPPORTED_COMMANDS) {
    const [domain, action] = key.split(".") as [never, string];
    const route = resolveCommandRoute(domain, action, {
      targetWpId: 7,
      // A superset payload so commands needing extra path segments resolve.
      payload: {
        variationId: 9,
        termId: 9,
        taxonomy: "categories",
        group: "general",
        zoneId: 9,
        methodId: 9,
        rateId: 9,
        gatewayId: "stripe",
      },
    });
    assert.ok(route.path.length > 0);
    assert.ok(["GET", "POST", "PUT", "PATCH", "DELETE"].includes(route.method));
    // Connector paths are relative — never absolute or traversing.
    assert.ok(!route.path.startsWith("/"));
    assert.ok(!route.path.includes(".."));
  }
});

test("Phase 27 order commands map to the connector order routes", () => {
  assert.deepEqual(
    resolveCommandRoute("order", "update_status", { targetWpId: 1001, payload: {} }),
    { method: "PUT", path: "orders/1001/status" },
  );
  assert.deepEqual(
    resolveCommandRoute("order", "add_note", { targetWpId: 1001, payload: {} }),
    { method: "POST", path: "orders/1001/notes" },
  );
  assert.deepEqual(
    resolveCommandRoute("order", "create_refund", { targetWpId: 1001, payload: {} }),
    { method: "POST", path: "orders/1001/refunds" },
  );
  assert.throws(
    () => resolveCommandRoute("order", "create_refund", { targetWpId: null, payload: {} }),
    ValidationError,
  );
});

test("Phase 26 catalog commands resolve to connector routes", () => {
  assert.deepEqual(
    resolveCommandRoute("product", "delete", { targetWpId: 5, payload: { force: true } }),
    { method: "DELETE", path: "products/5" },
  );
  assert.deepEqual(
    resolveCommandRoute("product", "bulk_update", { targetWpId: null, payload: { items: [] } }),
    { method: "POST", path: "products/bulk" },
  );
  assert.deepEqual(
    resolveCommandRoute("media", "create", { targetWpId: null, payload: {} }),
    { method: "POST", path: "media" },
  );
  assert.deepEqual(
    resolveCommandRoute("product", "create_variation", { targetWpId: 5, payload: {} }),
    { method: "POST", path: "products/5/variations" },
  );
  assert.deepEqual(
    resolveCommandRoute("product", "update_variation", { targetWpId: 5, payload: { variationId: 9 } }),
    { method: "PUT", path: "products/5/variations/9" },
  );
  assert.deepEqual(
    resolveCommandRoute("taxonomy", "create", { targetWpId: null, payload: { taxonomy: "categories" } }),
    { method: "POST", path: "taxonomies/categories" },
  );
  assert.deepEqual(
    resolveCommandRoute("taxonomy", "update", { targetWpId: 3, payload: { taxonomy: "tags", termId: 3 } }),
    { method: "PUT", path: "taxonomies/tags/3" },
  );
  // Taxonomy segment is validated.
  assert.throws(
    () => resolveCommandRoute("taxonomy", "create", { targetWpId: null, payload: { taxonomy: "evil" } }),
    ValidationError,
  );
  // Variation update requires the variationId path field.
  assert.throws(
    () => resolveCommandRoute("product", "update_variation", { targetWpId: 5, payload: {} }),
    ValidationError,
  );
});

test("Phase 28 coupon commands resolve to connector routes", () => {
  assert.deepEqual(
    resolveCommandRoute("coupon", "create", { targetWpId: null, payload: {} }),
    { method: "POST", path: "coupons" },
  );
  assert.deepEqual(
    resolveCommandRoute("coupon", "update", { targetWpId: 12, payload: {} }),
    { method: "PUT", path: "coupons/12" },
  );
  assert.deepEqual(
    resolveCommandRoute("coupon", "delete", { targetWpId: 12, payload: {} }),
    { method: "DELETE", path: "coupons/12" },
  );
});

test("Phase 29 customer/review commands resolve to connector routes", () => {
  assert.deepEqual(
    resolveCommandRoute("customer", "update", { targetWpId: 9, payload: {} }),
    { method: "PUT", path: "customers/9" },
  );
  assert.deepEqual(
    resolveCommandRoute("review", "moderate", { targetWpId: 7, payload: {} }),
    { method: "PUT", path: "reviews/7" },
  );
  assert.deepEqual(
    resolveCommandRoute("review", "reply", { targetWpId: 7, payload: {} }),
    { method: "POST", path: "reviews/7/reply" },
  );
});

test("Phase 30 store-config commands resolve to connector routes", () => {
  assert.deepEqual(
    resolveCommandRoute("settings", "update", { targetWpId: null, payload: { group: "general" } }),
    { method: "PUT", path: "settings/general" },
  );
  assert.deepEqual(
    resolveCommandRoute("shipping", "create_zone", { targetWpId: null, payload: {} }),
    { method: "POST", path: "shipping/zones" },
  );
  assert.deepEqual(
    resolveCommandRoute("shipping", "save_method", { targetWpId: 2, payload: { zoneId: 2 } }),
    { method: "POST", path: "shipping/zones/2/methods" },
  );
  assert.deepEqual(
    resolveCommandRoute("tax", "create_rate", { targetWpId: null, payload: {} }),
    { method: "POST", path: "taxes/rates" },
  );
  assert.deepEqual(
    resolveCommandRoute("settings", "toggle_gateway", { targetWpId: null, payload: { gatewayId: "stripe" } }),
    { method: "PUT", path: "gateways/stripe" },
  );
  assert.throws(
    () => resolveCommandRoute("settings", "update", { targetWpId: null, payload: { group: "secrets" } }),
    ValidationError,
  );
  assert.throws(
    () => resolveCommandRoute("settings", "toggle_gateway", { targetWpId: null, payload: { gatewayId: "../etc" } }),
    ValidationError,
  );
});
