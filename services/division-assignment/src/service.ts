import {
  prisma, softDelete, NotFoundError, ConflictError, AppError,
  type CreateAssignmentDto, type UpdateAssignmentDto,
  type CreateElectiveGroupDto, type UpdateElectiveGroupDto,
  type AddElectiveSubjectDto,
} from '@timetable/shared';

export class AssignmentService {
  // ── Division Assignments ──

  async listAssignments(schoolId: string, academicYearId: string, divisionId: string) {
    await this.ensureDivisionExists(schoolId, divisionId);

    return prisma.divisionAssignment.findMany({
      where: { schoolId, academicYearId, divisionId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    });
  }

  async createAssignment(schoolId: string, academicYearId: string, divisionId: string, input: CreateAssignmentDto) {
    await this.ensureDivisionExists(schoolId, divisionId);
    await this.validateTeacherSubject(schoolId, input.teacherId, input.subjectId);

    if (input.assistantTeacherId) {
      await this.ensureTeacherExists(schoolId, input.assistantTeacherId);
    }

    // Duplicate prevention: same subject + division (unless different elective group)
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        electiveGroupId: input.electiveGroupId ?? null,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError('This subject is already assigned to this division');
    }

    if (input.electiveGroupId) {
      await this.ensureElectiveGroupExists(schoolId, academicYearId, input.electiveGroupId);
    }

    return prisma.divisionAssignment.create({
      data: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        assistantTeacherId: input.assistantTeacherId ?? null,
        weightage: input.weightage,
        electiveGroupId: input.electiveGroupId ?? null,
      },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    });
  }

  async updateAssignment(schoolId: string, academicYearId: string, id: string, input: UpdateAssignmentDto) {
    const assignment = await prisma.divisionAssignment.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
    });
    if (!assignment) throw new NotFoundError('Assignment', id);

    if (input.teacherId) {
      await this.validateTeacherSubject(schoolId, input.teacherId, assignment.subjectId);
    }

    if (input.assistantTeacherId) {
      await this.ensureTeacherExists(schoolId, input.assistantTeacherId);
    }

    const data: Record<string, unknown> = {};
    if (input.teacherId !== undefined) data.teacherId = input.teacherId;
    if (input.assistantTeacherId !== undefined) data.assistantTeacherId = input.assistantTeacherId;
    if (input.weightage !== undefined) data.weightage = input.weightage;

    return prisma.divisionAssignment.update({
      where: { id },
      data,
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    });
  }

  async deleteAssignment(schoolId: string, academicYearId: string, id: string) {
    const assignment = await prisma.divisionAssignment.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
    });
    if (!assignment) throw new NotFoundError('Assignment', id);

    // Check for timetable slots referencing this assignment
    const slotCount = await prisma.timetableSlot.count({
      where: { divisionAssignmentId: id },
    });
    if (slotCount > 0) {
      throw new AppError('Cannot delete assignment with active timetable slots. Remove timetable data first.', 400, 'BAD_REQUEST');
    }

    await softDelete('divisionAssignment', id, schoolId);
  }

  async createElectiveAssignment(schoolId: string, academicYearId: string, divisionId: string, input: CreateAssignmentDto) {
    await this.ensureDivisionExists(schoolId, divisionId);

    if (!input.electiveGroupId) {
      throw new AppError('electiveGroupId is required for elective assignments', 400, 'VALIDATION_ERROR');
    }

    const group = await this.ensureElectiveGroupExists(schoolId, academicYearId, input.electiveGroupId);

    // Verify the subject belongs to the elective group
    const groupSubject = await prisma.electiveGroupSubject.findFirst({
      where: { electiveGroupId: input.electiveGroupId, subjectId: input.subjectId },
    });
    if (!groupSubject) {
      throw new AppError('Subject does not belong to this elective group', 400, 'VALIDATION_ERROR');
    }

    await this.validateTeacherSubject(schoolId, input.teacherId, input.subjectId);

    if (input.assistantTeacherId) {
      await this.ensureTeacherExists(schoolId, input.assistantTeacherId);
    }

    // Duplicate check: same subject + division + elective group
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        electiveGroupId: input.electiveGroupId,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError('This elective subject is already assigned to this division');
    }

    return prisma.divisionAssignment.create({
      data: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        assistantTeacherId: input.assistantTeacherId ?? null,
        weightage: input.weightage,
        electiveGroupId: input.electiveGroupId,
      },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    });
  }

  // ── Elective Groups ──

  async createElectiveGroup(schoolId: string, academicYearId: string, input: CreateElectiveGroupDto) {
    const existing = await prisma.electiveGroup.findFirst({
      where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) throw new ConflictError(`Elective group '${input.name}' already exists`);

    return prisma.electiveGroup.create({
      data: { schoolId, academicYearId, name: input.name },
    });
  }

  async listElectiveGroups(schoolId: string, academicYearId: string) {
    return prisma.electiveGroup.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        subjects: {
          include: {
            subject: { select: { id: true, name: true } },
          },
        },
        _count: { select: { divisionAssignments: { where: { deletedAt: null } } } },
      },
    });
  }

  async getElectiveGroup(schoolId: string, academicYearId: string, id: string) {
    const group = await prisma.electiveGroup.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
      include: {
        subjects: {
          include: {
            subject: { select: { id: true, name: true } },
          },
        },
        _count: { select: { divisionAssignments: { where: { deletedAt: null } } } },
      },
    });
    if (!group) throw new NotFoundError('Elective group', id);
    return group;
  }

  async updateElectiveGroup(schoolId: string, academicYearId: string, id: string, input: UpdateElectiveGroupDto) {
    await this.getElectiveGroup(schoolId, academicYearId, id);

    if (input.name) {
      const existing = await prisma.electiveGroup.findFirst({
        where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null, id: { not: id } },
      });
      if (existing) throw new ConflictError(`Elective group '${input.name}' already exists`);
    }

    return prisma.electiveGroup.update({
      where: { id },
      data: { ...(input.name !== undefined && { name: input.name }) },
      include: {
        subjects: {
          include: {
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  async deleteElectiveGroup(schoolId: string, academicYearId: string, id: string) {
    await this.getElectiveGroup(schoolId, academicYearId, id);

    const assignmentCount = await prisma.divisionAssignment.count({
      where: { electiveGroupId: id, deletedAt: null },
    });
    if (assignmentCount > 0) {
      throw new AppError('Cannot delete elective group with active assignments. Remove assignments first.', 400, 'BAD_REQUEST');
    }

    await softDelete('electiveGroup', id, schoolId);
  }

  async addElectiveSubject(schoolId: string, academicYearId: string, groupId: string, input: AddElectiveSubjectDto) {
    await this.getElectiveGroup(schoolId, academicYearId, groupId);

    // Verify subject exists
    const subject = await prisma.subject.findFirst({
      where: { id: input.subjectId, schoolId, deletedAt: null },
    });
    if (!subject) throw new NotFoundError('Subject', input.subjectId);

    // Duplicate check
    const existing = await prisma.electiveGroupSubject.findFirst({
      where: { electiveGroupId: groupId, subjectId: input.subjectId },
    });
    if (existing) throw new ConflictError('Subject is already in this elective group');

    return prisma.electiveGroupSubject.create({
      data: { schoolId, electiveGroupId: groupId, subjectId: input.subjectId },
      include: {
        subject: { select: { id: true, name: true } },
      },
    });
  }

  async removeElectiveSubject(schoolId: string, _academicYearId: string, groupId: string, subjectId: string) {
    const link = await prisma.electiveGroupSubject.findFirst({
      where: { electiveGroupId: groupId, subjectId, school: { id: schoolId } },
    });
    if (!link) throw new NotFoundError('Elective group subject');

    // Check if any assignments reference this subject+group combination
    const assignmentCount = await prisma.divisionAssignment.count({
      where: { electiveGroupId: groupId, subjectId, deletedAt: null },
    });
    if (assignmentCount > 0) {
      throw new AppError('Cannot remove subject from group while assignments reference it. Remove assignments first.', 400, 'BAD_REQUEST');
    }

    await prisma.electiveGroupSubject.delete({ where: { id: link.id } });
  }

  // ── Helpers ──

  private async ensureDivisionExists(schoolId: string, divisionId: string) {
    const division = await prisma.division.findFirst({
      where: { id: divisionId, schoolId, deletedAt: null },
    });
    if (!division) throw new NotFoundError('Division', divisionId);
    return division;
  }

  private async ensureTeacherExists(schoolId: string, teacherId: string) {
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Teacher', teacherId);
    return teacher;
  }

  private async validateTeacherSubject(schoolId: string, teacherId: string, subjectId: string) {
    await this.ensureTeacherExists(schoolId, teacherId);

    const subject = await prisma.subject.findFirst({
      where: { id: subjectId, schoolId, deletedAt: null },
    });
    if (!subject) throw new NotFoundError('Subject', subjectId);

    const teacherSubject = await prisma.teacherSubject.findFirst({
      where: { teacherId, subjectId, schoolId },
    });
    if (!teacherSubject) {
      throw new AppError('Teacher is not qualified to teach this subject', 400, 'VALIDATION_ERROR');
    }
  }

  private async ensureElectiveGroupExists(schoolId: string, academicYearId: string, groupId: string) {
    const group = await prisma.electiveGroup.findFirst({
      where: { id: groupId, schoolId, academicYearId, deletedAt: null },
    });
    if (!group) throw new NotFoundError('Elective group', groupId);
    return group;
  }
}
