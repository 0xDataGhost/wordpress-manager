import type { Request, Response } from "express";
import { successResponse } from "../../lib/api-response";
import { NotFoundError } from "../../lib/errors";
import { getAuth } from "../../middleware/authenticate";
import { getConnector } from "../../middleware/authenticate-connector";
import { toProductDto } from "./products.serializer";
import {
  archiveProduct,
  createProduct,
  getProductById,
  listProducts,
  publishProductToWp,
  updateProduct,
  upsertProductsFromConnector,
} from "./products.service";
import type {
  ConnectorSyncInput,
  CreateProductInput,
  ListProductsQuery,
  ProductParams,
  UpdateProductInput,
} from "./products.schemas";

/** GET /products — list the current store's products (products.view). */
export async function listProductsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const query = req.query as unknown as ListProductsQuery;
  const result = await listProducts(storeId, query);

  res.status(200).json(
    successResponse(
      {
        items: result.items.map(toProductDto),
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

/** GET /products/:id — fetch one product (products.view). */
export async function getProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as ProductParams;
  const product = await getProductById(storeId, id);
  if (!product) {
    throw new NotFoundError("Product not found");
  }
  res.status(200).json(successResponse(toProductDto(product), ""));
}

/** POST /products — create a product (products.create). */
export async function createProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const input = req.body as CreateProductInput;
  const product = await createProduct(storeId, input);
  res
    .status(201)
    .json(successResponse(toProductDto(product), "Product created"));
}

/** PATCH /products/:id — update a product (products.edit). */
export async function updateProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as ProductParams;
  const input = req.body as UpdateProductInput;
  const product = await updateProduct(storeId, id, input);
  res
    .status(200)
    .json(successResponse(toProductDto(product), "Product updated"));
}

/** DELETE /products/:id — archive a product (products.delete). */
export async function deleteProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as ProductParams;
  const product = await archiveProduct(storeId, id);
  res
    .status(200)
    .json(successResponse(toProductDto(product), "Product archived"));
}

/** POST /products/:id/publish — deliver the product to WooCommerce (products.edit). */
export async function publishProductHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getAuth(req);
  const { id } = req.params as ProductParams;
  const result = await publishProductToWp(storeId, id);

  res.status(200).json(
    successResponse(
      {
        product: toProductDto(result.product),
        connectionStatus: result.connectionStatus,
        wpProductId: result.wpProductId,
        dispatched: result.dispatched,
      },
      "Product published to WooCommerce",
    ),
  );
}

/** POST /wp/products/sync — connector-authenticated upsert from WordPress. */
export async function syncProductsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const { storeId } = getConnector(req);
  const { products: incoming } = req.body as ConnectorSyncInput;
  const result = await upsertProductsFromConnector(storeId, incoming);
  res.status(200).json(successResponse(result, "Products synced"));
}
