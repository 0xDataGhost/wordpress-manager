import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  getWpCommandHandler,
  listWpCommandsHandler,
  retryWpCommandHandler,
  wpCommandStatsHandler,
} from "./wp-commands.controller";
import {
  listWpCommandsQuerySchema,
  wpCommandParamsSchema,
} from "./wp-commands.schemas";

const router = Router();

router.get(
  "/",
  authenticate,
  requirePermission("wp_commands.view"),
  validate({ query: listWpCommandsQuerySchema }),
  asyncHandler(listWpCommandsHandler),
);

router.get(
  "/stats",
  authenticate,
  requirePermission("wp_commands.view"),
  asyncHandler(wpCommandStatsHandler),
);

router.get(
  "/:id",
  authenticate,
  requirePermission("wp_commands.view"),
  validate({ params: wpCommandParamsSchema }),
  asyncHandler(getWpCommandHandler),
);

router.post(
  "/:id/retry",
  authenticate,
  requirePermission("wp_commands.manage"),
  validate({ params: wpCommandParamsSchema }),
  asyncHandler(retryWpCommandHandler),
);

export default router;
