import { prisma } from '../db/client';
import { findTeachersAtTime } from './conflictDetectionHelper';

/**
 * Timetable status tags -- multi-status model replacing GENERATED/OUTDATED.
 * A timetable can have multiple statuses simultaneously.
 *
 * Pre-built for Enhancement 3 (Status Flags).
 */
export const TimetableStatusTag = {
  VALID: 'VALID',
  PREFERENCE_VIOLATION_SOFT: 'PREFERENCE_VIOLATION_SOFT',
  EMPTY_SLOTS: 'EMPTY_SLOTS',
  EXCESS_ASSIGNMENTS: 'EXCESS_ASSIGNMENTS',
  PREFERENCE_VIOLATION_HARD: 'PREFERENCE_VIOLATION_HARD',
  AVAILABILITY_VIOLATION: 'AVAILABILITY_VIOLATION',
  TEACHER_CONFLICT: 'TEACHER_CONFLICT',
  ORPHANED_SLOTS: 'ORPHANED_SLOTS',
} as const;

export type TimetableStatusTagType = typeof TimetableStatusTag[keyof typeof TimetableStatusTag];

/**
 * Severity ordering for status tags (higher = more severe).
 * Used to determine which badge to show when multiple statuses exist.
 */
export const STATUS_SEVERITY: Record<TimetableStatusTagType, number> = {
  VALID: 0,
  PREFERENCE_VIOLATION_SOFT: 1,
  EMPTY_SLOTS: 2,
  EXCESS_ASSIGNMENTS: 3,
  PREFERENCE_VIOLATION_HARD: 4,
  AVAILABILITY_VIOLATION: 5,
  TEACHER_CONFLICT: 6,
  ORPHANED_SLOTS: 7,
};

/**
 * JSON structure stored in the timetable's statusJson column.
 */
export interface TimetableStatusJson {
  statuses: TimetableStatusTagType[];
  details: {
    teacherConflicts?: Array<{
      slotId: string;
      teacherId: string;
      teacherName: string;
      dayLabel: string;
      periodNumber: number;
      conflictWith: { className: string; divisionLabel: string; periodNumber: number };
    }>;
    emptySlotCount?: number;
    excessAssignments?: number;
    availabilityViolations?: Array<{
      slotId: string;
      teacherId: string;
      teacherName: string;
      dayLabel: string;
      periodNumber: number;
    }>;
    hardPreferenceViolations?: Array<{
      slotId: string;
      assignmentId: string;
      subjectName: string;
      violation: string;
    }>;
    softPreferenceViolations?: Array<{
      slotId: string;
      assignmentId: string;
      subjectName: string;
      violation: string;
    }>;
    orphanedSlots?: Array<{
      slotId: string;
      subjectName: string;
      teacherName: string;
    }>;
  };
  computedAt: string;
}

/**
 * Recompute status flags for a single timetable.
 * Queries the timetable's slots, assignments, and structure to determine current state.
 * Updates the timetable's statusJson field in DB.
 *
 * Called from 6+ services after any data change that could affect timetable validity:
 * - timetable service (after generation, swap, override)
 * - division-assignment service (after assignment CRUD)
 * - teacher service (after teacher changes)
 * - subject service (after subject changes)
 * - school-config service (after structure changes)
 * - class service (after class teacher swap)
 *
 * NOTE: This function requires the `statusJson` column to exist on the timetable table.
 * The column is added in Enhancement 3, Phase 1 (migration).
 * Until that migration runs, this function will fail. Services should only call it
 * after Enhancement 3's schema migration is applied.
 */
export async function recomputeTimetableStatus(
  timetableId: string,
): Promise<TimetableStatusJson> {
  const statuses: TimetableStatusTagType[] = [];
  const details: TimetableStatusJson['details'] = {};

  // Load timetable with division + period structure info
  const timetable = await prisma.timetable.findUnique({
    where: { id: timetableId },
    include: {
      division: {
        select: {
          id: true,
          periodStructureId: true,
          label: true,
          class: { select: { name: true } },
        },
      },
    },
  });
  if (!timetable || !timetable.division.periodStructureId) {
    const result: TimetableStatusJson = { statuses: ['VALID'], details: {}, computedAt: new Date().toISOString() };
    return result;
  }

  // Load all timetable slots with assignments
  const slots = await prisma.timetableSlot.findMany({
    where: { timetableId },
    include: {
      workingDay: { select: { id: true, dayOfWeek: true, label: true } },
      slot: { select: { id: true, slotType: true, slotNumber: true, startTime: true, endTime: true, sortOrder: true } },
      divisionAssignment: {
        include: {
          teacher: { select: { id: true, name: true } },
          assistantTeacher: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  // Load period structure to know expected slot count
  const workingDays = await prisma.workingDay.findMany({
    where: { periodStructureId: timetable.division.periodStructureId },
    include: { slots: { where: { slotType: 'PERIOD' } } },
  });
  const expectedPeriodSlots = workingDays.reduce((sum, wd) => sum + wd.slots.length, 0);

  // ── CHECK 1: Empty/Unassigned Slots ──
  const periodSlots = slots.filter(s => s.slot.slotType === 'PERIOD');
  const emptyCount = periodSlots.filter(s => !s.divisionAssignmentId).length;
  if (emptyCount > 0 || periodSlots.length < expectedPeriodSlots) {
    statuses.push('EMPTY_SLOTS');
    details.emptySlotCount = emptyCount + (expectedPeriodSlots - periodSlots.length);
  }

  // ── CHECK 2: Excess Assignments ──
  const assignments = await prisma.divisionAssignment.findMany({
    where: { divisionId: timetable.divisionId, deletedAt: null },
    select: { weightage: true },
  });
  const totalPw = assignments.reduce((sum, a) => sum + a.weightage, 0);
  if (totalPw > expectedPeriodSlots) {
    statuses.push('EXCESS_ASSIGNMENTS');
    details.excessAssignments = totalPw - expectedPeriodSlots;
  }

  // ── CHECK 3: Teacher Conflicts ──
  const teacherConflicts: NonNullable<TimetableStatusJson['details']['teacherConflicts']> = [];
  const checkedTeacherSlots = new Set<string>();

  for (const s of periodSlots) {
    const da = s.divisionAssignment;
    if (!da?.teacher) continue;

    const key = `${da.teacher.id}-${s.workingDay.dayOfWeek}-${s.slot.sortOrder}`;
    if (checkedTeacherSlots.has(key)) continue;
    checkedTeacherSlots.add(key);

    const conflicts = await findTeachersAtTime({
      schoolId: timetable.schoolId,
      academicYearId: timetable.academicYearId,
      dayOfWeek: s.workingDay.dayOfWeek,
      startTime: s.slot.startTime,
      endTime: s.slot.endTime,
      excludeSlotIds: [s.id],
      excludeDivisionId: timetable.divisionId,
    });

    const teacherConflict = conflicts.find(c => c.teacherId === da.teacher!.id);
    if (teacherConflict) {
      teacherConflicts.push({
        slotId: s.id,
        teacherId: da.teacher.id,
        teacherName: da.teacher.name,
        dayLabel: s.workingDay.label,
        periodNumber: s.slot.slotNumber ?? 0,
        conflictWith: {
          className: teacherConflict.className,
          divisionLabel: teacherConflict.divisionLabel,
          periodNumber: s.slot.slotNumber ?? 0,
        },
      });
    }
  }

  if (teacherConflicts.length > 0) {
    statuses.push('TEACHER_CONFLICT');
    details.teacherConflicts = teacherConflicts;
  }

  // ── CHECK 4: Availability Violations ──
  const availViolations: NonNullable<TimetableStatusJson['details']['availabilityViolations']> = [];
  for (const s of periodSlots) {
    const da = s.divisionAssignment;
    if (!da?.teacher) continue;

    const unavailable = await prisma.teacherAvailability.findFirst({
      where: {
        teacherId: da.teacher.id,
        workingDayId: s.workingDayId,
        slotId: s.slotId,
      },
    });

    if (unavailable) {
      availViolations.push({
        slotId: s.id,
        teacherId: da.teacher.id,
        teacherName: da.teacher.name,
        dayLabel: s.workingDay.label,
        periodNumber: s.slot.slotNumber ?? 0,
      });
    }
  }

  if (availViolations.length > 0) {
    statuses.push('AVAILABILITY_VIOLATION');
    details.availabilityViolations = availViolations;
  }

  // ── CHECK 5: Orphaned Slots ──
  const orphaned = slots.filter(s => s.divisionAssignment && (s.divisionAssignment as any).deletedAt != null);
  if (orphaned.length > 0) {
    statuses.push('ORPHANED_SLOTS');
    details.orphanedSlots = orphaned.map(s => ({
      slotId: s.id,
      subjectName: s.divisionAssignment?.subject?.name ?? '',
      teacherName: s.divisionAssignment?.teacher?.name ?? '',
    }));
  }

  // ── CHECK 6: Scheduling Preference Violations ──
  // TODO: Implement in Enhancement 3 Phase 2
  // Requires parsing schedulingPreferences JSON from each assignment
  // and checking against slot placement (day, period range, adjacency, etc.)

  // ── Final: If no issues found, mark as VALID ──
  if (statuses.length === 0) {
    statuses.push('VALID');
  }

  const result: TimetableStatusJson = {
    statuses,
    details,
    computedAt: new Date().toISOString(),
  };

  // Update timetable record with raw query (statusJson column added in Enhancement 3 migration)
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE timetables SET status_json = $1::jsonb WHERE id = $2`,
      JSON.stringify(result),
      timetableId,
    );
  } catch {
    // statusJson column may not exist yet (pre-Enhancement 3 migration)
    console.warn(`[timetable-status] Could not update status_json for ${timetableId} -- column may not exist yet`);
  }

  return result;
}

/**
 * Batch recompute for multiple timetables.
 * Used after bulk operations (teacher delete, subject delete, structure change).
 */
export async function recomputeMultipleTimetableStatuses(
  timetableIds: string[],
): Promise<void> {
  for (const id of timetableIds) {
    await recomputeTimetableStatus(id);
  }
}

/**
 * Find all timetable IDs affected by a change to a given entity.
 * Used to determine which timetables need recomputation.
 */
export async function findAffectedTimetableIds(params: {
  schoolId: string;
  academicYearId: string;
  entityType: 'TEACHER' | 'SUBJECT' | 'ASSIGNMENT' | 'PERIOD_STRUCTURE' | 'DIVISION';
  entityId: string;
}): Promise<string[]> {
  const { schoolId, academicYearId, entityType, entityId } = params;

  if (entityType === 'TEACHER') {
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: {
          OR: [{ teacherId: entityId }, { assistantTeacherId: entityId }],
          deletedAt: null,
        },
      },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  if (entityType === 'SUBJECT') {
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, divisionAssignment: { subjectId: entityId, deletedAt: null } },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  if (entityType === 'ASSIGNMENT') {
    const slots = await prisma.timetableSlot.findMany({
      where: { schoolId, divisionAssignmentId: entityId },
      select: { timetableId: true },
      distinct: ['timetableId'],
    });
    return slots.map(s => s.timetableId);
  }

  if (entityType === 'PERIOD_STRUCTURE') {
    const divisions = await prisma.division.findMany({
      where: { periodStructureId: entityId, deletedAt: null },
      select: { id: true },
    });
    const timetables = await prisma.timetable.findMany({
      where: { divisionId: { in: divisions.map(d => d.id) }, academicYearId },
      select: { id: true },
    });
    return timetables.map(t => t.id);
  }

  if (entityType === 'DIVISION') {
    const timetables = await prisma.timetable.findMany({
      where: { divisionId: entityId, academicYearId },
      select: { id: true },
    });
    return timetables.map(t => t.id);
  }

  return [];
}
