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
}

export function DroppableCell({ slotId, children }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({ id: slotId });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[40px] rounded-lg transition-colors',
        isOver && 'bg-amber-500/20 ring-2 ring-amber-500/40 ring-dashed',
      )}
    >
      {children}
    </div>
  );
}
