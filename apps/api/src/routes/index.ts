import { Router } from "express";
import { successResponse } from "../lib/api-response";
import { env } from "../config/env";
import authRoutes from "../modules/auth/auth.routes";
import roleRoutes from "../modules/roles/roles.routes";
import storeRoutes from "../modules/stores/stores.routes";

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

export default router;
