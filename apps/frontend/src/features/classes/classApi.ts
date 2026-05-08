import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface Division {
  id: string;
  classId: string;
  label: string;
  streamName: string | null;
  periodStructureId: string | null;
  classTeacherId: string | null;
  classTeacher?: {
    id: string;
    name: string;
  } | null;
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
    statusJson?: { statuses: string[]; details: Record<string, unknown>; computedAt: string } | null;
    generatedAt: string | null;
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

export interface SwapOption {
  subjectId: string;
  subjectName: string;
  fromDivision: { id: string; label: string; className: string };
  fromAssignmentId: string;
  targetAssignmentId: string;
  currentTeacherInTarget: { id: string; name: string };
  currentTeacherIsClassTeacherOfSource: boolean;
  currentTeacherIsClassTeacherOfTarget: boolean;
}

export interface ClassTeacherAnalysis {
  case: 'A' | 'B' | 'C';
  teacher: { id: string; name: string };
  alreadyInDivision: boolean;
  swapOptions: SwapOption[];
  warning: string | null;
}

export interface ClassTeacherSwapResult {
  swapped: boolean;
  affectedTimetables: Array<{ id: string; divisionId: string }>;
  warnings: string[];
}

export const classApi = createApi({
  reducerPath: 'classApi',
  baseQuery,
  tagTypes: ['Class'],
  endpoints: (builder) => ({
    getClasses: builder.query<ClassItem[], void>({
      query: () => 'classes',
      transformResponse: (response: { data: any[] }) =>
        response.data.map((cls) => ({
          ...cls,
          divisions: (cls.divisions ?? []).map((div: any) => ({
            ...div,
            timetable: div.timetables?.[0] ?? null,
          })),
        })) as ClassItem[],
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'Class' as const, id })),
              { type: 'Class', id: 'LIST' },
            ]
          : [{ type: 'Class', id: 'LIST' }],
    }),

    getClass: builder.query<ClassItem, string>({
      query: (id) => `classes/${id}`,
      transformResponse: (response: { data: any }) => {
        const cls = response.data;
        return {
          ...cls,
          divisions: (cls.divisions ?? []).map((div: any) => ({
            ...div,
            timetable: div.timetables?.[0] ?? null,
          })),
        } as ClassItem;
      },
      providesTags: (_result, _error, id) => [{ type: 'Class', id }],
    }),

    createClass: builder.mutation<ClassItem, CreateClassRequest>({
      query: (body) => ({
        url: 'classes',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: ClassItem }) => response.data,
      invalidatesTags: [{ type: 'Class', id: 'LIST' }],
    }),

    updateClass: builder.mutation<ClassItem, UpdateClassRequest>({
      query: ({ id, ...body }) => ({
        url: `classes/${id}`,
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
        url: `classes/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Class', id: 'LIST' }],
    }),

    addDivision: builder.mutation<Division, CreateDivisionRequest>({
      query: ({ classId, ...body }) => ({
        url: `classes/${classId}/divisions`,
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
        url: `classes/${classId}/divisions/${divisionId}`,
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
        url: `classes/${classId}/divisions/${divisionId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { classId }) => [
        { type: 'Class', id: classId },
        { type: 'Class', id: 'LIST' },
      ],
    }),

    setClassTeacher: builder.mutation<Division, { classId: string; divisionId: string; teacherId: string }>({
      query: ({ classId, divisionId, teacherId }) => ({
        url: `classes/${classId}/divisions/${divisionId}/class-teacher`,
        method: 'PUT',
        body: { teacherId },
      }),
      transformResponse: (response: { data: Division }) => response.data,
      invalidatesTags: (_result, _error, { classId }) => [
        { type: 'Class', id: classId },
        { type: 'Class', id: 'LIST' },
      ],
    }),

    removeClassTeacher: builder.mutation<void, { classId: string; divisionId: string }>({
      query: ({ classId, divisionId }) => ({
        url: `classes/${classId}/divisions/${divisionId}/class-teacher`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { classId }) => [
        { type: 'Class', id: classId },
        { type: 'Class', id: 'LIST' },
      ],
    }),

    bulkSetClassTeacher: builder.mutation<{ updated: number }, { assignments: Array<{ divisionId: string; teacherId: string }> }>({
      query: (body) => ({
        url: 'classes/bulk-class-teacher',
        method: 'PUT',
        body,
      }),
      invalidatesTags: [{ type: 'Class', id: 'LIST' }],
    }),

    analyzeClassTeacher: builder.mutation<ClassTeacherAnalysis, { classId: string; divisionId: string; teacherId: string }>({
      query: ({ classId, divisionId, teacherId }) => ({
        url: `classes/${classId}/divisions/${divisionId}/class-teacher-analyze`,
        method: 'POST',
        body: { teacherId },
      }),
      transformResponse: (response: { data: ClassTeacherAnalysis }) => response.data,
    }),

    executeClassTeacherSwap: builder.mutation<ClassTeacherSwapResult, { classId: string; divisionId: string; teacherId: string; fromAssignmentId: string; targetAssignmentId: string }>({
      query: ({ classId, divisionId, ...body }) => ({
        url: `classes/${classId}/divisions/${divisionId}/class-teacher-swap`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: ClassTeacherSwapResult }) => response.data,
      invalidatesTags: [{ type: 'Class', id: 'LIST' }],
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
  useSetClassTeacherMutation,
  useRemoveClassTeacherMutation,
  useBulkSetClassTeacherMutation,
  useAnalyzeClassTeacherMutation,
  useExecuteClassTeacherSwapMutation,
} = classApi;
