import { useState } from 'react';
import { ChevronDown, RotateCcw, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import type { ElectiveGroupFormValues } from './types';
import { DEFAULT_PREFS } from './types';

type PrefsShape = ElectiveGroupFormValues['defaultPrefs'];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface DivisionInfo {
  divisionId: string;
  className: string;
  divisionLabel: string;
}

interface Props {
  defaultPrefs: PrefsShape;
  onDefaultChange: (prefs: PrefsShape) => void;
  perDivisionOverrides: Record<string, PrefsShape | null>;
  onOverridesChange: (overrides: Record<string, PrefsShape | null>) => void;
  participatingDivisions: DivisionInfo[];
}

export function SchedulingPreferencesSection({
  defaultPrefs, onDefaultChange,
  perDivisionOverrides, onOverridesChange,
  participatingDivisions,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button type="button" className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-amber-600 transition-colors w-full">
          <Settings2 className="size-3.5" />
          Scheduling Preferences
          <ChevronDown className={`size-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 mt-3">
        {/* Default preferences */}
        <div className="border rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">Default (all divisions)</Label>
            <Button
              type="button" variant="ghost" size="sm" className="h-6 text-[10px]"
              onClick={() => onDefaultChange({ ...DEFAULT_PREFS })}
            >
              <RotateCcw className="size-2.5 mr-1" /> Reset
            </Button>
          </div>
          <PrefsForm prefs={defaultPrefs} onChange={onDefaultChange} />
        </div>

        {/* Per-division overrides */}
        {participatingDivisions.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Per-Division Overrides</Label>
            {participatingDivisions.map(div => {
              const override = perDivisionOverrides[div.divisionId];
              const hasOverride = override !== null && override !== undefined;
              return (
                <div key={div.divisionId} className="border rounded p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{div.className.replace(/^Class\s+/i, '')} {div.divisionLabel}</span>
                    {hasOverride ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-[9px]">Custom</Badge>
                        <Button
                          type="button" variant="ghost" size="sm" className="h-5 text-[10px] px-1.5"
                          onClick={() => {
                            const next = { ...perDivisionOverrides };
                            next[div.divisionId] = null;
                            onOverridesChange(next);
                          }}
                        >
                          <RotateCcw className="size-2.5 mr-0.5" /> Default
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button" variant="ghost" size="sm" className="h-5 text-[10px] px-1.5"
                        onClick={() => {
                          const next = { ...perDivisionOverrides };
                          next[div.divisionId] = { ...defaultPrefs };
                          onOverridesChange(next);
                        }}
                      >
                        Customize
                      </Button>
                    )}
                  </div>
                  {hasOverride && (
                    <PrefsForm
                      prefs={override!}
                      onChange={(updated) => {
                        const next = { ...perDivisionOverrides };
                        next[div.divisionId] = updated;
                        onOverridesChange(next);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

function PrefsForm({ prefs, onChange }: { prefs: PrefsShape; onChange: (p: PrefsShape) => void }) {
  const toggleDay = (list: 'preferredDays' | 'excludedDays', day: number) => {
    const current = prefs[list];
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    onChange({ ...prefs, [list]: next });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
      <div className="space-y-1.5">
        <Label className="text-[10px]">Constraint Type</Label>
        <Select value={prefs.constraintType} onValueChange={(val) => onChange({ ...prefs, constraintType: val as 'HARD' | 'SOFT' })}>
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="HARD">HARD</SelectItem>
            <SelectItem value="SOFT">SOFT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px]">Preferred Days</Label>
        <div className="flex gap-1">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i} type="button"
              onClick={() => toggleDay('preferredDays', i)}
              className={`w-7 h-6 rounded text-[9px] border ${
                prefs.preferredDays.includes(i) ? 'bg-green-100 border-green-400 text-green-800' : 'bg-muted/30 border-border'
              }`}
            >
              {label.slice(0, 2)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px]">Excluded Days</Label>
        <div className="flex gap-1">
          {DAY_LABELS.map((label, i) => (
            <button
              key={i} type="button"
              onClick={() => toggleDay('excludedDays', i)}
              className={`w-7 h-6 rounded text-[9px] border ${
                prefs.excludedDays.includes(i) ? 'bg-red-100 border-red-400 text-red-800' : 'bg-muted/30 border-border'
              }`}
            >
              {label.slice(0, 2)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={prefs.preferAdjacentPeriods}
          onCheckedChange={(checked) => onChange({ ...prefs, preferAdjacentPeriods: checked })}
        />
        <Label className="text-[10px]">Prefer Adjacent Periods</Label>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px]">Preferred Period Range</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number" min={1} className="w-14 h-6 text-[10px]" placeholder="Min"
            value={prefs.preferredPeriodRange?.min ?? ''}
            onChange={(e) => {
              const min = parseInt(e.target.value);
              onChange({
                ...prefs,
                preferredPeriodRange: min ? { min, max: prefs.preferredPeriodRange?.max ?? min } : null,
              });
            }}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="number" min={1} className="w-14 h-6 text-[10px]" placeholder="Max"
            value={prefs.preferredPeriodRange?.max ?? ''}
            onChange={(e) => {
              const max = parseInt(e.target.value);
              onChange({
                ...prefs,
                preferredPeriodRange: max ? { min: prefs.preferredPeriodRange?.min ?? 1, max } : null,
              });
            }}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[10px]">Max / Min Periods per Day</Label>
        <div className="flex items-center gap-1">
          <Input
            type="number" min={1} className="w-14 h-6 text-[10px]" placeholder="Min"
            value={prefs.minPeriodsPerDay ?? ''}
            onChange={(e) => onChange({ ...prefs, minPeriodsPerDay: parseInt(e.target.value) || null })}
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number" min={1} className="w-14 h-6 text-[10px]" placeholder="Max"
            value={prefs.maxPeriodsPerDay ?? ''}
            onChange={(e) => onChange({ ...prefs, maxPeriodsPerDay: parseInt(e.target.value) || null })}
          />
        </div>
      </div>
    </div>
  );
}
