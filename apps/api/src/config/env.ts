import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().min(1).default("0.0.0.0"),
  API_PREFIX: z.string().startsWith("/").default("/api/v1"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.string().min(1).default("*"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_EXPIRES_IN: z.string().min(1).default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("7d"),
  // Redis-backed fixed-window rate limiting for the auth endpoints. The window
  // and max are shared across login/register/refresh, each with its own bucket.
  AUTH_RATE_LIMIT_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Logger depends on env, so we fail fast with console before it exists.
  console.error(
    "Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";

/** Allowed CORS origins resolved to a value the `cors` package understands. */
export const corsOrigin: true | string[] =
  env.CORS_ORIGIN === "*"
    ? true
    : env.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
