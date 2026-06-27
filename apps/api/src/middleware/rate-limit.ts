import type { RequestHandler } from "express";
import { env } from "../config/env";
import { RateLimitError } from "../lib/errors";
import { logger } from "../lib/logger";
import { redis } from "../redis";

/**
 * Atomic fixed-window counter: increment the key and, only on the first hit of
 * a window, set its TTL. Returns [currentCount, ttlSeconds] so the caller can
 * build rate-limit headers without a second round-trip.
 */
const WINDOW_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[1])
end
return {current, redis.call("TTL", KEYS[1])}
`;

interface RateLimitOptions {
  /** Bucket name, namespaced per protected action (e.g. "auth:login"). */
  name: string;
  /** Max requests per window per client. Defaults to AUTH_RATE_LIMIT_MAX. */
  max?: number;
  /** Window length in seconds. Defaults to AUTH_RATE_LIMIT_WINDOW_SECONDS. */
  windowSeconds?: number;
  /**
   * Whether this limiter is active. Defaults to AUTH_RATE_LIMIT_ENABLED so
   * existing auth buckets are unchanged; non-auth callers (e.g. the digital code
   * reveal endpoint) pass their own flag so they are not coupled to the auth one.
   */
  enabled?: boolean;
  /**
   * Derives the per-client key from the request. Defaults to the client IP.
   * Used to throttle by a non-IP dimension (e.g. a token fingerprint) so a single
   * leaked link can be limited across IPs. MUST return a non-secret value — never
   * a raw token (the value lands in a Redis key). Returns null/empty to fall back
   * to the IP, so a request missing the keyed value is still IP-limited.
   */
  keyBy?: (req: Parameters<RequestHandler>[0]) => string | null | undefined;
}

/**
 * Per-IP fixed-window rate limiter backed by Redis. Throws RateLimitError (429,
 * RATE_LIMITED) once a client exceeds `max` requests within the window. Fails
 * open on Redis errors so an outage cannot lock every user out of auth.
 */
export function rateLimit(options: RateLimitOptions): RequestHandler {
  const max = options.max ?? env.AUTH_RATE_LIMIT_MAX;
  const windowSeconds = options.windowSeconds ?? env.AUTH_RATE_LIMIT_WINDOW_SECONDS;
  const enabled = options.enabled ?? env.AUTH_RATE_LIMIT_ENABLED;

  return (req, res, next) => {
    if (!enabled) {
      next();
      return;
    }

    const clientId =
      (options.keyBy ? options.keyBy(req) : null) || req.ip || "unknown";
    const key = `ratelimit:${options.name}:${clientId}`;

    redis
      .eval(WINDOW_SCRIPT, 1, key, String(windowSeconds))
      .then((raw) => {
        const [count, ttl] = raw as [number, number];
        const remaining = Math.max(0, max - count);

        res.setHeader("RateLimit-Limit", String(max));
        res.setHeader("RateLimit-Remaining", String(remaining));
        if (ttl >= 0) {
          res.setHeader("RateLimit-Reset", String(ttl));
        }

        if (count > max) {
          const retryAfter = ttl >= 0 ? ttl : windowSeconds;
          res.setHeader("Retry-After", String(retryAfter));
          next(new RateLimitError(undefined, { retryAfter }));
          return;
        }

        next();
      })
      .catch((err: unknown) => {
        logger.error({ err }, "Rate limiter unavailable; allowing request");
        next();
      });
  };
}
