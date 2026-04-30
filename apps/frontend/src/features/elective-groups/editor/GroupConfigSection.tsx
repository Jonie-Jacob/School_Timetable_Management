import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { ElectiveGroupFormValues } from './types';

interface Props {
  config: ElectiveGroupFormValues['config'];
  onChange: (config: ElectiveGroupFormValues['config']) => void;
  isEdit: boolean;
}

export function GroupConfigSection({ config, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Group Configuration</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="eg-name" className="text-xs">Group Name</Label>
          <Input
            id="eg-name"
            value={config.name}
            onChange={(e) => onChange({ ...config, name: e.target.value })}
            placeholder="e.g., Dance / Music"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eg-ppw" className="text-xs">Periods per Week</Label>
          <Input
            id="eg-ppw"
            type="number"
            min={1}
            max={50}
            value={config.periodsPerWeek}
            onChange={(e) => onChange({ ...config, periodsPerWeek: parseInt(e.target.value) || 1 })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Scheduling Mode</Label>
          <ToggleGroup
            type="single"
            value={config.type}
            onValueChange={(val) => {
              if (val) onChange({ ...config, type: val as 'per-division' | 'cross-division' });
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="per-division" className="text-xs px-3 py-1 gap-1 data-[state=on]:bg-amber-100 data-[state=on]:text-amber-900">
              {config.type === 'per-division' && <Check className="size-3.5 text-emerald-600" />}
              Per-Division
            </ToggleGroupItem>
            <ToggleGroupItem value="cross-division" className="text-xs px-3 py-1 gap-1 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-900">
              {config.type === 'cross-division' && <Check className="size-3.5 text-emerald-600" />}
              Cross-Division
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-[10px] text-muted-foreground">
            {config.type === 'per-division'
              ? 'Each division scheduled independently'
              : 'All divisions share the same time slots (same class only)'}
          </p>
        </div>
      </div>
    </div>
  );
}
