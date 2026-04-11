import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface TeacherSubject {
  id: string;
  subjectId: string;
  subject: {
    id: string;
    name: string;
  };
}

export interface TeacherAvailability {
  id: string;
  workingDayId: string;
  slotId: string;
  workingDay: {
    id: string;
    dayOfWeek: string;
  };
  slot: {
    id: string;
    label: string;
    startTime: string;
    endTime: string;
    type: string;
  };
}

export interface Teacher {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  contact: string | null;
  maxPeriodsPerWeek: number | null;
  createdAt: string;
  updatedAt: string;
  teacherSubjects?: TeacherSubject[];
  teacherAvailability?: TeacherAvailability[];
}

interface TeacherListResponse {
  data: Teacher[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface TeacherListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

interface CreateTeacherRequest {
  name: string;
  contact?: string | null;
  maxPeriodsPerWeek?: number | null;
}

interface UpdateTeacherRequest {
  id: string;
  name?: string;
  contact?: string | null;
  maxPeriodsPerWeek?: number | null;
}

interface SetTeacherSubjectsRequest {
  id: string;
  subjectIds: string[];
}

interface SetTeacherAvailabilityRequest {
  id: string;
  unavailableSlots: Array<{
    workingDayId: string;
    slotId: string;
  }>;
}

interface DeleteTeacherRequest {
  id: string;
  confirm?: boolean;
}

export interface TeacherLoad {
  id: string;
  name: string;
  maxPeriodsPerWeek: number | null;
  assignedPeriods: number;
  qualifiedSubjectIds: string[];
}

export interface TeacherSlotConflict {
  teacherId: string;
  teacherName: string;
  subjectName: string;
  className: string;
  divisionLabel: string;
}

interface ConflictQuery {
  workingDayId: string;
  slotId: string;
  excludeDivisionId?: string;
}

export const teacherApi = createApi({
  reducerPath: 'teacherApi',
  baseQuery,
  tagTypes: ['Teacher'],
  endpoints: (builder) => ({
    getTeachers: builder.query<TeacherListResponse, TeacherListParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
        if (params?.search) searchParams.set('search', params.search);
        const qs = searchParams.toString();
        return `teachers${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response: { data: Teacher[]; meta: TeacherListResponse['meta'] }) => response,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map(({ id }) => ({ type: 'Teacher' as const, id })),
              { type: 'Teacher', id: 'LIST' },
            ]
          : [{ type: 'Teacher', id: 'LIST' }],
    }),

    getTeacher: builder.query<Teacher, string>({
      query: (id) => `teachers/${id}`,
      transformResponse: (response: { data: Teacher }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'Teacher', id }],
    }),

    createTeacher: builder.mutation<Teacher, CreateTeacherRequest>({
      query: (body) => ({
        url: 'teachers',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: Teacher }) => response.data,
      invalidatesTags: [{ type: 'Teacher', id: 'LIST' }],
    }),

    updateTeacher: builder.mutation<Teacher, UpdateTeacherRequest>({
      query: ({ id, ...body }) => ({
        url: `teachers/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Teacher }) => response.data,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Teacher', id },
        { type: 'Teacher', id: 'LIST' },
      ],
    }),

    deleteTeacher: builder.mutation<void, DeleteTeacherRequest>({
      query: ({ id, confirm }) => ({
        url: `teachers/${id}${confirm ? '?confirm=true' : ''}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Teacher', id: 'LIST' }],
    }),

    setTeacherSubjects: builder.mutation<Teacher, SetTeacherSubjectsRequest>({
      query: ({ id, ...body }) => ({
        url: `teachers/${id}/subjects`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Teacher }) => response.data,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Teacher', id },
        { type: 'Teacher', id: 'LIST' },
      ],
    }),

    setTeacherAvailability: builder.mutation<Teacher, SetTeacherAvailabilityRequest>({
      query: ({ id, ...body }) => ({
        url: `teachers/${id}/availability`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: Teacher }) => response.data,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Teacher', id },
      ],
    }),

    getTeachersLoad: builder.query<TeacherLoad[], void>({
      query: () => 'teachers/load',
      transformResponse: (response: { data: TeacherLoad[] }) => response.data,
      providesTags: [{ type: 'Teacher', id: 'LOAD' }],
    }),

    getTeacherSlotConflicts: builder.query<TeacherSlotConflict[], ConflictQuery>({
      query: ({ workingDayId, slotId, excludeDivisionId }) => {
        const p = new URLSearchParams({ workingDayId, slotId });
        if (excludeDivisionId) p.set('excludeDivisionId', excludeDivisionId);
        return `teachers/conflicts?${p.toString()}`;
      },
      transformResponse: (response: { data: TeacherSlotConflict[] }) => response.data,
    }),
  }),
});

export const {
  useGetTeachersQuery,
  useGetTeacherQuery,
  useCreateTeacherMutation,
  useUpdateTeacherMutation,
  useDeleteTeacherMutation,
  useSetTeacherSubjectsMutation,
  useSetTeacherAvailabilityMutation,
  useGetTeachersLoadQuery,
  useGetTeacherSlotConflictsQuery,
} = teacherApi;
