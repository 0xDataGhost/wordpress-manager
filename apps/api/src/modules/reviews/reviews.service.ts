import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import {
  productReviews,
  type ProductReviewRow,
} from "../../db/schema/product-reviews";
import { NotFoundError, ServiceUnavailableError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import type { ListReviewsQuery } from "./reviews.schemas";

/**
 * Review moderation (Phase 29). Reads serve the mirror (refreshed by
 * sync/webhooks); moderation and replies go through the command outbox.
 */

export interface ListReviewsResult {
  items: ProductReviewRow[];
  total: number;
  page: number;
  limit: number;
}

export async function listReviews(
  storeId: string,
  query: ListReviewsQuery,
): Promise<ListReviewsResult> {
  const conditions = [eq(productReviews.storeId, storeId)];
  if (query.status) conditions.push(eq(productReviews.status, query.status));
  if (query.search) {
    conditions.push(
      ilike(productReviews.productName, `%${escapeLike(query.search)}%`),
    );
  }
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(productReviews)
      .where(whereClause)
      .orderBy(desc(productReviews.wpDateCreated), desc(productReviews.id))
      .limit(query.limit)
      .offset(offset),
    db.select({ value: count() }).from(productReviews).where(whereClause),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

async function getReviewById(
  storeId: string,
  id: string,
): Promise<ProductReviewRow | null> {
  const [row] = await db
    .select()
    .from(productReviews)
    .where(
      and(eq(productReviews.storeId, storeId), eq(productReviews.id, id)),
    )
    .limit(1);
  return row ?? null;
}

async function requireLinkedReview(
  storeId: string,
  id: string,
): Promise<ProductReviewRow & { wpReviewId: number }> {
  const review = await getReviewById(storeId, id);
  if (!review) {
    throw new NotFoundError("Review not found");
  }
  if (!review.wpReviewId) {
    throw new ServiceUnavailableError(
      "This review is not linked to WooCommerce yet. Re-sync and try again.",
    );
  }
  return review as ProductReviewRow & { wpReviewId: number };
}

export async function moderateReview(
  storeId: string,
  id: string,
  status: string,
  userId: string,
): Promise<ProductReviewRow> {
  const review = await requireLinkedReview(storeId, id);
  await runWpCommandOrThrow({
    storeId,
    domain: "review",
    action: "moderate",
    targetWpId: review.wpReviewId,
    payload: { status },
    createdBy: userId,
  });
  const [updated] = await db
    .update(productReviews)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(productReviews.storeId, storeId), eq(productReviews.id, id)))
    .returning();
  if (!updated) {
    throw new NotFoundError("Review not found");
  }
  return updated;
}

export async function replyToReview(
  storeId: string,
  id: string,
  reply: string,
  userId: string,
): Promise<{ wpCommentId: number }> {
  const review = await requireLinkedReview(storeId, id);
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "review",
    action: "reply",
    targetWpId: review.wpReviewId,
    payload: { reply },
    createdBy: userId,
  });
  const data = command.result as { wpCommentId?: unknown } | null;
  const wpCommentId = Number(data?.wpCommentId);
  if (!Number.isInteger(wpCommentId) || wpCommentId <= 0) {
    throw new ServiceUnavailableError(
      "WooCommerce accepted the reply but returned an unexpected response.",
    );
  }
  return { wpCommentId };
}

/** Upserts reviews pulled from the connector (Phase 29/31). */
export interface WooReview {
  wpReviewId: number;
  wpProductId: number | null;
  productName: string | null;
  author: string | null;
  authorEmail: string | null;
  rating: number;
  content: string | null;
  status: string;
  dateCreated: string | null;
  dateModified: string | null;
}

export async function upsertReviewsFromWoo(
  storeId: string,
  incoming: WooReview[],
): Promise<{ total: number; created: number; updated: number }> {
  const now = new Date();
  let created = 0;
  let updated = 0;
  for (const item of incoming) {
    const dateCreated = item.dateCreated ? new Date(item.dateCreated) : null;
    const fields = {
      wpProductId: item.wpProductId,
      productName: item.productName,
      author: item.author,
      authorEmail: item.authorEmail,
      rating: item.rating,
      content: item.content,
      status: item.status,
      wpDateCreated:
        dateCreated && !Number.isNaN(dateCreated.getTime())
          ? dateCreated
          : null,
      wpVersion: item.dateModified,
      lastSyncedAt: now,
      updatedAt: now,
    };
    const [existing] = await db
      .select({ id: productReviews.id })
      .from(productReviews)
      .where(
        and(
          eq(productReviews.storeId, storeId),
          eq(productReviews.wpReviewId, item.wpReviewId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(productReviews)
        .set(fields)
        .where(eq(productReviews.id, existing.id));
      updated += 1;
    } else {
      await db
        .insert(productReviews)
        .values({ storeId, wpReviewId: item.wpReviewId, ...fields });
      created += 1;
    }
  }
  return { total: incoming.length, created, updated };
}
