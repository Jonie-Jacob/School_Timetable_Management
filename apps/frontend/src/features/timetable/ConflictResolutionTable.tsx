import { useState, useEffect, useCallback } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import {
  useLazyGetResolutionCandidatesQuery,
  useSwapSlotsMutation,
} from './timetableApi';
import type { ResolutionCandidate } from './timetableApi';

// Generic conflict shape that works for both regular and elective swaps
export interface ConflictInput {
  conflictedSlotId: string;
  teacherName: string;
  className: string;
  divisionLabel: string;
}

interface ConflictRowState {
  conflictedSlotId: string;
  teacherName: string;
  className: string;
  divisionLabel: string;
  candidates: ResolutionCandidate[];
  selectedCandidateSlotId: string;
  loading: boolean;
  resolved: boolean;
  resolving: boolean;
}

interface ConflictResolutionTableProps {
  conflicts: ConflictInput[];
  open: boolean;
  onAllResolved?: () => void;
}

function formatCandidate(c: ResolutionCandidate): string {
  if (c.isEmpty) return `${c.dayLabel} P${c.periodNumber ?? c.sortOrder + 1} - Empty`;
  return `${c.dayLabel} P${c.periodNumber ?? c.sortOrder + 1} - ${c.subjectName ?? 'Unknown'} - ${c.teacherName ?? 'Unassigned'}`;
}

export function ConflictResolutionTable({ conflicts, open, onAllResolved }: ConflictResolutionTableProps) {
  const [conflictRows, setConflictRows] = useState<ConflictRowState[]>([]);
  const [fetchCandidates] = useLazyGetResolutionCandidatesQuery();
  const [swapSlots] = useSwapSlotsMutation();

  const allResolved = conflictRows.length > 0 && conflictRows.every((r) => r.resolved);

  // Load resolution candidates when conflicts change
  useEffect(() => {
    if (!open || conflicts.length === 0) {
      setConflictRows([]);
      return;
    }

    const rows: ConflictRowState[] = conflicts.map((c) => ({
      conflictedSlotId: c.conflictedSlotId,
      teacherName: c.teacherName,
      className: c.className,
      divisionLabel: c.divisionLabel,
      candidates: [],
      selectedCandidateSlotId: '',
      loading: true,
      resolved: false,
      resolving: false,
    }));
    setConflictRows(rows);

    for (const conflict of conflicts) {
      fetchCandidates(conflict.conflictedSlotId).unwrap().then((result) => {
        setConflictRows((prev) => prev.map((r) => {
          if (r.conflictedSlotId !== conflict.conflictedSlotId) return r;
          const best = result.candidates[0]?.slotId ?? '';
          return { ...r, candidates: result.candidates, selectedCandidateSlotId: best, loading: false };
        }));
      }).catch(() => {
        setConflictRows((prev) => prev.map((r) => {
          if (r.conflictedSlotId !== conflict.conflictedSlotId) return r;
          return { ...r, loading: false };
        }));
      });
    }
  }, [open, conflicts, fetchCandidates]);

  // Notify parent when all resolved
  useEffect(() => {
    if (allResolved && onAllResolved) onAllResolved();
  }, [allResolved, onAllResolved]);

  const handleResolve = useCallback(async (conflictedSlotId: string) => {
    const row = conflictRows.find((r) => r.conflictedSlotId === conflictedSlotId);
    if (!row || !row.selectedCandidateSlotId) return;

    setConflictRows((prev) => prev.map((r) =>
      r.conflictedSlotId === conflictedSlotId ? { ...r, resolving: true } : r
    ));

    try {
      await swapSlots({
        sourceSlotId: conflictedSlotId,
        targetSlotId: row.selectedCandidateSlotId,
      }).unwrap();

      setConflictRows((prev) => prev.map((r) =>
        r.conflictedSlotId === conflictedSlotId ? { ...r, resolved: true, resolving: false } : r
      ));
      toast.success(`Resolved conflict for ${row.teacherName} in ${row.className} ${row.divisionLabel}`);
    } catch {
      setConflictRows((prev) => prev.map((r) =>
        r.conflictedSlotId === conflictedSlotId ? { ...r, resolving: false } : r
      ));
      toast.error('Failed to resolve conflict');
    }
  }, [conflictRows, swapSlots]);

  if (conflictRows.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-amber-600">
        {allResolved
          ? 'All conflicts resolved -- you can now swap cleanly.'
          : `${conflicts.length} conflict${conflicts.length !== 1 ? 's' : ''} to resolve:`
        }
      </div>
      <div className="rounded-lg border border-border/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="px-3 py-1.5 text-left text-xs font-medium w-[100px]">Class Div</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium w-[140px]">Conflict Reason</th>
              <th className="px-3 py-1.5 text-left text-xs font-medium">Resolution</th>
              <th className="px-3 py-1.5 text-center text-xs font-medium w-[80px]">Action</th>
            </tr>
          </thead>
          <tbody>
            {conflictRows.map((row) => (
              <tr
                key={row.conflictedSlotId}
                className={cn(
                  'border-t border-border/40 transition-colors',
                  row.resolved && 'bg-emerald-50 dark:bg-emerald-950/30',
                  !row.resolved && 'bg-amber-50/50 dark:bg-amber-950/20',
                )}
              >
                <td className="px-3 py-2 font-medium text-xs">
                  {row.className} {row.divisionLabel}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {row.teacherName} is busy teaching {row.className} {row.divisionLabel}
                </td>
                <td className="px-3 py-2">
                  {row.resolved ? (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <Check className="size-3.5" /> Resolved
                    </span>
                  ) : row.loading ? (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="size-3.5 animate-spin" /> Finding options...
                    </span>
                  ) : row.candidates.length === 0 ? (
                    <span className="text-xs text-red-600">No resolution available</span>
                  ) : (
                    <Select
                      value={row.selectedCandidateSlotId}
                      onValueChange={(val) => {
                        setConflictRows((prev) => prev.map((r) =>
                          r.conflictedSlotId === row.conflictedSlotId ? { ...r, selectedCandidateSlotId: val } : r
                        ));
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {row.candidates.map((c, i) => (
                          <SelectItem key={c.slotId} value={c.slotId} className="text-xs">
                            {i === 0 && <span className="text-emerald-600 mr-1">[Best]</span>}
                            {formatCandidate(c)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {row.resolved ? (
                    <Check className="size-4 text-emerald-600 mx-auto" />
                  ) : (
                    <Button
                      size="xs"
                      variant="outline"
                      className="text-[10px] h-6 px-2"
                      disabled={!row.selectedCandidateSlotId || row.resolving || row.loading}
                      onClick={() => handleResolve(row.conflictedSlotId)}
                    >
                      {row.resolving ? <Loader2 className="size-3 animate-spin" /> : 'Resolve'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export { type ConflictRowState };
