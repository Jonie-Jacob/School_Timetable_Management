import {
  prisma,
  AppError,
  NotFoundError,
  ConflictError,
  type CreatePeriodStructureDto,
  type UpdatePeriodStructureDto,
  type AssignPeriodStructureDto,
  type SetWorkingDaysDto,
  type AddSlotDto,
  type UpdateSlotDto,
  type ReorderSlotsDto,
  type SlotEntry,
  DayOfWeek,
  flagTimetables,
  findAffectedTimetableIds, recomputeMultipleTimetableStatuses,
  checkDuplicateName,
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

/**
 * Format a Prisma Time field (returned as a Date) to "HH:MM" string for the frontend.
 * The frontend's <input type="time"> requires HH:MM format.
 */
function formatSlotTime(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Recursively format slot times in a structure containing workingDays[].slots[].
 */
function formatStructureSlots<T extends { workingDays?: Array<{ slots?: Array<any> }> }>(structure: T): T {
  if (structure?.workingDays) {
    for (const wd of structure.workingDays) {
      if (wd.slots) {
        wd.slots = wd.slots.map((s: any) => ({
          ...s,
          startTime: formatSlotTime(s.startTime),
          endTime: formatSlotTime(s.endTime),
        }));
      }
    }
  }
  return structure;
}

export class SchoolConfigService {
  // ── Period Structures ──────────────────────────────────────

  async createPeriodStructure(schoolId: string, academicYearId: string, input: CreatePeriodStructureDto) {
    await checkDuplicateName({ model: 'periodStructure', name: input.name, schoolId, academicYearId });

    this.validatePeriods(input.periods);

    // If a soft-deleted record with the same name exists, hard-delete it and its children
    // (DB unique constraint includes soft-deleted rows)
    const stale = await prisma.periodStructure.findMany({
      where: { schoolId, academicYearId, name: input.name, deletedAt: { not: null } },
      select: { id: true },
    });
    if (stale.length > 0) {
      const staleIds = stale.map(s => s.id);
      // Delete slots → working days → period structure (respecting FK order)
      const staleDays = await prisma.workingDay.findMany({
        where: { periodStructureId: { in: staleIds } },
        select: { id: true },
      });
      if (staleDays.length > 0) {
        const staleDayIds = staleDays.map(d => d.id);
        const staleSlotIds = (await prisma.slot.findMany({ where: { workingDayId: { in: staleDayIds } }, select: { id: true } })).map(s => s.id);
        if (staleSlotIds.length > 0) {
          await prisma.timetableSlot.deleteMany({ where: { slotId: { in: staleSlotIds } } });
          await prisma.teacherAvailability.deleteMany({ where: { slotId: { in: staleSlotIds } } });
        }
        await prisma.slot.deleteMany({ where: { workingDayId: { in: staleDayIds } } });
      }
      await prisma.workingDay.deleteMany({ where: { periodStructureId: { in: staleIds } } });
      // Unlink any divisions still pointing to this structure
      await prisma.division.updateMany({
        where: { periodStructureId: { in: staleIds } },
        data: { periodStructureId: null },
      });
      await prisma.periodStructure.deleteMany({ where: { id: { in: staleIds } } });
    }

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
        divisions: {
          where: { deletedAt: null },
          include: { class: { select: { id: true, name: true } } },
        },
        workingDays: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getPeriodStructure(schoolId: string, academicYearId: string, id: string) {
    const structure = await prisma.periodStructure.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
      include: {
        divisions: {
          where: { deletedAt: null },
          include: { class: { select: { id: true, name: true } } },
        },
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
    return formatStructureSlots(structure);
  }

  async updatePeriodStructure(schoolId: string, academicYearId: string, id: string, input: UpdatePeriodStructureDto) {
    const existing = await prisma.periodStructure.findFirst({
      where: { id, schoolId, academicYearId, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundError('Period structure', id);
    }

    if (input.name) {
      await checkDuplicateName({ model: 'periodStructure', name: input.name, schoolId, academicYearId, excludeId: id });
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

    const assignedDivisions = await prisma.division.count({
      where: { periodStructureId: id, deletedAt: null },
    });
    if (assignedDivisions > 0) {
      throw new AppError(
        'Cannot delete period structure with assigned divisions. Remove division assignments first.',
        400,
        'BAD_REQUEST',
      );
    }

    await prisma.periodStructure.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async assignToDivisions(schoolId: string, academicYearId: string, periodStructureId: string, input: AssignPeriodStructureDto) {
    const ps = await prisma.periodStructure.findFirst({
      where: { id: periodStructureId, schoolId, academicYearId, deletedAt: null },
    });
    if (!ps) {
      throw new NotFoundError('Period structure', periodStructureId);
    }

    // Verify all division IDs belong to this school+academic year
    const divisions = await prisma.division.findMany({
      where: { id: { in: input.divisionIds }, schoolId, academicYearId, deletedAt: null },
    });
    if (divisions.length !== input.divisionIds.length) {
      const foundIds = new Set(divisions.map((d) => d.id));
      const missing = input.divisionIds.filter((did) => !foundIds.has(did));
      throw new NotFoundError('Division', missing.join(', '));
    }

    // Update all specified divisions to point to this period structure
    await prisma.division.updateMany({
      where: { id: { in: input.divisionIds }, schoolId },
      data: { periodStructureId },
    });

    // Return updated divisions
    const updated = await prisma.division.findMany({
      where: { periodStructureId, schoolId, deletedAt: null },
      include: { class: { select: { id: true, name: true } } },
    });

    return { periodStructureId, divisions: updated };
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
      const oldSlotIds = (await prisma.slot.findMany({ where: { workingDayId: { in: dayIds } }, select: { id: true } })).map(s => s.id);

      if (oldSlotIds.length > 0) {
        await prisma.timetableSlot.deleteMany({ where: { slotId: { in: oldSlotIds } } });
        await prisma.teacherAvailability.deleteMany({ where: { slotId: { in: oldSlotIds } } });
      }

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

    // Auto-generate slots from the period structure's periods JSON
    const periods = ps.periods as unknown as SlotEntry[];
    if (periods && Array.isArray(periods) && periods.length > 0) {
      const slotData = created.flatMap((day) => {
        let periodNumber = 0;
        return periods
          .sort((a, b) => a.order - b.order)
          .map((period, idx) => {
            if (period.type === 'PERIOD') periodNumber++;
            return {
              schoolId,
              workingDayId: day.id,
              slotType: period.type as 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK',
              slotNumber: period.type === 'PERIOD' ? periodNumber : null,
              startTime: new Date(`1970-01-01T${period.startTime}:00Z`),
              endTime: new Date(`1970-01-01T${period.endTime}:00Z`),
              sortOrder: idx + 1,
            };
          });
      });
      if (slotData.length > 0) {
        await prisma.slot.createMany({ data: slotData });
      }
    }

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
    const existingSlotIds = (await prisma.slot.findMany({ where: { workingDayId: { in: dayIds } }, select: { id: true } })).map(s => s.id);
    if (existingSlotIds.length > 0) {
      await prisma.timetableSlot.deleteMany({ where: { slotId: { in: existingSlotIds } } });
      await prisma.teacherAvailability.deleteMany({ where: { slotId: { in: existingSlotIds } } });
    }
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

  // ── Reset to Default ───────────────────────────────────────

  async resetToDefault(schoolId: string, academicYearId: string, periodStructureId: string) {
    const ps = await prisma.periodStructure.findFirst({
      where: { id: periodStructureId, schoolId, academicYearId, deletedAt: null },
    });
    if (!ps) {
      throw new NotFoundError('Period structure', periodStructureId);
    }

    // Set working days to Mon-Fri
    const defaultDays: Array<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY'> = [
      'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY',
    ];
    await this.setWorkingDays(schoolId, academicYearId, periodStructureId, { days: defaultDays });

    // Load newly created working days
    const workingDays = await prisma.workingDay.findMany({
      where: { periodStructureId, schoolId },
      orderBy: { sortOrder: 'asc' },
    });

    // Define the default schedule: 8 periods with standard breaks
    const defaultSlots: Array<{ type: 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK'; startTime: string; endTime: string }> = [
      { type: 'PERIOD',      startTime: '09:00', endTime: '09:45' },
      { type: 'PERIOD',      startTime: '09:45', endTime: '10:30' },
      { type: 'INTERVAL',    startTime: '10:30', endTime: '10:45' },
      { type: 'PERIOD',      startTime: '10:45', endTime: '11:30' },
      { type: 'PERIOD',      startTime: '11:30', endTime: '12:15' },
      { type: 'LUNCH_BREAK', startTime: '12:15', endTime: '12:45' },
      { type: 'PERIOD',      startTime: '12:45', endTime: '13:30' },
      { type: 'PERIOD',      startTime: '13:30', endTime: '14:15' },
      { type: 'INTERVAL',    startTime: '14:15', endTime: '14:30' },
      { type: 'PERIOD',      startTime: '14:30', endTime: '15:15' },
      { type: 'PERIOD',      startTime: '15:15', endTime: '16:00' },
    ];

    const slotData = workingDays.flatMap((day) => {
      let periodNumber = 0;
      return defaultSlots.map((slot, index) => {
        if (slot.type === 'PERIOD') periodNumber++;
        return {
          schoolId,
          workingDayId: day.id,
          slotType: slot.type,
          slotNumber: slot.type === 'PERIOD' ? periodNumber : null,
          startTime: this.parseTime(slot.startTime),
          endTime: this.parseTime(slot.endTime),
          sortOrder: index + 1,
        };
      });
    });

    await prisma.slot.createMany({ data: slotData });

    return this.getSlots(schoolId, periodStructureId);
  }

  // ── Individual Slot Operations ────────────────────────────

  async addSlot(schoolId: string, periodStructureId: string, dayId: string, input: AddSlotDto) {
    // Verify the working day belongs to this period structure
    const workingDay = await prisma.workingDay.findFirst({
      where: { id: dayId, periodStructureId, schoolId },
    });
    if (!workingDay) {
      throw new NotFoundError('Working day', dayId);
    }

    // Get current max sortOrder for this day
    const maxSlot = await prisma.slot.findFirst({
      where: { workingDayId: dayId, schoolId },
      orderBy: { sortOrder: 'desc' },
    });
    const sortOrder = (maxSlot?.sortOrder ?? 0) + 1;

    // Calculate slotNumber for PERIOD type
    let slotNumber: number | null = null;
    if (input.slotType === 'PERIOD') {
      const periodCount = await prisma.slot.count({
        where: { workingDayId: dayId, schoolId, slotType: 'PERIOD' },
      });
      slotNumber = periodCount + 1;
    }

    const slot = await prisma.slot.create({
      data: {
        schoolId,
        workingDayId: dayId,
        slotType: input.slotType as 'PERIOD' | 'INTERVAL' | 'LUNCH_BREAK',
        slotNumber,
        startTime: this.parseTime(input.startTime),
        endTime: this.parseTime(input.endTime),
        sortOrder,
      },
    });

    // Flag timetables + backfill empty timetable_slot rows for new period
    if (input.slotType === 'PERIOD') {
      await flagTimetables({
        schoolId,
        periodStructureId,
        conflictType: 'STRUCTURE_CHANGED',
        changeDescription: `Period P${slotNumber} added to structure`,
        backfillSlotIds: [slot.id],
      });
      const addSlotTtIds = await findAffectedTimetableIds({ schoolId, periodStructureId, entityType: 'PERIOD_STRUCTURE', entityId: periodStructureId });
      await recomputeMultipleTimetableStatuses(addSlotTtIds);
    }

    return slot;
  }

  async updateSlot(schoolId: string, periodStructureId: string, dayId: string, slotId: string, input: UpdateSlotDto) {
    const workingDay = await prisma.workingDay.findFirst({
      where: { id: dayId, periodStructureId, schoolId },
    });
    if (!workingDay) {
      throw new NotFoundError('Working day', dayId);
    }

    const existing = await prisma.slot.findFirst({
      where: { id: slotId, workingDayId: dayId, schoolId },
    });
    if (!existing) {
      throw new NotFoundError('Slot', slotId);
    }

    const data: Record<string, unknown> = {};
    if (input.startTime) data.startTime = this.parseTime(input.startTime);
    if (input.endTime) data.endTime = this.parseTime(input.endTime);
    if (input.slotType) data.slotType = input.slotType;

    const updated = await prisma.slot.update({
      where: { id: slotId },
      data,
    });

    // If slot type changed, recalculate period numbers for all slots in this day
    if (input.slotType && input.slotType !== existing.slotType) {
      await this.recalculatePeriodNumbers(dayId, schoolId);
      await flagTimetables({
        schoolId,
        periodStructureId,
        conflictType: 'STRUCTURE_CHANGED',
        changeDescription: 'Slot type changed in period structure',
        backfillSlotIds: input.slotType === 'PERIOD' ? [slotId] : undefined,
      });
      const updSlotTtIds = await findAffectedTimetableIds({ schoolId, periodStructureId, entityType: 'PERIOD_STRUCTURE', entityId: periodStructureId });
      await recomputeMultipleTimetableStatuses(updSlotTtIds);
    }

    return updated;
  }

  async deleteSlot(schoolId: string, periodStructureId: string, dayId: string, slotId: string, confirm: boolean) {
    const workingDay = await prisma.workingDay.findFirst({
      where: { id: dayId, periodStructureId, schoolId },
    });
    if (!workingDay) {
      throw new NotFoundError('Working day', dayId);
    }

    const existing = await prisma.slot.findFirst({
      where: { id: slotId, workingDayId: dayId, schoolId },
    });
    if (!existing) {
      throw new NotFoundError('Slot', slotId);
    }

    // Check for timetable slot references
    const timetableSlotCount = await prisma.timetableSlot.count({
      where: { slotId, schoolId },
    });

    if (timetableSlotCount > 0 && !confirm) {
      throw new ConflictError(
        `This slot is referenced by ${timetableSlotCount} timetable slot(s). Pass ?confirm=true to delete and nullify timetable references.`,
      );
    }

    if (timetableSlotCount > 0 && confirm) {
      await prisma.timetableSlot.deleteMany({
        where: { slotId, schoolId },
      });
    }

    // Delete teacher availability referencing this slot
    await prisma.teacherAvailability.deleteMany({ where: { slotId } });

    const wasPeriod = existing.slotType === 'PERIOD';

    await prisma.slot.delete({ where: { id: slotId } });

    // Recalculate period numbers for remaining slots
    await this.recalculatePeriodNumbers(dayId, schoolId);

    // Flag timetables as OUTDATED if a PERIOD slot was removed
    if (wasPeriod) {
      await flagTimetables({
        schoolId,
        periodStructureId,
        conflictType: 'STRUCTURE_CHANGED',
        changeDescription: 'Period removed from structure',
      });
      const delSlotTtIds = await findAffectedTimetableIds({ schoolId, periodStructureId, entityType: 'PERIOD_STRUCTURE', entityId: periodStructureId });
      await recomputeMultipleTimetableStatuses(delSlotTtIds);
    }
  }

  async reorderSlots(schoolId: string, periodStructureId: string, dayId: string, input: ReorderSlotsDto) {
    const workingDay = await prisma.workingDay.findFirst({
      where: { id: dayId, periodStructureId, schoolId },
    });
    if (!workingDay) {
      throw new NotFoundError('Working day', dayId);
    }

    // Verify all slot IDs belong to this day
    const existingSlots = await prisma.slot.findMany({
      where: { workingDayId: dayId, schoolId },
    });
    const existingIds = new Set(existingSlots.map((s) => s.id));
    for (const id of input.slotIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundError('Slot', id);
      }
    }

    // Update sort orders in a transaction
    await prisma.$transaction(
      input.slotIds.map((id: string, index: number) =>
        prisma.slot.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    // Recalculate period numbers based on new order
    await this.recalculatePeriodNumbers(dayId, schoolId);

    // Return updated slots
    return prisma.slot.findMany({
      where: { workingDayId: dayId, schoolId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async copyDaySlots(schoolId: string, periodStructureId: string, targetDayId: string, sourceDayId: string) {
    // Verify both days belong to this period structure
    const [sourceDay, targetDay] = await Promise.all([
      prisma.workingDay.findFirst({ where: { id: sourceDayId, periodStructureId, schoolId } }),
      prisma.workingDay.findFirst({ where: { id: targetDayId, periodStructureId, schoolId } }),
    ]);
    if (!sourceDay) {
      throw new NotFoundError('Source working day', sourceDayId);
    }
    if (!targetDay) {
      throw new NotFoundError('Target working day', targetDayId);
    }

    // Get source day slots
    const sourceSlots = await prisma.slot.findMany({
      where: { workingDayId: sourceDayId, schoolId },
      orderBy: { sortOrder: 'asc' },
    });

    // Delete existing target day slots (clean up references first)
    const targetSlotIds = (await prisma.slot.findMany({ where: { workingDayId: targetDayId, schoolId }, select: { id: true } })).map(s => s.id);
    if (targetSlotIds.length > 0) {
      await prisma.timetableSlot.deleteMany({ where: { slotId: { in: targetSlotIds } } });
      await prisma.teacherAvailability.deleteMany({ where: { slotId: { in: targetSlotIds } } });
    }
    await prisma.slot.deleteMany({
      where: { workingDayId: targetDayId, schoolId },
    });

    // Deep-copy slots from source to target
    if (sourceSlots.length > 0) {
      await prisma.slot.createMany({
        data: sourceSlots.map((slot) => ({
          schoolId,
          workingDayId: targetDayId,
          slotType: slot.slotType,
          slotNumber: slot.slotNumber,
          startTime: slot.startTime,
          endTime: slot.endTime,
          sortOrder: slot.sortOrder,
        })),
      });
    }

    // Return the new target day slots
    return prisma.slot.findMany({
      where: { workingDayId: targetDayId, schoolId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ── Private helpers ────────────────────────────────────────

  private async recalculatePeriodNumbers(dayId: string, schoolId: string) {
    const slots = await prisma.slot.findMany({
      where: { workingDayId: dayId, schoolId },
      orderBy: { sortOrder: 'asc' },
    });

    let periodNumber = 0;
    const updates = slots.map((slot) => {
      const newNumber = slot.slotType === 'PERIOD' ? ++periodNumber : null;
      return prisma.slot.update({
        where: { id: slot.id },
        data: { slotNumber: newNumber },
      });
    });

    if (updates.length > 0) {
      await prisma.$transaction(updates);
    }
  }

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

    // Delete records referencing slots about to be deleted
    const oldSlotIds = (await prisma.slot.findMany({ where: { workingDayId: { in: dayIds } }, select: { id: true } })).map(s => s.id);

    await prisma.timetableSlot.deleteMany({
      where: { slotId: { in: oldSlotIds } },
    });

    await prisma.teacherAvailability.deleteMany({
      where: { slotId: { in: oldSlotIds } },
    });

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

    // Get new period slot IDs for backfilling timetable_slots
    const newPeriodSlots = await prisma.slot.findMany({
      where: { workingDayId: { in: dayIds }, slotType: 'PERIOD' },
      select: { id: true },
    });

    await flagTimetables({
      schoolId,
      periodStructureId,
      conflictType: 'STRUCTURE_CHANGED',
      changeDescription: 'Period structure updated',
      backfillSlotIds: newPeriodSlots.map(s => s.id),
    });
    const regenTtIds = await findAffectedTimetableIds({ schoolId, periodStructureId, entityType: 'PERIOD_STRUCTURE', entityId: periodStructureId });
    await recomputeMultipleTimetableStatuses(regenTtIds);
  }

  /**
   * Flag all timetables using this period structure as OUTDATED and create
   * STRUCTURE_CHANGED notifications. Also backfill empty timetable_slot rows
   * for any newly created slot IDs.
   */

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
