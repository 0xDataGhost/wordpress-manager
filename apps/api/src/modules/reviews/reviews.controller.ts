import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { getAuth } from "../../middleware/authenticate";
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from "../../db/schema/audit-logs";
import { recordAuditFromRequest } from "../audit-logs/audit-logs.recorder";
import { toReviewDto } from "./reviews.serializer";
import { listReviews, moderateReview, replyToReview } from "./reviews.service";
import type {
  ListReviewsQuery,
  ModerateReviewInput,
  ReplyReviewInput,
  ReviewParams,
} from "./reviews.schemas";

export async function listReviewsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListReviewsQuery;
  const result = await listReviews(storeId, query);
  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toReviewDto),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.max(1, Math.ceil(result.total / result.limit)),
        },
      },
      "",
    ),
  );
}

export async function moderateReviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as ReviewParams;
  const { status } = req.body as ModerateReviewInput;
  const review = await moderateReview(storeId, id, status, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.REVIEW_MODERATED,
    entityType: AUDIT_ENTITY_TYPES.REVIEW,
    entityId: review.id,
    message: `غيّر حالة تقييم إلى: ${status}`,
    metadata: { wpReviewId: review.wpReviewId, status },
  });
  res.status(200).json(successResponse(toReviewDto(review), "Review moderated"));
}

export async function replyReviewHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId, userId } = getAuth(req);
  const { id } = req.params as ReviewParams;
  const { reply } = req.body as ReplyReviewInput;
  const result = await replyToReview(storeId, id, reply, userId);
  await recordAuditFromRequest(req, {
    action: AUDIT_ACTIONS.REVIEW_REPLIED,
    entityType: AUDIT_ENTITY_TYPES.REVIEW,
    entityId: id,
    message: "ردّ على تقييم منتج",
    metadata: { wpCommentId: result.wpCommentId },
  });
  res.status(201).json(successResponse(result, "Reply posted"));
}
