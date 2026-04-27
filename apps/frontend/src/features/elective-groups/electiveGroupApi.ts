import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface ElectiveGroupSubject {
  id: string;
  subjectId: string;
  parallelSections: number;
  subject: {
    id: string;
    name: string;
  };
}

export interface ElectiveGroup {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  periodsPerWeek: number;
  subjects: ElectiveGroupSubject[];
  _count?: {
    divisionAssignments: number;
  };
  createdAt: string;
  updatedAt: string;
}

export const electiveGroupApi = createApi({
  reducerPath: 'electiveGroupApi',
  baseQuery,
  tagTypes: ['ElectiveGroup'],
  endpoints: (builder) => ({
    getElectiveGroups: builder.query<ElectiveGroup[], void>({
      query: () => 'elective-groups',
      transformResponse: (response: { data: ElectiveGroup[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'ElectiveGroup' as const, id })),
              { type: 'ElectiveGroup', id: 'LIST' },
            ]
          : [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    createElectiveGroup: builder.mutation<ElectiveGroup, { name: string; periodsPerWeek: number }>({
      query: (body) => ({ url: 'elective-groups', method: 'POST', body }),
      transformResponse: (response: { data: ElectiveGroup }) => response.data,
      invalidatesTags: [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    updateElectiveGroup: builder.mutation<ElectiveGroup, { id: string; name?: string; periodsPerWeek?: number }>({
      query: ({ id, ...body }) => ({ url: `elective-groups/${id}`, method: 'PUT', body }),
      transformResponse: (response: { data: ElectiveGroup }) => response.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: 'ElectiveGroup', id }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),

    deleteElectiveGroup: builder.mutation<void, string>({
      query: (id) => ({ url: `elective-groups/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    addElectiveSubject: builder.mutation<void, { groupId: string; subjectId: string; parallelSections: number }>({
      query: ({ groupId, subjectId, parallelSections }) => ({
        url: `elective-groups/${groupId}/subjects`,
        method: 'POST',
        body: { subjectId, parallelSections },
      }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'ElectiveGroup', id: groupId }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),

    updateElectiveSubject: builder.mutation<void, { groupId: string; subjectId: string; parallelSections: number }>({
      query: ({ groupId, subjectId, parallelSections }) => ({
        url: `elective-groups/${groupId}/subjects/${subjectId}`,
        method: 'PUT',
        body: { parallelSections },
      }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'ElectiveGroup', id: groupId }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),

    removeElectiveSubject: builder.mutation<void, { groupId: string; subjectId: string }>({
      query: ({ groupId, subjectId }) => ({
        url: `elective-groups/${groupId}/subjects/${subjectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'ElectiveGroup', id: groupId }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),

    // ── Grouped endpoints for unified modal ──

    getGroupedElectiveGroups: builder.query<GroupedElectiveGroup[], void>({
      query: () => 'elective-groups/grouped',
      transformResponse: (response: { data: GroupedElectiveGroup[] }) => response.data,
      providesTags: [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    bulkSaveElectiveGroup: builder.mutation<BulkSaveResponse, BulkSaveRequest>({
      query: (body) => ({ url: 'elective-groups/bulk-save', method: 'POST', body }),
      transformResponse: (response: { data: BulkSaveResponse }) => response.data,
      invalidatesTags: [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),
  }),
});

// ── Grouped elective types ──

export interface GroupedTeacherAssignment {
  teacherId: string | null;
  teacherName: string | null;
  assistantTeacherId: string | null;
  assistantTeacherName: string | null;
  weightage: number;
}

export interface GroupedSubject {
  subjectId: string;
  subjectName: string;
  subjectAbbreviation: string | null;
  parallelSections: number;
  teachers: GroupedTeacherAssignment[];
}

export interface GroupedDivision {
  divisionId: string;
  classId: string;
  className: string;
  classSortOrder: number;
  divisionLabel: string;
  subjectIds: string[];
  schedulingPreferences: any;
}

export interface GroupedElectiveGroup {
  displayName: string;
  type: 'per-division' | 'cross-division';
  underlyingGroupIds: string[];
  config: { name: string; periodsPerWeek: number };
  subjects: GroupedSubject[];
  divisions: GroupedDivision[];
  defaultSchedulingPreferences: any;
}

export interface BulkSaveRequest {
  groupId: string | null;
  config: { name: string; periodsPerWeek: number; type: 'per-division' | 'cross-division' };
  subjects: Array<{
    subjectId: string;
    parallelSections: number;
    teachers: Array<{
      teacherId: string | null;
      assistantTeacherId: string | null;
      weightage: number;
    }>;
  }>;
  divisionParticipation: Record<string, string[]>;
  defaultSchedulingPreferences: any;
  perDivisionOverrides: Record<string, any>;
  confirmDeleteSlots: boolean;
}

export interface BulkSaveResponse {
  groupIds: string[];
  divisionsAffected: number;
}

export const {
  useGetElectiveGroupsQuery,
  useGetGroupedElectiveGroupsQuery,
  useCreateElectiveGroupMutation,
  useUpdateElectiveGroupMutation,
  useDeleteElectiveGroupMutation,
  useAddElectiveSubjectMutation,
  useUpdateElectiveSubjectMutation,
  useRemoveElectiveSubjectMutation,
  useBulkSaveElectiveGroupMutation,
} = electiveGroupApi;
