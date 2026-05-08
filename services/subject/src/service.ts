import {
  prisma,
  softDelete,
  NotFoundError,
  AppError,
  findAffectedTimetableIds, recomputeMultipleTimetableStatuses,
  checkDuplicateName,
  type CreateSubjectDto,
  type UpdateSubjectDto,
  type PaginationParams,
} from '@timetable/shared';

export class SubjectService {
  async create(schoolId: string, academicYearId: string, input: CreateSubjectDto) {
    await checkDuplicateName({ model: 'subject', name: input.name, schoolId, academicYearId });

    return prisma.subject.create({
      data: {
        schoolId,
        academicYearId,
        name: input.name,
        ...(input.abbreviation ? { abbreviation: input.abbreviation } : {}),
      },
    });
  }

  async list(schoolId: string, academicYearId: string, pagination: PaginationParams) {
    const where = {
      schoolId,
      academicYearId,
      deletedAt: null,
      ...(pagination.search
        ? { name: { contains: pagination.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, totalCount] = await Promise.all([
      prisma.subject.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.subject.count({ where }),
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

  async getById(schoolId: string, academicYearId: string, id: string) {
    const subject = await prisma.subject.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
    });
    if (!subject) {
      throw new NotFoundError('Subject', id);
    }
    return subject;
  }

  async update(schoolId: string, academicYearId: string, id: string, input: UpdateSubjectDto) {
    await this.getById(schoolId, academicYearId, id);

    if (input.name) {
      await checkDuplicateName({ model: 'subject', name: input.name, schoolId, academicYearId, excludeId: id });
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.abbreviation !== undefined) data.abbreviation = input.abbreviation || null;

    const updated = await prisma.subject.update({
      where: { id },
      data,
    });

    if (input.name) {
      const subjIds = await findAffectedTimetableIds({ schoolId, academicYearId, entityType: 'SUBJECT', entityId: id });
      await recomputeMultipleTimetableStatuses(subjIds);
    }

    return updated;
  }

  async delete(schoolId: string, academicYearId: string, id: string, confirm: boolean = false) {
    await this.getById(schoolId, academicYearId, id);

    // Check for active division assignments
    const assignments = await prisma.divisionAssignment.findMany({
      where: { subjectId: id, deletedAt: null },
      select: { id: true, divisionId: true },
    });

    if (assignments.length > 0 && !confirm) {
      // Return 409 with affected info so the client can ask user to confirm
      const affectedDivisionIds = [...new Set(assignments.map(a => a.divisionId))];
      const affectedTimetables = await prisma.timetable.findMany({
        where: {
          divisionId: { in: affectedDivisionIds },
          schoolId,
        },
        select: { id: true, divisionId: true },
      });

      throw new AppError(
        JSON.stringify({
          message: 'Subject has active assignments. Confirm to proceed with cascade deletion.',
          affectedDivisions: affectedDivisionIds.length,
          affectedTimetables: affectedTimetables.length,
        }),
        409,
        'CONFIRM_REQUIRED',
      );
    }

    if (assignments.length > 0) {
      // Cascade: nullify timetable slots referencing these assignments
      const assignmentIds = assignments.map(a => a.id);

      await prisma.timetableSlot.updateMany({
        where: { divisionAssignmentId: { in: assignmentIds } },
        data: { divisionAssignmentId: null },
      });

      // Recompute affected timetable statuses
      const affectedDivisionIds = [...new Set(assignments.map(a => a.divisionId))];
      const affectedTimetables = await prisma.timetable.findMany({
        where: {
          divisionId: { in: affectedDivisionIds },
          schoolId,
        },
        select: { id: true },
      });
      await recomputeMultipleTimetableStatuses(affectedTimetables.map(t => t.id));

      // Soft-delete the assignments
      await prisma.divisionAssignment.updateMany({
        where: { id: { in: assignmentIds } },
        data: { deletedAt: new Date() },
      });
    }

    await softDelete('subject', id, schoolId);
  }
}
