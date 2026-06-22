import type { Server } from "node:http";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { checkDatabaseConnection, closeDatabase } from "./db";
import { checkRedisConnection, closeRedis } from "./redis";
import { closeQueues } from "./queue";
import { registerQueues } from "./queue/queues";

/** Verifies critical dependencies before accepting traffic (fail fast). */
async function verifyDependencies(): Promise<void> {
  await checkDatabaseConnection();
  logger.info("PostgreSQL connection OK");
  await checkRedisConnection();
  logger.info("Redis connection OK");
}

function registerShutdown(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down...");

    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out; forcing exit");
      process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async () => {
      try {
        await closeQueues();
        await closeRedis();
        await closeDatabase();
        clearTimeout(forceExit);
        logger.info("Shutdown complete");
        process.exit(0);
      } catch (err) {
        logger.error({ err }, "Error during shutdown");
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    logger.error({ reason }, "Unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception");
    process.exit(1);
  });
}

async function bootstrap(): Promise<void> {
  try {
    await verifyDependencies();
  } catch (err) {
    logger.error({ err }, "Dependency check failed at startup");
    process.exit(1);
  }

  // Register the sync/publish queues as foundation (no workers consume them yet
  // in this phase; manual sync and publish run synchronously).
  registerQueues();

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(
      `API listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`,
    );
  });

  registerShutdown(server);
}

void bootstrap();
