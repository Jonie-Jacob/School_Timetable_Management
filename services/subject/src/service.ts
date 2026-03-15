import {
  prisma,
  softDelete,
  NotFoundError,
  ConflictError,
  AppError,
  type CreateSubjectDto,
  type UpdateSubjectDto,
  type PaginationParams,
} from '@timetable/shared';

export class SubjectService {
  async create(schoolId: string, academicYearId: string, input: CreateSubjectDto) {
    const existing = await prisma.subject.findFirst({
      where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError(`Subject '${input.name}' already exists`);
    }

    return prisma.subject.create({
      data: { schoolId, academicYearId, name: input.name },
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
      const existing = await prisma.subject.findFirst({
        where: {
          schoolId,
          academicYearId,
          name: { equals: input.name, mode: 'insensitive' },
          deletedAt: null,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictError(`Subject '${input.name}' already exists`);
      }
    }

    return prisma.subject.update({
      where: { id },
      data: { ...(input.name ? { name: input.name } : {}) },
    });
  }

  async delete(schoolId: string, academicYearId: string, id: string) {
    await this.getById(schoolId, academicYearId, id);

    // Prevent deleting a subject referenced by active division assignments
    const assignmentCount = await prisma.divisionAssignment.count({
      where: { subjectId: id, deletedAt: null },
    });
    if (assignmentCount > 0) {
      throw new AppError(
        'Cannot delete subject with active division assignments. Remove assignments first.',
        400,
        'BAD_REQUEST',
      );
    }

    await softDelete('subject', id, schoolId);
  }
}
