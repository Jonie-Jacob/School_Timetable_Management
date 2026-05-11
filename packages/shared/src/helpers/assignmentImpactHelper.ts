/**
 * Assignment impact assessment types and helper.
 *
 * The Resolution Wizard modal in the frontend consumes these types
 * to determine which resolution steps to show after an assignment CRUD
 * operation. Each step describes one user-actionable problem the
 * change introduced.
 *
 * Called from:
 * - division-assignment service (assignment CRUD) -- Enhancement 4
 * - school-config service (period structure changes) -- Enhancement 11
 */

import { prisma } from '../db/client';
import { isTeacherBusyAt } from './conflictDetectionHelper';
import { loadPeriodSlots } from './periodStructureHelper';

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

// ── Internal helpers ──────────────────────────────────────────────────

/**
 * Total weightage for a division, applying the elective convention:
 * non-elective assignments contribute their `weightage` directly;
 * each elective group contributes its `periodsPerWeek` once
 * (subjects within a group share the same time block).
 */
function computeDivisionTotalWeightage(
  assignments: Array<{
    weightage: number;
    electiveGroupId: string | null;
    electiveGroup: { periodsPerWeek: number } | null;
  }>,
): number {
  let nonElectiveSum = 0;
  const groupPeriods = new Map<string, number>();
  for (const a of assignments) {
    if (a.electiveGroupId) {
      if (!groupPeriods.has(a.electiveGroupId)) {
        groupPeriods.set(a.electiveGroupId, a.electiveGroup?.periodsPerWeek ?? a.weightage);
      }
    } else {
      nonElectiveSum += a.weightage;
    }
  }
  let electiveSum = 0;
  for (const v of groupPeriods.values()) electiveSum += v;
  return nonElectiveSum + electiveSum;
}

async function assessTeacherConflicts(params: {
  schoolId: string;
  academicYearId: string;
  assignmentId: string;
  newTeacherId: string;
}): Promise<TeacherConflictDetails | null> {
  const slots = await prisma.timetableSlot.findMany({
    where: { divisionAssignmentId: params.assignmentId },
    include: {
      workingDay: { select: { label: true, dayOfWeek: true } },
      slot: { select: { slotNumber: true, startTime: true, endTime: true, slotType: true } },
      timetable: { include: { division: { select: { id: true, label: true } } } },
    },
  });

  const conflictingSlots: TeacherConflictDetails['conflictingSlots'] = [];
  for (const ts of slots) {
    if (ts.slot.slotType !== 'PERIOD') continue;
    const conflict = await isTeacherBusyAt({
      schoolId: params.schoolId,
      teacherId: params.newTeacherId,
      dayOfWeek: ts.workingDay.dayOfWeek,
      startTime: ts.slot.startTime,
      endTime: ts.slot.endTime,
      excludeSlotIds: [ts.id],
    });
    if (conflict) {
      const conflictDiv = conflict.timetable.division;
      const conflictClassDiv = `${conflictDiv.class.name}-${conflictDiv.label}`;
      conflictingSlots.push({
        timetableSlotId: ts.id,
        day: ts.workingDay.label,
        periodNumber: ts.slot.slotNumber ?? 0,
        divisionLabel: ts.timetable.division.label,
        conflictReason: `Already teaching in ${conflictClassDiv} at this time`,
        resolutionCandidates: [],
      });
    }
  }

  if (conflictingSlots.length === 0) return null;
  return { type: 'TEACHER_CONFLICT', conflictingSlots };
}

async function assessSlotRemoval(params: {
  schoolId: string;
  assignmentId: string;
  newWeightage: number;
  divisionLabel: string;
}): Promise<SlotRemovalDetails | null> {
  const assignment = await prisma.divisionAssignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      subject: { select: { name: true } },
      electiveGroup: { select: { id: true } },
    },
  });
  if (!assignment) return null;

  const slots = await prisma.timetableSlot.findMany({
    where: { divisionAssignmentId: params.assignmentId },
    include: {
      workingDay: { select: { label: true } },
      slot: { select: { slotNumber: true } },
      timetable: { include: { division: { select: { label: true } } } },
    },
    orderBy: [{ workingDay: { sortOrder: 'asc' } }, { slot: { sortOrder: 'asc' } }],
  });

  const totalToRemove = slots.length - params.newWeightage;
  if (totalToRemove <= 0) return null;

  return {
    type: 'SLOT_REMOVAL',
    affectedSubjectName: assignment.subject.name,
    totalToRemove,
    slots: slots.map(ts => ({
      timetableSlotId: ts.id,
      dayLabel: ts.workingDay.label,
      periodNumber: ts.slot.slotNumber ?? 0,
      divisionLabel: ts.timetable.division.label,
      isElective: !!assignment.electiveGroupId,
    })),
    affectedDivisions: [params.divisionLabel],
  };
}

async function assessSlotFill(params: {
  schoolId: string;
  academicYearId: string;
  divisionId: string;
  freedSlotIds: string[];
}): Promise<SlotFillDetails | null> {
  const slots = await prisma.timetableSlot.findMany({
    where: { id: { in: params.freedSlotIds } },
    include: {
      workingDay: { select: { id: true, label: true, dayOfWeek: true } },
      slot: { select: { id: true, slotNumber: true, startTime: true, endTime: true } },
    },
    orderBy: [{ workingDay: { sortOrder: 'asc' } }, { slot: { sortOrder: 'asc' } }],
  });

  if (slots.length === 0) return null;

  const existingAssignments = await prisma.divisionAssignment.findMany({
    where: {
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      divisionId: params.divisionId,
      deletedAt: null,
    },
    include: {
      subject: { select: { id: true, name: true } },
      teacher: { select: { id: true, name: true } },
      electiveGroup: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return {
    type: 'SLOT_FILL',
    freedSlots: slots.map(ts => ({
      timetableSlotId: ts.id,
      workingDayId: ts.workingDay.id,
      slotId: ts.slot.id,
      dayLabel: ts.workingDay.label,
      dayOfWeek: ts.workingDay.dayOfWeek,
      periodNumber: ts.slot.slotNumber ?? 0,
      startTime: ts.slot.startTime.toISOString().slice(11, 16),
      endTime: ts.slot.endTime.toISOString().slice(11, 16),
    })),
    existingAssignments: existingAssignments.map(a => ({
      id: a.id,
      subjectId: a.subjectId,
      subjectName: a.subject.name,
      teacherId: a.teacherId,
      teacherName: a.teacher?.name ?? null,
      currentWeightage: a.weightage,
      electiveGroupId: a.electiveGroup?.id ?? null,
      electiveGroupName: a.electiveGroup?.name ?? null,
    })),
  };
}

async function assessPwBalance(params: {
  schoolId: string;
  academicYearId: string;
  divisionId: string;
  justChangedAssignmentId?: string;
}): Promise<PwBalanceDetails | null> {
  const division = await prisma.division.findUnique({
    where: { id: params.divisionId },
    select: { periodStructureId: true, classId: true },
  });
  if (!division?.periodStructureId) return null;

  const periodInfo = await loadPeriodSlots({ periodStructureId: division.periodStructureId });
  const availableSlots = periodInfo.totalSlotsPerWeek;
  if (availableSlots === 0) return null;

  const assignments = await prisma.divisionAssignment.findMany({
    where: {
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      divisionId: params.divisionId,
      deletedAt: null,
    },
    include: {
      subject: { select: { id: true, name: true } },
      electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
    },
  });

  const currentTotal = computeDivisionTotalWeightage(assignments);
  if (currentTotal <= availableSlots) return null;

  // For each elective group, find the sibling divisions (cross-div check)
  const electiveGroupIds = [...new Set(assignments.filter(a => a.electiveGroupId).map(a => a.electiveGroupId!))];
  const crossDivByGroup = new Map<string, string[]>();
  if (electiveGroupIds.length > 0) {
    const sibling = await prisma.divisionAssignment.findMany({
      where: {
        schoolId: params.schoolId,
        academicYearId: params.academicYearId,
        electiveGroupId: { in: electiveGroupIds },
        deletedAt: null,
        division: { classId: division.classId, deletedAt: null, id: { not: params.divisionId } },
      },
      select: {
        electiveGroupId: true,
        division: { select: { id: true, label: true, class: { select: { name: true } } } },
      },
    });
    for (const s of sibling) {
      if (!s.electiveGroupId) continue;
      const list = crossDivByGroup.get(s.electiveGroupId) ?? [];
      const tag = `${s.division.class.name}-${s.division.label}`;
      if (!list.includes(tag)) list.push(tag);
      crossDivByGroup.set(s.electiveGroupId, list);
    }
  }

  let justChangedSubject: string | undefined;
  const seenGroups = new Set<string>();
  const subjects: PwBalanceDetails['subjects'] = [];
  for (const a of assignments) {
    if (a.electiveGroupId) {
      if (seenGroups.has(a.electiveGroupId)) continue;
      seenGroups.add(a.electiveGroupId);
    }
    const sibs = a.electiveGroupId ? (crossDivByGroup.get(a.electiveGroupId) ?? []) : [];
    subjects.push({
      assignmentId: a.id,
      subjectName: a.subject.name,
      electiveGroupId: a.electiveGroup?.id ?? null,
      electiveGroupName: a.electiveGroup?.name ?? null,
      currentWeightage: a.electiveGroupId ? (a.electiveGroup?.periodsPerWeek ?? a.weightage) : a.weightage,
      isCrossDivElective: sibs.length > 0,
      crossDivDivisions: sibs,
    });
    if (params.justChangedAssignmentId && a.id === params.justChangedAssignmentId) {
      justChangedSubject = a.subject.name;
    }
  }

  return {
    type: 'PW_BALANCE',
    divisionId: params.divisionId,
    currentTotal,
    availableSlots,
    subjects,
    justChangedSubject,
  };
}

/**
 * Assess the timetable impact of an assignment change. Returns the
 * resolution steps the user needs to complete via the wizard.
 *
 * The caller is expected to have ALREADY applied the change (saved to DB)
 * before calling this. `oldValues` describes what the assignment looked
 * like before; `newValues` describes the new state. For DELETE, the
 * caller must also pass `freedSlotIds` containing the IDs of the timetable
 * slots that were emptied as part of the delete.
 *
 * Step ordering (when multiple apply): TEACHER_CONFLICT → SLOT_REMOVAL → SLOT_FILL → PW_BALANCE.
 */
export async function assessAssignmentImpact(params: {
  schoolId: string;
  academicYearId: string;
  divisionId: string;
  changeType: 'CREATE' | 'UPDATE' | 'DELETE' | 'PW_CHANGE' | 'TEACHER_CHANGE' | 'STRUCTURE_CHANGE';
  assignmentId?: string;
  oldValues?: { teacherId?: string | null; weightage?: number };
  newValues?: { teacherId?: string | null; weightage?: number };
  freedSlotIds?: string[];
}): Promise<AssignmentImpact> {
  const steps: ResolutionStep[] = [];

  const division = await prisma.division.findUnique({
    where: { id: params.divisionId },
    select: { id: true, label: true, class: { select: { name: true } } },
  });
  if (!division) return { hasImpact: false, steps: [] };

  const baseDivContext = {
    divisionId: division.id,
    className: division.class.name,
    divisionLabel: division.label,
    isCascade: false,
  };

  // Step 1: TEACHER_CONFLICT (teacher changed on UPDATE / TEACHER_CHANGE)
  const teacherChanged =
    (params.changeType === 'UPDATE' || params.changeType === 'TEACHER_CHANGE') &&
    !!params.assignmentId &&
    !!params.newValues?.teacherId &&
    params.newValues.teacherId !== params.oldValues?.teacherId;
  if (teacherChanged) {
    const details = await assessTeacherConflicts({
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      assignmentId: params.assignmentId!,
      newTeacherId: params.newValues!.teacherId as string,
    });
    if (details) steps.push({ ...baseDivContext, type: 'TEACHER_CONFLICT', details });
  }

  // Step 2: SLOT_REMOVAL (weightage decreased below current slot count)
  const weightageDecreased =
    (params.changeType === 'UPDATE' || params.changeType === 'PW_CHANGE') &&
    !!params.assignmentId &&
    params.oldValues?.weightage !== undefined &&
    params.newValues?.weightage !== undefined &&
    params.newValues.weightage < params.oldValues.weightage;
  if (weightageDecreased) {
    const details = await assessSlotRemoval({
      schoolId: params.schoolId,
      assignmentId: params.assignmentId!,
      newWeightage: params.newValues!.weightage as number,
      divisionLabel: division.label,
    });
    if (details) steps.push({ ...baseDivContext, type: 'SLOT_REMOVAL', details });
  }

  // Step 3: SLOT_FILL (caller provides freedSlotIds — e.g. after DELETE or removal)
  if (params.freedSlotIds && params.freedSlotIds.length > 0) {
    const details = await assessSlotFill({
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      divisionId: params.divisionId,
      freedSlotIds: params.freedSlotIds,
    });
    if (details) steps.push({ ...baseDivContext, type: 'SLOT_FILL', details });
  }

  // Step 4: PW_BALANCE (total weightage exceeds available slots)
  if (params.changeType !== 'DELETE') {
    const details = await assessPwBalance({
      schoolId: params.schoolId,
      academicYearId: params.academicYearId,
      divisionId: params.divisionId,
      justChangedAssignmentId: params.assignmentId,
    });
    if (details) steps.push({ ...baseDivContext, type: 'PW_BALANCE', details });
  }

  return { hasImpact: steps.length > 0, steps };
}
