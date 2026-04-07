import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface Division {
  id: string;
  classId: string;
  label: string;
  streamName: string | null;
  periodStructureId: string | null;
  periodStructure?: {
    id: string;
    name: string;
  } | null;
  _count?: {
    divisionAssignments: number;
  };
  timetable?: {
    id: string;
    status: string;
  } | null;
}

export interface ClassItem {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  sortOrder: number;
  requiresStream: boolean;
  divisions: Division[];
  createdAt: string;
  updatedAt: string;
}

interface ClassListResponse {
  data: ClassItem[];
}

interface CreateClassRequest {
  name: string;
  sortOrder?: number;
  requiresStream?: boolean;
}

interface UpdateClassRequest {
  id: string;
  name?: string;
  sortOrder?: number;
  requiresStream?: boolean;
}

interface CreateDivisionRequest {
  classId: string;
  label: string;
  streamName?: string | null;
}

interface UpdateDivisionRequest {
  classId: string;
  divisionId: string;
  label?: string;
  streamName?: string | null;
}

interface DeleteDivisionRequest {
  classId: string;
  divisionId: string;
}

export const classApi = createApi({
  reducerPath: 'classApi',
  baseQuery,
  tagTypes: ['Class'],
  endpoints: (builder) => ({
    getClasses: builder.query<ClassItem[], void>({
      query: () => '/classes',
      transformResponse: (response: { data: ClassItem[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Class' as const, id })),
              { type: 'Class', id: 'LIST' },
            ]
          : [{ type: 'Class', id: 'LIST' }],
    }),

    getClass: builder.query<ClassItem, string>({
      query: (id) => `/classes/${id}`,
      transformResponse: (response: { data: ClassItem }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Class', id }],
    }),

    createClass: builder.mutation<ClassItem, CreateClassRequest>({
      query: (body) => ({
        url: '/classes',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: ClassItem }) => response.data,
      invalidatesTags: [{ type: 'Class', id: 'LIST' }],
    }),

    updateClass: builder.mutation<ClassItem, UpdateClassRequest>({
      query: ({ id, ...body }) => ({
        url: `/classes/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: ClassItem }) => response.data,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Class', id },
        { type: 'Class', id: 'LIST' },
      ],
    }),

    deleteClass: builder.mutation<void, string>({
      query: (id) => ({
        url: `/classes/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Class', id: 'LIST' }],
    }),

    addDivision: builder.mutation<Division, CreateDivisionRequest>({
      query: ({ classId, ...body }) => ({
        url: `/classes/${classId}/divisions`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: Division }) => response.data,
      invalidatesTags: (_result, _error, { classId }) => [
        { type: 'Class', id: classId },
        { type: 'Class', id: 'LIST' },
      ],
    }),

    updateDivision: builder.mutation<Division, UpdateDivisionRequest>({
      query: ({ classId, divisionId, ...body }) => ({
        url: `/classes/${classId}/divisions/${divisionId}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Division }) => response.data,
      invalidatesTags: (_result, _error, { classId }) => [
        { type: 'Class', id: classId },
        { type: 'Class', id: 'LIST' },
      ],
    }),

    deleteDivision: builder.mutation<void, DeleteDivisionRequest>({
      query: ({ classId, divisionId }) => ({
        url: `/classes/${classId}/divisions/${divisionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { classId }) => [
        { type: 'Class', id: classId },
        { type: 'Class', id: 'LIST' },
      ],
    }),
  }),
});

export const {
  useGetClassesQuery,
  useGetClassQuery,
  useCreateClassMutation,
  useUpdateClassMutation,
  useDeleteClassMutation,
  useAddDivisionMutation,
  useUpdateDivisionMutation,
  useDeleteDivisionMutation,
} = classApi;
