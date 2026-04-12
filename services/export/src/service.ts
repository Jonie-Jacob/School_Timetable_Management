import {
  prisma, AppError, NotFoundError,
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
  teacher: string;
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

interface TimetableGrid {
  title: string;
  subtitle: string;
  classTeacherName?: string | null;
  slots: SlotInfo[];
  days: DayColumn[];
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
            subject: { select: { name: true } },
            teacher: { select: { name: true } },
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
    // sections — we accumulate them into one CellContent with multiple
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
        teacher: da.teacher?.name ?? '(Unassigned)',
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
        divisionAssignment: { teacherId },
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
          include: { subject: { select: { name: true } } },
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

    // Group by day. The query is filtered to this teacher only, so each
    // (day, slot) cell holds at most one entry — but we still use the
    // CellContent shape for consistency with the division grid renderer.
    const dayMap = new Map<string, DayColumn>();
    for (const s of timetableSlots) {
      const dayKey = s.workingDayId;
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
      const cell = day.periods.get(s.slot.sortOrder) ?? { entries: [] };
      cell.entries.push({
        subject: s.divisionAssignment?.subject?.name ?? '-',
        teacher: `${className}-${divLabel}`,
      });
      day.periods.set(s.slot.sortOrder, cell);
    }

    const orderedDays = Array.from(dayMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      title: teacher.name,
      subtitle: `Teacher Timetable`,
      slots: orderedSlots,
      days: orderedDays,
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
          return `<td class="break-cell">—</td>`;
        }
        const period = day.periods.get(slot.sortOrder);
        if (!period || period.entries.length === 0) {
          return `<td class="empty-cell">-</td>`;
        }
        const isElective = !!period.electiveGroupName;
        const header = isElective
          ? `<div class="elective-header">${this.escapeHtml(period.electiveGroupName!)}</div>`
          : '';
        const stacked = period.entries.map((e) => `
          <div class="entry">
            <div class="subject">${this.escapeHtml(e.subject)}</div>
            <div class="teacher">${this.escapeHtml(e.teacher)}</div>
          </div>
        `).join('');
        const cls = isElective ? 'period-cell elective-cell' : 'period-cell';
        return `<td class="${cls}">${header}${stacked}</td>`;
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
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 14px; color: #555; margin-bottom: 6px; font-weight: normal; }
  .class-teacher { text-align: center; font-size: 12px; color: #333; margin-bottom: 14px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #333; padding: 5px 4px; text-align: center; vertical-align: middle; word-wrap: break-word; overflow-wrap: anywhere; }
  th { background: #2c3e50; color: #fff; font-weight: 600; }
  .slot-header { padding: 4px 3px; }
  .slot-header .slot-name { font-size: 11px; }
  .slot-header .slot-time { font-size: 8px; font-weight: normal; color: #cfd8dc; white-space: nowrap; margin-top: 2px; }
  .slot-header.break-col { background: #7f8c8d; min-width: 42px; }
  .day-label { background: #ecf0f1; font-weight: 700; width: 80px; text-align: left; padding-left: 8px; white-space: nowrap; }
  .period-cell { vertical-align: middle; }
  .subject { font-weight: 600; font-size: 11px; }
  .teacher { font-size: 10px; color: #555; }
  .elective-cell { background: #fffbeb; }
  .elective-cell .elective-header { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #b45309; font-weight: 700; padding-bottom: 2px; border-bottom: 1px dashed #f59e0b; margin-bottom: 2px; }
  .elective-cell .entry { padding: 2px 0; border-top: 1px dotted #fcd34d; }
  .elective-cell .entry:first-of-type { border-top: none; }
  .break-cell { background: #fff4d6; color: #8a6d3b; font-style: italic; }
  .empty-cell { color: #b2bec3; }
  tr:nth-child(even) td:not(.day-label):not(.break-cell) { background: #f8f9fa; }
</style>
</head>
<body>
  <h1>${this.escapeHtml(grid.title)}</h1>
  <h2>${this.escapeHtml(grid.subtitle)}</h2>
  ${classTeacherLine}
  <table>
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

  // ── PDF Export (HTML file for local dev — Chromium in production) ──

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

    // Data rows — one per weekday. Elective cells stack their entries
    // separated by blank lines and prepend an "ELECTIVE: <name>" header.
    let dayIdx = 0;
    for (const day of grid.days) {
      const values: string[] = [day.label];
      for (const slot of grid.slots) {
        const isBreak = slot.slotType !== SlotType.PERIOD;
        if (isBreak) {
          values.push('—');
          continue;
        }
        const period = day.periods.get(slot.sortOrder);
        if (!period || period.entries.length === 0) {
          values.push('-');
          continue;
        }
        const lines: string[] = [];
        if (period.electiveGroupName) {
          lines.push(`[${period.electiveGroupName.toUpperCase()}]`);
        }
        for (const e of period.entries) {
          lines.push(`${e.subject}\n${e.teacher}`);
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
