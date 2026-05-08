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

export interface SlotViolationDto {
  type: 'TEACHER_CONFLICT' | 'AVAILABILITY_VIOLATION' | 'PREFERENCE_VIOLATION_HARD' | 'PREFERENCE_VIOLATION_SOFT' | 'ORPHANED_SLOT';
  teacherName?: string;
  subjectName?: string;
  reason: string;
}

export interface TimetableStatusJsonDto {
  statuses: string[];
  details: Record<string, unknown>;
  computedAt: string;
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
  // Per-slot violation annotations (teacher conflicts, availability, preference violations)
  violations?: SlotViolationDto[];
  // Teacher timetable fields: identify which division/timetable this cell belongs to.
  // Empty strings for skeleton cells (no assignment). Used by teacher DnD for cross-division swaps.
  timetableId?: string;
  divisionId?: string;
  className?: string;
  divisionLabel?: string;
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
    statusJson?: TimetableStatusJsonDto | null;
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

// ── Elective swap types ──

export interface ElectiveSwapConflict {
  teacherName: string;
  teacherId: string;
  className: string;
  divisionLabel: string;
  divisionId: string;
  conflictedSlotId: string;
  direction: 'elective_to_target' | 'displaced_to_source';
}

interface SwapElectiveSlotsRequest {
  sourceSlotId: string;
  targetDayOfWeek: number;
  targetSlotSortOrder: number;
  force?: boolean;
}

interface SwapElectiveSlotsResponse {
  electiveGroupId: string;
  electiveGroupName: string;
  divisionsAffected: number;
  conflicts: ElectiveSwapConflict[];
}

interface ElectiveSwapCoordinate {
  dayOfWeek: number;
  slotSortOrder: number;
  valid: boolean;
  reason?: string;
}

interface ValidElectiveSwapTargetsResponse {
  validCoordinates: ElectiveSwapCoordinate[];
  invalidCoordinates: ElectiveSwapCoordinate[];
}

interface PreviewElectiveSwapRequest {
  sourceSlotId: string;
  targetDayOfWeek: number;
  targetSlotSortOrder: number;
}

interface PreviewAffectedDivision {
  className: string;
  divisionLabel: string;
  divisionId: string;
  currentTargetContent: {
    subject: string;
    teacher: string;
    isElective: boolean;
    electiveGroupName: string | null;
  }[] | null;
  action: 'displaced_to_source' | 'empty_freed';
}

// ── Resolution candidate types ──

export interface ResolutionCandidate {
  slotId: string;
  dayLabel: string;
  dayOfWeek: number;
  periodNumber: number | null;
  sortOrder: number;
  subjectName: string | null;
  teacherName: string | null;
  isEmpty: boolean;
  score: number;
}

export interface ResolutionCandidatesResponse {
  conflictedSlot: {
    id: string;
    className: string;
    divisionLabel: string;
    subjectName: string;
    teacherName: string;
    dayLabel: string;
    periodNumber: number | null;
  } | null;
  candidates: ResolutionCandidate[];
}

// ── Teacher swap preview types ──

export interface TeacherSwapAffectedCell {
  timetableId: string;
  className: string;
  divisionLabel: string;
  dayLabel: string;
  periodNumber: number | null;
  currentSubject: string | null;
  currentTeacher: string | null;
  newSubject: string | null;
  newTeacher: string | null;
}

export interface TeacherSwapConflict {
  teacherName: string;
  teacherId: string;
  className: string;
  divisionLabel: string;
  divisionId: string;
  conflictedSlotId: string;
  reason: string;
}

export interface PreviewTeacherSwapResponse {
  swapType: 'same_division' | 'cross_division' | 'elective';
  sourceSummary?: {
    className: string;
    divisionLabel: string;
    dayLabel: string;
    periodNumber: number | null;
    sortOrder: number;
    subjectName: string | null;
    teacherName: string | null;
  };
  targetSummary?: {
    className: string;
    divisionLabel: string;
    dayLabel: string;
    periodNumber: number | null;
    sortOrder: number;
    subjectName: string | null;
    teacherName: string | null;
  };
  affectedCells?: TeacherSwapAffectedCell[];
  conflicts?: TeacherSwapConflict[];
  // When swapType === 'elective', frontend should delegate to elective swap flow
  delegateToElective?: boolean;
  electiveSourceSlotId?: string;
  targetDayOfWeek?: number;
  targetSlotSortOrder?: number;
}

interface PreviewTeacherSwapRequest {
  sourceSlotId: string;
  targetSlotId: string;
}

export interface ValidTeacherSwapTarget {
  slotId: string;
  dayOfWeek: number;
  sortOrder: number;
  className: string;
  divisionLabel: string;
  subjectName: string | null;
  teacherName: string | null;
  isEmpty: boolean;
  isSameDivision: boolean;
  isElective: boolean;
}

export interface InvalidTeacherSwapTarget {
  slotId: string;
  dayOfWeek: number;
  sortOrder: number;
  reason: string;
}

interface ValidTeacherSwapTargetsResponse {
  validTargets: ValidTeacherSwapTarget[];
  invalidTargets: InvalidTeacherSwapTarget[];
}

export interface PreviewElectiveSwapResponse {
  sourceElectiveGroup: { id: string; name: string };
  sourceCoordinates: { dayLabel: string; slotSortOrder: number };
  targetCoordinates: { dayLabel: string; slotSortOrder: number };
  affectedDivisions: PreviewAffectedDivision[];
  targetElectiveGroupId: string | null;
  conflicts: ElectiveSwapConflict[];
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

    // ── Resolution candidates ──

    getResolutionCandidates: builder.query<ResolutionCandidatesResponse, string>({
      query: (slotId) => `timetables/slots/${slotId}/resolution-candidates`,
      transformResponse: (response: { data: ResolutionCandidatesResponse }) => response.data,
    }),

    // ── Elective swap endpoints ──

    getValidElectiveSwapTargets: builder.query<ValidElectiveSwapTargetsResponse, string>({
      query: (slotId) => `timetables/slots/${slotId}/valid-elective-swaps`,
      transformResponse: (response: { data: ValidElectiveSwapTargetsResponse }) => response.data,
    }),

    swapElectiveSlots: builder.mutation<SwapElectiveSlotsResponse, SwapElectiveSlotsRequest>({
      query: (body) => ({
        url: 'timetables/slots/swap-elective',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: SwapElectiveSlotsResponse }) => response.data,
      invalidatesTags: ['Timetable'],
    }),

    getValidTeacherSwapTargets: builder.query<ValidTeacherSwapTargetsResponse, string>({
      query: (slotId) => `timetables/teacher-slots/${slotId}/valid-swaps`,
      transformResponse: (response: { data: ValidTeacherSwapTargetsResponse }) => response.data,
    }),

    previewTeacherSwap: builder.mutation<PreviewTeacherSwapResponse, PreviewTeacherSwapRequest>({
      query: (body) => ({
        url: 'timetables/slots/preview-teacher-swap',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: PreviewTeacherSwapResponse }) => response.data,
    }),

    swapTeacherSlots: builder.mutation<{ swapType: string; cellsSwapped: number; conflicts: TeacherSwapConflict[] }, { sourceSlotId: string; targetSlotId: string; force?: boolean }>({
      query: (body) => ({
        url: 'timetables/slots/swap-teacher',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: { swapType: string; cellsSwapped: number; conflicts: TeacherSwapConflict[] } }) => response.data,
      invalidatesTags: ['Timetable'],
    }),

    previewElectiveSwap: builder.mutation<PreviewElectiveSwapResponse, PreviewElectiveSwapRequest>({
      query: (body) => ({
        url: 'timetables/slots/preview-elective-swap',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: PreviewElectiveSwapResponse }) => response.data,
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
  useLazyGetValidElectiveSwapTargetsQuery,
  useSwapElectiveSlotsMutation,
  usePreviewElectiveSwapMutation,
  usePreviewTeacherSwapMutation,
  useSwapTeacherSlotsMutation,
  useLazyGetValidTeacherSwapTargetsQuery,
  useLazyGetResolutionCandidatesQuery,
} = timetableApi;
