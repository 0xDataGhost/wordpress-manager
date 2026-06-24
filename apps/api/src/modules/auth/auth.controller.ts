import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toStoreDto } from "../stores/stores.serializer";
import * as authService from "./auth.service";
import type {
  LoginInput,
  LogoutInput,
  RefreshInput,
  RegisterInput,
} from "./auth.schemas";

function shapeAuth(result: authService.AuthResult) {
  return {
    user: result.user,
    store: toStoreDto(result.store),
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
  };
}

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body as RegisterInput);
  res
    .status(201)
    .json(successResponse(shapeAuth(result), "Registration successful"));
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body as LoginInput);
  // Login is not authenticated, so the store/user come from the result, not req.
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.LOGIN,
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: result.user.id,
    storeId: result.store.id,
    userId: result.user.id,
    message: "تسجيل دخول ناجح",
    metadata: { email: result.user.email },
  });
  res.status(200).json(successResponse(shapeAuth(result), "Login successful"));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  const tokens = await authService.refresh(refreshToken);
  res.status(200).json(successResponse(tokens, "Token refreshed"));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as LogoutInput;
  const context = await authService.logout(refreshToken);
  // Only audit a real logout (a valid token was revoked); the endpoint is not
  // JWT-authenticated, so the tenant/user come from the resolved token context.
  if (context) {
    await recordAuditFromRequest(req, {
      action: AUDIT_ACTIONS.LOGOUT,
      entityType: AUDIT_ENTITY_TYPES.USER,
      entityId: context.userId,
      storeId: context.storeId,
      userId: context.userId,
      message: "تسجيل خروج",
    });
  }
  res.status(200).json(successResponse({ loggedOut: true }, "Logged out"));
}

export async function me(req: Request, res: Response): Promise<void> {
  const { userId, storeId } = getAuth(req);
  const result = await authService.getMe(userId, storeId);
  res.status(200).json(
    successResponse(
      {
        user: result.user,
        store: result.store ? toStoreDto(result.store) : null,
        roles: result.roles,
        permissions: result.permissions,
      },
      "",
    ),
  );
}
