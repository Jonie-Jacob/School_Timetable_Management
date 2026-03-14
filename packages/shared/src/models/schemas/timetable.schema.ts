import { z } from 'zod';

export const triggerGenerationSchema = z.object({
  divisionIds: z.array(z.string().uuid()).min(1),
  adjacencyConstraintEnabled: z.boolean().optional(),
});

export const overrideSlotSchema = z.object({
  divisionAssignmentId: z.string().uuid().nullable(),
});

export type TriggerGenerationDto = z.infer<typeof triggerGenerationSchema>;
export type OverrideSlotDto = z.infer<typeof overrideSlotSchema>;
