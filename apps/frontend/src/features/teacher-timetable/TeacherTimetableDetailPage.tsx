import { useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
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
import { useAppDispatch } from '@/app/hooks';
import { useGetTeachersQuery, useGetTeachersLoadQuery } from '@/features/teachers/teacherApi';
import {
  useExportTeacherPdfMutation,
  useExportTeacherExcelMutation,
  downloadHtmlAsPdf,
  downloadExcel,
} from '@/features/export/exportApi';
import {
  timetableApi,
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
import { TeacherSwapConfirmDialog } from './TeacherSwapConfirmDialog';
import { TeacherTimetableGrid } from './TeacherTimetableGrid';
import { TeacherBreakdown } from './TeacherBreakdown';

export function Component() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

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
  const [swapDialog, setSwapDialog] = useState<{
    sourceSlotId: string;
    targetSlotId: string;
    preview: PreviewTeacherSwapResponse;
  } | null>(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [swappingSlotIds, setSwappingSlotIds] = useState<Set<string>>(new Set());

  const [fetchValidTargets] = useLazyGetValidTeacherSwapTargetsQuery();
  const [previewSwap] = usePreviewTeacherSwapMutation();
  const [swapTeacherSlots] = useSwapTeacherSlotsMutation();
  const [swapSlots] = useSwapSlotsMutation();

  const markSwapping = (ids: string[]) => setSwappingSlotIds(new Set(ids));
  const clearSwapping = () => setSwappingSlotIds(new Set());

  const invalidateCache = useCallback(() => {
    dispatch(timetableApi.util.invalidateTags(['Timetable']));
  }, [dispatch]);

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
    const rawTargetId = over.id as string;

    // Resolve the target: might be a real UUID or an empty cell ID (empty:dayOfWeek:sortOrder)
    let validTarget = validTargets.find((t) => t.slotId === rawTargetId);
    let targetSlotId = rawTargetId;

    if (!validTarget) {
      const emptyMatch = rawTargetId.match(/^empty:(\d+):(.+)$/);
      if (emptyMatch) {
        const dow = parseInt(emptyMatch[1]);
        const so = parseFloat(emptyMatch[2]);
        validTarget = validTargets.find((t) => t.dayOfWeek === dow && t.sortOrder === so && t.isEmpty);
        if (!validTarget) {
          // Also check non-empty targets at same coordinates (occupied by another teacher)
          validTarget = validTargets.find((t) => t.dayOfWeek === dow && t.sortOrder === so);
        }
      }
      if (validTarget) {
        targetSlotId = validTarget.slotId;
      }
    }

    if (!validTarget) {
      // Target is invalid — check reason
      const inv = invalidTargets.find((t) => t.slotId === rawTargetId);
      if (inv) {
        toast.error(inv.reason === 'Period structure mismatch'
          ? 'Cannot swap: period structures are different'
          : `Cannot swap: ${inv.reason}`);
      } else {
        toast.info('Cannot drop here — no matching slot in this division\'s timetable. Use the class timetable view for cross-division moves.');
      }
      return;
    }

    markSwapping([sourceSlotId, targetSlotId]);

    // Same-division → swap directly (conflict triggers preview dialog)
    if (validTarget.isSameDivision) {
      setIsSwapping(true);
      try {
        await swapSlots({ sourceSlotId, targetSlotId }).unwrap();
        toast.success('Slot swapped.');
        invalidateCache();
      } catch (err: unknown) {
        const error = err as { status?: number; data?: { error?: { code?: string; message?: string } } };
        if (error?.status === 409 && error?.data?.error?.code === 'TEACHER_CONFLICT') {
          try {
            const preview = await previewSwap({ sourceSlotId, targetSlotId }).unwrap();
            setSwapDialog({ sourceSlotId, targetSlotId, preview });
            return; // Keep swapping indicators until dialog resolves
          } catch { /* fall through */ }
        }
        toast.error(error?.data?.error?.message ?? 'Swap failed.');
        clearSwapping();
      } finally {
        setIsSwapping(false);
      }
      return;
    }

    // Cross-division → always show preview dialog
    try {
      const preview = await previewSwap({ sourceSlotId, targetSlotId }).unwrap();

      if (preview.swapType === 'elective' && preview.delegateToElective) {
        toast.info('Elective swaps should be done from the class timetable view.');
        clearSwapping();
        return;
      }

      setSwapDialog({ sourceSlotId, targetSlotId, preview });
      return; // Keep swapping indicators until dialog resolves
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error?.data?.error?.message ?? 'Preview failed.');
    }
    clearSwapping();
  }, [validTargets, invalidTargets, swapSlots, previewSwap, invalidateCache]);

  const handleSwapConfirm = useCallback(async (force: boolean) => {
    if (!swapDialog) return;
    const { sourceSlotId, targetSlotId, preview } = swapDialog;
    setSwapDialog(null);
    setIsSwapping(true);
    markSwapping([sourceSlotId, targetSlotId]);
    try {
      if (preview.swapType === 'cross_division') {
        await swapTeacherSlots({ sourceSlotId, targetSlotId, force }).unwrap();
      } else {
        await swapSlots({ sourceSlotId, targetSlotId, force }).unwrap();
      }
      toast.success(force ? 'Swap forced — conflicts created.' : 'Swap completed.');
      invalidateCache();
    } catch (err: unknown) {
      const error = err as { data?: { error?: { message?: string } } };
      toast.error(error?.data?.error?.message ?? 'Swap failed.');
      clearSwapping();
    } finally {
      setIsSwapping(false);
    }
  }, [swapDialog, swapTeacherSlots, swapSlots, invalidateCache]);

  const handleSwapCancel = useCallback(() => {
    setSwapDialog(null);
    clearSwapping();
  }, []);

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
          swappingSlotIds={swappingSlotIds}
          onSwapComplete={clearSwapping}
        />

        <DragOverlay>
          {activeDragSlotId && (
            <div className="rounded-lg bg-white shadow-lg border-2 border-primary px-3 py-2 text-xs font-medium opacity-90">
              Moving...
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Teacher swap confirmation dialog */}
      <TeacherSwapConfirmDialog
        open={!!swapDialog}
        preview={swapDialog?.preview ?? null}
        isSwapping={isSwapping}
        onConfirm={handleSwapConfirm}
        onCancel={handleSwapCancel}
      />

      <TeacherBreakdown teacherId={teacherId} />
    </div>
  );
}
