import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authenticateConnector } from "../../middleware/authenticate-connector";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { syncProductsHandler } from "../products/products.controller";
import { connectorSyncSchema } from "../products/products.schemas";
import {
  connectionStatus,
  wpConnect,
  wpDisconnect,
  wpVerify,
} from "./connections.controller";
import { wpConnectSchema } from "./connections.schemas";

const router = Router();

// Connector-authenticated endpoints (called by the WordPress plugin with its
// API key). No JWT — the key identifies and scopes the tenant.
router.post(
  "/connect",
  authenticateConnector,
  validate({ body: wpConnectSchema }),
  asyncHandler(wpConnect),
);
router.post("/verify", authenticateConnector, asyncHandler(wpVerify));
router.post("/disconnect", authenticateConnector, asyncHandler(wpDisconnect));

// Connector pushes its WooCommerce products to the SaaS catalog (upsert).
router.post(
  "/products/sync",
  authenticateConnector,
  validate({ body: connectorSyncSchema }),
  asyncHandler(syncProductsHandler),
);

// Dashboard-authenticated endpoint (JWT). Scoped to the token's store.
router.get(
  "/connection-status",
  authenticate,
  requirePermission("settings.view"),
  asyncHandler(connectionStatus),
);

export default router;
