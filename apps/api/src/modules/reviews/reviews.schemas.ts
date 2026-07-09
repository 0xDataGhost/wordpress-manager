import { z } from "zod";
import { REVIEW_STATUSES } from "../../db/schema/product-reviews";

export const listReviewsQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const reviewParamsSchema = z.object({
  id: z.string().uuid(),
});

/** Moderation transition. */
export const moderateReviewSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
});

/** Store reply to a review (posted as a threaded comment in WordPress). */
export const replyReviewSchema = z.object({
  reply: z.string().trim().min(1).max(2000),
});

export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
export type ReviewParams = z.infer<typeof reviewParamsSchema>;
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;
export type ReplyReviewInput = z.infer<typeof replyReviewSchema>;
