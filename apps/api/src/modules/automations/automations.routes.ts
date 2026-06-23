import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  listAutomationLogsHandler,
  listAutomationsHandler,
  updateAutomationHandler,
} from "./automations.controller";
import {
  automationParamsSchema,
  listAutomationLogsQuerySchema,
  updateAutomationSchema,
} from "./automations.schemas";

const router = Router();

// Reading automations + their logs requires automations.view; changing config
// or toggling enabled requires automations.edit (plan.md Phase 11).
const view = requirePermission("automations.view");
const edit = requirePermission("automations.edit");

// GET /automations               — list the store's automations
router.get("/", authenticate, view, asyncHandler(listAutomationsHandler));

// PATCH /automations/:id          — update enabled / config
router.patch(
  "/:id",
  authenticate,
  edit,
  validate({ params: automationParamsSchema, body: updateAutomationSchema }),
  asyncHandler(updateAutomationHandler),
);

// GET /automations/:id/logs       — list an automation's run logs
router.get(
  "/:id/logs",
  authenticate,
  view,
  validate({
    params: automationParamsSchema,
    query: listAutomationLogsQuerySchema,
  }),
  asyncHandler(listAutomationLogsHandler),
);

export default router;
