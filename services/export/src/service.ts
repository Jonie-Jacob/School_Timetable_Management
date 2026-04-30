import {
  prisma, AppError, NotFoundError,
  buildTeacherBusyRanges, isTeacherBusyInRanges,
} from '@timetable/shared';
import { SlotType } from '@prisma/client';
import ExcelJS from 'exceljs';
// ── Types for internal grid structures ──

interface SlotInfo {
  slotType: string;
  slotNumber: number | null;
  startTime: Date;
  endTime: Date;
  sortOrder: number;
}

/**
 * One assignment that occupies a cell. For an elective group cell there
 * are multiple of these stacked together; for a normal cell exactly one.
 */
interface CellEntry {
  subject: string;
  subjectAbbr?: string;
  teacher: string;
  assistantTeacher?: string;
}

interface CellContent {
  entries: CellEntry[];
  // When set, the renderer prepends an "ELECTIVE: <name>" header above
  // the entries to make the stack visually distinct from a normal cell.
  electiveGroupName?: string;
}

interface DayColumn {
  label: string;
  sortOrder: number;
  // keyed by slot sortOrder. Empty entries[] (or missing key) = empty cell.
  periods: Map<number, CellContent>;
}

interface TeacherStats {
  totalPeriodsPerWeek: number;
  classCounts: { className: string; periods: number }[];
}

interface TimetableGrid {
  title: string;
  subtitle: string;
  classTeacherName?: string | null;
  slots: SlotInfo[];
  days: DayColumn[];
  teacherStats?: TeacherStats;
}

// ── Helpers ──

// Compact form for export headers where space is tight.
// Strips the AM/PM when both start+end share it, and drops leading zeros.
function formatTimeCompact(d: Date): string {
  const hours24 = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes}`;
}

function formatSlotRange(start: Date, end: Date): string {
  const startAmPm = start.getUTCHours() >= 12 ? 'PM' : 'AM';
  const endAmPm = end.getUTCHours() >= 12 ? 'PM' : 'AM';
  if (startAmPm === endAmPm) {
    return `${formatTimeCompact(start)}-${formatTimeCompact(end)} ${endAmPm}`;
  }
  return `${formatTimeCompact(start)}${startAmPm}-${formatTimeCompact(end)}${endAmPm}`;
}

export class ExportService {

  // ── Division Timetable Data ──

  private async getDivisionGrid(schoolId: string, academicYearId: string, divisionId: string): Promise<TimetableGrid> {
    // Verify timetable exists
    const timetable = await prisma.timetable.findUnique({
      where: { schoolId_divisionId_academicYearId: { schoolId, divisionId, academicYearId } },
      include: {
        division: {
          include: {
            class: { select: { name: true } },
            classTeacher: { select: { name: true } },
          },
        },
      },
    });
    if (!timetable) throw new NotFoundError('Timetable');

    const slots = await prisma.timetableSlot.findMany({
      where: { timetableId: timetable.id },
      include: {
        workingDay: true,
        slot: true,
        divisionAssignment: {
          include: {
            subject: { select: { name: true, abbreviation: true } },
            teacher: { select: { name: true } },
            assistantTeacher: { select: { name: true } },
            electiveGroup: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { workingDay: { sortOrder: 'asc' } },
        { slot: { sortOrder: 'asc' } },
      ],
    });

    // Collect unique slots (periods + breaks) in order
    const slotMap = new Map<number, SlotInfo>();
    for (const s of slots) {
      if (!slotMap.has(s.slot.sortOrder)) {
        slotMap.set(s.slot.sortOrder, {
          slotType: s.slot.slotType,
          slotNumber: s.slot.slotNumber,
          startTime: s.slot.startTime,
          endTime: s.slot.endTime,
          sortOrder: s.slot.sortOrder,
        });
      }
    }

    // Also fetch break slots from the period structure for this division
    const divisionRecord = await prisma.division.findUnique({
      where: { id: divisionId },
    });
    if (divisionRecord?.periodStructureId) {
      const allStructureSlots = await prisma.slot.findMany({
        where: { workingDay: { periodStructureId: divisionRecord.periodStructureId } },
        orderBy: { sortOrder: 'asc' },
      });
      for (const sl of allStructureSlots) {
        if (!slotMap.has(sl.sortOrder)) {
          slotMap.set(sl.sortOrder, {
            slotType: sl.slotType,
            slotNumber: sl.slotNumber,
            startTime: sl.startTime,
            endTime: sl.endTime,
            sortOrder: sl.sortOrder,
          });
        }
      }
    }

    const orderedSlots = Array.from(slotMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    // Group by day, then by slot sortOrder. Multiple timetable_slots may
    // share the same (day, slot) when an elective group has parallel
    // sections -- we accumulate them into one CellContent with multiple
    // entries and remember the elective group name for the header line.
    const dayMap = new Map<string, DayColumn>();
    for (const s of slots) {
      const dayKey = s.workingDayId;
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          label: s.workingDay.label,
          sortOrder: s.workingDay.sortOrder,
          periods: new Map(),
        });
      }
      const day = dayMap.get(dayKey)!;
      const da = s.divisionAssignment;
      if (!da) continue; // Empty cells stay missing from the map
      const cell = day.periods.get(s.slot.sortOrder) ?? { entries: [] };
      cell.entries.push({
        subject: da.subject.name,
        subjectAbbr: da.subject.abbreviation ?? undefined,
        teacher: da.teacher?.name ?? '(Unassigned)',
        assistantTeacher: da.assistantTeacher?.name ?? undefined,
      });
      if (da.electiveGroup?.name) {
        cell.electiveGroupName = da.electiveGroup.name;
      }
      day.periods.set(s.slot.sortOrder, cell);
    }

    const orderedDays = Array.from(dayMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    const className = timetable.division.class.name;
    const divLabel = timetable.division.label;

    return {
      title: `${className} - ${divLabel}`,
      subtitle: `Division Timetable`,
      classTeacherName: timetable.division.classTeacher?.name ?? null,
      slots: orderedSlots,
      days: orderedDays,
    };
  }

  // ── Teacher Timetable Data ──

  private async getTeacherGrid(schoolId: string, academicYearId: string, teacherId: string): Promise<TimetableGrid> {
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, schoolId, academicYearId, deletedAt: null },
    });
    if (!teacher) throw new NotFoundError('Teacher', teacherId);

    const timetableSlots = await prisma.timetableSlot.findMany({
      where: {
        schoolId,
        timetable: { academicYearId },
        divisionAssignment: {
          deletedAt: null,
          OR: [{ teacherId }, { assistantTeacherId: teacherId }],
        },
      },
      include: {
        workingDay: true,
        slot: true,
        timetable: {
          include: {
            division: {
              select: { label: true, class: { select: { name: true } } },
            },
          },
        },
        divisionAssignment: {
          select: {
            id: true,
            teacherId: true,
            assistantTeacherId: true,
            electiveGroupId: true,
            subject: { select: { name: true, abbreviation: true } },
            teacher: { select: { name: true } },
            assistantTeacher: { select: { name: true } },
          },
        },
      },
      orderBy: [
        { workingDay: { sortOrder: 'asc' } },
        { slot: { sortOrder: 'asc' } },
      ],
    });

    if (timetableSlots.length === 0) {
      throw new AppError('No timetable data found for this teacher', 404, 'NO_TIMETABLE');
    }

    // Collect unique slots in order
    const slotMap = new Map<number, SlotInfo>();
    for (const s of timetableSlots) {
      if (!slotMap.has(s.slot.sortOrder)) {
        slotMap.set(s.slot.sortOrder, {
          slotType: s.slot.slotType,
          slotNumber: s.slot.slotNumber,
          startTime: s.slot.startTime,
          endTime: s.slot.endTime,
          sortOrder: s.slot.sortOrder,
        });
      }
    }

    // For teacher view, also load break slots from any period structure they teach in
    // Get a sample division that has a period structure assigned
    const sampleDiv = await prisma.division.findFirst({
      where: { schoolId, academicYearId, deletedAt: null, periodStructureId: { not: null } },
    });
    if (sampleDiv?.periodStructureId) {
      const allSlots = await prisma.slot.findMany({
        where: { workingDay: { periodStructureId: sampleDiv.periodStructureId } },
        orderBy: { sortOrder: 'asc' },
      });
      for (const sl of allSlots) {
        if (!slotMap.has(sl.sortOrder)) {
          slotMap.set(sl.sortOrder, {
            slotType: sl.slotType,
            slotNumber: sl.slotNumber,
            startTime: sl.startTime,
            endTime: sl.endTime,
            sortOrder: sl.sortOrder,
          });
        }
      }
    }

    const orderedSlots = Array.from(slotMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    // Group by dayOfWeek (not workingDayId). A teacher may teach across
    // multiple period structures, each with its own WorkingDay records.
    // "Monday" in structure A and "Monday" in structure B share
    // dayOfWeek=1 but have different workingDayIds. Grouping by
    // dayOfWeek consolidates them into one row.
    const dayMap = new Map<number, DayColumn>();
    for (const s of timetableSlots) {
      const dayKey = s.workingDay.dayOfWeek;
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          label: s.workingDay.label,
          sortOrder: s.workingDay.sortOrder,
          periods: new Map(),
        });
      }
      const day = dayMap.get(dayKey)!;
      const className = s.timetable.division.class.name;
      const divLabel = s.timetable.division.label;
      const isAssistant = s.divisionAssignment?.assistantTeacherId === teacherId;
      const cell = day.periods.get(s.slot.sortOrder) ?? { entries: [] };
      // Show the other teacher (assistant if viewing primary, primary if viewing assistant)
      const da = s.divisionAssignment;
      const otherTeacher = isAssistant
        ? da?.teacher?.name
        : da?.assistantTeacher?.name;
      cell.entries.push({
        subject: da?.subject?.name ?? '-',
        subjectAbbr: da?.subject?.abbreviation ?? undefined,
        teacher: isAssistant ? `${className} ${divLabel} (Asst)` : `${className} ${divLabel}`,
        assistantTeacher: otherTeacher ?? undefined,
      });
      day.periods.set(s.slot.sortOrder, cell);
    }

    const orderedDays = Array.from(dayMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    // Compute teacher stats: total periods and class-wise breakdown.
    // Use distinct keys to handle cross-div electives (same teacher at
    // same time in multiple divisions = 1 period, not N).

    // Step 1: For electives, build a combined class name from all
    // participating divisions (e.g., "XI B, XI C, XI D" instead of
    // separate entries that each show the same period count).
    const electiveGroupDivisions = new Map<string, Set<string>>();
    for (const s of timetableSlots) {
      const da = s.divisionAssignment;
      if (!da?.electiveGroupId) continue;
      const divName = `${s.timetable.division.class.name} ${s.timetable.division.label}`;
      if (!electiveGroupDivisions.has(da.electiveGroupId))
        electiveGroupDivisions.set(da.electiveGroupId, new Set());
      electiveGroupDivisions.get(da.electiveGroupId)!.add(divName);
    }
    // Build sorted combined names per elective group
    const electiveGroupClassName = new Map<string, string>();
    for (const [egId, divs] of electiveGroupDivisions) {
      electiveGroupClassName.set(
        egId,
        Array.from(divs).sort((a, b) => a.localeCompare(b)).join(', '),
      );
    }

    // Step 2: Count periods per class, using combined name for electives
    const classCountMap = new Map<string, Set<string>>();
    const totalDistinct = new Set<string>();
    for (const s of timetableSlots) {
      const da = s.divisionAssignment;
      if (!da) continue;
      const className = da.electiveGroupId
        ? electiveGroupClassName.get(da.electiveGroupId)!
        : `${s.timetable.division.class.name} ${s.timetable.division.label}`;
      if (!classCountMap.has(className)) classCountMap.set(className, new Set());
      const slotKey = da.electiveGroupId
        ? `${s.workingDay.dayOfWeek}:${s.slot.sortOrder}:eg:${da.electiveGroupId}`
        : `${s.workingDay.dayOfWeek}:${s.slot.sortOrder}:da:${da.id}`;
      classCountMap.get(className)!.add(slotKey);
      totalDistinct.add(slotKey);
    }
    const classCounts = Array.from(classCountMap.entries())
      .map(([className, keys]) => ({ className, periods: keys.size }))
      .sort((a, b) => a.className.localeCompare(b.className));

    return {
      title: teacher.name,
      subtitle: `Teacher Timetable`,
      slots: orderedSlots,
      days: orderedDays,
      teacherStats: {
        totalPeriodsPerWeek: totalDistinct.size,
        classCounts,
      },
    };
  }

  // ── HTML Rendering ──
  // Layout: Y-axis (rows) = weekdays, X-axis (columns) = periods.
  // This matches the on-screen grid in the app.

  private renderHtml(grid: TimetableGrid): string {
    // Header row: Day | P1 (time) | Break | P2 (time) | ...
    const slotHeaderCells = grid.slots.map((slot) => {
      const isBreak = slot.slotType !== SlotType.PERIOD;
      const label = isBreak
        ? (slot.slotType === SlotType.LUNCH_BREAK ? 'Lunch' : 'Break')
        : `P${slot.slotNumber ?? ''}`;
      const time = formatSlotRange(slot.startTime, slot.endTime);
      const cls = isBreak ? 'slot-header break-col' : 'slot-header';
      return `<th class="${cls}">
        <div class="slot-name">${label}</div>
        <div class="slot-time">${time}</div>
      </th>`;
    }).join('');

    // Data rows: one per weekday. A cell may hold multiple stacked entries
    // when an elective group occupies it (Mal/Hindi with parallel teachers).
    const rows = grid.days.map((day) => {
      const cells = grid.slots.map((slot) => {
        const isBreak = slot.slotType !== SlotType.PERIOD;
        if (isBreak) {
          return `<td class="break-cell">--</td>`;
        }
        const period = day.periods.get(slot.sortOrder);
        if (!period || period.entries.length === 0) {
          return `<td class="empty-cell">-</td>`;
        }
        const isElective = !!period.electiveGroupName;
        const header = isElective
          ? `<div class="elective-header">${this.escapeHtml(period.electiveGroupName!.replace(/^class\s+(?:[A-Za-z]+\s+)+?(?=[A-Za-z]+\s*\/)/i, ''))}</div>`
          : '';

        // Group entries by subject -- collapse same-subject entries into one
        // with combined teacher/class labels (e.g. "Malayalam" → "X C, X A, X B")
        const grouped = new Map<string, { abbr?: string; teachers: string[]; assistants: string[] }>();
        for (const e of period.entries) {
          const existing = grouped.get(e.subject);
          if (existing) {
            existing.teachers.push(e.teacher);
            if (e.assistantTeacher) existing.assistants.push(e.assistantTeacher);
          } else {
            grouped.set(e.subject, {
              abbr: e.subjectAbbr,
              teachers: [e.teacher],
              assistants: e.assistantTeacher ? [e.assistantTeacher] : [],
            });
          }
        }

        let entriesHtml: string;
        if (isElective && grouped.size > 1) {
          // Elective with multiple subjects: compact "Abbr - Teacher1, Teacher2" lines
          entriesHtml = Array.from(grouped.entries()).map(([subject, g]) => {
            const label = g.abbr || subject;
            const asstSuffix = g.assistants.length > 0
              ? ` <span class="assistant">(Asst: ${this.escapeHtml(g.assistants.join(', '))})</span>`
              : '';
            return `<div class="elective-line"><span class="subject">${this.escapeHtml(label)}</span> - ${this.escapeHtml(g.teachers.join(', '))}${asstSuffix}</div>`;
          }).join('');
          return `<td class="period-cell elective-cell">${header}<div class="entries-wrap">${entriesHtml}</div></td>`;
        }

        entriesHtml = Array.from(grouped.entries()).map(([subject, g]) => {
          const asstLine = g.assistants.length > 0
            ? `<div class="assistant">Asst: ${this.escapeHtml(g.assistants.join(', '))}</div>`
            : '';
          return `<div class="entry">
            <div class="subject">${this.escapeHtml(subject)}</div>
            <div class="teacher">${this.escapeHtml(g.teachers.join(', '))}</div>
            ${asstLine}
          </div>`;
        }).join('');
        const useGrid = grouped.size > 1;
        const gridClass = useGrid ? ' entries-grid' : '';
        const cls = isElective ? 'period-cell elective-cell' : 'period-cell';
        return `<td class="${cls}">${header}<div class="entries-wrap${gridClass}">${entriesHtml}</div></td>`;
      }).join('');
      return `<tr>
        <td class="day-label">${this.escapeHtml(day.label)}</td>
        ${cells}
      </tr>`;
    }).join('');

    const classTeacherLine = grid.classTeacherName
      ? `<div class="class-teacher">Class Teacher: ${this.escapeHtml(grid.classTeacherName)}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${this.escapeHtml(grid.title)} - ${this.escapeHtml(grid.subtitle)}</title>
<style>
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 14px; color: #555; margin-bottom: 6px; font-weight: normal; }
  .class-teacher { text-align: center; font-size: 12px; color: #333; margin-bottom: 14px; font-weight: 600; }
  table.timetable { width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed; }
  table.timetable th, table.timetable td { border: 1px solid #333; padding: 5px 4px; text-align: center; vertical-align: middle; word-wrap: break-word; overflow-wrap: anywhere; }
  table.timetable th { background: #2c3e50; color: #fff; font-weight: 600; }
  .slot-header { padding: 4px 3px; }
  .slot-header .slot-name { font-size: 11px; }
  .slot-header .slot-time { font-size: 8px; font-weight: normal; color: #cfd8dc; white-space: nowrap; margin-top: 2px; }
  .slot-header.break-col { background: #7f8c8d; writing-mode: vertical-lr; text-orientation: mixed; padding: 4px 2px; }
  .slot-header.break-col .slot-name { font-size: 9px; }
  .slot-header.break-col .slot-time { font-size: 7px; }
  col.break-col { width: 30px; }
  col.day-col { width: 80px; }
  .day-label { background: #ecf0f1; font-weight: 700; text-align: left; padding-left: 8px; white-space: nowrap; }
  .period-cell { vertical-align: middle; }
  .subject { font-weight: 600; font-size: 11px; }
  .teacher { font-size: 10px; color: #555; }
  .assistant { font-size: 9px; color: #888; font-style: italic; }
  /* Grid layout for cells with multiple entries (electives, teacher multi-class) */
  .entries-wrap { }
  .entries-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px; }
  .entries-grid .entry { border: 1px solid #ddd; border-radius: 2px; padding: 2px; background: #fafafa; }
  .elective-cell .entries-grid .entry { border-color: #fcd34d; background: #fffef5; }
  .elective-cell { background: #fffbeb; }
  .elective-cell .elective-header { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #b45309; font-weight: 700; padding-bottom: 2px; border-bottom: 1px dashed #f59e0b; margin-bottom: 2px; }
  .elective-line { font-size: 9px; line-height: 1.3; text-align: left; padding: 1px 2px; }
  .elective-line .subject { font-weight: 700; }
  .elective-line .assistant { font-size: 8px; color: #888; font-style: italic; }
  .break-cell { background: #fff4d6; color: #8a6d3b; font-style: italic; }
  .empty-cell { color: #b2bec3; }
  tr:nth-child(even) td:not(.day-label):not(.break-cell) { background: #f8f9fa; }
  /* Stats: multi-column layout */
  .stats-section { margin-top: 16px; }
  .stats-section h3 { font-size: 13px; margin-bottom: 6px; text-align: center; }
  .stats-columns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .stats-table { border-collapse: collapse; font-size: 11px; }
  .stats-table th, .stats-table td { border: 1px solid #333; padding: 4px 10px; text-align: left; }
  .stats-table th { background: #2c3e50; color: #fff; font-weight: 600; }
  .stats-table td:last-child { text-align: center; }
  .stats-total { font-weight: 700; background: #ecf0f1; }
</style>
</head>
<body>
  <div class="page-wrapper">
  <h1>${this.escapeHtml(grid.title)}</h1>
  <h2>${this.escapeHtml(grid.subtitle)}</h2>
  ${classTeacherLine}
  <table class="timetable">
    <colgroup>
      <col class="day-col">
      ${grid.slots.map(s => s.slotType !== SlotType.PERIOD ? '<col class="break-col">' : '<col>').join('\n      ')}
    </colgroup>
    <thead>
      <tr>
        <th class="day-label">Day</th>
        ${slotHeaderCells}
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${grid.teacherStats ? this.renderStatsHtml(grid.teacherStats) : ''}
  </div>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private renderStatsHtml(stats: TeacherStats): string {
    // Split into chunks of 10 rows for multi-column layout
    const chunkSize = 6;
    const chunks: typeof stats.classCounts[] = [];
    for (let i = 0; i < stats.classCounts.length; i += chunkSize) {
      chunks.push(stats.classCounts.slice(i, i + chunkSize));
    }

    const tables = chunks.map((chunk, idx) => {
      const rows = chunk.map(c =>
        `<tr><td>${this.escapeHtml(c.className)}</td><td>${c.periods}</td></tr>`
      ).join('');
      // Add total row only on the last chunk
      const totalRow = idx === chunks.length - 1
        ? `<tr class="stats-total"><td>Total</td><td>${stats.totalPeriodsPerWeek}</td></tr>`
        : '';
      return `<table class="stats-table">
        <thead><tr><th>Class</th><th>P/W</th></tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table>`;
    }).join('');

    return `
  <div class="stats-section">
    <h3>Summary</h3>
    <div class="stats-columns">${tables}</div>
  </div>`;
  }

  // ── Free Periods Export ──

  async exportFreePeriods(schoolId: string, academicYearId: string) {
    // Get all teachers
    const teachers = await prisma.teacher.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (teachers.length === 0) throw new AppError('No teachers found', 404, 'NO_TEACHERS');

    // Get a period structure to define the slot grid (use the one with most periods)
    const periodStructures = await prisma.periodStructure.findMany({
      where: { schoolId, academicYearId, deletedAt: null },
      include: {
        workingDays: {
          orderBy: { sortOrder: 'asc' },
          include: {
            slots: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (periodStructures.length === 0) throw new AppError('No period structures found', 404, 'NO_PERIOD_STRUCTURES');

    // Use the structure with the most PERIOD slots as the canonical grid.
    // This ensures P1–P8 all appear even when multiple structures exist.
    const countPeriodSlots = (ps: typeof periodStructures[0]) =>
      ps.workingDays[0]?.slots.filter(s => s.slotType === SlotType.PERIOD).length ?? 0;
    const canonicalPS = periodStructures.reduce((best, ps) =>
      countPeriodSlots(ps) > countPeriodSlots(best) ? ps : best
    );

    // Build canonical day → period slots mapping
    const daySlots: { dayLabel: string; dayOfWeek: number; periods: { label: string; startTime: Date; endTime: Date }[] }[] = [];
    for (const wd of canonicalPS.workingDays) {
      const periods = wd.slots
        .filter(s => s.slotType === SlotType.PERIOD)
        .map(s => ({ label: `P${s.slotNumber ?? ''}`, startTime: s.startTime, endTime: s.endTime }));
      daySlots.push({ dayLabel: wd.label, dayOfWeek: wd.dayOfWeek, periods });
    }

    // Build busy ranges using shared helper
    const busyRanges = await buildTeacherBusyRanges({ schoolId, academicYearId });

    // Build HTML: one page per day
    const pages = daySlots.map((day, dayIdx) => {
      const headerCells = day.periods.map(p => {
        const time = formatSlotRange(p.startTime, p.endTime);
        return `<th><div class="slot-name">${p.label}</div><div class="slot-time">${time}</div></th>`;
      }).join('');

      // For each period, find free teachers
      const freeByPeriod = day.periods.map(p =>
        teachers
          .filter(t => !isTeacherBusyInRanges(busyRanges, t.id, day.dayOfWeek, p.startTime, p.endTime))
          .map(t => t.name)
      );

      const maxFree = Math.max(...freeByPeriod.map(f => f.length), 1);

      // Build rows: serial number + one teacher name per column (or empty)
      const rows: string[] = [];
      for (let r = 0; r < maxFree; r++) {
        const cells = freeByPeriod.map(names => {
          const name = r < names.length ? this.escapeHtml(names[r]) : '';
          return `<td class="${name ? 'free-teacher' : 'empty-cell'}">${name || ''}</td>`;
        }).join('');
        rows.push(`<tr><td class="corner">${r + 1}</td>${cells}</tr>`);
      }

      // Count row per period
      const countCells = freeByPeriod.map(names =>
        `<td class="count-cell">${names.length}</td>`
      ).join('');

      const pageBreak = dayIdx < daySlots.length - 1 ? ' style="page-break-after: always;"' : '';

      return `<div${pageBreak}>
        <h2>${this.escapeHtml(day.dayLabel)}</h2>
        <table class="free-table">
          <thead>
            <tr><th class="corner">Free Teachers</th>${headerCells}</tr>
          </thead>
          <tbody>
            ${rows.join('\n')}
            <tr class="count-row"><td class="corner"><strong>Total Free</strong></td>${countCells}</tr>
          </tbody>
        </table>
      </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Free Periods - Teachers</title>
<style>
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
  h1 { text-align: center; font-size: 20px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 16px; margin-bottom: 8px; color: #333; }
  .subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 16px; }
  .free-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 20px; }
  .free-table th, .free-table td { border: 1px solid #333; padding: 3px 6px; text-align: center; vertical-align: top; }
  .free-table th { background: #2c3e50; color: #fff; font-weight: 600; }
  .slot-name { font-size: 11px; }
  .slot-time { font-size: 7px; font-weight: normal; color: #cfd8dc; margin-top: 1px; }
  .corner { background: #ecf0f1; font-weight: 700; text-align: left; padding-left: 8px; width: 100px; }
  .free-teacher { text-align: left; padding-left: 6px; font-size: 9px; white-space: nowrap; }
  .empty-cell { }
  .count-row td { background: #ecf0f1; font-weight: 700; font-size: 11px; }
  tr:nth-child(even) td:not(.corner) { background: #f8f9fa; }
</style>
</head>
<body>
  <h1>Free Periods -- Teacher Availability</h1>
  <div class="subtitle">${teachers.length} teachers</div>
  ${pages}
</body>
</html>`;

    return {
      format: 'pdf',
      html,
      filename: `Free_Periods_${Date.now()}.html`,
    };
  }

  // ── PDF Export (HTML file for local dev -- Chromium in production) ──

  async exportDivisionPdf(schoolId: string, academicYearId: string, divisionId: string) {
    const grid = await this.getDivisionGrid(schoolId, academicYearId, divisionId);
    const html = this.renderHtml(grid);

    return {
      format: 'pdf',
      html,
      filename: `${grid.title.replace(/\s+/g, '_')}_Timetable.html`,
    };
  }

  async exportTeacherPdf(schoolId: string, academicYearId: string, teacherId: string) {
    const grid = await this.getTeacherGrid(schoolId, academicYearId, teacherId);
    const html = this.renderHtml(grid);

    return {
      format: 'pdf',
      html,
      filename: `${grid.title.replace(/\s+/g, '_')}_Timetable.html`,
    };
  }

  // ── Class-level Export (all divisions in a class) ──

  async exportClassPdf(schoolId: string, academicYearId: string, classId: string) {
    const divisions = await this.getClassDivisions(schoolId, academicYearId, classId);
    const grids: TimetableGrid[] = [];
    for (const div of divisions) {
      grids.push(await this.getDivisionGrid(schoolId, academicYearId, div.id));
    }

    const html = grids.map(g => this.renderHtml(g)).join('<div style="page-break-after: always;"></div>\n');

    return {
      format: 'pdf',
      html,
      filename: `Class_Timetable_${Date.now()}.html`,
      divisionsIncluded: divisions.length,
    };
  }

  async exportClassExcel(schoolId: string, academicYearId: string, classId: string) {
    const divisions = await this.getClassDivisions(schoolId, academicYearId, classId);
    const grids: TimetableGrid[] = [];
    for (const div of divisions) {
      grids.push(await this.getDivisionGrid(schoolId, academicYearId, div.id));
    }
    return this.generateMultiSheetExcel(grids, `class_${classId}`);
  }

  // ── Multi-class Export ──

  async exportClassesPdf(schoolId: string, academicYearId: string, classIds: string[]) {
    const grids: TimetableGrid[] = [];
    for (const classId of classIds) {
      const divisions = await this.getClassDivisions(schoolId, academicYearId, classId);
      for (const div of divisions) {
        grids.push(await this.getDivisionGrid(schoolId, academicYearId, div.id));
      }
    }
    if (grids.length === 0) throw new AppError('No timetable data found for the selected classes', 404, 'NO_TIMETABLE');

    const html = grids.map(g => this.renderHtml(g)).join('<div style="page-break-after: always;"></div>\n');
    return {
      format: 'pdf',
      html,
      filename: `Classes_Timetable_${Date.now()}.html`,
      divisionsIncluded: grids.length,
    };
  }

  async exportClassesExcel(schoolId: string, academicYearId: string, classIds: string[]) {
    const grids: TimetableGrid[] = [];
    for (const classId of classIds) {
      const divisions = await this.getClassDivisions(schoolId, academicYearId, classId);
      for (const div of divisions) {
        grids.push(await this.getDivisionGrid(schoolId, academicYearId, div.id));
      }
    }
    if (grids.length === 0) throw new AppError('No timetable data found for the selected classes', 404, 'NO_TIMETABLE');
    return this.generateMultiSheetExcel(grids, `Classes_Timetable`);
  }

  // ── Multi-teacher Export ──

  async exportTeachersPdf(schoolId: string, academicYearId: string, teacherIds: string[]) {
    const teachers = await this.resolveTeachers(schoolId, academicYearId, teacherIds);
    const grids: TimetableGrid[] = [];
    for (const t of teachers) {
      try {
        grids.push(await this.getTeacherGrid(schoolId, academicYearId, t.id));
      } catch {
        // Skip teachers with no timetable data
      }
    }
    if (grids.length === 0) throw new AppError('No timetable data found for the selected teachers', 404, 'NO_TIMETABLE');

    const html = grids.map(g => this.renderHtml(g)).join('<div style="page-break-after: always;"></div>\n');

    return {
      format: 'pdf',
      html,
      filename: `Teachers_Timetable_${Date.now()}.html`,
      teachersIncluded: grids.length,
    };
  }

  async exportTeachersExcel(schoolId: string, academicYearId: string, teacherIds: string[]) {
    const teachers = await this.resolveTeachers(schoolId, academicYearId, teacherIds);
    const grids: TimetableGrid[] = [];
    for (const t of teachers) {
      try {
        grids.push(await this.getTeacherGrid(schoolId, academicYearId, t.id));
      } catch {
        // Skip teachers with no timetable data
      }
    }
    if (grids.length === 0) throw new AppError('No timetable data found for the selected teachers', 404, 'NO_TIMETABLE');
    return this.generateMultiSheetExcel(grids, `teachers`);
  }

  // ── Helpers for new exports ──

  private async getClassDivisions(schoolId: string, academicYearId: string, classId: string) {
    const cls = await prisma.class.findFirst({
      where: { id: classId, schoolId, academicYearId, deletedAt: null },
    });
    if (!cls) throw new NotFoundError('Class', classId);

    const divisions = await prisma.division.findMany({
      where: { classId, schoolId, academicYearId, deletedAt: null, timetables: { some: {} } },
      orderBy: { label: 'asc' },
    });
    if (divisions.length === 0) throw new AppError('No generated timetables found for divisions in this class', 404, 'NO_TIMETABLE');
    return divisions;
  }

  private async resolveTeachers(schoolId: string, academicYearId: string, teacherIds: string[]) {
    if (teacherIds.length === 0) {
      // Empty array = all teachers
      return prisma.teacher.findMany({
        where: { schoolId, academicYearId, deletedAt: null },
        orderBy: { name: 'asc' },
      });
    }
    return prisma.teacher.findMany({
      where: { id: { in: teacherIds }, schoolId, academicYearId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  private async generateMultiSheetExcel(grids: TimetableGrid[], prefix: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Timetable Management';
    workbook.created = new Date();

    for (const grid of grids) {
      const sheetName = grid.title.substring(0, 31);
      const sheet = workbook.addWorksheet(sheetName);
      this.writeSheet(sheet, grid);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');

    return { format: 'excel', base64, filename: `${prefix}.xlsx`, sheetsIncluded: grids.length };
  }

  /**
   * Write a single timetable grid to an Excel sheet using the UI axis layout:
   * rows = weekdays, columns = (Day, P1, break, P2, ...).
   */
  private writeSheet(sheet: ExcelJS.Worksheet, grid: TimetableGrid) {
    const totalCols = grid.slots.length + 1; // +1 for Day column

    // Page setup: landscape, fit width to one page (height can span)
    sheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };

    // Title row
    const titleRow = sheet.addRow([grid.title]);
    titleRow.font = { size: 16, bold: true };
    sheet.mergeCells(1, 1, 1, totalCols);
    titleRow.alignment = { horizontal: 'center' };

    // Subtitle row
    const subtitleRow = sheet.addRow([grid.subtitle]);
    subtitleRow.font = { size: 12, color: { argb: 'FF666666' } };
    sheet.mergeCells(2, 1, 2, totalCols);
    subtitleRow.alignment = { horizontal: 'center' };

    let currentRowIdx = 3;

    // Optional class teacher line
    if (grid.classTeacherName) {
      const ctRow = sheet.addRow([`Class Teacher: ${grid.classTeacherName}`]);
      ctRow.font = { size: 11, bold: true, color: { argb: 'FF333333' } };
      sheet.mergeCells(currentRowIdx, 1, currentRowIdx, totalCols);
      ctRow.alignment = { horizontal: 'center' };
      currentRowIdx++;
    }

    sheet.addRow([]); // spacer
    currentRowIdx++;

    // Header row: Day | P1 \n time | Break | P2 \n time | ...
    const headerCells: string[] = ['Day'];
    for (const slot of grid.slots) {
      const isBreak = slot.slotType !== SlotType.PERIOD;
      const label = isBreak
        ? (slot.slotType === SlotType.LUNCH_BREAK ? 'Lunch' : 'Break')
        : `P${slot.slotNumber ?? ''}`;
      const time = formatSlotRange(slot.startTime, slot.endTime);
      headerCells.push(`${label}\n${time}`);
    }
    const headerRow = sheet.addRow(headerCells);
    headerRow.height = 32;
    headerRow.eachCell((cell, colNumber) => {
      const slot = colNumber === 1 ? null : grid.slots[colNumber - 2];
      const isBreak = slot && slot.slotType !== SlotType.PERIOD;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isBreak ? 'FF7F8C8D' : 'FF2C3E50' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    // Column widths
    sheet.getColumn(1).width = 14;
    for (let i = 2; i <= totalCols; i++) sheet.getColumn(i).width = 18;

    // Data rows -- one per weekday. Elective cells stack their entries
    // separated by blank lines and prepend an "ELECTIVE: <name>" header.
    let dayIdx = 0;
    for (const day of grid.days) {
      const values: string[] = [day.label];
      for (const slot of grid.slots) {
        const isBreak = slot.slotType !== SlotType.PERIOD;
        if (isBreak) {
          values.push('--');
          continue;
        }
        const period = day.periods.get(slot.sortOrder);
        if (!period || period.entries.length === 0) {
          values.push('-');
          continue;
        }
        const lines: string[] = [];
        if (period.electiveGroupName) {
          lines.push(`[${period.electiveGroupName.replace(/^class\s+(?:[A-Za-z]+\s+)+?(?=[A-Za-z]+\s*\/)/i, '').toUpperCase()}]`);
        }
        // Group by subject to collapse same-subject entries
        const grouped = new Map<string, { abbr?: string; teachers: string[]; assistants: string[] }>();
        for (const e of period.entries) {
          const existing = grouped.get(e.subject);
          if (existing) {
            existing.teachers.push(e.teacher);
            if (e.assistantTeacher) existing.assistants.push(e.assistantTeacher);
          } else {
            grouped.set(e.subject, {
              abbr: e.subjectAbbr,
              teachers: [e.teacher],
              assistants: e.assistantTeacher ? [e.assistantTeacher] : [],
            });
          }
        }
        if (period.electiveGroupName && grouped.size > 1) {
          // Compact elective format: "Abbr - Teacher1, Teacher2"
          for (const [subject, g] of grouped) {
            const label = g.abbr || subject;
            const asstSuffix = g.assistants.length > 0 ? ` (Asst: ${g.assistants.join(', ')})` : '';
            lines.push(`${label} - ${g.teachers.join(', ')}${asstSuffix}`);
          }
        } else {
          for (const [subject, g] of grouped) {
            const asstSuffix = g.assistants.length > 0 ? `\nAsst: ${g.assistants.join(', ')}` : '';
            lines.push(`${subject}\n${g.teachers.join(', ')}${asstSuffix}`);
          }
        }
        values.push(lines.join('\n'));
      }
      const row = sheet.addRow(values);
      // Slightly taller row when this day has any elective cells, so the
      // stacked entries are readable.
      const hasElective = grid.slots.some((s) => {
        const p = day.periods.get(s.sortOrder);
        return p && p.entries.length > 1;
      });
      row.height = hasElective ? 60 : 36;
      row.eachCell((cell, colNumber) => {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };

        if (colNumber === 1) {
          // Day label
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } };
          cell.font = { bold: true };
          cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
          return;
        }

        const slot = grid.slots[colNumber - 2];
        const isBreak = slot && slot.slotType !== SlotType.PERIOD;
        if (isBreak) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4D6' } };
          cell.font = { italic: true, color: { argb: 'FF8A6D3B' } };
          return;
        }

        // Highlight elective cells with a soft amber tint
        const period = slot ? day.periods.get(slot.sortOrder) : undefined;
        if (period?.electiveGroupName) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        } else if (dayIdx % 2 === 1) {
          // Alternating row colour for period cells
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
        }
      });
      dayIdx++;
    }

    // Teacher stats section
    if (grid.teacherStats) {
      sheet.addRow([]); // spacer
      sheet.addRow([]); // spacer

      const statsHeaderRow = sheet.addRow(['Summary']);
      statsHeaderRow.font = { size: 13, bold: true };
      sheet.mergeCells(statsHeaderRow.number, 1, statsHeaderRow.number, 3);

      const statsColHeader = sheet.addRow(['Class', 'Periods/Week']);
      statsColHeader.eachCell((cell, colNumber) => {
        if (colNumber > 2) return;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      for (const c of grid.teacherStats.classCounts) {
        const row = sheet.addRow([c.className, c.periods]);
        row.eachCell((cell, colNumber) => {
          if (colNumber > 2) return;
          cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle' };
          cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });
      }

      const totalRow = sheet.addRow(['Total', grid.teacherStats.totalPeriodsPerWeek]);
      totalRow.eachCell((cell, colNumber) => {
        if (colNumber > 2) return;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } };
        cell.alignment = { horizontal: colNumber === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
    }
  }

  // ─��� Excel Export ──

  async exportDivisionExcel(schoolId: string, academicYearId: string, divisionId: string) {
    const grid = await this.getDivisionGrid(schoolId, academicYearId, divisionId);
    return this.generateExcel(grid, `${grid.title.replace(/\s+/g, '_')}_Timetable`);
  }

  async exportTeacherExcel(schoolId: string, academicYearId: string, teacherId: string) {
    const grid = await this.getTeacherGrid(schoolId, academicYearId, teacherId);
    return this.generateExcel(grid, `${grid.title.replace(/\s+/g, '_')}_Timetable`);
  }

  private async generateExcel(grid: TimetableGrid, prefix: string) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'School Timetable Management';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Timetable');
    this.writeSheet(sheet, grid);

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');

    return {
      format: 'excel',
      base64,
      filename: `${prefix}.xlsx`,
    };
  }
}
