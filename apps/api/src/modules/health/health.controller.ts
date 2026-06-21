import type { Request, Response } from "express";
import { getHealthReport } from "./health.service";
import { errorResponse, successResponse } from "../../lib/api-response";

/**
 * Liveness probe — confirms the process is up and serving. Does not touch
 * external dependencies, so it stays fast and never flaps.
 */
export function liveness(_req: Request, res: Response): void {
  res.status(200).json(
    successResponse(
      { status: "alive", uptimeSeconds: Math.floor(process.uptime()) },
      "Service is alive",
    ),
  );
}

/**
 * Readiness/health probe — verifies PostgreSQL, Redis and the BullMQ
 * connection. Returns 200 when everything is up, 503 when degraded.
 */
export async function health(_req: Request, res: Response): Promise<void> {
  const report = await getHealthReport();

  if (report.status === "healthy") {
    res.status(200).json(successResponse(report, "Service healthy"));
    return;
  }

  res
    .status(503)
    .json(
      errorResponse(
        "SERVICE_UNAVAILABLE",
        "One or more dependencies are unhealthy",
        report,
      ),
    );
}
