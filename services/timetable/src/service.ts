import {
  prisma, AppError, NotFoundError,
  TriggerGenerationDto, OverrideSlotDto,
} from '@timetable/shared';
import { JobStatus, TimetableStatus, SlotType } from '@prisma/client';

export class TimetableService {

  // ── Trigger Generation (mock Fargate locally) ──

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

    // Create generation jobs and timetables for each division
    const results = await Promise.all(divisionIds.map(async (divisionId) => {
      // Create generation job
      const job = await prisma.generationJob.create({
        data: {
          schoolId,
          divisionId,
          academicYearId,
          status: JobStatus.PENDING,
          startedAt: new Date(),
        },
      });

      // Mock Fargate: generate timetable inline
      const timetable = await this.mockGenerateTimetable(
        schoolId, divisionId, academicYearId,
        adjacencyConstraintEnabled ?? false,
      );

      // Mark job completed
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { status: JobStatus.COMPLETED, completedAt: new Date() },
      });

      return { jobId: job.id, timetableId: timetable.id, divisionId };
    }));

    return results.length === 1 ? results[0] : results;
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

    // Get all working days + their PERIOD slots for the school's period structure
    // Get the period structure for this division's class via PeriodStructureClass
    const periodStructureClass = await prisma.periodStructureClass.findUnique({
      where: { classId: (await prisma.division.findUniqueOrThrow({ where: { id: divisionId } })).classId },
    });
    if (!periodStructureClass) {
      throw new AppError('No period structure assigned to this class', 400, 'NO_PERIOD_STRUCTURE');
    }

    const periodStructureId = periodStructureClass.periodStructureId;
    const workingDays = await prisma.workingDay.findMany({
      where: { schoolId, periodStructureId },
      include: { slots: { where: { slotType: SlotType.PERIOD }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });

    // Get division assignments
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
          teacher: { id: string; name: string };
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
            division: { select: { id: true, label: true, classId: true } },
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

    // Group by day
    const grid: Record<string, {
      workingDay: { id: string; dayOfWeek: number; label: string; sortOrder: number };
      periods: Array<{
        timetableSlotId: string;
        slot: { id: string; slotType: string; slotNumber: number | null; startTime: Date; endTime: Date; sortOrder: number };
        division: { id: string; label: string; classId: string };
        subject: { id: string; name: string } | null;
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
        division: s.timetable.division,
        subject: s.divisionAssignment?.subject ?? null,
      });
    }

    return {
      teacher: { id: teacher.id, name: teacher.name },
      days: Object.values(grid).sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder),
    };
  }
}
