import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface SchedulingPreferences {
  constraintType: 'HARD' | 'SOFT';
  preferredDays?: number[];
  excludedDays?: number[];
  preferredPeriodRange?: { min: number; max: number };
  excludedPeriodRange?: { min: number; max: number };
  preferAdjacentPeriods?: boolean;
  maxPeriodsPerDay?: number;
  minPeriodsPerDay?: number;
}

export interface Assignment {
  id: string;
  divisionId: string;
  subjectId: string;
  teacherId: string;
  assistantTeacherId: string | null;
  weightage: number;
  electiveGroupId: string | null;
  schedulingPreferences: SchedulingPreferences | null;
  subject: { id: string; name: string };
  teacher: { id: string; name: string };
  assistantTeacher: { id: string; name: string } | null;
  electiveGroup: { id: string; name: string } | null;
}

interface CreateAssignmentRequest {
  divisionId: string;
  subjectId: string;
  teacherId: string;
  assistantTeacherId?: string | null;
  weightage: number;
  electiveGroupId?: string | null;
  schedulingPreferences?: SchedulingPreferences | null;
}

interface UpdateAssignmentRequest {
  id: string;
  teacherId?: string;
  assistantTeacherId?: string | null;
  weightage?: number;
  schedulingPreferences?: SchedulingPreferences | null;
}

export const assignmentApi = createApi({
  reducerPath: 'assignmentApi',
  baseQuery,
  tagTypes: ['Assignment'],
  endpoints: (builder) => ({
    getAssignments: builder.query<Assignment[], string>({
      query: (divisionId) => `/divisions/${divisionId}/assignments`,
      transformResponse: (response: { data: Assignment[] }) => response.data,
      providesTags: (_result, _error, divisionId) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    createAssignment: builder.mutation<Assignment, CreateAssignmentRequest>({
      query: ({ divisionId, ...body }) => ({
        url: `/divisions/${divisionId}/assignments`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: Assignment }) => response.data,
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    updateAssignment: builder.mutation<Assignment, UpdateAssignmentRequest>({
      query: ({ id, ...body }) => ({
        url: `/assignments/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Assignment }) => response.data,
      invalidatesTags: [{ type: 'Assignment', id: 'LIST' }],
    }),

    deleteAssignment: builder.mutation<void, { id: string; divisionId: string }>({
      query: ({ id }) => ({
        url: `/assignments/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
} = assignmentApi;
