import { z } from "zod";
import {
  AUDIT_ACTION_VALUES,
  AUDIT_ENTITY_TYPE_VALUES,
} from "../../db/schema/audit-logs";

// z.enum needs a non-empty string tuple; the canonical lists are never empty.
const actionEnum = z.enum(
  AUDIT_ACTION_VALUES as [string, ...string[]],
);
const entityTypeEnum = z.enum(
  AUDIT_ENTITY_TYPE_VALUES as [string, ...string[]],
);

/**
 * Query for GET /audit-logs.
 *
 * All filters are optional and combine with the mandatory tenant scope. `action`
 * and `entityType` are constrained to the canonical catalogs. `userId` filters
 * by the acting user. `dateFrom`/`dateTo` filter on `created_at` as inclusive
 * `YYYY-MM-DD` bounds (dateTo covers the whole calendar day). Pagination matches
 * the other modules (page ≥ 1, limit 1..100, default 20).
 */
export const listAuditLogsQuerySchema = z
  .object({
    action: actionEnum.optional(),
    entityType: entityTypeEnum.optional(),
    userId: z.string().uuid().optional(),
    // Inclusive date bounds (YYYY-MM-DD). dateTo covers the whole day.
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (data) =>
      !data.dateFrom ||
      !data.dateTo ||
      data.dateFrom.getTime() <= data.dateTo.getTime(),
    { message: "dateFrom must be on or before dateTo", path: ["dateFrom"] },
  );

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
