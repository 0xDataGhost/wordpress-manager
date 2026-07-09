import { env } from "../../config/env";
import { logger } from "../../lib/logger";
import { ServiceUnavailableError } from "../../lib/errors";
import {
  decryptSecret,
  isOutboundEncryptionConfigured,
} from "../../lib/connector-crypto";
import { signatureHeaders } from "../../lib/connector-signature";
import type { StoreConnectionRow } from "../../db/schema/store-connections";

/** Namespace of the connector's REST routes on the WordPress site. */
const WP_NAMESPACE = "wp-json/saas/v1";

export interface WpRequestResult {
  ok: boolean;
  code: number;
  data: unknown;
  message: string;
}

/** HTTP verbs the connector's REST surface accepts. */
export type WpRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface WpRequestOptions {
  /**
   * Extra request headers (e.g. X-Saas-Command-Id / X-Saas-Idempotency-Key for
   * outbox commands). Headers are transport metadata — the HMAC signature keeps
   * covering "{timestamp}.{body}" exactly as before.
   */
  headers?: Record<string, string>;
}

/** Raised when a connection cannot be used for an outbound SaaS -> WP call. */
export class WpClientUnavailableError extends ServiceUnavailableError {}

/**
 * Returns the plaintext connector key for signing outbound requests, or throws a
 * clear, user-facing error explaining why outbound delivery is unavailable.
 * Never logs or returns the key anywhere else.
 */
function resolveSecret(connection: StoreConnectionRow): string {
  if (!isOutboundEncryptionConfigured()) {
    throw new WpClientUnavailableError(
      "Outbound delivery to WooCommerce is not configured on the server " +
        "(CONNECTOR_ENCRYPTION_KEY missing).",
    );
  }
  if (!connection.apiKeyCipher || !connection.apiKeyIv || !connection.apiKeyTag) {
    throw new WpClientUnavailableError(
      "This store's connector key predates outbound delivery. Re-generate the " +
        "API key from the dashboard and reconnect WordPress to enable it.",
    );
  }
  return decryptSecret({
    cipher: connection.apiKeyCipher,
    iv: connection.apiKeyIv,
    tag: connection.apiKeyTag,
  });
}

/** Private / loopback / link-local / CGNAT IPv4 ranges plus the cloud metadata IP. */
function isBlockedIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true; // private, loopback, "this"
  if (a === 169 && b === 254) return true; // link-local + 169.254.169.254 metadata
  if (a === 192 && b === 168) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT (100.64.0.0/10)
  return false;
}

/** Blocked IPv6 hosts: loopback, unspecified, unique-local (fc/fd), link-local (fe80). */
function isBlockedIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("::ffff:")) return true; // IPv4-mapped — avoid bypass
  return false;
}

/**
 * Rejects outbound targets that point at the SaaS host's own network (SSRF
 * defense at the egress point). Blocks non-http(s) schemes and private /
 * loopback / link-local / cloud-metadata addresses, so a malicious or
 * misconfigured connector cannot make the SaaS fetch internal resources.
 *
 * Residual risk: a public hostname that resolves (via DNS) to a private IP is
 * not caught here (would require resolve-and-pin). Documented as known debt;
 * production sites use public HTTPS hostnames.
 */
function assertSafeOutboundUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WpClientUnavailableError("Connected site URL is invalid.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new WpClientUnavailableError(
      "Connected site URL must use http(s).",
    );
  }
  const host = url.hostname.toLowerCase();
  const blockedHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "ip6-localhost";
  if (blockedHost || isBlockedIpv4(host) || isBlockedIpv6(host)) {
    throw new WpClientUnavailableError(
      "Connected site URL points to a disallowed (private/loopback) address.",
    );
  }
  return url;
}

/** Testable predicate: whether an outbound URL passes the SSRF egress checks. */
export function isOutboundUrlAllowed(rawUrl: string): boolean {
  try {
    assertSafeOutboundUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

/** Joins the stored site URL with a connector route path, after SSRF checks. */
function buildUrl(siteUrl: string, path: string): string {
  assertSafeOutboundUrl(siteUrl);
  const base = siteUrl.replace(/\/+$/, "");
  return `${base}/${WP_NAMESPACE}/${path.replace(/^\/+/, "")}`;
}

/**
 * Performs a signed request to the store's WordPress connector. `method` is GET
 * for pull-sync reads and POST/PUT for product publish. The body is signed with
 * the connector key exactly as the plugin expects. Returns a normalized result;
 * transport/JSON failures surface as ok:false with a message rather than throwing
 * (callers decide how to record them on the sync job).
 */
export async function wpRequest(
  connection: StoreConnectionRow,
  method: WpRequestMethod,
  path: string,
  body?: unknown,
  options: WpRequestOptions = {},
): Promise<WpRequestResult> {
  if (!connection.siteUrl) {
    return {
      ok: false,
      code: 0,
      data: null,
      message: "Store has no connected WordPress site URL.",
    };
  }

  // resolveSecret throws a typed, user-facing error — let it propagate so the
  // caller can return a precise 503 instead of a generic sync failure.
  const secret = resolveSecret(connection);

  const url = buildUrl(connection.siteUrl, path);
  const jsonBody = body === undefined ? "" : JSON.stringify(body);
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
    ...signatureHeaders(jsonBody, secret),
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : jsonBody,
      signal: AbortSignal.timeout(env.WP_HTTP_TIMEOUT_MS),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Request to WordPress failed.";
    logger.warn({ err, url, method }, "Outbound WordPress request failed");
    return { ok: false, code: 0, data: null, message };
  }

  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }

  const envelope = parsed as
    | { success?: boolean; data?: unknown; message?: string; error?: { message?: string } }
    | null;
  const ok =
    response.ok && !!envelope && typeof envelope === "object" && envelope.success === true;

  if (ok) {
    return {
      ok: true,
      code: response.status,
      data: envelope?.data ?? null,
      message: typeof envelope?.message === "string" ? envelope.message : "",
    };
  }

  const message =
    envelope?.error?.message ??
    (typeof envelope?.message === "string" ? envelope.message : undefined) ??
    `WordPress request failed with status ${response.status}.`;
  return { ok: false, code: response.status, data: null, message };
}
