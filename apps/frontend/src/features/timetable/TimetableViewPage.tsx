import { useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Coffee, UtensilsCrossed, AlertTriangle, Trash2, Check, X as XIcon, Loader2, ExternalLink } from 'lucide-react';
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
import {
  Sheet, SheetContent,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useGetClassQuery } from '@/features/classes/classApi';
import { useGetPeriodStructureQuery } from '@/features/period-structures/configApi';
import {
  useGetAssignmentsQuery,
  useUpdateAssignmentMutation,
} from '@/features/assignments/assignmentApi';
import { useGetElectiveGroupsQuery } from '@/features/elective-groups/electiveGroupApi';
import {
  useGetTeachersLoadQuery,
  useGetTeacherSlotConflictsQuery,
} from '@/features/teachers/teacherApi';
import {
  useGetDivisionTimetableQuery,
  useOverrideSlotMutation,
  useLazyGetValidSwapTargetsQuery,
  useSwapSlotsMutation,
  useCreateEmptySlotMutation,
  useAutoResolveConflictMutation,
  usePreviewElectiveSwapMutation,
  useSwapElectiveSlotsMutation,
  type TimetablePeriod,
  type TimetableSlotAssignment,
  type SwapConflict,
  type PreviewElectiveSwapResponse,
} from './timetableApi';
import { DraggableCell, DroppableCell, CellContent, ElectiveCellContent } from './TimetableCells';
import { ElectiveSwapConfirmDialog } from './ElectiveSwapConfirmDialog';

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
  const { data: divisionAssignments } = useGetAssignmentsQuery(divisionId!, { skip: !divisionId });
  const { data: teacherLoads } = useGetTeachersLoadQuery();
  const { data: electiveGroups } = useGetElectiveGroupsQuery();
  const [overrideSlot] = useOverrideSlotMutation();
  const [swapSlots, { isLoading: isSwapping }] = useSwapSlotsMutation();
  const [swapElectiveSlots, { isLoading: isElectiveSwapping }] = useSwapElectiveSlotsMutation();
  const [previewElectiveSwap] = usePreviewElectiveSwapMutation();
  const [autoResolve] = useAutoResolveConflictMutation();
  const [createEmptySlot] = useCreateEmptySlotMutation();
  const [updateAssignment] = useUpdateAssignmentMutation();

  // Conflict dialog state for drag-and-drop swaps
  const [swapConflictDialog, setSwapConflictDialog] = useState<{
    sourceSlotId: string;
    targetSlotId: string;
    conflicts: SwapConflict[];
  } | null>(null);
  // Track which slot IDs are involved in an in-flight swap for loading indicators
  const [swappingSlotIds, setSwappingSlotIds] = useState<Set<string>>(new Set());
  // Post-swap result dialog -- shows after a forced swap with conflicts
  const [swapResultDialog, setSwapResultDialog] = useState<{
    conflicts: SwapConflict[];
    resolving: Set<string>; // conflictedSlotIds currently being auto-resolved
  } | null>(null);

  // Elective swap confirmation dialog state
  const [electiveSwapDialog, setElectiveSwapDialog] = useState<{
    preview: PreviewElectiveSwapResponse;
    sourceSlotId: string;
    targetDayOfWeek: number;
    targetSlotSortOrder: number;
  } | null>(null);

  // Read-only info sheet for elective cells.
  // Click opens info view; drag-and-drop is the primary way to move
  // elective cells. The override endpoint still refuses elective rows
  // since single-cell assignment changes don't apply to elective blocks.
  const [electiveInfoGroupId, setElectiveInfoGroupId] = useState<string | null>(null);

  // Click-to-edit sheet state
  const [editSlot, setEditSlot] = useState<{
    timetableSlotId: string;
    workingDayId: string;
    slotId: string;
    dayLabel: string;
    periodNumber: number | null;
    startTime: string;
    endTime: string;
    currentAssignmentId: string | null;
    currentSubjectName: string | null;
    currentTeacherName: string | null;
  } | null>(null);
  const [sheetSelectedTeacherId, setSheetSelectedTeacherId] = useState<string>('');
  const [sheetSelectedAssistantId, setSheetSelectedAssistantId] = useState<string>('');
  const [sheetSubjectId, setSheetSubjectId] = useState<string>('');
  // Filter / sort controls for the teacher picker.
  // teacherPool -- which teachers are eligible for the picker:
  //   'relevant' = qualified for the subject (default)
  //   'all'      = every teacher in the school
  // hideConflicts -- independent toggle, applied AFTER the pool filter, that
  // removes any teacher already booked in the same (day, slot) elsewhere.
  // Combinations: Relevant + No conflicts, All + No conflicts, etc.
  const [teacherPool, setTeacherPool] = useState<'relevant' | 'all'>('relevant');
  const [hideConflicts, setHideConflicts] = useState(false);
  const [teacherSort, setTeacherSort] = useState<'name' | 'load-asc' | 'load-desc'>('name');
  const [savingOverride, setSavingOverride] = useState(false);

  // Fetch conflicts for the currently-open slot
  const { data: slotConflicts } = useGetTeacherSlotConflictsQuery(
    editSlot
      ? { workingDayId: editSlot.workingDayId, slotId: editSlot.slotId, excludeDivisionId: divisionId }
      : { workingDayId: '', slotId: '' },
    { skip: !editSlot },
  );

  const division = classItem?.divisions?.find((d) => d.id === divisionId);
  const periodStructureId = division?.periodStructureId;
  const { data: periodStructure } = useGetPeriodStructureQuery(periodStructureId!, { skip: !periodStructureId });

  const [activeDrag, setActiveDrag] = useState<{
    slotId: string;
    assignment: TimetableSlotAssignment;
    isElective: boolean;
    electiveAssignments?: TimetableSlotAssignment[];
  } | null>(null);
  const [fetchValidSwaps] = useLazyGetValidSwapTargetsQuery();
  const [swapTargets, setSwapTargets] = useState<{ valid: Set<string>; invalid: Set<string> } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const divisionLabel = division
    ? `${classItem?.name ?? ''} -- Division ${division.label}${division.streamName ? ` (${division.streamName})` : ''}`
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

  const executeSwap = useCallback(async (sourceSlotId: string, targetSlotId: string, force = false) => {
    setSwappingSlotIds(new Set([sourceSlotId, targetSlotId]));
    try {
      const result = await swapSlots({ sourceSlotId, targetSlotId, force }).unwrap();
      if (force && result.conflicts?.length > 0) {
        // Show post-swap result dialog with conflict details
        setSwapResultDialog({ conflicts: result.conflicts, resolving: new Set() });
        toast.success('Slot swapped -- conflicts created.');
      } else {
        toast.success('Slot swapped.');
      }
    } catch (err: unknown) {
      // Check if it's a 409 TEACHER_CONFLICT with conflicts array
      const error = err as { status?: number; data?: { error?: { code?: string; message?: string } } };
      if (error?.status === 409 && error?.data?.error?.code === 'TEACHER_CONFLICT') {
        try {
          const parsed = JSON.parse(error.data!.error!.message!);
          if (parsed.conflicts) {
            setSwapConflictDialog({ sourceSlotId, targetSlotId, conflicts: parsed.conflicts });
            return; // Don't clear swapping IDs yet -- dialog is open
          }
        } catch { /* fall through to generic error */ }
      }
      const msg = error?.data?.error?.message ?? 'Swap failed.';
      toast.error(msg);
    } finally {
      setSwappingSlotIds(new Set());
    }
  }, [swapSlots]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const wasElective = activeDrag?.isElective ?? false;
    setActiveDrag(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sourceSlotId = active.id as string;
    const targetSlotId = over.id as string;

    const allPeriods = grid?.days?.flatMap((d) => d.periods) ?? [];
    const sourcePeriod = allPeriods.find((p) => p.timetableSlotId === sourceSlotId);
    const targetPeriod = allPeriods.find((p) => p.timetableSlotId === targetSlotId);

    const eitherIsElective = wasElective || sourcePeriod?.isElective || targetPeriod?.isElective;

    if (eitherIsElective) {
      // For elective swaps: call preview to show confirmation dialog
      const electivePeriod = (sourcePeriod?.isElective ? sourcePeriod : targetPeriod)!;
      const otherPeriod = electivePeriod === sourcePeriod ? targetPeriod : sourcePeriod;
      const targetDay = grid!.days.find((d) =>
        d.periods.some((p) => p.timetableSlotId === (sourcePeriod?.isElective ? targetSlotId : sourceSlotId)),
      );
      if (!targetDay) return;

      const electiveSlotId = electivePeriod.timetableSlotId;
      const tgtDayOfWeek = targetDay.workingDay.dayOfWeek;
      const tgtSortOrder = otherPeriod?.slot.sortOrder ?? electivePeriod.slot.sortOrder;

      try {
        const preview = await previewElectiveSwap({
          sourceSlotId: electiveSlotId,
          targetDayOfWeek: tgtDayOfWeek,
          targetSlotSortOrder: tgtSortOrder,
        }).unwrap();

        // Show dialog if cross-division or has conflicts
        if (preview.affectedDivisions.length > 1 || preview.conflicts.length > 0) {
          setElectiveSwapDialog({
            preview,
            sourceSlotId: electiveSlotId,
            targetDayOfWeek: tgtDayOfWeek,
            targetSlotSortOrder: tgtSortOrder,
          });
          return;
        }

        // Per-division, no conflicts -- swap directly
        setSwappingSlotIds(new Set([sourceSlotId, targetSlotId]));
        await swapElectiveSlots({
          sourceSlotId: electiveSlotId,
          targetDayOfWeek: tgtDayOfWeek,
          targetSlotSortOrder: tgtSortOrder,
        }).unwrap();
        toast.success('Elective swapped.');
        setSwappingSlotIds(new Set());
      } catch (err: unknown) {
        const error = err as { data?: { error?: { message?: string } } };
        toast.error(error?.data?.error?.message ?? 'Elective swap failed.');
        setSwappingSlotIds(new Set());
      }
    } else {
      // Regular (non-elective) swap
      await executeSwap(sourceSlotId, targetSlotId);
    }
  }, [grid, activeDrag, executeSwap, previewElectiveSwap, swapElectiveSlots]);

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
          actions={<Button variant="outline" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="size-3.5" />Back</Button>}
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
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="size-3.5" />Back</Button>
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
        const a = p?.assignments[0];
        if (!a) return;

        setActiveDrag({
          slotId: p!.timetableSlotId,
          assignment: a,
          isElective: !!p!.isElective,
          electiveAssignments: p!.isElective ? p!.assignments : undefined,
        });

        // Fetch valid swap targets -- backend handles elective vs regular routing
        fetchValidSwaps(p!.timetableSlotId).unwrap().then((result) => {
          // Backend may return coordinate-based results for electives or
          // slot-ID-based results for regular. Handle both formats.
          if ('validSlotIds' in result) {
            setSwapTargets({
              valid: new Set(result.validSlotIds),
              invalid: new Set(result.invalidSlotIds),
            });
          } else {
            // Coordinate-based results from elective targets -- map to slot IDs in current grid
            const coordResult = result as { validCoordinates: { dayOfWeek: number; slotSortOrder: number }[]; invalidCoordinates: { dayOfWeek: number; slotSortOrder: number }[] };
            const valid = new Set<string>();
            const invalid = new Set<string>();
            for (const coord of coordResult.validCoordinates) {
              const day = grid.days.find((d) => d.workingDay.dayOfWeek === coord.dayOfWeek);
              const period = day?.periods.find((pp) => pp.slot.sortOrder === coord.slotSortOrder);
              if (period) valid.add(period.timetableSlotId);
            }
            for (const coord of coordResult.invalidCoordinates) {
              const day = grid.days.find((d) => d.workingDay.dayOfWeek === coord.dayOfWeek);
              const period = day?.periods.find((pp) => pp.slot.sortOrder === coord.slotSortOrder);
              if (period) invalid.add(period.timetableSlotId);
            }
            setSwapTargets({ valid, invalid });
          }
        }).catch(() => setSwapTargets(null));
      }} onDragEnd={(e) => { setSwapTargets(null); handleDragEnd(e); }} onDragCancel={() => { setActiveDrag(null); setSwapTargets(null); }}>
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
                    if (!period) {
                      // No timetable_slot row for this (day, slot) -- new period
                      // added after generation. Click creates the row then opens editor.
                      const handleNewSlotClick = async () => {
                        if (!grid?.timetable?.id) return;
                        try {
                          const result = await createEmptySlot({
                            timetableId: grid.timetable.id,
                            workingDayId: day.workingDay.id,
                            slotId: slot.id,
                          }).unwrap();
                          setEditSlot({
                            timetableSlotId: result.timetableSlotId,
                            workingDayId: day.workingDay.id,
                            slotId: slot.id,
                            dayLabel: DAY_LABELS[day.workingDay.dayOfWeek] ?? day.workingDay.label,
                            periodNumber: slot.slotNumber,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            currentAssignmentId: null,
                            currentSubjectName: null,
                            currentTeacherName: null,
                          });
                          setSheetSubjectId('');
                          setSheetSelectedTeacherId('');
                          setTeacherPool('relevant');
                          setHideConflicts(false);
                          setTeacherSort('name');
                        } catch {
                          toast.error('Failed to create slot.');
                        }
                      };
                      return (
                        <td key={slot.id} className="px-1 py-2 text-center border-r border-border/40 cursor-pointer hover:bg-muted/30 transition-colors" onClick={handleNewSlotClick}>
                          <div className="h-10 flex items-center justify-center">
                            <span className="text-xs text-muted-foreground/40">--</span>
                          </div>
                        </td>
                      );
                    }

                    const firstAssignment = period.assignments[0];

                    // Elective cells: render the stacked elective view with drag-drop.
                    // Click opens the read-only info sheet.
                    if (period.isElective) {
                      const electiveGroupId = period.assignments.find((a) => a.electiveGroup)?.electiveGroup?.id;
                      const sid = period.timetableSlotId;
                      const isSource = activeDrag?.slotId === sid;
                      const validity = !isSource && swapTargets
                        ? swapTargets.valid.has(sid) ? 'valid' as const
                          : swapTargets.invalid.has(sid) ? 'invalid' as const
                          : undefined
                        : undefined;
                      const isCellSwapping = swappingSlotIds.has(sid);

                      return (
                        <td key={slot.id} className="px-1 py-1 border-r border-border/40 relative">
                          {isCellSwapping && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg">
                              <Loader2 className="size-5 animate-spin text-amber-500" />
                            </div>
                          )}
                          {isDesktop ? (
                            <DraggableCell slotId={sid}>
                              <DroppableCell slotId={sid} swapValidity={validity}>
                                <div onClick={(ev) => { ev.stopPropagation(); if (electiveGroupId) setElectiveInfoGroupId(electiveGroupId); }}>
                                  <ElectiveCellContent assignments={period.assignments} />
                                </div>
                              </DroppableCell>
                            </DraggableCell>
                          ) : (
                            <DroppableCell slotId={sid} swapValidity={validity}>
                              <div onClick={() => { if (electiveGroupId) setElectiveInfoGroupId(electiveGroupId); }}>
                                <ElectiveCellContent assignments={period.assignments} />
                              </div>
                            </DroppableCell>
                          )}
                        </td>
                      );
                    }

                    const openEditor = () => {
                      if (period.isElective) return;
                      // Look up the underlying assignment to capture subjectId
                      const fullAssignment = (divisionAssignments ?? []).find(
                        (a) => a.id === firstAssignment?.id,
                      );
                      setEditSlot({
                        timetableSlotId: period.timetableSlotId,
                        workingDayId: day.workingDay.id,
                        slotId: slot.id,
                        dayLabel: DAY_LABELS[day.workingDay.dayOfWeek] ?? day.workingDay.label,
                        periodNumber: slot.slotNumber,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        currentAssignmentId: firstAssignment?.id ?? null,
                        currentSubjectName: firstAssignment?.subject.name ?? null,
                        currentTeacherName: firstAssignment?.teacher?.name ?? null,
                      });
                      setSheetSubjectId(fullAssignment?.subjectId ?? firstAssignment?.subject.id ?? '');
                      setSheetSelectedTeacherId(fullAssignment?.teacherId ?? '');
                      setSheetSelectedAssistantId(fullAssignment?.assistantTeacherId ?? '');
                      setTeacherPool('relevant');
                      setHideConflicts(false);
                      setTeacherSort('name');
                    };

                    const isCellSwapping = swappingSlotIds.has(period.timetableSlotId);

                    return (
                      <td key={slot.id} className="px-1 py-1 border-r border-border/40 relative" onClick={openEditor} style={{ cursor: 'pointer' }}>
                        {isCellSwapping && (
                          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[2px] rounded-lg">
                            <Loader2 className="size-5 animate-spin text-amber-500" />
                          </div>
                        )}
                        {(() => {
                          const sid = period.timetableSlotId;
                          const isSource = activeDrag?.slotId === sid;
                          const validity = !isSource && swapTargets
                            ? swapTargets.valid.has(sid) ? 'valid' as const
                              : swapTargets.invalid.has(sid) ? 'invalid' as const
                              : undefined
                            : undefined;

                          if (isDesktop && firstAssignment) return (
                            <DraggableCell slotId={sid}>
                              <DroppableCell slotId={sid} swapValidity={validity}>
                                <CellContent assignment={firstAssignment} />
                              </DroppableCell>
                            </DraggableCell>
                          );
                          if (firstAssignment) return (
                            <DroppableCell slotId={sid} swapValidity={validity}>
                              <CellContent assignment={firstAssignment} />
                            </DroppableCell>
                          );
                          return (
                            <DroppableCell slotId={sid} swapValidity={validity}>
                              <div className="h-10 flex items-center justify-center">
                                <span className="text-xs text-muted-foreground/40">--</span>
                              </div>
                            </DroppableCell>
                          );
                        })()}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <DragOverlay>
          {activeDrag && (
            activeDrag.isElective && activeDrag.electiveAssignments
              ? <ElectiveCellContent assignments={activeDrag.electiveAssignments} isDragging />
              : <CellContent assignment={activeDrag.assignment} isDragging />
          )}
        </DragOverlay>
      </DndContext>

      {/* Click-to-edit cell sheet -- glassmorphism design matching the rest of the app */}
      <Sheet open={!!editSlot} onOpenChange={(open) => { if (!open) setEditSlot(null); }}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-md p-0 bg-background border-l border-amber-500/20 shadow-2xl"
        >
          {editSlot && (
            <div className="flex h-full flex-col">
              {/* Dark gradient header -- matches table header styling */}
              <div className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 px-5 py-4 text-white relative">
                <button
                  type="button"
                  onClick={() => setEditSlot(null)}
                  className="absolute top-3 right-3 size-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <XIcon className="size-3.5" />
                </button>
                <div className="text-[10px] uppercase tracking-widest text-amber-300/80 font-semibold">Edit Cell</div>
                <div className="mt-1 text-lg font-bold">{editSlot.dayLabel}</div>
                <div className="mt-0.5 text-xs text-white/70">
                  {editSlot.periodNumber != null && <>P{editSlot.periodNumber} · </>}
                  {formatSlotTime(editSlot.startTime)} – {formatSlotTime(editSlot.endTime)}
                </div>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {/* Current state */}
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Currently</div>
                  {editSlot.currentSubjectName ? (
                    <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-3">
                      <div className="text-sm font-semibold">{editSlot.currentSubjectName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {editSlot.currentTeacherName ?? <span className="italic">(Unassigned)</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground italic text-center">
                      Empty slot
                    </div>
                  )}
                </div>

                {/* Subject filter pills -- every subject taught in this division */}
                {(() => {
                  const assignments = divisionAssignments ?? [];
                  const uniqueSubjects = Array.from(
                    new Map(assignments.map((a) => [a.subject.id, a.subject])).values(),
                  );
                  return (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Subject</div>
                      <div className="flex flex-wrap gap-1.5">
                        {uniqueSubjects.map((s) => {
                          const active = sheetSubjectId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => { setSheetSubjectId(s.id); setSheetSelectedTeacherId(''); setSheetSelectedAssistantId(''); }}
                              className={cn(
                                'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                                active
                                  ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                                  : 'bg-card border-border/60 text-foreground/80 hover:border-amber-500/40 hover:bg-amber-500/5',
                              )}
                            >
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Teacher options for selected subject -- with filter + sort */}
                {sheetSubjectId && (() => {
                  const allTeachers = teacherLoads ?? [];
                  const conflictIds = new Set((slotConflicts ?? []).map((c) => c.teacherId));

                  // Step 1 -- pool filter (Relevant vs All)
                  let visibleTeachers =
                    teacherPool === 'all'
                      ? allTeachers
                      : allTeachers.filter((t) => t.qualifiedSubjectIds.includes(sheetSubjectId));

                  // Step 2 -- conflict filter (independent toggle)
                  if (hideConflicts) {
                    visibleTeachers = visibleTeachers.filter((t) => !conflictIds.has(t.id));
                  }

                  // Step 3 -- sort
                  visibleTeachers = [...visibleTeachers].sort((a, b) => {
                    if (teacherSort === 'name') {
                      return a.name.localeCompare(b.name);
                    }
                    if (teacherSort === 'load-asc') {
                      return a.assignedPeriods - b.assignedPeriods || a.name.localeCompare(b.name);
                    }
                    return b.assignedPeriods - a.assignedPeriods || a.name.localeCompare(b.name);
                  });

                  // How many of the currently visible teachers have a conflict
                  const visibleConflictCount = visibleTeachers.filter((t) => conflictIds.has(t.id)).length;

                  // Identify which teachers already have an existing assignment
                  // for this (subject, division) -- used for the badge.
                  const subjectAssignments = (divisionAssignments ?? []).filter(
                    (a) => a.subjectId === sheetSubjectId,
                  );
                  const teacherIdsWithAssignment = new Set(
                    subjectAssignments.map((a) => a.teacherId).filter(Boolean) as string[],
                  );

                  // Assistant teacher dropdown options: all teachers except the selected primary
                  const assistantOptions = allTeachers
                    .filter((t) => t.id !== sheetSelectedTeacherId)
                    .sort((a, b) => a.name.localeCompare(b.name));

                  return (
                    <div className="space-y-4">
                      {/* Primary Teacher */}
                      <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                            Primary Teacher · {visibleTeachers.length}
                            {visibleConflictCount > 0 && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                                <AlertTriangle className="size-2.5" />
                                {visibleConflictCount} conflict{visibleConflictCount === 1 ? '' : 's'}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Filter + sort controls */}
                        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/30">
                          {/* Pool toggle: Relevant / All */}
                          <div className="flex items-center gap-1">
                            {(['relevant', 'all'] as const).map((p) => {
                              const active = teacherPool === p;
                              return (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setTeacherPool(p)}
                                  className={cn(
                                    'px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all capitalize',
                                    active
                                      ? 'bg-amber-500 border-amber-500 text-white'
                                      : 'bg-card border-border/60 text-foreground/70 hover:border-amber-500/40',
                                  )}
                                >
                                  {p}
                                </button>
                              );
                            })}
                          </div>
                          {/* Independent: Hide-conflicts toggle */}
                          <button
                            type="button"
                            onClick={() => setHideConflicts((v) => !v)}
                            className={cn(
                              'px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all',
                              hideConflicts
                                ? 'bg-amber-500 border-amber-500 text-white'
                                : 'bg-card border-border/60 text-foreground/70 hover:border-amber-500/40',
                            )}
                            title="Hide teachers already booked in this slot in another division"
                          >
                            Hide conflicts
                          </button>
                          <div className="flex-1" />
                          <select
                            value={teacherSort}
                            onChange={(e) => setTeacherSort(e.target.value as typeof teacherSort)}
                            className="text-[10px] rounded-md border border-border/60 bg-card px-1.5 py-0.5 text-foreground/80 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
                          >
                            <option value="name">Sort: Name</option>
                            <option value="load-asc">Sort: Load ↑</option>
                            <option value="load-desc">Sort: Load ↓</option>
                          </select>
                        </div>

                        <div className="p-2">
                          {visibleTeachers.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-border/40 p-3 text-xs text-muted-foreground italic text-center">
                              No teachers match the current filter.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-[32vh] overflow-y-auto pr-1 rounded-lg bg-muted/30 p-1.5 border border-border/30">
                              {visibleTeachers.map((tch) => {
                                const assigned = tch.assignedPeriods;
                                const conflict = slotConflicts?.find((c) => c.teacherId === tch.id);
                                const selected = sheetSelectedTeacherId === tch.id;
                                const isQualified = tch.qualifiedSubjectIds.includes(sheetSubjectId);
                                const hasExisting = teacherIdsWithAssignment.has(tch.id);
                                return (
                                  <button
                                    key={tch.id}
                                    type="button"
                                    onClick={() => {
                                      setSheetSelectedTeacherId(tch.id);
                                      // Clear assistant if it matches the new primary
                                      if (sheetSelectedAssistantId === tch.id) setSheetSelectedAssistantId('');
                                    }}
                                    className={cn(
                                      'w-full text-left rounded-lg border p-3 transition-all flex items-start gap-3',
                                      selected
                                        ? 'border-amber-500/60 bg-amber-500/10 shadow-sm'
                                        : 'border-border/60 bg-card hover:border-amber-500/30 hover:bg-amber-500/5',
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        'mt-0.5 size-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                                        selected ? 'border-amber-500 bg-amber-500' : 'border-border',
                                      )}
                                    >
                                      {selected && <Check className="size-2.5 text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium">{tch.name}</div>
                                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1.5 py-0 h-4"
                                        >
                                          {assigned} periods/wk
                                        </Badge>
                                        {hasExisting && (
                                          <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                                            Already teaches this
                                          </Badge>
                                        )}
                                        {!isQualified && (
                                          <Badge variant="warning" className="text-[9px] px-1.5 py-0 h-4">
                                            Unqualified
                                          </Badge>
                                        )}
                                        {conflict && (
                                          <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                                            <AlertTriangle className="size-2.5" />
                                            Conflict: {conflict.className}-{conflict.divisionLabel}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Assistant Teacher */}
                      <div className="rounded-xl border border-border/50 bg-card/40 backdrop-blur-sm overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/40">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                            Assistant Teacher (optional)
                          </div>
                          {sheetSelectedAssistantId && (
                            <button
                              type="button"
                              onClick={() => setSheetSelectedAssistantId('')}
                              className="text-[10px] text-destructive/80 hover:text-destructive font-medium"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="p-2">
                          <div className="space-y-1 max-h-[20vh] overflow-y-auto pr-1 rounded-lg bg-muted/30 p-1.5 border border-border/30">
                            {assistantOptions.map((tch) => {
                              const conflict = slotConflicts?.find((c) => c.teacherId === tch.id);
                              const selected = sheetSelectedAssistantId === tch.id;
                              return (
                                <button
                                  key={tch.id}
                                  type="button"
                                  onClick={() => setSheetSelectedAssistantId(selected ? '' : tch.id)}
                                  className={cn(
                                    'w-full text-left rounded-lg border px-3 py-2 transition-all flex items-center gap-2',
                                    selected
                                      ? 'border-blue-500/60 bg-blue-500/10 shadow-sm'
                                      : 'border-border/60 bg-card hover:border-blue-500/30 hover:bg-blue-500/5',
                                  )}
                                >
                                  <div
                                    className={cn(
                                      'size-3.5 rounded-full border-2 shrink-0 flex items-center justify-center',
                                      selected ? 'border-blue-500 bg-blue-500' : 'border-border',
                                    )}
                                  >
                                    {selected && <Check className="size-2 text-white" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium truncate">{tch.name}</div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                                      {tch.assignedPeriods} p/wk
                                    </Badge>
                                    {conflict && (
                                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0 h-4 gap-0.5">
                                        <AlertTriangle className="size-2.5" />
                                        {conflict.className}-{conflict.divisionLabel}
                                      </Badge>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Dark gradient footer: Clear / Cancel / Save */}
              <div className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 px-5 py-3.5 flex items-center gap-2">
                {editSlot.currentAssignmentId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-400 border-red-400/40 hover:bg-red-500/20 hover:text-red-300 gap-1.5"
                    disabled={savingOverride}
                    onClick={async () => {
                      if (!editSlot) return;
                      setSavingOverride(true);
                      try {
                        await overrideSlot({ slotId: editSlot.timetableSlotId, divisionAssignmentId: null }).unwrap();
                        toast.success('Cell cleared.');
                        setEditSlot(null);
                      } catch (err: any) {
                        toast.error(err?.data?.error?.message ?? 'Failed to clear cell.');
                      } finally {
                        setSavingOverride(false);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Clear
                  </Button>
                )}
                <div className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-white/80 border-white/20 hover:bg-white/10 hover:text-white"
                  onClick={() => setEditSlot(null)}
                  disabled={savingOverride}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white"
                  disabled={
                    savingOverride ||
                    !sheetSubjectId ||
                    !sheetSelectedTeacherId
                  }
                  onClick={async () => {
                    if (!editSlot) return;
                    setSavingOverride(true);
                    try {
                      const subjectAssignments = (divisionAssignments ?? []).filter(
                        (a) => a.subjectId === sheetSubjectId,
                      );

                      // Path 1: there's already an assignment for this exact (subject, teacher) pair
                      const exactMatch = subjectAssignments.find((a) => a.teacherId === sheetSelectedTeacherId);
                      let targetAssignmentId: string;

                      if (exactMatch) {
                        targetAssignmentId = exactMatch.id;
                      } else if (subjectAssignments.length === 1) {
                        // Path 2: exactly one assignment for this subject -- update its teacher
                        const a = subjectAssignments[0];
                        await updateAssignment({
                          id: a.id,
                          teacherId: sheetSelectedTeacherId,
                          assistantTeacherId: sheetSelectedAssistantId || null,
                        }).unwrap();
                        targetAssignmentId = a.id;
                      } else if (subjectAssignments.length === 0) {
                        toast.error('No assignment exists for this subject in this division. Add it from the Assignments page first.');
                        setSavingOverride(false);
                        return;
                      } else {
                        toast.error('Multiple assignments exist for this subject. Use the Assignments page to manage which teacher is used.');
                        setSavingOverride(false);
                        return;
                      }

                      // Update assistant teacher on the assignment if changed
                      if (exactMatch) {
                        const currentAssistant = exactMatch.assistantTeacherId ?? '';
                        const newAssistant = sheetSelectedAssistantId || null;
                        if (currentAssistant !== (newAssistant ?? '')) {
                          await updateAssignment({
                            id: targetAssignmentId,
                            assistantTeacherId: newAssistant,
                          }).unwrap();
                        }
                      }

                      await overrideSlot({
                        slotId: editSlot.timetableSlotId,
                        divisionAssignmentId: targetAssignmentId,
                      }).unwrap();
                      toast.success('Cell updated.');
                      setEditSlot(null);
                    } catch (err: any) {
                      toast.error(err?.data?.error?.message ?? 'Failed to update cell.');
                    } finally {
                      setSavingOverride(false);
                    }
                  }}
                >
                  {savingOverride ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Read-only info sheet for elective cells */}
      <Sheet
        open={!!electiveInfoGroupId}
        onOpenChange={(open) => { if (!open) setElectiveInfoGroupId(null); }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-md p-0 bg-background border-l border-amber-500/20 shadow-2xl"
        >
          {electiveInfoGroupId && (() => {
            const group = (electiveGroups ?? []).find((g) => g.id === electiveInfoGroupId);
            if (!group) return null;
            // Gather this division's assignments for this elective group so
            // we can show actual teacher names (the group's global subjects
            // list doesn't carry teachers).
            const assignmentsForGroup = (divisionAssignments ?? []).filter(
              (a) => a.electiveGroupId === electiveInfoGroupId,
            );
            // Group by subjectId → teachers[]
            const subjectBuckets = new Map<string, { subjectName: string; teacherNames: string[] }>();
            for (const a of assignmentsForGroup) {
              const key = a.subjectId;
              const existing = subjectBuckets.get(key) ?? { subjectName: a.subject.name, teacherNames: [] };
              existing.teacherNames.push(a.teacher?.name ?? '(Unassigned)');
              subjectBuckets.set(key, existing);
            }
            return (
              <div className="flex h-full flex-col">
                {/* Dark gradient header */}
                <div className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 px-5 py-4 text-white relative">
                  <button
                    type="button"
                    onClick={() => setElectiveInfoGroupId(null)}
                    className="absolute top-3 right-3 size-7 rounded-md bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                    aria-label="Close"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                  <div className="text-[10px] uppercase tracking-widest text-amber-300/80 font-semibold">
                    Elective Group
                  </div>
                  <div className="mt-1 text-lg font-bold">{group.name}</div>
                  <div className="mt-0.5 text-xs text-white/70">
                    {group.periodsPerWeek} period{group.periodsPerWeek === 1 ? '' : 's'}/week
                  </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                      Subjects &amp; Teachers
                    </div>
                    <div className="space-y-2">
                      {Array.from(subjectBuckets.values()).map((bucket) => (
                        <div
                          key={bucket.subjectName}
                          className="rounded-xl border border-border/40 bg-card px-4 py-3"
                        >
                          <div className="text-sm font-semibold">{bucket.subjectName}</div>
                          <div className="mt-1 space-y-0.5">
                            {bucket.teacherNames.map((name, i) => (
                              <div key={`${name}-${i}`} className="text-xs text-muted-foreground">
                                · {name}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {subjectBuckets.size === 0 && (
                        <div className="rounded-lg border border-dashed border-border/40 p-3 text-xs text-muted-foreground italic text-center">
                          No assignments found for this elective in this division.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" />
                      Why can't I edit here?
                    </div>
                    <p className="opacity-90">
                      Elective groups are scheduled as a single block with all parallel teachers sharing the slot. To change which subjects or teachers run during this elective, edit the group on the Elective Groups page and regenerate the timetable.
                    </p>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border/40 bg-card/40 backdrop-blur-sm px-5 py-4 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setElectiveInfoGroupId(null)}
                  >
                    Close
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setElectiveInfoGroupId(null);
                      navigate('/elective-groups');
                    }}
                  >
                    Manage in Elective Groups
                  </Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Conflict confirmation dialog for drag-and-drop swaps ── */}
      <Dialog
        open={!!swapConflictDialog}
        onOpenChange={(v) => {
          if (!v) {
            setSwapConflictDialog(null);
            setSwappingSlotIds(new Set());
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Teacher Conflict Detected
            </DialogTitle>
            <DialogDescription>
              Swapping these periods will create a scheduling conflict in another division.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {swapConflictDialog?.conflicts.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
              >
                <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold">{c.teacherName}</span> is already teaching{' '}
                  <span className="font-semibold">{c.className} {c.divisionLabel}</span> at this time slot.
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSwapConflictDialog(null);
                setSwappingSlotIds(new Set());
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={isSwapping}
              onClick={async () => {
                if (!swapConflictDialog) return;
                const { sourceSlotId, targetSlotId } = swapConflictDialog;
                setSwapConflictDialog(null);
                await executeSwap(sourceSlotId, targetSlotId, true);
              }}
            >
              Swap Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Elective swap confirmation dialog ── */}
      <ElectiveSwapConfirmDialog
        open={!!electiveSwapDialog}
        preview={electiveSwapDialog?.preview ?? null}
        isSwapping={isElectiveSwapping}
        onCancel={() => {
          setElectiveSwapDialog(null);
          setSwappingSlotIds(new Set());
        }}
        onConfirm={async (force) => {
          if (!electiveSwapDialog) return;
          const { sourceSlotId, targetDayOfWeek, targetSlotSortOrder } = electiveSwapDialog;
          setElectiveSwapDialog(null);
          setSwappingSlotIds(new Set([sourceSlotId]));
          try {
            const result = await swapElectiveSlots({
              sourceSlotId,
              targetDayOfWeek,
              targetSlotSortOrder,
              force,
            }).unwrap();
            if (force && result.conflicts?.length > 0) {
              toast.success(`Elective swapped -- ${result.conflicts.length} conflict(s) created.`);
            } else {
              toast.success(`Elective swapped across ${result.divisionsAffected} division(s).`);
            }
          } catch (err: unknown) {
            const error = err as { data?: { error?: { message?: string } } };
            toast.error(error?.data?.error?.message ?? 'Elective swap failed.');
          } finally {
            setSwappingSlotIds(new Set());
          }
        }}
      />

      {/* ── Post-swap result dialog -- shows conflicts with auto-resolve ── */}
      <Dialog
        open={!!swapResultDialog}
        onOpenChange={(v) => { if (!v) setSwapResultDialog(null); }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Swap Completed -- {swapResultDialog?.conflicts.length} Conflict{(swapResultDialog?.conflicts.length ?? 0) !== 1 ? 's' : ''} Created
            </DialogTitle>
            <DialogDescription>
              The following teacher conflicts were created in other divisions. You can auto-resolve them or fix manually.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {swapResultDialog?.conflicts.map((c, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
              >
                <div className="text-sm min-w-0">
                  <span className="font-semibold">{c.teacherName}</span>
                  <span className="text-muted-foreground"> → </span>
                  <span className="font-semibold">{c.className} Div {c.divisionLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="xs"
                    variant="outline"
                    className="text-[11px]"
                    loading={swapResultDialog.resolving.has(c.conflictedSlotId)}
                    onClick={async () => {
                      setSwapResultDialog((prev) => prev ? {
                        ...prev,
                        resolving: new Set([...prev.resolving, c.conflictedSlotId]),
                      } : null);
                      try {
                        const res = await autoResolve({ conflictedSlotId: c.conflictedSlotId }).unwrap();
                        toast.success(res.message);
                        // Remove resolved conflict from the dialog
                        setSwapResultDialog((prev) => {
                          if (!prev) return null;
                          const remaining = prev.conflicts.filter((_, idx) => idx !== i);
                          if (remaining.length === 0) return null;
                          const newResolving = new Set(prev.resolving);
                          newResolving.delete(c.conflictedSlotId);
                          return { conflicts: remaining, resolving: newResolving };
                        });
                      } catch (err: unknown) {
                        const error = err as { data?: { error?: { message?: string } } };
                        toast.error(error?.data?.error?.message ?? 'Auto-resolve failed');
                        setSwapResultDialog((prev) => prev ? {
                          ...prev,
                          resolving: new Set([...prev.resolving].filter((id) => id !== c.conflictedSlotId)),
                        } : null);
                      }
                    }}
                  >
                    Auto-Resolve
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-[11px]"
                    onClick={() => {
                      window.open(`/classes/${c.classId}/divisions/${c.divisionId}/timetable`, '_blank');
                    }}
                  >
                    <ExternalLink className="size-3 mr-1" />
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSwapResultDialog(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
