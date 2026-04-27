import { z } from 'zod';

export const schedulingPreferencesSchema = z.object({
  constraintType: z.enum(['HARD', 'SOFT']),
  preferredDays: z.array(z.number().min(0).max(6)).optional(),
  excludedDays: z.array(z.number().min(0).max(6)).optional(),
  preferredPeriodRange: z.object({ min: z.number().min(1), max: z.number().min(1) }).optional(),
  excludedPeriodRange: z.object({ min: z.number().min(1), max: z.number().min(1) }).optional(),
  preferAdjacentPeriods: z.boolean().optional(),
  maxPeriodsPerDay: z.number().min(1).optional(),
  minPeriodsPerDay: z.number().min(1).optional(),
}).optional().nullable();

export const createAssignmentSchema = z.object({
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid().nullable().optional(),
  assistantTeacherId: z.string().uuid().nullable().optional(),
  weightage: z.number().int().min(1),
  electiveGroupId: z.string().uuid().nullable().optional(),
  schedulingPreferences: schedulingPreferencesSchema,
});

export const updateAssignmentSchema = z.object({
  teacherId: z.string().uuid().nullable().optional(),
  assistantTeacherId: z.string().uuid().nullable().optional(),
  weightage: z.number().int().min(1).optional(),
  schedulingPreferences: schedulingPreferencesSchema,
});

export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;
