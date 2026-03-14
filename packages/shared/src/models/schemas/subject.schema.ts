import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(255),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectDto = z.infer<typeof updateSubjectSchema>;
