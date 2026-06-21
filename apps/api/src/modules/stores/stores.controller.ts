import type { Request, Response } from "express";
import { db } from "../../db";
import { errorResponse, successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { createStoreWithOwner, getStoreById } from "./stores.service";
import { toStoreDto } from "./stores.serializer";
import type { CreateStoreInput } from "./stores.schemas";

/** POST /stores — any authenticated user can create a store and own it. */
export async function createStore(req: Request, res: Response): Promise<void> {
  const { userId } = getAuth(req);
  const { name } = req.body as CreateStoreInput;

  const store = await db.transaction((tx) =>
    createStoreWithOwner(tx, { name, ownerUserId: userId }),
  );

  res.status(201).json(successResponse(toStoreDto(store), "Store created"));
}

/** GET /stores/current — the store the current access token is scoped to. */
export async function getCurrentStore(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const store = await getStoreById(storeId);

  if (!store) {
    res.status(404).json(errorResponse("NOT_FOUND", "Current store not found"));
    return;
  }

  res.status(200).json(successResponse(toStoreDto(store), ""));
}
