import { z } from 'zod';

export const createTeacherSchema = z.object({
  name: z.string().min(1).max(255),
  contact: z.string().nullable().optional(),
});

export const updateTeacherSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  contact: z.string().nullable().optional(),
});

export const setTeacherSubjectsSchema = z.object({
  subjectIds: z.array(z.string().uuid()),
});

export const setTeacherAvailabilitySchema = z.object({
  unavailableSlots: z.array(
    z.object({
      workingDayId: z.string().uuid(),
      slotId: z.string().uuid(),
    }),
  ),
});

export type CreateTeacherDto = z.infer<typeof createTeacherSchema>;
export type UpdateTeacherDto = z.infer<typeof updateTeacherSchema>;
export type SetTeacherSubjectsDto = z.infer<typeof setTeacherSubjectsSchema>;
export type SetTeacherAvailabilityDto = z.infer<typeof setTeacherAvailabilitySchema>;
