import type { ProductTaxonomyRow } from "../../db/schema/product-taxonomies";

/** Public API shape of a product taxonomy term (category/tag/attribute). */
export interface TaxonomyTermDto {
  id: string;
  kind: string;
  wpTermId: number | null;
  name: string;
  slug: string | null;
  description: string | null;
  parentWpId: number | null;
  count: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toTaxonomyTermDto(row: ProductTaxonomyRow): TaxonomyTermDto {
  return {
    id: row.id,
    kind: row.kind,
    wpTermId: row.wpTermId,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentWpId: row.parentWpId,
    count: row.count,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
