import { z } from 'zod';

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

export type CreateElectiveGroupDto = z.infer<typeof createElectiveGroupSchema>;
export type UpdateElectiveGroupDto = z.infer<typeof updateElectiveGroupSchema>;
export type AddElectiveSubjectDto = z.infer<typeof addElectiveSubjectSchema>;
export type UpdateElectiveSubjectDto = z.infer<typeof updateElectiveSubjectSchema>;
