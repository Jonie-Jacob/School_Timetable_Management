import { useGetTeacherBreakdownQuery, useGetTeachersLoadQuery } from '@/features/teachers/teacherApi';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Layers } from 'lucide-react';

interface Props {
  teacherId: string;
}

/**
 * Shows a per-class assignment breakdown for a teacher with two period counts:
 * - "Assigned" — from division_assignments (available before generation)
 * - "Timetable" — from generated timetable slots (computed on backend)
 */
export function TeacherBreakdown({ teacherId }: Props) {
  const { data: breakdown, isLoading } = useGetTeacherBreakdownQuery(teacherId, { skip: !teacherId });
  const { data: teacherLoads } = useGetTeachersLoadQuery();

  const teacherLoad = teacherLoads?.find((l) => l.id === teacherId);

  if (isLoading) return null;
  if (!breakdown || breakdown.length === 0) return null;

  const totalAssigned = teacherLoad?.assignedPeriods ?? breakdown.reduce((sum, r) => sum + r.weightage, 0);
  // Use distinct time slots from the load API — this correctly detects double-bookings.
  // If assigned=27 but timetable=26, one time slot has two assignments (conflict).
  const totalTimetable = teacherLoad?.timetablePeriods ?? null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
      <div className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/90">
          <BookOpen className="size-4" />
          <span className="text-sm font-semibold">Assignment Breakdown</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-white/70">
            Assigned: <span className="font-semibold text-white">{totalAssigned}</span>
          </span>
          {totalTimetable != null && (
            <span className="text-[11px] text-white/70">
              Timetable:{' '}
              <span className={`font-semibold ${totalTimetable !== totalAssigned ? 'text-red-400' : 'text-white'}`}>
                {totalTimetable}
              </span>
            </span>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30 bg-muted/30">
            <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-2.5 text-muted-foreground">Class / Division</th>
            <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-2.5 text-muted-foreground">Subject</th>
            <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-2.5 text-muted-foreground">Elective Group</th>
            <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-2.5 text-muted-foreground w-20">Role</th>
            <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-2.5 text-muted-foreground w-24">Assigned</th>
            <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-2.5 text-muted-foreground w-24">Timetable</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((row, idx) => {
            const mismatch = row.timetablePeriods != null && row.timetablePeriods !== row.weightage;
            const isOrphan = row.weightage === 0 && row.timetablePeriods != null && row.timetablePeriods > 0;
            return (
              <tr
                key={idx}
                className={`border-t border-border/20 ${idx % 2 === 1 ? 'bg-muted/10' : ''} ${mismatch ? 'bg-red-50 dark:bg-red-950/20' : ''}`}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    {row.isCrossDiv && (
                      <Layers className="size-3 text-amber-500 flex-shrink-0" />
                    )}
                    <span className="text-xs">{row.divisionLabel}</span>
                    {isOrphan && (
                      <span className="text-[8px] text-red-500 font-semibold">(deleted assignment)</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-xs">{row.subject}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {row.electiveGroup ?? '—'}
                </td>
                <td className="px-4 py-2 text-center">
                  {row.role === 'assistant' ? (
                    <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-700">
                      Asst
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Primary</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center">
                  <span className="text-xs font-medium">{row.weightage || '—'}</span>
                </td>
                <td className="px-4 py-2 text-center">
                  {row.timetablePeriods != null ? (
                    <Badge
                      variant={mismatch ? 'destructive' : 'outline'}
                      className="text-[10px]"
                    >
                      {row.timetablePeriods}
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
