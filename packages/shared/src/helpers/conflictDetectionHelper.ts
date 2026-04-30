import { prisma } from '../db/client';

export interface TimeConflictResult {
  teacherId: string;
  teacherName: string;
  subjectName: string;
  className: string;
  divisionLabel: string;
  divisionId: string;
}

/**
 * Find all teachers busy during a given time range on a given day of the week.
 * Uses time-range overlap: slotStartTime < queryEndTime AND slotEndTime > queryStartTime.
 * Checks both primary and assistant teachers on timetable slots.
 * Deduplicates by teacherId + divisionId.
 *
 * Consolidates:
 * - teacher/service.ts :: getSlotConflicts()
 * - timetable/service.ts :: findTeacherTimeConflict() (partial)
 */
export async function findTeachersAtTime(params: {
  schoolId: string;
  academicYearId: string;
  dayOfWeek: number;
  startTime: Date | string;
  endTime: Date | string;
  excludeSlotIds?: string[];
  excludeDivisionId?: string;
}): Promise<TimeConflictResult[]> {
  const { schoolId, academicYearId, dayOfWeek, startTime, endTime, excludeSlotIds, excludeDivisionId } = params;

  const slots = await prisma.timetableSlot.findMany({
    where: {
      schoolId,
      ...(excludeSlotIds?.length ? { id: { notIn: excludeSlotIds } } : {}),
      timetable: {
        academicYearId,
        ...(excludeDivisionId ? { divisionId: { not: excludeDivisionId } } : {}),
      },
      workingDay: { dayOfWeek },
      slot: {
        startTime: { lt: endTime instanceof Date ? endTime : new Date(`1970-01-01T${endTime}:00Z`) },
        endTime: { gt: startTime instanceof Date ? startTime : new Date(`1970-01-01T${startTime}:00Z`) },
      },
      divisionAssignmentId: { not: null },
      divisionAssignment: { deletedAt: null },
    },
    include: {
      timetable: {
        include: { division: { select: { id: true, label: true, class: { select: { name: true } } } } },
      },
      divisionAssignment: {
        include: {
          teacher: { select: { id: true, name: true } },
          assistantTeacher: { select: { id: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
  });

  const seen = new Set<string>();
  const results: TimeConflictResult[] = [];

  for (const s of slots) {
    const da = s.divisionAssignment;
    if (!da) continue;
    const divInfo = {
      subjectName: da.subject.name,
      className: s.timetable.division.class.name,
      divisionLabel: s.timetable.division.label,
      divisionId: s.timetable.division.id,
    };

    if (da.teacher) {
      const key = `${da.teacher.id}-${s.timetable.division.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ teacherId: da.teacher.id, teacherName: da.teacher.name, ...divInfo });
      }
    }

    if (da.assistantTeacher) {
      const key = `${da.assistantTeacher.id}-${s.timetable.division.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ teacherId: da.assistantTeacher.id, teacherName: da.assistantTeacher.name, ...divInfo });
      }
    }
  }

  return results;
}

/**
 * Check if a specific teacher is busy during a given time range on a given day.
 * Returns the first conflicting timetable slot with full context, or null if free.
 *
 * Consolidates:
 * - timetable/service.ts :: findTeacherTimeConflict()
 */
export async function isTeacherBusyAt(params: {
  schoolId: string;
  teacherId: string;
  dayOfWeek: number;
  startTime: Date;
  endTime: Date;
  excludeSlotIds?: string[];
}) {
  const { schoolId, teacherId, dayOfWeek, startTime, endTime, excludeSlotIds } = params;

  return prisma.timetableSlot.findFirst({
    where: {
      ...(excludeSlotIds?.length ? { id: { notIn: excludeSlotIds } } : {}),
      schoolId,
      workingDay: { dayOfWeek },
      slot: {
        slotType: 'PERIOD',
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      divisionAssignment: { teacherId, deletedAt: null },
    },
    include: {
      timetable: { include: { division: { include: { class: true } } } },
      divisionAssignment: { include: { teacher: { select: { id: true, name: true } } } },
      workingDay: true,
      slot: true,
    },
  });
}

export interface BusyRange {
  dayOfWeek: number;
  startMs: number;
  endMs: number;
}

/**
 * Build a Map of teacherId → busy time ranges from all timetable slots.
 * Includes both primary and assistant teacher bookings.
 * Used by export service for free period grid computation.
 *
 * Consolidates:
 * - export/service.ts :: busyRanges map building + isTeacherBusy()
 */
export async function buildTeacherBusyRanges(params: {
  schoolId: string;
  academicYearId: string;
  teacherIds?: string[];
}): Promise<Map<string, BusyRange[]>> {
  const { schoolId, academicYearId, teacherIds } = params;

  const timetableSlots = await prisma.timetableSlot.findMany({
    where: {
      schoolId,
      timetable: { academicYearId },
      divisionAssignmentId: { not: null },
      divisionAssignment: { deletedAt: null },
    },
    select: {
      workingDay: { select: { dayOfWeek: true } },
      slot: { select: { startTime: true, endTime: true } },
      divisionAssignment: { select: { teacherId: true, assistantTeacherId: true } },
    },
  });

  const busyRanges = new Map<string, BusyRange[]>();

  for (const ts of timetableSlots) {
    const da = ts.divisionAssignment;
    if (!da) continue;
    const range: BusyRange = {
      dayOfWeek: ts.workingDay.dayOfWeek,
      startMs: ts.slot.startTime.getTime(),
      endMs: ts.slot.endTime.getTime(),
    };
    for (const tid of [da.teacherId, da.assistantTeacherId]) {
      if (!tid) continue;
      if (teacherIds && !teacherIds.includes(tid)) continue;
      if (!busyRanges.has(tid)) busyRanges.set(tid, []);
      busyRanges.get(tid)!.push(range);
    }
  }

  return busyRanges;
}

/**
 * Check if a teacher is busy at a specific time using a pre-built busy ranges map.
 * Time-range overlap: rangeStart < periodEnd AND periodStart < rangeEnd.
 */
export function isTeacherBusyInRanges(
  busyRanges: Map<string, BusyRange[]>,
  teacherId: string,
  dayOfWeek: number,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const ranges = busyRanges.get(teacherId);
  if (!ranges) return false;
  const pStart = periodStart.getTime();
  const pEnd = periodEnd.getTime();
  return ranges.some(r => r.dayOfWeek === dayOfWeek && r.startMs < pEnd && pStart < r.endMs);
}
