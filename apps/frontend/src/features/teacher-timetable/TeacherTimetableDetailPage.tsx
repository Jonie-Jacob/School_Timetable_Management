import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  DndContext,
  type DragStartEvent,
  type DragEndEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared';
import { ExportButton } from '@/components/shared/ExportButton';
import { useGetTeachersQuery, useGetTeachersLoadQuery } from '@/features/teachers/teacherApi';
import {
  useExportTeacherPdfMutation,
  useExportTeacherExcelMutation,
  downloadHtmlAsPdf,
  downloadExcel,
} from '@/features/export/exportApi';
import {
  useLazyGetValidTeacherSwapTargetsQuery,
  usePreviewTeacherSwapMutation,
  useSwapTeacherSlotsMutation,
  useSwapSlotsMutation,
} from '@/features/timetable/timetableApi';
import type {
  ValidTeacherSwapTarget,
  InvalidTeacherSwapTarget,
  PreviewTeacherSwapResponse,
} from '@/features/timetable/timetableApi';
import { SwapConflictResolutionDialog } from '@/features/timetable/SwapConflictResolutionDialog';
import { TeacherTimetableGrid } from './TeacherTimetableGrid';
import { TeacherBreakdown } from './TeacherBreakdown';

export function Component() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();

  const { data: teachersData } = useGetTeachersQuery({ pageSize: 200 });
  const { data: teacherLoads } = useGetTeachersLoadQuery();
  const teacher = teachersData?.data.find((t) => t.id === teacherId);
  const teacherLoad = teacherLoads?.find((l) => l.id === teacherId);

  const [exportPdf] = useExportTeacherPdfMutation();
  const [exportExcel] = useExportTeacherExcelMutation();

  // DnD state
  const [activeDragSlotId, setActiveDragSlotId] = useState<string | null>(null);
  const [validTargets, setValidTargets] = useState<ValidTeacherSwapTarget[]>([]);
  const [invalidTargets, setInvalidTargets] = useState<InvalidTeacherSwapTarget[]>([]);
  const [conflictDialog, setConflictDialog] = useState<{
    sourceSlotId: string;
    targetSlotId: string;
    conflicts: PreviewTeacherSwapResponse['conflicts'];
  } | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);

  const [fetchValidTargets] = useLazyGetValidTeacherSwapTargetsQuery();
  const [previewSwap] = usePreviewTeacherSwapMutation();
  const [swapTeacherSlots] = useSwapTeacherSlotsMutation();
  const [swapSlots] = useSwapSlotsMutation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback(async (event: DragStartEvent) => {
    const sourceSlotId = event.active.id as string;
    setActiveDragSlotId(sourceSlotId);

    try {
      const result = await fetchValidTargets(sourceSlotId).unwrap();
      setValidTargets(result.validTargets);
      setInvalidTargets(result.invalidTargets);
    } catch {
      setValidTargets([]);
      setInvalidTargets([]);
    }
  }, [fetchValidTargets]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragSlotId(null);
    setValidTargets([]);
    setInvalidTargets([]);

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sourceSlotId = active.id as string;
    const targetSlotId = over.id as string;

    // Check if target is in valid list
    const validTarget = validTargets.find((t) => t.slotId === targetSlotId);

    if (!validTarget) {
      // Target is invalid — check reason
      const inv = invalidTargets.find((t) => t.slotId === targetSlotId);
      if (inv) {
        toast.error(inv.reason === 'Period structure mismatch'
          ? 'Cannot swap: period structures are different'
          : `Cannot swap: ${inv.reason}`);
      }
      return;
    }

    // Same-division, no conflicts expected → swap directly
    if (validTarget.isSameDivision) {
      setIsSwapping(true);
      try {
        await swapSlots({ sourceSlotId, targetSlotId }).unwrap();
        toast.success('Slot swapped.');
      } catch (err: unknown) {
        const error = err as { status?: number; data?: { error?: { code?: string; message?: string } } };
        if (error?.status === 409 && error?.data?.error?.code === 'TEACHER_CONFLICT') {
          try {
            const parsed = JSON.parse(error.data!.error!.message!);
            if (parsed.conflicts) {
              setConflictDialog({ sourceSlotId, targetSlotId, conflicts: parsed.conflicts });
              return;
            }
          } catch { /* fall through */ }
        }
        toast.error(error?.data?.error?.message ?? 'Swap failed.');
      } finally {
        setIsSwapping(false);
      }
      return;
    }

    // Cross-division → preview first
    try {
      const preview = await previewSwap({ sourceSlotId, targetSlotId }).unwrap();

      if (preview.swapType === 'elective' && preview.delegateToElective) {
        // Elective swap — use existing class timetable flow
        toast.info('Elective swaps should be done from the class timetable view.');
        return;
      }

      if (preview.conflicts && preview.conflicts.length > 0) {
        setConflictDialog({ sourceSlotId, targetSlotId, conflicts: preview.conflicts });
      } else {
        // No conflicts → execute directly
        setIsSwapping(true);
        try {
          await swapTeacherSlots({ sourceSlotId, targetSlotId }).unwrap();
          toast.success('Cross-division swap completed.');
        } catch (err: unknown) {
          const error = err as { data?: { error?: { message?: string } } };
          toast.error(error?.data?.error?.message ?? 'Swap failed.');
        } finally {
          setIsSwapping(false);
        }
      }
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error?.data?.error?.message ?? 'Preview failed.');
    }
  }, [validTargets, invalidTargets, swapSlots, previewSwap, swapTeacherSlots]);

  const handleConflictConfirm = useCallback(async (force: boolean) => {
    if (!conflictDialog) return;
    const { sourceSlotId, targetSlotId } = conflictDialog;
    setConflictDialog(null);
    setIsSwapping(true);
    try {
      await swapTeacherSlots({ sourceSlotId, targetSlotId, force }).unwrap();
      toast.success(force ? 'Swap forced — conflicts created.' : 'Swap completed.');
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error?.data?.error?.message ?? 'Swap failed.');
    } finally {
      setIsSwapping(false);
    }
  }, [conflictDialog, swapTeacherSlots]);

  if (!teacherId) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={teacher?.name ?? 'Teacher Timetable'}
        description="Weekly timetable for this teacher. Drag cells to swap across divisions."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/teacher-timetable')}>
              <ArrowLeft className="size-3.5" />
              All teachers
            </Button>
            <ExportButton
              onExportPdf={async () => {
                try {
                  const result = await exportPdf({ teacherId }).unwrap();
                  downloadHtmlAsPdf(result.html, result.filename);
                  toast.success('Export ready -- use browser print dialog to save as PDF');
                } catch {
                  toast.error('Export failed');
                }
              }}
              onExportExcel={async () => {
                try {
                  const result = await exportExcel({ teacherId }).unwrap();
                  downloadExcel(result.base64, result.filename);
                  toast.success('Excel downloaded');
                } catch {
                  toast.error('Export failed');
                }
              }}
            />
          </div>
        }
      />

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <TeacherTimetableGrid
          teacherId={teacherId}
          teacherName={teacher?.name}
          assignedPeriods={teacherLoad?.assignedPeriods}
          isDndEnabled
          validTargets={validTargets}
          invalidTargets={invalidTargets}
          activeDragSlotId={activeDragSlotId}
        />

        <DragOverlay>
          {activeDragSlotId && (
            <div className="rounded-lg bg-white shadow-lg border-2 border-primary px-3 py-2 text-xs font-medium opacity-90">
              Moving...
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Conflict resolution dialog */}
      <SwapConflictResolutionDialog
        open={!!conflictDialog}
        conflicts={(conflictDialog?.conflicts ?? []).map((c) => ({
          teacherName: c.teacherName,
          className: c.className,
          divisionLabel: c.divisionLabel,
          classId: '',
          divisionId: c.divisionId,
          conflictedSlotId: c.conflictedSlotId,
          direction: 'source_to_target' as const,
        }))}
        isSwapping={isSwapping}
        onConfirm={handleConflictConfirm}
        onCancel={() => setConflictDialog(null)}
      />

      <TeacherBreakdown teacherId={teacherId} />
    </div>
  );
}
