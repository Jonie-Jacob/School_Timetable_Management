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

// ── Enhancement 4: Timetable-Aware Assignment Editing ─────────────────

/** POST /api/assignments/impact -- assess what resolution steps a recent change requires. */
export const getAssignmentImpactSchema = z.object({
  divisionId: z.string().uuid(),
  changeType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  assignmentId: z.string().uuid(),
  previousValues: z
    .object({
      teacherId: z.string().uuid().nullable().optional(),
      weightage: z.number().int().min(1).optional(),
    })
    .optional(),
  /** For DELETE flow: ids of timetable slots that were emptied by the delete. */
  freedSlotIds: z.array(z.string().uuid()).optional(),
});
export type GetAssignmentImpactDto = z.infer<typeof getAssignmentImpactSchema>;

/** POST /api/assignments/resolve-pw-balance -- bulk-update assignment weightages. */
export const resolvePwBalanceSchema = z.object({
  changes: z
    .array(
      z.object({
        assignmentId: z.string().uuid(),
        newWeightage: z.number().int().min(1),
      }),
    )
    .min(1),
});
export type ResolvePwBalanceDto = z.infer<typeof resolvePwBalanceSchema>;

/** POST /api/assignments/resolve-slot-removal -- clear timetable slots (set divisionAssignmentId to null). */
export const resolveSlotRemovalSchema = z.object({
  slotIds: z.array(z.string().uuid()).min(1),
});
export type ResolveSlotRemovalDto = z.infer<typeof resolveSlotRemovalSchema>;

/** POST /api/assignments/resolve-slot-fill -- point empty timetable slots at existing assignments. */
export const resolveSlotFillSchema = z.object({
  fills: z
    .array(
      z.object({
        timetableSlotId: z.string().uuid(),
        divisionAssignmentId: z.string().uuid(),
      }),
    )
    .min(1),
});
export type ResolveSlotFillDto = z.infer<typeof resolveSlotFillSchema>;
