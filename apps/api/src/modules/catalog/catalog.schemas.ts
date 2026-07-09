import { z } from "zod";
import { PRODUCT_TAXONOMY_KINDS } from "../../db/schema/product-taxonomies";

/** URL param mapping the three managed taxonomies to their kind. */
export const TAXONOMY_SLUGS = ["categories", "tags", "attributes"] as const;
export type TaxonomySlug = (typeof TAXONOMY_SLUGS)[number];

const SLUG_TO_KIND: Record<TaxonomySlug, (typeof PRODUCT_TAXONOMY_KINDS)[number]> =
  {
    categories: "category",
    tags: "tag",
    attributes: "attribute",
  };

export function taxonomySlugToKind(slug: TaxonomySlug) {
  return SLUG_TO_KIND[slug];
}

export const taxonomyParamsSchema = z.object({
  taxonomy: z.enum(TAXONOMY_SLUGS),
});

export const taxonomyTermParamsSchema = z.object({
  taxonomy: z.enum(TAXONOMY_SLUGS),
  id: z.string().uuid(),
});

export const listTaxonomyQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const nameField = z.string().trim().min(1).max(200);
const descriptionField = z.string().trim().max(2000);

/** Create a taxonomy term. `parentWpId` applies to hierarchical categories. */
export const createTaxonomySchema = z.object({
  name: nameField,
  slug: z.string().trim().max(200).optional(),
  description: descriptionField.optional(),
  parentWpId: z.number().int().positive().nullish(),
});

export const updateTaxonomySchema = z
  .object({
    name: nameField.optional(),
    slug: z.string().trim().max(200).optional(),
    description: descriptionField.nullish(),
    parentWpId: z.number().int().positive().nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type TaxonomyParams = z.infer<typeof taxonomyParamsSchema>;
export type TaxonomyTermParams = z.infer<typeof taxonomyTermParamsSchema>;
export type ListTaxonomyQuery = z.infer<typeof listTaxonomyQuerySchema>;
export type CreateTaxonomyInput = z.infer<typeof createTaxonomySchema>;
export type UpdateTaxonomyInput = z.infer<typeof updateTaxonomySchema>;
