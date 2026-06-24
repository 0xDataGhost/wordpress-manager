import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { listAuditLogsHandler } from "./audit-logs.controller";
import { listAuditLogsQuerySchema } from "./audit-logs.schemas";

const router = Router();

// Audit logs are a sensitive operational surface, so viewing them is gated on
// settings.view (held by store owners/managers) per the Phase 13.5 brief.
const view = requirePermission("settings.view");

// GET /audit-logs — list with optional action / entity-type / user / date-range
// filters + pagination, newest first, tenant-scoped.
router.get(
  "/",
  authenticate,
  view,
  validate({ query: listAuditLogsQuerySchema }),
  asyncHandler(listAuditLogsHandler),
);

export default router;
