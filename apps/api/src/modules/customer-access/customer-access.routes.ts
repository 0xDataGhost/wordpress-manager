import { Router } from "express";
import { env } from "../../config/env";
import { asyncHandler } from "../../lib/async-handler";
import { rateLimit } from "../../middleware/rate-limit";
import { validate } from "../../middleware/validate";
import { accessTokenRateKey } from "../../lib/customer-token";
import { lookupHandler, revealHandler } from "./customer-access.controller";
import { lookupSchema, revealSchema } from "./customer-access.schemas";

/**
 * PUBLIC customer self-service router (Phase 22), mounted at `/public`. These
 * routes intentionally DO NOT use `authenticate` — access is gated by a valid
 * signed token in the body. Both endpoints are rate-limited (lookup moderate,
 * reveal strict per-IP AND per-token) and the token never appears in the URL.
 */
const router = Router();

const lookupRateLimit = rateLimit({
  name: "customer-access-lookup",
  enabled: env.CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_ENABLED,
  max: env.CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_MAX,
  windowSeconds: env.CUSTOMER_ACCESS_LOOKUP_RATE_LIMIT_WINDOW_SECONDS,
});

const revealIpRateLimit = rateLimit({
  name: "customer-access-reveal-ip",
  enabled: env.CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_ENABLED,
  max: env.CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_MAX,
  windowSeconds: env.CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_WINDOW_SECONDS,
});

// Per-token limiter: a single leaked link can't be hammered across many IPs. The
// bucket key is a one-way fingerprint of the token (never the token itself); a
// request without a token falls back to the IP limiter above.
const revealTokenRateLimit = rateLimit({
  name: "customer-access-reveal-token",
  enabled: env.CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_ENABLED,
  max: env.CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_MAX,
  windowSeconds: env.CUSTOMER_ACCESS_REVEAL_RATE_LIMIT_WINDOW_SECONDS,
  keyBy: (req) => {
    const token = (req.body as { token?: unknown } | undefined)?.token;
    return typeof token === "string" && token.length > 0
      ? `tok:${accessTokenRateKey(token)}`
      : null;
  },
});

// POST /public/digital-orders/lookup
router.post(
  "/digital-orders/lookup",
  lookupRateLimit,
  validate({ body: lookupSchema }),
  asyncHandler(lookupHandler),
);

// POST /public/digital-orders/reveal
router.post(
  "/digital-orders/reveal",
  revealIpRateLimit,
  revealTokenRateLimit,
  validate({ body: revealSchema }),
  asyncHandler(revealHandler),
);

export default router;
