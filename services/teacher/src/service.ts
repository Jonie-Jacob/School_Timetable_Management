import {
  prisma,
  softDelete,
  NotFoundError,
  ConflictError,
  AppError,
  type CreateTeacherDto,
  type UpdateTeacherDto,
  type SetTeacherSubjectsDto,
  type SetTeacherAvailabilityDto,
  type PaginationParams,
} from '@timetable/shared';

export class TeacherService {
  async create(schoolId: string, academicYearId: string, input: CreateTeacherDto) {
    const existing = await prisma.teacher.findFirst({
      where: {
        schoolId,
        academicYearId,
        name: { equals: input.name, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError(`Teacher '${input.name}' already exists`);
    }

    return prisma.teacher.create({
      data: {
        schoolId,
        academicYearId,
        name: input.name,
        contact: input.contact ?? null,
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
      prisma.teacher.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: pagination.skip,
        take: pagination.pageSize,
        include: {
          teacherSubjects: {
            include: { subject: { select: { id: true, name: true } } },
          },
        },
      }),
      prisma.teacher.count({ where }),
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
    const teacher = await prisma.teacher.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
      include: {
        teacherSubjects: {
          include: { subject: { select: { id: true, name: true } } },
        },
        teacherAvailability: {
          include: {
            workingDay: { select: { id: true, label: true, dayOfWeek: true } },
            slot: { select: { id: true, slotType: true, slotNumber: true, startTime: true, endTime: true } },
          },
        },
      },
    });
    if (!teacher) {
      throw new NotFoundError('Teacher', id);
    }
    return teacher;
  }

  async update(schoolId: string, academicYearId: string, id: string, input: UpdateTeacherDto) {
    await this.getById(schoolId, academicYearId, id);

    if (input.name) {
      const existing = await prisma.teacher.findFirst({
        where: {
          schoolId,
          academicYearId,
          name: { equals: input.name, mode: 'insensitive' },
          deletedAt: null,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictError(`Teacher '${input.name}' already exists`);
      }
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.contact !== undefined) data.contact = input.contact;

    return prisma.teacher.update({ where: { id }, data });
  }

  async delete(schoolId: string, academicYearId: string, id: string) {
    await this.getById(schoolId, academicYearId, id);

    const assignmentCount = await prisma.divisionAssignment.count({
      where: {
        deletedAt: null,
        OR: [{ teacherId: id }, { assistantTeacherId: id }],
      },
    });
    if (assignmentCount > 0) {
      throw new AppError(
        'Cannot delete teacher with active division assignments. Remove assignments first.',
        400,
        'BAD_REQUEST',
      );
    }

    await softDelete('teacher', id, schoolId);
  }

  async setSubjects(schoolId: string, academicYearId: string, teacherId: string, input: SetTeacherSubjectsDto) {
    await this.getById(schoolId, academicYearId, teacherId);

    // Validate all subject IDs exist
    if (input.subjectIds.length > 0) {
      const subjects = await prisma.subject.findMany({
        where: { id: { in: input.subjectIds }, schoolId, deletedAt: null },
        select: { id: true },
      });
      const foundIds = new Set(subjects.map((s) => s.id));
      const missing = input.subjectIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new AppError(`Subjects not found: ${missing.join(', ')}`, 400, 'VALIDATION_ERROR');
      }
    }

    // Replace all mappings in a transaction
    await prisma.$transaction([
      prisma.teacherSubject.deleteMany({ where: { teacherId } }),
      ...(input.subjectIds.length > 0
        ? [
            prisma.teacherSubject.createMany({
              data: input.subjectIds.map((subjectId) => ({
                schoolId,
                teacherId,
                subjectId,
              })),
            }),
          ]
        : []),
    ]);

    return this.getById(schoolId, academicYearId, teacherId);
  }

  async setAvailability(
    schoolId: string,
    academicYearId: string,
    teacherId: string,
    input: SetTeacherAvailabilityDto,
  ) {
    await this.getById(schoolId, academicYearId, teacherId);

    // Validate slot IDs exist
    if (input.unavailableSlots.length > 0) {
      const slotIds = input.unavailableSlots.map((s) => s.slotId);
      const slots = await prisma.slot.findMany({
        where: { id: { in: slotIds }, schoolId },
        select: { id: true },
      });
      const foundIds = new Set(slots.map((s) => s.id));
      const missing = slotIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw new AppError(`Slots not found: ${missing.join(', ')}`, 400, 'VALIDATION_ERROR');
      }
    }

    // Replace all availability entries
    await prisma.$transaction([
      prisma.teacherAvailability.deleteMany({ where: { teacherId, academicYearId } }),
      ...(input.unavailableSlots.length > 0
        ? [
            prisma.teacherAvailability.createMany({
              data: input.unavailableSlots.map((entry) => ({
                schoolId,
                teacherId,
                academicYearId,
                workingDayId: entry.workingDayId,
                slotId: entry.slotId,
              })),
            }),
          ]
        : []),
    ]);

    return this.getById(schoolId, academicYearId, teacherId);
  }
}
