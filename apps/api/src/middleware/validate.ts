import type { RequestHandler } from "express";
import { ZodError, type ZodSchema } from "zod";
import { ValidationError } from "../lib/errors";

export interface RequestSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validates and coerces request parts against the provided Zod schemas.
 * Parsed values replace the originals, so downstream handlers receive typed,
 * trusted input. Failures are converted into a ValidationError and forwarded
 * to the centralized error handler.
 */
export function validate(schemas: RequestSchemas): RequestHandler {
  return (req, _res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(new ValidationError("Validation failed", err.flatten()));
        return;
      }
      next(err);
    }
  };
}
