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
  teacher: { id: string; name: string } | null;
  assistantTeacher?: { id: string; name: string } | null;
  electiveGroup: { id: string; name: string } | null;
  /** Only present in teacher timetable view. Indicates primary or assistant role. */
  role?: 'primary' | 'assistant';
}

export interface TimetablePeriod {
  // The first underlying timetable_slot row id, used by drag-drop and the
  // legacy single-row override path. For elective cells, prefer slotIds[]
  // when you need to address every member row.
  timetableSlotId: string;
  // Every timetable_slot row id at this (day, slot) cell. Length 1 for
  // ordinary subjects; >1 for elective groups with parallel sections.
  slotIds: string[];
  slot: {
    id: string;
    slotType: string;
    slotNumber: number | null;
    startTime: string;
    endTime: string;
    sortOrder: number;
  };
  // List of assignments occupying this cell. Empty array = empty cell.
  assignments: TimetableSlotAssignment[];
  // True iff any assignment in this cell belongs to an elective group.
  // The frontend uses this to render the stacked elective cell and to
  // disable click-to-edit (electives must be regenerated, not single-cell
  // edited).
  isElective: boolean;
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

export interface SwapConflict {
  teacherName: string;
  className: string;
  divisionLabel: string;
  classId: string;
  divisionId: string;
  conflictedSlotId: string;
  direction: 'source_to_target' | 'target_to_source';
}

interface SwapSlotsRequest {
  sourceSlotId: string;
  targetSlotId: string;
  force?: boolean;
}

interface SwapSlotsResponse {
  source: unknown;
  target: unknown;
  conflicts: SwapConflict[];
}

interface AutoResolveResponse {
  resolved: boolean;
  message: string;
  fromSlotId: string;
  toSlotId: string;
}

export const timetableApi = createApi({
  reducerPath: 'timetableApi',
  baseQuery,
  tagTypes: ['Timetable', 'GenerationJob'],
  endpoints: (builder) => ({
    generateTimetable: builder.mutation<GenerateResponse | GenerateResponse[], GenerateRequest>({
      query: (body) => ({
        url: 'timetables/generate',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: GenerateResponse | GenerateResponse[] }) => response.data,
      invalidatesTags: ['Timetable', 'GenerationJob'],
    }),

    getActiveGeneration: builder.query<{ active: boolean; totalDivisions?: number; jobs?: unknown[]; startedAt?: string }, void>({
      query: () => 'timetables/generate/active',
      transformResponse: (response: { data: { active: boolean; totalDivisions?: number; jobs?: unknown[]; startedAt?: string } }) => response.data,
    }),

    getGenerationStatus: builder.query<GenerationJob, string>({
      query: (jobId) => `timetables/generate/status/${jobId}`,
      transformResponse: (response: { data: GenerationJob }) => response.data,
      providesTags: (_r, _e, jobId) => [{ type: 'GenerationJob', id: jobId }],
    }),

    getDivisionTimetable: builder.query<TimetableGrid, string>({
      query: (divisionId) => `timetables/divisions/${divisionId}`,
      transformResponse: (response: { data: TimetableGrid }) => response.data,
      providesTags: (_r, _e, divisionId) => [{ type: 'Timetable', id: divisionId }],
    }),

    getTeacherTimetable: builder.query<TimetableGrid, string>({
      query: (teacherId) => `timetables/teacher/${teacherId}`,
      transformResponse: (response: { data: TimetableGrid }) => response.data,
      providesTags: (_r, _e, teacherId) => [{ type: 'Timetable', id: `teacher-${teacherId}` }],
    }),

    overrideSlot: builder.mutation<void, { slotId: string; divisionAssignmentId: string | null }>({
      query: ({ slotId, ...body }) => ({
        url: `timetables/slots/${slotId}`,
        method: 'PUT',
        body,
      }),
      invalidatesTags: ['Timetable'],
    }),

    getValidSwapTargets: builder.query<{ validSlotIds: string[]; invalidSlotIds: string[] }, string>({
      query: (slotId) => `timetables/slots/${slotId}/valid-swaps`,
      transformResponse: (response: { data: { validSlotIds: string[]; invalidSlotIds: string[] } }) => response.data,
    }),

    swapSlots: builder.mutation<SwapSlotsResponse, SwapSlotsRequest>({
      query: (body) => ({
        url: 'timetables/slots/swap',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: SwapSlotsResponse }) => response.data,
      invalidatesTags: ['Timetable'],
    }),

    createEmptySlot: builder.mutation<{ timetableSlotId: string; created: boolean }, { timetableId: string; workingDayId: string; slotId: string }>({
      query: (body) => ({
        url: 'timetables/slots/create-empty',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: { timetableSlotId: string; created: boolean } }) => response.data,
      invalidatesTags: ['Timetable'],
    }),

    autoResolveConflict: builder.mutation<AutoResolveResponse, { conflictedSlotId: string }>({
      query: (body) => ({
        url: 'timetables/slots/auto-resolve',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: AutoResolveResponse }) => response.data,
      invalidatesTags: ['Timetable'],
    }),
  }),
});

export const {
  useGenerateTimetableMutation,
  useGetGenerationStatusQuery,
  useGetDivisionTimetableQuery,
  useGetTeacherTimetableQuery,
  useGetActiveGenerationQuery,
  useOverrideSlotMutation,
  useLazyGetValidSwapTargetsQuery,
  useSwapSlotsMutation,
  useCreateEmptySlotMutation,
  useAutoResolveConflictMutation,
} = timetableApi;
