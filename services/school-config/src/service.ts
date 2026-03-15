import {
  prisma,
  AppError,
  NotFoundError,
  ConflictError,
  type CreatePeriodStructureDto,
  type UpdatePeriodStructureDto,
  type AssignPeriodStructureDto,
  type SetWorkingDaysDto,
  type SlotEntry,
  DayOfWeek,
} from '@timetable/shared';

const DAY_MAP: Record<string, { dayOfWeek: number; label: string }> = {
  MONDAY: { dayOfWeek: DayOfWeek.MONDAY, label: 'Monday' },
  TUESDAY: { dayOfWeek: DayOfWeek.TUESDAY, label: 'Tuesday' },
  WEDNESDAY: { dayOfWeek: DayOfWeek.WEDNESDAY, label: 'Wednesday' },
  THURSDAY: { dayOfWeek: DayOfWeek.THURSDAY, label: 'Thursday' },
  FRIDAY: { dayOfWeek: DayOfWeek.FRIDAY, label: 'Friday' },
  SATURDAY: { dayOfWeek: DayOfWeek.SATURDAY, label: 'Saturday' },
  SUNDAY: { dayOfWeek: DayOfWeek.SUNDAY, label: 'Sunday' },
};

export class SchoolConfigService {
  // ── Period Structures ──────────────────────────────────────

  async createPeriodStructure(schoolId: string, academicYearId: string, input: CreatePeriodStructureDto) {
    const existing = await prisma.periodStructure.findFirst({
      where: { schoolId, academicYearId, name: input.name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictError(`Period structure '${input.name}' already exists`);
    }

    this.validatePeriods(input.periods);

    const periodStructure = await prisma.periodStructure.create({
      data: {
        schoolId,
        academicYearId,
        name: input.name,
        periods: input.periods as any,
      },
    });

    return periodStructure;
  }

  async listPeriodStructures(schoolId: string, academicYearId: string) {
    return prisma.periodStructure.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      include: {
        classes: { include: { class: true } },
        workingDays: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getPeriodStructure(schoolId: string, academicYearId: string, id: string) {
    const structure = await prisma.periodStructure.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
      include: {
        classes: { include: { class: true } },
        workingDays: {
          orderBy: { sortOrder: 'asc' },
          include: {
            slots: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!structure) {
      throw new NotFoundError('Period structure', id);
    }
    return structure;
  }

  async updatePeriodStructure(schoolId: string, academicYearId: string, id: string, input: UpdatePeriodStructureDto) {
    const existing = await prisma.periodStructure.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Period structure', id);
    }

    if (input.name) {
      const duplicate = await prisma.periodStructure.findFirst({
        where: { schoolId, academicYearId, name: input.name, deletedAt: null, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictError(`Period structure '${input.name}' already exists`);
      }
    }

    if (input.periods) {
      this.validatePeriods(input.periods);
    }

    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.periods) data.periods = input.periods;

    const updated = await prisma.periodStructure.update({
      where: { id },
      data,
    });

    // If periods were updated and working days exist, regenerate slots
    if (input.periods) {
      await this.regenerateSlotsForStructure(schoolId, id, input.periods);
    }

    return updated;
  }

  async deletePeriodStructure(schoolId: string, academicYearId: string, id: string) {
    const existing = await prisma.periodStructure.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Period structure', id);
    }

    const assignedClasses = await prisma.periodStructureClass.count({
      where: { periodStructureId: id },
    });
    if (assignedClasses > 0) {
      throw new AppError(
        'Cannot delete period structure with assigned classes. Remove class assignments first.',
        400,
        'BAD_REQUEST',
      );
    }

    await prisma.periodStructure.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async assignToClasses(schoolId: string, academicYearId: string, periodStructureId: string, input: AssignPeriodStructureDto) {
    const ps = await prisma.periodStructure.findFirst({
      where: { id: periodStructureId, schoolId, academicYearId, deletedAt: null },
    });
    if (!ps) {
      throw new NotFoundError('Period structure', periodStructureId);
    }

    // Verify all class IDs belong to this school+academic year
    const classes = await prisma.class.findMany({
      where: { id: { in: input.classIds }, schoolId, academicYearId, deletedAt: null },
    });
    if (classes.length !== input.classIds.length) {
      const foundIds = new Set(classes.map((c) => c.id));
      const missing = input.classIds.filter((cid) => !foundIds.has(cid));
      throw new NotFoundError('Class', missing.join(', '));
    }

    // Check for classes already assigned to a DIFFERENT period structure
    const existingAssignments = await prisma.periodStructureClass.findMany({
      where: { classId: { in: input.classIds } },
    });
    const conflicting = existingAssignments.filter((a) => a.periodStructureId !== periodStructureId);
    if (conflicting.length > 0) {
      const conflictClassIds = conflicting.map((a) => a.classId);
      throw new ConflictError(
        `Classes [${conflictClassIds.join(', ')}] are already assigned to a different period structure. Remove them first.`,
      );
    }

    // Remove existing assignments for this structure's classes, then create fresh
    await prisma.$transaction([
      prisma.periodStructureClass.deleteMany({
        where: { periodStructureId, classId: { in: input.classIds } },
      }),
      ...input.classIds.map((classId) =>
        prisma.periodStructureClass.create({
          data: { schoolId, periodStructureId, classId },
        }),
      ),
    ]);

    const assignments = await prisma.periodStructureClass.findMany({
      where: { periodStructureId },
      include: { class: true },
    });

    return { periodStructureId, assignments };
  }

  // ── Working Days ───────────────────────────────────────────

  async setWorkingDays(schoolId: string, academicYearId: string, periodStructureId: string, input: SetWorkingDaysDto) {
    const ps = await prisma.periodStructure.findFirst({
      where: { id: periodStructureId, schoolId, academicYearId, deletedAt: null },
    });
    if (!ps) {
      throw new NotFoundError('Period structure', periodStructureId);
    }

    // Delete existing working days + their slots
    const existingDays = await prisma.workingDay.findMany({
      where: { periodStructureId },
    });
    if (existingDays.length > 0) {
      const dayIds = existingDays.map((d) => d.id);
      await prisma.slot.deleteMany({ where: { workingDayId: { in: dayIds } } });
      await prisma.workingDay.deleteMany({ where: { periodStructureId } });
    }

    // Create new working days sorted by day of week
    const sortedDays = input.days
      .map((day) => DAY_MAP[day])
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

    const created = await prisma.$transaction(
      sortedDays.map((day, index) =>
        prisma.workingDay.create({
          data: {
            schoolId,
            periodStructureId,
            dayOfWeek: day.dayOfWeek,
            label: day.label,
            sortOrder: index + 1,
          },
        }),
      ),
    );

    return created;
  }

  async getWorkingDays(schoolId: string, periodStructureId: string) {
    return prisma.workingDay.findMany({
      where: { schoolId, periodStructureId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Slots ──────────────────────────────────────────────────

  async generateSlots(schoolId: string, periodStructureId: string) {
    // Load the period structure with its periods template and working days
    const ps = await prisma.periodStructure.findFirst({
      where: { id: periodStructureId, schoolId, deletedAt: null },
      include: { workingDays: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!ps) {
      throw new NotFoundError('Period structure', periodStructureId);
    }

    const periods = ps.periods as unknown as SlotEntry[];
    if (!periods || !Array.isArray(periods) || periods.length === 0) {
      throw new AppError(
        'Period structure has no periods defined. Update it with a periods array first.',
        400,
        'BAD_REQUEST',
      );
    }

    if (ps.workingDays.length === 0) {
      throw new AppError(
        'No working days configured. Set working days first.',
        400,
        'BAD_REQUEST',
      );
    }

    // Idempotent: delete existing slots, then recreate
    const dayIds = ps.workingDays.map((d) => d.id);
    await prisma.slot.deleteMany({ where: { workingDayId: { in: dayIds } } });

    const sorted = [...periods].sort((a, b) => a.order - b.order);
    const slotData = ps.workingDays.flatMap((day) => {
      let periodNumber = 0;
      return sorted.map((period) => {
        if (period.type === 'PERIOD') periodNumber++;
        return {
          schoolId,
          workingDayId: day.id,
          slotType: period.type as 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK',
          slotNumber: period.type === 'PERIOD' ? periodNumber : null,
          startTime: this.parseTime(period.startTime),
          endTime: this.parseTime(period.endTime),
          sortOrder: period.order,
        };
      });
    });

    await prisma.slot.createMany({ data: slotData });

    // Return generated slots grouped by day
    return this.getSlots(schoolId, periodStructureId);
  }

  async getSlots(schoolId: string, periodStructureId: string) {
    const workingDays = await prisma.workingDay.findMany({
      where: { periodStructureId, schoolId },
      orderBy: { sortOrder: 'asc' },
    });

    const slots = await prisma.slot.findMany({
      where: { schoolId, workingDayId: { in: workingDays.map((d) => d.id) } },
      orderBy: [{ workingDayId: 'asc' }, { sortOrder: 'asc' }],
      include: { workingDay: true },
    });

    return this.groupSlotsByDay(workingDays, slots);
  }

  // ── Private helpers ────────────────────────────────────────

  private validatePeriods(periods: SlotEntry[]) {
    // Unique order numbers
    const orders = periods.map((p) => p.order);
    if (new Set(orders).size !== orders.length) {
      throw new AppError('Period order numbers must be unique', 400, 'VALIDATION_ERROR');
    }

    // Time ordering within each period
    for (const p of periods) {
      if (p.startTime >= p.endTime) {
        throw new AppError(
          `Period ${p.order}: start time must be before end time`,
          400,
          'VALIDATION_ERROR',
        );
      }
    }

    // No overlapping times
    const sorted = [...periods].sort((a, b) => a.order - b.order);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) {
        throw new AppError(
          `Period ${sorted[i].order} overlaps with period ${sorted[i - 1].order}`,
          400,
          'VALIDATION_ERROR',
        );
      }
    }
  }

  private async regenerateSlotsForStructure(schoolId: string, periodStructureId: string, periods: SlotEntry[]) {
    const workingDays = await prisma.workingDay.findMany({
      where: { periodStructureId },
      orderBy: { sortOrder: 'asc' },
    });
    if (workingDays.length === 0) return;

    const dayIds = workingDays.map((d) => d.id);
    await prisma.slot.deleteMany({ where: { workingDayId: { in: dayIds } } });

    const sorted = [...periods].sort((a, b) => a.order - b.order);
    const slotData = workingDays.flatMap((day) => {
      let periodNumber = 0;
      return sorted.map((period) => {
        if (period.type === 'PERIOD') periodNumber++;
        return {
          schoolId,
          workingDayId: day.id,
          slotType: period.type as 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK',
          slotNumber: period.type === 'PERIOD' ? periodNumber : null,
          startTime: this.parseTime(period.startTime),
          endTime: this.parseTime(period.endTime),
          sortOrder: period.order,
        };
      });
    });

    await prisma.slot.createMany({ data: slotData });
  }

  private parseTime(timeStr: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
  }

  private groupSlotsByDay(
    workingDays: Array<{ id: string; label: string; dayOfWeek: number; sortOrder: number }>,
    slots: Array<Record<string, unknown>>,
  ) {
    const slotsByDay = new Map<string, Array<Record<string, unknown>>>();
    for (const slot of slots) {
      const dayId = slot.workingDayId as string;
      if (!slotsByDay.has(dayId)) slotsByDay.set(dayId, []);
      slotsByDay.get(dayId)!.push(slot);
    }

    return workingDays.map((day) => ({
      ...day,
      slots: (slotsByDay.get(day.id) || []).sort(
        (a, b) => (a.sortOrder as number) - (b.sortOrder as number),
      ),
    }));
  }
}
