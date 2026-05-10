import { prisma } from '../db/client';
import { identifyCrossDivElectiveGroups } from './electiveGroupHelper';

/**
 * Teacher load computation with cross-division elective deduplication.
 *
 * Consolidates:
 * - teacher/service.ts :: listLoad() core logic (lines 83-211)
 * - export/service.ts :: teacher stats computation (lines 321-343)
 */

export interface TeacherLoadResult {
  teacherId: string;
  teacherName: string;
  assignedPeriods: number;
  maxPeriodsPerWeek: number | null;
  timetablePeriods: number | null;
  conflictCount: number;
  qualifiedSubjectIds: string[];
}

/**
 * Compute assigned periods per teacher with cross-division elective deduplication.
 * Cross-div elective P/W is counted once (not per division).
 *
 * Options:
 * - teacherIds: filter to specific teachers (default: all teachers)
 * - includeTimetablePeriods: count distinct timetable_slot rows per teacher (default: true)
 * - includeQualifiedSubjects: include qualifiedSubjectIds array (default: true)
 */
export async function computeTeacherLoads(params: {
  schoolId: string;
  academicYearId: string;
  teacherIds?: string[];
  includeTimetablePeriods?: boolean;
  includeQualifiedSubjects?: boolean;
}): Promise<TeacherLoadResult[]> {
  const {
    schoolId,
    academicYearId,
    teacherIds,
    includeTimetablePeriods = true,
    includeQualifiedSubjects = true,
  } = params;

  // Load teachers
  const teachers = await prisma.teacher.findMany({
    where: {
      schoolId,
      academicYearId,
      deletedAt: null,
      ...(teacherIds ? { id: { in: teacherIds } } : {}),
    },
    select: {
      id: true,
      name: true,
      maxPeriodsPerWeek: true,
      ...(includeQualifiedSubjects ? { teacherSubjects: { select: { subjectId: true } } } : {}),
    },
    orderBy: { name: 'asc' },
  });

  // Load all assignments with elective group info
  const assignments = await prisma.divisionAssignment.findMany({
    where: {
      schoolId,
      academicYearId,
      deletedAt: null,
      OR: [{ teacherId: { not: null } }, { assistantTeacherId: { not: null } }],
    },
    select: {
      teacherId: true,
      assistantTeacherId: true,
      weightage: true,
      electiveGroupId: true,
      divisionId: true,
    },
  });

  // Identify cross-div elective groups
  const crossDivGroups = identifyCrossDivElectiveGroups(assignments);

  // Compute load per teacher with dedup
  const loadByTeacher = new Map<string, number>();
  const countedCrossDivPerTeacher = new Map<string, Set<string>>();

  function addLoad(tid: string, weightage: number, electiveGroupId: string | null) {
    const current = loadByTeacher.get(tid) ?? 0;
    if (electiveGroupId && crossDivGroups.has(electiveGroupId)) {
      if (!countedCrossDivPerTeacher.has(tid)) countedCrossDivPerTeacher.set(tid, new Set());
      const seen = countedCrossDivPerTeacher.get(tid)!;
      if (!seen.has(electiveGroupId)) {
        seen.add(electiveGroupId);
        loadByTeacher.set(tid, current + weightage);
      }
    } else {
      loadByTeacher.set(tid, current + weightage);
    }
  }

  for (const a of assignments) {
    if (a.teacherId) addLoad(a.teacherId, a.weightage, a.electiveGroupId);
    if (a.assistantTeacherId) addLoad(a.assistantTeacherId, a.weightage, a.electiveGroupId);
  }

  // Count timetable periods + conflicts per teacher (optional)
  let timetableByTeacher: Map<string, number> | null = null;
  const conflictsByTeacher = new Map<string, number>();

  if (includeTimetablePeriods) {
    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId },
        divisionAssignment: {
          deletedAt: null,
          OR: [{ teacherId: { not: null } }, { assistantTeacherId: { not: null } }],
        },
      },
      select: {
        workingDayId: true,
        slotId: true,
        timetable: { select: { divisionId: true } },
        divisionAssignment: {
          select: { teacherId: true, assistantTeacherId: true, electiveGroupId: true, id: true },
        },
      },
    });

    // Dedup key: elective group slots share one key, regular assignments use assignmentId
    const slotsPerTeacher = new Map<string, Set<string>>();
    // Track time coordinates per teacher for conflict detection: teacherId → Map<timeKey, Set<divisionId>>
    const timeCoordsByTeacher = new Map<string, Map<string, Set<string>>>();

    for (const ts of timetableSlots) {
      const da = ts.divisionAssignment;
      if (!da) continue;
      const slotKey = da.electiveGroupId
        ? `${ts.workingDayId}:${ts.slotId}:eg:${da.electiveGroupId}`
        : `${ts.workingDayId}:${ts.slotId}:da:${da.id}`;
      const timeKey = `${ts.workingDayId}:${ts.slotId}`;
      const divisionId = ts.timetable.divisionId;

      for (const tid of [da.teacherId, da.assistantTeacherId]) {
        if (!tid) continue;
        if (!slotsPerTeacher.has(tid)) slotsPerTeacher.set(tid, new Set());
        slotsPerTeacher.get(tid)!.add(slotKey);

        // Track which divisions this teacher is in at this time coordinate
        if (!timeCoordsByTeacher.has(tid)) timeCoordsByTeacher.set(tid, new Map());
        const timeMap = timeCoordsByTeacher.get(tid)!;
        if (!timeMap.has(timeKey)) timeMap.set(timeKey, new Set());
        timeMap.get(timeKey)!.add(divisionId);
      }
    }

    timetableByTeacher = new Map<string, number>();
    for (const [tid, keys] of slotsPerTeacher) {
      timetableByTeacher.set(tid, keys.size);
    }

    // Count conflicts: time coordinates where teacher appears in 2+ different divisions
    for (const [tid, timeMap] of timeCoordsByTeacher) {
      let conflicts = 0;
      for (const divs of timeMap.values()) {
        if (divs.size > 1) conflicts++;
      }
      if (conflicts > 0) conflictsByTeacher.set(tid, conflicts);
    }
  }

  return teachers.map((t: any) => ({
    teacherId: t.id,
    teacherName: t.name,
    assignedPeriods: loadByTeacher.get(t.id) ?? 0,
    maxPeriodsPerWeek: t.maxPeriodsPerWeek,
    timetablePeriods: timetableByTeacher?.get(t.id) ?? null,
    conflictCount: conflictsByTeacher.get(t.id) ?? 0,
    qualifiedSubjectIds: includeQualifiedSubjects
      ? (t.teacherSubjects ?? []).map((ts: any) => ts.subjectId)
      : [],
  }));
}
