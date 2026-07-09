import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  listReviewsHandler,
  moderateReviewHandler,
  replyReviewHandler,
} from "./reviews.controller";
import {
  listReviewsQuerySchema,
  moderateReviewSchema,
  replyReviewSchema,
  reviewParamsSchema,
} from "./reviews.schemas";

const router = Router();

router.get(
  "/",
  authenticate,
  requirePermission("reviews.view"),
  validate({ query: listReviewsQuerySchema }),
  asyncHandler(listReviewsHandler),
);

router.put(
  "/:id",
  authenticate,
  requirePermission("reviews.moderate"),
  validate({ params: reviewParamsSchema, body: moderateReviewSchema }),
  asyncHandler(moderateReviewHandler),
);

router.post(
  "/:id/reply",
  authenticate,
  requirePermission("reviews.moderate"),
  validate({ params: reviewParamsSchema, body: replyReviewSchema }),
  asyncHandler(replyReviewHandler),
);

export default router;
