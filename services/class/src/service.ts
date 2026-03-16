import {
  prisma, softDelete, NotFoundError, ConflictError, AppError,
  type CreateClassDto, type UpdateClassDto,
  type CreateDivisionDto, type UpdateDivisionDto,
} from '@timetable/shared';

export class ClassService {
  // ── Class CRUD ──

  async create(schoolId: string, academicYearId: string, input: CreateClassDto) {
    const existing = await prisma.class.findFirst({
      where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) throw new ConflictError(`Class '${input.name}' already exists`);

    return prisma.class.create({
      data: {
        schoolId,
        academicYearId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        requiresStream: input.requiresStream ?? false,
      },
    });
  }

  async list(schoolId: string, academicYearId: string) {
    return prisma.class.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
      include: {
        divisions: {
          where: { deletedAt: null },
          orderBy: { label: 'asc' },
          select: {
            id: true,
            label: true,
            streamName: true,
            _count: { select: { divisionAssignments: { where: { deletedAt: null } } } },
          },
        },
      },
    });
  }

  async getById(schoolId: string, academicYearId: string, id: string) {
    const cls = await prisma.class.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
      include: {
        divisions: {
          where: { deletedAt: null },
          orderBy: { label: 'asc' },
          include: {
            _count: { select: { divisionAssignments: { where: { deletedAt: null } } } },
          },
        },
      },
    });
    if (!cls) throw new NotFoundError('Class', id);
    return cls;
  }

  async update(schoolId: string, academicYearId: string, id: string, input: UpdateClassDto) {
    await this.getById(schoolId, academicYearId, id);

    if (input.name) {
      const existing = await prisma.class.findFirst({
        where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null, id: { not: id } },
      });
      if (existing) throw new ConflictError(`Class '${input.name}' already exists`);
    }

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.requiresStream !== undefined) data.requiresStream = input.requiresStream;

    return prisma.class.update({ where: { id }, data });
  }

  async delete(schoolId: string, academicYearId: string, id: string) {
    const cls = await this.getById(schoolId, academicYearId, id);

    // Check if any non-deleted division under this class has assignments or timetables
    const activeDivisionIds = cls.divisions.map((d: { id: string }) => d.id);
    if (activeDivisionIds.length > 0) {
      const assignmentCount = await prisma.divisionAssignment.count({
        where: { divisionId: { in: activeDivisionIds }, deletedAt: null },
      });
      if (assignmentCount > 0) {
        throw new AppError('Cannot delete class with active division assignments. Remove assignments first.', 400, 'BAD_REQUEST');
      }

      const timetableCount = await prisma.timetable.count({
        where: { divisionId: { in: activeDivisionIds } },
      });
      if (timetableCount > 0) {
        throw new AppError('Cannot delete class with active timetables. Remove timetables first.', 400, 'BAD_REQUEST');
      }
    }

    await softDelete('class', id, schoolId);
  }

  // ── Division CRUD ──

  async addDivision(schoolId: string, academicYearId: string, classId: string, input: CreateDivisionDto) {
    // Ensure class exists
    await this.getById(schoolId, academicYearId, classId);

    // Check duplicate label+stream within this class
    const existing = await prisma.division.findFirst({
      where: {
        schoolId,
        classId,
        label: { equals: input.label, mode: 'insensitive' },
        streamName: input.streamName ?? null,
        deletedAt: null,
      },
    });
    if (existing) {
      const display = input.streamName ? `${input.label} ${input.streamName}` : input.label;
      throw new ConflictError(`Division '${display}' already exists in this class`);
    }

    return prisma.division.create({
      data: {
        schoolId,
        classId,
        academicYearId,
        label: input.label,
        streamName: input.streamName ?? null,
      },
    });
  }

  async updateDivision(schoolId: string, academicYearId: string, classId: string, divisionId: string, input: UpdateDivisionDto) {
    // Ensure class exists
    await this.getById(schoolId, academicYearId, classId);

    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, classId, deletedAt: null },
    });
    if (!division) throw new NotFoundError('Division', divisionId);

    // Check duplicate if label or streamName changed
    if (input.label !== undefined || input.streamName !== undefined) {
      const newLabel = input.label ?? division.label;
      const newStream = input.streamName !== undefined ? (input.streamName ?? null) : division.streamName;

      const existing = await prisma.division.findFirst({
        where: {
          schoolId,
          classId,
          label: { equals: newLabel, mode: 'insensitive' },
          streamName: newStream,
          deletedAt: null,
          id: { not: divisionId },
        },
      });
      if (existing) {
        const display = newStream ? `${newLabel} ${newStream}` : newLabel;
        throw new ConflictError(`Division '${display}' already exists in this class`);
      }
    }

    const data: Record<string, unknown> = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.streamName !== undefined) data.streamName = input.streamName ?? null;

    return prisma.division.update({ where: { id: divisionId }, data });
  }

  async deleteDivision(schoolId: string, academicYearId: string, classId: string, divisionId: string) {
    // Ensure class exists
    await this.getById(schoolId, academicYearId, classId);

    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, classId, deletedAt: null },
    });
    if (!division) throw new NotFoundError('Division', divisionId);

    // Check for active assignments
    const assignmentCount = await prisma.divisionAssignment.count({
      where: { divisionId, deletedAt: null },
    });
    if (assignmentCount > 0) {
      throw new AppError('Cannot delete division with active assignments. Remove assignments first.', 400, 'BAD_REQUEST');
    }

    // Check for active timetables
    const timetableCount = await prisma.timetable.count({
      where: { divisionId },
    });
    if (timetableCount > 0) {
      throw new AppError('Cannot delete division with active timetables. Remove timetables first.', 400, 'BAD_REQUEST');
    }

    await softDelete('division', divisionId, schoolId);
  }
}
