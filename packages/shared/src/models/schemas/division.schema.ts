import { z } from 'zod';

export const createDivisionSchema = z.object({
  label: z.string().min(1).max(10),
  streamName: z.string().max(100).nullable().optional(),
});

export const updateDivisionSchema = z.object({
  label: z.string().min(1).max(10).optional(),
  streamName: z.string().max(100).nullable().optional(),
});

export type CreateDivisionDto = z.infer<typeof createDivisionSchema>;
export type UpdateDivisionDto = z.infer<typeof updateDivisionSchema>;
