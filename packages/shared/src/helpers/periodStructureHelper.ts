import { prisma } from '../db/client';

export interface PeriodSlot {
  id: string;
  workingDayId: string;
  dayOfWeek: number;
  dayLabel: string;
  slotType: string;
  slotNumber: number | null;
  startTime: Date;
  endTime: Date;
  sortOrder: number;
}

export interface PeriodSlotResult {
  slots: PeriodSlot[];
  byDay: Map<string, PeriodSlot[]>;
  totalPeriodsPerDay: number;
  workingDayCount: number;
  totalSlotsPerWeek: number;
}

/**
 * Load all slots for a period structure, grouped by working day.
 * Returns slots sorted by sortOrder within each day.
 *
 * Consolidates repeated slot loading across:
 * - school-config/service.ts :: generateSlots(), resetToDefault()
 * - export/service.ts :: getDivisionGrid(), getTeacherGrid()
 * - timetable/service.ts :: grid rendering
 */
export async function loadPeriodSlots(params: {
  periodStructureId: string;
  includeNonPeriod?: boolean;
}): Promise<PeriodSlotResult> {
  const { periodStructureId, includeNonPeriod = false } = params;

  const workingDays = await prisma.workingDay.findMany({
    where: { periodStructureId },
    orderBy: { sortOrder: 'asc' },
    include: {
      slots: {
        where: includeNonPeriod ? {} : { slotType: 'PERIOD' },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  const slots: PeriodSlot[] = [];
  const byDay = new Map<string, PeriodSlot[]>();

  for (const wd of workingDays) {
    const daySlots: PeriodSlot[] = [];
    for (const s of wd.slots) {
      const slot: PeriodSlot = {
        id: s.id,
        workingDayId: wd.id,
        dayOfWeek: wd.dayOfWeek,
        dayLabel: wd.label,
        slotType: s.slotType,
        slotNumber: s.slotNumber,
        startTime: s.startTime,
        endTime: s.endTime,
        sortOrder: s.sortOrder,
      };
      slots.push(slot);
      daySlots.push(slot);
    }
    byDay.set(wd.id, daySlots);
  }

  // Count PERIOD-type slots per day (use first day as reference)
  const firstDaySlots = workingDays[0]?.slots ?? [];
  const totalPeriodsPerDay = firstDaySlots.filter(s => s.slotType === 'PERIOD').length;

  return {
    slots,
    byDay,
    totalPeriodsPerDay,
    workingDayCount: workingDays.length,
    totalSlotsPerWeek: totalPeriodsPerDay * workingDays.length,
  };
}

/**
 * Load a division's period structure slots.
 * Convenience wrapper: looks up division's periodStructureId, then calls loadPeriodSlots().
 */
export async function loadDivisionPeriodSlots(
  divisionId: string,
  options?: { includeNonPeriod?: boolean },
): Promise<PeriodSlotResult & { periodStructureId: string }> {
  const division = await prisma.division.findUnique({
    where: { id: divisionId },
    select: { periodStructureId: true },
  });

  if (!division?.periodStructureId) {
    return {
      slots: [],
      byDay: new Map(),
      totalPeriodsPerDay: 0,
      workingDayCount: 0,
      totalSlotsPerWeek: 0,
      periodStructureId: '',
    };
  }

  const result = await loadPeriodSlots({
    periodStructureId: division.periodStructureId,
    includeNonPeriod: options?.includeNonPeriod,
  });

  return { ...result, periodStructureId: division.periodStructureId };
}
