import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SlotRow } from './SlotRow';
import { SlotCard } from './SlotCard';
import type { EditorSlot } from './types';

interface DaySlotListProps {
  slots: EditorSlot[];
  onChange: (slots: EditorSlot[]) => void;
}

/** Recalculate period numbers: only PERIOD-type slots get sequential numbers. */
function recalcPeriodNumbers(slots: EditorSlot[]): EditorSlot[] {
  let periodNum = 0;
  return slots.map((s) => ({
    ...s,
    periodNumber: s.type === 'PERIOD' ? ++periodNum : null,
  }));
}

export function DaySlotList({ slots, onChange }: DaySlotListProps) {
  const { t } = useTranslation('period-structures');
  const isMobile = useMediaQuery('(max-width: 767px)');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = slots.findIndex((s) => s.id === active.id);
      const newIndex = slots.findIndex((s) => s.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      onChange(recalcPeriodNumbers(arrayMove(slots, oldIndex, newIndex)));
    },
    [slots, onChange],
  );

  const handleUpdate = useCallback(
    (id: string, updates: Partial<EditorSlot>) => {
      const updated = slots.map((s) => (s.id === id ? { ...s, ...updates } : s));
      onChange(recalcPeriodNumbers(updated));
    },
    [slots, onChange],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onChange(recalcPeriodNumbers(slots.filter((s) => s.id !== id)));
    },
    [slots, onChange],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={slots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {isMobile ? (
          <div className="space-y-2">
            {slots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-2 py-2 w-8" />
                  <th className="px-2 py-2 w-10 text-center">{t('editor.slot.number')}</th>
                  <th className="px-2 py-2 text-left">{t('editor.slot.type')}</th>
                  <th className="px-2 py-2 text-left">{t('editor.slot.startTime')}</th>
                  <th className="px-2 py-2 text-left">{t('editor.slot.endTime')}</th>
                  <th className="px-2 py-2 text-center">{t('editor.slot.duration')}</th>
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SortableContext>
    </DndContext>
  );
}
