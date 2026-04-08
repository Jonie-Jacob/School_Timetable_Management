import { useState, useMemo } from 'react';
import { Eye, CalendarDays, Coffee, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader } from '@/components/shared';
import { ExportButton } from '@/components/shared/ExportButton';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetTeachersQuery } from '@/features/teachers/teacherApi';
import { useGetTeacherTimetableQuery } from '@/features/timetable/timetableApi';
import {
  useExportTeacherPdfMutation, useExportTeacherExcelMutation,
  downloadHtmlAsPdf, downloadExcel,
} from '@/features/export/exportApi';

const DAY_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

const SUBJECT_COLORS = [
  'bg-blue-300 text-blue-950',
  'bg-emerald-300 text-emerald-950',
  'bg-violet-300 text-violet-950',
  'bg-orange-300 text-orange-950',
  'bg-pink-300 text-pink-950',
  'bg-cyan-300 text-cyan-950',
  'bg-amber-300 text-amber-950',
  'bg-rose-300 text-rose-950',
];

function getSubjectColor(name: string): string {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

function formatSlotTime(time: string): string {
  const match = time.match(/(\d{2}:\d{2})/);
  return match ? match[1] : time.slice(0, 5);
}

function parseTimeToMinutes(time: string): number {
  const match = time.match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

export function Component() {
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('');

  const { data: teachersData, isLoading: teachersLoading } = useGetTeachersQuery({ pageSize: 200 });
  const { data: grid, isLoading: gridLoading } = useGetTeacherTimetableQuery(selectedTeacherId, { skip: !selectedTeacherId });
  const [exportPdf] = useExportTeacherPdfMutation();
  const [exportExcel] = useExportTeacherExcelMutation();

  const teachers = teachersData?.data ?? [];
  const selectedTeacher = teachers.find((t) => t.id === selectedTeacherId);

  // Build slot headers with breaks
  const headerSlots = useMemo(() => {
    const ttSlots = [...(grid?.days?.[0]?.periods ?? [])].map((p) => p.slot).sort((a, b) => a.sortOrder - b.sortOrder);
    if (ttSlots.length === 0) return [];
    const result: typeof ttSlots = [];
    for (let i = 0; i < ttSlots.length; i++) {
      if (i > 0) {
        const gap = parseTimeToMinutes(ttSlots[i].startTime) - parseTimeToMinutes(ttSlots[i - 1].endTime);
        if (gap >= 5) {
          result.push({
            id: `break-${i}`, slotType: gap >= 20 ? 'LUNCH_BREAK' : 'INTERVAL',
            slotNumber: null, startTime: ttSlots[i - 1].endTime, endTime: ttSlots[i].startTime, sortOrder: ttSlots[i].sortOrder - 0.5,
          });
        }
      }
      result.push(ttSlots[i]);
    }
    return result;
  }, [grid]);

  const sortedDays = useMemo(() =>
    [...(grid?.days ?? [])].sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder),
  [grid]);

  const totalPeriods = sortedDays.reduce((sum, day) => sum + day.periods.filter((p) => p.assignment).length, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Timetable"
        description="View weekly timetable for a selected teacher."
        actions={
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">Select Teacher</Label>
            <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="Choose teacher..." />
              </SelectTrigger>
              <SelectContent>
                {teachers.map((teacher) => (
                  <SelectItem key={teacher.id} value={teacher.id} className="text-sm">{teacher.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTeacherId && grid && (
              <ExportButton
                onExportPdf={async () => {
                  try {
                    const result = await exportPdf({ teacherId: selectedTeacherId }).unwrap();
                    downloadHtmlAsPdf(result.html, result.filename);
                    toast.success('Export ready — use browser print dialog to save as PDF');
                  } catch { toast.error('Export failed'); }
                }}
                onExportExcel={async () => {
                  try {
                    const result = await exportExcel({ teacherId: selectedTeacherId }).unwrap();
                    downloadExcel(result.base64, result.filename);
                    toast.success('Excel downloaded');
                  } catch { toast.error('Export failed'); }
                }}
              />
            )}
          </div>
        }
      />

      {teachersLoading && <Skeleton className="h-64 rounded-xl" />}

      {!teachersLoading && !selectedTeacherId && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 mb-4">
            <Eye className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">Select a teacher</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">Choose a teacher from the dropdown above to view their weekly timetable.</p>
        </div>
      )}

      {selectedTeacherId && gridLoading && <Skeleton className="h-64 rounded-xl" />}

      {selectedTeacherId && !gridLoading && (!grid || sortedDays.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <CalendarDays className="size-7 text-teal-500 mb-4" />
          <h3 className="text-lg font-semibold">{selectedTeacher?.name ?? 'Teacher'}</h3>
          <p className="mt-2 text-sm text-muted-foreground">No timetable data available. Generate timetables for the divisions this teacher is assigned to.</p>
        </div>
      )}

      {selectedTeacherId && !gridLoading && sortedDays.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-5 py-3">
            <span className="text-sm font-medium">{selectedTeacher?.name}</span>
            <span className="text-xs text-muted-foreground">{totalPeriods} periods/week</span>
          </div>

          {/* Grid */}
          <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-x-auto shadow-sm">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800">
                  <th className="h-12 px-3 text-left text-xs uppercase tracking-wider font-medium text-white/90 min-w-[70px] border-r border-white/10 sticky left-0 bg-stone-800 z-10">Day</th>
                  {headerSlots.map((slot) => {
                    const isBreak = slot.slotType !== 'PERIOD';
                    return (
                      <th key={slot.id} className={`h-12 px-2 text-center text-[10px] uppercase tracking-wider font-medium border-r border-white/10 ${isBreak ? 'min-w-[45px] text-white/40 bg-stone-900/50' : 'min-w-[100px] text-white/90'}`}>
                        <div>{slot.slotType === 'PERIOD' ? `P${slot.slotNumber}` : slot.slotType === 'LUNCH_BREAK' ? 'Lunch' : 'Break'}</div>
                        <div className="text-[9px] font-normal">{formatSlotTime(slot.startTime)}–{formatSlotTime(slot.endTime)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedDays.map((day) => (
                  <tr key={day.workingDay.id} className="border-b border-border/40 hover:bg-amber-500/5 transition-colors">
                    <td className="px-3 py-2 font-medium text-xs bg-muted/30 border-r border-border/40 sticky left-0 z-10">
                      {DAY_LABELS[day.workingDay.dayOfWeek] ?? day.workingDay.label}
                    </td>
                    {headerSlots.map((slot) => {
                      if (slot.slotType !== 'PERIOD') {
                        return (
                          <td key={slot.id} className="px-1 py-2 text-center border-r border-border/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(120,113,108,0.08)_4px,rgba(120,113,108,0.08)_8px)]">
                            {slot.slotType === 'LUNCH_BREAK' ? <UtensilsCrossed className="size-3 text-orange-400 mx-auto" /> : <Coffee className="size-3 text-stone-400 mx-auto" />}
                          </td>
                        );
                      }
                      const period = day.periods.find((p) => p.slot.sortOrder === slot.sortOrder);
                      const assignment = period?.assignment;
                      if (!assignment) {
                        return <td key={slot.id} className="px-1 py-2 text-center border-r border-border/40"><span className="text-[10px] text-muted-foreground/40">—</span></td>;
                      }
                      const colorClass = getSubjectColor(assignment.subject.name);
                      return (
                        <td key={slot.id} className="px-1 py-1 border-r border-border/40">
                          <div className={`rounded-lg px-1.5 py-1 text-center ${colorClass}`}>
                            <div className="text-[10px] font-bold truncate">{assignment.subject.name}</div>
                            <div className="text-[8px] opacity-75 truncate">{assignment.teacher.name}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
