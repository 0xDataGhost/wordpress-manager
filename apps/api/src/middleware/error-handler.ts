import type { ErrorRequestHandler, Request } from "express";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { errorResponse } from "../lib/api-response";
import { isProduction } from "../config/env";
import { logger } from "../lib/logger";

function logFor(req: Request) {
  // pino-http attaches a child logger per request; fall back to the root.
  return (req as Request & { log?: typeof logger }).log ?? logger;
}

/**
 * Centralized error handler. Converts known error types into the standard
 * error envelope and ensures unexpected errors never leak internals in
 * production. Must be registered last, after all routes.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (res.headersSent) {
    return _next(err);
  }

  if (err instanceof ZodError) {
    logFor(req).warn({ err: err.flatten() }, "Request validation failed");
    return res
      .status(400)
      .json(errorResponse("VALIDATION_ERROR", "Validation failed", err.flatten()));
  }

  if (err instanceof AppError) {
    const log = logFor(req);
    const payload = { err, code: err.code };
    if (err.statusCode >= 500) log.error(payload, err.message);
    else log.warn(payload, err.message);
    return res
      .status(err.statusCode)
      .json(errorResponse(err.code, err.message, err.details));
  }

  // Unknown / unexpected error.
  logFor(req).error({ err }, "Unhandled error");
  const message =
    isProduction || !(err instanceof Error)
      ? "Internal server error"
      : err.message;
  return res.status(500).json(errorResponse("INTERNAL_ERROR", message));
};
