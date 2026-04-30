import {
  prisma, softDelete, NotFoundError, ConflictError, AppError,
  flagTimetables,
  type CreateAssignmentDto, type UpdateAssignmentDto,
  type CreateElectiveGroupDto, type UpdateElectiveGroupDto,
  type AddElectiveSubjectDto, type UpdateElectiveSubjectDto,
  type BulkSaveElectiveGroupDto,
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
        electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
      },
    });
  }

  async createAssignment(schoolId: string, academicYearId: string, divisionId: string, input: CreateAssignmentDto) {
    await this.ensureDivisionExists(schoolId, divisionId);
    if (input.teacherId) {
      await this.validateTeacherSubject(schoolId, input.teacherId, input.subjectId);
    } else {
      // No teacher: still verify subject exists
      const subject = await prisma.subject.findFirst({
        where: { id: input.subjectId, schoolId, deletedAt: null },
      });
      if (!subject) throw new NotFoundError('Subject', input.subjectId);
    }

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
        teacherId: input.teacherId ?? null,
        electiveGroupId: input.electiveGroupId ?? null,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError(
        input.teacherId
          ? 'This subject is already assigned to this teacher in this division'
          : 'This subject already has an unassigned entry in this division',
      );
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
        teacherId: input.teacherId ?? null,
        assistantTeacherId: input.assistantTeacherId ?? null,
        weightage: input.weightage,
        electiveGroupId: input.electiveGroupId ?? null,
        schedulingPreferences: input.schedulingPreferences ?? undefined,
      },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
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
    if (input.teacherId !== undefined) data.teacherId = input.teacherId; // null clears teacher
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
        electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
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

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'ASSIGNMENT',
      entityId: id,
      conflictType: 'ASSIGNMENT_CHANGED',
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

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'ASSIGNMENT',
      entityId: id,
      conflictType: 'ASSIGNMENT_CHANGED',
      changeDescription: `Assignment deleted`,
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

    // Allocation check: sum of teacher weightages for this (division, subject, group)
    // must not exceed parallelSections × periodsPerWeek.
    if (group.periodsPerWeek > 0) {
      const required = groupSubject.parallelSections * group.periodsPerWeek;
      const existingAlloc = await prisma.divisionAssignment.aggregate({
        where: {
          schoolId,
          academicYearId,
          divisionId,
          subjectId: input.subjectId,
          electiveGroupId: input.electiveGroupId,
          deletedAt: null,
        },
        _sum: { weightage: true },
      });
      const allocated = existingAlloc._sum.weightage ?? 0;
      if (allocated + input.weightage > required) {
        throw new AppError(
          `Over-allocation: this assignment would make total ${allocated + input.weightage} hrs, but only ${required} hrs are available (${groupSubject.parallelSections} section(s) × ${group.periodsPerWeek} hrs). Currently allocated: ${allocated} hrs.`,
          400,
          'ELECTIVE_OVER_ALLOCATION',
        );
      }
    }

    if (input.teacherId) {
      await this.validateTeacherSubject(schoolId, input.teacherId, input.subjectId);
    }

    if (input.assistantTeacherId) {
      await this.ensureTeacherExists(schoolId, input.assistantTeacherId);
    }

    // Cross-division elective enforcement: if same elective group is assigned
    // to another division of the same class, enforce same teachers.
    // Skip enforcement entirely when either side has no teacher.
    const division = await this.ensureDivisionExists(schoolId, divisionId);
    if (input.teacherId) {
      const existingCrossDivAssignments = await prisma.divisionAssignment.findMany({
        where: {
          schoolId,
          academicYearId,
          electiveGroupId: input.electiveGroupId,
          subjectId: input.subjectId,
          deletedAt: null,
          divisionId: { not: divisionId },
          division: { classId: division.classId, deletedAt: null },
          teacherId: { not: null },
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
    }

    // Duplicate check: same subject + division + elective group + teacher
    const existing = await prisma.divisionAssignment.findFirst({
      where: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId ?? null,
        electiveGroupId: input.electiveGroupId,
        deletedAt: null,
      },
    });
    if (existing) {
      throw new ConflictError('This elective subject is already assigned to this division');
    }

    const created = await prisma.divisionAssignment.create({
      data: {
        schoolId,
        academicYearId,
        divisionId,
        subjectId: input.subjectId,
        teacherId: input.teacherId ?? null,
        assistantTeacherId: input.assistantTeacherId ?? null,
        weightage: input.weightage,
        electiveGroupId: input.electiveGroupId,
        schedulingPreferences: input.schedulingPreferences ?? undefined,
      },
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        assistantTeacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
      },
    });

    // Auto-sync: for cross-division elective groups, create the same assignment
    // in all sibling divisions of the same class that don't already have it.
    // This ensures all divisions in a cross-div elective stay in sync.
    const siblingDivisions = await prisma.division.findMany({
      where: {
        classId: division.classId,
        deletedAt: null,
        id: { not: divisionId },
      },
      select: { id: true },
    });

    for (const sibling of siblingDivisions) {
      // Check if sibling already has an assignment for this elective group
      const siblingHasGroup = await prisma.divisionAssignment.findFirst({
        where: {
          divisionId: sibling.id,
          electiveGroupId: input.electiveGroupId,
          deletedAt: null,
        },
      });
      // Only auto-create if the sibling already participates in this elective group
      // (has at least one assignment for it) -- otherwise it's a per-division elective
      if (!siblingHasGroup) continue;

      // Check if this specific (subject + teacher) already exists in the sibling
      const exists = await prisma.divisionAssignment.findFirst({
        where: {
          schoolId,
          academicYearId,
          divisionId: sibling.id,
          subjectId: input.subjectId,
          teacherId: input.teacherId ?? null,
          electiveGroupId: input.electiveGroupId,
          deletedAt: null,
        },
      });
      if (!exists) {
        await prisma.divisionAssignment.create({
          data: {
            schoolId,
            academicYearId,
            divisionId: sibling.id,
            subjectId: input.subjectId,
            teacherId: input.teacherId ?? null,
            assistantTeacherId: input.assistantTeacherId ?? null,
            weightage: input.weightage,
            electiveGroupId: input.electiveGroupId,
            schedulingPreferences: input.schedulingPreferences ?? undefined,
          },
        });
      }
    }

    return created;
  }

  // ── Elective Groups ──

  async createElectiveGroup(schoolId: string, academicYearId: string, input: CreateElectiveGroupDto) {
    const existing = await prisma.electiveGroup.findFirst({
      where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) throw new ConflictError(`Elective group '${input.name}' already exists`);

    return prisma.electiveGroup.create({
      data: {
        schoolId,
        academicYearId,
        name: input.name,
        periodsPerWeek: input.periodsPerWeek,
      },
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

  /**
   * Returns elective groups grouped for UI display.
   * Per-division groups with identical name + teachers + weightage are merged.
   * Cross-division groups are each their own entry.
   */
  async getGroupedElectiveGroups(schoolId: string, academicYearId: string) {
    const groups = await prisma.electiveGroup.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        subjects: {
          include: { subject: { select: { id: true, name: true, abbreviation: true } } },
        },
        divisionAssignments: {
          where: { deletedAt: null },
          include: {
            teacher: { select: { id: true, name: true } },
            assistantTeacher: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true } },
            division: {
              select: {
                id: true, label: true,
                class: { select: { id: true, name: true, sortOrder: true } },
              },
            },
          },
        },
      },
    });

    // Compute per-group metadata
    type GroupMeta = {
      group: typeof groups[0];
      divisionIds: Set<string>;
      classIds: Set<string>;
      isCrossDiv: boolean;
      signature: string;
    };

    const metas: GroupMeta[] = groups.map(g => {
      const divIds = new Set(g.divisionAssignments.map(da => da.divisionId));
      const classIds = new Set(g.divisionAssignments.map(da => da.division.class.id));
      const isCrossDiv = divIds.size > 1;

      // Build signature for grouping per-division electives
      const subjectSig = g.subjects
        .map(s => `${s.subjectId}:${s.parallelSections}`)
        .sort().join('|');
      // Group teachers by subject for signature
      const teachersBySubject = new Map<string, string[]>();
      for (const da of g.divisionAssignments) {
        const key = da.subject.id;
        const tSig = `${da.teacherId ?? ''}:${da.assistantTeacherId ?? ''}:${da.weightage}`;
        if (!teachersBySubject.has(key)) teachersBySubject.set(key, []);
        const existing = teachersBySubject.get(key)!;
        if (!existing.includes(tSig)) existing.push(tSig);
      }
      const teacherSig = Array.from(teachersBySubject.entries())
        .map(([sid, sigs]) => `${sid}=${sigs.sort().join(',')}`)
        .sort().join('|');

      const signature = `${g.periodsPerWeek}||${subjectSig}||${teacherSig}`;

      return { group: g, divisionIds: divIds, classIds, isCrossDiv, signature };
    });

    // Group per-division electives by base name + signature
    type GroupedEntry = {
      displayName: string;
      type: 'per-division' | 'cross-division';
      underlyingGroupIds: string[];
      config: { name: string; periodsPerWeek: number };
      subjects: Array<{
        subjectId: string;
        subjectName: string;
        subjectAbbreviation: string | null;
        parallelSections: number;
        teachers: Array<{
          teacherId: string | null;
          teacherName: string | null;
          assistantTeacherId: string | null;
          assistantTeacherName: string | null;
          weightage: number;
        }>;
      }>;
      divisions: Array<{
        divisionId: string;
        classId: string;
        className: string;
        classSortOrder: number;
        divisionLabel: string;
        subjectIds: string[];
        schedulingPreferences: any;
      }>;
      defaultSchedulingPreferences: any;
    };

    const result: GroupedEntry[] = [];
    const usedGroupIds = new Set<string>();

    // First: cross-division groups (each is its own entry)
    for (const meta of metas) {
      if (!meta.isCrossDiv) continue;
      usedGroupIds.add(meta.group.id);
      const g = meta.group;

      // Extract unique teacher assignments per subject (deduplicate across divisions)
      const subjectTeachers = new Map<string, Map<string, { teacherId: string | null; teacherName: string | null; assistantTeacherId: string | null; assistantTeacherName: string | null; weightage: number }>>();
      for (const da of g.divisionAssignments) {
        if (!subjectTeachers.has(da.subject.id)) subjectTeachers.set(da.subject.id, new Map());
        const tKey = `${da.teacherId}:${da.assistantTeacherId}:${da.weightage}`;
        if (!subjectTeachers.get(da.subject.id)!.has(tKey)) {
          subjectTeachers.get(da.subject.id)!.set(tKey, {
            teacherId: da.teacherId, teacherName: da.teacher?.name ?? null,
            assistantTeacherId: da.assistantTeacherId, assistantTeacherName: da.assistantTeacher?.name ?? null,
            weightage: da.weightage,
          });
        }
      }

      // Build division participation
      const divMap = new Map<string, { divisionId: string; classId: string; className: string; classSortOrder: number; divisionLabel: string; subjectIds: string[]; schedulingPreferences: any }>();
      for (const da of g.divisionAssignments) {
        if (!divMap.has(da.divisionId)) {
          divMap.set(da.divisionId, {
            divisionId: da.divisionId,
            classId: da.division.class.id,
            className: da.division.class.name,
            classSortOrder: da.division.class.sortOrder,
            divisionLabel: da.division.label,
            subjectIds: [],
            schedulingPreferences: null,
          });
        }
        const div = divMap.get(da.divisionId)!;
        if (!div.subjectIds.includes(da.subject.id)) div.subjectIds.push(da.subject.id);
        // Use first assignment's prefs as representative
        if (!div.schedulingPreferences && da.schedulingPreferences) {
          div.schedulingPreferences = da.schedulingPreferences;
        }
      }

      // Derive display name: strip class prefix
      const displayName = g.name.replace(/^class\s+(?:[A-Za-z]+\s+)+?(?=[A-Za-z]+\s*\/)/i, '');

      // Find default scheduling preferences (most common)
      const allPrefs = g.divisionAssignments.map(da => da.schedulingPreferences).filter(Boolean);
      const defaultPrefs = allPrefs.length > 0 ? allPrefs[0] : null;

      result.push({
        displayName,
        type: 'cross-division',
        underlyingGroupIds: [g.id],
        config: { name: g.name, periodsPerWeek: g.periodsPerWeek },
        subjects: g.subjects.map(s => ({
          subjectId: s.subject.id,
          subjectName: s.subject.name,
          subjectAbbreviation: (s.subject as any).abbreviation ?? null,
          parallelSections: s.parallelSections,
          teachers: Array.from(subjectTeachers.get(s.subject.id)?.values() ?? []),
        })),
        divisions: Array.from(divMap.values()).sort((a, b) =>
          a.classSortOrder - b.classSortOrder || a.divisionLabel.localeCompare(b.divisionLabel)
        ),
        defaultSchedulingPreferences: defaultPrefs,
      });
    }

    // Second: per-division groups -- group by base name + signature
    const perDivBuckets = new Map<string, GroupMeta[]>();
    for (const meta of metas) {
      if (meta.isCrossDiv) continue;
      // Base name: strip " (ClassName DivLabel)" suffix
      const baseName = meta.group.name.replace(/^class\s+(?:[A-Za-z]+\s+)+?(?=[A-Za-z]+\s*\/)/i, '').replace(/\s*\([^)]+\)\s*$/, '');
      const bucketKey = `${baseName}||${meta.signature}`;
      if (!perDivBuckets.has(bucketKey)) perDivBuckets.set(bucketKey, []);
      perDivBuckets.get(bucketKey)!.push(meta);
    }

    for (const [, bucket] of perDivBuckets) {
      const first = bucket[0].group;
      const baseName = first.name.replace(/^class\s+(?:[A-Za-z]+\s+)+?(?=[A-Za-z]+\s*\/)/i, '').replace(/\s*\([^)]+\)\s*$/, '');
      const displayName = baseName;

      // Collect teacher assignments from the first group (they're identical across the bucket)
      const subjectTeachers = new Map<string, Array<{ teacherId: string | null; teacherName: string | null; assistantTeacherId: string | null; assistantTeacherName: string | null; weightage: number }>>();
      for (const da of first.divisionAssignments) {
        if (!subjectTeachers.has(da.subject.id)) subjectTeachers.set(da.subject.id, []);
        const tKey = `${da.teacherId}:${da.assistantTeacherId}:${da.weightage}`;
        const arr = subjectTeachers.get(da.subject.id)!;
        if (!arr.some(t => `${t.teacherId}:${t.assistantTeacherId}:${t.weightage}` === tKey)) {
          arr.push({
            teacherId: da.teacherId, teacherName: da.teacher?.name ?? null,
            assistantTeacherId: da.assistantTeacherId, assistantTeacherName: da.assistantTeacher?.name ?? null,
            weightage: da.weightage,
          });
        }
      }

      // Collect all divisions across the bucket
      const divisions: GroupedEntry['divisions'] = [];
      for (const meta of bucket) {
        usedGroupIds.add(meta.group.id);
        for (const da of meta.group.divisionAssignments) {
          if (!divisions.some(d => d.divisionId === da.divisionId)) {
            divisions.push({
              divisionId: da.divisionId,
              classId: da.division.class.id,
              className: da.division.class.name,
              classSortOrder: da.division.class.sortOrder,
              divisionLabel: da.division.label,
              subjectIds: meta.group.divisionAssignments
                .filter(x => x.divisionId === da.divisionId)
                .map(x => x.subject.id)
                .filter((v, i, a) => a.indexOf(v) === i),
              schedulingPreferences: da.schedulingPreferences,
            });
          }
        }
      }
      divisions.sort((a, b) => a.classSortOrder - b.classSortOrder || a.divisionLabel.localeCompare(b.divisionLabel));

      const allPrefs = bucket.flatMap(m => m.group.divisionAssignments.map(da => da.schedulingPreferences)).filter(Boolean);

      result.push({
        displayName,
        type: 'per-division',
        underlyingGroupIds: bucket.map(m => m.group.id),
        config: { name: baseName, periodsPerWeek: first.periodsPerWeek },
        subjects: first.subjects.map(s => ({
          subjectId: s.subject.id,
          subjectName: s.subject.name,
          subjectAbbreviation: (s.subject as any).abbreviation ?? null,
          parallelSections: s.parallelSections,
          teachers: subjectTeachers.get(s.subject.id) ?? [],
        })),
        divisions,
        defaultSchedulingPreferences: allPrefs.length > 0 ? allPrefs[0] : null,
      });
    }

    // Sort: cross-div first, then by display name
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'cross-division' ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

    return result;
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
    const group = await this.getElectiveGroup(schoolId, academicYearId, id);

    if (input.name) {
      const existing = await prisma.electiveGroup.findFirst({
        where: { schoolId, academicYearId, name: { equals: input.name, mode: 'insensitive' }, deletedAt: null, id: { not: id } },
      });
      if (existing) throw new ConflictError(`Elective group '${input.name}' already exists`);
    }

    // Validate that new periodsPerWeek does not cause over-allocation.
    // For every (division, subject) tuple, the existing sum(weightage)
    // must NOT exceed parallelSections * newPeriodsPerWeek. Under-allocation
    // is allowed (admin can add more assignments later).
    if (input.periodsPerWeek !== undefined && input.periodsPerWeek !== group.periodsPerWeek) {
      const assignments = await prisma.divisionAssignment.findMany({
        where: { electiveGroupId: id, deletedAt: null },
        select: { divisionId: true, subjectId: true, weightage: true },
      });
      const sectionsBySubject = new Map<string, number>(
        group.subjects.map((s: any) => [s.subjectId, s.parallelSections as number]),
      );
      const totals = new Map<string, number>();
      for (const a of assignments) {
        const key = `${a.divisionId}|${a.subjectId}`;
        totals.set(key, (totals.get(key) ?? 0) + a.weightage);
      }
      for (const [key, total] of totals) {
        const subjectId = key.split('|')[1];
        const sections = sectionsBySubject.get(subjectId) ?? 1;
        const required = sections * input.periodsPerWeek;
        if (total > required) {
          throw new AppError(
            `Cannot reduce periods/week to ${input.periodsPerWeek}: existing assignments for this group total ${total} hrs for a subject that would only allow ${required} hrs (${sections} section(s) × ${input.periodsPerWeek} hrs). Reduce or remove the over-allocated assignments first.`,
            400,
            'ELECTIVE_OVER_ALLOCATION',
          );
        }
      }
    }

    const updated = await prisma.electiveGroup.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.periodsPerWeek !== undefined && { periodsPerWeek: input.periodsPerWeek }),
      },
      include: {
        subjects: {
          include: {
            subject: { select: { id: true, name: true } },
          },
        },
      },
    });

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'ELECTIVE_GROUP',
      entityId: id,
      conflictType: 'ELECTIVE_GROUP_CHANGED',
      changeDescription: `Elective group updated${input.name ? ` (name changed to '${input.name}')` : ''}${input.periodsPerWeek !== undefined ? ` (periods/week changed to ${input.periodsPerWeek})` : ''}`,
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

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'ELECTIVE_GROUP',
      entityId: id,
      conflictType: 'ELECTIVE_GROUP_CHANGED',
      changeDescription: `Elective group deleted`,
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
      data: {
        schoolId,
        electiveGroupId: groupId,
        subjectId: input.subjectId,
        parallelSections: input.parallelSections ?? 1,
      },
      include: {
        subject: { select: { id: true, name: true } },
      },
    });
  }

  async updateElectiveSubject(
    schoolId: string,
    academicYearId: string,
    groupId: string,
    subjectId: string,
    input: UpdateElectiveSubjectDto,
  ) {
    const group = await this.getElectiveGroup(schoolId, academicYearId, groupId);

    const link = await prisma.electiveGroupSubject.findFirst({
      where: { electiveGroupId: groupId, subjectId, school: { id: schoolId } },
    });
    if (!link) throw new NotFoundError('Elective group subject');

    // Validate that new parallelSections does not cause over-allocation.
    // For each division using this (group, subject), sum(weightage) must NOT
    // exceed parallelSections * periodsPerWeek. Under-allocation is allowed.
    if (group.periodsPerWeek > 0) {
      const assignments = await prisma.divisionAssignment.findMany({
        where: { electiveGroupId: groupId, subjectId, deletedAt: null },
        select: { divisionId: true, weightage: true },
      });
      const totalsByDivision = new Map<string, number>();
      for (const a of assignments) {
        totalsByDivision.set(a.divisionId, (totalsByDivision.get(a.divisionId) ?? 0) + a.weightage);
      }
      const required = input.parallelSections * group.periodsPerWeek;
      for (const [divId, total] of totalsByDivision) {
        if (total > required) {
          throw new AppError(
            `Cannot reduce parallel sections to ${input.parallelSections}: division ${divId} currently has ${total} hrs allocated, which exceeds the new max of ${required} hrs (${input.parallelSections} × ${group.periodsPerWeek}). Reduce or remove the over-allocated assignments first.`,
            400,
            'ELECTIVE_OVER_ALLOCATION',
          );
        }
      }
    }

    const updated = await prisma.electiveGroupSubject.update({
      where: { id: link.id },
      data: { parallelSections: input.parallelSections },
      include: { subject: { select: { id: true, name: true } } },
    });

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'ELECTIVE_GROUP',
      entityId: groupId,
      conflictType: 'ELECTIVE_GROUP_CHANGED',
      changeDescription: `Elective subject parallel sections updated to ${input.parallelSections}`,
    });

    return updated;
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

  // ── Bulk Save Elective Group ──

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async bulkSaveElectiveGroup(schoolId: string, academicYearId: string, input: any) {
    const config = input.config as { name: string; periodsPerWeek: number; type: 'per-division' | 'cross-division' };
    const subjects = input.subjects as Array<{ subjectId: string; parallelSections: number; teachers: Array<{ teacherId: string | null; assistantTeacherId?: string | null; weightage: number }> }>;
    const divisionParticipation = input.divisionParticipation as Record<string, string[]>;
    const defaultSchedulingPreferences = input.defaultSchedulingPreferences as any;
    const perDivisionOverrides = (input.perDivisionOverrides ?? {}) as Record<string, any>;
    const confirmDeleteSlots = input.confirmDeleteSlots as boolean;
    const divisionIds = Object.keys(divisionParticipation);

    if (divisionIds.length === 0) {
      throw new AppError('At least one division must be selected', 400, 'VALIDATION_ERROR');
    }

    // Validate cross-div: all divisions must belong to same class
    if (config.type === 'cross-division') {
      const divisions = await prisma.division.findMany({
        where: { id: { in: divisionIds }, deletedAt: null },
        select: { id: true, classId: true },
      });
      const classIds = new Set(divisions.map(d => d.classId));
      if (classIds.size > 1) {
        throw new AppError('Cross-division electives must be within the same class', 400, 'VALIDATION_ERROR');
      }
    }

    // Load division info for naming
    const divisionInfo = await prisma.division.findMany({
      where: { id: { in: divisionIds }, deletedAt: null },
      select: { id: true, label: true, class: { select: { id: true, name: true } } },
    });
    const divInfoMap = new Map(divisionInfo.map(d => [d.id, d]));

    // Identify existing state (edit mode)
    let existingGroupIds: string[] = [];
    if (input.groupId) {
      // Find all groups in this UI group by checking the grouped endpoint logic
      // For cross-div: just the one groupId
      // For per-div: find all groups with matching base name pattern
      if (config.type === 'cross-division') {
        existingGroupIds = [input.groupId];
      } else {
        // Find all per-division groups that share the same base name
        const sourceGroup = await prisma.electiveGroup.findFirst({
          where: { id: input.groupId, schoolId, deletedAt: null },
        });
        if (sourceGroup) {
          const baseName = sourceGroup.name.replace(/^class\s+(?:[A-Za-z]+\s+)+?(?=[A-Za-z]+\s*\/)/i, '').replace(/\s*\([^)]+\)\s*$/, '');
          const allGroups = await prisma.electiveGroup.findMany({
            where: {
              schoolId, academicYearId, deletedAt: null,
              OR: [
                { name: baseName },
                { name: { startsWith: `${baseName} (` } },
              ],
            },
            select: { id: true },
          });
          existingGroupIds = allGroups.map(g => g.id);
        }
      }
    }

    // Collect existing assignments that will be affected
    const existingAssignments = existingGroupIds.length > 0
      ? await prisma.divisionAssignment.findMany({
          where: { electiveGroupId: { in: existingGroupIds }, deletedAt: null },
          select: { id: true, divisionId: true, subjectId: true, teacherId: true, electiveGroupId: true },
        })
      : [];

    // Check for timetable_slots on assignments that will be removed
    const removedDivisionIds = new Set<string>();
    for (const da of existingAssignments) {
      if (!divisionIds.includes(da.divisionId)) {
        removedDivisionIds.add(da.divisionId);
      }
    }
    if (removedDivisionIds.size > 0 && !confirmDeleteSlots) {
      const slotsCount = await prisma.timetableSlot.count({
        where: {
          divisionAssignment: {
            electiveGroupId: { in: existingGroupIds },
            divisionId: { in: Array.from(removedDivisionIds) },
          },
        },
      });
      if (slotsCount > 0) {
        throw new AppError(
          `Removing divisions will delete ${slotsCount} timetable slot(s). Set confirmDeleteSlots to proceed.`,
          409, 'SLOTS_REQUIRE_CONFIRMATION',
        );
      }
    }

    // Execute in transaction
    return prisma.$transaction(async (tx) => {
      // ── Step 1: Soft-delete old assignments for removed divisions ──
      if (existingGroupIds.length > 0) {
        // Delete timetable_slots for removed assignments
        if (removedDivisionIds.size > 0) {
          await tx.timetableSlot.deleteMany({
            where: {
              divisionAssignment: {
                electiveGroupId: { in: existingGroupIds },
                divisionId: { in: Array.from(removedDivisionIds) },
              },
            },
          });
          await tx.divisionAssignment.updateMany({
            where: {
              electiveGroupId: { in: existingGroupIds },
              divisionId: { in: Array.from(removedDivisionIds) },
              deletedAt: null,
            },
            data: { deletedAt: new Date() },
          });
        }

        // Soft-delete old ElectiveGroup records that are no longer needed
        if (config.type === 'per-division') {
          // For per-div: delete groups whose division is no longer participating
          for (const gId of existingGroupIds) {
            const groupAssignments = existingAssignments.filter(da => da.electiveGroupId === gId);
            const groupDivIds = new Set(groupAssignments.map(da => da.divisionId));
            const stillActive = Array.from(groupDivIds).some(dId => divisionIds.includes(dId));
            if (!stillActive) {
              await tx.electiveGroup.update({ where: { id: gId }, data: { deletedAt: new Date() } });
            }
          }
        }
      }

      // ── Step 2: Create/update ElectiveGroup records ──
      const groupIdByDivision = new Map<string, string>(); // divisionId → electiveGroupId

      if (config.type === 'cross-division') {
        // One shared ElectiveGroup for all divisions
        let groupId: string;
        if (existingGroupIds.length > 0) {
          groupId = existingGroupIds[0];
          await tx.electiveGroup.update({
            where: { id: groupId },
            data: { name: config.name, periodsPerWeek: config.periodsPerWeek, deletedAt: null },
          });
        } else {
          const created = await tx.electiveGroup.create({
            data: { schoolId, academicYearId, name: config.name, periodsPerWeek: config.periodsPerWeek },
          });
          groupId = created.id;
        }
        for (const dId of divisionIds) groupIdByDivision.set(dId, groupId);

        // Upsert ElectiveGroupSubject records
        const existingSubjects = await tx.electiveGroupSubject.findMany({
          where: { electiveGroupId: groupId },
        });
        const existingSubjectIds = new Set(existingSubjects.map(s => s.subjectId));
        const newSubjectIds = new Set(subjects.map(s => s.subjectId));

        // Delete removed subjects
        for (const es of existingSubjects) {
          if (!newSubjectIds.has(es.subjectId)) {
            await tx.electiveGroupSubject.delete({ where: { id: es.id } });
          }
        }
        // Create/update subjects
        for (const sub of subjects) {
          if (existingSubjectIds.has(sub.subjectId)) {
            await tx.electiveGroupSubject.updateMany({
              where: { electiveGroupId: groupId, subjectId: sub.subjectId },
              data: { parallelSections: sub.parallelSections },
            });
          } else {
            await tx.electiveGroupSubject.create({
              data: { schoolId, electiveGroupId: groupId, subjectId: sub.subjectId, parallelSections: sub.parallelSections },
            });
          }
        }
      } else {
        // Per-division: one ElectiveGroup per division
        // Build a map of existing groupId → divisionId
        const existingGroupToDivMap = new Map<string, string>();
        for (const da of existingAssignments) {
          if (!existingGroupToDivMap.has(da.electiveGroupId!)) {
            existingGroupToDivMap.set(da.electiveGroupId!, da.divisionId);
          }
        }

        for (const dId of divisionIds) {
          const div = divInfoMap.get(dId);
          if (!div) continue;
          const groupName = `${config.name} (${div.class.name} ${div.label})`;

          // Find existing group for this division
          let groupId: string | undefined;
          for (const [gId, gDivId] of existingGroupToDivMap) {
            if (gDivId === dId) { groupId = gId; break; }
          }

          if (groupId) {
            await tx.electiveGroup.update({
              where: { id: groupId },
              data: { name: groupName, periodsPerWeek: config.periodsPerWeek, deletedAt: null },
            });
          } else {
            const created = await tx.electiveGroup.create({
              data: { schoolId, academicYearId, name: groupName, periodsPerWeek: config.periodsPerWeek },
            });
            groupId = created.id;
          }
          groupIdByDivision.set(dId, groupId);

          // Upsert ElectiveGroupSubject records for this group
          const existingSubs = await tx.electiveGroupSubject.findMany({
            where: { electiveGroupId: groupId },
          });
          const existingSubIds = new Set(existingSubs.map(s => s.subjectId));
          const divSubjectIds = new Set(divisionParticipation[dId] ?? []);

          for (const es of existingSubs) {
            if (!divSubjectIds.has(es.subjectId)) {
              await tx.electiveGroupSubject.delete({ where: { id: es.id } });
            }
          }
          for (const sub of subjects) {
            if (!divSubjectIds.has(sub.subjectId)) continue;
            if (existingSubIds.has(sub.subjectId)) {
              await tx.electiveGroupSubject.updateMany({
                where: { electiveGroupId: groupId, subjectId: sub.subjectId },
                data: { parallelSections: sub.parallelSections },
              });
            } else {
              await tx.electiveGroupSubject.create({
                data: { schoolId, electiveGroupId: groupId, subjectId: sub.subjectId, parallelSections: sub.parallelSections },
              });
            }
          }
        }
      }

      // ── Step 3: Upsert DivisionAssignment records ──
      const affectedDivisionIds = new Set<string>();

      for (const dId of divisionIds) {
        const groupId = groupIdByDivision.get(dId);
        if (!groupId) continue;
        const divSubjectIds = divisionParticipation[dId] ?? [];
        const prefs = perDivisionOverrides[dId] ?? defaultSchedulingPreferences ?? undefined;

        // Get existing assignments for this division + group
        const existingDAs = await tx.divisionAssignment.findMany({
          where: { divisionId: dId, electiveGroupId: groupId, deletedAt: null },
          select: { id: true, subjectId: true, teacherId: true, assistantTeacherId: true, weightage: true },
        });

        // Build desired assignments from input
        type DesiredDA = { subjectId: string; teacherId: string | null; assistantTeacherId: string | null; weightage: number };
        const desired: DesiredDA[] = [];
        for (const sub of subjects) {
          if (!divSubjectIds.includes(sub.subjectId)) continue;
          for (const t of sub.teachers) {
            desired.push({
              subjectId: sub.subjectId,
              teacherId: t.teacherId,
              assistantTeacherId: t.assistantTeacherId ?? null,
              weightage: t.weightage,
            });
          }
        }

        // Diff: find assignments to create, update, or delete
        const usedExistingIds = new Set<string>();
        for (const d of desired) {
          // Find matching existing assignment (same subject + teacher)
          const match = existingDAs.find(e =>
            e.subjectId === d.subjectId && e.teacherId === d.teacherId && !usedExistingIds.has(e.id)
          );
          if (match) {
            usedExistingIds.add(match.id);
            // Update if changed
            if (match.weightage !== d.weightage || match.assistantTeacherId !== d.assistantTeacherId) {
              await tx.divisionAssignment.update({
                where: { id: match.id },
                data: {
                  weightage: d.weightage,
                  assistantTeacherId: d.assistantTeacherId,
                  schedulingPreferences: prefs ?? undefined,
                },
              });
              affectedDivisionIds.add(dId);
            } else {
              // Update prefs even if teacher/weightage didn't change
              await tx.divisionAssignment.update({
                where: { id: match.id },
                data: { schedulingPreferences: prefs ?? undefined },
              });
            }
          } else {
            // Create new assignment
            await tx.divisionAssignment.create({
              data: {
                schoolId, academicYearId, divisionId: dId,
                subjectId: d.subjectId, teacherId: d.teacherId,
                assistantTeacherId: d.assistantTeacherId,
                weightage: d.weightage, electiveGroupId: groupId,
                schedulingPreferences: prefs ?? undefined,
              },
            });
            affectedDivisionIds.add(dId);
          }
        }

        // Soft-delete assignments no longer needed
        for (const e of existingDAs) {
          if (!usedExistingIds.has(e.id)) {
            // Delete timetable_slots referencing this assignment
            await tx.timetableSlot.deleteMany({
              where: { divisionAssignmentId: e.id },
            });
            await tx.divisionAssignment.update({
              where: { id: e.id },
              data: { deletedAt: new Date() },
            });
            affectedDivisionIds.add(dId);
          }
        }
      }

      // ── Step 4: Flag affected timetables ──
      const flaggedGroupIds = new Set<string>();
      for (const dId of [...affectedDivisionIds, ...removedDivisionIds]) {
        const gId = groupIdByDivision.get(dId) ?? existingGroupIds[0];
        if (gId && !flaggedGroupIds.has(gId)) {
          flaggedGroupIds.add(gId);
          await flagTimetables({
            schoolId, academicYearId,
            entityType: 'ELECTIVE_GROUP',
            entityId: gId,
            conflictType: 'ELECTIVE_GROUP_CHANGED',
            changeDescription: 'Elective group updated via bulk save',
          });
        }
      }

      return {
        groupIds: Array.from(new Set(groupIdByDivision.values())),
        divisionsAffected: affectedDivisionIds.size + removedDivisionIds.size,
      };
    }, { timeout: 30000 }); // 30s timeout for large transactions
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
    // (This is informational -- any subject can be assigned to any division)

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
        electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
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
          changeDescription: `Teacher ${assignment.teacher?.name ?? 'Unassigned'} has a scheduling conflict with ${c.className}-${c.divisionLabel}`,
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
