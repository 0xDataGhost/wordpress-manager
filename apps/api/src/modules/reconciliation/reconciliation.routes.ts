import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { runReconciliationHandler } from "./reconciliation.controller";

const router = Router();

// POST /reconciliation/run — on-demand parity check + drift notification.
router.post(
  "/run",
  authenticate,
  requirePermission("settings.view"),
  asyncHandler(runReconciliationHandler),
);

export default router;
