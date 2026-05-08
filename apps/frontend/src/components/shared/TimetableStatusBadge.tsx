import { Badge } from '@/components/ui/badge';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import type { TimetableStatusJsonDto } from '@/features/timetable/timetableApi';

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'outline'; color: string }> = {
  VALID: { label: 'Valid', variant: 'success', color: 'text-emerald-600' },
  PREFERENCE_VIOLATION_SOFT: { label: 'Soft Pref Break', variant: 'outline', color: 'text-yellow-600' },
  EMPTY_SLOTS: { label: 'Incomplete', variant: 'warning', color: 'text-amber-600' },
  EXCESS_ASSIGNMENTS: { label: 'Excess P/W', variant: 'warning', color: 'text-amber-600' },
  PREFERENCE_VIOLATION_HARD: { label: 'Hard Pref Break', variant: 'warning', color: 'text-orange-600' },
  AVAILABILITY_VIOLATION: { label: 'Availability', variant: 'destructive', color: 'text-orange-700' },
  TEACHER_CONFLICT: { label: 'Teacher Conflict', variant: 'destructive', color: 'text-red-600' },
  ORPHANED_SLOTS: { label: 'Orphaned', variant: 'destructive', color: 'text-red-600' },
};

const SEVERITY_ORDER = [
  'ORPHANED_SLOTS', 'TEACHER_CONFLICT', 'AVAILABILITY_VIOLATION',
  'PREFERENCE_VIOLATION_HARD', 'EXCESS_ASSIGNMENTS', 'EMPTY_SLOTS',
  'PREFERENCE_VIOLATION_SOFT', 'VALID',
];

interface TimetableStatusBadgeProps {
  /** The statusJson from the timetable record */
  statusJson?: TimetableStatusJsonDto | null;
  /** Fallback to old enum status when statusJson is not available */
  legacyStatus?: string;
  /** Size variant */
  size?: 'sm' | 'md';
}

export function TimetableStatusBadge({ statusJson, legacyStatus, size = 'md' }: TimetableStatusBadgeProps) {
  // Fallback to legacy status if no statusJson
  if (!statusJson || !statusJson.statuses?.length) {
    if (!legacyStatus) {
      return <Badge variant="outline" className={size === 'sm' ? 'text-[10px]' : ''}>Pending</Badge>;
    }
    if (legacyStatus === 'GENERATED') {
      return <Badge variant="success" className={size === 'sm' ? 'text-[10px]' : ''}>Generated</Badge>;
    }
    return <Badge variant="warning" className={size === 'sm' ? 'text-[10px]' : ''}>Outdated</Badge>;
  }

  // Find most severe status
  const sorted = [...statusJson.statuses].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)
  );
  const primary = sorted[0];
  const config = STATUS_CONFIG[primary] ?? { label: primary, variant: 'outline' as const, color: '' };
  const others = sorted.length > 1 ? sorted.slice(1) : [];

  const badge = (
    <Badge variant={config.variant} className={size === 'sm' ? 'text-[10px]' : ''}>
      {config.label}
      {others.length > 0 && (
        <span className="ml-1 opacity-70">+{others.length}</span>
      )}
    </Badge>
  );

  if (others.length === 0) return badge;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1">
            {sorted.map((s) => {
              const c = STATUS_CONFIG[s];
              return (
                <div key={s} className={`text-xs font-medium ${c?.color ?? ''}`}>
                  {c?.label ?? s}
                </div>
              );
            })}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Get the most severe status tag for filtering/counting */
export function getMostSevereStatus(statusJson?: TimetableStatusJsonDto | null): string {
  if (!statusJson?.statuses?.length) return 'PENDING';
  const sorted = [...statusJson.statuses].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a) - SEVERITY_ORDER.indexOf(b)
  );
  return sorted[0];
}

export { STATUS_CONFIG, SEVERITY_ORDER };
