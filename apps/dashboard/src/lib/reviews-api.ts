/**
 * Reviews API client for the Phase 29 reviews moderation screen.
 *
 * Each function calls a real backend route from the reviews module
 * (mounted at /api/v1/reviews) through the shared HTTP client, which attaches
 * the Bearer token and unwraps the response envelope:
 *   listReviews    → GET  /reviews          (JWT, reviews.view)
 *   moderateReview → PUT  /reviews/:id       (JWT, reviews.moderate)
 *   replyReview    → POST /reviews/:id/reply (JWT, reviews.moderate)
 *
 * Failures surface as `ApiError` from lib/http, whose `.message` carries the
 * backend's user-facing text — the pages render `error.message` directly.
 */

import { apiRequest } from "./http";

/** Canonical review statuses — kept in sync with the backend reviews module. */
export const REVIEW_STATUS_VALUES = [
  "approved",
  "hold",
  "spam",
  "trash",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];

export interface ReviewDto {
  id: string;
  /** WooCommerce comment/review id. */
  wpReviewId: number;
  /** WooCommerce product id the review belongs to. */
  wpProductId: number;
  productName: string | null;
  author: string | null;
  authorEmail: string | null;
  /** Star rating, 0–5. */
  rating: number;
  content: string | null;
  status: ReviewStatus;
  /** ISO timestamp of the review's creation in WooCommerce; null when unknown. */
  wpDateCreated: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewPagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReviewListResult {
  items: ReviewDto[];
  pagination: ReviewPagination;
}

export interface ReviewListQuery {
  status?: ReviewStatus;
  search?: string;
  page?: number;
  limit?: number;
}

/** Result of posting a reply — the WordPress comment id of the new reply. */
export interface ReviewReplyResult {
  wpCommentId: number;
}

export async function listReviews(
  query: ReviewListQuery = {},
): Promise<ReviewListResult> {
  return apiRequest<ReviewListResult>("/reviews", {
    method: "GET",
    query: {
      status: query.status,
      search: query.search,
      page: query.page,
      limit: query.limit,
    },
  });
}

export async function moderateReview(
  id: string,
  status: ReviewStatus,
): Promise<ReviewDto> {
  return apiRequest<ReviewDto>(`/reviews/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: { status },
  });
}

export async function replyReview(
  id: string,
  reply: string,
): Promise<ReviewReplyResult> {
  return apiRequest<ReviewReplyResult>(
    `/reviews/${encodeURIComponent(id)}/reply`,
    {
      method: "POST",
      body: { reply },
    },
  );
}
