import { Router } from "express";
import { successResponse } from "../lib/api-response";
import { env } from "../config/env";

/**
 * Root API router, mounted under env.API_PREFIX (default /api/v1).
 * Business module routers (auth, stores, products, ...) are mounted here
 * starting in Phase 3.
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

export default router;
