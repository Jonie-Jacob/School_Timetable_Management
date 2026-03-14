import { z } from 'zod';

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const slotEntrySchema = z.object({
  order: z.number().int().min(1),
  type: z.enum(['PERIOD', 'INTERVAL', 'LUNCH_BREAK']),
  startTime: z.string().regex(timeRegex, 'Must be HH:mm'),
  endTime: z.string().regex(timeRegex, 'Must be HH:mm'),
  label: z.string().min(1).max(100),
});

export const createPeriodStructureSchema = z.object({
  name: z.string().min(1).max(255),
  periods: z.array(slotEntrySchema).min(1),
});

export const updatePeriodStructureSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  periods: z.array(slotEntrySchema).min(1).optional(),
});

export const assignPeriodStructureSchema = z.object({
  classIds: z.array(z.string().uuid()).min(1),
});

export const setWorkingDaysSchema = z.object({
  days: z.array(z.enum(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'])).min(1),
});

export type CreatePeriodStructureDto = z.infer<typeof createPeriodStructureSchema>;
export type UpdatePeriodStructureDto = z.infer<typeof updatePeriodStructureSchema>;
export type AssignPeriodStructureDto = z.infer<typeof assignPeriodStructureSchema>;
export type SetWorkingDaysDto = z.infer<typeof setWorkingDaysSchema>;
export type SlotEntry = z.infer<typeof slotEntrySchema>;
