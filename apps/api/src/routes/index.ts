import { Router } from "express";
import { successResponse } from "../lib/api-response";
import { env } from "../config/env";
import authRoutes from "../modules/auth/auth.routes";
import productRoutes from "../modules/products/products.routes";
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
router.use("/orders", orderRoutes);
router.use("/customers", customerRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/notifications", notificationRoutes);
router.use("/automations", automationRoutes);
router.use("/settings", settingsRoutes);
router.use("/ai", aiRoutes);
router.use("/sync", syncRoutes);
router.use("/audit-logs", auditLogRoutes);
router.use("/wp", wpRoutes);

export default router;
