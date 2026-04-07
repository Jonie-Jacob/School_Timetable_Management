import { type ReactNode } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/cn';
import type { TimetableSlotAssignment } from './timetableApi';

const SUBJECT_COLORS = [
  'bg-blue-300 dark:bg-blue-700 text-blue-950 dark:text-blue-50',
  'bg-emerald-300 dark:bg-emerald-700 text-emerald-950 dark:text-emerald-50',
  'bg-violet-300 dark:bg-violet-700 text-violet-950 dark:text-violet-50',
  'bg-orange-300 dark:bg-orange-700 text-orange-950 dark:text-orange-50',
  'bg-pink-300 dark:bg-pink-700 text-pink-950 dark:text-pink-50',
  'bg-cyan-300 dark:bg-cyan-700 text-cyan-950 dark:text-cyan-50',
  'bg-amber-300 dark:bg-amber-700 text-amber-950 dark:text-amber-50',
  'bg-rose-300 dark:bg-rose-700 text-rose-950 dark:text-rose-50',
  'bg-teal-300 dark:bg-teal-700 text-teal-950 dark:text-teal-50',
  'bg-indigo-300 dark:bg-indigo-700 text-indigo-950 dark:text-indigo-50',
  'bg-lime-300 dark:bg-lime-700 text-lime-950 dark:text-lime-50',
  'bg-fuchsia-300 dark:bg-fuchsia-700 text-fuchsia-950 dark:text-fuchsia-50',
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
      <div className="text-[9px] opacity-75 truncate">{assignment.teacher.name}</div>
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
