import type { RequestHandler } from "express";
import { ForbiddenError, UnauthorizedError } from "../lib/errors";
import {
  loadPermissionKeys,
  loadRoleSlugs,
} from "../modules/rbac/rbac.service";

/**
 * Permission-based guard (preferred). Passes only when the authenticated user
 * holds ALL of the given permission keys within their active store. Keys are
 * loaded once per request and memoised on req.auth.
 */
export function requirePermission(...required: string[]): RequestHandler {
  return async (req, _res, next) => {
    const auth = req.auth;
    if (!auth) {
      next(new UnauthorizedError());
      return;
    }

    try {
      const keys =
        auth.permissionKeys ??
        new Set(await loadPermissionKeys(auth.userId, auth.storeId));
      auth.permissionKeys = keys;

      if (!required.every((key) => keys.has(key))) {
        next(new ForbiddenError());
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Role-based guard (use sparingly — prefer requirePermission). Passes when the
 * user holds ANY of the given role slugs within their active store.
 */
export function requireRole(...slugs: string[]): RequestHandler {
  return async (req, _res, next) => {
    const auth = req.auth;
    if (!auth) {
      next(new UnauthorizedError());
      return;
    }

    try {
      const held = await loadRoleSlugs(auth.userId, auth.storeId);
      if (!slugs.some((slug) => held.includes(slug))) {
        next(new ForbiddenError());
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
