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

interface SlotCardProps {
  slot: EditorSlot;
  onUpdate: (id: string, updates: Partial<EditorSlot>) => void;
  onDelete: (id: string) => void;
}

function calcDuration(start: string, end: string): string {
  if (!start || !end) return '--';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? `${diff}m` : '--';
}

function slotLabel(slot: EditorSlot, t: (key: string) => string): string {
  if (slot.type === 'PERIOD') return `${t('editor.slot.period')} ${slot.periodNumber ?? ''}`;
  if (slot.type === 'INTERVAL') return t('editor.slot.interval');
  return t('editor.slot.lunchBreak');
}

export function SlotCard({ slot, onUpdate, onDelete }: SlotCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border bg-card p-3 space-y-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <span className="text-sm font-medium">{slotLabel(slot, t)}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onDelete(slot.id)}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Select
          value={slot.type}
          onValueChange={(val) =>
            onUpdate(slot.id, { type: val as EditorSlot['type'] })
          }
        >
          <SelectTrigger className="h-8 text-sm w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PERIOD">{t('editor.slot.period')}</SelectItem>
            <SelectItem value="INTERVAL">{t('editor.slot.interval')}</SelectItem>
            <SelectItem value="LUNCH_BREAK">{t('editor.slot.lunchBreak')}</SelectItem>
          </SelectContent>
        </Select>
        <TimePicker
          value={slot.startTime}
          onChange={(val) => onUpdate(slot.id, { startTime: val })}
          className="h-8 text-sm w-24"
        />
        <span className="text-muted-foreground">--</span>
        <TimePicker
          value={slot.endTime}
          onChange={(val) => onUpdate(slot.id, { endTime: val })}
          className="h-8 text-sm w-24"
        />
        <span className="text-xs text-muted-foreground">
          {calcDuration(slot.startTime, slot.endTime)}
        </span>
      </div>
    </div>
  );
}
