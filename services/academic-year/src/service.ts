import {
  prisma,
  tenantScope,
  softDelete,
  AppError,
  NotFoundError,
  ConflictError,
  type CreateAcademicYearDto,
  type UpdateAcademicYearDto,
  type PaginationParams,
} from '@timetable/shared';

export class AcademicYearService {
  async create(schoolId: string, input: CreateAcademicYearDto) {
    this.validateDateRange(input.startDate, input.endDate);

    // Check for duplicate label within school
    const existing = await prisma.academicYear.findFirst({
      where: { schoolId, label: input.label, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError(`Academic year with label '${input.label}' already exists`);
    }

    const academicYear = await prisma.academicYear.create({
      data: {
        schoolId,
        label: input.label,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        status: 'ARCHIVED',
      },
    });

    return academicYear;
  }

  async list(schoolId: string, pagination: PaginationParams) {
    const where = {
      schoolId,
      deletedAt: null,
      ...(pagination.search
        ? { label: { contains: pagination.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [data, totalCount] = await Promise.all([
      prisma.academicYear.findMany({
        where,
        orderBy: { startDate: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      prisma.academicYear.count({ where }),
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

  async getById(schoolId: string, id: string) {
    const academicYear = await prisma.academicYear.findFirst({
      where: { id, schoolId, deletedAt: null },
    });
    if (!academicYear) {
      throw new NotFoundError('Academic year', id);
    }
    return academicYear;
  }

  async update(schoolId: string, id: string, input: UpdateAcademicYearDto) {
    // Ensure it exists
    await this.getById(schoolId, id);

    // If dates are being changed, validate the range
    if (input.startDate || input.endDate) {
      const current = await prisma.academicYear.findFirst({
        where: { id, schoolId, deletedAt: null },
      });
      const startDate = input.startDate || current!.startDate.toISOString().slice(0, 10);
      const endDate = input.endDate || current!.endDate.toISOString().slice(0, 10);
      this.validateDateRange(startDate, endDate);
    }

    // Check for duplicate label if label is being changed
    if (input.label) {
      const existing = await prisma.academicYear.findFirst({
        where: { schoolId, label: input.label, deletedAt: null, id: { not: id } },
      });
      if (existing) {
        throw new ConflictError(`Academic year with label '${input.label}' already exists`);
      }
    }

    const data: Record<string, unknown> = {};
    if (input.label) data.label = input.label;
    if (input.startDate) data.startDate = new Date(input.startDate);
    if (input.endDate) data.endDate = new Date(input.endDate);

    const updated = await prisma.academicYear.update({
      where: { id },
      data,
    });

    return updated;
  }

  async delete(schoolId: string, id: string) {
    // Ensure it exists
    const ay = await this.getById(schoolId, id);

    // Prevent deleting the active academic year
    if (ay.status === 'ACTIVE') {
      throw new AppError('Cannot delete the active academic year. Deactivate it first.', 400, 'BAD_REQUEST');
    }

    await softDelete('academicYear', id, schoolId);
  }

  async activate(schoolId: string, id: string) {
    // Ensure it exists
    await this.getById(schoolId, id);

    // Deactivate all other academic years for this school, then activate the target
    await prisma.$transaction([
      prisma.academicYear.updateMany({
        where: { schoolId, status: 'ACTIVE' },
        data: { status: 'ARCHIVED' },
      }),
      prisma.academicYear.update({
        where: { id },
        data: { status: 'ACTIVE' },
      }),
    ]);

    const activated = await prisma.academicYear.findUnique({ where: { id } });
    return activated;
  }

  private validateDateRange(startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start >= end) {
      throw new AppError('Start date must be before end date', 400, 'VALIDATION_ERROR');
    }
  }
}
