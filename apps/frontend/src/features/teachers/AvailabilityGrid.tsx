import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  useGetPeriodStructuresQuery,
  useGetPeriodStructureQuery,
} from '@/features/period-structures/configApi';
import type { PeriodStructure, Slot } from '@/features/period-structures/configApi';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

interface UnavailableSlot {
  workingDayId: string;
  slotId: string;
}

interface AvailabilityGridProps {
  value: UnavailableSlot[];
  onChange: (value: UnavailableSlot[]) => void;
  disabled?: boolean;
}

const DAY_LABELS: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

function isUnavailable(
  value: UnavailableSlot[],
  workingDayId: string,
  slotId: string,
): boolean {
  return value.some((s) => s.workingDayId === workingDayId && s.slotId === slotId);
}

function StructureGrid({
  structureId,
  value,
  onChange,
  disabled,
}: {
  structureId: string;
  value: UnavailableSlot[];
  onChange: (value: UnavailableSlot[]) => void;
  disabled?: boolean;
}) {
  const isDesktop = useBreakpoint('lg');
  const { data: structure, isLoading } = useGetPeriodStructureQuery(structureId);

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!structure) return null;

  return isDesktop ? (
    <DesktopGrid structure={structure} value={value} onChange={onChange} disabled={disabled} />
  ) : (
    <MobileGrid structure={structure} value={value} onChange={onChange} disabled={disabled} />
  );
}

function DesktopGrid({
  structure,
  value,
  onChange,
  disabled,
}: {
  structure: PeriodStructure;
  value: UnavailableSlot[];
  onChange: (value: UnavailableSlot[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('teachers');

  const workingDays = structure.workingDays ?? [];
  const periodSlots = useMemo(() => {
    if (workingDays.length === 0) return [];
    const firstDay = workingDays[0];
    return (firstDay.slots ?? [])
      .filter((s: any) => s.slotType === 'PERIOD')
      .slice().sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  }, [workingDays]);

  const toggleSlot = (workingDayId: string, slotId: string) => {
    if (disabled) return;
    if (isUnavailable(value, workingDayId, slotId)) {
      onChange(value.filter((s) => !(s.workingDayId === workingDayId && s.slotId === slotId)));
    } else {
      onChange([...value, { workingDayId, slotId }]);
    }
  };

  if (workingDays.length === 0 || periodSlots.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{structure.name}</p>
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-border px-3 py-2 text-left font-medium bg-muted" />
              {periodSlots.map((slot: any) => (
                <th
                  key={slot.id}
                  className="border border-border px-3 py-2 text-center font-medium bg-muted min-w-[60px]"
                >
                  <div>P{slot.slotNumber}</div>
                  <div className="text-[10px] text-muted-foreground font-normal">
                    {slot.startTime?.slice(0, 5)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workingDays
              .slice().sort((a: { sortOrder: number }, b: { sortOrder: number }) => a.sortOrder - b.sortOrder)
              .map((day: any) => {
                const daySlots = (day.slots ?? [])
                  .filter((s: any) => s.slotType === 'PERIOD')
                  .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

                return (
                  <tr key={day.id}>
                    <td className="border border-border px-3 py-2 font-medium bg-muted">
                      {DAY_LABELS[day.dayOfWeek] ?? day.label}
                    </td>
                    {daySlots.map((slot: any) => {
                      const unavailable = isUnavailable(value, day.id, slot.id);
                      return (
                        <td
                          key={slot.id}
                          className={cn(
                            'border border-border px-3 py-2 text-center cursor-pointer transition-colors select-none',
                            unavailable
                              ? 'bg-destructive/20 text-destructive hover:bg-destructive/30'
                              : 'hover:bg-muted/50',
                            disabled && 'cursor-not-allowed opacity-50',
                          )}
                          onClick={() => toggleSlot(day.id, slot.id)}
                          title={unavailable ? t('form.unavailable') : t('form.available')}
                        >
                          {unavailable ? '✗' : '✓'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{t('form.availabilityHint')}</p>
    </div>
  );
}

function MobileGrid({
  structure,
  value,
  onChange,
  disabled,
}: {
  structure: PeriodStructure;
  value: UnavailableSlot[];
  onChange: (value: UnavailableSlot[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation('teachers');
  const workingDays = structure.workingDays ?? [];

  const toggleSlot = (workingDayId: string, slotId: string) => {
    if (disabled) return;
    if (isUnavailable(value, workingDayId, slotId)) {
      onChange(value.filter((s) => !(s.workingDayId === workingDayId && s.slotId === slotId)));
    } else {
      onChange([...value, { workingDayId, slotId }]);
    }
  };

  if (workingDays.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{structure.name}</p>
      <Accordion type="single" collapsible className="w-full">
        {workingDays
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((day: any) => {
            const daySlots = (day.slots ?? [])
              .filter((s: Slot) => s.slotType === 'PERIOD')
              .slice().sort((a: Slot, b: Slot) => a.sortOrder - b.sortOrder);

            return (
              <AccordionItem key={day.id} value={day.id}>
                <AccordionTrigger className="text-sm">
                  {DAY_LABELS[day.dayOfWeek] ?? day.label}
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {daySlots.map((slot: Slot) => {
                      const unavailable = isUnavailable(value, day.id, slot.id);
                      return (
                        <div key={slot.id} className="flex items-center justify-between">
                          <Label className="text-sm">
                            P{slot.slotNumber} ({slot.startTime?.slice(0, 5)}–{slot.endTime?.slice(0, 5)})
                          </Label>
                          <div className="flex items-center gap-2">
                            <span className={cn('text-xs', unavailable ? 'text-destructive' : 'text-muted-foreground')}>
                              {unavailable ? t('form.unavailable') : t('form.available')}
                            </span>
                            <Switch
                              checked={!unavailable}
                              onCheckedChange={() => toggleSlot(day.id, slot.id)}
                              disabled={disabled}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
      </Accordion>
    </div>
  );
}

export function AvailabilityGrid({ value, onChange, disabled }: AvailabilityGridProps) {
  const { t } = useTranslation('teachers');
  const { data: structures, isLoading } = useGetPeriodStructuresQuery();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!structures || structures.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No period structures configured yet. Create period structures first to set teacher availability.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <Label>{t('form.availability')}</Label>
      {structures.map((structure) => (
        <StructureGrid
          key={structure.id}
          structureId={structure.id}
          value={value}
          onChange={onChange}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
