import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface Subject {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface SubjectListResponse {
  data: Subject[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface SubjectListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

interface CreateSubjectRequest {
  name: string;
}

interface UpdateSubjectRequest {
  id: string;
  name: string;
}

interface DeleteSubjectRequest {
  id: string;
  confirm?: boolean;
}

export const subjectApi = createApi({
  reducerPath: 'subjectApi',
  baseQuery,
  tagTypes: ['Subject'],
  endpoints: (builder) => ({
    getSubjects: builder.query<SubjectListResponse, SubjectListParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
        if (params?.search) searchParams.set('search', params.search);
        const qs = searchParams.toString();
        return `/subjects${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response: { data: Subject[]; meta: SubjectListResponse['meta'] }) => response,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'Subject' as const, id })),
              { type: 'Subject', id: 'LIST' },
            ]
          : [{ type: 'Subject', id: 'LIST' }],
    }),

    getSubject: builder.query<Subject, string>({
      query: (id) => `/subjects/${id}`,
      transformResponse: (response: { data: Subject }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Subject', id }],
    }),

    createSubject: builder.mutation<Subject, CreateSubjectRequest>({
      query: (body) => ({
        url: '/subjects',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: Subject }) => response.data,
      invalidatesTags: [{ type: 'Subject', id: 'LIST' }],
    }),

    updateSubject: builder.mutation<Subject, UpdateSubjectRequest>({
      query: ({ id, ...body }) => ({
        url: `/subjects/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Subject }) => response.data,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Subject', id },
        { type: 'Subject', id: 'LIST' },
      ],
    }),

    deleteSubject: builder.mutation<void, DeleteSubjectRequest>({
      query: ({ id, confirm }) => ({
        url: `/subjects/${id}${confirm ? '?confirm=true' : ''}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Subject', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetSubjectsQuery,
  useGetSubjectQuery,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useDeleteSubjectMutation,
} = subjectApi;
