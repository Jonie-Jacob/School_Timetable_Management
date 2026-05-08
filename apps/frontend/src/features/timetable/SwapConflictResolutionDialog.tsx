import { useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ConflictResolutionTable } from './ConflictResolutionTable';
import type { SwapConflict } from './timetableApi';

interface SwapConflictResolutionDialogProps {
  open: boolean;
  conflicts: SwapConflict[];
  isSwapping: boolean;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}

export function SwapConflictResolutionDialog({
  open,
  conflicts,
  isSwapping,
  onConfirm,
  onCancel,
}: SwapConflictResolutionDialogProps) {
  const [allResolved, setAllResolved] = useState(false);

  const conflictInputs = conflicts.map((c) => ({
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
            {allResolved ? (
              <ArrowRight className="size-5 text-emerald-500" />
            ) : (
              <AlertTriangle className="size-5 text-amber-500" />
            )}
            Teacher Conflict Detected
          </DialogTitle>
          <DialogDescription>
            Swapping these periods will create scheduling conflicts in other divisions.
            You can resolve them individually or swap anyway.
          </DialogDescription>
        </DialogHeader>

        <ConflictResolutionTable
          conflicts={conflictInputs}
          open={open}
          onAllResolved={() => setAllResolved(true)}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSwapping}>
            Cancel
          </Button>
          {!allResolved ? (
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
