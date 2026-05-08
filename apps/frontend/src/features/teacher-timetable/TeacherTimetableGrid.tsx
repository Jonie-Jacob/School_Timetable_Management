import { useMemo } from 'react';
import { CalendarDays, Coffee, UtensilsCrossed, AlertTriangle } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { useGetTeacherTimetableQuery } from '@/features/timetable/timetableApi';
import type { ValidTeacherSwapTarget, InvalidTeacherSwapTarget } from '@/features/timetable/timetableApi';
import { DAY_LABELS_SHORT as DAY_LABELS } from '@/lib/days';

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

// ── DnD cell wrappers ──

function DraggableCell({ slotId, children }: { slotId: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slotId });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn('transition-opacity cursor-grab', isDragging && 'opacity-30')}>
      {children}
    </div>
  );
}

function DroppableCell({ slotId, children, validity }: { slotId: string; children: React.ReactNode; validity?: 'valid' | 'invalid' | 'valid-cross' }) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[40px] rounded-lg transition-all duration-150',
        isOver && validity === 'valid' && 'bg-emerald-400/30 ring-2 ring-emerald-500 scale-[1.03]',
        isOver && validity === 'valid-cross' && 'bg-emerald-400/30 ring-2 ring-emerald-500 scale-[1.03]',
        isOver && validity === 'invalid' && 'bg-red-400/30 ring-2 ring-red-500 scale-[0.97]',
        !isOver && validity === 'valid' && 'ring-2 ring-emerald-400 bg-emerald-400/15',
        !isOver && validity === 'valid-cross' && 'ring-2 ring-blue-400 bg-blue-400/10',
        !isOver && validity === 'invalid' && 'opacity-40',
      )}
    >
      {children}
    </div>
  );
}

// ── Cell content renderers ──

interface AssignmentData {
  id: string;
  subject: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  electiveGroup?: { id: string; name: string } | null;
  assistantTeacher?: { id: string; name: string } | null;
  role?: string;
}

function CellContent({ assignment, isElective }: { assignment: AssignmentData; isElective: boolean }) {
  const electiveName = isElective ? assignment.electiveGroup?.name : null;
  const isAssistant = assignment.role === 'assistant';
  const colorClass = isAssistant
    ? 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'
    : getSubjectColor(electiveName ?? assignment.subject.name);

  return (
    <div className={`rounded-lg px-1.5 py-1 text-center relative ${colorClass}`}>
      {isAssistant && (
        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[7px] font-bold px-1 rounded-full leading-tight">Asst</span>
      )}
      {electiveName && (
        <div className="text-[8px] uppercase tracking-wider opacity-80 truncate">{electiveName}</div>
      )}
      <div className="text-[10px] font-bold truncate">{assignment.subject.name}</div>
      <div className="text-[8px] opacity-75 truncate">{assignment.teacher?.name ?? '(Unassigned)'}</div>
      {assignment.assistantTeacher && (
        <div className="text-[7px] opacity-60 truncate italic">
          {isAssistant ? `Primary: ${assignment.assistantTeacher.name}` : `Asst: ${assignment.assistantTeacher.name}`}
        </div>
      )}
    </div>
  );
}

// ── Main grid ──

interface Props {
  teacherId: string;
  teacherName?: string;
  assignedPeriods?: number;
  isDndEnabled?: boolean;
  validTargets?: ValidTeacherSwapTarget[];
  invalidTargets?: InvalidTeacherSwapTarget[];
  activeDragSlotId?: string | null;
}

export function TeacherTimetableGrid({
  teacherId,
  teacherName,
  assignedPeriods,
  isDndEnabled = false,
  validTargets = [],
  invalidTargets = [],
  activeDragSlotId,
}: Props) {
  const { data: grid, isLoading } = useGetTeacherTimetableQuery(teacherId, { skip: !teacherId });

  const headerSlots = useMemo(() => {
    const ttSlots = [...(grid?.days?.[0]?.periods ?? [])].map((p) => p.slot).sort((a, b) => a.sortOrder - b.sortOrder);
    if (ttSlots.length === 0) return [];
    const result: typeof ttSlots = [];
    for (let i = 0; i < ttSlots.length; i++) {
      if (i > 0) {
        const gap = parseTimeToMinutes(ttSlots[i].startTime) - parseTimeToMinutes(ttSlots[i - 1].endTime);
        if (gap >= 5) {
          result.push({
            id: `break-${i}`,
            slotType: gap >= 20 ? 'LUNCH_BREAK' : 'INTERVAL',
            slotNumber: null,
            startTime: ttSlots[i - 1].endTime,
            endTime: ttSlots[i].startTime,
            sortOrder: ttSlots[i].sortOrder - 0.5,
          });
        }
      }
      result.push(ttSlots[i]);
    }
    return result;
  }, [grid]);

  const sortedDays = useMemo(
    () => [...(grid?.days ?? [])].sort((a, b) => a.workingDay.sortOrder - b.workingDay.sortOrder),
    [grid],
  );

  const gridPeriods = sortedDays.reduce(
    (sum, day) => sum + day.periods.filter((p) => p.assignments.length > 0).length,
    0,
  );
  const totalPeriods = assignedPeriods ?? gridPeriods;

  // Build validity lookup: slotId → 'valid' | 'valid-cross' | 'invalid'
  const validityMap = useMemo(() => {
    if (!activeDragSlotId) return new Map<string, 'valid' | 'valid-cross' | 'invalid'>();
    const map = new Map<string, 'valid' | 'valid-cross' | 'invalid'>();
    for (const t of validTargets) {
      map.set(t.slotId, t.isSameDivision ? 'valid' : 'valid-cross');
    }
    for (const t of invalidTargets) {
      map.set(t.slotId, 'invalid');
    }
    return map;
  }, [activeDragSlotId, validTargets, invalidTargets]);

  // Build coordinate → validity lookup for empty cells (by dayOfWeek:sortOrder)
  // Empty cells use stable composite IDs — the real UUID resolution happens in handleDragEnd.
  const emptyValidityMap = useMemo(() => {
    const map = new Map<string, 'valid' | 'valid-cross' | 'invalid'>();
    for (const t of validTargets) {
      if (t.isEmpty) {
        map.set(`${t.dayOfWeek}:${t.sortOrder}`, t.isSameDivision ? 'valid' : 'valid-cross');
      }
    }
    for (const t of invalidTargets) {
      const key = `${t.dayOfWeek}:${t.sortOrder}`;
      if (!map.has(key)) {
        map.set(key, 'invalid');
      }
    }
    return map;
  }, [validTargets, invalidTargets]);

  if (isLoading) return <Skeleton className="h-64 rounded-xl" />;

  if (!grid || sortedDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
        <CalendarDays className="size-7 text-teal-500 mb-4" />
        <h3 className="text-lg font-semibold">{teacherName ?? 'Teacher'}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          No timetable data available. Generate timetables for the divisions this teacher is assigned to.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-5 py-3">
        <span className="text-sm font-medium">{teacherName ?? 'Teacher'}</span>
        <span className="text-xs text-muted-foreground">{totalPeriods} periods/week</span>
        {isDndEnabled && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">Drag cells to swap</span>
        )}
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
                  <th
                    key={slot.id}
                    className={`h-12 px-2 text-center text-[10px] uppercase tracking-wider font-medium border-r border-white/10 ${
                      isBreak ? 'min-w-[45px] text-white/40 bg-stone-900/50' : 'min-w-[100px] text-white/90'
                    }`}
                  >
                    <div>{slot.slotType === 'PERIOD' ? `P${slot.slotNumber}` : slot.slotType === 'LUNCH_BREAK' ? 'Lunch' : 'Break'}</div>
                    <div className="text-[9px] font-normal">
                      {formatSlotTime(slot.startTime)}–{formatSlotTime(slot.endTime)}
                    </div>
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
                      <td
                        key={slot.id}
                        className="px-1 py-2 text-center border-r border-border/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(120,113,108,0.08)_4px,rgba(120,113,108,0.08)_8px)]"
                      >
                        {slot.slotType === 'LUNCH_BREAK' ? (
                          <UtensilsCrossed className="size-3 text-orange-400 mx-auto" />
                        ) : (
                          <Coffee className="size-3 text-stone-400 mx-auto" />
                        )}
                      </td>
                    );
                  }

                  const period = day.periods.find((p) => p.slot.sortOrder === slot.sortOrder);
                  const assignments = period?.assignments ?? [];
                  const isElective = period?.isElective ?? false;
                  const hasContent = assignments.length > 0;
                  const isDoubleBooked = assignments.length > 1 && !isElective;
                  const primarySlotId = period?.timetableSlotId || period?.slotIds?.[0] || '';

                  // Non-DnD mode
                  if (!isDndEnabled) {
                    if (!hasContent) {
                      return (
                        <td key={slot.id} className="px-1 py-2 text-center border-r border-border/40">
                          <span className="text-[10px] text-muted-foreground/40">--</span>
                        </td>
                      );
                    }
                    return (
                      <td key={slot.id} className="px-1 py-1 border-r border-border/40">
                        {isDoubleBooked ? (
                          <div className="space-y-0.5">
                            {assignments.map((a, i) => (
                              <div key={a.id} className={i > 0 ? 'ring-1 ring-red-500/60 rounded-lg' : ''}>
                                <CellContent assignment={a} isElective={false} />
                                {i > 0 && <AlertTriangle className="size-2.5 text-red-500 mx-auto -mt-0.5" />}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <CellContent assignment={assignments[0]} isElective={isElective} />
                        )}
                      </td>
                    );
                  }

                  // DnD mode
                  const dayOfWeek = day.workingDay.dayOfWeek;

                  if (!hasContent) {
                    // Empty cell: always render as droppable with a STABLE composite ID.
                    // The real timetable_slot UUID is resolved in handleDragEnd.
                    const emptyDropId = `empty:${dayOfWeek}:${slot.sortOrder}`;
                    const emptyValidity = emptyValidityMap.get(`${dayOfWeek}:${slot.sortOrder}`);
                    return (
                      <td key={slot.id} className="px-1 py-1 border-r border-border/40">
                        <DroppableCell slotId={emptyDropId} validity={emptyValidity}>
                          <div className="flex items-center justify-center min-h-[40px]">
                            <span className="text-[10px] text-muted-foreground/40">--</span>
                          </div>
                        </DroppableCell>
                      </td>
                    );
                  }

                  const validity = validityMap.get(primarySlotId);
                  const isDragSource = activeDragSlotId === primarySlotId;

                  if (isDoubleBooked) {
                    // Double-booked: each assignment is separately draggable
                    return (
                      <td key={slot.id} className="px-1 py-1 border-r border-border/40">
                        <div className="space-y-0.5">
                          {assignments.map((a, i) => {
                            const aSlotId = period?.slotIds?.[i] || primarySlotId;
                            const aValidity = validityMap.get(aSlotId);
                            return (
                              <DraggableCell key={a.id} slotId={aSlotId}>
                                <DroppableCell slotId={aSlotId} validity={aValidity}>
                                  <div className={i > 0 ? 'ring-1 ring-red-500/60 rounded-lg relative' : ''}>
                                    <CellContent assignment={a} isElective={false} />
                                    {i > 0 && <AlertTriangle className="size-2.5 text-red-500 absolute top-0.5 right-0.5" />}
                                  </div>
                                </DroppableCell>
                              </DraggableCell>
                            );
                          })}
                        </div>
                      </td>
                    );
                  }

                  // Regular or elective cell: draggable + droppable
                  return (
                    <td key={slot.id} className={cn('px-1 py-1 border-r border-border/40', isDragSource && 'opacity-30')}>
                      <DraggableCell slotId={primarySlotId}>
                        <DroppableCell slotId={primarySlotId} validity={validity}>
                          <CellContent assignment={assignments[0]} isElective={isElective} />
                        </DroppableCell>
                      </DraggableCell>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
