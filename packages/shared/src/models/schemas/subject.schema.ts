import { z } from 'zod';

export const createSubjectSchema = z.object({
  name: z.string().min(1).max(255),
  abbreviation: z.string().max(10).optional().nullable(),
});

export const updateSubjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  abbreviation: z.string().max(10).optional().nullable(),
});

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectDto = z.infer<typeof updateSubjectSchema>;
