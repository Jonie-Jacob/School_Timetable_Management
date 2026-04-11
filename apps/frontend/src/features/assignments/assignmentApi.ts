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
  teacherId: string | null;
  assistantTeacherId: string | null;
  weightage: number;
  electiveGroupId: string | null;
  schedulingPreferences: SchedulingPreferences | null;
  subject: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  assistantTeacher: { id: string; name: string } | null;
  electiveGroup: { id: string; name: string; periodsPerWeek: number } | null;
}

interface CreateAssignmentRequest {
  divisionId: string;
  subjectId: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  weightage: number;
  electiveGroupId?: string | null;
  schedulingPreferences?: SchedulingPreferences | null;
}

interface CreateElectiveAssignmentRequest {
  divisionId: string;
  electiveGroupId: string;
  subjectId: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  weightage: number;
  schedulingPreferences?: SchedulingPreferences | null;
}

interface UpdateAssignmentRequest {
  id: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  weightage?: number;
  schedulingPreferences?: SchedulingPreferences | null;
}

export interface UnassignedTeacherSubject {
  teacherSubjectId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
}

export interface QuickAssignRequest {
  teacherId: string;
  subjectId: string;
  divisionId: string;
  weightage: number;
}

export interface QuickAssignResponse {
  assignment: Assignment;
  conflicts: Array<{ divisionId: string; divisionLabel: string; className: string }>;
}

export const assignmentApi = createApi({
  reducerPath: 'assignmentApi',
  baseQuery,
  tagTypes: ['Assignment', 'Unassigned'],
  endpoints: (builder) => ({
    getAssignments: builder.query<Assignment[], string>({
      query: (divisionId) => `divisions/${divisionId}/assignments`,
      transformResponse: (response: { data: Assignment[] }) => response.data,
      providesTags: (_result, _error, divisionId) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    createAssignment: builder.mutation<Assignment, CreateAssignmentRequest>({
      query: ({ divisionId, ...body }) => ({
        url: `divisions/${divisionId}/assignments`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: Assignment }) => response.data,
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    createElectiveAssignment: builder.mutation<Assignment, CreateElectiveAssignmentRequest>({
      query: ({ divisionId, ...body }) => ({
        url: `divisions/${divisionId}/assignments/elective`,
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
        url: `assignments/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Assignment }) => response.data,
      invalidatesTags: [{ type: 'Assignment', id: 'LIST' }],
    }),

    deleteAssignment: builder.mutation<void, { id: string; divisionId: string }>({
      query: ({ id }) => ({
        url: `assignments/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
        { type: 'Unassigned', id: 'LIST' },
      ],
    }),

    getUnassignedSubjects: builder.query<UnassignedTeacherSubject[], { classId?: string; subjectId?: string; teacherId?: string } | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.classId) searchParams.set('classId', params.classId);
        if (params?.subjectId) searchParams.set('subjectId', params.subjectId);
        if (params?.teacherId) searchParams.set('teacherId', params.teacherId);
        const qs = searchParams.toString();
        return `assignments/unassigned${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response: { data: UnassignedTeacherSubject[] }) => response.data,
      providesTags: [{ type: 'Unassigned', id: 'LIST' }],
    }),

    quickAssign: builder.mutation<QuickAssignResponse, QuickAssignRequest>({
      query: (body) => ({
        url: 'assignments/quick-assign',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: QuickAssignResponse }) => response.data,
      invalidatesTags: [
        { type: 'Assignment', id: 'LIST' },
        { type: 'Unassigned', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useCreateElectiveAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetUnassignedSubjectsQuery,
  useQuickAssignMutation,
} = assignmentApi;
