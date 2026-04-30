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

  // Count timetable periods per teacher (optional)
  let timetableByTeacher: Map<string, number> | null = null;

  if (includeTimetablePeriods) {
    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId, status: { in: ['GENERATED', 'OUTDATED'] } },
        divisionAssignment: {
          deletedAt: null,
          OR: [{ teacherId: { not: null } }, { assistantTeacherId: { not: null } }],
        },
      },
      select: {
        workingDayId: true,
        slotId: true,
        divisionAssignment: {
          select: { teacherId: true, assistantTeacherId: true, electiveGroupId: true, id: true },
        },
      },
    });

    // Dedup key: elective group slots share one key, regular assignments use assignmentId
    const slotsPerTeacher = new Map<string, Set<string>>();
    for (const ts of timetableSlots) {
      const da = ts.divisionAssignment;
      if (!da) continue;
      const slotKey = da.electiveGroupId
        ? `${ts.workingDayId}:${ts.slotId}:eg:${da.electiveGroupId}`
        : `${ts.workingDayId}:${ts.slotId}:da:${da.id}`;

      for (const tid of [da.teacherId, da.assistantTeacherId]) {
        if (!tid) continue;
        if (!slotsPerTeacher.has(tid)) slotsPerTeacher.set(tid, new Set());
        slotsPerTeacher.get(tid)!.add(slotKey);
      }
    }

    timetableByTeacher = new Map<string, number>();
    for (const [tid, keys] of slotsPerTeacher) {
      timetableByTeacher.set(tid, keys.size);
    }
  }

  return teachers.map((t: any) => ({
    teacherId: t.id,
    teacherName: t.name,
    assignedPeriods: loadByTeacher.get(t.id) ?? 0,
    maxPeriodsPerWeek: t.maxPeriodsPerWeek,
    timetablePeriods: timetableByTeacher?.get(t.id) ?? null,
    qualifiedSubjectIds: includeQualifiedSubjects
      ? (t.teacherSubjects ?? []).map((ts: any) => ts.subjectId)
      : [],
  }));
}
