import { useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Coffee, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useGetClassQuery } from '@/features/classes/classApi';
import { useGetPeriodStructureQuery } from '@/features/period-structures/configApi';
import {
  useGetDivisionTimetableQuery,
  useOverrideSlotMutation,
  type TimetablePeriod,
  type TimetableSlotAssignment,
} from './timetableApi';
import { DraggableCell, DroppableCell, CellContent } from './TimetableCells';

import { DAY_LABELS_FULL as DAY_LABELS } from '@/lib/days';

function parseTimeToMinutes(time: string): number {
  const match = time.match(/(\d{2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
}

function formatSlotTime(time: string): string {
  const match = time.match(/(\d{2}:\d{2})/);
  return match ? match[1] : time.slice(0, 5);
}

interface MergedSlot {
  id: string;
  slotType: string;
  slotNumber: number | null;
  startTime: string;
  endTime: string;
  sortOrder: number;
}

export function Component() {
  const { t } = useTranslation('timetable');
  const { classId, divisionId } = useParams<{ classId: string; divisionId: string }>();
  const navigate = useNavigate();
  const isDesktop = useBreakpoint('lg');

  const { data: classItem } = useGetClassQuery(classId!, { skip: !classId });
  const { data: grid, isLoading } = useGetDivisionTimetableQuery(divisionId!, { skip: !divisionId, refetchOnMountOrArgChange: true });
  const [overrideSlot] = useOverrideSlotMutation();

  const division = classItem?.divisions?.find((d) => d.id === divisionId);
  const periodStructureId = division?.periodStructureId;
  const { data: periodStructure } = useGetPeriodStructureQuery(periodStructureId!, { skip: !periodStructureId });

  const [activeDrag, setActiveDrag] = useState<{ slotId: string; assignment: TimetableSlotAssignment } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const divisionLabel = division
    ? `${classItem?.name ?? ''} — Division ${division.label}${division.streamName ? ` (${division.streamName})` : ''}`
    : '';

  // Build complete slot sequence from period structure or detect gaps
  const allSlots: MergedSlot[] = useMemo(() => {
    if (periodStructure?.workingDays?.[0]?.slots) {
      return [...periodStructure.workingDays[0].slots]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ id: s.id, slotType: s.slotType, slotNumber: s.slotNumber, startTime: s.startTime, endTime: s.endTime, sortOrder: s.sortOrder }));
    }
    return [];
  }, [periodStructure]);

  const headerSlots: MergedSlot[] = useMemo(() => {
    if (allSlots.length > 0) return allSlots;
    const ttSlots = [...(grid?.days?.[0]?.periods ?? [])].map((p) => p.slot).sort((a, b) => a.sortOrder - b.sortOrder);
    if (ttSlots.length === 0) return [];
    const result: MergedSlot[] = [];
    for (let i = 0; i < ttSlots.length; i++) {
      if (i > 0) {
        const prevMinutes = parseTimeToMinutes(ttSlots[i - 1].endTime);
        const currMinutes = parseTimeToMinutes(ttSlots[i].startTime);
        if (currMinutes - prevMinutes >= 5) {
          result.push({
            id: `break-${i}`, slotType: currMinutes - prevMinutes >= 20 ? 'LUNCH_BREAK' : 'INTERVAL',
            slotNumber: null, startTime: ttSlots[i - 1].endTime, endTime: ttSlots[i].startTime, sortOrder: ttSlots[i].sortOrder - 0.5,
          });
        }
      }
      result.push(ttSlots[i]);
    }
    return result;
  }, [allSlots, grid]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sourceSlotId = active.id as string;
    const targetSlotId = over.id as string;

    // Find assignments for source and target
    const allPeriods = grid?.days?.flatMap((d) => d.periods) ?? [];
    const sourcePeriod = allPeriods.find((p) => p.timetableSlotId === sourceSlotId);
    const targetPeriod = allPeriods.find((p) => p.timetableSlotId === targetSlotId);

    if (!sourcePeriod?.assignment) return;

    try {
      // Swap: put source's assignment in target, target's in source
      await overrideSlot({ slotId: targetSlotId, divisionAssignmentId: sourcePeriod.assignment.id }).unwrap();
      if (targetPeriod?.assignment) {
        await overrideSlot({ slotId: sourceSlotId, divisionAssignmentId: targetPeriod.assignment.id }).unwrap();
      } else {
        await overrideSlot({ slotId: sourceSlotId, divisionAssignmentId: null }).unwrap();
      }
      toast.success('Slot swapped.');
    } catch {
      toast.error('Swap failed — possible conflict.');
    }
  }, [grid, overrideSlot]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!grid || !grid.days?.length) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('editor.title')} description={divisionLabel}
          actions={<Button variant="outline" size="sm" onClick={() => navigate(`/classes/${classId}`)}><ArrowLeft className="size-3.5" />Back</Button>}
        />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <CalendarDays className="size-7 text-teal-500 mb-4" />
          <h3 className="text-lg font-semibold">No timetable generated</h3>
          <p className="mt-1 text-sm text-muted-foreground">Generate a timetable first.</p>
          <Button className="mt-4" onClick={() => navigate(`/classes/${classId}/divisions/${divisionId}/generate`)}>Generate</Button>
        </div>
      </div>
    );
  }

  const sortedDays = [...grid.days].sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder);

  function getPeriodForSlot(dayPeriods: TimetablePeriod[], sortOrder: number): TimetablePeriod | undefined {
    return dayPeriods.find((p) => p.slot.sortOrder === sortOrder);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('editor.title')} description={divisionLabel}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={grid.timetable.status === 'GENERATED' ? 'success' : 'warning'}>{grid.timetable.status}</Badge>
            <Button variant="outline" size="sm" onClick={() => navigate(`/classes/${classId}`)}><ArrowLeft className="size-3.5" />Back</Button>
          </div>
        }
      />

      {!isDesktop && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-2 text-sm text-amber-700">
          <AlertTriangle className="size-4 shrink-0" />
          {t('editor.mobileHint')}
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={(e) => {
        const allP = grid.days.flatMap((d) => d.periods);
        const p = allP.find((pp) => pp.timetableSlotId === e.active.id);
        if (p?.assignment) setActiveDrag({ slotId: p.timetableSlotId, assignment: p.assignment });
      }} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-x-auto shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800">
                <th className="h-12 px-3 text-left text-xs uppercase tracking-wider font-medium text-white/90 min-w-[80px] border-r border-white/10 sticky left-0 bg-stone-800 z-10">Day</th>
                {headerSlots.map((slot) => {
                  const isBreak = slot.slotType !== 'PERIOD';
                  return (
                    <th key={slot.id} className={`h-12 px-2 text-center text-[10px] uppercase tracking-wider font-medium border-r border-white/10 ${isBreak ? 'min-w-[50px] text-white/40 bg-stone-900/50' : 'min-w-[110px] text-white/90'}`}>
                      <div>{slot.slotType === 'PERIOD' ? `P${slot.slotNumber}` : slot.slotType === 'LUNCH_BREAK' ? 'Lunch' : 'Break'}</div>
                      <div className="text-[9px] font-normal">{formatSlotTime(slot.startTime)}–{formatSlotTime(slot.endTime)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedDays.map((day) => (
                <tr key={day.workingDay.id} className="border-b border-border/40">
                  <td className="px-3 py-2 font-medium text-sm bg-muted/30 border-r border-border/40 sticky left-0 z-10">
                    {DAY_LABELS[day.workingDay.dayOfWeek] ?? day.workingDay.label}
                  </td>
                  {headerSlots.map((slot) => {
                    if (slot.slotType !== 'PERIOD') {
                      return (
                        <td key={slot.id} className="px-1 py-2 text-center border-r border-border/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(120,113,108,0.08)_4px,rgba(120,113,108,0.08)_8px)]">
                          {slot.slotType === 'LUNCH_BREAK' ? <UtensilsCrossed className="size-3.5 text-orange-400 mx-auto" /> : <Coffee className="size-3.5 text-stone-400 mx-auto" />}
                        </td>
                      );
                    }
                    const period = getPeriodForSlot(day.periods, slot.sortOrder);
                    if (!period) return <td key={slot.id} className="px-1 py-2 text-center border-r border-border/40"><span className="text-xs text-muted-foreground/40">—</span></td>;

                    return (
                      <td key={slot.id} className="px-1 py-1 border-r border-border/40">
                        {isDesktop && period.assignment ? (
                          <DraggableCell slotId={period.timetableSlotId}>
                            <DroppableCell slotId={period.timetableSlotId}>
                              <CellContent assignment={period.assignment} />
                            </DroppableCell>
                          </DraggableCell>
                        ) : period.assignment ? (
                          <DroppableCell slotId={period.timetableSlotId}>
                            <CellContent assignment={period.assignment} />
                          </DroppableCell>
                        ) : (
                          <DroppableCell slotId={period.timetableSlotId}>
                            <div className="h-10 flex items-center justify-center">
                              <span className="text-xs text-muted-foreground/40">—</span>
                            </div>
                          </DroppableCell>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DragOverlay>
          {activeDrag && <CellContent assignment={activeDrag.assignment} isDragging />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
