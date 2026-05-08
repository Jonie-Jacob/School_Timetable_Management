import {
  prisma,
  NotFoundError,
  type PaginationParams,
} from '@timetable/shared';

export class NotificationService {
  async list(schoolId: string, academicYearId: string, pagination: PaginationParams) {
    const where = {
      schoolId,
      dismissed: false,
      timetable: { academicYearId },
    };

    const [data, totalCount] = await Promise.all([
      prisma.timetableNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
        include: {
          timetable: {
            select: {
              id: true,
              statusJson: true,
              division: {
                select: {
                  id: true,
                  label: true,
                  class: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
      prisma.timetableNotification.count({ where }),
    ]);

    return {
      data,
      meta: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pagination.pageSize),
      },
    };
  }

  async count(schoolId: string, academicYearId: string) {
    const count = await prisma.timetableNotification.count({
      where: {
        schoolId,
        dismissed: false,
        timetable: { academicYearId },
      },
    });

    return { count };
  }

  async dismiss(schoolId: string, id: string) {
    const notification = await prisma.timetableNotification.findFirst({
      where: { id, schoolId },
    });

    if (!notification) {
      throw new NotFoundError('TimetableNotification', id);
    }

    await prisma.timetableNotification.update({
      where: { id },
      data: { dismissed: true },
    });
  }

  async dismissAll(schoolId: string, academicYearId: string) {
    await prisma.timetableNotification.updateMany({
      where: {
        schoolId,
        dismissed: false,
        timetable: { academicYearId },
      },
      data: { dismissed: true },
    });
  }

}
