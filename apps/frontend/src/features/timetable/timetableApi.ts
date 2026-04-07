import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface GenerationJob {
  id: string;
  schoolId: string;
  divisionId: string;
  academicYearId: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  completedAt: string | null;
}

export interface TimetableSlotAssignment {
  id: string;
  subject: { id: string; name: string };
  teacher: { id: string; name: string };
}

export interface TimetablePeriod {
  timetableSlotId: string;
  slot: {
    id: string;
    slotType: string;
    slotNumber: number | null;
    startTime: string;
    endTime: string;
    sortOrder: number;
  };
  assignment: TimetableSlotAssignment | null;
}

export interface TimetableDay {
  workingDay: {
    id: string;
    dayOfWeek: number;
    label: string;
    sortOrder: number;
  };
  periods: TimetablePeriod[];
}

export interface TimetableGrid {
  timetable: {
    id: string;
    divisionId: string;
    status: string;
    adjacencyConstraintEnabled: boolean;
    generatedAt: string;
  };
  days: TimetableDay[];
}

interface GenerateRequest {
  divisionIds: string[];
  adjacencyConstraintEnabled?: boolean;
}

interface GenerateResponse {
  jobId: string;
  timetableId: string;
  divisionId: string;
}

export const timetableApi = createApi({
  reducerPath: 'timetableApi',
  baseQuery,
  tagTypes: ['Timetable', 'GenerationJob'],
  endpoints: (builder) => ({
    generateTimetable: builder.mutation<GenerateResponse | GenerateResponse[], GenerateRequest>({
      query: (body) => ({
        url: '/timetables/generate',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: GenerateResponse | GenerateResponse[] }) => response.data,
      invalidatesTags: ['Timetable', 'GenerationJob'],
    }),

    getGenerationStatus: builder.query<GenerationJob, string>({
      query: (jobId) => `/timetables/generate/status/${jobId}`,
      transformResponse: (response: { data: GenerationJob }) => response.data,
      providesTags: (_r, _e, jobId) => [{ type: 'GenerationJob', id: jobId }],
    }),

    getDivisionTimetable: builder.query<TimetableGrid, string>({
      query: (divisionId) => `/timetables/divisions/${divisionId}`,
      transformResponse: (response: { data: TimetableGrid }) => response.data,
      providesTags: (_r, _e, divisionId) => [{ type: 'Timetable', id: divisionId }],
    }),

    overrideSlot: builder.mutation<void, { slotId: string; divisionAssignmentId: string | null }>({
      query: ({ slotId, ...body }) => ({
        url: `/timetables/slots/${slotId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Timetable'],
    }),
  }),
});

export const {
  useGenerateTimetableMutation,
  useGetGenerationStatusQuery,
  useGetDivisionTimetableQuery,
  useOverrideSlotMutation,
} = timetableApi;
