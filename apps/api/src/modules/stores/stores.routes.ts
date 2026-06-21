import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { validate } from "../../middleware/validate";
import { createStore, getCurrentStore } from "./stores.controller";
import { createStoreSchema } from "./stores.schemas";

const router = Router();

// POST /stores          — create a new store (tenant); creator becomes owner
router.post(
  "/",
  authenticate,
  validate({ body: createStoreSchema }),
  asyncHandler(createStore),
);

// GET /stores/current   — the store the current token is scoped to
router.get("/current", authenticate, asyncHandler(getCurrentStore));

export default router;
