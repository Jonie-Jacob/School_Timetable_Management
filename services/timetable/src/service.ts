import {
  prisma, AppError, NotFoundError,
  TriggerGenerationDto, OverrideSlotDto, SwapSlotsDto, AutoResolveDto, CreateEmptySlotDto,
} from '@timetable/shared';
import { JobStatus, TimetableStatus, SlotType } from '@prisma/client';
import { ECSClient, RunTaskCommand } from '@aws-sdk/client-ecs';

// ── Fargate / GA engine config ────────────────────────────────────────────
// In dev (STAGE=dev) we skip ECS entirely and fall back to the old mock
// round-robin so local devs don't need AWS. In prod, every generation request
// launches a Fargate task running the Python GA engine.

const STAGE = process.env.STAGE ?? 'dev';
const USE_FARGATE_ENGINE = STAGE !== 'dev';
const ECS_CLUSTER_ARN = process.env.ECS_CLUSTER_ARN;
const ECS_TASK_DEF_ARN = process.env.ECS_TASK_DEF_ARN;
const ECS_SUBNET_IDS = (process.env.ECS_SUBNET_IDS ?? '').split(',').filter(Boolean);
const ECS_SECURITY_GROUP_ID = process.env.ECS_SECURITY_GROUP_ID;
const ECS_CONTAINER_NAME = process.env.ECS_CONTAINER_NAME ?? 'timetable-engine';
const AWS_REGION = process.env.AWS_REGION ?? 'ap-south-1';

const ecsClient = USE_FARGATE_ENGINE ? new ECSClient({ region: AWS_REGION }) : null;

export class TimetableService {

  // ── Trigger Generation ────────────────────────────────────────────────
  // In prod: launches the Python GA engine on Fargate (one task per division).
  // In dev:  falls back to the in-process mock round-robin.

  async triggerGeneration(schoolId: string, academicYearId: string, dto: TriggerGenerationDto) {
    const { divisionIds, adjacencyConstraintEnabled } = dto;

    // ── Stale job cleanup: auto-fail jobs stuck for > 15 minutes ──
    await prisma.generationJob.updateMany({
      where: {
        schoolId,
        academicYearId,
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
        startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) },
      },
      data: {
        status: JobStatus.FAILED,
        errorMessage: 'Timed out after 15 minutes',
        completedAt: new Date(),
      },
    });

    // ── Generation lock: prevent concurrent generation for same school ──
    const existingActive = await prisma.generationJob.findFirst({
      where: {
        schoolId,
        academicYearId,
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING] },
      },
    });
    if (existingActive) {
      throw new AppError(
        'A generation is already in progress for this school. Please wait for it to complete.',
        409,
        'GENERATION_IN_PROGRESS',
      );
    }

    // Validate all divisions exist
    const divisions = await prisma.division.findMany({
      where: { id: { in: divisionIds }, schoolId, academicYearId, deletedAt: null },
    });
    if (divisions.length !== divisionIds.length) {
      const foundIds = new Set(divisions.map(d => d.id));
      const missing = divisionIds.filter(id => !foundIds.has(id));
      throw new AppError(`Divisions not found: ${missing.join(', ')}`, 400, 'INVALID_DIVISIONS');
    }

    // Create a generation job per division
    const jobs: Array<{ jobId: string; divisionId: string }> = [];
    for (const divisionId of divisionIds) {
      const job = await prisma.generationJob.create({
        data: {
          schoolId,
          divisionId,
          academicYearId,
          status: JobStatus.PENDING,
          startedAt: new Date(),
        },
      });
      jobs.push({ jobId: job.id, divisionId });
    }

    if (USE_FARGATE_ENGINE) {
      // ── Batch mode: single ECS task generates all divisions sequentially.
      // Each division sees previous ones' results in existing_teacher_slots,
      // preventing cross-division teacher conflicts.
      try {
        await this.startBatchEngineTask({
          jobIds: jobs.map(j => j.jobId),
          schoolId,
          divisionIds,
          academicYearId,
          adjacencyConstraintEnabled: adjacencyConstraintEnabled ?? false,
        });
      } catch (err) {
        // Mark all jobs FAILED
        await prisma.generationJob.updateMany({
          where: { id: { in: jobs.map(j => j.jobId) } },
          data: {
            status: JobStatus.FAILED,
            errorMessage: err instanceof Error ? err.message : 'Failed to launch engine task',
            completedAt: new Date(),
          },
        });
        throw err;
      }

      // Look up existing timetable rows for the response shape
      const existingTimetables = await prisma.timetable.findMany({
        where: { schoolId, academicYearId, divisionId: { in: divisionIds } },
        select: { id: true, divisionId: true },
      });
      const ttByDiv = new Map(existingTimetables.map(t => [t.divisionId, t.id]));

      const results = jobs.map(j => ({
        jobId: j.jobId,
        timetableId: ttByDiv.get(j.divisionId) ?? null,
        divisionId: j.divisionId,
      }));

      if (divisionIds.length === 1) return results[0];
      return { results, errors: [] };
    }

    // ── Dev path: inline mock round-robin (sequential) ────────────────
    const results: Array<{ jobId: string; timetableId: string; divisionId: string }> = [];
    for (const { jobId, divisionId } of jobs) {
      const timetable = await this.mockGenerateTimetable(
        schoolId, divisionId, academicYearId,
        adjacencyConstraintEnabled ?? false,
      );
      await prisma.generationJob.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      });
      results.push({ jobId, timetableId: timetable.id, divisionId });
    }

    if (divisionIds.length === 1) return results[0];
    return { results, errors: [] };
  }

  /**
   * Launch a single ECS Fargate task that generates ALL divisions sequentially.
   * Each division sees previous ones' timetable results, preventing
   * cross-division teacher conflicts.
   */
  private async startBatchEngineTask(params: {
    jobIds: string[];
    schoolId: string;
    divisionIds: string[];
    academicYearId: string;
    adjacencyConstraintEnabled: boolean;
  }) {
    if (!ecsClient) throw new AppError('ECS client not initialized', 500, 'ECS_UNAVAILABLE');
    if (!ECS_CLUSTER_ARN || !ECS_TASK_DEF_ARN || ECS_SUBNET_IDS.length === 0 || !ECS_SECURITY_GROUP_ID) {
      throw new AppError(
        'Fargate engine not configured (missing ECS_CLUSTER_ARN, ECS_TASK_DEF_ARN, ECS_SUBNET_IDS, or ECS_SECURITY_GROUP_ID)',
        500,
        'ECS_NOT_CONFIGURED',
      );
    }

    const command = [
      '--job-ids', params.jobIds.join(','),
      '--school-id', params.schoolId,
      '--division-ids', params.divisionIds.join(','),
      '--academic-year-id', params.academicYearId,
    ];
    if (params.adjacencyConstraintEnabled) {
      command.push('--adjacency-constraint');
    }

    const response = await ecsClient.send(new RunTaskCommand({
      cluster: ECS_CLUSTER_ARN,
      taskDefinition: ECS_TASK_DEF_ARN,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: ECS_SUBNET_IDS,
          securityGroups: [ECS_SECURITY_GROUP_ID],
          assignPublicIp: 'DISABLED',
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: ECS_CONTAINER_NAME,
            command,
          },
        ],
      },
    }));

    const failures = response.failures ?? [];
    if (failures.length > 0 || !response.tasks || response.tasks.length === 0) {
      const reasons = failures
        .map((f) => `${f.reason ?? 'unknown'}${f.detail ? ` -- ${f.detail}` : ''}`)
        .join('; ');
      throw new AppError(
        `ECS RunTask failed to schedule the engine task: ${reasons || 'no tasks returned'}`,
        500,
        'ECS_RUN_TASK_FAILED',
      );
    }
  }

  private async mockGenerateTimetable(
    schoolId: string, divisionId: string, academicYearId: string,
    adjacencyConstraintEnabled: boolean,
  ) {
    // Upsert timetable (unique on school+division+academicYear)
    const existing = await prisma.timetable.findUnique({
      where: { schoolId_divisionId_academicYearId: { schoolId, divisionId, academicYearId } },
    });

    let timetable;
    if (existing) {
      // Delete old slots and regenerate
      await prisma.timetableSlot.deleteMany({ where: { timetableId: existing.id } });
      timetable = await prisma.timetable.update({
        where: { id: existing.id },
        data: {
          status: TimetableStatus.GENERATED,
          adjacencyConstraintEnabled,
          generatedAt: new Date(),
        },
      });
    } else {
      timetable = await prisma.timetable.create({
        data: {
          schoolId,
          divisionId,
          academicYearId,
          status: TimetableStatus.GENERATED,
          adjacencyConstraintEnabled,
          generatedAt: new Date(),
        },
      });
    }

    // Get the period structure for this division directly from Division.periodStructureId
    const division = await prisma.division.findUniqueOrThrow({ where: { id: divisionId } });
    if (!division.periodStructureId) {
      throw new AppError('No period structure assigned to this division', 400, 'NO_PERIOD_STRUCTURE');
    }

    const periodStructureId = division.periodStructureId;
    const workingDays = await prisma.workingDay.findMany({
      where: { schoolId, periodStructureId },
      include: { slots: { where: { slotType: SlotType.PERIOD }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });

    // Get division assignments -- INCLUDING unassigned-teacher entries.
    // The current round-robin placer has no teacher-conflict logic anyway,
    // so null-teacher rows can occupy slots just like any other row. When
    // the GA engine lands (Phase 2), null-teacher assignments will still be
    // placed but skipped in teacher-conflict checks.
    const assignments = await prisma.divisionAssignment.findMany({
      where: { schoolId, divisionId, academicYearId, deletedAt: null },
    });

    // Build slot matrix and do round-robin assignment
    const slotData: { schoolId: string; timetableId: string; workingDayId: string; slotId: string; divisionAssignmentId: string | null }[] = [];
    let assignIdx = 0;

    for (const day of workingDays) {
      for (const slot of day.slots) {
        const assignmentId = assignments.length > 0
          ? assignments[assignIdx % assignments.length].id
          : null;
        slotData.push({
          schoolId,
          timetableId: timetable.id,
          workingDayId: day.id,
          slotId: slot.id,
          divisionAssignmentId: assignmentId,
        });
        if (assignments.length > 0) assignIdx++;
      }
    }

    if (slotData.length > 0) {
      await prisma.timetableSlot.createMany({ data: slotData });
    }

    return timetable;
  }

  // ── Generation Status ──

  async getActiveGeneration(schoolId: string, academicYearId: string) {
    // Find the most recent batch: jobs created within 5 seconds of the latest
    // (all jobs in a single Generate All call are created within milliseconds)
    const latestJob = await prisma.generationJob.findFirst({
      where: { schoolId, academicYearId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (!latestJob) {
      return { active: false, jobs: [], totalDivisions: 0, completedDivisions: 0, failedDivisions: 0 };
    }
    const batchStart = new Date(latestJob.createdAt.getTime() - 5_000);
    const recentJobs = await prisma.generationJob.findMany({
      where: {
        schoolId,
        academicYearId,
        createdAt: { gt: batchStart },
      },
      include: {
        division: { select: { id: true, label: true, class: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (recentJobs.length === 0) {
      return { active: false, jobs: [], totalDivisions: 0, completedDivisions: 0 };
    }

    const pending = recentJobs.filter(j => j.status === 'PENDING' || j.status === 'RUNNING');
    const completed = recentJobs.filter(j => j.status === 'COMPLETED');
    const failed = recentJobs.filter(j => j.status === 'FAILED');

    // Find the batch result summary (stored on the first job)
    const batchSummary = recentJobs.find(j => j.resultSummary != null);
    const failureAnalysis = (batchSummary?.resultSummary as any)?.failureAnalysis ?? [];

    return {
      active: pending.length > 0,
      totalDivisions: recentJobs.length,
      completedDivisions: completed.length,
      failedDivisions: failed.length,
      failureAnalysis,
      jobs: recentJobs.map(j => ({
        id: j.id,
        divisionId: j.divisionId,
        divisionLabel: `${j.division?.class?.name ?? ''} ${j.division?.label ?? ''}`.trim(),
        status: j.status,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
      })),
    };
  }

  async getGenerationStatus(schoolId: string, jobId: string) {
    const job = await prisma.generationJob.findFirst({
      where: { id: jobId, schoolId },
    });
    if (!job) throw new NotFoundError('GenerationJob', jobId);
    return job;
  }

  // ── Division Timetable Grid ──

  async getDivisionTimetable(schoolId: string, academicYearId: string, divisionId: string) {
    const timetable = await prisma.timetable.findUnique({
      where: { schoolId_divisionId_academicYearId: { schoolId, divisionId, academicYearId } },
    });
    if (!timetable) throw new NotFoundError('Timetable');

    // After elective-group support: multiple timetable_slots may share the
    // same (workingDayId, slotId). We group them into a single "period" with
    // an `assignments[]` array. For ordinary subjects assignments.length === 1;
    // for an elective group it equals the number of parallel teachers.
    const slots = await prisma.timetableSlot.findMany({
      where: { timetableId: timetable.id },
      include: {
        workingDay: true,
        slot: true,
        divisionAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
            assistantTeacher: { select: { id: true, name: true } },
            electiveGroup: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { workingDay: { sortOrder: 'asc' } },
        { slot: { sortOrder: 'asc' } },
      ],
    });

    type AssignmentDto = {
      id: string;
      subject: { id: string; name: string };
      teacher: { id: string; name: string } | null;
      assistantTeacher: { id: string; name: string } | null;
      electiveGroup: { id: string; name: string } | null;
    };

    type PeriodDto = {
      // We expose ONE timetableSlotId per (day, slot) cell -- the first row's id --
      // so existing override/drag handlers keep working for non-elective cells.
      // The full set of underlying slot rows is also returned via slotIds.
      timetableSlotId: string;
      slotIds: string[];
      slot: { id: string; slotType: string; slotNumber: number | null; startTime: Date; endTime: Date; sortOrder: number };
      assignments: AssignmentDto[];
      // Convenience flag -- true iff any assignment in this cell belongs to
      // an elective group. The frontend uses this to render a stacked cell
      // and to disable the click-to-edit dialog.
      isElective: boolean;
    };

    const grid: Record<string, {
      workingDay: { id: string; dayOfWeek: number; label: string; sortOrder: number };
      // (workingDayId, slotId) → PeriodDto
      periodsByKey: Map<string, PeriodDto>;
    }> = {};

    for (const s of slots) {
      const dayKey = s.workingDayId;
      if (!grid[dayKey]) {
        grid[dayKey] = {
          workingDay: {
            id: s.workingDay.id,
            dayOfWeek: s.workingDay.dayOfWeek,
            label: s.workingDay.label,
            sortOrder: s.workingDay.sortOrder,
          },
          periodsByKey: new Map(),
        };
      }
      const dayBucket = grid[dayKey];
      const periodKey = s.slotId;
      let period = dayBucket.periodsByKey.get(periodKey);
      if (!period) {
        period = {
          timetableSlotId: s.id,
          slotIds: [],
          slot: {
            id: s.slot.id,
            slotType: s.slot.slotType,
            slotNumber: s.slot.slotNumber,
            startTime: s.slot.startTime,
            endTime: s.slot.endTime,
            sortOrder: s.slot.sortOrder,
          },
          assignments: [],
          isElective: false,
        };
        dayBucket.periodsByKey.set(periodKey, period);
      }
      period.slotIds.push(s.id);

      if (s.divisionAssignment) {
        period.assignments.push({
          id: s.divisionAssignment.id,
          subject: s.divisionAssignment.subject,
          teacher: s.divisionAssignment.teacher,
          assistantTeacher: s.divisionAssignment.assistantTeacher ?? null,
          electiveGroup: s.divisionAssignment.electiveGroup,
        });
        if (s.divisionAssignment.electiveGroupId) {
          period.isElective = true;
        }
      }
    }

    // Materialise the grid into the response shape (sorted lists, no Maps)
    const days = Object.values(grid)
      .sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder)
      .map((bucket) => ({
        workingDay: bucket.workingDay,
        periods: Array.from(bucket.periodsByKey.values()).sort(
          (a, b) => a.slot.sortOrder - b.slot.sortOrder,
        ),
      }));

    return {
      timetable: {
        id: timetable.id,
        divisionId: timetable.divisionId,
        status: timetable.status,
        adjacencyConstraintEnabled: timetable.adjacencyConstraintEnabled,
        generatedAt: timetable.generatedAt,
      },
      days,
    };
  }

  // ── Time-based teacher conflict helper ──

  /**
   * Find a timetable_slot where the given teacher is booked at the same
   * day_of_week and overlapping clock time, across ANY period structure.
   * Uses time overlap (startTime < otherEnd AND endTime > otherStart)
   * instead of matching on workingDayId+slotId, which fails across
   * different period structures.
   */
  private async findTeacherTimeConflict(
    schoolId: string,
    excludeSlotIds: string[],
    dayOfWeek: number,
    startTime: Date,
    endTime: Date,
    teacherId: string,
  ) {
    return prisma.timetableSlot.findFirst({
      where: {
        id: { notIn: excludeSlotIds },
        schoolId,
        workingDay: { dayOfWeek },
        slot: {
          slotType: 'PERIOD',
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
        divisionAssignment: { teacherId },
      },
      include: {
        timetable: { include: { division: { include: { class: true } } } },
        divisionAssignment: { include: { teacher: { select: { id: true, name: true } } } },
        workingDay: true,
        slot: true,
      },
    });
  }

  /**
   * Returns which slots in the same timetable can be swapped with the source
   * slot without creating teacher conflicts. Used by the frontend to highlight
   * valid drop targets during drag.
   */
  async getValidSwapTargets(schoolId: string, sourceSlotId: string) {
    const source = await prisma.timetableSlot.findFirst({
      where: { id: sourceSlotId, schoolId },
      include: {
        timetable: true,
        workingDay: true,
        slot: true,
        divisionAssignment: {
          include: {
            teacher: { select: { id: true } },
            assistantTeacher: { select: { id: true } },
          },
        },
      },
    });
    if (!source) throw new NotFoundError('TimetableSlot', sourceSlotId);

    // All slots in the same timetable
    const allSlots = await prisma.timetableSlot.findMany({
      where: {
        timetableId: source.timetableId,
        id: { not: sourceSlotId },
        slot: { slotType: 'PERIOD' },
      },
      include: {
        workingDay: true,
        slot: true,
        divisionAssignment: {
          include: {
            teacher: { select: { id: true } },
            assistantTeacher: { select: { id: true } },
            electiveGroup: { select: { id: true } },
          },
        },
      },
    });

    // Source teachers (primary + assistant)
    const sourceTeacherIds: string[] = [];
    if (source.divisionAssignment?.teacher?.id) sourceTeacherIds.push(source.divisionAssignment.teacher.id);
    if (source.divisionAssignment?.assistantTeacher?.id) sourceTeacherIds.push(source.divisionAssignment.assistantTeacher.id);

    // For each candidate target, check bidirectional teacher conflicts
    const validIds: string[] = [];
    const invalidIds: string[] = [];

    for (const target of allSlots) {
      // Skip elective cells
      if (target.divisionAssignment?.electiveGroup) {
        invalidIds.push(target.id);
        continue;
      }

      const targetTeacherIds: string[] = [];
      if (target.divisionAssignment?.teacher?.id) targetTeacherIds.push(target.divisionAssignment.teacher.id);
      if (target.divisionAssignment?.assistantTeacher?.id) targetTeacherIds.push(target.divisionAssignment.assistantTeacher.id);

      let hasConflict = false;

      // Check: source teachers at target's time (in other divisions)
      for (const tid of sourceTeacherIds) {
        const conflict = await this.findTeacherTimeConflict(
          schoolId, [sourceSlotId, target.id],
          target.workingDay.dayOfWeek,
          target.slot.startTime, target.slot.endTime,
          tid,
        );
        if (conflict) { hasConflict = true; break; }
      }

      // Check: target teachers at source's time (in other divisions)
      if (!hasConflict) {
        for (const tid of targetTeacherIds) {
          const conflict = await this.findTeacherTimeConflict(
            schoolId, [sourceSlotId, target.id],
            source.workingDay.dayOfWeek,
            source.slot.startTime, source.slot.endTime,
            tid,
          );
          if (conflict) { hasConflict = true; break; }
        }
      }

      if (hasConflict) {
        invalidIds.push(target.id);
      } else {
        validIds.push(target.id);
      }
    }

    return { validSlotIds: validIds, invalidSlotIds: invalidIds };
  }

  // ── Override Slot ──

  async overrideSlot(schoolId: string, timetableSlotId: string, dto: OverrideSlotDto) {
    const timetableSlot = await prisma.timetableSlot.findFirst({
      where: { id: timetableSlotId, schoolId },
      include: {
        timetable: true,
        divisionAssignment: { select: { electiveGroupId: true } },
      },
    });
    if (!timetableSlot) throw new NotFoundError('TimetableSlot', timetableSlotId);

    // Refuse to mutate any cell that's currently part of an elective group
    // OR any cell on whose (day, slot) coordinates an elective is already
    // sitting (you'd otherwise add a non-elective row alongside the elective
    // members, which would mean two different subjects in the same physical
    // slot for the same students).
    const electiveSiblings = await prisma.timetableSlot.findMany({
      where: {
        timetableId: timetableSlot.timetableId,
        workingDayId: timetableSlot.workingDayId,
        slotId: timetableSlot.slotId,
        divisionAssignment: { electiveGroupId: { not: null } },
      },
      select: { id: true },
    });
    if (electiveSiblings.length > 0) {
      throw new AppError(
        'This cell belongs to an elective group and cannot be edited from the timetable view. Use the Assignments page or the Elective Groups page to change which subjects/teachers run during this elective slot.',
        400,
        'ELECTIVE_CELL_LOCKED',
      );
    }

    // Refuse to PLACE an elective assignment via override either -- electives
    // must come from a regenerated timetable, not manual single-cell edits.
    if (dto.divisionAssignmentId) {
      const target = await prisma.divisionAssignment.findFirst({
        where: { id: dto.divisionAssignmentId, schoolId, deletedAt: null },
        select: { electiveGroupId: true },
      });
      if (target?.electiveGroupId) {
        throw new AppError(
          'Cannot place an elective-group assignment via single-cell override. Regenerate the timetable instead.',
          400,
          'ELECTIVE_OVERRIDE_FORBIDDEN',
        );
      }
    }

    // If assigning (not clearing), validate no teacher double-booking
    if (dto.divisionAssignmentId) {
      const assignment = await prisma.divisionAssignment.findFirst({
        where: { id: dto.divisionAssignmentId, schoolId, deletedAt: null },
      });
      if (!assignment) throw new NotFoundError('DivisionAssignment', dto.divisionAssignmentId);

      // Check teacher isn't already booked at overlapping time across ANY division/structure
      if (assignment.teacherId) {
        // Load the slot's time info for overlap check
        const slotInfo = await prisma.slot.findFirst({ where: { id: timetableSlot.slotId } });
        const dayInfo = await prisma.workingDay.findFirst({ where: { id: timetableSlot.workingDayId } });
        if (slotInfo && dayInfo) {
          const conflict = await this.findTeacherTimeConflict(
            schoolId,
            [timetableSlotId],
            dayInfo.dayOfWeek,
            slotInfo.startTime,
            slotInfo.endTime,
            assignment.teacherId,
          );
          if (conflict) {
            const teacherName = conflict.divisionAssignment?.teacher?.name ?? 'Unknown';
            const divLabel = conflict.timetable.division?.label ?? conflict.timetable.divisionId;
            throw new AppError(
              `Teacher "${teacherName}" is already assigned in division "${divLabel}" at the same time slot`,
              409,
              'TEACHER_CONFLICT',
            );
          }
        }
      }
    }

    const updated = await prisma.timetableSlot.update({
      where: { id: timetableSlotId },
      data: { divisionAssignmentId: dto.divisionAssignmentId },
      include: {
        slot: true,
        workingDay: true,
        divisionAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
    });

    return updated;
  }

  // ── Swap Slots (atomic) ──

  async swapSlots(schoolId: string, dto: SwapSlotsDto) {
    const { sourceSlotId, targetSlotId, force } = dto;

    if (sourceSlotId === targetSlotId) {
      throw new AppError('Source and target slots are the same', 400, 'SAME_SLOT');
    }

    // Load both slots with their assignments + teachers
    const includeAssignment = {
      include: {
        subject: { select: { id: true, name: true } },
        teacher: { select: { id: true, name: true } },
        electiveGroup: { select: { id: true, name: true } },
      },
    };
    const [sourceSlot, targetSlot] = await Promise.all([
      prisma.timetableSlot.findFirst({
        where: { id: sourceSlotId, schoolId },
        include: {
          timetable: { include: { division: { include: { class: true } } } },
          divisionAssignment: includeAssignment,
          workingDay: true,
          slot: true,
        },
      }),
      prisma.timetableSlot.findFirst({
        where: { id: targetSlotId, schoolId },
        include: {
          timetable: { include: { division: { include: { class: true } } } },
          divisionAssignment: includeAssignment,
          workingDay: true,
          slot: true,
        },
      }),
    ]);

    if (!sourceSlot) throw new NotFoundError('TimetableSlot', sourceSlotId);
    if (!targetSlot) throw new NotFoundError('TimetableSlot', targetSlotId);

    // ── Elective guards ──
    for (const slot of [sourceSlot, targetSlot]) {
      if (slot.divisionAssignment?.electiveGroup) {
        throw new AppError(
          'Elective cells cannot be swapped from the timetable view. Use the Elective Groups page or regenerate the timetable.',
          400,
          'ELECTIVE_CELL_LOCKED',
        );
      }
      // Check for elective siblings at same (day, slot)
      const electiveSiblings = await prisma.timetableSlot.findFirst({
        where: {
          timetableId: slot.timetableId,
          workingDayId: slot.workingDayId,
          slotId: slot.slotId,
          divisionAssignment: { electiveGroupId: { not: null } },
        },
        select: { id: true },
      });
      if (electiveSiblings) {
        throw new AppError(
          'This cell belongs to an elective group and cannot be edited from the timetable view.',
          400,
          'ELECTIVE_CELL_LOCKED',
        );
      }
    }

    // ── Conflict detection ──
    type ConflictInfo = {
      teacherName: string;
      className: string;
      divisionLabel: string;
      classId: string;
      divisionId: string;
      conflictedSlotId: string;
      direction: 'source_to_target' | 'target_to_source';
    };
    const conflicts: ConflictInfo[] = [];

    // Check source teacher at target's (day, time) in other divisions
    const sourceTeacherId = sourceSlot.divisionAssignment?.teacher?.id;
    if (sourceTeacherId) {
      const conflict = await this.findTeacherTimeConflict(
        schoolId, [sourceSlotId, targetSlotId],
        targetSlot.workingDay.dayOfWeek,
        targetSlot.slot.startTime,
        targetSlot.slot.endTime,
        sourceTeacherId,
      );
      if (conflict) {
        conflicts.push({
          teacherName: sourceSlot.divisionAssignment!.teacher!.name,
          className: conflict.timetable.division?.class?.name ?? '',
          divisionLabel: conflict.timetable.division?.label ?? '',
          classId: conflict.timetable.division?.classId ?? '',
          divisionId: conflict.timetable.divisionId,
          conflictedSlotId: conflict.id,
          direction: 'source_to_target',
        });
      }
    }

    // Check target teacher at source's (day, time) in other divisions
    const targetTeacherId = targetSlot.divisionAssignment?.teacher?.id;
    if (targetTeacherId) {
      const conflict = await this.findTeacherTimeConflict(
        schoolId, [sourceSlotId, targetSlotId],
        sourceSlot.workingDay.dayOfWeek,
        sourceSlot.slot.startTime,
        sourceSlot.slot.endTime,
        targetTeacherId,
      );
      if (conflict) {
        conflicts.push({
          teacherName: targetSlot.divisionAssignment!.teacher!.name,
          className: conflict.timetable.division?.class?.name ?? '',
          divisionLabel: conflict.timetable.division?.label ?? '',
          classId: conflict.timetable.division?.classId ?? '',
          divisionId: conflict.timetable.divisionId,
          conflictedSlotId: conflict.id,
          direction: 'target_to_source',
        });
      }
    }

    // If conflicts and not forced, return 409 with details
    if (conflicts.length > 0 && !force) {
      throw new AppError(
        JSON.stringify({ conflicts }),
        409,
        'TEACHER_CONFLICT',
      );
    }

    // ── Atomic swap in a transaction ──
    const [updatedSource, updatedTarget] = await prisma.$transaction([
      prisma.timetableSlot.update({
        where: { id: sourceSlotId },
        data: { divisionAssignmentId: targetSlot.divisionAssignmentId },
      }),
      prisma.timetableSlot.update({
        where: { id: targetSlotId },
        data: { divisionAssignmentId: sourceSlot.divisionAssignmentId },
      }),
    ]);

    // ── Persist conflict notifications for force-swaps ──
    if (force && conflicts.length > 0) {
      const notificationData = conflicts.map((c) => ({
        schoolId,
        timetableId: c.direction === 'source_to_target'
          ? targetSlot.timetableId   // conflict is in the other division's timetable
          : sourceSlot.timetableId,
        divisionId: c.divisionId,
        conflictType: 'SWAP_CONFLICT' as const,
        changeDescription: `Teacher "${c.teacherName}" is double-booked -- also teaching ${c.className} Division ${c.divisionLabel} at the same time slot`,
      }));
      await prisma.timetableNotification.createMany({ data: notificationData }).catch(() => {
        // Gracefully handle if SWAP_CONFLICT enum doesn't exist yet (migration pending)
      });
    }

    return {
      source: updatedSource,
      target: updatedTarget,
      conflicts: force ? conflicts : [],
    };
  }

  // ── Auto-Resolve Conflict ──

  async autoResolveConflict(schoolId: string, dto: AutoResolveDto) {
    const { conflictedSlotId } = dto;

    // Load the conflicted slot
    const conflictedSlot = await prisma.timetableSlot.findFirst({
      where: { id: conflictedSlotId, schoolId },
      include: {
        timetable: { include: { division: { include: { class: true } } } },
        divisionAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
        workingDay: true,
        slot: true,
      },
    });
    if (!conflictedSlot) throw new NotFoundError('TimetableSlot', conflictedSlotId);

    const teacherId = conflictedSlot.divisionAssignment?.teacher?.id;
    if (!teacherId) {
      throw new AppError('No teacher assigned to this slot -- nothing to resolve', 400, 'NO_TEACHER');
    }

    const timetableId = conflictedSlot.timetableId;

    // Find all other PERIOD slots in the same timetable (same division)
    const allSlots = await prisma.timetableSlot.findMany({
      where: {
        timetableId,
        id: { not: conflictedSlotId },
      },
      include: {
        divisionAssignment: {
          include: { teacher: { select: { id: true, name: true } }, electiveGroup: { select: { id: true } } },
        },
        workingDay: true,
        slot: true,
      },
    });

    // For each candidate slot, check if swapping would resolve the conflict
    // without creating a NEW conflict.
    // Strategy: prefer empty slots > slots with null-teacher > slots whose
    // teacher is free at the conflicted position.
    type Candidate = { slot: typeof allSlots[0]; score: number };
    const candidates: Candidate[] = [];

    for (const candidate of allSlots) {
      // Skip elective slots
      if (candidate.divisionAssignment?.electiveGroup) continue;

      const candidateTeacherId = candidate.divisionAssignment?.teacher?.id;

      // Check: would the conflicted teacher be free at the candidate's (day, time)?
      const conflictedTeacherBusy = await this.findTeacherTimeConflict(
        schoolId,
        [conflictedSlotId, candidate.id],
        candidate.workingDay!.dayOfWeek,
        candidate.slot!.startTime,
        candidate.slot!.endTime,
        teacherId,
      );
      if (conflictedTeacherBusy) continue; // teacher is also busy here, skip

      // Check: would the candidate's teacher (if any) be free at the conflicted position?
      if (candidateTeacherId) {
        const candidateTeacherBusy = await this.findTeacherTimeConflict(
          schoolId,
          [conflictedSlotId, candidate.id],
          conflictedSlot.workingDay!.dayOfWeek,
          conflictedSlot.slot!.startTime,
          conflictedSlot.slot!.endTime,
          candidateTeacherId,
        );
        if (candidateTeacherBusy) continue; // would create a new conflict
      }

      // Score: empty slot = best, null teacher = good, teacher swap = ok
      let score = 0;
      if (!candidate.divisionAssignmentId) score = 100; // empty slot
      else if (!candidateTeacherId) score = 80; // unassigned teacher
      else score = 50; // teacher swap, both free

      candidates.push({ slot: candidate, score });
    }

    if (candidates.length === 0) {
      throw new AppError(
        'No conflict-free slot found for auto-resolve. Manual adjustment is needed.',
        409,
        'NO_RESOLUTION',
      );
    }

    // Pick the best candidate
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0].slot;

    // Atomic swap
    await prisma.$transaction([
      prisma.timetableSlot.update({
        where: { id: conflictedSlotId },
        data: { divisionAssignmentId: best.divisionAssignmentId },
      }),
      prisma.timetableSlot.update({
        where: { id: best.id },
        data: { divisionAssignmentId: conflictedSlot.divisionAssignmentId },
      }),
    ]);

    // Dismiss related SWAP_CONFLICT notifications for this slot
    await prisma.timetableNotification.updateMany({
      where: {
        schoolId,
        timetableId,
        conflictType: 'SWAP_CONFLICT',
        dismissed: false,
      },
      data: { dismissed: true },
    });

    const teacherName = conflictedSlot.divisionAssignment!.teacher!.name;
    const subjectName = conflictedSlot.divisionAssignment!.subject?.name ?? 'Unknown';
    const movedTo = best.workingDay?.label ?? 'Unknown day';

    return {
      resolved: true,
      message: `Moved "${subjectName}" (${teacherName}) to ${movedTo} Period ${best.slot?.slotNumber ?? '?'}`,
      fromSlotId: conflictedSlotId,
      toSlotId: best.id,
    };
  }

  // ── Create Empty Slot ──

  async createEmptySlot(schoolId: string, dto: CreateEmptySlotDto) {
    const { timetableId, workingDayId, slotId } = dto;

    // Verify timetable exists
    const timetable = await prisma.timetable.findFirst({
      where: { id: timetableId, schoolId },
    });
    if (!timetable) throw new NotFoundError('Timetable', timetableId);

    // Check if a row already exists (avoid duplicates)
    const existing = await prisma.timetableSlot.findFirst({
      where: { timetableId, workingDayId, slotId, schoolId },
    });
    if (existing) {
      return { timetableSlotId: existing.id, created: false };
    }

    const newSlot = await prisma.timetableSlot.create({
      data: {
        schoolId,
        timetableId,
        workingDayId,
        slotId,
        divisionAssignmentId: null,
      },
    });

    return { timetableSlotId: newSlot.id, created: true };
  }

  // ── Get Conflicts ──

  async getConflicts(schoolId: string, timetableId: string) {
    const timetable = await prisma.timetable.findFirst({
      where: { id: timetableId, schoolId },
    });
    if (!timetable) throw new NotFoundError('Timetable', timetableId);

    const notifications = await prisma.timetableNotification.findMany({
      where: { timetableId, schoolId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      timetableId,
      status: timetable.status,
      total: notifications.length,
      undismissed: notifications.filter(n => !n.dismissed).length,
      conflicts: notifications,
    };
  }

  // ── Teacher Timetable View ──

  async getTeacherTimetable(schoolId: string, academicYearId: string, teacherId: string) {
    // Verify teacher exists
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, academicYearId, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Teacher', teacherId);

    // Find all timetable slots where this teacher is primary OR assistant
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId },
        divisionAssignment: {
          OR: [{ teacherId }, { assistantTeacherId: teacherId }],
        },
      },
      include: {
        workingDay: true,
        slot: true,
        timetable: {
          include: {
            division: { select: { id: true, label: true, classId: true, periodStructureId: true } },
          },
        },
        divisionAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
            electiveGroup: { select: { id: true, name: true } },
            assistantTeacher: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { workingDay: { sortOrder: 'asc' } },
        { slot: { sortOrder: 'asc' } },
      ],
    });

    // Pick canonical period structures for this teacher:
    // 1. Every structure used by any division where the teacher has assignments.
    // 2. Fallback (teacher has zero assignments) -- any structure in the school
    //    so the grid still shows Mon–Fri × P1..PN.
    const assignmentPeriodStructureIds = new Set<string>();
    for (const s of slots) {
      const psid = s.timetable.division.periodStructureId;
      if (psid) assignmentPeriodStructureIds.add(psid);
    }

    if (assignmentPeriodStructureIds.size === 0) {
      const assigned = await prisma.divisionAssignment.findMany({
        where: {
          schoolId, academicYearId, deletedAt: null,
          OR: [{ teacherId }, { assistantTeacherId: teacherId }],
        },
        select: { division: { select: { periodStructureId: true } } },
      });
      for (const a of assigned) {
        if (a.division?.periodStructureId) assignmentPeriodStructureIds.add(a.division.periodStructureId);
      }
    }

    if (assignmentPeriodStructureIds.size === 0) {
      // Teacher has no assignments anywhere → use any active structure.
      const anyStructure = await prisma.division.findFirst({
        where: { schoolId, academicYearId, deletedAt: null, periodStructureId: { not: null } },
        select: { periodStructureId: true },
      });
      if (anyStructure?.periodStructureId) assignmentPeriodStructureIds.add(anyStructure.periodStructureId);
    }

    const structureIds = Array.from(assignmentPeriodStructureIds);

    // Fetch full working-day + slot lists for all candidate structures.
    const workingDays = structureIds.length > 0
      ? await prisma.workingDay.findMany({
          where: { schoolId, periodStructureId: { in: structureIds } },
          include: { slots: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        })
      : [];

    // Build per-day grid skeleton keyed by dayOfWeek (so multiple structures
    // with the same day collapse into one row). Shape matches the division
    // timetable response (PeriodDto with assignments[]). For teacher view,
    // the "teacher" field on each assignment carries the class-division label
    // since the teacher being viewed is implicit.
    type TeacherAssignmentDto = {
      id: string;
      subject: { id: string; name: string };
      teacher: { id: string; name: string } | null;
      assistantTeacher: { id: string; name: string } | null;
      electiveGroup: { id: string; name: string } | null;
      role?: 'primary' | 'assistant';
    };
    type TeacherPeriodDto = {
      timetableSlotId: string;
      slotIds: string[];
      slot: { id: string; slotType: string; slotNumber: number | null; startTime: Date; endTime: Date; sortOrder: number };
      assignments: TeacherAssignmentDto[];
      isElective: boolean;
    };
    const grid: Record<number, {
      workingDay: { id: string; dayOfWeek: number; label: string; sortOrder: number };
      periods: TeacherPeriodDto[];
    }> = {};

    for (const wd of workingDays) {
      if (!grid[wd.dayOfWeek]) {
        grid[wd.dayOfWeek] = {
          workingDay: {
            id: wd.id,
            dayOfWeek: wd.dayOfWeek,
            label: wd.label,
            sortOrder: wd.sortOrder,
          },
          periods: [],
        };
      }
      // Union of slots across structures with the same dayOfWeek
      const dayBucket = grid[wd.dayOfWeek];
      const seen = new Set(dayBucket.periods.map((p) => p.slot.sortOrder));
      for (const sl of wd.slots) {
        if (seen.has(sl.sortOrder)) continue;
        dayBucket.periods.push({
          timetableSlotId: `${wd.id}:${sl.id}`,
          slotIds: [],
          slot: {
            id: sl.id,
            slotType: sl.slotType,
            slotNumber: sl.slotNumber,
            startTime: sl.startTime,
            endTime: sl.endTime,
            sortOrder: sl.sortOrder,
          },
          assignments: [],
          isElective: false,
        });
      }
      dayBucket.periods.sort((a, b) => a.slot.sortOrder - b.slot.sortOrder);
    }

    // Need class name lookups for overlay (electiveGroup is already in `slots`)
    const classIds = Array.from(new Set(slots.map((s) => s.timetable.division.classId)));
    const classes = classIds.length > 0
      ? await prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
      : [];
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));

    // Overlay the teacher's actual assignments into the skeleton.
    for (const s of slots) {
      const dayBucket = grid[s.workingDay.dayOfWeek];
      if (!dayBucket) continue;
      const idx = dayBucket.periods.findIndex((p) => p.slot.sortOrder === s.slot.sortOrder);
      if (idx === -1) continue;
      const className = classNameById.get(s.timetable.division.classId) ?? '';
      const divLabel = `${className}-${s.timetable.division.label}`.replace(/^-/, '');
      const da = s.divisionAssignment;
      if (!da) continue;
      const period = dayBucket.periods[idx];
      // Replace the empty placeholder with the real slot id
      period.timetableSlotId = s.id;
      period.slotIds = [s.id];
      const role = da.assistantTeacherId === teacherId ? 'assistant' as const : 'primary' as const;
      // For teacher timetable: show who the OTHER teacher is.
      // If current teacher is primary → show assistant teacher name.
      // If current teacher is assistant → show primary teacher name.
      const otherTeacher = role === 'assistant'
        ? (da.teacher ? { id: da.teacher.id, name: da.teacher.name } : null)
        : (da.assistantTeacher ? { id: da.assistantTeacher.id, name: da.assistantTeacher.name } : null);

      period.assignments.push({
        id: da.id,
        subject: da.subject,
        // Reuse "teacher" field to carry the class-division label for
        // the UI cell -- the cell renders `assignment.teacher?.name`.
        teacher: { id: s.timetable.division.id, name: divLabel },
        electiveGroup: da.electiveGroup,
        role,
        assistantTeacher: otherTeacher,
      });
      if (da.electiveGroupId) period.isElective = true;
    }

    return {
      teacher: { id: teacher.id, name: teacher.name },
      days: Object.values(grid).sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder),
    };
  }
}
