import { z } from 'zod';
import { schedulingPreferencesSchema } from './assignment.schema';

export const createElectiveGroupSchema = z.object({
  name: z.string().min(1).max(255),
  periodsPerWeek: z.number().int().min(1).max(50),
});

export const updateElectiveGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  periodsPerWeek: z.number().int().min(1).max(50).optional(),
});

export const addElectiveSubjectSchema = z.object({
  subjectId: z.string().uuid(),
  parallelSections: z.number().int().min(1).max(10),
});

export const updateElectiveSubjectSchema = z.object({
  parallelSections: z.number().int().min(1).max(10),
});

export const bulkSaveElectiveGroupSchema = z.object({
  /** null for create, first underlyingGroupId for edit */
  groupId: z.string().uuid().nullable(),
  config: z.object({
    name: z.string().min(1).max(255),
    periodsPerWeek: z.number().int().min(1).max(50),
    type: z.enum(['per-division', 'cross-division']),
  }),
  subjects: z.array(z.object({
    subjectId: z.string().uuid(),
    parallelSections: z.number().int().min(1).max(10),
    teachers: z.array(z.object({
      teacherId: z.string().uuid().nullable(),
      assistantTeacherId: z.string().uuid().nullable().optional(),
      weightage: z.number().int().min(1),
    })),
  })).min(1),
  /** divisionId → array of subjectIds that division participates in */
  divisionParticipation: z.record(z.string().uuid(), z.array(z.string().uuid())),
  defaultSchedulingPreferences: schedulingPreferencesSchema,
  /** divisionId → override preferences (null = use default) */
  perDivisionOverrides: z.record(z.string().uuid(), schedulingPreferencesSchema).default({}),
  /** If true, delete timetable_slots for removed divisions/assignments */
  confirmDeleteSlots: z.boolean().default(false),
});

export type CreateElectiveGroupDto = z.infer<typeof createElectiveGroupSchema>;
export type UpdateElectiveGroupDto = z.infer<typeof updateElectiveGroupSchema>;
export type AddElectiveSubjectDto = z.infer<typeof addElectiveSubjectSchema>;
export type UpdateElectiveSubjectDto = z.infer<typeof updateElectiveSubjectSchema>;
export type BulkSaveElectiveGroupDto = z.infer<typeof bulkSaveElectiveGroupSchema>;
