import {
  prisma,
  softDelete,
  NotFoundError,
  AppError,
  findAffectedTimetableIds, recomputeMultipleTimetableStatuses,
  findTeachersAtTime,
  computeTeacherLoads,
  identifyCrossDivElectiveGroups,
  checkDuplicateName,
  type CreateTeacherDto,
  type UpdateTeacherDto,
  type SetTeacherSubjectsDto,
  type SetTeacherAvailabilityDto,
  type PaginationParams,
} from '@timetable/shared';

export class TeacherService {
  async create(schoolId: string, academicYearId: string, input: CreateTeacherDto) {
    await checkDuplicateName({ model: 'teacher', name: input.name, schoolId, academicYearId });

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

  /**
   * Returns every teacher in the school/AY with their current workload.
   * Used by the enriched Teacher dropdown in the Assignment editor.
   *
   * assignedPeriods = sum of `weightage` across all active DivisionAssignment
   * rows for this teacher (primary only, not assistant).
   */
  async listLoad(schoolId: string, academicYearId: string) {
    const loads = await computeTeacherLoads({ schoolId, academicYearId });

    // Compute conflict counts per teacher (teacher scheduled in 2+ divisions at same time)
    // Exclude cross-div electives where multi-division co-scheduling is expected.
    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId },
        divisionAssignmentId: { not: null },
        divisionAssignment: { deletedAt: null },
      },
      select: {
        workingDayId: true,
        slotId: true,
        timetable: { select: { divisionId: true } },
        divisionAssignment: { select: { teacherId: true, assistantTeacherId: true, electiveGroupId: true } },
      },
    });

    // teacherId → Map<timeKey, { divisions: Set, electiveGroupIds: Set, totalSlots: number }>
    const timeCoords = new Map<string, Map<string, { divisions: Set<string>; electiveGroupIds: Set<string>; electiveSlotCount: number }>>();
    for (const ts of timetableSlots) {
      const da = ts.divisionAssignment;
      if (!da) continue;
      const timeKey = `${ts.workingDayId}:${ts.slotId}`;
      for (const tid of [da.teacherId, da.assistantTeacherId]) {
        if (!tid) continue;
        if (!timeCoords.has(tid)) timeCoords.set(tid, new Map());
        const tm = timeCoords.get(tid)!;
        if (!tm.has(timeKey)) tm.set(timeKey, { divisions: new Set(), electiveGroupIds: new Set(), electiveSlotCount: 0 });
        const entry = tm.get(timeKey)!;
        entry.divisions.add(ts.timetable.divisionId);
        if (da.electiveGroupId) {
          entry.electiveGroupIds.add(da.electiveGroupId);
          entry.electiveSlotCount++;
        }
      }
    }

    const conflictsByTeacher = new Map<string, number>();
    for (const [tid, tm] of timeCoords) {
      let c = 0;
      for (const entry of tm.values()) {
        if (entry.divisions.size <= 1) continue;
        // Cross-div elective: all divisions at this time belong to the same elective group
        // AND every slot has an elective assignment (no mix of elective + non-elective)
        if (entry.electiveGroupIds.size === 1 && entry.electiveSlotCount === entry.divisions.size) continue;
        c++;
      }
      if (c > 0) conflictsByTeacher.set(tid, c);
    }

    return loads.map((l) => ({
      id: l.teacherId,
      name: l.teacherName,
      maxPeriodsPerWeek: l.maxPeriodsPerWeek,
      assignedPeriods: l.assignedPeriods,
      timetablePeriods: l.timetablePeriods,
      conflictCount: conflictsByTeacher.get(l.teacherId) ?? 0,
      qualifiedSubjectIds: l.qualifiedSubjectIds,
    }));
  }

  /**
   * Returns per-class assignment breakdown for a single teacher.
   * Each row represents one assignment: class+division, subject, weightage,
   * and whether it's an elective. Used by the teacher timetable detail view.
   */
  async getTeacherBreakdown(schoolId: string, academicYearId: string, teacherId: string) {
    const assignments = await prisma.divisionAssignment.findMany({
      where: {
        schoolId, academicYearId, deletedAt: null,
        OR: [{ teacherId }, { assistantTeacherId: teacherId }],
      },
      select: {
        id: true,
        teacherId: true,
        assistantTeacherId: true,
        weightage: true,
        electiveGroupId: true,
        divisionId: true,
        subject: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true, periodsPerWeek: true } },
        division: {
          select: {
            id: true,
            label: true,
            class: { select: { id: true, name: true, sortOrder: true } },
          },
        },
      },
      orderBy: [
        { division: { class: { sortOrder: 'asc' } } },
        { division: { label: 'asc' } },
      ],
    });

    // Identify cross-division elective groups
    const crossDivGroups = identifyCrossDivElectiveGroups(assignments);

    // Query timetable slots for this teacher to get per-assignment timetable counts.
    // Count distinct (workingDayId, slotId) per division_assignment_id.
    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId },
        divisionAssignment: {
          deletedAt: null,
          OR: [{ teacherId }, { assistantTeacherId: teacherId }],
        },
      },
      select: {
        workingDayId: true,
        slotId: true,
        divisionAssignmentId: true,
        divisionAssignment: {
          select: {
            id: true,
            teacherId: true,
            assistantTeacherId: true,
            subjectId: true,
            electiveGroupId: true,
            divisionId: true,
            deletedAt: true,
            subject: { select: { name: true } },
            electiveGroup: { select: { name: true } },
            division: { select: { label: true, class: { select: { name: true, sortOrder: true } } } },
          },
        },
      },
    });

    // Count distinct time slots per assignment_id
    const ttCountByAssignment = new Map<string, Set<string>>();
    for (const ts of timetableSlots) {
      const aid = ts.divisionAssignmentId;
      if (!aid) continue;
      if (!ttCountByAssignment.has(aid)) ttCountByAssignment.set(aid, new Set());
      ttCountByAssignment.get(aid)!.add(`${ts.workingDayId}:${ts.slotId}`);
    }

    // Build breakdown rows, deduplicating cross-div electives
    const seenCrossDivGroups = new Set<string>();
    type BreakdownRow = {
      className: string;
      divisionLabel: string;
      subject: string;
      weightage: number;
      electiveGroup: string | null;
      isCrossDiv: boolean;
      divisions: string[];
      role: 'primary' | 'assistant';
      timetablePeriods: number | null;
    };
    const rows: BreakdownRow[] = [];
    const assignmentIdsUsed = new Set<string>();

    for (const a of assignments) {
      const role = a.assistantTeacherId === teacherId ? 'assistant' as const : 'primary' as const;
      const isCrossDiv = !!(a.electiveGroupId && crossDivGroups.has(a.electiveGroupId));

      if (isCrossDiv) {
        const key = `${a.electiveGroupId}:${a.subject.id}:${role}`;
        if (seenCrossDivGroups.has(key)) continue;
        seenCrossDivGroups.add(key);
        // Collect all assignment IDs and division labels for this cross-div subject
        const relatedAssignments = assignments.filter(
          (x) => x.electiveGroupId === a.electiveGroupId && x.subject.id === a.subject.id,
        );
        const divLabels = relatedAssignments
          .map((x) => `${x.division.class.name} ${x.division.label}`)
          .filter((v, i, arr) => arr.indexOf(v) === i)
          .sort();
        // Mark ALL related assignment IDs as used (must happen before any break)
        for (const ra of relatedAssignments) {
          assignmentIdsUsed.add(ra.id);
        }
        // For cross-div, count distinct time slots across any one division's assignment
        // (they all share the same slots)
        let ttCount: number | null = null;
        for (const ra of relatedAssignments) {
          const c = ttCountByAssignment.get(ra.id);
          if (c) { ttCount = c.size; break; }
        }
        rows.push({
          className: a.division.class.name,
          divisionLabel: divLabels.join(', '),
          subject: a.subject.name,
          weightage: a.weightage,
          electiveGroup: a.electiveGroup?.name ?? null,
          isCrossDiv: true,
          divisions: divLabels,
          role,
          timetablePeriods: ttCount,
        });
      } else {
        assignmentIdsUsed.add(a.id);
        const ttCount = ttCountByAssignment.get(a.id)?.size ?? null;
        rows.push({
          className: a.division.class.name,
          divisionLabel: `${a.division.class.name} ${a.division.label}`,
          subject: a.subject.name,
          weightage: a.weightage,
          electiveGroup: a.electiveGroup?.name ?? null,
          isCrossDiv: false,
          divisions: [`${a.division.class.name} ${a.division.label}`],
          role,
          timetablePeriods: ttCount,
        });
      }
    }

    // Add orphan rows: timetable slots with no matching active assignment
    // (e.g., assignment deleted after generation)
    const orphanAssignments = new Map<string, { da: typeof timetableSlots[0]['divisionAssignment']; count: number }>();
    for (const ts of timetableSlots) {
      const aid = ts.divisionAssignmentId;
      if (!aid || assignmentIdsUsed.has(aid)) continue;
      const da = ts.divisionAssignment;
      if (!da) continue;
      if (!orphanAssignments.has(aid)) {
        orphanAssignments.set(aid, { da, count: 0 });
      }
      const entry = orphanAssignments.get(aid)!;
      entry.count = (ttCountByAssignment.get(aid)?.size ?? 0);
    }
    for (const [, { da, count }] of orphanAssignments) {
      if (!da) continue;
      const role = da.assistantTeacherId === teacherId ? 'assistant' as const : 'primary' as const;
      rows.push({
        className: da.division?.class?.name ?? '?',
        divisionLabel: `${da.division?.class?.name ?? '?'} ${da.division?.label ?? '?'}`,
        subject: da.subject?.name ?? '?',
        weightage: 0,
        electiveGroup: da.electiveGroup?.name ?? null,
        isCrossDiv: false,
        divisions: [],
        role,
        timetablePeriods: count,
      });
    }

    return rows;
  }

  /**
   * Returns every teacher currently scheduled in the given (workingDay, slot)
   * pair across the school/AY -- excluding any timetable slots for the given
   * division (so when editing a cell, we don't flag the current cell as a
   * conflict with itself).
   *
   * Used by the click-to-edit sheet to surface "⚠ Conflict" tags next to
   * teachers in the dropdown at a specific slot.
   */
  async getSlotConflicts(
    schoolId: string,
    academicYearId: string,
    workingDayId: string,
    slotId: string,
    excludeDivisionId: string | null,
  ) {
    const sourceSlot = await prisma.slot.findUnique({
      where: { id: slotId },
      select: { startTime: true, endTime: true },
    });
    if (!sourceSlot) return [];

    const sourceDay = await prisma.workingDay.findUnique({
      where: { id: workingDayId },
      select: { dayOfWeek: true },
    });
    if (!sourceDay) return [];

    return findTeachersAtTime({
      schoolId,
      academicYearId,
      dayOfWeek: sourceDay.dayOfWeek,
      startTime: sourceSlot.startTime,
      endTime: sourceSlot.endTime,
      excludeDivisionId: excludeDivisionId ?? undefined,
    });
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
      await checkDuplicateName({ model: 'teacher', name: input.name, schoolId, academicYearId, excludeId: id });
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

      const tchUpdIds = await findAffectedTimetableIds({ schoolId, academicYearId, entityType: 'TEACHER', entityId: id });
      await recomputeMultipleTimetableStatuses(tchUpdIds);
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
        select: { id: true },
      });
      await recomputeMultipleTimetableStatuses(affectedTimetables.map(t => t.id));
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

    const tchSubIds = await findAffectedTimetableIds({ schoolId, academicYearId, entityType: 'TEACHER', entityId: teacherId });
    await recomputeMultipleTimetableStatuses(tchSubIds);

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

    const tchAvailIds = await findAffectedTimetableIds({ schoolId, academicYearId, entityType: 'AVAILABILITY', entityId: teacherId });
    await recomputeMultipleTimetableStatuses(tchAvailIds);

    return this.getById(schoolId, academicYearId, teacherId);
  }
}
