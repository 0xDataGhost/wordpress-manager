import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
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
  res.status(200).json(successResponse(shapeAuth(result), "Login successful"));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as RefreshInput;
  const tokens = await authService.refresh(refreshToken);
  res.status(200).json(successResponse(tokens, "Token refreshed"));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as LogoutInput;
  await authService.logout(refreshToken);
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
