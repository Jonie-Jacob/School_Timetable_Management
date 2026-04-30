/**
 * Assignment impact assessment types and helper.
 * Pre-built for Enhancement 4 (Timetable-Aware Assignments) and
 * Enhancement 11 (Period Structure Changes).
 *
 * The Resolution Wizard modal in the frontend consumes these types
 * to determine which resolution steps to show.
 */

/**
 * Resolution step types that the wizard can render.
 */
export type ResolutionStepType =
  | 'TEACHER_CONFLICT'
  | 'SLOT_REMOVAL'
  | 'SLOT_FILL'
  | 'PW_BALANCE'
  | 'WEIGHTAGE_ADJUSTMENT';

/**
 * A single resolution step for the wizard.
 */
export interface ResolutionStep {
  type: ResolutionStepType;
  divisionId: string;
  className: string;
  divisionLabel: string;
  isCascade: boolean;
  details: TeacherConflictDetails | SlotRemovalDetails | SlotFillDetails | PwBalanceDetails | WeightageAdjustmentDetails;
}

/**
 * Overall impact assessment result.
 */
export interface AssignmentImpact {
  hasImpact: boolean;
  steps: ResolutionStep[];
}

// ── Step detail types ──

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

/**
 * Assess the timetable impact of an assignment or period structure change.
 * Returns resolution steps the user needs to complete via the Resolution Wizard.
 *
 * Called from:
 * - division-assignment service (assignment CRUD) -- Enhancement 4
 * - school-config service (period structure changes) -- Enhancement 11
 *
 * NOTE: Full implementation completed in Enhancement 4.
 * This pre-build provides types + skeleton for early frontend integration.
 */
export async function assessAssignmentImpact(_params: {
  schoolId: string;
  academicYearId: string;
  divisionId: string;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE' | 'PW_CHANGE' | 'TEACHER_CHANGE' | 'STRUCTURE_CHANGE';
  assignmentId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  addedSlotIds?: string[];
  removedSlotIds?: string[];
}): Promise<AssignmentImpact> {
  // Skeleton -- full implementation in Enhancement 4
  // For now, return no impact so callers can integrate without breaking
  return { hasImpact: false, steps: [] };
}
