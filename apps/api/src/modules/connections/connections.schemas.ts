import { z } from "zod";

/**
 * Payload sent by the WordPress connector to /wp/connect after the user pastes
 * an API key and clicks "Connect". The connector is authenticated by its key;
 * this body only carries non-secret site metadata, which is still validated.
 */
export const wpConnectSchema = z.object({
  siteUrl: z.string().trim().url().max(2048),
  wpVersion: z.string().trim().max(32).optional(),
  wcVersion: z.string().trim().max(32).optional(),
  connectorVersion: z.string().trim().max(32).optional(),
  // Phase 25: capability slugs the connector supports (e.g. "product.update",
  // "capabilities"). Bounded and shape-validated; unknown slugs are stored
  // verbatim — the SaaS only ever checks membership.
  capabilities: z
    .array(z.string().trim().min(1).max(64))
    .max(200)
    .optional(),
});

export type WpConnectInput = z.infer<typeof wpConnectSchema>;
