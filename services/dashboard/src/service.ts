import { prisma } from '@timetable/shared';

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
