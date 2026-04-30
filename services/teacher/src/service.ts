import {
  prisma,
  softDelete,
  NotFoundError,
  ConflictError,
  AppError,
  flagTimetables,
  findTeachersAtTime,
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

  /**
   * Returns every teacher in the school/AY with their current workload.
   * Used by the enriched Teacher dropdown in the Assignment editor.
   *
   * assignedPeriods = sum of `weightage` across all active DivisionAssignment
   * rows for this teacher (primary only, not assistant).
   */
  async listLoad(schoolId: string, academicYearId: string) {
    const teachers = await prisma.teacher.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      select: {
        id: true,
        name: true,
        maxPeriodsPerWeek: true,
        teacherSubjects: { select: { subjectId: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Fetch all assignments with elective group info to handle cross-division
    // electives correctly. For cross-div electives (same elective group spanning
    // multiple divisions), the teacher teaches all divisions simultaneously in
    // the same slot -- so we count the group's periods_per_week ONCE, not per-division.
    const assignments = await prisma.divisionAssignment.findMany({
      where: {
        schoolId,
        academicYearId,
        deletedAt: null,
        OR: [{ teacherId: { not: null } }, { assistantTeacherId: { not: null } }],
      },
      select: {
        teacherId: true,
        assistantTeacherId: true,
        weightage: true,
        electiveGroupId: true,
        divisionId: true,
        electiveGroup: {
          select: { id: true, periodsPerWeek: true },
        },
      },
    });

    // Identify cross-division elective groups (spanning 2+ divisions)
    const egDivisions = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (a.electiveGroupId) {
        if (!egDivisions.has(a.electiveGroupId)) egDivisions.set(a.electiveGroupId, new Set());
        egDivisions.get(a.electiveGroupId)!.add(a.divisionId);
      }
    }
    const crossDivGroups = new Set<string>();
    for (const [egId, divs] of egDivisions) {
      if (divs.size > 1) crossDivGroups.add(egId);
    }

    // Compute load per teacher, deduplicating cross-div elective groups.
    // Both primary (teacherId) and assistant (assistantTeacherId) are counted
    // -- assistant teachers are busy for the same slots as primary.
    const loadByTeacher = new Map<string, number>();
    const countedCrossDivPerTeacher = new Map<string, Set<string>>();

    function addLoad(tid: string, weightage: number, electiveGroupId: string | null) {
      const current = loadByTeacher.get(tid) ?? 0;
      if (electiveGroupId && crossDivGroups.has(electiveGroupId)) {
        if (!countedCrossDivPerTeacher.has(tid)) countedCrossDivPerTeacher.set(tid, new Set());
        const seen = countedCrossDivPerTeacher.get(tid)!;
        if (!seen.has(electiveGroupId)) {
          seen.add(electiveGroupId);
          loadByTeacher.set(tid, current + weightage);
        }
      } else {
        loadByTeacher.set(tid, current + weightage);
      }
    }

    for (const a of assignments) {
      if (a.teacherId) addLoad(a.teacherId, a.weightage, a.electiveGroupId);
      if (a.assistantTeacherId) addLoad(a.assistantTeacherId, a.weightage, a.electiveGroupId);
    }

    // Count timetable-based periods: distinct (working_day, slot) pairs per teacher.
    // For cross-div electives the teacher appears in multiple timetable_slots at the
    // Count timetable periods per teacher using distinct time slots.
    // This detects double-bookings: if assigned=27 but timetable=26, one slot
    // has two assignments at the same time (teacher conflict).
    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId, status: { in: ['GENERATED', 'OUTDATED'] } },
        divisionAssignment: {
          deletedAt: null,
          OR: [{ teacherId: { not: null } }, { assistantTeacherId: { not: null } }],
        },
      },
      select: {
        workingDayId: true,
        slotId: true,
        divisionAssignment: {
          select: { teacherId: true, assistantTeacherId: true, electiveGroupId: true, id: true },
        },
      },
    });

    // Count timetable periods: use a key that de-duplicates cross-div elective
    // slots (same elective group at same time = 1 period) but preserves
    // double-bookings (different assignments at same time = 2 periods).
    // Key: (workingDayId:slotId:electiveGroupId) for electives,
    //      (workingDayId:slotId:assignmentId) for regular assignments.
    const timetableByTeacher = new Map<string, Set<string>>();
    for (const ts of timetableSlots) {
      const da = ts.divisionAssignment;
      if (!da) continue;
      const groupKey = da.electiveGroupId
        ? `${ts.workingDayId}:${ts.slotId}:eg:${da.electiveGroupId}`
        : `${ts.workingDayId}:${ts.slotId}:da:${da.id}`;
      const tid = da.teacherId;
      const atid = da.assistantTeacherId;
      if (tid) {
        if (!timetableByTeacher.has(tid)) timetableByTeacher.set(tid, new Set());
        timetableByTeacher.get(tid)!.add(groupKey);
      }
      if (atid) {
        if (!timetableByTeacher.has(atid)) timetableByTeacher.set(atid, new Set());
        timetableByTeacher.get(atid)!.add(groupKey);
      }
    }

    return teachers.map((t) => ({
      id: t.id,
      name: t.name,
      maxPeriodsPerWeek: t.maxPeriodsPerWeek,
      assignedPeriods: loadByTeacher.get(t.id) ?? 0,
      timetablePeriods: timetableByTeacher.has(t.id) ? timetableByTeacher.get(t.id)!.size : null,
      qualifiedSubjectIds: t.teacherSubjects.map((ts) => ts.subjectId),
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
    const egDivs = new Map<string, Set<string>>();
    for (const a of assignments) {
      if (a.electiveGroupId) {
        if (!egDivs.has(a.electiveGroupId)) egDivs.set(a.electiveGroupId, new Set());
        egDivs.get(a.electiveGroupId)!.add(a.divisionId);
      }
    }
    const crossDivGroups = new Set<string>();
    for (const [egId, divs] of egDivs) {
      if (divs.size > 1) crossDivGroups.add(egId);
    }

    // Query timetable slots for this teacher to get per-assignment timetable counts.
    // Count distinct (workingDayId, slotId) per division_assignment_id.
    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId, status: { in: ['GENERATED', 'OUTDATED'] } },
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

      await flagTimetables({
        schoolId,
        academicYearId,
        entityType: 'TEACHER',
        entityId: id,
        conflictType: 'TEACHER_CHANGED',
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

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'TEACHER',
      entityId: teacherId,
      conflictType: 'TEACHER_CHANGED',
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

    await flagTimetables({
      schoolId,
      academicYearId,
      entityType: 'AVAILABILITY',
      entityId: teacherId,
      conflictType: 'AVAILABILITY_CHANGED',
      changeDescription: `Teacher availability updated (${input.unavailableSlots.length} unavailable slot(s))`,
    });

    return this.getById(schoolId, academicYearId, teacherId);
  }
}
