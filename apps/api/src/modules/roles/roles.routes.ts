import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { listRoles } from "./roles.controller";

const router = Router();

router.get(
  "/",
  authenticate,
  requirePermission("team.view"),
  asyncHandler(listRoles),
);

export default router;
