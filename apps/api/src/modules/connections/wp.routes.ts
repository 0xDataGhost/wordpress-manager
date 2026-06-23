import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { authenticateConnector } from "../../middleware/authenticate-connector";
import { requirePermission } from "../../middleware/authorize";
import { validate } from "../../middleware/validate";
import { syncProductsHandler } from "../products/products.controller";
import { connectorSyncSchema } from "../products/products.schemas";
import { wpTriggerSyncHandler } from "../sync/sync.controller";
import { wpSyncTriggerSchema } from "../sync/sync.schemas";
import webhookRoutes from "../webhooks/webhooks.routes";
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

// Connector's "Manual Sync" button asks the SaaS to pull WooCommerce data. The
// SaaS owns the sync logic; the plugin only triggers it (thin connector).
router.post(
  "/sync",
  authenticateConnector,
  validate({ body: wpSyncTriggerSchema }),
  asyncHandler(wpTriggerSyncHandler),
);

// Real-time incremental sync. Connector-authenticated POST endpoints
// (/webhooks/products|orders|customers) plus a JWT status endpoint live here.
router.use("/webhooks", webhookRoutes);

// Dashboard-authenticated endpoint (JWT). Scoped to the token's store.
router.get(
  "/connection-status",
  authenticate,
  requirePermission("settings.view"),
  asyncHandler(connectionStatus),
);

export default router;
