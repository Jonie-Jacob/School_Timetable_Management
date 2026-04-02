import {
  prisma,
  softDelete,
  NotFoundError,
  ConflictError,
  AppError,
  flagAffectedTimetables,
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
        maxPeriodsPerWeek: input.maxPeriodsPerWeek ?? null,
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
    if (input.maxPeriodsPerWeek !== undefined) data.maxPeriodsPerWeek = input.maxPeriodsPerWeek;

    const updated = await prisma.teacher.update({ where: { id }, data });

    if (input.name !== undefined || input.contact !== undefined) {
      const changes: string[] = [];
      if (input.name !== undefined) changes.push(`name changed to '${input.name}'`);
      if (input.contact !== undefined) changes.push(`contact updated`);

      await flagAffectedTimetables({
        schoolId,
        academicYearId,
        entityType: 'TEACHER',
        entityId: id,
        changeDescription: `Teacher ${changes.join(', ')}`,
      });
    }

    return updated;
  }

  async delete(schoolId: string, academicYearId: string, id: string, confirm: boolean = false) {
    await this.getById(schoolId, academicYearId, id);

    // Check for active assignments where teacher is primary or assistant
    const assignments = await prisma.divisionAssignment.findMany({
      where: {
        deletedAt: null,
        OR: [
          { teacherId: id },
          { assistantTeacherId: id },
        ],
      },
      select: { id: true, divisionId: true, teacherId: true, assistantTeacherId: true },
    });

    if (assignments.length > 0 && !confirm) {
      const affectedDivisionIds = [...new Set(assignments.map(a => a.divisionId))];
      const affectedTimetables = await prisma.timetable.findMany({
        where: { divisionId: { in: affectedDivisionIds }, schoolId },
        select: { id: true, divisionId: true },
      });

      throw new AppError(
        JSON.stringify({
          message: 'Teacher has active assignments. Confirm to proceed with cascade deletion.',
          affectedAssignments: assignments.length,
          affectedTimetables: affectedTimetables.length,
        }),
        409,
        'CONFIRM_REQUIRED',
      );
    }

    if (assignments.length > 0) {
      const primaryAssignmentIds = assignments.filter(a => a.teacherId === id).map(a => a.id);
      const assistantAssignmentIds = assignments.filter(a => a.assistantTeacherId === id).map(a => a.id);

      // Nullify timetable slots for assignments where this teacher is primary
      if (primaryAssignmentIds.length > 0) {
        await prisma.timetableSlot.updateMany({
          where: { divisionAssignmentId: { in: primaryAssignmentIds } },
          data: { divisionAssignmentId: null },
        });

        // Soft-delete primary assignments
        await prisma.divisionAssignment.updateMany({
          where: { id: { in: primaryAssignmentIds } },
          data: { deletedAt: new Date() },
        });
      }

      // Clear assistant teacher from assignments where this teacher is assistant
      if (assistantAssignmentIds.length > 0) {
        await prisma.divisionAssignment.updateMany({
          where: { id: { in: assistantAssignmentIds } },
          data: { assistantTeacherId: null },
        });
      }

      // Flag affected timetables as OUTDATED
      const affectedDivisionIds = [...new Set(assignments.map(a => a.divisionId))];
      const affectedTimetables = await prisma.timetable.findMany({
        where: { divisionId: { in: affectedDivisionIds }, schoolId },
      });

      for (const tt of affectedTimetables) {
        await prisma.timetable.update({
          where: { id: tt.id },
          data: { status: 'OUTDATED' },
        });

        await prisma.timetableNotification.create({
          data: {
            schoolId,
            timetableId: tt.id,
            divisionId: tt.divisionId,
            conflictType: 'TEACHER_DELETED',
            changeDescription: `Teacher was deleted. Affected assignments removed or updated. Timetable slots set to empty.`,
          },
        });
      }
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

    await flagAffectedTimetables({
      schoolId,
      academicYearId,
      entityType: 'TEACHER',
      entityId: teacherId,
      changeDescription: `Teacher qualifications updated (${input.subjectIds.length} subject(s))`,
    });

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

    await flagAffectedTimetables({
      schoolId,
      academicYearId,
      entityType: 'AVAILABILITY',
      entityId: teacherId,
      changeDescription: `Teacher availability updated (${input.unavailableSlots.length} unavailable slot(s))`,
    });

    return this.getById(schoolId, academicYearId, teacherId);
  }
}
