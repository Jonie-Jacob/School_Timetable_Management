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
      timetableCounts,
      unresolvedConflicts,
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
      prisma.timetable.groupBy({
        by: ['status'],
        where: { schoolId, academicYearId },
        _count: true,
      }),
      prisma.timetableNotification.count({
        where: { schoolId, dismissed: false },
      }),
    ]);

    // Total divisions that have a generated timetable
    const divisionsWithTimetable = await prisma.timetable.count({
      where: { schoolId, academicYearId },
    });

    const timetableStatusMap: Record<string, number> = {};
    for (const entry of timetableCounts) {
      timetableStatusMap[entry.status] = entry._count;
    }

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
        total: divisionsWithTimetable,
        divisionsWithoutTimetable: totalDivisions - divisionsWithTimetable,
        byStatus: timetableStatusMap,
      },
      unresolvedConflicts,
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
