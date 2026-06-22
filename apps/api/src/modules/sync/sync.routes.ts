import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { authenticate } from "../../middleware/authenticate";
import { requirePermission } from "../../middleware/authorize";
import {
  syncAllHandler,
  syncCustomersHandler,
  syncOrdersHandler,
  syncProductsHandler,
  syncStatusHandler,
} from "./sync.controller";

/**
 * Manual WooCommerce sync endpoints. All are JWT-authenticated and tenant-scoped
 * to the token's store. Triggering a sync mutates store data, so it requires
 * settings.edit; reading status only requires settings.view.
 */
const router = Router();

// POST /sync/products | /orders | /customers | /all — run a manual sync.
router.post(
  "/products",
  authenticate,
  requirePermission("settings.edit"),
  asyncHandler(syncProductsHandler),
);
router.post(
  "/orders",
  authenticate,
  requirePermission("settings.edit"),
  asyncHandler(syncOrdersHandler),
);
router.post(
  "/customers",
  authenticate,
  requirePermission("settings.edit"),
  asyncHandler(syncCustomersHandler),
);
router.post(
  "/all",
  authenticate,
  requirePermission("settings.edit"),
  asyncHandler(syncAllHandler),
);

// GET /sync/status — recent sync jobs for the store.
router.get(
  "/status",
  authenticate,
  requirePermission("settings.view"),
  asyncHandler(syncStatusHandler),
);

export default router;
