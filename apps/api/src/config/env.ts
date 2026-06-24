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
  // Secret used to encrypt the connector API key at rest so the SaaS can sign
  // outbound requests to WordPress (product publish + WooCommerce pull sync).
  // Provide 32 bytes as 64 hex chars or base64. When unset, outbound delivery is
  // disabled and publish/sync return a clear "not configured" error. Optional so
  // the API still boots in environments that do not need outbound delivery.
  CONNECTOR_ENCRYPTION_KEY: z.string().min(1).optional(),
  // Timeout for outbound HTTP calls from the SaaS to a WordPress connector.
  WP_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // Page size used when pulling WooCommerce data during a manual sync.
  SYNC_PAGE_SIZE: z.coerce.number().int().min(1).max(100).default(50),
  // Safety cap on pages pulled per entity in one sync run (avoids unbounded loops).
  SYNC_MAX_PAGES: z.coerce.number().int().min(1).max(1000).default(200),
  // Dashboard analytics: Redis cache TTL (seconds) and the default low-stock
  // threshold (a product is "low stock" when active and stock <= threshold).
  DASHBOARD_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).default(300),
  DASHBOARD_LOW_STOCK_THRESHOLD: z.coerce.number().int().min(0).max(100000).default(5),
  // AI assistants (Phase 12.5). When OPENAI_API_KEY is unset the module falls
  // back to a deterministic mock provider, so the API still boots and the
  // assistants work end-to-end without external calls.
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
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

// Production startup guard: a wildcard CORS origin combined with
// `credentials: true` lets ANY website make credentialed requests on behalf of
// a logged-in user (the `cors` package reflects the request Origin rather than
// sending `*`). Refuse to boot in production with an open origin — set
// CORS_ORIGIN to an explicit comma-separated allowlist instead.
if (isProduction && env.CORS_ORIGIN === "*") {
  console.error(
    "Invalid configuration: CORS_ORIGIN must be an explicit origin allowlist in production (wildcard '*' is not allowed with credentialed requests).",
  );
  process.exit(1);
}

/** Allowed CORS origins resolved to a value the `cors` package understands. */
export const corsOrigin: true | string[] =
  env.CORS_ORIGIN === "*"
    ? true
    : env.CORS_ORIGIN.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
