import { prisma } from '@timetable/shared';

interface SetupStep {
  step: number;
  name: string;
  complete: boolean;
  detail?: string;
}

export class DashboardService {

  async getStats(schoolId: string, academicYearId: string) {
    const scope = { schoolId, academicYearId, deletedAt: null };

    const [
      totalClasses,
      totalDivisions,
      totalTeachers,
      totalSubjects,
      totalAssignments,
      academicYear,
      timetables,
    ] = await Promise.all([
      prisma.class.count({ where: scope }),
      prisma.division.count({ where: scope }),
      prisma.teacher.count({ where: scope }),
      prisma.subject.count({ where: scope }),
      prisma.divisionAssignment.count({ where: scope }),
      prisma.academicYear.findFirst({
        where: { id: academicYearId, schoolId },
        select: { id: true, label: true, startDate: true, endDate: true, status: true },
      }),
      prisma.timetable.findMany({
        where: { schoolId, academicYearId },
        select: { statusJson: true },
      }),
    ]);

    // Count timetables by status tag from status_json
    const statusCounts = {
      valid: 0,
      emptySlots: 0,
      excessAssignments: 0,
      teacherConflict: 0,
      availabilityViolation: 0,
      preferenceViolationHard: 0,
      preferenceViolationSoft: 0,
      orphanedSlots: 0,
    };

    const STATUS_KEY_MAP: Record<string, keyof typeof statusCounts> = {
      VALID: 'valid',
      EMPTY_SLOTS: 'emptySlots',
      EXCESS_ASSIGNMENTS: 'excessAssignments',
      TEACHER_CONFLICT: 'teacherConflict',
      AVAILABILITY_VIOLATION: 'availabilityViolation',
      PREFERENCE_VIOLATION_HARD: 'preferenceViolationHard',
      PREFERENCE_VIOLATION_SOFT: 'preferenceViolationSoft',
      ORPHANED_SLOTS: 'orphanedSlots',
    };

    for (const tt of timetables) {
      const json = tt.statusJson as { statuses?: string[] } | null;
      const statuses = json?.statuses ?? [];
      for (const s of statuses) {
        const key = STATUS_KEY_MAP[s];
        if (key) statusCounts[key]++;
      }
    }

    const totalTimetables = timetables.length;

    return {
      academicYear,
      counts: {
        classes: totalClasses,
        divisions: totalDivisions,
        teachers: totalTeachers,
        subjects: totalSubjects,
        assignments: totalAssignments,
      },
      timetables: {
        total: totalTimetables,
        divisionsWithoutTimetable: totalDivisions - totalTimetables,
        notGenerated: totalDivisions - totalTimetables,
        ...statusCounts,
      },
    };
  }

  async getSetupWizard(schoolId: string, academicYearId: string) {
    const scope = { schoolId, academicYearId, deletedAt: null };

    // Check dismissal state
    const wizardState = await prisma.setupWizardState.findUnique({
      where: { schoolId_academicYearId: { schoolId, academicYearId } },
    });

    // Auto-detect step completion from existing data
    const [
      hasActiveYear,
      classWithDivision,
      totalDivisions,
      divisionsWithStructure,
      hasSubject,
      hasTeacherWithSubject,
      hasAssignment,
      hasGeneratedTimetable,
    ] = await Promise.all([
      // Step 1: Active academic year
      prisma.academicYear.count({ where: { schoolId, id: academicYearId, status: 'ACTIVE' } }),
      // Step 2: At least one class with at least one division
      prisma.class.findFirst({
        where: { ...scope, divisions: { some: { deletedAt: null } } },
        select: { id: true },
      }),
      // Step 3a: Total divisions count
      prisma.division.count({ where: scope }),
      // Step 3b: Divisions with period structure assigned
      prisma.division.count({ where: { ...scope, periodStructureId: { not: null } } }),
      // Step 4: At least one subject
      prisma.subject.count({ where: scope }),
      // Step 5: At least one teacher with qualified subjects
      prisma.teacher.findFirst({
        where: { ...scope, teacherSubjects: { some: {} } },
        select: { id: true },
      }),
      // Step 6: At least one assignment
      prisma.divisionAssignment.count({ where: scope }),
      // Step 7: At least one timetable
      prisma.timetable.count({ where: { schoolId, academicYearId } }),
    ]);

    const step3Complete = totalDivisions > 0 && divisionsWithStructure === totalDivisions;

    const steps: SetupStep[] = [
      { step: 1, name: 'Academic Year', complete: hasActiveYear > 0 },
      { step: 2, name: 'Classes & Divisions', complete: classWithDivision !== null },
      { step: 3, name: 'Period Structures', complete: step3Complete, detail: `${divisionsWithStructure}/${totalDivisions} divisions assigned` },
      { step: 4, name: 'Subjects & Electives', complete: hasSubject > 0 },
      { step: 5, name: 'Teachers', complete: hasTeacherWithSubject !== null },
      { step: 6, name: 'Assignments', complete: hasAssignment > 0 },
      { step: 7, name: 'Generate Timetable', complete: hasGeneratedTimetable > 0 },
    ];

    const totalComplete = steps.filter(s => s.complete).length;

    return {
      steps,
      totalComplete,
      totalSteps: 7,
      dismissed: wizardState?.dismissed ?? false,
      dismissedAt: wizardState?.dismissedAt ?? null,
    };
  }

  async dismissSetupWizard(schoolId: string, academicYearId: string) {
    await prisma.setupWizardState.upsert({
      where: { schoolId_academicYearId: { schoolId, academicYearId } },
      create: { schoolId, academicYearId, dismissed: true, dismissedAt: new Date() },
      update: { dismissed: true, dismissedAt: new Date() },
    });
    return { dismissed: true };
  }

  async getRecentActivity(schoolId: string, academicYearId: string) {
    const [notifications, recentJobs] = await Promise.all([
      prisma.timetableNotification.findMany({
        where: { schoolId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          timetable: {
            include: {
              division: { select: { id: true, label: true, classId: true } },
            },
          },
        },
      }),
      prisma.generationJob.findMany({
        where: { schoolId, academicYearId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          division: { select: { id: true, label: true, classId: true } },
        },
      }),
    ]);

    return {
      notifications: notifications.map(n => ({
        id: n.id,
        conflictType: n.conflictType,
        changeDescription: n.changeDescription,
        dismissed: n.dismissed,
        division: n.timetable.division,
        createdAt: n.createdAt,
      })),
      recentJobs: recentJobs.map(j => ({
        id: j.id,
        status: j.status,
        division: j.division,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
      })),
    };
  }
}
