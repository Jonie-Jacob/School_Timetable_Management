import { type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/cn';
import type { TimetableSlotAssignment } from './timetableApi';

const SUBJECT_COLORS = [
  'bg-blue-300 text-blue-950',
  'bg-emerald-300 text-emerald-950',
  'bg-violet-300 text-violet-950',
  'bg-orange-300 text-orange-950',
  'bg-pink-300 text-pink-950',
  'bg-cyan-300 text-cyan-950',
  'bg-amber-300 text-amber-950',
  'bg-rose-300 text-rose-950',
  'bg-teal-300 text-teal-950',
  'bg-indigo-300 text-indigo-950',
  'bg-lime-300 text-lime-950',
  'bg-fuchsia-300 text-fuchsia-950',
];

function getSubjectColor(name: string): string {
  const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return SUBJECT_COLORS[hash % SUBJECT_COLORS.length];
}

interface CellContentProps {
  assignment: TimetableSlotAssignment;
  isDragging?: boolean;
}

export function CellContent({ assignment, isDragging }: CellContentProps) {
  const colorClass = getSubjectColor(assignment.subject.name);
  return (
    <div
      className={cn(
        'rounded-lg px-2 py-1.5 text-center cursor-grab active:cursor-grabbing select-none transition-shadow',
        colorClass,
        isDragging && 'shadow-xl ring-2 ring-amber-500 scale-105 opacity-90',
      )}
    >
      <div className="text-[11px] font-bold truncate">{assignment.subject.name}</div>
      <div className="text-[9px] opacity-75 truncate">{assignment.teacher?.name ?? '(Unassigned)'}</div>
      {assignment.assistantTeacher && (
        <div className="text-[8px] opacity-60 truncate">Asst: {assignment.assistantTeacher.name}</div>
      )}
    </div>
  );
}

interface ElectiveCellContentProps {
  assignments: TimetableSlotAssignment[];
}

/**
 * Strip the "Class XX " prefix from an elective group name for in-cell display.
 * Elective groups are named like "Class IX Mal / Hin" — but inside a Class IX-A
 * cell that prefix is redundant noise. Backend keeps the full name; we strip
 * only at the render edge.
 */
function stripClassPrefix(name: string): string {
  return name.replace(/^Class\s+[IVX]+\s+/i, '');
}

/**
 * Stacked rendering for an elective-group cell.
 *
 * Shows the elective group name (with "Class XX " prefix stripped) as the
 * header and lists every member assignment underneath as "Subject — Teacher"
 * rows. Drag-drop is disabled because the override endpoint won't accept
 * elective rows; click is wired by the parent to open a read-only info sheet
 * that links to /elective-groups for actual editing.
 */
export function ElectiveCellContent({ assignments }: ElectiveCellContentProps) {
  const fullName = assignments.find((a) => a.electiveGroup)?.electiveGroup?.name ?? 'Elective';
  const displayName = stripClassPrefix(fullName);
  // Color the cell by the elective group name so all the elective's slots
  // share the same color across the week.
  const colorClass = getSubjectColor(fullName);

  return (
    <div
      className={cn(
        'rounded-lg px-1.5 py-1 select-none ring-1 ring-amber-500/40 cursor-pointer hover:ring-amber-500/70 hover:shadow-sm transition-all',
        colorClass,
      )}
      title={`${fullName} — click for details`}
    >
      <div className="text-[9px] font-bold uppercase tracking-wider opacity-90 truncate">
        {displayName}
      </div>
      <div className="mt-0.5 space-y-0.5">
        {assignments.map((a) => (
          <div key={a.id} className="text-[9px] leading-tight truncate">
            <span className="font-semibold">{a.subject.name}</span>
            <span className="opacity-70"> — {a.teacher?.name ?? '(Unassigned)'}</span>
            {a.assistantTeacher && <span className="opacity-50"> (Asst: {a.assistantTeacher.name})</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DraggableCellProps {
  slotId: string;
  children: ReactNode;
}

export function DraggableCell({ slotId, children }: DraggableCellProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: slotId });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn('transition-opacity', isDragging && 'opacity-30')}
    >
      {children}
    </div>
  );
}

interface DroppableCellProps {
  slotId: string;
  children: ReactNode;
  /** During drag: 'valid' = safe swap, 'invalid' = conflict, undefined = not dragging */
  swapValidity?: 'valid' | 'invalid';
}

export function DroppableCell({ slotId, children, swapValidity }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[40px] rounded-lg transition-all duration-150',
        isOver && swapValidity === 'valid' && 'bg-emerald-400/30 ring-2 ring-emerald-500 scale-[1.03]',
        isOver && swapValidity === 'invalid' && 'bg-red-400/30 ring-2 ring-red-500 scale-[0.97]',
        isOver && !swapValidity && 'bg-amber-500/20 ring-2 ring-amber-500/40 ring-dashed',
        !isOver && swapValidity === 'valid' && 'ring-2 ring-emerald-400 bg-emerald-400/15 shadow-[0_0_8px_rgba(52,211,153,0.3)]',
        !isOver && swapValidity === 'invalid' && 'opacity-40',
      )}
    >
      {children}
    </div>
  );
}
