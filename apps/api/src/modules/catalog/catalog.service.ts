import { and, asc, count, eq, ilike } from "drizzle-orm";
import { db } from "../../db";
import {
  productTaxonomies,
  type ProductTaxonomyKind,
  type ProductTaxonomyRow,
} from "../../db/schema/product-taxonomies";
import { NotFoundError, ServiceUnavailableError } from "../../lib/errors";
import { escapeLike } from "../../lib/sql";
import { runWpCommandOrThrow } from "../wp-commands/wp-commands.service";
import type { TaxonomySlug } from "./catalog.schemas";
import type {
  CreateTaxonomyInput,
  ListTaxonomyQuery,
  UpdateTaxonomyInput,
} from "./catalog.schemas";

/**
 * Product taxonomy management (Phase 26): categories, tags and attributes.
 * Reads serve the mirror (refreshed by sync/webhooks); writes go through the
 * command outbox to WooCommerce and then update the mirror from the response.
 */

const SLUG_BY_KIND: Record<ProductTaxonomyKind, TaxonomySlug> = {
  category: "categories",
  tag: "tags",
  attribute: "attributes",
};

export interface ListTaxonomyResult {
  items: ProductTaxonomyRow[];
  total: number;
  page: number;
  limit: number;
}

export async function listTaxonomyTerms(
  storeId: string,
  kind: ProductTaxonomyKind,
  query: ListTaxonomyQuery,
): Promise<ListTaxonomyResult> {
  const conditions = [
    eq(productTaxonomies.storeId, storeId),
    eq(productTaxonomies.kind, kind),
  ];
  if (query.search) {
    conditions.push(
      ilike(productTaxonomies.name, `%${escapeLike(query.search)}%`),
    );
  }
  const whereClause = and(...conditions);
  const offset = (query.page - 1) * query.limit;

  const [items, totals] = await Promise.all([
    db
      .select()
      .from(productTaxonomies)
      .where(whereClause)
      .orderBy(asc(productTaxonomies.name))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(productTaxonomies)
      .where(whereClause),
  ]);

  return {
    items,
    total: Number(totals[0]?.value ?? 0),
    page: query.page,
    limit: query.limit,
  };
}

async function getTermById(
  storeId: string,
  kind: ProductTaxonomyKind,
  id: string,
): Promise<ProductTaxonomyRow | null> {
  const [row] = await db
    .select()
    .from(productTaxonomies)
    .where(
      and(
        eq(productTaxonomies.storeId, storeId),
        eq(productTaxonomies.kind, kind),
        eq(productTaxonomies.id, id),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Connector response for a created/updated taxonomy term. */
interface TaxonomyResult {
  wpTermId: number;
  name: string;
  slug: string | null;
  description: string | null;
  parentWpId: number | null;
  count: number;
}

function parseTaxonomyResult(data: unknown): TaxonomyResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const wpTermId = Number(d.wpTermId);
  if (!Number.isInteger(wpTermId) || wpTermId <= 0) return null;
  return {
    wpTermId,
    name: typeof d.name === "string" ? d.name : "",
    slug: typeof d.slug === "string" ? d.slug : null,
    description: typeof d.description === "string" ? d.description : null,
    parentWpId:
      d.parentWpId && Number.isInteger(Number(d.parentWpId))
        ? Number(d.parentWpId)
        : null,
    count: Number.isInteger(Number(d.count)) ? Number(d.count) : 0,
  };
}

/** Upserts a taxonomy mirror row keyed by (store, kind, wpTermId). */
async function upsertMirror(
  storeId: string,
  kind: ProductTaxonomyKind,
  result: TaxonomyResult,
): Promise<ProductTaxonomyRow> {
  const now = new Date();
  const [existing] = await db
    .select({ id: productTaxonomies.id })
    .from(productTaxonomies)
    .where(
      and(
        eq(productTaxonomies.storeId, storeId),
        eq(productTaxonomies.kind, kind),
        eq(productTaxonomies.wpTermId, result.wpTermId),
      ),
    )
    .limit(1);

  const fields = {
    name: result.name,
    slug: result.slug,
    description: result.description,
    parentWpId: result.parentWpId,
    count: result.count,
    updatedAt: now,
  };

  if (existing) {
    const [updated] = await db
      .update(productTaxonomies)
      .set(fields)
      .where(eq(productTaxonomies.id, existing.id))
      .returning();
    return updated!;
  }
  const [inserted] = await db
    .insert(productTaxonomies)
    .values({ storeId, kind, wpTermId: result.wpTermId, ...fields })
    .returning();
  if (!inserted) {
    throw new Error("Failed to record taxonomy mirror row");
  }
  return inserted;
}

export async function createTaxonomyTerm(
  storeId: string,
  kind: ProductTaxonomyKind,
  input: CreateTaxonomyInput,
  userId: string,
): Promise<ProductTaxonomyRow> {
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "taxonomy",
    action: "create",
    payload: {
      taxonomy: SLUG_BY_KIND[kind],
      name: input.name,
      slug: input.slug,
      description: input.description,
      parentWpId: input.parentWpId ?? null,
    },
    createdBy: userId,
  });
  const result = parseTaxonomyResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the term but returned an unexpected response.",
    );
  }
  return upsertMirror(storeId, kind, result);
}

export async function updateTaxonomyTerm(
  storeId: string,
  kind: ProductTaxonomyKind,
  id: string,
  input: UpdateTaxonomyInput,
  userId: string,
): Promise<ProductTaxonomyRow> {
  const term = await getTermById(storeId, kind, id);
  if (!term) {
    throw new NotFoundError("Taxonomy term not found");
  }
  if (!term.wpTermId) {
    throw new ServiceUnavailableError(
      "This term is not linked to WooCommerce yet. Re-sync and try again.",
    );
  }
  const command = await runWpCommandOrThrow({
    storeId,
    domain: "taxonomy",
    action: "update",
    targetWpId: term.wpTermId,
    payload: {
      taxonomy: SLUG_BY_KIND[kind],
      termId: term.wpTermId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      parentWpId: input.parentWpId ?? null,
    },
    createdBy: userId,
  });
  const result = parseTaxonomyResult(command.result);
  if (!result) {
    throw new ServiceUnavailableError(
      "WooCommerce confirmed the update but returned an unexpected response.",
    );
  }
  return upsertMirror(storeId, kind, result);
}

export async function deleteTaxonomyTerm(
  storeId: string,
  kind: ProductTaxonomyKind,
  id: string,
  userId: string,
): Promise<ProductTaxonomyRow> {
  const term = await getTermById(storeId, kind, id);
  if (!term) {
    throw new NotFoundError("Taxonomy term not found");
  }
  if (!term.wpTermId) {
    // Not linked to WooCommerce — just drop the local mirror row.
    await db
      .delete(productTaxonomies)
      .where(eq(productTaxonomies.id, term.id));
    return term;
  }
  await runWpCommandOrThrow({
    storeId,
    domain: "taxonomy",
    action: "delete",
    targetWpId: term.wpTermId,
    payload: { taxonomy: SLUG_BY_KIND[kind], termId: term.wpTermId },
    createdBy: userId,
  });
  await db.delete(productTaxonomies).where(eq(productTaxonomies.id, term.id));
  return term;
}

/**
 * Upserts taxonomy terms pulled from the connector during sync (Phase 26/31).
 * Keyed by (store, kind, wpTermId); transactional per batch.
 */
export interface WooTaxonomyTerm {
  kind: ProductTaxonomyKind;
  wpTermId: number;
  name: string;
  slug: string | null;
  description: string | null;
  parentWpId: number | null;
  count: number;
}

export async function upsertTaxonomiesFromWoo(
  storeId: string,
  terms: WooTaxonomyTerm[],
): Promise<{ total: number; created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const term of terms) {
    const before = await getTermByWpId(storeId, term.kind, term.wpTermId);
    await upsertMirror(storeId, term.kind, term);
    if (before) updated += 1;
    else created += 1;
  }
  return { total: terms.length, created, updated };
}

async function getTermByWpId(
  storeId: string,
  kind: ProductTaxonomyKind,
  wpTermId: number,
): Promise<ProductTaxonomyRow | null> {
  const [row] = await db
    .select()
    .from(productTaxonomies)
    .where(
      and(
        eq(productTaxonomies.storeId, storeId),
        eq(productTaxonomies.kind, kind),
        eq(productTaxonomies.wpTermId, wpTermId),
      ),
    )
    .limit(1);
  return row ?? null;
}
