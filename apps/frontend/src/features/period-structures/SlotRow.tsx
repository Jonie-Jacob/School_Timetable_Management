import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TimePicker } from '@/components/shared';
import type { EditorSlot } from './types';

interface SlotRowProps {
  slot: EditorSlot;
  onUpdate: (id: string, updates: Partial<EditorSlot>) => void;
  onDelete: (id: string) => void;
}

function calcDuration(start: string, end: string): string {
  if (!start || !end) return '—';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? `${diff}m` : '—';
}

export function SlotRow({ slot, onUpdate, onDelete }: SlotRowProps) {
  const { t } = useTranslation('period-structures');
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slot.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const periodNumber = slot.type === 'PERIOD' ? slot.periodNumber : '—';

  return (
    <tr ref={setNodeRef} style={style} className="border-b last:border-b-0">
      <td className="px-2 py-2 w-8">
        <button
          type="button"
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </td>
      <td className="px-2 py-2 w-10 text-center text-sm font-medium">
        {periodNumber}
      </td>
      <td className="px-2 py-2 w-32">
        <Select
          value={slot.type}
          onValueChange={(val) =>
            onUpdate(slot.id, { type: val as EditorSlot['type'] })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PERIOD">{t('editor.slot.period')}</SelectItem>
            <SelectItem value="INTERVAL">{t('editor.slot.interval')}</SelectItem>
            <SelectItem value="LUNCH_BREAK">{t('editor.slot.lunchBreak')}</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-2 w-28">
        <TimePicker
          value={slot.startTime}
          onChange={(val) => onUpdate(slot.id, { startTime: val })}
          className="h-8 text-sm"
        />
      </td>
      <td className="px-2 py-2 w-28">
        <TimePicker
          value={slot.endTime}
          onChange={(val) => onUpdate(slot.id, { endTime: val })}
          className="h-8 text-sm"
        />
      </td>
      <td className="px-2 py-2 w-16 text-center text-sm text-muted-foreground">
        {calcDuration(slot.startTime, slot.endTime)}
      </td>
      <td className="px-2 py-2 w-10">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onDelete(slot.id)}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </td>
    </tr>
  );
}
