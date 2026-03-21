import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface AcademicYear {
  id: string;
  schoolId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

interface AcademicYearListResponse {
  data: AcademicYear[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface CreateAcademicYearRequest {
  label: string;
  startDate: string;
  endDate: string;
}

export const academicYearApi = createApi({
  reducerPath: 'academicYearApi',
  baseQuery,
  tagTypes: ['AcademicYear'],
  endpoints: (builder) => ({
    getAcademicYears: builder.query<AcademicYearListResponse, { page?: number; pageSize?: number; search?: string } | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
        if (params?.search) searchParams.set('search', params.search);
        const qs = searchParams.toString();
        return `/academic-years${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response: { data: AcademicYear[]; meta: AcademicYearListResponse['meta'] }) => response,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'AcademicYear' as const, id })),
              { type: 'AcademicYear', id: 'LIST' },
            ]
          : [{ type: 'AcademicYear', id: 'LIST' }],
    }),

    createAcademicYear: builder.mutation<AcademicYear, CreateAcademicYearRequest>({
      query: (body) => ({
        url: '/academic-years',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: AcademicYear }) => response.data,
      invalidatesTags: [{ type: 'AcademicYear', id: 'LIST' }],
    }),

    activateAcademicYear: builder.mutation<AcademicYear, string>({
      query: (id) => ({
        url: `/academic-years/${id}/activate`,
        method: 'PATCH',
      }),
      transformResponse: (response: { data: AcademicYear }) => response.data,
      invalidatesTags: [{ type: 'AcademicYear', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetAcademicYearsQuery,
  useCreateAcademicYearMutation,
  useActivateAcademicYearMutation,
} = academicYearApi;
