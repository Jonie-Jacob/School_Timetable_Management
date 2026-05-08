import {
  prisma, softDelete, NotFoundError, ConflictError, AppError,
  flagTimetables,
  findAffectedTimetableIds, recomputeMultipleTimetableStatuses,
  checkDuplicateName,
  type CreateClassDto, type UpdateClassDto,
  type CreateDivisionDto, type UpdateDivisionDto,
  type UpdateSortOrderDto,
} from '@timetable/shared';

export class ClassService {
  // ── Class CRUD ──

  async create(schoolId: string, academicYearId: string, input: CreateClassDto) {
    await checkDuplicateName({ model: 'class', name: input.name, schoolId, academicYearId });

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
            periodStructureId: true,
            periodStructure: { select: { id: true, name: true } },
            classTeacherId: true,
            classTeacher: { select: { id: true, name: true } },
            timetables: { select: { id: true, status: true, statusJson: true, generatedAt: true }, take: 1 },
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
            periodStructure: { select: { id: true, name: true } },
            classTeacher: { select: { id: true, name: true } },
            timetables: { select: { id: true, status: true, statusJson: true, generatedAt: true }, take: 1 },
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
      await checkDuplicateName({ model: 'class', name: input.name, schoolId, academicYearId, excludeId: id });
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

  async updateSortOrder(schoolId: string, academicYearId: string, input: UpdateSortOrderDto) {
    // Verify all class IDs belong to this school
    const classIds = input.order.map((o: { classId: string; sortOrder: number }) => o.classId);
    const classes = await prisma.class.findMany({
      where: { id: { in: classIds }, schoolId, academicYearId, deletedAt: null },
    });
    if (classes.length !== classIds.length) {
      throw new NotFoundError('Class', 'some class IDs not found');
    }

    // Update sort order in a transaction
    await prisma.$transaction(
      input.order.map((o: { classId: string; sortOrder: number }) =>
        prisma.class.update({
          where: { id: o.classId },
          data: { sortOrder: o.sortOrder },
        })
      )
    );

    return { updated: input.order.length };
  }

  // ── Class Teacher ──

  async setClassTeacher(schoolId: string, academicYearId: string, classId: string, divisionId: string, teacherId: string) {
    await this.getById(schoolId, academicYearId, classId);

    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, classId, deletedAt: null },
    });
    if (!division) throw new NotFoundError('Division', divisionId);

    // Verify teacher exists
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Teacher', teacherId);

    return prisma.division.update({
      where: { id: divisionId },
      data: { classTeacherId: teacherId },
      include: { classTeacher: { select: { id: true, name: true } } },
    });
  }

  async analyzeClassTeacher(schoolId: string, academicYearId: string, classId: string, divisionId: string, teacherId: string) {
    await this.getById(schoolId, academicYearId, classId);

    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, classId, deletedAt: null },
      include: { class: { select: { name: true } } },
    });
    if (!division) throw new NotFoundError('Division', divisionId);

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Teacher', teacherId);

    // Check if teacher already has assignments in this division
    const existingAssignments = await prisma.divisionAssignment.findMany({
      where: { divisionId, teacherId, deletedAt: null },
      include: { subject: { select: { id: true, name: true } } },
    });

    if (existingAssignments.length > 0) {
      // Case A: Teacher already teaches here
      return {
        case: 'A' as const,
        teacher: { id: teacher.id, name: teacher.name },
        alreadyInDivision: true,
        swapOptions: [],
        warning: null,
      };
    }

    // Teacher doesn't teach in this division -- find what they teach elsewhere
    const teacherAssignmentsElsewhere = await prisma.divisionAssignment.findMany({
      where: { teacherId, schoolId, academicYearId, deletedAt: null, divisionId: { not: divisionId } },
      include: {
        subject: { select: { id: true, name: true } },
        division: {
          select: { id: true, label: true, classTeacherId: true, class: { select: { id: true, name: true } } },
        },
      },
    });

    if (teacherAssignmentsElsewhere.length === 0) {
      // Case C: Teacher has no assignments anywhere
      return {
        case: 'C' as const,
        teacher: { id: teacher.id, name: teacher.name },
        alreadyInDivision: false,
        swapOptions: [],
        warning: "This teacher doesn't have any subject assignments. They will be set as class teacher without a swap.",
      };
    }

    // Build swap options: for each subject the teacher teaches elsewhere,
    // check if someone else teaches that subject in the target division
    const swapOptions = [];

    for (const ta of teacherAssignmentsElsewhere) {
      // Find who teaches the same subject in the target division
      const targetAssignment = await prisma.divisionAssignment.findFirst({
        where: { divisionId, subjectId: ta.subjectId, deletedAt: null },
        include: { teacher: { select: { id: true, name: true } } },
      });

      if (targetAssignment) {
        // Check if the current teacher in target is class teacher of the source division
        const isClassTeacherOfSource = ta.division.classTeacherId === targetAssignment.teacherId;
        // Check if the current teacher in target is class teacher of target division
        const isClassTeacherOfTarget = division.classTeacherId === targetAssignment.teacherId;

        swapOptions.push({
          subjectId: ta.subjectId,
          subjectName: ta.subject.name,
          fromDivision: {
            id: ta.division.id,
            label: ta.division.label,
            className: ta.division.class.name,
          },
          fromAssignmentId: ta.id,
          targetAssignmentId: targetAssignment.id,
          currentTeacherInTarget: {
            id: targetAssignment.teacher.id,
            name: targetAssignment.teacher.name,
          },
          currentTeacherIsClassTeacherOfSource: isClassTeacherOfSource,
          currentTeacherIsClassTeacherOfTarget: isClassTeacherOfTarget,
        });
      }
    }

    if (swapOptions.length === 0) {
      // Case C: Teacher teaches subjects elsewhere but none of those subjects exist in this division
      return {
        case: 'C' as const,
        teacher: { id: teacher.id, name: teacher.name },
        alreadyInDivision: false,
        swapOptions: [],
        warning: "This teacher's subjects are not assigned in this division. They will be set as class teacher without a swap.",
      };
    }

    // Case B: Swap possible
    return {
      case: 'B' as const,
      teacher: { id: teacher.id, name: teacher.name },
      alreadyInDivision: false,
      swapOptions,
      warning: null,
    };
  }

  async executeClassTeacherSwap(
    schoolId: string,
    academicYearId: string,
    classId: string,
    divisionId: string,
    input: { teacherId: string; fromAssignmentId: string; targetAssignmentId: string }
  ) {
    await this.getById(schoolId, academicYearId, classId);

    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, classId, deletedAt: null },
    });
    if (!division) throw new NotFoundError('Division', divisionId);

    // Load both assignments
    const fromAssignment = await prisma.divisionAssignment.findFirst({
      where: { id: input.fromAssignmentId, schoolId, deletedAt: null },
      include: { division: { select: { id: true, label: true, classTeacherId: true, class: { select: { name: true } } } } },
    });
    if (!fromAssignment) throw new NotFoundError('Assignment', input.fromAssignmentId);

    const targetAssignment = await prisma.divisionAssignment.findFirst({
      where: { id: input.targetAssignmentId, schoolId, deletedAt: null },
    });
    if (!targetAssignment) throw new NotFoundError('Assignment', input.targetAssignmentId);

    const displacedTeacherId = targetAssignment.teacherId;
    const warnings: string[] = [];

    // Check if displaced teacher is class teacher of the source division
    if (fromAssignment.division.classTeacherId === displacedTeacherId) {
      warnings.push(`${displacedTeacherId} was class teacher of ${fromAssignment.division.class.name} - ${fromAssignment.division.label} and has been unset.`);
    }

    // Execute swap in transaction
    await prisma.$transaction([
      // Swap: move incoming teacher to target division's assignment
      prisma.divisionAssignment.update({
        where: { id: input.targetAssignmentId },
        data: { teacherId: input.teacherId },
      }),
      // Swap: move displaced teacher to source division's assignment
      prisma.divisionAssignment.update({
        where: { id: input.fromAssignmentId },
        data: { teacherId: displacedTeacherId },
      }),
      // Set class teacher on target division
      prisma.division.update({
        where: { id: divisionId },
        data: { classTeacherId: input.teacherId },
      }),
      // If displaced teacher was class teacher of source division, unset
      ...(fromAssignment.division.classTeacherId === displacedTeacherId
        ? [prisma.division.update({
            where: { id: fromAssignment.divisionId },
            data: { classTeacherId: null },
          })]
        : []),
    ]);

    // Flag affected timetables as OUTDATED
    const affectedDivisionIds = [divisionId, fromAssignment.divisionId];
    const result = await flagTimetables({
      schoolId,
      divisionIds: affectedDivisionIds,
      conflictType: 'ASSIGNMENT_CHANGED',
      changeDescription: 'Teacher assignment swapped due to class teacher assignment.',
    });
    const classSwapTtIds = await findAffectedTimetableIds({ schoolId, divisionIds: affectedDivisionIds, entityType: 'DIVISION', entityId: '' });
    await recomputeMultipleTimetableStatuses(classSwapTtIds);

    if (result.affectedCount > 0) {
      warnings.push(`${result.affectedCount} timetable(s) flagged as outdated.`);
    }

    return {
      swapped: true,
      affectedDivisionIds,
      warnings,
    };
  }

  async removeClassTeacher(schoolId: string, academicYearId: string, classId: string, divisionId: string) {
    await this.getById(schoolId, academicYearId, classId);

    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, classId, deletedAt: null },
    });
    if (!division) throw new NotFoundError('Division', divisionId);

    return prisma.division.update({
      where: { id: divisionId },
      data: { classTeacherId: null },
    });
  }

  async bulkSetClassTeacher(schoolId: string, academicYearId: string, assignments: Array<{ divisionId: string; teacherId: string }>) {
    // Validate all divisions belong to this school
    const divisionIds = assignments.map(a => a.divisionId);
    const divisions = await prisma.division.findMany({
      where: { id: { in: divisionIds }, schoolId, academicYearId, deletedAt: null },
    });
    if (divisions.length !== divisionIds.length) {
      throw new NotFoundError('Division', 'some division IDs not found');
    }

    // Validate each teacher has assignments in their respective division
    for (const { divisionId, teacherId } of assignments) {
      const count = await prisma.divisionAssignment.count({
        where: { divisionId, teacherId, deletedAt: null },
      });
      if (count === 0) {
        throw new AppError(
          `Teacher does not have any assignments in division ${divisionId}`,
          400,
          'BAD_REQUEST'
        );
      }
    }

    await prisma.$transaction(
      assignments.map(({ divisionId, teacherId }) =>
        prisma.division.update({
          where: { id: divisionId },
          data: { classTeacherId: teacherId },
        })
      )
    );

    return { updated: assignments.length };
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
