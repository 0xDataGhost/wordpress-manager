import { z } from "zod";

export const createStoreSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export type CreateStoreInput = z.infer<typeof createStoreSchema>;
