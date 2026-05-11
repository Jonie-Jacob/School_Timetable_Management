import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface SchedulingPreferences {
  constraintType: 'HARD' | 'SOFT';
  preferredDays?: number[];
  excludedDays?: number[];
  preferredPeriodRange?: { min: number; max: number };
  excludedPeriodRange?: { min: number; max: number };
  preferAdjacentPeriods?: boolean;
  maxPeriodsPerDay?: number;
  minPeriodsPerDay?: number;
}

export interface Assignment {
  id: string;
  divisionId: string;
  subjectId: string;
  teacherId: string | null;
  assistantTeacherId: string | null;
  weightage: number;
  electiveGroupId: string | null;
  schedulingPreferences: SchedulingPreferences | null;
  subject: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  assistantTeacher: { id: string; name: string } | null;
  electiveGroup: { id: string; name: string; periodsPerWeek: number } | null;
}

// ── Enhancement 4: Timetable-Aware Assignment Editing ──
// Mirrors types from @timetable/shared/assignmentImpactHelper.

export type ResolutionStepType =
  | 'TEACHER_CONFLICT'
  | 'SLOT_REMOVAL'
  | 'SLOT_FILL'
  | 'PW_BALANCE'
  | 'WEIGHTAGE_ADJUSTMENT';

export interface TeacherConflictDetails {
  type: 'TEACHER_CONFLICT';
  conflictingSlots: Array<{
    timetableSlotId: string;
    day: string;
    periodNumber: number;
    divisionLabel: string;
    conflictReason: string;
    resolutionCandidates: Array<{ teacherId: string; teacherName: string }>;
  }>;
}

export interface SlotRemovalDetails {
  type: 'SLOT_REMOVAL';
  affectedSubjectName: string;
  totalToRemove: number;
  slots: Array<{
    timetableSlotId: string;
    dayLabel: string;
    periodNumber: number;
    divisionLabel: string;
    isElective: boolean;
    electiveSubjects?: string[];
  }>;
  affectedDivisions: string[];
}

export interface SlotFillDetails {
  type: 'SLOT_FILL';
  freedSlots: Array<{
    timetableSlotId: string;
    workingDayId: string;
    slotId: string;
    dayLabel: string;
    dayOfWeek: number;
    periodNumber: number;
    startTime: string;
    endTime: string;
  }>;
  existingAssignments: Array<{
    id: string;
    subjectId: string;
    subjectName: string;
    teacherId: string | null;
    teacherName: string | null;
    currentWeightage: number;
    electiveGroupId: string | null;
    electiveGroupName: string | null;
  }>;
}

export interface PwBalanceDetails {
  type: 'PW_BALANCE';
  divisionId: string;
  currentTotal: number;
  availableSlots: number;
  subjects: Array<{
    assignmentId: string;
    subjectName: string;
    electiveGroupId: string | null;
    electiveGroupName: string | null;
    currentWeightage: number;
    isCrossDivElective: boolean;
    crossDivDivisions: string[];
  }>;
  justChangedSubject?: string;
}

export interface WeightageAdjustmentDetails {
  type: 'WEIGHTAGE_ADJUSTMENT';
  electiveGroupId: string;
  subjectName: string;
  newPeriodsPerWeek: number;
  parallelSections: number;
  maxTotalWeightage: number;
  teachers: Array<{
    teacherId: string;
    teacherName: string;
    currentWeightage: number;
    proposedWeightage: number;
  }>;
}

export interface ResolutionStep {
  type: ResolutionStepType;
  divisionId: string;
  className: string;
  divisionLabel: string;
  isCascade: boolean;
  details:
    | TeacherConflictDetails
    | SlotRemovalDetails
    | SlotFillDetails
    | PwBalanceDetails
    | WeightageAdjustmentDetails;
}

export interface AssignmentImpact {
  hasImpact: boolean;
  steps: ResolutionStep[];
}

export interface AssignmentMutationResult {
  assignment: Assignment;
  impact?: AssignmentImpact;
}

export interface DeleteAssignmentResult {
  impact?: AssignmentImpact;
}

export interface DivisionPwSummary {
  divisionId: string;
  className: string;
  divisionLabel: string;
  totalSlots: number;
  totalWeightage: number;
  subjects: Array<{
    assignmentId: string;
    subjectName: string;
    teacherName: string | null;
    weightage: number;
    electiveGroupId: string | null;
    electiveGroupName: string | null;
    isCrossDiv: boolean;
    crossDivDivisions: string[];
  }>;
}

export interface GetAssignmentImpactRequest {
  divisionId: string;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE';
  assignmentId: string;
  previousValues?: { teacherId?: string | null; weightage?: number };
  freedSlotIds?: string[];
}

export interface ResolvePwBalanceRequest {
  changes: Array<{ assignmentId: string; newWeightage: number }>;
}

export interface ResolveSlotRemovalRequest {
  slotIds: string[];
}

export interface ResolveSlotFillRequest {
  fills: Array<{ timetableSlotId: string; divisionAssignmentId: string }>;
}

interface CreateAssignmentRequest {
  divisionId: string;
  subjectId: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  weightage: number;
  electiveGroupId?: string | null;
  schedulingPreferences?: SchedulingPreferences | null;
}

interface CreateElectiveAssignmentRequest {
  divisionId: string;
  electiveGroupId: string;
  subjectId: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  weightage: number;
  schedulingPreferences?: SchedulingPreferences | null;
}

interface UpdateAssignmentRequest {
  id: string;
  teacherId?: string | null;
  assistantTeacherId?: string | null;
  weightage?: number;
  schedulingPreferences?: SchedulingPreferences | null;
}

export interface UnassignedTeacherSubject {
  teacherSubjectId: string;
  teacherId: string;
  teacherName: string;
  subjectId: string;
  subjectName: string;
}

export interface QuickAssignRequest {
  teacherId: string;
  subjectId: string;
  divisionId: string;
  weightage: number;
}

export interface QuickAssignResponse {
  assignment: Assignment;
  conflicts: Array<{ divisionId: string; divisionLabel: string; className: string }>;
  impact?: AssignmentImpact;
}

export const assignmentApi = createApi({
  reducerPath: 'assignmentApi',
  baseQuery,
  tagTypes: ['Assignment', 'Unassigned'],
  endpoints: (builder) => ({
    getAssignments: builder.query<Assignment[], string>({
      query: (divisionId) => `divisions/${divisionId}/assignments`,
      transformResponse: (response: { data: Assignment[] }) => response.data,
      providesTags: (_result, _error, divisionId) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    createAssignment: builder.mutation<AssignmentMutationResult, CreateAssignmentRequest>({
      query: ({ divisionId, ...body }) => ({
        url: `divisions/${divisionId}/assignments`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: AssignmentMutationResult }) => response.data,
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    createElectiveAssignment: builder.mutation<AssignmentMutationResult, CreateElectiveAssignmentRequest>({
      query: ({ divisionId, ...body }) => ({
        url: `divisions/${divisionId}/assignments/elective`,
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: AssignmentMutationResult }) => response.data,
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
      ],
    }),

    updateAssignment: builder.mutation<AssignmentMutationResult, UpdateAssignmentRequest>({
      query: ({ id, ...body }) => ({
        url: `assignments/${id}`,
        method: 'PUT',
        body,
      }),
      transformResponse: (response: { data: AssignmentMutationResult }) => response.data,
      invalidatesTags: [{ type: 'Assignment', id: 'LIST' }],
    }),

    deleteAssignment: builder.mutation<DeleteAssignmentResult, { id: string; divisionId: string }>({
      query: ({ id }) => ({
        url: `assignments/${id}`,
        method: 'DELETE',
      }),
      transformResponse: (response: { data: DeleteAssignmentResult }) => response.data,
      invalidatesTags: (_r, _e, { divisionId }) => [
        { type: 'Assignment', id: divisionId },
        { type: 'Assignment', id: 'LIST' },
        { type: 'Unassigned', id: 'LIST' },
      ],
    }),

    getUnassignedSubjects: builder.query<UnassignedTeacherSubject[], { classId?: string; subjectId?: string; teacherId?: string } | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.classId) searchParams.set('classId', params.classId);
        if (params?.subjectId) searchParams.set('subjectId', params.subjectId);
        if (params?.teacherId) searchParams.set('teacherId', params.teacherId);
        const qs = searchParams.toString();
        return `assignments/unassigned${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response: { data: UnassignedTeacherSubject[] }) => response.data,
      providesTags: [{ type: 'Unassigned', id: 'LIST' }],
    }),

    quickAssign: builder.mutation<QuickAssignResponse, QuickAssignRequest>({
      query: (body) => ({
        url: 'assignments/quick-assign',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: QuickAssignResponse }) => response.data,
      invalidatesTags: [
        { type: 'Assignment', id: 'LIST' },
        { type: 'Unassigned', id: 'LIST' },
      ],
    }),

    // ── Enhancement 4: Timetable-Aware Assignment Editing ──

    getAssignmentImpact: builder.mutation<AssignmentImpact, GetAssignmentImpactRequest>({
      query: (body) => ({
        url: 'assignments/impact',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: AssignmentImpact }) => response.data,
    }),

    resolvePwBalance: builder.mutation<{ updated: number }, ResolvePwBalanceRequest>({
      query: (body) => ({
        url: 'assignments/resolve-pw-balance',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: { updated: number } }) => response.data,
      invalidatesTags: [{ type: 'Assignment', id: 'LIST' }],
    }),

    resolveSlotRemoval: builder.mutation<{ cleared: number }, ResolveSlotRemovalRequest>({
      query: (body) => ({
        url: 'assignments/resolve-slot-removal',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: { cleared: number } }) => response.data,
    }),

    resolveSlotFill: builder.mutation<{ filled: number }, ResolveSlotFillRequest>({
      query: (body) => ({
        url: 'assignments/resolve-slot-fill',
        method: 'POST',
        body,
      }),
      transformResponse: (response: { data: { filled: number } }) => response.data,
    }),

    getDivisionPwSummary: builder.query<DivisionPwSummary, string>({
      query: (divisionId) => `assignments/division-pw-summary/${divisionId}`,
      transformResponse: (response: { data: DivisionPwSummary }) => response.data,
      providesTags: (_r, _e, divisionId) => [{ type: 'Assignment', id: divisionId }],
    }),
  }),
});

export const {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useCreateElectiveAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetUnassignedSubjectsQuery,
  useQuickAssignMutation,
  useGetAssignmentImpactMutation,
  useResolvePwBalanceMutation,
  useResolveSlotRemovalMutation,
  useResolveSlotFillMutation,
  useGetDivisionPwSummaryQuery,
} = assignmentApi;
