import { z } from 'zod';

export const createElectiveGroupSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateElectiveGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export const addElectiveSubjectSchema = z.object({
  subjectId: z.string().uuid(),
});

export type CreateElectiveGroupDto = z.infer<typeof createElectiveGroupSchema>;
export type UpdateElectiveGroupDto = z.infer<typeof updateElectiveGroupSchema>;
export type AddElectiveSubjectDto = z.infer<typeof addElectiveSubjectSchema>;
