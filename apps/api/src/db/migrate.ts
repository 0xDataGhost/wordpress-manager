import "dotenv/config";
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Standalone migration runner. Intentionally decoupled from the app runtime:
 * it only needs DATABASE_URL (no Redis/queue), so it is safe to run in CI
 * migration steps. Generate migrations first with `npm run db:generate`.
 */
const MIGRATIONS_FOLDER = "./drizzle";

async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required to run migrations");
    process.exit(1);
  }

  // Before any migration is generated there is no journal — nothing to apply.
  if (!existsSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`)) {
    console.log("No migrations found yet — nothing to apply.");
    return;
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  console.log("Running database migrations...");
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Database migrations complete.");
  } finally {
    await pool.end();
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Database migration failed:", err);
    process.exit(1);
  });
