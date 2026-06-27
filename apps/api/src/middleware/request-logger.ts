import { randomUUID } from "node:crypto";
import { pinoHttp } from "pino-http";
import { logger } from "../lib/logger";

/**
 * HTTP request logging with a correlation id. Reuses an incoming
 * `x-request-id` header when present, otherwise generates one, and echoes it
 * back on the response for client-side tracing.
 *
 * SECURITY: pino-http never logs request/response BODIES, so secrets carried in
 * the body (customer access tokens, decrypted codes) are never logged. As
 * defense-in-depth we also redact the Authorization and Cookie request headers,
 * and customer access tokens are deliberately passed in the body (not the URL) so
 * the logged `req.url` can never contain one.
 */
export const requestLogger = pinoHttp({
  logger,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie"],
    remove: true,
  },
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id =
      (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
});
