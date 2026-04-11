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

interface DayColumn {
  label: string;
  sortOrder: number;
  periods: Map<number, { subject: string; teacher: string } | null>; // keyed by slot sortOrder
}

interface TimetableGrid {
  title: string;
  subtitle: string;
  slots: SlotInfo[];
  days: DayColumn[];
}

// ── Helpers ──

function formatTime(d: Date): string {
  const hours24 = d.getUTCHours();
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

export class ExportService {

  // ── Division Timetable Data ──

  private async getDivisionGrid(schoolId: string, academicYearId: string, divisionId: string): Promise<TimetableGrid> {
    // Verify timetable exists
    const timetable = await prisma.timetable.findUnique({
      where: { schoolId_divisionId_academicYearId: { schoolId, divisionId, academicYearId } },
      include: {
        division: {
          include: { class: { select: { name: true } } },
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

    // Group by day
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
      day.periods.set(s.slot.sortOrder, s.divisionAssignment ? {
        subject: s.divisionAssignment.subject.name,
        teacher: s.divisionAssignment.teacher?.name ?? '(Unassigned)',
      } : null);
    }

    const orderedDays = Array.from(dayMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    const className = timetable.division.class.name;
    const divLabel = timetable.division.label;

    return {
      title: `${className} - ${divLabel}`,
      subtitle: `Division Timetable`,
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

    // Group by day
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
      day.periods.set(s.slot.sortOrder, {
        subject: s.divisionAssignment?.subject?.name ?? '-',
        teacher: `${className}-${divLabel}`,
      });
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

  private renderHtml(grid: TimetableGrid): string {
    const rows: string[] = [];

    for (const slot of grid.slots) {
      const isBreak = slot.slotType !== SlotType.PERIOD;
      const label = isBreak
        ? (slot.slotType === SlotType.LUNCH_BREAK ? 'Lunch Break' : 'Break')
        : `P${slot.slotNumber}`;
      const time = `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`;

      if (isBreak) {
        rows.push(`
          <tr class="break-row">
            <td class="slot-label">${label}</td>
            <td class="slot-time">${time}</td>
            <td colspan="${grid.days.length}" class="break-cell">Break</td>
          </tr>`);
      } else {
        const cells = grid.days.map(day => {
          const period = day.periods.get(slot.sortOrder);
          if (!period) return `<td class="empty-cell">-</td>`;
          // For division export: show subject + teacher
          // For teacher export: "teacher" field contains the division label
          return `<td class="period-cell">
            <div class="subject">${this.escapeHtml(period.subject)}</div>
            <div class="teacher">${this.escapeHtml(period.teacher)}</div>
          </td>`;
        }).join('');
        rows.push(`
          <tr>
            <td class="slot-label">${label}</td>
            <td class="slot-time">${time}</td>
            ${cells}
          </tr>`);
      }
    }

    const dayHeaders = grid.days.map(d => `<th>${this.escapeHtml(d.label)}</th>`).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${this.escapeHtml(grid.title)} - ${this.escapeHtml(grid.subtitle)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; }
  h1 { text-align: center; font-size: 22px; margin-bottom: 4px; }
  h2 { text-align: center; font-size: 14px; color: #555; margin-bottom: 16px; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: center; }
  th { background: #2c3e50; color: #fff; font-weight: 600; }
  .slot-label { background: #ecf0f1; font-weight: 600; width: 50px; }
  .slot-time { background: #ecf0f1; font-size: 10px; width: 90px; white-space: nowrap; }
  .period-cell { vertical-align: middle; }
  .subject { font-weight: 600; font-size: 11px; }
  .teacher { font-size: 10px; color: #555; }
  .break-row { background: #ffeaa7; }
  .break-cell { font-style: italic; color: #636e72; }
  .empty-cell { color: #b2bec3; }
  tr:nth-child(even):not(.break-row) td:not(.slot-label):not(.slot-time) { background: #f8f9fa; }
</style>
</head>
<body>
  <h1>${this.escapeHtml(grid.title)}</h1>
  <h2>${this.escapeHtml(grid.subtitle)}</h2>
  <table>
    <thead>
      <tr>
        <th>Period</th>
        <th>Time</th>
        ${dayHeaders}
      </tr>
    </thead>
    <tbody>
      ${rows.join('')}
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
      const sheetName = grid.title.substring(0, 31); // Excel sheet name max 31 chars
      const sheet = workbook.addWorksheet(sheetName);

      // Title
      const titleRow = sheet.addRow([grid.title]);
      titleRow.font = { size: 16, bold: true };
      sheet.mergeCells(1, 1, 1, grid.days.length + 2);
      titleRow.alignment = { horizontal: 'center' };

      const subtitleRow = sheet.addRow([grid.subtitle]);
      subtitleRow.font = { size: 12, color: { argb: 'FF666666' } };
      sheet.mergeCells(2, 1, 2, grid.days.length + 2);
      subtitleRow.alignment = { horizontal: 'center' };

      sheet.addRow([]);

      // Headers
      const headers = ['Period', 'Time', ...grid.days.map(d => d.label)];
      const headerRow = sheet.addRow(headers);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      sheet.getColumn(1).width = 10;
      sheet.getColumn(2).width = 16;
      for (let i = 3; i <= grid.days.length + 2; i++) sheet.getColumn(i).width = 20;

      // Data
      let rowIdx = 0;
      for (const slot of grid.slots) {
        const isBreak = slot.slotType !== SlotType.PERIOD;
        const label = isBreak ? (slot.slotType === SlotType.LUNCH_BREAK ? 'Lunch Break' : 'Break') : `P${slot.slotNumber}`;
        const time = `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`;

        if (isBreak) {
          const row = sheet.addRow([label, time, 'Break']);
          const lastRow = sheet.rowCount;
          if (grid.days.length > 1) sheet.mergeCells(lastRow, 3, lastRow, grid.days.length + 2);
          row.eachCell(cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEAA7' } };
            cell.font = { italic: true, color: { argb: 'FF636E72' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          });
        } else {
          const dayCells = grid.days.map(day => {
            const period = day.periods.get(slot.sortOrder);
            if (!period) return '-';
            return `${period.subject}\n${period.teacher}`;
          });
          const row = sheet.addRow([label, time, ...dayCells]);
          row.height = 32;
          row.eachCell((cell, colNumber) => {
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            if (rowIdx % 2 === 0 && colNumber >= 3) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
            if (colNumber <= 2) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } };
              cell.font = { bold: colNumber === 1, size: colNumber === 2 ? 9 : 11 };
            }
          });
          rowIdx++;
        }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');

    return { format: 'excel', base64, filename: `${prefix}.xlsx`, sheetsIncluded: grids.length };
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

    // ── Title row ──
    const titleRow = sheet.addRow([grid.title]);
    titleRow.font = { size: 16, bold: true };
    sheet.mergeCells(1, 1, 1, grid.days.length + 2);
    titleRow.alignment = { horizontal: 'center' };

    const subtitleRow = sheet.addRow([grid.subtitle]);
    subtitleRow.font = { size: 12, color: { argb: 'FF666666' } };
    sheet.mergeCells(2, 1, 2, grid.days.length + 2);
    subtitleRow.alignment = { horizontal: 'center' };

    sheet.addRow([]); // spacer

    // ── Header row ──
    const headers = ['Period', 'Time', ...grid.days.map(d => d.label)];
    const headerRow = sheet.addRow(headers);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' },
      };
    });

    // ── Column widths ──
    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 16;
    for (let i = 3; i <= grid.days.length + 2; i++) {
      sheet.getColumn(i).width = 20;
    }

    // ── Data rows ──
    let rowIdx = 0;
    for (const slot of grid.slots) {
      const isBreak = slot.slotType !== SlotType.PERIOD;
      const label = isBreak ? (slot.slotType === SlotType.LUNCH_BREAK ? 'Lunch Break' : 'Break') : `P${slot.slotNumber}`;
      const time = `${formatTime(slot.startTime)} - ${formatTime(slot.endTime)}`;

      if (isBreak) {
        const cells = ['Break'];
        const row = sheet.addRow([label, time, ...cells]);
        // Merge break cells across all day columns
        const lastRow = sheet.rowCount;
        if (grid.days.length > 1) {
          sheet.mergeCells(lastRow, 3, lastRow, grid.days.length + 2);
        }
        row.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEAA7' } };
          cell.font = { italic: true, color: { argb: 'FF636E72' } };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' },
          };
        });
      } else {
        const dayCells = grid.days.map(day => {
          const period = day.periods.get(slot.sortOrder);
          if (!period) return '-';
          return `${period.subject}\n${period.teacher}`;
        });
        const row = sheet.addRow([label, time, ...dayCells]);
        row.height = 32;

        row.eachCell((cell, colNumber) => {
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cell.border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' },
          };

          // Alternating row color
          if (rowIdx % 2 === 0 && colNumber >= 3) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
          }

          // Slot label + time columns
          if (colNumber <= 2) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECF0F1' } };
            cell.font = { bold: colNumber === 1, size: colNumber === 2 ? 9 : 11 };
          }
        });
        rowIdx++;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const base64 = Buffer.from(buffer as ArrayBuffer).toString('base64');

    return {
      format: 'excel',
      base64,
      filename: `${prefix}.xlsx`,
    };
  }
}
