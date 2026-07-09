import { Router } from "express";
import { successResponse } from "../lib/api-response";
import { env } from "../config/env";
import authRoutes from "../modules/auth/auth.routes";
import productRoutes from "../modules/products/products.routes";
import digitalProductRoutes from "../modules/digital-products/digital-products.routes";
import orderRoutes from "../modules/orders/orders.routes";
import customerRoutes from "../modules/customers/customers.routes";
import dashboardRoutes from "../modules/dashboard/dashboard.routes";
import notificationRoutes from "../modules/notifications/notifications.routes";
import automationRoutes from "../modules/automations/automations.routes";
import settingsRoutes from "../modules/settings/settings.routes";
import aiRoutes from "../modules/ai/ai.routes";
import roleRoutes from "../modules/roles/roles.routes";
import storeRoutes from "../modules/stores/stores.routes";
import wpRoutes from "../modules/connections/wp.routes";
import syncRoutes from "../modules/sync/sync.routes";
import auditLogRoutes from "../modules/audit-logs/audit-logs.routes";
import digitalInventoryRoutes from "../modules/digital-inventory/digital-inventory.routes";
import digitalDeliveryRoutes from "../modules/digital-delivery/digital-delivery.routes";
import supplierRoutes from "../modules/suppliers/suppliers.routes";
import digitalReportRoutes from "../modules/digital-reports/digital-reports.routes";
import customerAccessRoutes from "../modules/customer-access/customer-access.routes";
import wpCommandRoutes from "../modules/wp-commands/wp-commands.routes";
import catalogRoutes from "../modules/catalog/catalog.routes";
import couponRoutes from "../modules/coupons/coupons.routes";
import reviewRoutes from "../modules/reviews/reviews.routes";
import storeConfigRoutes from "../modules/store-config/store-config.routes";
import reconciliationRoutes from "../modules/reconciliation/reconciliation.routes";

/**
 * Root API router, mounted under env.API_PREFIX (default /api/v1).
 * Business module routers are mounted here.
 */
const router = Router();

router.get("/", (_req, res) => {
  res.json(
    successResponse(
      { name: "@saas/api", version: "0.1.0", prefix: env.API_PREFIX },
      "API is running",
    ),
  );
});

router.use("/auth", authRoutes);
router.use("/stores", storeRoutes);
router.use("/roles", roleRoutes);
router.use("/products", productRoutes);
// Phase 15 digital product settings: GET/PATCH /products/:id/digital-settings.
// Mounted after productRoutes; the products router has no GET /:id/<segment>
// route, so digital-settings requests fall through to this router.
router.use("/products", digitalProductRoutes);
router.use("/orders", orderRoutes);
router.use("/customers", customerRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/automations", automationRoutes);
router.use("/settings", settingsRoutes);
router.use("/ai", aiRoutes);
router.use("/sync", syncRoutes);
router.use("/audit-logs", auditLogRoutes);
router.use("/digital-inventory", digitalInventoryRoutes);
router.use("/digital-delivery", digitalDeliveryRoutes);
router.use("/suppliers", supplierRoutes);
router.use("/digital-reports", digitalReportRoutes);
// Phase 22: PUBLIC customer self-service portal. NO JWT — these routes are gated
// by a valid signed token in the body and are rate-limited. Mounted under /public
// so the no-auth surface is clearly isolated.
router.use("/public", customerAccessRoutes);
router.use("/wp", wpRoutes);
// Phase 25: the WordPress command outbox (Command Center).
router.use("/wp-commands", wpCommandRoutes);
// Phase 26: catalog control (taxonomies, variations, media, bulk, delete).
router.use("/catalog", catalogRoutes);
// Phase 28: coupons.
router.use("/coupons", couponRoutes);
// Phase 29: product review moderation.
router.use("/reviews", reviewRoutes);
// Phase 30: store configuration (settings, shipping, taxes, gateways).
router.use("/store-config", storeConfigRoutes);
// Phase 31: parity reconciliation (drift detection + self-heal).
router.use("/reconciliation", reconciliationRoutes);

export default router;
