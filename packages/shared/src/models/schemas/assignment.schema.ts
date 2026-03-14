import { z } from 'zod';

export const createAssignmentSchema = z.object({
  subjectId: z.string().uuid(),
  teacherId: z.string().uuid(),
  assistantTeacherId: z.string().uuid().nullable().optional(),
  weightage: z.number().int().min(1),
  electiveGroupId: z.string().uuid().nullable().optional(),
});

export const updateAssignmentSchema = z.object({
  teacherId: z.string().uuid().optional(),
  assistantTeacherId: z.string().uuid().nullable().optional(),
  weightage: z.number().int().min(1).optional(),
});

export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;
