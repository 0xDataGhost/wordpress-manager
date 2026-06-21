import type { Request, RequestHandler } from "express";
import { UnauthorizedError } from "../lib/errors";
import { verifyAccessToken } from "../lib/jwt";

const BEARER_PREFIX = "Bearer ";

export interface AuthContext {
  userId: string;
  storeId: string;
}

/**
 * Returns the auth context attached by `authenticate`, or throws 401.
 * Use in controllers behind the `authenticate` middleware to get a typed,
 * non-optional context.
 */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new UnauthorizedError();
  }
  return { userId: req.auth.userId, storeId: req.auth.storeId };
}

/**
 * Verifies the Bearer access token and attaches { userId, storeId } to
 * req.auth. Rejects with 401 when the header is missing, malformed, or the
 * token is invalid/expired.
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(new UnauthorizedError("Missing or malformed Authorization header"));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();

  try {
    const claims = verifyAccessToken(token);
    req.auth = { userId: claims.userId, storeId: claims.storeId };
    next();
  } catch (err) {
    next(err);
  }
};
