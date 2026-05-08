import { useState } from 'react';
import { AlertTriangle, ArrowRight, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConflictResolutionTable } from '@/features/timetable/ConflictResolutionTable';
import type { PreviewTeacherSwapResponse } from '@/features/timetable/timetableApi';

interface TeacherSwapConfirmDialogProps {
  open: boolean;
  preview: PreviewTeacherSwapResponse | null;
  isSwapping: boolean;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}

export function TeacherSwapConfirmDialog({
  open,
  preview,
  isSwapping,
  onConfirm,
  onCancel,
}: TeacherSwapConfirmDialogProps) {
  const [allConflictsResolved, setAllConflictsResolved] = useState(false);

  if (!preview || !preview.sourceSummary || !preview.targetSummary) return null;

  const { sourceSummary, targetSummary, affectedCells, conflicts } = preview;
  const hasConflicts = (conflicts?.length ?? 0) > 0;
  const isCrossDivision = preview.swapType === 'cross_division';

  const conflictInputs = (conflicts ?? []).map((c) => ({
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
              <ArrowRightLeft className="size-5 text-emerald-500" />
            )}
            {isCrossDivision ? 'Cross-Division Swap' : 'Swap Confirmation'}
          </DialogTitle>
          <DialogDescription>
            Moving <span className="font-semibold">{sourceSummary.subjectName ?? 'Empty'}</span> from{' '}
            <span className="font-semibold">{sourceSummary.className} {sourceSummary.divisionLabel} {sourceSummary.dayLabel} P{sourceSummary.periodNumber}</span>{' '}
            to{' '}
            <span className="font-semibold">{targetSummary.className} {targetSummary.divisionLabel} {targetSummary.dayLabel} P{targetSummary.periodNumber}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Affected cells table */}
        {affectedCells && affectedCells.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              {isCrossDivision ? `${affectedCells.length} cells affected across 2 timetables:` : 'Cells affected:'}
            </div>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-1.5 text-left text-xs font-medium">Division</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium">Period</th>
                    <th className="px-3 py-1.5 text-left text-xs font-medium">Current</th>
                    <th className="px-3 py-1.5 text-center text-xs font-medium w-[30px]" />
                    <th className="px-3 py-1.5 text-left text-xs font-medium">After</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedCells.map((cell, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-3 py-1.5 font-medium text-xs">
                        {cell.className} {cell.divisionLabel}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {cell.dayLabel} P{cell.periodNumber}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {cell.currentSubject ? (
                          <span>{cell.currentSubject} — {cell.currentTeacher ?? 'Unassigned'}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Empty</span>
                        )}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <ArrowRight className="size-3 text-muted-foreground mx-auto" />
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {cell.newSubject ? (
                          <span className="text-emerald-700 font-medium">{cell.newSubject} — {cell.newTeacher ?? 'Unassigned'}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Empty</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Conflict resolution table */}
        {hasConflicts && (
          <ConflictResolutionTable
            conflicts={conflictInputs}
            open={open}
            onAllResolved={() => setAllConflictsResolved(true)}
          />
        )}

        {/* No conflicts info */}
        {!hasConflicts && isCrossDivision && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            No teacher conflicts detected. This swap is safe to execute.
          </div>
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
