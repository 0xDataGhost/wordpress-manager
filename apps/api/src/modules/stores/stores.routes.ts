import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  disconnectCurrentStore,
  generateApiKey,
} from "../connections/connections.controller";
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

// GET /stores/current   — the store the current token is scoped to.
// No requirePermission: every authenticated user needs their own store context
// regardless of role; this is foundational read-only data, not a privileged action.
router.get("/current", authenticate, asyncHandler(getCurrentStore));

// POST /stores/current/api-key — issue a new WordPress connector API key
router.post(
  "/current/api-key",
  authenticate,
  requirePermission("settings.edit"),
  asyncHandler(generateApiKey),
);

// POST /stores/current/disconnect — revoke the key and reset the connection
router.post(
  "/current/disconnect",
  authenticate,
  requirePermission("settings.edit"),
  asyncHandler(disconnectCurrentStore),
);

export default router;
