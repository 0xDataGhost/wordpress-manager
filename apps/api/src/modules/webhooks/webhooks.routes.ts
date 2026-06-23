import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authenticateConnector } from "../../middleware/authenticate-connector";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import {
  customerWebhookHandler,
  listWebhookEventsHandler,
  orderWebhookHandler,
  productWebhookHandler,
} from "./webhooks.controller";
import {
  customerWebhookSchema,
  listWebhookEventsQuerySchema,
  orderWebhookSchema,
  productWebhookSchema,
} from "./webhooks.schemas";

/**
 * Webhook endpoints, mounted under /wp/webhooks.
 *
 * The POST endpoints are connector-authenticated (the WordPress plugin sends its
 * API key — same mechanism as /wp/sync and /wp/products/sync) and tenant-scoped
 * to that key's store. The GET status endpoint is dashboard-authenticated (JWT,
 * settings.view) and scoped to the token's store.
 */
const router = Router();

router.post(
  "/products",
  authenticateConnector,
  validate({ body: productWebhookSchema }),
  asyncHandler(productWebhookHandler),
);
router.post(
  "/orders",
  authenticateConnector,
  validate({ body: orderWebhookSchema }),
  asyncHandler(orderWebhookHandler),
);
router.post(
  "/customers",
  authenticateConnector,
  validate({ body: customerWebhookSchema }),
  asyncHandler(customerWebhookHandler),
);

// Read-only status surface for the dashboard / debugging.
router.get(
  "/",
  authenticate,
  requirePermission("settings.view"),
  validate({ query: listWebhookEventsQuerySchema }),
  asyncHandler(listWebhookEventsHandler),
);

export default router;
