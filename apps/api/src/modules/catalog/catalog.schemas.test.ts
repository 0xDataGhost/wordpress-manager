import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bulkUpdateProductsSchema,
  createMediaSchema,
  variationSchema,
} from "./product-write.schemas";
import {
  createTaxonomySchema,
  taxonomySlugToKind,
} from "./catalog.schemas";

test("taxonomySlugToKind maps the URL slugs to kinds", () => {
  assert.equal(taxonomySlugToKind("categories"), "category");
  assert.equal(taxonomySlugToKind("tags"), "tag");
  assert.equal(taxonomySlugToKind("attributes"), "attribute");
});

test("createTaxonomySchema requires a name and bounds fields", () => {
  assert.equal(createTaxonomySchema.parse({ name: "ألعاب" }).name, "ألعاب");
  assert.equal(createTaxonomySchema.safeParse({}).success, false);
  assert.equal(createTaxonomySchema.safeParse({ name: "" }).success, false);
});

test("bulkUpdateProductsSchema bounds the batch to 50 items", () => {
  const one = bulkUpdateProductsSchema.parse({
    items: [{ wpProductId: 1, regularPrice: 9.99 }],
  });
  assert.equal(one.items.length, 1);
  assert.equal(bulkUpdateProductsSchema.safeParse({ items: [] }).success, false);
  const tooMany = {
    items: Array.from({ length: 51 }, (_, i) => ({ wpProductId: i + 1 })),
  };
  assert.equal(bulkUpdateProductsSchema.safeParse(tooMany).success, false);
});

test("createMediaSchema requires a valid URL", () => {
  assert.equal(
    createMediaSchema.parse({ sourceUrl: "https://cdn.example.com/a.jpg" }).asFeatured,
    false,
  );
  assert.equal(createMediaSchema.safeParse({ sourceUrl: "not-a-url" }).success, false);
});

test("variationSchema accepts a partial variation", () => {
  const parsed = variationSchema.parse({
    regularPrice: 100,
    attributes: { اللون: "أحمر" },
  });
  assert.equal(parsed.regularPrice, 100);
  assert.deepEqual(parsed.attributes, { اللون: "أحمر" });
});
