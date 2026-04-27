import {
  prisma, AppError, NotFoundError,
  TriggerGenerationDto, OverrideSlotDto, SwapSlotsDto, AutoResolveDto, CreateEmptySlotDto,
  SwapElectiveSlotsDto, PreviewElectiveSwapDto,
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
            electiveGroup: { select: { id: true } },
          },
        },
      },
    });
    if (!source) throw new NotFoundError('TimetableSlot', sourceSlotId);

    // If source is elective, delegate to elective-aware method
    if (source.divisionAssignment?.electiveGroup) {
      return this.getValidElectiveSwapTargets(schoolId, sourceSlotId);
    }

    // Also check if the source cell has elective siblings
    const sourceHasElectiveSiblings = await prisma.timetableSlot.findFirst({
      where: {
        timetableId: source.timetableId,
        workingDayId: source.workingDayId,
        slotId: source.slotId,
        id: { not: sourceSlotId },
        divisionAssignment: { electiveGroupId: { not: null } },
      },
      select: { id: true },
    });
    if (sourceHasElectiveSiblings) {
      return this.getValidElectiveSwapTargets(schoolId, sourceHasElectiveSiblings.id);
    }

    // ── Regular (non-elective) source -- check all targets in same timetable ──

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

    // Deduplicate slots by (workingDayId, slotId) so elective cells with
    // multiple rows only appear once. Pick the first row as representative.
    const seenCells = new Set<string>();
    const uniqueTargets: typeof allSlots = [];
    for (const target of allSlots) {
      const cellKey = `${target.workingDayId}:${target.slotId}`;
      if (seenCells.has(cellKey)) continue;
      seenCells.add(cellKey);
      uniqueTargets.push(target);
    }

    const validIds: string[] = [];
    const invalidIds: string[] = [];

    for (const target of uniqueTargets) {
      // For elective target cells, we need to check ALL elective teachers
      // across ALL divisions (not just this one row's teacher)
      const isTargetElective = !!target.divisionAssignment?.electiveGroup;

      let targetTeacherIds: string[] = [];
      let allTargetSlotIds: string[] = [target.id];

      if (isTargetElective) {
        // Collect all teachers from the full elective block at target time
        const electiveGroupId = target.divisionAssignment!.electiveGroup!.id;
        const electiveRows = await prisma.timetableSlot.findMany({
          where: {
            schoolId,
            divisionAssignment: { electiveGroupId },
            workingDay: { dayOfWeek: target.workingDay.dayOfWeek },
            slot: { sortOrder: target.slot.sortOrder },
          },
          select: {
            id: true,
            divisionAssignment: {
              select: {
                teacherId: true,
                assistantTeacherId: true,
              },
            },
          },
        });
        allTargetSlotIds = electiveRows.map(r => r.id);
        const tids = new Set<string>();
        for (const r of electiveRows) {
          if (r.divisionAssignment?.teacherId) tids.add(r.divisionAssignment.teacherId);
          if (r.divisionAssignment?.assistantTeacherId) tids.add(r.divisionAssignment.assistantTeacherId);
        }
        targetTeacherIds = [...tids];
      } else {
        if (target.divisionAssignment?.teacher?.id) targetTeacherIds.push(target.divisionAssignment.teacher.id);
        if (target.divisionAssignment?.assistantTeacher?.id) targetTeacherIds.push(target.divisionAssignment.assistantTeacher.id);
      }

      const excludeIds = [sourceSlotId, ...allTargetSlotIds];
      let hasConflict = false;

      // Check: source teachers at target's time (in other divisions)
      for (const tid of sourceTeacherIds) {
        const conflict = await this.findTeacherTimeConflict(
          schoolId, excludeIds,
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
            schoolId, excludeIds,
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
        'This cell belongs to an elective group. Drag-and-drop the elective cell to move it, or use the Elective Groups page to change subjects/teachers.',
        400,
        'ELECTIVE_CELL_LOCKED',
      );
    }

    // Refuse to PLACE an elective assignment via override -- electives
    // must be moved via drag-drop (swapElectiveSlots) or regeneration.
    if (dto.divisionAssignmentId) {
      const target = await prisma.divisionAssignment.findFirst({
        where: { id: dto.divisionAssignmentId, schoolId, deletedAt: null },
        select: { electiveGroupId: true },
      });
      if (target?.electiveGroupId) {
        throw new AppError(
          'Cannot place an elective-group assignment via single-cell edit. Drag-and-drop or regenerate the timetable instead.',
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

    // ── Elective detection: delegate to swapElectiveSlots if either slot is elective ──
    const sourceIsElective = !!sourceSlot.divisionAssignment?.electiveGroup;
    const targetIsElective = !!targetSlot.divisionAssignment?.electiveGroup;

    // Also check for elective siblings at the same (day, slot) coordinates
    // (a regular assignment row may share a cell with elective rows)
    let sourceHasElectiveSiblings = false;
    let targetHasElectiveSiblings = false;
    if (!sourceIsElective) {
      const sibling = await prisma.timetableSlot.findFirst({
        where: {
          timetableId: sourceSlot.timetableId,
          workingDayId: sourceSlot.workingDayId,
          slotId: sourceSlot.slotId,
          divisionAssignment: { electiveGroupId: { not: null } },
        },
        select: { id: true },
      });
      sourceHasElectiveSiblings = !!sibling;
    }
    if (!targetIsElective) {
      const sibling = await prisma.timetableSlot.findFirst({
        where: {
          timetableId: targetSlot.timetableId,
          workingDayId: targetSlot.workingDayId,
          slotId: targetSlot.slotId,
          divisionAssignment: { electiveGroupId: { not: null } },
        },
        select: { id: true },
      });
      targetHasElectiveSiblings = !!sibling;
    }

    if (sourceIsElective || sourceHasElectiveSiblings || targetIsElective || targetHasElectiveSiblings) {
      // Determine which is the elective side and which provides the target coordinates
      const electiveSlot = (sourceIsElective || sourceHasElectiveSiblings) ? sourceSlot : targetSlot;
      const otherSlot = electiveSlot === sourceSlot ? targetSlot : sourceSlot;

      // Find the actual elective slot ID (may be a sibling, not the row we loaded)
      let electiveSlotId = electiveSlot.id;
      if (!electiveSlot.divisionAssignment?.electiveGroup) {
        // The row itself is not elective, but it has elective siblings -- find one
        const electiveSibling = await prisma.timetableSlot.findFirst({
          where: {
            timetableId: electiveSlot.timetableId,
            workingDayId: electiveSlot.workingDayId,
            slotId: electiveSlot.slotId,
            divisionAssignment: { electiveGroupId: { not: null } },
          },
          select: { id: true },
        });
        if (electiveSibling) electiveSlotId = electiveSibling.id;
      }

      return this.swapElectiveSlots(schoolId, {
        sourceSlotId: electiveSlotId,
        targetDayOfWeek: otherSlot.workingDay.dayOfWeek,
        targetSlotSortOrder: otherSlot.slot.sortOrder,
        force,
      });
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

  // ── Resolution Candidates ──

  async getResolutionCandidates(schoolId: string, conflictedSlotId: string) {
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
      return { candidates: [], conflictedSlot: null };
    }

    const timetableId = conflictedSlot.timetableId;

    const allSlots = await prisma.timetableSlot.findMany({
      where: {
        timetableId,
        id: { not: conflictedSlotId },
      },
      include: {
        divisionAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
            electiveGroup: { select: { id: true } },
          },
        },
        workingDay: true,
        slot: true,
      },
    });

    type CandidateInfo = {
      slotId: string;
      dayLabel: string;
      dayOfWeek: number;
      periodNumber: number | null;
      sortOrder: number;
      subjectName: string | null;
      teacherName: string | null;
      isEmpty: boolean;
      score: number;
    };
    const candidates: CandidateInfo[] = [];

    for (const candidate of allSlots) {
      // Skip non-period slots
      if (candidate.slot?.slotType !== 'PERIOD') continue;
      // Skip elective slots
      if (candidate.divisionAssignment?.electiveGroup) continue;

      const candidateTeacherId = candidate.divisionAssignment?.teacher?.id;

      // Check: would the conflicted teacher be free at the candidate's time?
      const conflictedTeacherBusy = await this.findTeacherTimeConflict(
        schoolId,
        [conflictedSlotId, candidate.id],
        candidate.workingDay!.dayOfWeek,
        candidate.slot!.startTime,
        candidate.slot!.endTime,
        teacherId,
      );
      if (conflictedTeacherBusy) continue;

      // Check: would the candidate's teacher be free at the conflicted position?
      if (candidateTeacherId) {
        const candidateTeacherBusy = await this.findTeacherTimeConflict(
          schoolId,
          [conflictedSlotId, candidate.id],
          conflictedSlot.workingDay!.dayOfWeek,
          conflictedSlot.slot!.startTime,
          conflictedSlot.slot!.endTime,
          candidateTeacherId,
        );
        if (candidateTeacherBusy) continue;
      }

      let score = 0;
      if (!candidate.divisionAssignmentId) score = 100;
      else if (!candidateTeacherId) score = 80;
      else score = 50;

      candidates.push({
        slotId: candidate.id,
        dayLabel: candidate.workingDay?.label ?? '',
        dayOfWeek: candidate.workingDay?.dayOfWeek ?? 0,
        periodNumber: candidate.slot?.slotNumber ?? null,
        sortOrder: candidate.slot?.sortOrder ?? 0,
        subjectName: candidate.divisionAssignment?.subject?.name ?? null,
        teacherName: candidate.divisionAssignment?.teacher?.name ?? null,
        isEmpty: !candidate.divisionAssignmentId,
        score,
      });
    }

    candidates.sort((a, b) => b.score - a.score);

    return {
      conflictedSlot: {
        id: conflictedSlotId,
        className: conflictedSlot.timetable.division?.class?.name ?? '',
        divisionLabel: conflictedSlot.timetable.division?.label ?? '',
        subjectName: conflictedSlot.divisionAssignment?.subject?.name ?? '',
        teacherName: conflictedSlot.divisionAssignment?.teacher?.name ?? '',
        dayLabel: conflictedSlot.workingDay?.label ?? '',
        periodNumber: conflictedSlot.slot?.slotNumber ?? null,
      },
      candidates,
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── Elective Slot Swap ──
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Resolve the full elective block: all timetable_slot rows for the given
   * elective group at the source time coordinates, across ALL participating
   * divisions. Returns rows grouped by timetableId (one group per division).
   */
  private async resolveElectiveBlock(schoolId: string, sourceSlotId: string) {
    const sourceRow = await prisma.timetableSlot.findFirst({
      where: { id: sourceSlotId, schoolId },
      include: {
        workingDay: true,
        slot: true,
        divisionAssignment: {
          select: { electiveGroupId: true },
        },
      },
    });
    if (!sourceRow) throw new NotFoundError('TimetableSlot', sourceSlotId);
    if (!sourceRow.divisionAssignment?.electiveGroupId) {
      throw new AppError('Source slot is not an elective. Use the regular swap endpoint.', 400, 'NOT_ELECTIVE');
    }

    const electiveGroupId = sourceRow.divisionAssignment.electiveGroupId;
    const sourceDayOfWeek = sourceRow.workingDay.dayOfWeek;
    const sourceSlotSortOrder = sourceRow.slot.sortOrder;

    // Find ALL timetable_slot rows for this elective group at the same time
    const allRows = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        divisionAssignment: { electiveGroupId },
        workingDay: { dayOfWeek: sourceDayOfWeek },
        slot: { sortOrder: sourceSlotSortOrder },
      },
      include: {
        timetable: {
          include: { division: { include: { class: true } } },
        },
        workingDay: true,
        slot: true,
        divisionAssignment: {
          include: {
            teacher: { select: { id: true, name: true } },
            assistantTeacher: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true } },
            electiveGroup: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (allRows.length === 0) {
      throw new AppError('No elective slots found at the source coordinates', 404, 'NO_ELECTIVE_SLOTS');
    }

    // Group by timetableId (one group per division)
    const byTimetable = new Map<string, typeof allRows>();
    for (const row of allRows) {
      const key = row.timetableId;
      if (!byTimetable.has(key)) byTimetable.set(key, []);
      byTimetable.get(key)!.push(row);
    }

    return {
      electiveGroupId,
      electiveGroupName: allRows[0].divisionAssignment?.electiveGroup?.name ?? '',
      sourceDayOfWeek,
      sourceSlotSortOrder,
      byTimetable,
      allRows,
    };
  }

  /**
   * For each timetable (division) in the elective block, resolve the
   * target coordinates (workingDayId + slotId) and the displaced rows.
   */
  private async resolveTargetCells(
    schoolId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    byTimetable: Map<string, any[]>,
    targetDayOfWeek: number,
    targetSlotSortOrder: number,
  ) {
    type DivisionSwapGroup = {
      timetableId: string;
      className: string;
      divisionLabel: string;
      divisionId: string;
      sourceWorkingDayId: string;
      sourceSlotId: string;
      targetWorkingDayId: string;
      targetSlotId: string;
      sourceRows: { id: string; divisionAssignmentId: string | null }[];
      targetRows: {
        id: string;
        divisionAssignmentId: string | null;
        divisionAssignment: {
          teacherId: string | null;
          assistantTeacherId: string | null;
          teacher: { id: string; name: string } | null;
          assistantTeacher: { id: string; name: string } | null;
          subject: { id: string; name: string } | null;
          electiveGroupId: string | null;
          electiveGroup: { id: string; name: string } | null;
        } | null;
      }[];
      targetElectiveGroupId: string | null;
    };

    const groups: DivisionSwapGroup[] = [];

    for (const [timetableId, sourceRows] of byTimetable) {
      // Each row has the full Prisma include shape from resolveElectiveBlock
      const sampleRow = sourceRows[0];

      // Find target workingDay for this timetable's period structure
      const targetWorkingDay = await prisma.workingDay.findFirst({
        where: {
          dayOfWeek: targetDayOfWeek,
          periodStructure: {
            divisions: {
              some: { id: sampleRow.timetable.division.id },
            },
          },
        },
        select: { id: true },
      });
      if (!targetWorkingDay) {
        throw new AppError(
          `Target day (dayOfWeek=${targetDayOfWeek}) not available for ${sampleRow.timetable.division.class.name} ${sampleRow.timetable.division.label}`,
          400, 'TARGET_DAY_UNAVAILABLE',
        );
      }

      // Find target slot
      const targetSlot = await prisma.slot.findFirst({
        where: {
          workingDayId: targetWorkingDay.id,
          sortOrder: targetSlotSortOrder,
          slotType: SlotType.PERIOD,
        },
        select: { id: true },
      });
      if (!targetSlot) {
        throw new AppError(
          `Target period (sortOrder=${targetSlotSortOrder}) not available for ${sampleRow.timetable.division.class.name} ${sampleRow.timetable.division.label}`,
          400, 'TARGET_SLOT_UNAVAILABLE',
        );
      }

      // Load displaced rows at target coordinates
      const targetRows = await prisma.timetableSlot.findMany({
        where: {
          timetableId,
          workingDayId: targetWorkingDay.id,
          slotId: targetSlot.id,
          schoolId,
        },
        include: {
          divisionAssignment: {
            include: {
              teacher: { select: { id: true, name: true } },
              assistantTeacher: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true } },
              electiveGroup: { select: { id: true, name: true } },
            },
          },
        },
      });

      const targetElectiveGroupId = targetRows.find(r => r.divisionAssignment?.electiveGroupId)?.divisionAssignment?.electiveGroupId ?? null;

      groups.push({
        timetableId,
        className: sampleRow.timetable.division.class.name,
        divisionLabel: sampleRow.timetable.division.label,
        divisionId: sampleRow.timetable.division.id,
        sourceWorkingDayId: sampleRow.workingDay.id,
        sourceSlotId: sampleRow.slot.id,
        targetWorkingDayId: targetWorkingDay.id,
        targetSlotId: targetSlot.id,
        sourceRows: sourceRows.map(r => ({ id: r.id, divisionAssignmentId: (r as { divisionAssignmentId: string | null }).divisionAssignmentId ?? null })),
        targetRows: targetRows as DivisionSwapGroup['targetRows'],
        targetElectiveGroupId,
      });
    }

    return groups;
  }

  /**
   * Collect all teacher IDs from a set of timetable slot rows.
   */
  private collectTeacherIds(rows: { divisionAssignment?: { teacherId?: string | null; assistantTeacherId?: string | null; teacher?: { id: string } | null; assistantTeacher?: { id: string } | null } | null }[]): string[] {
    const ids = new Set<string>();
    for (const row of rows) {
      const da = row.divisionAssignment;
      if (!da) continue;
      if (da.teacher?.id) ids.add(da.teacher.id);
      if (da.assistantTeacher?.id) ids.add(da.assistantTeacher.id);
    }
    return Array.from(ids);
  }

  /**
   * Check all teacher conflicts for an elective swap. Returns conflict details.
   */
  /**
   * Compute the widest time envelope from an array of time ranges.
   * When elective divisions use different period structures, their P3
   * might be 10:50-11:30 in one structure and 10:30-11:10 in another.
   * We use min(startTime) to max(endTime) so the conflict check catches
   * any overlap across ALL structures.
   */
  private widenTimeEnvelope(times: { startTime: Date; endTime: Date }[]): { startTime: Date; endTime: Date } {
    let minStart = times[0].startTime;
    let maxEnd = times[0].endTime;
    for (let i = 1; i < times.length; i++) {
      if (times[i].startTime < minStart) minStart = times[i].startTime;
      if (times[i].endTime > maxEnd) maxEnd = times[i].endTime;
    }
    return { startTime: minStart, endTime: maxEnd };
  }

  private async checkElectiveSwapConflicts(
    schoolId: string,
    sourceRows: { id: string }[],
    targetRows: { id: string }[],
    sourceTeacherIds: string[],
    targetTeacherIds: string[],
    sourceDayOfWeek: number,
    sourceSlotTimes: { startTime: Date; endTime: Date }[],
    targetDayOfWeek: number,
    targetSlotTimes: { startTime: Date; endTime: Date }[],
  ) {
    // Use widest time envelope across all divisions' period structures
    const sourceEnvelope = this.widenTimeEnvelope(sourceSlotTimes);
    const targetEnvelope = this.widenTimeEnvelope(targetSlotTimes);
    type ElectiveConflictInfo = {
      teacherName: string;
      teacherId: string;
      className: string;
      divisionLabel: string;
      divisionId: string;
      conflictedSlotId: string;
      direction: 'elective_to_target' | 'displaced_to_source';
    };
    const conflicts: ElectiveConflictInfo[] = [];
    const allExcludeIds = [...sourceRows.map(r => r.id), ...targetRows.map(r => r.id)];

    // Check source elective teachers at target time
    for (const teacherId of sourceTeacherIds) {
      const conflict = await this.findTeacherTimeConflict(
        schoolId, allExcludeIds, targetDayOfWeek,
        targetEnvelope.startTime, targetEnvelope.endTime, teacherId,
      );
      if (conflict) {
        const teacher = await prisma.teacher.findFirst({ where: { id: teacherId }, select: { name: true } });
        conflicts.push({
          teacherName: teacher?.name ?? 'Unknown',
          teacherId,
          className: conflict.timetable.division?.class?.name ?? '',
          divisionLabel: conflict.timetable.division?.label ?? '',
          divisionId: conflict.timetable.divisionId,
          conflictedSlotId: conflict.id,
          direction: 'elective_to_target',
        });
      }
    }

    // Check displaced target teachers at source time
    for (const teacherId of targetTeacherIds) {
      const conflict = await this.findTeacherTimeConflict(
        schoolId, allExcludeIds, sourceDayOfWeek,
        sourceEnvelope.startTime, sourceEnvelope.endTime, teacherId,
      );
      if (conflict) {
        const teacher = await prisma.teacher.findFirst({ where: { id: teacherId }, select: { name: true } });
        conflicts.push({
          teacherName: teacher?.name ?? 'Unknown',
          teacherId,
          className: conflict.timetable.division?.class?.name ?? '',
          divisionLabel: conflict.timetable.division?.label ?? '',
          divisionId: conflict.timetable.divisionId,
          conflictedSlotId: conflict.id,
          direction: 'displaced_to_source',
        });
      }
    }

    return conflicts;
  }

  // ── Swap Elective Slots (public endpoint) ──

  async swapElectiveSlots(schoolId: string, dto: SwapElectiveSlotsDto) {
    const { sourceSlotId, targetDayOfWeek, targetSlotSortOrder, force } = dto;

    // Step A: Resolve the source elective block
    const block = await this.resolveElectiveBlock(schoolId, sourceSlotId);

    // Check: source and target are not the same coordinates
    if (block.sourceDayOfWeek === targetDayOfWeek && block.sourceSlotSortOrder === targetSlotSortOrder) {
      throw new AppError('Source and target are the same slot', 400, 'SAME_SLOT');
    }

    // Step B: Resolve target cells in each division
    const groups = await this.resolveTargetCells(schoolId, block.byTimetable, targetDayOfWeek, targetSlotSortOrder);

    // Check if the target is a different elective group -- if so, we need to
    // resolve that elective's FULL block too (it may span divisions not in the
    // source elective, but we only handle the overlapping divisions here).
    const targetElectiveGroupId = groups.find(g => g.targetElectiveGroupId)?.targetElectiveGroupId ?? null;
    if (targetElectiveGroupId && targetElectiveGroupId === block.electiveGroupId) {
      throw new AppError('Source and target belong to the same elective group', 400, 'SAME_ELECTIVE');
    }

    // If target is a different elective group, load its full block to check
    // if it also has divisions NOT in the source elective that need moving
    let targetElectiveExtraGroups: Awaited<ReturnType<typeof this.resolveTargetCells>> = [];
    if (targetElectiveGroupId) {
      // Find all rows of the target elective at target coordinates
      const targetElectiveRows = await prisma.timetableSlot.findMany({
        where: {
          schoolId,
          divisionAssignment: { electiveGroupId: targetElectiveGroupId },
          workingDay: { dayOfWeek: targetDayOfWeek },
          slot: { sortOrder: targetSlotSortOrder },
        },
        include: {
          timetable: { include: { division: { include: { class: true } } } },
          workingDay: true,
          slot: true,
          divisionAssignment: {
            include: {
              teacher: { select: { id: true, name: true } },
              assistantTeacher: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true } },
              electiveGroup: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Find divisions in the target elective that are NOT in the source elective
      const sourceTimetableIds = new Set(groups.map(g => g.timetableId));
      const extraByTimetable = new Map<string, typeof targetElectiveRows>();
      for (const row of targetElectiveRows) {
        if (!sourceTimetableIds.has(row.timetableId)) {
          if (!extraByTimetable.has(row.timetableId)) extraByTimetable.set(row.timetableId, []);
          extraByTimetable.get(row.timetableId)!.push(row);
        }
      }

      if (extraByTimetable.size > 0) {
        // These extra divisions also need to move the target elective to source coordinates
        targetElectiveExtraGroups = await this.resolveTargetCells(
          schoolId, extraByTimetable, block.sourceDayOfWeek, block.sourceSlotSortOrder,
        );
      }
    }

    // Step C: Collect all teacher IDs
    const sourceTeacherIds = this.collectTeacherIds(block.allRows);
    const allTargetRows = groups.flatMap(g => g.targetRows);
    const extraTargetRows = targetElectiveExtraGroups.flatMap(g => g.sourceRows);
    const targetTeacherIds = this.collectTeacherIds([...allTargetRows]);
    // Also collect teachers from extra target elective divisions
    if (targetElectiveExtraGroups.length > 0) {
      const extraTeacherIds = this.collectTeacherIds(
        targetElectiveExtraGroups.flatMap(g =>
          g.sourceRows.map(r => ({ divisionAssignment: null }))
        ),
      );
      // Actually we need the teacher data from the target elective extra rows
      for (const eg of targetElectiveExtraGroups) {
        for (const r of eg.targetRows) {
          if (r.divisionAssignment?.teacher?.id) targetTeacherIds.push(r.divisionAssignment.teacher.id);
          if (r.divisionAssignment?.assistantTeacher?.id) targetTeacherIds.push(r.divisionAssignment.assistantTeacher.id);
        }
      }
    }

    // Step D: Check conflicts
    // Collect slot times from ALL divisions (different period structures may
    // have different clock times for the same sortOrder). We pass all times
    // so checkElectiveSwapConflicts uses the widest envelope for overlap detection.
    const sourceSlotTimes = [...new Map(
      block.allRows.map(r => [r.slot.id, { startTime: r.slot.startTime, endTime: r.slot.endTime }])
    ).values()];

    const targetSlotIds = [...new Set(groups.map(g => g.targetSlotId))];
    const targetSlotRecords = await prisma.slot.findMany({
      where: { id: { in: targetSlotIds } },
      select: { id: true, startTime: true, endTime: true },
    });
    const targetSlotTimes = targetSlotRecords.map(s => ({ startTime: s.startTime, endTime: s.endTime }));
    if (targetSlotTimes.length === 0) throw new AppError('Target slot not found', 404, 'SLOT_NOT_FOUND');

    const allSourceRowsFlat = block.allRows.map(r => ({ id: r.id }));
    const allTargetRowsFlat = [
      ...groups.flatMap(g => g.targetRows.map(r => ({ id: r.id }))),
      ...targetElectiveExtraGroups.flatMap(g => [...g.sourceRows.map(r => ({ id: r.id })), ...g.targetRows.map(r => ({ id: r.id }))]),
    ];

    const conflicts = await this.checkElectiveSwapConflicts(
      schoolId,
      allSourceRowsFlat,
      allTargetRowsFlat,
      [...new Set(sourceTeacherIds)],
      [...new Set(targetTeacherIds)],
      block.sourceDayOfWeek,
      sourceSlotTimes,
      targetDayOfWeek,
      targetSlotTimes,
    );

    // Step E: If conflicts and not forced, return 409
    if (conflicts.length > 0 && !force) {
      throw new AppError(
        JSON.stringify({ conflicts }),
        409,
        'TEACHER_CONFLICT',
      );
    }

    // Step F: Execute atomic swap
    await prisma.$transaction(async (tx) => {
      // Swap source elective and target in each division
      for (const group of groups) {
        // Move source elective rows to target coordinates
        for (const row of group.sourceRows) {
          await tx.timetableSlot.update({
            where: { id: row.id },
            data: { workingDayId: group.targetWorkingDayId, slotId: group.targetSlotId },
          });
        }
        // Move displaced target rows to source coordinates
        for (const row of group.targetRows) {
          await tx.timetableSlot.update({
            where: { id: row.id },
            data: { workingDayId: group.sourceWorkingDayId, slotId: group.sourceSlotId },
          });
        }
      }

      // Handle extra target elective divisions (not in source elective)
      for (const group of targetElectiveExtraGroups) {
        // These rows belong to the target elective in divisions that are NOT
        // part of the source elective. Move them to the source coordinates.
        for (const row of group.sourceRows) {
          await tx.timetableSlot.update({
            where: { id: row.id },
            data: { workingDayId: group.targetWorkingDayId, slotId: group.targetSlotId },
          });
        }
        // Move whatever was at the source coordinates in these divisions to target
        for (const row of group.targetRows) {
          await tx.timetableSlot.update({
            where: { id: row.id },
            data: { workingDayId: group.sourceWorkingDayId, slotId: group.sourceSlotId },
          });
        }
      }
    });

    // Step G: Create conflict notifications for force-swaps
    if (force && conflicts.length > 0) {
      const notificationData = conflicts.map((c) => ({
        schoolId,
        timetableId: groups.find(g => g.divisionId === c.divisionId)?.timetableId
          ?? targetElectiveExtraGroups.find(g => g.divisionId === c.divisionId)?.timetableId
          ?? groups[0].timetableId,
        divisionId: c.divisionId,
        conflictType: 'SWAP_CONFLICT' as const,
        changeDescription: `Teacher "${c.teacherName}" is double-booked -- also teaching ${c.className} Division ${c.divisionLabel} at the same time slot`,
      }));
      await prisma.timetableNotification.createMany({ data: notificationData }).catch(() => {});
    }

    return {
      electiveGroupId: block.electiveGroupId,
      electiveGroupName: block.electiveGroupName,
      divisionsAffected: groups.length + targetElectiveExtraGroups.length,
      conflicts: force ? conflicts : [],
    };
  }

  // ── Preview Elective Swap ──

  async previewElectiveSwap(schoolId: string, dto: PreviewElectiveSwapDto) {
    const { sourceSlotId, targetDayOfWeek, targetSlotSortOrder } = dto;

    const block = await this.resolveElectiveBlock(schoolId, sourceSlotId);

    if (block.sourceDayOfWeek === targetDayOfWeek && block.sourceSlotSortOrder === targetSlotSortOrder) {
      throw new AppError('Source and target are the same slot', 400, 'SAME_SLOT');
    }

    const groups = await this.resolveTargetCells(schoolId, block.byTimetable, targetDayOfWeek, targetSlotSortOrder);

    // Collect teachers for conflict check
    const sourceTeacherIds = this.collectTeacherIds(block.allRows);
    const allTargetRows = groups.flatMap(g => g.targetRows);
    const targetTeacherIds = this.collectTeacherIds(allTargetRows);

    // Collect slot times from ALL divisions for widest envelope
    const sourceSlotTimes = [...new Map(
      block.allRows.map(r => [r.slot.id, { startTime: r.slot.startTime, endTime: r.slot.endTime }])
    ).values()];
    const targetSlotIds = [...new Set(groups.map(g => g.targetSlotId))];
    const targetSlotRecords = await prisma.slot.findMany({
      where: { id: { in: targetSlotIds } },
      select: { id: true, startTime: true, endTime: true },
    });
    const targetSlotTimes = targetSlotRecords.map(s => ({ startTime: s.startTime, endTime: s.endTime }));
    if (targetSlotTimes.length === 0) throw new AppError('Target slot not found', 404, 'SLOT_NOT_FOUND');

    const allSourceRowsFlat = block.allRows.map(r => ({ id: r.id }));
    const allTargetRowsFlat = groups.flatMap(g => g.targetRows.map(r => ({ id: r.id })));

    const conflicts = await this.checkElectiveSwapConflicts(
      schoolId,
      allSourceRowsFlat,
      allTargetRowsFlat,
      [...new Set(sourceTeacherIds)],
      [...new Set(targetTeacherIds)],
      block.sourceDayOfWeek,
      sourceSlotTimes,
      targetDayOfWeek,
      targetSlotTimes,
    );

    // Build affected divisions preview
    const affectedDivisions = groups.map(g => {
      const targetContent = g.targetRows
        .filter(r => r.divisionAssignment)
        .map(r => ({
          subject: r.divisionAssignment!.subject?.name ?? 'Unknown',
          teacher: r.divisionAssignment!.teacher?.name ?? 'Unassigned',
          isElective: !!r.divisionAssignment!.electiveGroupId,
          electiveGroupName: r.divisionAssignment!.electiveGroup?.name ?? null,
        }));

      return {
        className: g.className,
        divisionLabel: g.divisionLabel,
        divisionId: g.divisionId,
        currentTargetContent: targetContent.length > 0 ? targetContent : null,
        action: targetContent.length > 0 ? 'displaced_to_source' as const : 'empty_freed' as const,
      };
    });

    // Resolve day labels for display
    const sourceDayLabel = block.allRows[0].workingDay.label;
    const targetDayRecord = await prisma.workingDay.findFirst({
      where: { id: groups[0].targetWorkingDayId },
      select: { label: true },
    });

    return {
      sourceElectiveGroup: { id: block.electiveGroupId, name: block.electiveGroupName },
      sourceCoordinates: { dayLabel: sourceDayLabel, slotSortOrder: block.sourceSlotSortOrder },
      targetCoordinates: { dayLabel: targetDayRecord?.label ?? '', slotSortOrder: targetSlotSortOrder },
      affectedDivisions,
      targetElectiveGroupId: groups.find(g => g.targetElectiveGroupId)?.targetElectiveGroupId ?? null,
      conflicts,
    };
  }

  // ── Valid Elective Swap Targets ──

  async getValidElectiveSwapTargets(schoolId: string, sourceSlotId: string) {
    const block = await this.resolveElectiveBlock(schoolId, sourceSlotId);
    const sourceTeacherIds = [...new Set(this.collectTeacherIds(block.allRows))];

    // Get all unique (dayOfWeek, slotSortOrder) coordinates from the period
    // structures used by the elective's divisions
    const divisionIds = [...new Set(block.allRows.map(r => r.timetable.division.id))];
    const divisions = await prisma.division.findMany({
      where: { id: { in: divisionIds }, deletedAt: null },
      select: { id: true, periodStructureId: true },
    });
    const structureIds = [...new Set(divisions.filter(d => d.periodStructureId).map(d => d.periodStructureId!))];

    // Collect all PERIOD slots across all structures used by the elective's divisions
    const allPeriodSlots = await prisma.slot.findMany({
      where: {
        slotType: SlotType.PERIOD,
        workingDay: { periodStructureId: { in: structureIds } },
      },
      include: { workingDay: true },
    });

    // Build set of unique (dayOfWeek, sortOrder) coordinates that exist in ALL structures
    const coordsByStructure = new Map<string, Set<string>>();
    for (const slot of allPeriodSlots) {
      const structId = slot.workingDay.periodStructureId;
      if (!coordsByStructure.has(structId)) coordsByStructure.set(structId, new Set());
      coordsByStructure.get(structId)!.add(`${slot.workingDay.dayOfWeek}:${slot.sortOrder}`);
    }
    // Intersect: only coordinates present in ALL structures
    let commonCoords: Set<string> | null = null;
    for (const coords of coordsByStructure.values()) {
      if (!commonCoords) { commonCoords = new Set(coords); continue; }
      for (const c of commonCoords) {
        if (!coords.has(c)) commonCoords.delete(c);
      }
    }
    if (!commonCoords) commonCoords = new Set();

    // Remove the source's own coordinates
    commonCoords.delete(`${block.sourceDayOfWeek}:${block.sourceSlotSortOrder}`);

    // For each candidate, check teacher availability
    type CoordinateResult = {
      dayOfWeek: number;
      slotSortOrder: number;
      valid: boolean;
      reason?: string;
    };
    const validCoordinates: CoordinateResult[] = [];
    const invalidCoordinates: CoordinateResult[] = [];

    // Build a lookup of ALL slot times per coordinate (multiple structures may
    // have different clock times for the same sortOrder). We collect all so we
    // can compute the widest time envelope for conflict detection.
    const slotTimesByCoord = new Map<string, { startTime: Date; endTime: Date }[]>();
    for (const slot of allPeriodSlots) {
      const key = `${slot.workingDay.dayOfWeek}:${slot.sortOrder}`;
      if (!slotTimesByCoord.has(key)) slotTimesByCoord.set(key, []);
      slotTimesByCoord.get(key)!.push({ startTime: slot.startTime, endTime: slot.endTime });
    }

    // Source slot times across all divisions (widest envelope)
    const sourceSlotTimes = [...new Map(
      block.allRows.map(r => [r.slot.id, { startTime: r.slot.startTime, endTime: r.slot.endTime }])
    ).values()];
    const sourceEnvelope = this.widenTimeEnvelope(sourceSlotTimes);

    // All slot IDs in the source elective block (to exclude from conflict checks)
    const sourceSlotIds = block.allRows.map(r => r.id);

    for (const coord of commonCoords) {
      const [dayStr, sortStr] = coord.split(':');
      const dayOfWeek = parseInt(dayStr, 10);
      const slotSortOrder = parseInt(sortStr, 10);
      const coordTimes = slotTimesByCoord.get(coord);
      if (!coordTimes || coordTimes.length === 0) continue;
      const targetEnvelope = this.widenTimeEnvelope(coordTimes);

      // Also need to collect target cell slot IDs to exclude from conflict check
      // We do a lightweight query: find all slots at target coordinates in the elective's timetables
      const timetableIds = [...block.byTimetable.keys()];
      const targetCellSlots = await prisma.timetableSlot.findMany({
        where: {
          timetableId: { in: timetableIds },
          workingDay: { dayOfWeek },
          slot: { sortOrder: slotSortOrder },
          schoolId,
        },
        select: {
          id: true,
          divisionAssignment: {
            select: {
              teacherId: true,
              assistantTeacherId: true,
            },
          },
        },
      });
      const excludeIds = [...sourceSlotIds, ...targetCellSlots.map(s => s.id)];

      // Collect target (displaced) teacher IDs
      const displacedTeacherIds = new Set<string>();
      for (const ts of targetCellSlots) {
        if (ts.divisionAssignment?.teacherId) displacedTeacherIds.add(ts.divisionAssignment.teacherId);
        if (ts.divisionAssignment?.assistantTeacherId) displacedTeacherIds.add(ts.divisionAssignment.assistantTeacherId);
      }

      let hasConflict = false;
      let reason = '';

      // Check source elective teachers at target time (using widest envelope)
      for (const tid of sourceTeacherIds) {
        const conflict = await this.findTeacherTimeConflict(
          schoolId, excludeIds, dayOfWeek,
          targetEnvelope.startTime, targetEnvelope.endTime, tid,
        );
        if (conflict) {
          hasConflict = true;
          const teacher = await prisma.teacher.findFirst({ where: { id: tid }, select: { name: true } });
          reason = `${teacher?.name ?? 'Teacher'} busy at target time`;
          break;
        }
      }

      // Check displaced teachers at source time (using widest envelope)
      if (!hasConflict) {
        for (const tid of displacedTeacherIds) {
          const conflict = await this.findTeacherTimeConflict(
            schoolId, excludeIds, block.sourceDayOfWeek,
            sourceEnvelope.startTime, sourceEnvelope.endTime, tid,
          );
          if (conflict) {
            hasConflict = true;
            const teacher = await prisma.teacher.findFirst({ where: { id: tid }, select: { name: true } });
            reason = `${teacher?.name ?? 'Teacher'} (displaced) busy at source time`;
            break;
          }
        }
      }

      const result: CoordinateResult = { dayOfWeek, slotSortOrder, valid: !hasConflict };
      if (reason) result.reason = reason;
      if (hasConflict) invalidCoordinates.push(result);
      else validCoordinates.push(result);
    }

    return { validCoordinates, invalidCoordinates };
  }
}
