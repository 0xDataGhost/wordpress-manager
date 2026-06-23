import { z } from "zod";

/** Route params carrying an automation id. */
export const automationParamsSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Body for PATCH /automations/:id.
 *
 * Both fields are optional but at least one must be present. `config` is kept
 * loose here (a generic object) and validated against the automation's
 * type-specific schema in the service, where the row's type is known.
 */
export const updateAutomationSchema = z
  .object({
    enabled: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((body) => body.enabled !== undefined || body.config !== undefined, {
    message: "Provide at least one of: enabled, config",
  });

/**
 * Query for GET /automations/:id/logs. Pagination matches the other modules
 * (page ≥ 1, limit 1..100, default 20).
 */
export const listAutomationLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AutomationParams = z.infer<typeof automationParamsSchema>;
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>;
export type ListAutomationLogsQuery = z.infer<
  typeof listAutomationLogsQuerySchema
>;
