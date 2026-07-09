import assert from "node:assert/strict";
import { test } from "node:test";
import { stripSecretsDefensively } from "./store-config.service";

test("stripSecretsDefensively removes credential-looking keys at any depth", () => {
  const input = {
    gateways: [
      {
        gatewayId: "stripe",
        title: "Stripe",
        enabled: true,
        secret_key: "sk_live_XXX",
        settings: {
          publishable_key: "pk_live_YYY",
          api_key: "zzz",
          webhook_secret: "whsec_1",
          title: "بطاقة",
        },
      },
    ],
  };
  const out = stripSecretsDefensively(input) as typeof input;
  const g = out.gateways[0] as Record<string, unknown>;
  assert.equal("secret_key" in g, false);
  const s = g.settings as Record<string, unknown>;
  assert.equal("publishable_key" in s, false);
  assert.equal("api_key" in s, false);
  assert.equal("webhook_secret" in s, false);
  // Safe fields survive.
  assert.equal(g.gatewayId, "stripe");
  assert.equal(g.enabled, true);
  assert.equal(s.title, "بطاقة");
  // No secret substring survives serialization.
  const json = JSON.stringify(out);
  assert.ok(!json.includes("sk_live"));
  assert.ok(!json.includes("pk_live"));
  assert.ok(!json.includes("whsec_"));
});

test("stripSecretsDefensively covers username-style and connected-account credentials (audit H1)", () => {
  const input = {
    login: "authnet_login_id",
    apiUsername: "user",
    clientId: "ca_123",
    stripe_user_id: "acct_1",
    account_id: "acc_9",
    razorpay_key_id: "rzp_key",
    bearer: "tok",
    // Safe gateway fields must survive.
    gatewayId: "stripe",
    title: "بطاقة",
    description: "ادفع ببطاقتك",
    enabled: true,
    method: "Credit Card",
    supportsRefunds: true,
  };
  const out = stripSecretsDefensively(input) as Record<string, unknown>;
  for (const secret of [
    "login",
    "apiUsername",
    "clientId",
    "stripe_user_id",
    "account_id",
    "razorpay_key_id",
    "bearer",
  ]) {
    assert.equal(secret in out, false, `${secret} should be stripped`);
  }
  // Safe display fields survive.
  assert.equal(out.gatewayId, "stripe");
  assert.equal(out.title, "بطاقة");
  assert.equal(out.enabled, true);
  assert.equal(out.method, "Credit Card");
  assert.equal(out.supportsRefunds, true);
});
