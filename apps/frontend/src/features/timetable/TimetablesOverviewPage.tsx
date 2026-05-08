import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Eye, Zap, CheckCircle2, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppDispatch } from '@/app/hooks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TimetableStatusBadge } from '@/components/shared/TimetableStatusBadge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/shared';
import { ExportButton } from '@/components/shared/ExportButton';
import { Skeleton } from '@/components/ui/skeleton';
import { classApi, useGetClassesQuery } from '@/features/classes/classApi';
import { useGenerateTimetableMutation, useGetActiveGenerationQuery } from './timetableApi';
import { onGenerationEvent } from '@/hooks/useWebSocket';
import {
  GenerationProgress,
  INITIAL_GENERATION_STATE,
  type GenerationState,
  type PhaseState,
  type StepState,
  type DivisionProgressState,
  type DivisionCompletedState,
  type SummaryState,
} from './GenerationProgress';
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
import { useBreakpoint } from '@/hooks/useBreakpoint';

type GenerateScope = 'all' | 'outdated' | 'pending';


export function Component() {
  useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const isDesktop = useBreakpoint('sm');

  const { data: classes, isLoading } = useGetClassesQuery(undefined, { refetchOnMountOrArgChange: true });
  const [generateMutation, { isLoading: isGeneratingAll }] = useGenerateTimetableMutation();
  const [exportDivPdf] = useExportDivisionPdfMutation();
  const [exportDivExcel] = useExportDivisionExcelMutation();
  const [exportClassesPdf] = useExportClassesPdfMutation();
  const [exportClassesExcel] = useExportClassesExcelMutation();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [adjacencyEnabled, setAdjacencyEnabled] = useState(false);
  const [generateScope, setGenerateScope] = useState<GenerateScope>('all');

  // ── WebSocket-driven generation progress ──
  // Restore last completed generation result from localStorage
  // Only restore if the result was saved AFTER the last dismissal
  const [genState, setGenState] = useState<GenerationState>(() => {
    try {
      const saved = localStorage.getItem('last-generation-result');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore if it has a summary (completed generation)
        if (parsed.summary) {
          const dismissedAt = parseInt(localStorage.getItem('generation-result-dismissed-at') ?? '0', 10);
          const savedAt = parsed.savedAt ?? 0;
          // Don't restore if the user already dismissed this result
          if (dismissedAt >= savedAt) return INITIAL_GENERATION_STATE;
          return {
            ...INITIAL_GENERATION_STATE,
            summary: parsed.summary,
            divisionCompleted: new Map(Object.entries(parsed.divisionCompleted ?? {})),
            currentPhase: { phase: 'complete', message: 'Last generation results', totalDivisions: parsed.summary.totalDivisions, completedDivisions: parsed.summary.completedDivisions },
          };
        }
      }
    } catch { /* ignore */ }
    return INITIAL_GENERATION_STATE;
  });

  // Track whether user dismissed the result -- persists across refresh via localStorage
  const dismissedRef = useRef(
    !localStorage.getItem('last-generation-result') &&
    parseInt(localStorage.getItem('generation-result-dismissed-at') ?? '0', 10) > 0
  );

  // Check for active generation on mount + poll every 5s while active
  const { data: activeGen, refetch: refetchActive } = useGetActiveGenerationQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!genState.active) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    // Poll active generation endpoint every 5s for progress
    pollRef.current = setInterval(() => {
      refetchActive();
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [genState.active, refetchActive]);

  // Update genState from polling data (fallback when WebSocket isn't available)
  useEffect(() => {
    if (!activeGen) return;

    if (activeGen.active && !genState.active) {
      setGenState((prev) => ({ ...prev, active: true }));
    }

    // Update progress from polled job data
    if (activeGen.totalDivisions && activeGen.totalDivisions > 0) {
      const completed = (activeGen as any).completedDivisions ?? 0;
      const total = activeGen.totalDivisions;
      const jobs = (activeGen as any).jobs as Array<{ divisionId: string; divisionLabel: string; status: string; completedAt?: string }> | undefined;

      setGenState((prev) => {
        // If we just started a new generation (active + no summary + early phases),
        // don't let stale polling data from the previous run override our fresh state
        if (prev.active && !prev.summary && !activeGen.active) {
          return prev;
        }

        const next = { ...prev };

        // Update phase based on progress -- only if we haven't received
        // richer WebSocket phase updates
        if (!prev.phases.length || prev.phases[prev.phases.length - 1] === 'loading') {
          if (completed === 0 && activeGen.active) {
            next.currentPhase = { phase: 'demand_placement', message: `Scheduling ${total} divisions -- constraint propagation in progress...`, totalDivisions: total, completedDivisions: 0 };
          } else if (completed > 0 && completed < total) {
            next.currentPhase = { phase: 'writing', message: `Writing timetables (${completed}/${total})...`, totalDivisions: total, completedDivisions: completed };
          }
        }

        // Update division completed from polled jobs -- but DON'T overwrite
        // entries that came from WebSocket (which have richer violation data)
        if (jobs) {
          const newCompleted = new Map(prev.divisionCompleted);
          for (const job of jobs) {
            if (job.status === 'COMPLETED' && !newCompleted.has(job.divisionId)) {
              newCompleted.set(job.divisionId, {
                divisionId: job.divisionId,
                divisionLabel: job.divisionLabel,
                completedIndex: newCompleted.size + 1,
                totalDivisions: total,
                generationsRun: 0,
                elapsed: 0,
                hardViolations: 0,
                timetableId: '',
                violations: [],
              });
            }
          }
          next.divisionCompleted = newCompleted;
        }

        // Check if all done -- skip if user already dismissed this result
        if (!activeGen.active && completed >= total && !dismissedRef.current) {
          // If WS is active (we've received phase events), don't build summary
          // from polling -- wait for the richer generation_summary WS event
          // which includes failureAnalysis
          if (prev.phases.length > 0 && !prev.summary) {
            // WS is active but summary hasn't arrived yet -- just mark complete
            next.active = false;
            next.currentPhase = { phase: 'complete', message: `All ${total} timetables generated`, totalDivisions: total, completedDivisions: total };
          } else if (!prev.summary) {
            // No WS -- build summary from polling data (fallback)
            next.active = false;
            next.currentPhase = { phase: 'complete', message: `All ${total} timetables generated`, totalDivisions: total, completedDivisions: total };

            const allCompleted = Array.from(next.divisionCompleted.values());
            const withViolations = allCompleted.filter(dc => dc.violations && dc.violations.length > 0);
            const summary: SummaryState = {
              totalDivisions: total,
              completedDivisions: completed,
              totalElapsed: 0,
              perfectDivisions: total - withViolations.length,
              divisionsWithViolations: withViolations.length,
              allViolations: withViolations.map(dc => ({
                divisionLabel: dc.divisionLabel,
                divisionId: dc.divisionId,
                violations: dc.violations,
              })),
              failureAnalysis: (activeGen as any).failureAnalysis ?? [],
            };
            next.summary = summary;
            dispatch(classApi.util.invalidateTags([{ type: 'Class', id: 'LIST' }]));
            try {
              localStorage.setItem('last-generation-result', JSON.stringify({
                summary,
                divisionCompleted: Object.fromEntries(next.divisionCompleted),
                savedAt: Date.now(),
              }));
            } catch { /* ignore */ }
          }
        }

        return next;
      });
    }
  }, [activeGen, genState.active, dispatch]);

  // Subscribe to WebSocket generation events (enhanced path when WS is available)
  useEffect(() => {
    return onGenerationEvent((event) => {
      setGenState((prev) => {
        const next = { ...prev };

        switch (event.type) {
          case 'generation_phase': {
            const p = event.payload as unknown as PhaseState;
            // New generation starting -- clear old results and reset dismiss flag
            if (p.phase === 'loading') {
              dismissedRef.current = false;
              localStorage.removeItem('generation-result-dismissed-at');
              next.summary = null;
              next.divisionCompleted = new Map();
              next.divisionProgress = new Map();
              next.currentStep = null;
              next.phases = [];
              localStorage.removeItem('last-generation-result');
            }
            next.active = p.phase !== 'complete';
            next.currentPhase = p;
            if (!next.phases.includes(p.phase)) {
              next.phases = [...next.phases, p.phase];
            }
            if (p.phase === 'complete') {
              // Refetch class list to update statuses
              dispatch(classApi.util.invalidateTags([{ type: 'Class', id: 'LIST' }]));
            }
            break;
          }
          case 'generation_step': {
            next.currentStep = event.payload as unknown as StepState;
            break;
          }
          case 'division_progress': {
            const dp = event.payload as unknown as DivisionProgressState;
            next.divisionProgress = new Map(prev.divisionProgress);
            next.divisionProgress.set(dp.divisionId, dp);
            break;
          }
          case 'division_completed': {
            const dc = event.payload as unknown as DivisionCompletedState;
            next.divisionCompleted = new Map(prev.divisionCompleted);
            next.divisionCompleted.set(dc.divisionId, dc);
            // Remove from in-progress
            next.divisionProgress = new Map(prev.divisionProgress);
            next.divisionProgress.delete(dc.divisionId);
            // Refetch to update status badges
            dispatch(classApi.util.invalidateTags([{ type: 'Class', id: 'LIST' }]));
            break;
          }
          case 'generation_summary': {
            next.summary = event.payload as unknown as SummaryState;
            next.active = false;
            dispatch(classApi.util.invalidateTags([{ type: 'Class', id: 'LIST' }]));
            // Persist to localStorage for viewing after navigation
            try {
              const toSave = {
                summary: next.summary,
                divisionCompleted: Object.fromEntries(next.divisionCompleted),
                savedAt: Date.now(),
              };
              localStorage.setItem('last-generation-result', JSON.stringify(toSave));
            } catch { /* ignore quota errors */ }
            break;
          }
        }
        return next;
      });
    });
  }, [dispatch]);

  // Flatten all divisions across classes
  const allDivisions = (classes ?? []).flatMap((cls) =>
    (cls.divisions ?? []).map((div) => ({
      ...div,
      className: cls.name,
      classId: cls.id,
    })),
  );

  const valid = allDivisions.filter((d) => d.timetable?.statusJson?.statuses?.includes('VALID')).length;
  const withIssues = allDivisions.filter((d) => d.timetable?.statusJson && !d.timetable.statusJson.statuses?.includes('VALID') && d.timetable.statusJson.statuses?.length > 0).length;
  const pending = allDivisions.filter((d) => !d.timetable).length;
  // Legacy compat
  const generated = allDivisions.filter((d) => d.timetable?.status === 'GENERATED').length;
  const outdated = allDivisions.filter((d) => d.timetable?.status === 'OUTDATED').length;

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

    // Clear old results and show progress immediately
    dismissedRef.current = false;
    localStorage.removeItem('last-generation-result');
    localStorage.removeItem('generation-result-dismissed-at');
    setGenState({
      ...INITIAL_GENERATION_STATE,
      active: true,
      currentPhase: {
        phase: 'loading',
        message: `Queuing ${ids.length} division(s)...`,
        totalDivisions: ids.length,
        completedDivisions: 0,
      },
      phases: ['loading'],
    });

    try {
      await generateMutation({ divisionIds: ids, adjacencyConstraintEnabled: adjacencyEnabled }).unwrap();
      toast.info(`Queued ${ids.length} division(s) -- generation starting...`);
    } catch (err: unknown) {
      const error = err as { status?: number; data?: { error?: { code?: string; message?: string } } };
      // Reset progress on failure
      setGenState(INITIAL_GENERATION_STATE);
      if (error?.status === 409 && error?.data?.error?.code === 'GENERATION_IN_PROGRESS') {
        toast.error('A generation is already in progress. Please wait for it to complete.');
      } else {
        toast.error(error?.data?.error?.message ?? 'Failed to start generation.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Timetables"
        description="View and manage timetables across all classes and divisions."
        actions={
          <div className="flex items-center gap-2">
            {(generated > 0 || outdated > 0) && (
              <ExportButton
                label="Export All"
                onExportPdf={async () => {
                  const classIds = [...new Set(allDivisions.filter(d => d.timetable?.status === 'GENERATED' || d.timetable?.status === 'OUTDATED').map(d => d.classId))];
                  try {
                    const result = await exportClassesPdf({ classIds }).unwrap();
                    downloadHtmlAsPdf(result.html, result.filename);
                    toast.success('Export ready -- use browser print dialog to save as PDF');
                  } catch { toast.error('Export failed'); }
                }}
                onExportExcel={async () => {
                  const classIds = [...new Set(allDivisions.filter(d => d.timetable?.status === 'GENERATED' || d.timetable?.status === 'OUTDATED').map(d => d.classId))];
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
                disabled={isGeneratingAll || genState.active}
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
            <span className="text-sm font-medium">{valid}</span>
            <span className="text-xs text-muted-foreground">Valid</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="text-sm font-medium">{withIssues}</span>
            <span className="text-xs text-muted-foreground">Issues</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{pending}</span>
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
        </div>
      )}

      {/* Generation progress */}
      <GenerationProgress
        state={genState}
        onDismiss={() => {
          setGenState(INITIAL_GENERATION_STATE);
          dismissedRef.current = true;
          localStorage.removeItem('last-generation-result');
          localStorage.setItem('generation-result-dismissed-at', String(Date.now()));
        }}
      />

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

      {!isLoading && allDivisions.length > 0 && !isDesktop && (
        <div className="space-y-2">
          {allDivisions.map((div) => {
            return (
              <div key={div.id} className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold">{div.className}</span>
                    <span className="text-sm text-muted-foreground"> -- Div {div.label}</span>
                    {div.streamName && <span className="text-xs text-muted-foreground"> ({div.streamName})</span>}
                  </div>
                  <TimetableStatusBadge statusJson={div.timetable?.statusJson as any} legacyStatus={div.timetable?.status} size="sm" />
                </div>
                <div className="text-[11px] text-muted-foreground">{div.periodStructure?.name ?? '--'}</div>
                <div className="flex items-center gap-1.5">
                  {div.timetable && (
                    <>
                      <Button variant="outline" size="xs" className="text-[11px] gap-1" onClick={() => navigate(`/classes/${div.classId}/divisions/${div.id}/timetable`)}>
                        <Eye className="size-3" /> View
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
                  <Button variant={status ? 'outline' : 'default'} size="xs" className="text-[11px] gap-1" onClick={() => navigate(`/classes/${div.classId}/divisions/${div.id}/generate`)}>
                    <Zap className="size-3" /> {status ? 'Regenerate' : 'Generate'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && allDivisions.length > 0 && isDesktop && (
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
                      {div.streamName && <span className="text-muted-foreground"> -- {div.streamName}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {div.periodStructure?.name ?? '--'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <TimetableStatusBadge statusJson={div.timetable?.statusJson as any} legacyStatus={div.timetable?.status} size="sm" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {div.timetable && (
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
                  {allDivisions.length} division(s) -- {valid} valid, {withIssues} with issues, {pending} pending
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
                  { value: 'outdated' as const, label: 'With Issues', count: withIssues + outdated, icon: AlertTriangle, color: 'text-amber-500' },
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
