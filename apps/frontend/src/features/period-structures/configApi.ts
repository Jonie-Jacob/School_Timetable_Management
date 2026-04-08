import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface SlotEntry {
  order: number;
  type: 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK';
  startTime: string;
  endTime: string;
  label: string;
}

export interface PeriodStructureDivision {
  id: string;
  periodStructureId: string | null;
  label: string;
  class: {
    id: string;
    name: string;
  };
}

export interface WorkingDay {
  id: string;
  dayOfWeek: number;
  label: string;
  sortOrder: number;
  slots?: Slot[];
}

export interface Slot {
  id: string;
  slotType: 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK';
  slotNumber: number | null;
  startTime: string;
  endTime: string;
  sortOrder: number;
}

export interface PeriodStructure {
  id: string;
  schoolId: string;
  academicYearId: string;
  name: string;
  periods: SlotEntry[];
  divisions: PeriodStructureDivision[];
  workingDays: WorkingDay[];
  createdAt: string;
  updatedAt: string;
}

export interface ClassItem {
  id: string;
  name: string;
  sortOrder: number;
}

export const configApi = createApi({
  reducerPath: 'configApi',
  baseQuery,
  tagTypes: ['PeriodStructure', 'Class'],
  endpoints: (builder) => ({
    getPeriodStructures: builder.query<PeriodStructure[], void>({
      query: () => 'config/period-structures',
      transformResponse: (response: { data: PeriodStructure[] }) => response.data,
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: 'PeriodStructure' as const, id })),
              { type: 'PeriodStructure', id: 'LIST' },
            ]
          : [{ type: 'PeriodStructure', id: 'LIST' }],
    }),

    getPeriodStructure: builder.query<PeriodStructure, string>({
      query: (id) => `config/period-structures/${id}`,
      transformResponse: (response: { data: PeriodStructure }) => response.data,
      providesTags: (_result, _error, id) => [{ type: 'PeriodStructure', id }],
    }),

    createPeriodStructure: builder.mutation<
      PeriodStructure,
      { name: string; periods: SlotEntry[] }
    >({
      query: (body) => ({
        url: 'config/period-structures',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: PeriodStructure }) => response.data,
      invalidatesTags: [{ type: 'PeriodStructure', id: 'LIST' }],
    }),

    updatePeriodStructure: builder.mutation<
      PeriodStructure,
      { id: string; name?: string; periods?: SlotEntry[] }
    >({
      query: ({ id, ...body }) => ({
        url: `config/period-structures/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: PeriodStructure }) => response.data,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'PeriodStructure', id },
        { type: 'PeriodStructure', id: 'LIST' },
      ],
    }),

    deletePeriodStructure: builder.mutation<void, string>({
      query: (id) => ({
        url: `config/period-structures/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'PeriodStructure', id: 'LIST' }],
    }),

    assignDivisions: builder.mutation<void, { periodStructureId: string; divisionIds: string[] }>({
      query: ({ periodStructureId, divisionIds }) => ({
        url: `config/period-structures/${periodStructureId}/assign`,
        method: 'POST',
        body: { divisionIds },
      }),
      invalidatesTags: [{ type: 'PeriodStructure', id: 'LIST' }],
    }),

    setWorkingDays: builder.mutation<WorkingDay[], { periodStructureId: string; days: string[] }>({
      query: ({ periodStructureId, days }) => ({
        url: `config/period-structures/${periodStructureId}/working-days`,
        method: 'PUT',
        body: { days },
      }),
      transformResponse: (response: { data: WorkingDay[] }) => response.data,
      invalidatesTags: (_result, _error, { periodStructureId }) => [
        { type: 'PeriodStructure', id: periodStructureId },
      ],
    }),

    getClasses: builder.query<ClassItem[], void>({
      query: () => 'classes',
      transformResponse: (response: { data: Array<{ id: string; name: string; sortOrder: number }> }) =>
        response.data.map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
      providesTags: [{ type: 'Class', id: 'LIST' }],
    }),
  }),
});

export const {
  useGetPeriodStructuresQuery,
  useGetPeriodStructureQuery,
  useCreatePeriodStructureMutation,
  useUpdatePeriodStructureMutation,
  useDeletePeriodStructureMutation,
  useAssignDivisionsMutation,
  useSetWorkingDaysMutation,
  useGetClassesQuery,
} = configApi;
