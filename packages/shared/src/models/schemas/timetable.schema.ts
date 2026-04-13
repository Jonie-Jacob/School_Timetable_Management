import { z } from 'zod';

export const triggerGenerationSchema = z.object({
  divisionIds: z.array(z.string().uuid()).min(1),
  adjacencyConstraintEnabled: z.boolean().optional(),
});

export const overrideSlotSchema = z.object({
  divisionAssignmentId: z.string().uuid().nullable(),
});

export const swapSlotsSchema = z.object({
  sourceSlotId: z.string().uuid(),
  targetSlotId: z.string().uuid(),
  force: z.boolean().optional(),
});

export const autoResolveSchema = z.object({
  conflictedSlotId: z.string().uuid(),
});

export type TriggerGenerationDto = z.infer<typeof triggerGenerationSchema>;
export type OverrideSlotDto = z.infer<typeof overrideSlotSchema>;
export type SwapSlotsDto = z.infer<typeof swapSlotsSchema>;
export type AutoResolveDto = z.infer<typeof autoResolveSchema>;
