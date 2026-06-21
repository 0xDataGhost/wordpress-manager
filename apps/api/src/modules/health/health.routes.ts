import { Router } from "express";
import { asyncHandler } from "../../lib/async-handler";
import { health, liveness } from "./health.controller";

const router = Router();

// GET /health        — full readiness check (DB + Redis + queue)
router.get("/", asyncHandler(health));
// GET /health/live   — pure liveness check
router.get("/live", liveness);

export default router;
