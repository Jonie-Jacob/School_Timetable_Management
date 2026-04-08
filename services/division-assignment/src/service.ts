import {
  prisma, softDelete, NotFoundError, ConflictError, AppError,
  flagAffectedTimetables,
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

    // Duplicate prevention: same subject + division + teacher combination
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        electiveGroupId: input.electiveGroupId ?? null,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError('This subject is already assigned to this teacher in this division');
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
        schedulingPreferences: input.schedulingPreferences ?? undefined,
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
    if (input.schedulingPreferences !== undefined) data.schedulingPreferences = input.schedulingPreferences;

    const updated = await prisma.divisionAssignment.update({
      where: { id },
      data,
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    });

    // If this is an elective group assignment and teacher changed, sync across divisions
    if (input.teacherId && assignment.electiveGroupId) {
      const div = await prisma.division.findFirst({ where: { id: assignment.divisionId } });
      if (div) {
        await prisma.divisionAssignment.updateMany({
          where: {
            schoolId,
            academicYearId,
            electiveGroupId: assignment.electiveGroupId,
            subjectId: assignment.subjectId,
            deletedAt: null,
            divisionId: { not: assignment.divisionId },
            division: { classId: div.classId },
          },
          data: { teacherId: input.teacherId },
        });
      }
    }

    await flagAffectedTimetables({
      schoolId,
      academicYearId,
      entityType: 'ASSIGNMENT',
      entityId: id,
      changeDescription: `Assignment updated (${Object.keys(data).join(', ')} changed)`,
    });

    return updated;
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

    await flagAffectedTimetables({
      schoolId,
      academicYearId,
      entityType: 'ASSIGNMENT',
      entityId: id,
      changeDescription: `Assignment deleted`,
      isDeleted: true,
    });

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

    // Cross-division elective enforcement: if same elective group is assigned
    // to another division of the same class, enforce same teachers
    const division = await this.ensureDivisionExists(schoolId, divisionId);
    const existingCrossDivAssignments = await prisma.divisionAssignment.findMany({
      where: {
        schoolId,
        academicYearId,
        electiveGroupId: input.electiveGroupId,
        subjectId: input.subjectId,
        deletedAt: null,
        divisionId: { not: divisionId },
        division: { classId: division.classId, deletedAt: null },
      },
      select: { teacherId: true, divisionId: true },
    });

    if (existingCrossDivAssignments.length > 0) {
      const requiredTeacherId = existingCrossDivAssignments[0].teacherId;
      if (input.teacherId !== requiredTeacherId) {
        throw new AppError(
          `This elective group is shared across divisions of the same class. The teacher for this subject must be '${requiredTeacherId}' to match the existing assignment.`,
          400,
          'CROSS_DIVISION_TEACHER_MISMATCH',
        );
      }
    }

    // Duplicate check: same subject + division + elective group + teacher
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
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
        schedulingPreferences: input.schedulingPreferences ?? undefined,
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

    const updated = await prisma.electiveGroup.update({
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

    await flagAffectedTimetables({
      schoolId,
      academicYearId,
      entityType: 'ELECTIVE_GROUP',
      entityId: id,
      changeDescription: `Elective group updated${input.name ? ` (name changed to '${input.name}')` : ''}`,
    });

    return updated;
  }

  async deleteElectiveGroup(schoolId: string, academicYearId: string, id: string) {
    await this.getElectiveGroup(schoolId, academicYearId, id);

    const assignmentCount = await prisma.divisionAssignment.count({
      where: { electiveGroupId: id, deletedAt: null },
    });
    if (assignmentCount > 0) {
      throw new AppError('Cannot delete elective group with active assignments. Remove assignments first.', 400, 'BAD_REQUEST');
    }

    await flagAffectedTimetables({
      schoolId,
      academicYearId,
      entityType: 'ELECTIVE_GROUP',
      entityId: id,
      changeDescription: `Elective group deleted`,
      isDeleted: true,
    });

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

  // ── Unassigned Teacher Subjects ──

  async getUnassignedTeacherSubjects(
    schoolId: string,
    academicYearId: string,
    filters?: { classId?: string; subjectId?: string; teacherId?: string }
  ) {
    // Get all teacher-subject pairs for this school/year
    const teacherSubjects = await prisma.teacherSubject.findMany({
      where: {
        schoolId,
        teacher: { academicYearId, deletedAt: null, ...(filters?.teacherId ? { id: filters.teacherId } : {}) },
        subject: { academicYearId, deletedAt: null, ...(filters?.subjectId ? { id: filters.subjectId } : {}) },
      },
      include: {
        teacher: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
      },
    });

    // Get all active division assignments
    const assignedPairs = await prisma.divisionAssignment.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      select: { teacherId: true, subjectId: true },
    });

    const assignedSet = new Set(
      assignedPairs.map((a) => `${a.teacherId}:${a.subjectId}`)
    );

    // Filter to unassigned
    let unassigned = teacherSubjects.filter(
      (ts) => !assignedSet.has(`${ts.teacherId}:${ts.subjectId}`)
    );

    // If filtering by class, further filter to subjects that could be assigned to divisions of that class
    // (This is informational — any subject can be assigned to any division)

    return unassigned.map((ts) => ({
      teacherSubjectId: ts.id,
      teacherId: ts.teacherId,
      teacherName: ts.teacher.name,
      subjectId: ts.subjectId,
      subjectName: ts.subject.name,
    }));
  }

  async quickAssign(
    schoolId: string,
    academicYearId: string,
    input: { teacherId: string; subjectId: string; divisionId: string; weightage: number }
  ) {
    await this.ensureDivisionExists(schoolId, input.divisionId);
    await this.validateTeacherSubject(schoolId, input.teacherId, input.subjectId);

    // Check for duplicate
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId, academicYearId,
        divisionId: input.divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError('This subject is already assigned to this teacher in this division');
    }

    // Check for scheduling conflicts
    const conflicts: Array<{ divisionId: string; divisionLabel: string; className: string }> = [];

    // Find if teacher is already assigned in other divisions that have timetables
    const otherAssignments = await prisma.divisionAssignment.findMany({
      where: {
        schoolId, academicYearId,
        teacherId: input.teacherId,
        deletedAt: null,
        divisionId: { not: input.divisionId },
      },
      include: {
        division: {
          select: { id: true, label: true, class: { select: { name: true } } },
        },
        timetableSlots: {
          select: { workingDayId: true, slotId: true },
        },
      },
    });

    // Get timetable slots for the target division
    const targetTimetable = await prisma.timetable.findFirst({
      where: { schoolId, academicYearId, divisionId: input.divisionId },
    });

    if (targetTimetable) {
      const targetSlots = await prisma.timetableSlot.findMany({
        where: { timetableId: targetTimetable.id },
        select: { workingDayId: true, slotId: true },
      });

      const targetSlotSet = new Set(
        targetSlots.map((s) => `${s.workingDayId}:${s.slotId}`)
      );

      for (const oa of otherAssignments) {
        for (const ts of oa.timetableSlots) {
          if (targetSlotSet.has(`${ts.workingDayId}:${ts.slotId}`)) {
            conflicts.push({
              divisionId: oa.division.id,
              divisionLabel: oa.division.label,
              className: oa.division.class.name,
            });
            break;
          }
        }
      }
    }

    // Create the assignment regardless of conflicts
    const assignment = await prisma.divisionAssignment.create({
      data: {
        schoolId, academicYearId,
        divisionId: input.divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId,
        weightage: input.weightage,
      },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    });

    // If conflicts exist, create notifications
    if (conflicts.length > 0 && targetTimetable) {
      await prisma.timetableNotification.createMany({
        data: conflicts.map((c) => ({
          schoolId,
          timetableId: targetTimetable.id,
          divisionId: input.divisionId,
          conflictType: 'ASSIGNMENT_CHANGED' as const,
          changeDescription: `Teacher ${assignment.teacher.name} has a scheduling conflict with ${c.className}-${c.divisionLabel}`,
        })),
      });
    }

    return { assignment, conflicts };
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
