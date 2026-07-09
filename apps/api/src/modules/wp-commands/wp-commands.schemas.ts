import { z } from "zod";
import {
  WP_COMMAND_DOMAINS,
  WP_COMMAND_STATUSES,
} from "../../db/schema/wp-commands";

/** Query for GET /wp-commands (Command Center list). */
export const listWpCommandsQuerySchema = z.object({
  status: z.enum(WP_COMMAND_STATUSES).optional(),
  domain: z.enum(WP_COMMAND_DOMAINS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const wpCommandParamsSchema = z.object({
  id: z.string().uuid(),
});

export type ListWpCommandsQuery = z.infer<typeof listWpCommandsQuerySchema>;
export type WpCommandParams = z.infer<typeof wpCommandParamsSchema>;
