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

export const createEmptySlotSchema = z.object({
  timetableId: z.string().uuid(),
  workingDayId: z.string().uuid(),
  slotId: z.string().uuid(),
});

export const swapElectiveSlotsSchema = z.object({
  // Any one timetable_slot row ID from the source elective block
  sourceSlotId: z.string().uuid(),
  // Target coordinates (universal across all divisions/period structures)
  targetDayOfWeek: z.number().int().min(1).max(7),
  targetSlotSortOrder: z.number().int().min(0),
  // Force swap even with teacher conflicts
  force: z.boolean().optional(),
});

export const previewElectiveSwapSchema = z.object({
  sourceSlotId: z.string().uuid(),
  targetDayOfWeek: z.number().int().min(1).max(7),
  targetSlotSortOrder: z.number().int().min(0),
});

export type TriggerGenerationDto = z.infer<typeof triggerGenerationSchema>;
export type OverrideSlotDto = z.infer<typeof overrideSlotSchema>;
export type SwapSlotsDto = z.infer<typeof swapSlotsSchema>;
export type AutoResolveDto = z.infer<typeof autoResolveSchema>;
export type CreateEmptySlotDto = z.infer<typeof createEmptySlotSchema>;
export type SwapElectiveSlotsDto = z.infer<typeof swapElectiveSlotsSchema>;
export type PreviewElectiveSwapDto = z.infer<typeof previewElectiveSwapSchema>;
