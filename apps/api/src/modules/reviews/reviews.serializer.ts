import type { ProductReviewRow } from "../../db/schema/product-reviews";

export interface ReviewDto {
  id: string;
  wpReviewId: number | null;
  wpProductId: number | null;
  productName: string | null;
  author: string | null;
  authorEmail: string | null;
  rating: number;
  content: string | null;
  status: string;
  wpDateCreated: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Review DTO. The author email is exposed to moderators (same as WordPress
 * comment moderation) but nothing more sensitive; the content is the review
 * excerpt only.
 */
export function toReviewDto(row: ProductReviewRow): ReviewDto {
  return {
    id: row.id,
    wpReviewId: row.wpReviewId,
    wpProductId: row.wpProductId,
    productName: row.productName,
    author: row.author,
    authorEmail: row.authorEmail,
    rating: row.rating,
    content: row.content,
    status: row.status,
    wpDateCreated: row.wpDateCreated,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
