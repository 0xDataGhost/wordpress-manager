import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  getSettingsHandler,
  updateSettingsHandler,
} from "./settings.controller";
import { updateSettingsSchema } from "./settings.schemas";

const router = Router();

// Reading settings requires settings.view; changing them requires settings.edit
// (plan.md Phase 12).
const view = requirePermission("settings.view");
const edit = requirePermission("settings.edit");

// GET /settings    — the store's settings (lazily provisioned)
router.get("/", authenticate, view, asyncHandler(getSettingsHandler));

// PATCH /settings  — partial update
router.patch(
  "/",
  authenticate,
  edit,
  validate({ body: updateSettingsSchema }),
  asyncHandler(updateSettingsHandler),
);

export default router;
