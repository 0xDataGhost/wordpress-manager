# Phase 26 — Full Catalog Control: Wire Contract

> Shared contract between the WordPress connector (plugins/wordpress-connector)
> and the SaaS API (apps/api). Both sides implement EXACTLY these shapes.
> Follows the Phase 25 foundation: every mutation is HMAC-signed, carries
> X-Saas-Command-Id + X-Saas-Idempotency-Key (generic idempotency wrapper),
> supports X-Saas-Expected-Version compare-and-set where noted, and echoes
> suppress via origin command id. Envelope: { success, data, message }.

## 1. Connector endpoints (namespace saas/v1)

### Variations
- `GET /products/{id}/variations` → data: { items: VariationData[] }
- `POST /products/{id}/variations` body VariationWrite → data: VariationData (201)
- `PUT /products/{id}/variations/{vid}` body VariationWrite (partial) → data: VariationData
  - compare-and-set against the VARIATION's date_modified
- `DELETE /products/{id}/variations/{vid}` → data: { wpVariationId, deleted: true }

VariationData = {
  wpVariationId: int, wpProductId: int, attributes: { [taxonomyOrName: string]: string },
  regularPrice: string, salePrice: string|null, stockQuantity: int|null,
  manageStock: bool, status: "publish"|"private", sku: string|null,
  imageId: int|null, entityVersion: string
}
VariationWrite = { attributes?, regularPrice?, salePrice?|null, stockQuantity?,
  manageStock?, status?, sku?, imageId? } (only present fields applied)

Parent product must be (or becomes) type "variable": POST on a simple product
with variations support converts it ONLY when body has `attributes` and parent
was explicitly marked — NO implicit conversion; instead:

### Product type & attributes (extends existing PUT /products/{id})
The existing product update payload gains optional fields:
- `type`: "simple" | "variable" (switching applies WC_Product_Variable/Simple)
- `attributes`: [{ name: string, options: string[], variation: bool, visible: bool }]
  (mapped to WC_Product_Attribute set; for pa_* global attributes `name` is the
  taxonomy slug and options are term slugs/names — connector resolves/creates ter