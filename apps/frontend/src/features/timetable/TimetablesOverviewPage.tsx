import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Eye, Zap, CheckCircle2, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/shared';
import { ExportButton } from '@/components/shared/ExportButton';
import { Skeleton } from '@/components/ui/skeleton';
import { classApi, useGetClassesQuery } from '@/features/classes/classApi';
import { useGenerateTimetableMutation } from './timetableApi';
import {
  useExportDivisionPdfMutation, useExportDivisionExcelMutation,
  useExportClassesPdfMutation, useExportClassesExcelMutation,
  downloadHtmlAsPdf, downloadExcel,
} from '@/features/export/exportApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

type GenerateScope = 'all' | 'outdated' | 'pending';

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_DURATION_MS = 5 * 60_000; // stop polling after 5 min

export function Component() {
  useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { data: classes, isLoading } = useGetClassesQuery(undefined, { refetchOnMountOrArgChange: true });
  const [generateMutation, { isLoading: isGeneratingAll }] = useGenerateTimetableMutation();
  const [exportDivPdf] = useExportDivisionPdfMutation();
  const [exportDivExcel] = useExportDivisionExcelMutation();
  const [exportClassesPdf] = useExportClassesPdfMutation();
  const [exportClassesExcel] = useExportClassesExcelMutation();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [adjacencyEnabled, setAdjacencyEnabled] = useState(false);
  const [generateScope, setGenerateScope] = useState<GenerateScope>('all');

  // ── Polling state for generation progress ──
  const [polling, setPolling] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef(0);
  const targetDivisionIdsRef = useRef<Set<string>>(new Set());
  // Snapshot of each target division's generatedAt BEFORE triggering.
  // A division is "done" when its generatedAt differs from the snapshot.
  const preGenerateSnapshotRef = useRef<Map<string, string | null>>(new Map());
  const lastProgressRef = useRef<{ count: number; at: number }>({ count: 0, at: 0 });
  // High-water mark — never show less progress than previously seen
  const highWaterRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  // Poll: refetch classes and check how many target divisions are now GENERATED
  useEffect(() => {
    if (!polling) return;

    const tick = () => {
      // Timeout guard
      if (Date.now() - pollStartRef.current > POLL_MAX_DURATION_MS) {
        stopPolling();
        toast.info('Generation is taking longer than expected. Refresh manually to check.');
        return;
      }
      dispatch(classApi.util.invalidateTags([{ type: 'Class', id: 'LIST' }]));
    };

    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [polling, dispatch, stopPolling]);

  // Check completion whenever classes data changes during polling.
  // A division is "done" when its timetable status is GENERATED AND its
  // generatedAt is AFTER the timestamp when we triggered the batch.
  // This prevents false-positives from previously generated timetables.
  useEffect(() => {
    if (!polling || !classes) return;
    const targets = targetDivisionIdsRef.current;
    if (targets.size === 0) return;

    const snapshot = preGenerateSnapshotRef.current;
    const allDivs = (classes ?? []).flatMap((cls) => cls.divisions ?? []);
    const doneCount = allDivs.filter((d) => {
      if (!targets.has(d.id)) return false;
      if (d.timetable?.status !== 'GENERATED') return false;
      // Compare against pre-trigger snapshot — "done" means generatedAt changed
      const before = snapshot.get(d.id);
      const now = d.timetable.generatedAt;
      return now !== before;
    }).length;

    if (doneCount >= targets.size) {
      stopPolling();
      toast.success(`All ${targets.size} timetable(s) generated successfully!`);
      return;
    }

    // Use high-water mark for stall detection too (prevents flicker from partial refetches)
    if (doneCount > highWaterRef.current) highWaterRef.current = doneCount;
    const hwm = highWaterRef.current;

    // Detect stalled progress — if count hasn't changed for 30s, stop
    const prev = lastProgressRef.current;
    if (hwm > prev.count) {
      lastProgressRef.current = { count: hwm, at: Date.now() };
    } else if (hwm === prev.count && prev.at > 0 && Date.now() - prev.at > 30_000) {
      stopPolling();
      const remaining = targets.size - hwm;
      if (hwm > 0) {
        toast.success(`${hwm} / ${targets.size} timetable(s) generated. ${remaining} division(s) may have no assignments.`);
      }
    }
  }, [classes, polling, stopPolling]);

  // Flatten all divisions across classes
  const allDivisions = (classes ?? []).flatMap((cls) =>
    (cls.divisions ?? []).map((div) => ({
      ...div,
      className: cls.name,
      classId: cls.id,
    })),
  );

  const generated = allDivisions.filter((d) => d.timetable?.status === 'GENERATED').length;
  const outdated = allDivisions.filter((d) => d.timetable?.status === 'OUTDATED').length;
  const pending = allDivisions.filter((d) => !d.timetable).length;

  // Progress tracking during polling — use high-water mark to prevent flickering
  const rawCompleted = polling
    ? allDivisions.filter((d) => {
        if (!targetDivisionIdsRef.current.has(d.id)) return false;
        if (d.timetable?.status !== 'GENERATED') return false;
        const before = preGenerateSnapshotRef.current.get(d.id);
        return d.timetable.generatedAt !== before;
      }).length
    : 0;
  if (rawCompleted > highWaterRef.current) highWaterRef.current = rawCompleted;
  const completedOfQueued = polling ? highWaterRef.current : 0;
  const progressPct = queuedCount > 0 ? Math.round((completedOfQueued / queuedCount) * 100) : 0;

  const getDivisionIdsForScope = (scope: GenerateScope) => {
    switch (scope) {
      case 'all':
        return allDivisions.map((d) => d.id);
      case 'outdated':
        return allDivisions.filter((d) => d.timetable?.status === 'OUTDATED').map((d) => d.id);
      case 'pending':
        return allDivisions.filter((d) => !d.timetable).map((d) => d.id);
    }
  };

  const scopeCount = getDivisionIdsForScope(generateScope).length;
  const handleGenerate = async () => {
    const ids = getDivisionIdsForScope(generateScope);
    setShowGenerateDialog(false);
    if (ids.length === 0) {
      toast.info('No divisions to generate for the selected scope.');
      return;
    }
    try {
      // Snapshot each target division's current generatedAt BEFORE triggering
      const snapshot = new Map<string, string | null>();
      for (const div of allDivisions) {
        if (ids.includes(div.id)) {
          snapshot.set(div.id, div.timetable?.generatedAt ?? null);
        }
      }
      preGenerateSnapshotRef.current = snapshot;

      await generateMutation({ divisionIds: ids, adjacencyConstraintEnabled: adjacencyEnabled }).unwrap();
      // Start polling for completion
      targetDivisionIdsRef.current = new Set(ids);
      setQueuedCount(ids.length);
      pollStartRef.current = Date.now();
      lastProgressRef.current = { count: 0, at: Date.now() };
      highWaterRef.current = 0;
      setPolling(true);
      toast.info(`Queued ${ids.length} division(s) — tracking progress...`);
    } catch {
      dispatch(classApi.util.invalidateTags([{ type: 'Class', id: 'LIST' }]));
      toast.error('Some timetables failed to generate. Check individual divisions.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Timetables"
        description="View and manage timetables across all classes and divisions."
        actions={
          <div className="flex items-center gap-2">
            {generated > 0 && (
              <ExportButton
                label="Export All"
                onExportPdf={async () => {
                  const classIds = [...new Set(allDivisions.filter(d => d.timetable?.status === 'GENERATED').map(d => d.classId))];
                  try {
                    const result = await exportClassesPdf({ classIds }).unwrap();
                    downloadHtmlAsPdf(result.html, result.filename);
                    toast.success('Export ready — use browser print dialog to save as PDF');
                  } catch { toast.error('Export failed'); }
                }}
                onExportExcel={async () => {
                  const classIds = [...new Set(allDivisions.filter(d => d.timetable?.status === 'GENERATED').map(d => d.classId))];
                  try {
                    const result = await exportClassesExcel({ classIds }).unwrap();
                    downloadExcel(result.base64, result.filename);
                    toast.success('Excel downloaded');
                  } catch { toast.error('Export failed'); }
                }}
              />
            )}
            {allDivisions.length > 0 && (
              <Button
                variant="gradient"
                onClick={() => setShowGenerateDialog(true)}
                disabled={isGeneratingAll}
                className="gap-2"
              >
                {isGeneratingAll ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                {isGeneratingAll ? 'Generating...' : 'Generate'}
              </Button>
            )}
          </div>
        }
      />

      {/* Summary stats */}
      {!isLoading && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span className="text-sm font-medium">{generated}</span>
            <span className="text-xs text-muted-foreground">Generated</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="text-sm font-medium">{outdated}</span>
            <span className="text-xs text-muted-foreground">Outdated</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{pending}</span>
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
        </div>
      )}

      {/* Generation progress */}
      {polling && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm px-5 py-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-amber-500" />
              <span className="font-medium">Generating timetables...</span>
            </div>
            <span className="text-muted-foreground">
              {completedOfQueued} / {queuedCount} completed
            </span>
          </div>
          <div className="h-2 rounded-full bg-amber-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {!isLoading && allDivisions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 mb-4">
            <CalendarDays className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No divisions found</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create classes and divisions first to generate timetables.</p>
          <Button className="mt-4" onClick={() => navigate('/classes')}>Go to Classes</Button>
        </div>
      )}

      {!isLoading && allDivisions.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white/90">
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Class</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Division</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Period Structure</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium">Status</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allDivisions.map((div, idx) => {
                const status = div.timetable?.status;
                return (
                  <tr
                    key={div.id}
                    className={`border-b border-border/40 transition-[background-color] duration-300 ease-in-out hover:bg-sidebar/10 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">{div.className}</td>
                    <td className="px-4 py-3">
                      Division {div.label}
                      {div.streamName && <span className="text-muted-foreground"> — {div.streamName}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {div.periodStructure?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={status === 'GENERATED' ? 'success' : status === 'OUTDATED' ? 'warning' : 'outline'}
                        className="text-[10px]"
                      >
                        {status === 'GENERATED' ? 'Generated' : status === 'OUTDATED' ? 'Outdated' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {status === 'GENERATED' && (
                          <>
                            <Button
                              variant="outline"
                              size="xs"
                              className="text-[11px] gap-1"
                              onClick={() => navigate(`/classes/${div.classId}/divisions/${div.id}/timetable`)}
                            >
                              <Eye className="size-3" />
                              View
                            </Button>
                            <ExportButton
                              size="xs"
                              label=""
                              onExportPdf={async () => {
                                try {
                                  const result = await exportDivPdf({ divisionId: div.id }).unwrap();
                                  downloadHtmlAsPdf(result.html, result.filename);
                                  toast.success('Export ready');
                                } catch { toast.error('Export failed'); }
                              }}
                              onExportExcel={async () => {
                                try {
                                  const result = await exportDivExcel({ divisionId: div.id }).unwrap();
                                  downloadExcel(result.base64, result.filename);
                                  toast.success('Excel downloaded');
                                } catch { toast.error('Export failed'); }
                              }}
                            />
                          </>
                        )}
                        <Button
                          variant={status ? 'outline' : 'default'}
                          size="xs"
                          className="text-[11px] gap-1"
                          onClick={() => navigate(`/classes/${div.classId}/divisions/${div.id}/generate`)}
                        >
                          <Zap className="size-3" />
                          {status ? 'Regenerate' : 'Generate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white">
                <td colSpan={5} className="px-4 py-2.5 text-xs text-white/60">
                  {allDivisions.length} division(s) — {generated} generated, {outdated} outdated, {pending} pending
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Dialog open={showGenerateDialog} onOpenChange={(v) => !v && setShowGenerateDialog(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Timetables</DialogTitle>
            <DialogDescription>
              Choose which divisions to generate and configure options.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Scope selector */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Scope</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'all' as const, label: 'All', count: allDivisions.length, icon: Zap, color: 'text-amber-500' },
                  { value: 'outdated' as const, label: 'Outdated', count: outdated, icon: AlertTriangle, color: 'text-amber-500' },
                  { value: 'pending' as const, label: 'Pending', count: pending, icon: Clock, color: 'text-muted-foreground' },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGenerateScope(opt.value)}
                    disabled={opt.count === 0}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
                      generateScope === opt.value
                        ? 'border-amber-500 bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30'
                        : 'border-border/40 bg-muted/20 hover:bg-muted/40 text-foreground',
                      opt.count === 0 && 'opacity-40 cursor-not-allowed',
                    )}
                  >
                    <opt.icon className={cn('size-4', generateScope === opt.value ? 'text-amber-500' : opt.color)} />
                    <span>{opt.label}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {opt.count}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>

            {/* Adjacency toggle */}
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/30 px-4 py-3">
              <Label htmlFor="adjacency-toggle" className="text-sm cursor-pointer">
                Enable adjacency constraint
                <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                  Groups same-subject periods into consecutive slots
                </span>
              </Label>
              <Switch
                id="adjacency-toggle"
                checked={adjacencyEnabled}
                onCheckedChange={setAdjacencyEnabled}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)} disabled={isGeneratingAll}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              loading={isGeneratingAll}
              disabled={scopeCount === 0}
            >
              <Zap className="mr-1.5 size-3.5" />
              Generate {scopeCount} Division{scopeCount !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
