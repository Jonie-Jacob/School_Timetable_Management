import { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { DaySlotList } from './DaySlotList';
import {
  useGetPeriodStructureQuery,
  useCreatePeriodStructureMutation,
  useUpdatePeriodStructureMutation,
  useAssignDivisionsMutation,
  useSetWorkingDaysMutation,
  type SlotEntry,
} from './configApi';
import { useGetClassesQuery } from '@/features/classes/classApi';
import { ALL_DAYS, DAY_TO_NUMBER, NUMBER_TO_DAY, type DayKey, type EditorSlot } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let slotCounter = 0;
function newSlotId() {
  return `slot-${++slotCounter}-${Date.now()}`;
}

function makeDefaultSlots(): EditorSlot[] {
  const defs: Array<{ type: EditorSlot['type']; start: string; end: string }> = [
    { type: 'PERIOD', start: '09:00', end: '09:45' },
    { type: 'PERIOD', start: '09:45', end: '10:30' },
    { type: 'INTERVAL', start: '10:30', end: '10:45' },
    { type: 'PERIOD', start: '10:45', end: '11:30' },
    { type: 'PERIOD', start: '11:30', end: '12:15' },
    { type: 'LUNCH_BREAK', start: '12:15', end: '12:45' },
    { type: 'PERIOD', start: '12:45', end: '13:30' },
    { type: 'PERIOD', start: '13:30', end: '14:15' },
    { type: 'INTERVAL', start: '14:15', end: '14:30' },
    { type: 'PERIOD', start: '14:30', end: '15:15' },
    { type: 'PERIOD', start: '15:15', end: '16:00' },
  ];
  let periodNum = 0;
  return defs.map((d) => ({
    id: newSlotId(),
    type: d.type,
    startTime: d.start,
    endTime: d.end,
    periodNumber: d.type === 'PERIOD' ? ++periodNum : null,
  }));
}

function slotsFromApi(periods: SlotEntry[]): EditorSlot[] {
  const sorted = [...periods].sort((a, b) => a.order - b.order);
  let periodNum = 0;
  return sorted.map((p) => ({
    id: newSlotId(),
    type: p.type,
    startTime: p.startTime,
    endTime: p.endTime,
    periodNumber: p.type === 'PERIOD' ? ++periodNum : null,
  }));
}

function slotsToApi(slots: EditorSlot[]): SlotEntry[] {
  return slots.map((s, i) => ({
    order: i + 1,
    type: s.type,
    startTime: s.startTime,
    endTime: s.endTime,
    label: s.type === 'PERIOD' ? `Period ${s.periodNumber}` : s.type === 'INTERVAL' ? 'Break' : 'Lunch',
  }));
}

const DEFAULT_WORKING_DAYS: DayKey[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

// ---------------------------------------------------------------------------
// Editor component (exported as lazy Component for router)
// ---------------------------------------------------------------------------

export function Component() {
  const { t } = useTranslation('period-structures');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const isMobile = useMediaQuery('(max-width: 767px)');

  // API
  const { data: existing, isLoading: isLoadingExisting } = useGetPeriodStructureQuery(id!, {
    skip: !isEdit,
  });
  const { data: allClasses = [] } = useGetClassesQuery();
  const [createStructure, { isLoading: isCreating }] = useCreatePeriodStructureMutation();
  const [updateStructure, { isLoading: isUpdating }] = useUpdatePeriodStructureMutation();
  const [assignDivisions] = useAssignDivisionsMutation();
  const [setWorkingDaysMutation] = useSetWorkingDaysMutation();

  // Form state
  const [name, setName] = useState('');
  const [workingDaysList, setWorkingDaysList] = useState<DayKey[]>(DEFAULT_WORKING_DAYS);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [daySlots, setDaySlots] = useState<Record<DayKey, EditorSlot[]>>(() => {
    const init: Partial<Record<DayKey, EditorSlot[]>> = {};
    DEFAULT_WORKING_DAYS.forEach((d) => {
      init[d] = makeDefaultSlots();
    });
    return init as Record<DayKey, EditorSlot[]>;
  });
  const [activeDay, setActiveDay] = useState<DayKey>('MONDAY');
  const [copyConfirm, setCopyConfirm] = useState<{ source: DayKey } | null>(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [nameError, setNameError] = useState('');

  // Load existing
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    const days = existing.workingDays
      ?.map((wd) => NUMBER_TO_DAY[wd.dayOfWeek])
      .filter(Boolean) ?? DEFAULT_WORKING_DAYS;
    setWorkingDaysList(days);
    setSelectedClassIds(existing.divisions?.map((d) => d.id) ?? []);

    // Build day slots from existing data
    const newDaySlots: Partial<Record<DayKey, EditorSlot[]>> = {};
    for (const day of days) {
      const wd = existing.workingDays?.find((w) => NUMBER_TO_DAY[w.dayOfWeek] === day);
      if (wd?.slots?.length) {
        const sorted = [...wd.slots].sort((a, b) => a.sortOrder - b.sortOrder);
        let periodNum = 0;
        newDaySlots[day] = sorted.map((s) => ({
          id: newSlotId(),
          type: s.slotType,
          startTime: s.startTime,
          endTime: s.endTime,
          periodNumber: s.slotType === 'PERIOD' ? ++periodNum : null,
        }));
      } else {
        // Fall back to the periods JSON on the structure
        newDaySlots[day] = existing.periods?.length
          ? slotsFromApi(existing.periods)
          : makeDefaultSlots();
      }
    }
    setDaySlots(newDaySlots as Record<DayKey, EditorSlot[]>);
    if (days.length > 0 && !days.includes(activeDay)) {
      setActiveDay(days[0]);
    }
  }, [existing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Working day toggle
  const toggleDay = useCallback(
    (day: DayKey) => {
      setWorkingDaysList((prev) => {
        const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
        // Ensure slots exist for newly added days
        if (!prev.includes(day)) {
          setDaySlots((ds) => ({
            ...ds,
            [day]: ds[day] ?? makeDefaultSlots(),
          }));
        }
        return next;
      });
    },
    [],
  );

  // Slot updates for active day
  const handleSlotsChange = useCallback(
    (slots: EditorSlot[]) => {
      setDaySlots((prev) => ({ ...prev, [activeDay]: slots }));
    },
    [activeDay],
  );

  // Add slot
  const addSlot = useCallback(() => {
    setDaySlots((prev) => {
      const current = prev[activeDay] ?? [];
      const lastSlot = current[current.length - 1];
      const start = lastSlot?.endTime ?? '09:00';
      const [h, m] = start.split(':').map(Number);
      const endMin = h * 60 + m + 45;
      const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      let periodNum = current.filter((s) => s.type === 'PERIOD').length + 1;
      const newSlot: EditorSlot = {
        id: newSlotId(),
        type: 'PERIOD',
        startTime: start,
        endTime: end,
        periodNumber: periodNum,
      };
      return { ...prev, [activeDay]: [...current, newSlot] };
    });
  }, [activeDay]);

  // Copy from day
  const handleCopyFromDay = useCallback(
    (source: DayKey) => {
      setCopyConfirm({ source });
    },
    [],
  );

  const confirmCopy = useCallback(() => {
    if (!copyConfirm) return;
    setDaySlots((prev) => {
      const sourceSlots = prev[copyConfirm.source] ?? [];
      // Deep clone with new IDs
      let periodNum = 0;
      const copied = sourceSlots.map((s) => ({
        ...s,
        id: newSlotId(),
        periodNumber: s.type === 'PERIOD' ? ++periodNum : null,
      }));
      return { ...prev, [activeDay]: copied };
    });
    setCopyConfirm(null);
  }, [copyConfirm, activeDay]);

  // Reset to default
  const confirmReset = useCallback(() => {
    setDaySlots((prev) => ({ ...prev, [activeDay]: makeDefaultSlots() }));
    setResetConfirm(false);
  }, [activeDay]);

  // Save
  const isSaving = isCreating || isUpdating;

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setNameError(t('editor.nameRequired'));
      return;
    }
    setNameError('');

    if (workingDaysList.length === 0) {
      toast.error(t('editor.workingDaysRequired'));
      return;
    }

    try {
      // Use the active day's slots as the base periods for the structure
      const periods = slotsToApi(daySlots[activeDay] ?? []);

      let structureId: string;
      if (isEdit) {
        await updateStructure({ id: id!, name, periods }).unwrap();
        structureId = id!;
      } else {
        const created = await createStructure({ name, periods }).unwrap();
        structureId = created.id;
      }

      // Set working days
      const dayStrings = workingDaysList.map((d) => d);
      await setWorkingDaysMutation({ periodStructureId: structureId, days: dayStrings }).unwrap();

      // Assign classes
      if (selectedClassIds.length > 0) {
        await assignDivisions({ periodStructureId: structureId, divisionIds: selectedClassIds }).unwrap();
      }

      toast.success(t('editor.saveSuccess'));
      navigate('/period-structures');
    } catch {
      toast.error(t('editor.saveError'));
    }
  };

  // Sort working days in week order for display
  const sortedWorkingDays = useMemo(
    () => [...workingDaysList].sort((a, b) => DAY_TO_NUMBER[a] - DAY_TO_NUMBER[b]),
    [workingDaysList],
  );

  // Determine available "copy from" days (exclude active day)
  const copyFromDays = sortedWorkingDays.filter((d) => d !== activeDay);

  if (isEdit && isLoadingExisting) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-10 w-full rounded bg-muted" />
        <div className="h-64 w-full rounded bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? t('editor.titleEdit') : t('editor.titleNew')}
      />

      {/* Name */}
      <div className="space-y-2 max-w-md">
        <Label htmlFor="ps-name">{t('editor.name')}</Label>
        <Input
          id="ps-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError('');
          }}
          placeholder={t('editor.namePlaceholder')}
        />
        {nameError && <p className="text-sm text-destructive">{nameError}</p>}
      </div>

      {/* Working Days */}
      <div className="space-y-2">
        <Label>{t('editor.workingDays')}</Label>
        <div className="flex flex-wrap gap-4">
          {ALL_DAYS.map((day) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={workingDaysList.includes(day)}
                onCheckedChange={() => toggleDay(day)}
              />
              {t(`daysShort.${day}`)}
            </label>
          ))}
        </div>
      </div>

      {/* Assigned Divisions */}
      <div className="space-y-2">
        <Label>{t('editor.assignedClasses')}</Label>
        <p className="text-xs text-muted-foreground">Select which divisions should use this period structure.</p>
        <div className="rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm p-3 space-y-2 max-h-64 overflow-y-auto">
          {allClasses.length === 0 && (
            <p className="text-sm text-muted-foreground italic">No classes found. Create classes first.</p>
          )}
          {allClasses.map((cls) => {
            const divs = cls.divisions ?? [];
            if (divs.length === 0) return null;
            const allSelected = divs.every((d) => selectedClassIds.includes(d.id));
            const someSelected = divs.some((d) => selectedClassIds.includes(d.id));
            return (
              <div key={cls.id} className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer hover:text-amber-600 transition-colors">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={() => {
                      const divIds = divs.map((d) => d.id);
                      if (allSelected) {
                        setSelectedClassIds((prev) => prev.filter((id) => !divIds.includes(id)));
                      } else {
                        setSelectedClassIds((prev) => [...new Set([...prev, ...divIds])]);
                      }
                    }}
                    className="size-4 rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                  />
                  {cls.name}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({divs.filter((d) => selectedClassIds.includes(d.id)).length}/{divs.length})
                  </span>
                </label>
                <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
                  {divs.map((d) => (
                    <label key={d.id} className="flex items-center gap-1.5 text-xs cursor-pointer hover:text-amber-600 transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(d.id)}
                        onChange={() => {
                          setSelectedClassIds((prev) =>
                            prev.includes(d.id) ? prev.filter((id) => id !== d.id) : [...prev, d.id]
                          );
                        }}
                        className="size-3.5 rounded border-stone-300 text-amber-500 focus:ring-amber-500"
                      />
                      Div {d.label}{d.streamName ? ` (${d.streamName})` : ''}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {selectedClassIds.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-[10px]">{selectedClassIds.length} division(s) selected</Badge>
            <button
              type="button"
              className="text-amber-600 hover:underline"
              onClick={() => setSelectedClassIds([])}
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Day-wise Slot Configuration */}
      {sortedWorkingDays.length > 0 && (
        <div className="space-y-4">
          <Label>{t('editor.daySlots')}</Label>

          {isMobile ? (
            /* Mobile: dropdown instead of tabs */
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Select value={activeDay} onValueChange={(v) => setActiveDay(v as DayKey)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedWorkingDays.map((day) => (
                      <SelectItem key={day} value={day}>
                        {t(`days.${day}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {copyFromDays.length > 0 && (
                  <Select
                    value=""
                    onValueChange={(v) => handleCopyFromDay(v as DayKey)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder={t('editor.copyFrom')} />
                    </SelectTrigger>
                    <SelectContent>
                      {copyFromDays.map((day) => (
                        <SelectItem key={day} value={day}>
                          {t(`days.${day}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <DaySlotList
                slots={daySlots[activeDay] ?? []}
                onChange={handleSlotsChange}
              />
            </div>
          ) : (
            /* Desktop: tabs */
            <Tabs
              value={activeDay}
              onValueChange={(v) => setActiveDay(v as DayKey)}
            >
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <TabsList>
                  {sortedWorkingDays.map((day) => (
                    <TabsTrigger key={day} value={day}>
                      {t(`daysShort.${day}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>

                {copyFromDays.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{t('editor.copyFrom')}:</span>
                    <Select
                      value=""
                      onValueChange={(v) => handleCopyFromDay(v as DayKey)}
                    >
                      <SelectTrigger className="w-36 h-8">
                        <SelectValue placeholder={t('editor.selectDay')} />
                      </SelectTrigger>
                      <SelectContent>
                        {copyFromDays.map((day) => (
                          <SelectItem key={day} value={day}>
                            {t(`days.${day}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {sortedWorkingDays.map((day) => (
                <TabsContent key={day} value={day}>
                  <DaySlotList
                    slots={daySlots[day] ?? []}
                    onChange={(slots) =>
                      setDaySlots((prev) => ({ ...prev, [day]: slots }))
                    }
                  />
                </TabsContent>
              ))}
            </Tabs>
          )}

          {/* Add Slot */}
          <Button variant="outline" onClick={addSlot}>
            <Plus className="size-4" />
            {t('editor.addSlot')}
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? '...' : t('editor.save')}
        </Button>
        <Button variant="outline" onClick={() => setResetConfirm(true)}>
          <RotateCcw className="size-4" />
          {t('editor.resetDefault')}
        </Button>
        <Button variant="ghost" onClick={() => navigate('/period-structures')}>
          {t('editor.cancel')}
        </Button>
      </div>

      {/* Copy confirmation */}
      <ConfirmDialog
        open={!!copyConfirm}
        title={t('editor.copyConfirm.title')}
        description={t('editor.copyConfirm.description', {
          target: copyConfirm ? t(`days.${activeDay}`) : '',
          source: copyConfirm ? t(`days.${copyConfirm.source}`) : '',
        })}
        confirmLabel={t('editor.copyFrom')}
        onConfirm={confirmCopy}
        onCancel={() => setCopyConfirm(null)}
      />

      {/* Reset confirmation */}
      <ConfirmDialog
        open={resetConfirm}
        title={t('editor.resetConfirm.title')}
        description={t('editor.resetConfirm.description')}
        confirmLabel={t('editor.resetDefault')}
        variant="destructive"
        onConfirm={confirmReset}
        onCancel={() => setResetConfirm(false)}
      />
    </div>
  );
}
