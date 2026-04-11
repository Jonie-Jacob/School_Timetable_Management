import {
  prisma, AppError, NotFoundError,
  TriggerGenerationDto, OverrideSlotDto,
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

    // Validate all divisions exist
    const divisions = await prisma.division.findMany({
      where: { id: { in: divisionIds }, schoolId, academicYearId, deletedAt: null },
    });
    if (divisions.length !== divisionIds.length) {
      const foundIds = new Set(divisions.map(d => d.id));
      const missing = divisionIds.filter(id => !foundIds.has(id));
      throw new AppError(`Divisions not found: ${missing.join(', ')}`, 400, 'INVALID_DIVISIONS');
    }

    // Create a generation job per division and kick off work.
    const results = await Promise.all(divisionIds.map(async (divisionId) => {
      const job = await prisma.generationJob.create({
        data: {
          schoolId,
          divisionId,
          academicYearId,
          status: JobStatus.PENDING,
          startedAt: new Date(),
        },
      });

      if (USE_FARGATE_ENGINE) {
        // Kick off a Fargate task and return immediately. The task updates
        // generation_jobs to RUNNING/COMPLETED/FAILED itself.
        try {
          await this.startEngineTask({
            jobId: job.id,
            schoolId,
            divisionId,
            academicYearId,
            adjacencyConstraintEnabled: adjacencyConstraintEnabled ?? false,
          });
        } catch (err) {
          // If task launch fails, mark the job FAILED so the UI doesn't spin
          await prisma.generationJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              errorMessage: err instanceof Error ? err.message : 'Failed to launch engine task',
              completedAt: new Date(),
            },
          });
          throw err;
        }
        // The timetable row is upserted by the engine itself on success.
        // Look up the existing row (if any) so the response shape stays stable.
        const existing = await prisma.timetable.findUnique({
          where: { schoolId_divisionId_academicYearId: { schoolId, divisionId, academicYearId } },
        });
        return { jobId: job.id, timetableId: existing?.id ?? null, divisionId };
      }

      // ── Dev path: inline mock round-robin ─────────────────────────────
      const timetable = await this.mockGenerateTimetable(
        schoolId, divisionId, academicYearId,
        adjacencyConstraintEnabled ?? false,
      );
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      });
      return { jobId: job.id, timetableId: timetable.id, divisionId };
    }));

    return results.length === 1 ? results[0] : results;
  }

  private async startEngineTask(params: {
    jobId: string;
    schoolId: string;
    divisionId: string;
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
      '--job-id', params.jobId,
      '--school-id', params.schoolId,
      '--division-id', params.divisionId,
      '--academic-year-id', params.academicYearId,
    ];
    if (params.adjacencyConstraintEnabled) {
      command.push('--adjacency-constraint');
    }

    await ecsClient.send(new RunTaskCommand({
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

    // Get division assignments — INCLUDING unassigned-teacher entries.
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

    const slots = await prisma.timetableSlot.findMany({
      where: { timetableId: timetable.id },
      include: {
        workingDay: true,
        slot: true,
        divisionAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
            teacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { workingDay: { sortOrder: 'asc' } },
        { slot: { sortOrder: 'asc' } },
      ],
    });

    // Group by day
    const grid: Record<string, {
      workingDay: { id: string; dayOfWeek: number; label: string; sortOrder: number };
      periods: Array<{
        timetableSlotId: string;
        slot: { id: string; slotType: string; slotNumber: number | null; startTime: Date; endTime: Date; sortOrder: number };
        assignment: {
          id: string;
          subject: { id: string; name: string };
          teacher: { id: string; name: string } | null;
        } | null;
      }>;
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
          periods: [],
        };
      }
      grid[dayKey].periods.push({
        timetableSlotId: s.id,
        slot: {
          id: s.slot.id,
          slotType: s.slot.slotType,
          slotNumber: s.slot.slotNumber,
          startTime: s.slot.startTime,
          endTime: s.slot.endTime,
          sortOrder: s.slot.sortOrder,
        },
        assignment: s.divisionAssignment ? {
          id: s.divisionAssignment.id,
          subject: s.divisionAssignment.subject,
          teacher: s.divisionAssignment.teacher,
        } : null,
      });
    }

    return {
      timetable: {
        id: timetable.id,
        divisionId: timetable.divisionId,
        status: timetable.status,
        adjacencyConstraintEnabled: timetable.adjacencyConstraintEnabled,
        generatedAt: timetable.generatedAt,
      },
      days: Object.values(grid).sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder),
    };
  }

  // ── Override Slot ──

  async overrideSlot(schoolId: string, timetableSlotId: string, dto: OverrideSlotDto) {
    const timetableSlot = await prisma.timetableSlot.findFirst({
      where: { id: timetableSlotId, schoolId },
      include: { timetable: true },
    });
    if (!timetableSlot) throw new NotFoundError('TimetableSlot', timetableSlotId);

    // If assigning (not clearing), validate no teacher double-booking
    if (dto.divisionAssignmentId) {
      const assignment = await prisma.divisionAssignment.findFirst({
        where: { id: dto.divisionAssignmentId, schoolId, deletedAt: null },
      });
      if (!assignment) throw new NotFoundError('DivisionAssignment', dto.divisionAssignmentId);

      // Check teacher isn't already booked in the same slot+day across other divisions
      const conflict = await prisma.timetableSlot.findFirst({
        where: {
          id: { not: timetableSlotId },
          schoolId,
          workingDayId: timetableSlot.workingDayId,
          slotId: timetableSlot.slotId,
          divisionAssignment: { teacherId: assignment.teacherId },
        },
        include: {
          timetable: { include: { division: true } },
          divisionAssignment: { include: { teacher: { select: { id: true, name: true } } } },
        },
      });

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

    // Find all timetable slots where this teacher is assigned
    const slots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId },
        divisionAssignment: { teacherId },
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
    // 2. Fallback (teacher has zero assignments) — any structure in the school
    //    so the grid still shows Mon–Fri × P1..PN.
    const assignmentPeriodStructureIds = new Set<string>();
    for (const s of slots) {
      const psid = s.timetable.division.periodStructureId;
      if (psid) assignmentPeriodStructureIds.add(psid);
    }

    if (assignmentPeriodStructureIds.size === 0) {
      const assigned = await prisma.divisionAssignment.findMany({
        where: { schoolId, academicYearId, teacherId, deletedAt: null },
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
    // timetable response (TimetablePeriod) so the frontend renders cells via
    // period.assignment just like the division view. For teacher view, the
    // "teacher" label in each cell is the class-division label (since the
    // teacher is always the one being viewed).
    const grid: Record<number, {
      workingDay: { id: string; dayOfWeek: number; label: string; sortOrder: number };
      periods: Array<{
        timetableSlotId: string;
        slot: { id: string; slotType: string; slotNumber: number | null; startTime: Date; endTime: Date; sortOrder: number };
        assignment: {
          id: string;
          subject: { id: string; name: string };
          teacher: { id: string; name: string } | null;
        } | null;
      }>;
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
          slot: {
            id: sl.id,
            slotType: sl.slotType,
            slotNumber: sl.slotNumber,
            startTime: sl.startTime,
            endTime: sl.endTime,
            sortOrder: sl.sortOrder,
          },
          assignment: null,
        });
      }
      dayBucket.periods.sort((a, b) => a.slot.sortOrder - b.slot.sortOrder);
    }

    // Overlay the teacher's actual assignments into the skeleton.
    // Need class names for the display label — batch fetch.
    const classIds = Array.from(new Set(slots.map((s) => s.timetable.division.classId)));
    const classes = classIds.length > 0
      ? await prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
      : [];
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));

    for (const s of slots) {
      const dayBucket = grid[s.workingDay.dayOfWeek];
      if (!dayBucket) continue;
      const idx = dayBucket.periods.findIndex((p) => p.slot.sortOrder === s.slot.sortOrder);
      if (idx === -1) continue;
      const className = classNameById.get(s.timetable.division.classId) ?? '';
      const divLabel = `${className}-${s.timetable.division.label}`.replace(/^-/, '');
      dayBucket.periods[idx] = {
        timetableSlotId: s.id,
        slot: {
          id: s.slot.id,
          slotType: s.slot.slotType,
          slotNumber: s.slot.slotNumber,
          startTime: s.slot.startTime,
          endTime: s.slot.endTime,
          sortOrder: s.slot.sortOrder,
        },
        assignment: s.divisionAssignment
          ? {
              id: s.divisionAssignment.id,
              subject: s.divisionAssignment.subject,
              // Reuse "teacher" field to carry the class-division label for
              // the UI cell — the cell renders `assignment.teacher?.name`.
              teacher: { id: s.timetable.division.id, name: divLabel },
            }
          : null,
      };
    }

    return {
      teacher: { id: teacher.id, name: teacher.name },
      days: Object.values(grid).sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder),
    };
  }
}
