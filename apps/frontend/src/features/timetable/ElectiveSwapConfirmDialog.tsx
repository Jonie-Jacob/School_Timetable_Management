import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import {
  useLazyGetResolutionCandidatesQuery,
  useSwapSlotsMutation,
} from './timetableApi';
import type {
  PreviewElectiveSwapResponse,
  ResolutionCandidate,
} from './timetableApi';

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

interface ElectiveSwapConfirmDialogProps {
  open: boolean;
  preview: PreviewElectiveSwapResponse | null;
  isSwapping: boolean;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}

export function ElectiveSwapConfirmDialog({
  open,
  preview,
  isSwapping,
  onConfirm,
  onCancel,
}: ElectiveSwapConfirmDialogProps) {
  const [conflictRows, setConflictRows] = useState<ConflictRowState[]>([]);
  const [fetchCandidates] = useLazyGetResolutionCandidatesQuery();
  const [swapSlots] = useSwapSlotsMutation();

  // Load resolution candidates for each conflict when dialog opens
  useEffect(() => {
    if (!open || !preview || preview.conflicts.length === 0) {
      setConflictRows([]);
      return;
    }

    const rows: ConflictRowState[] = preview.conflicts.map((c) => ({
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

    // Fetch candidates for each conflict
    for (const conflict of preview.conflicts) {
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
  }, [open, preview, fetchCandidates]);

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

  if (!preview) return null;

  const hasConflicts = preview.conflicts.length > 0;
  const affectedCount = preview.affectedDivisions.length;
  const isMultiDivision = affectedCount > 1;
  const allResolved = hasConflicts && conflictRows.length > 0 && conflictRows.every((r) => r.resolved);
  const someUnresolved = conflictRows.some((r) => !r.resolved);

  const sourcePeriod = `P${preview.sourceCoordinates.slotSortOrder + 1}`;
  const targetPeriod = `P${preview.targetCoordinates.slotSortOrder + 1}`;

  function formatCandidate(c: ResolutionCandidate): string {
    if (c.isEmpty) return `${c.dayLabel} P${c.periodNumber ?? c.sortOrder + 1} - Empty`;
    return `${c.dayLabel} P${c.periodNumber ?? c.sortOrder + 1} - ${c.subjectName ?? 'Unknown'} - ${c.teacherName ?? 'Unassigned'}`;
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasConflicts && !allResolved ? (
              <AlertTriangle className="size-5 text-amber-500" />
            ) : (
              <ArrowRight className="size-5 text-emerald-500" />
            )}
            {isMultiDivision ? 'Cross-Division Elective Swap' : 'Elective Swap'}
          </DialogTitle>
          <DialogDescription>
            Move <span className="font-semibold">{preview.sourceElectiveGroup.name}</span> from{' '}
            <span className="font-semibold">{preview.sourceCoordinates.dayLabel} {sourcePeriod}</span>{' '}
            to <span className="font-semibold">{preview.targetCoordinates.dayLabel} {targetPeriod}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Affected divisions table */}
        {isMultiDivision && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              This will affect {affectedCount} divisions:
            </div>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-1.5 text-left text-xs font-medium">Division</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium">
                      Currently at {preview.targetCoordinates.dayLabel} {targetPeriod}
                    </th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.affectedDivisions.map((div) => (
                    <tr key={div.divisionId} className="border-t border-border/40">
                      <td className="px-3 py-1.5 font-medium">
                        {div.className} {div.divisionLabel}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {div.currentTargetContent && div.currentTargetContent.length > 0
                          ? div.currentTargetContent.map((c, i) => (
                              <div key={i} className="text-xs">
                                {c.isElective && <span className="text-amber-600">[Elective] </span>}
                                {c.subject} -- {c.teacher}
                              </div>
                            ))
                          : <span className="text-xs italic">Empty</span>
                        }
                      </td>
                      <td className="px-3 py-1.5">
                        {div.action === 'displaced_to_source' ? (
                          <span className="text-xs text-blue-600">
                            Moves to {preview.sourceCoordinates.dayLabel} {sourcePeriod}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Freed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Single division info */}
        {!isMultiDivision && !hasConflicts && preview.affectedDivisions[0]?.currentTargetContent && (
          <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-3 text-sm">
            <span className="font-medium">{preview.affectedDivisions[0].className} {preview.affectedDivisions[0].divisionLabel}:</span>{' '}
            {preview.affectedDivisions[0].currentTargetContent.map((c) => c.subject).join(', ')}{' '}
            will move to {preview.sourceCoordinates.dayLabel} {sourcePeriod}
          </div>
        )}

        {/* Conflicts resolution table */}
        {hasConflicts && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-amber-600">
              {allResolved
                ? 'All conflicts resolved -- you can now swap cleanly.'
                : `${preview.conflicts.length} conflict${preview.conflicts.length !== 1 ? 's' : ''} to resolve:`
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSwapping}>
            Cancel
          </Button>
          {hasConflicts && someUnresolved && !allResolved ? (
            <Button
              variant="destructive"
              onClick={() => onConfirm(true)}
              disabled={isSwapping}
            >
              {isSwapping && <Loader2 className="size-4 animate-spin mr-2" />}
              Swap Anyway
            </Button>
          ) : (
            <Button
              onClick={() => onConfirm(false)}
              disabled={isSwapping}
            >
              {isSwapping && <Loader2 className="size-4 animate-spin mr-2" />}
              {allResolved ? 'Confirm Swap' : 'Confirm Swap'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
