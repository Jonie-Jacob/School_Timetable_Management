import {
  prisma,
  NotFoundError,
  AppError,
  type PaginationParams,
} from '@timetable/shared';
import { ConflictType } from '@prisma/client';

type EntityType =
  | 'TEACHER'
  | 'SUBJECT'
  | 'ASSIGNMENT'
  | 'SLOT'
  | 'STRUCTURE'
  | 'ELECTIVE_GROUP'
  | 'AVAILABILITY';

const ENTITY_CONFLICT_MAP: Record<EntityType, { changed: ConflictType; deleted?: ConflictType }> = {
  TEACHER: { changed: ConflictType.TEACHER_CHANGED, deleted: ConflictType.TEACHER_DELETED },
  SUBJECT: { changed: ConflictType.SUBJECT_CHANGED, deleted: ConflictType.SUBJECT_DELETED },
  ASSIGNMENT: { changed: ConflictType.ASSIGNMENT_CHANGED },
  SLOT: { changed: ConflictType.SLOT_CHANGED },
  STRUCTURE: { changed: ConflictType.STRUCTURE_CHANGED },
  AVAILABILITY: { changed: ConflictType.AVAILABILITY_CHANGED },
  ELECTIVE_GROUP: { changed: ConflictType.ELECTIVE_GROUP_CHANGED },
};

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
              status: true,
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

  async flagAffectedTimetables(
    schoolId: string,
    academicYearId: string,
    entityType: EntityType,
    entityId: string,
    changeDescription: string,
    isDeleted: boolean = false,
  ) {
    const timetableIds = await this.findAffectedTimetableIds(
      schoolId,
      academicYearId,
      entityType,
      entityId,
    );

    if (timetableIds.length === 0) {
      return { affectedCount: 0 };
    }

    const conflictMapping = ENTITY_CONFLICT_MAP[entityType];
    const conflictType = isDeleted && conflictMapping.deleted
      ? conflictMapping.deleted
      : conflictMapping.changed;

    const timetables = await prisma.timetable.findMany({
      where: { id: { in: timetableIds } },
      select: { id: true, divisionId: true },
    });

    await prisma.$transaction([
      prisma.timetableNotification.createMany({
        data: timetables.map((tt) => ({
          schoolId,
          timetableId: tt.id,
          divisionId: tt.divisionId,
          conflictType,
          changeDescription,
        })),
      }),
      prisma.timetable.updateMany({
        where: { id: { in: timetableIds } },
        data: { status: 'OUTDATED' },
      }),
    ]);

    return { affectedCount: timetableIds.length };
  }

  private async findAffectedTimetableIds(
    schoolId: string,
    academicYearId: string,
    entityType: EntityType,
    entityId: string,
  ): Promise<string[]> {
    switch (entityType) {
      case 'TEACHER': {
        const slots = await prisma.timetableSlot.findMany({
          where: {
            schoolId,
            timetable: { academicYearId },
            divisionAssignment: {
              OR: [{ teacherId: entityId }, { assistantTeacherId: entityId }],
            },
          },
          select: { timetableId: true },
          distinct: ['timetableId'],
        });
        return slots.map((s) => s.timetableId);
      }

      case 'SUBJECT': {
        const slots = await prisma.timetableSlot.findMany({
          where: {
            schoolId,
            timetable: { academicYearId },
            divisionAssignment: { subjectId: entityId },
          },
          select: { timetableId: true },
          distinct: ['timetableId'],
        });
        return slots.map((s) => s.timetableId);
      }

      case 'ASSIGNMENT': {
        const slots = await prisma.timetableSlot.findMany({
          where: {
            schoolId,
            timetable: { academicYearId },
            divisionAssignmentId: entityId,
          },
          select: { timetableId: true },
          distinct: ['timetableId'],
        });
        return slots.map((s) => s.timetableId);
      }

      case 'SLOT':
      case 'STRUCTURE':
      case 'AVAILABILITY':
      case 'ELECTIVE_GROUP': {
        // For these entity types, find all timetables in the academic year for the school
        const timetables = await prisma.timetable.findMany({
          where: { schoolId, academicYearId },
          select: { id: true },
        });
        return timetables.map((t) => t.id);
      }

      default:
        throw new AppError(`Unknown entity type: ${entityType}`, 400, 'BAD_REQUEST');
    }
  }
}
