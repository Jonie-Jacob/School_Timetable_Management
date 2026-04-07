import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface ElectiveGroupSubject {
  id: string;
  subjectId: string;
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
  electiveGroupSubjects: ElectiveGroupSubject[];
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
      query: () => '/elective-groups',
      transformResponse: (response: { data: ElectiveGroup[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'ElectiveGroup' as const, id })),
              { type: 'ElectiveGroup', id: 'LIST' },
            ]
          : [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    createElectiveGroup: builder.mutation<ElectiveGroup, { name: string }>({
      query: (body) => ({ url: '/elective-groups', method: 'POST', body }),
      transformResponse: (response: { data: ElectiveGroup }) => response.data,
      invalidatesTags: [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    updateElectiveGroup: builder.mutation<ElectiveGroup, { id: string; name: string }>({
      query: ({ id, ...body }) => ({ url: `/elective-groups/${id}`, method: 'PUT', body }),
      transformResponse: (response: { data: ElectiveGroup }) => response.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: 'ElectiveGroup', id }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),

    deleteElectiveGroup: builder.mutation<void, string>({
      query: (id) => ({ url: `/elective-groups/${id}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ElectiveGroup', id: 'LIST' }],
    }),

    addElectiveSubject: builder.mutation<void, { groupId: string; subjectId: string }>({
      query: ({ groupId, subjectId }) => ({
        url: `/elective-groups/${groupId}/subjects`,
        method: 'POST',
        body: { subjectId },
      }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'ElectiveGroup', id: groupId }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),

    removeElectiveSubject: builder.mutation<void, { groupId: string; subjectId: string }>({
      query: ({ groupId, subjectId }) => ({
        url: `/elective-groups/${groupId}/subjects/${subjectId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { groupId }) => [{ type: 'ElectiveGroup', id: groupId }, { type: 'ElectiveGroup', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetElectiveGroupsQuery,
  useCreateElectiveGroupMutation,
  useUpdateElectiveGroupMutation,
  useDeleteElectiveGroupMutation,
  useAddElectiveSubjectMutation,
  useRemoveElectiveSubjectMutation,
} = electiveGroupApi;
