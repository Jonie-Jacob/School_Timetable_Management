import { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConflictResolutionTable } from './ConflictResolutionTable';
import type { PreviewElectiveSwapResponse } from './timetableApi';

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
  const [allConflictsResolved, setAllConflictsResolved] = useState(false);

  if (!preview) return null;

  const hasConflicts = preview.conflicts.length > 0;
  const affectedCount = preview.affectedDivisions.length;
  const isMultiDivision = affectedCount > 1;

  const sourcePeriod = `P${preview.sourceCoordinates.slotSortOrder + 1}`;
  const targetPeriod = `P${preview.targetCoordinates.slotSortOrder + 1}`;

  const conflictInputs = preview.conflicts.map((c) => ({
    conflictedSlotId: c.conflictedSlotId,
    teacherName: c.teacherName,
    className: c.className,
    divisionLabel: c.divisionLabel,
  }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasConflicts && !allConflictsResolved ? (
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

        {/* Conflicts resolution table (shared component) */}
        {hasConflicts && (
          <ConflictResolutionTable
            conflicts={conflictInputs}
            open={open}
            onAllResolved={() => setAllConflictsResolved(true)}
          />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSwapping}>
            Cancel
          </Button>
          {hasConflicts && !allConflictsResolved ? (
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
              Confirm Swap
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
