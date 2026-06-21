import { checkDatabaseConnection } from "../../db";
import { checkRedisConnection } from "../../redis";
import { checkQueueConnection } from "../../queue/connection";

export interface DependencyStatus {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: "healthy" | "unhealthy";
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    database: DependencyStatus;
    redis: DependencyStatus;
    queue: DependencyStatus;
  };
}

async function probe(check: () => Promise<void>): Promise<DependencyStatus> {
  const start = Date.now();
  try {
    await check();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/** Probes every external dependency in parallel and aggregates the result. */
export async function getHealthReport(): Promise<HealthReport> {
  const [database, redis, queue] = await Promise.all([
    probe(checkDatabaseConnection),
    probe(checkRedisConnection),
    probe(checkQueueConnection),
  ]);

  const healthy = [database, redis, queue].every((d) => d.status === "up");

  return {
    status: healthy ? "healthy" : "unhealthy",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    dependencies: { database, redis, queue },
  };
}
