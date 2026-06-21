import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
});

pool.on("error", (err) => {
  logger.error({ err }, "Unexpected PostgreSQL pool error");
});

export const db = drizzle(pool, { schema });

/** Lightweight connectivity probe used by startup checks and /health. */
export async function checkDatabaseConnection(): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
