import { CheckCircle2, Loader2, Circle, AlertTriangle, ChevronDown, ChevronRight, Lightbulb, User, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

// ── Types matching the WebSocket event payloads ──

export interface PhaseState {
  phase: string;
  message: string;
  totalDivisions: number;
  completedDivisions: number;
}

export interface StepState {
  phase: string;
  totalAssignments: number;
  placedAssignments: number;
  placedSuccessfully: number;
  placedWithConflict: number;
  currentAssignment: string;
  flexibility: number;
}

export interface DivisionProgressState {
  divisionId: string;
  divisionLabel: string;
  generation: number;
  maxGenerations: number;
  bestFitness: number;
  hardViolations: number;
  status: 'running' | 'converged' | 'completed';
}

export interface DivisionCompletedState {
  divisionId: string;
  divisionLabel: string;
  completedIndex: number;
  totalDivisions: number;
  generationsRun: number;
  elapsed: number;
  hardViolations: number;
  timetableId: string;
  violations: Array<{ type: string; severity: string; message: string }>;
}

export interface FailureAnalysis {
  type: string;
  severity: string;
  division: string;
  divisionId: string;
  subject: string;
  teachers: string[];
  message: string;
  suggestion: string;
  details: {
    totalSlots: number;
    slotsFull: number;
    teacherBusy: number;
    periodBlocked: number;
    maxPerDayBlocked: number;
    teacherLoads: Record<string, number>;
  };
}

export interface SummaryState {
  totalDivisions: number;
  completedDivisions: number;
  totalElapsed: number;
  perfectDivisions: number;
  divisionsWithViolations: number;
  allViolations: Array<{
    divisionLabel: string;
    divisionId: string;
    violations: Array<{ type: string; severity: string; message: string }>;
  }>;
  failureAnalysis: FailureAnalysis[];
}

export interface GenerationState {
  active: boolean;
  currentPhase: PhaseState | null;
  currentStep: StepState | null;
  divisionProgress: Map<string, DivisionProgressState>;
  divisionCompleted: Map<string, DivisionCompletedState>;
  summary: SummaryState | null;
  phases: string[]; // ordered phases that have been reached
}

export const INITIAL_GENERATION_STATE: GenerationState = {
  active: false,
  currentPhase: null,
  currentStep: null,
  divisionProgress: new Map(),
  divisionCompleted: new Map(),
  summary: null,
  phases: [],
};

const PHASE_ORDER = ['loading', 'sorting', 'teacher_partitioning', 'demand_placement', 'local_optimization', 'writing', 'complete'];
const PHASE_LABELS: Record<string, string> = {
  loading: 'Loading school data',
  sorting: 'Computing constraints & flexibility',
  teacher_partitioning: 'Partitioning teacher time slots',
  demand_placement: 'Demand-driven placement',
  local_optimization: 'Local optimization',
  writing: 'Writing timetables',
  complete: 'Complete',
};

// ── Component ──

interface GenerationProgressProps {
  state: GenerationState;
  onDismiss?: () => void;
}

export function GenerationProgress({ state, onDismiss }: GenerationProgressProps) {
  const [expandedDivisions, setExpandedDivisions] = useState(false);
  const [expandedViolations, setExpandedViolations] = useState<Set<string>>(new Set());

  if (!state.active && !state.summary) return null;

  const currentPhaseIdx = state.currentPhase
    ? PHASE_ORDER.indexOf(state.currentPhase.phase)
    : -1;

  const toggleViolation = (divId: string) => {
    setExpandedViolations((prev) => {
      const next = new Set(prev);
      if (next.has(divId)) next.delete(divId);
      else next.add(divId);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {state.summary ? (
              <CheckCircle2 className="size-4 text-emerald-400" />
            ) : (
              <Loader2 className="size-4 animate-spin text-amber-400" />
            )}
            <span className="text-sm font-semibold">
              {state.summary ? 'Generation Complete' : 'Generating Timetables'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {state.summary && state.summary.totalElapsed > 0 && (
              <span className="text-xs text-white/60">
                {state.summary.totalElapsed.toFixed(0)}s total
              </span>
            )}
            {state.summary && onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="text-xs text-white/40 hover:text-white/80 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* ── Phase checklist ── */}
        {PHASE_ORDER.filter((p) => p !== 'complete').map((phase, idx) => {
          const isDone = idx < currentPhaseIdx || state.summary;
          const isCurrent = idx === currentPhaseIdx && !state.summary;
          const isPending = idx > currentPhaseIdx && !state.summary;

          return (
            <div key={phase} className="flex items-start gap-3">
              <div className="mt-0.5">
                {isDone ? (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                ) : isCurrent ? (
                  <Loader2 className="size-4 animate-spin text-amber-500" />
                ) : (
                  <Circle className="size-4 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn(
                  'text-sm',
                  isDone && 'text-muted-foreground',
                  isCurrent && 'font-medium',
                  isPending && 'text-muted-foreground/50',
                )}>
                  {PHASE_LABELS[phase] ?? phase}
                </div>

                {/* Demand-driven placement details -- show during placement AND after as summary */}
                {phase === 'demand_placement' && state.currentStep && (
                  <div className="mt-1 space-y-1">
                    {isCurrent && (
                      <div className="h-1.5 rounded-full bg-amber-500/20 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${(state.currentStep.placedAssignments / state.currentStep.totalAssignments) * 100}%` }}
                        />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{state.currentStep.placedAssignments} / {state.currentStep.totalAssignments} placed</span>
                      <span>
                        {state.currentStep.placedSuccessfully} OK
                        {state.currentStep.placedWithConflict > 0 && (
                          <span className="text-amber-600"> · {state.currentStep.placedWithConflict} conflicts</span>
                        )}
                      </span>
                    </div>
                    {isCurrent && (
                      <div className="text-[11px] text-muted-foreground/70 truncate">
                        {state.currentStep.currentAssignment} (flex={state.currentStep.flexibility})
                      </div>
                    )}
                  </div>
                )}

                {/* GA optimization: division list */}
                {(isCurrent || isDone) && phase === 'writing' && (
                  <div className="mt-1">
                    {state.currentPhase && (
                      <div className="text-xs text-muted-foreground mb-1">
                        {state.currentPhase.completedDivisions} / {state.currentPhase.totalDivisions} divisions
                      </div>
                    )}

                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setExpandedDivisions(!expandedDivisions)}
                    >
                      {expandedDivisions ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      {expandedDivisions ? 'Hide' : 'Show'} divisions
                    </button>

                    {expandedDivisions && (
                      <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                        {Array.from(state.divisionCompleted.values()).map((dc) => (
                          <div key={dc.divisionId}>
                            <div
                              className="flex items-center justify-between text-xs py-0.5 cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1"
                              onClick={() => dc.violations?.length > 0 && toggleViolation(dc.divisionId)}
                            >
                              <div className="flex items-center gap-1.5">
                                <CheckCircle2 className="size-3 text-emerald-500" />
                                <span>{dc.divisionLabel}</span>
                                {dc.violations?.length > 0 && (
                                  expandedViolations.has(dc.divisionId)
                                    ? <ChevronDown className="size-3 text-muted-foreground" />
                                    : <ChevronRight className="size-3 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                {dc.elapsed > 0 && <span>{dc.elapsed.toFixed(1)}s</span>}
                                {dc.violations?.length > 0 && (() => {
                                  const hard = dc.violations.filter(v => v.severity === 'hard').length;
                                  const soft = dc.violations.filter(v => v.severity === 'soft').length;
                                  return (
                                    <div className="flex items-center gap-1">
                                      {hard > 0 && (
                                        <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                          {hard} hard
                                        </Badge>
                                      )}
                                      {soft > 0 && (
                                        <Badge variant="warning" className="text-[9px] px-1 py-0">
                                          {soft} soft
                                        </Badge>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            {expandedViolations.has(dc.divisionId) && dc.violations?.length > 0 && (
                              <div className="ml-6 mt-0.5 mb-1 space-y-0.5">
                                {dc.violations.map((v, vi) => (
                                  <div key={vi} className="text-[10px] flex items-center gap-1.5">
                                    <Badge
                                      variant={v.severity === 'hard' ? 'destructive' : 'warning'}
                                      className="text-[7px] px-1 py-0 uppercase"
                                    >
                                      {v.severity}
                                    </Badge>
                                    <span className="text-muted-foreground">{v.message}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {/* Currently running division */}
                        {Array.from(state.divisionProgress.values())
                          .filter((dp) => dp.status === 'running' && !state.divisionCompleted.has(dp.divisionId))
                          .map((dp) => (
                            <div key={dp.divisionId} className="flex items-center justify-between text-xs py-0.5">
                              <div className="flex items-center gap-1.5">
                                <Loader2 className="size-3 animate-spin text-amber-500" />
                                <span className="font-medium">{dp.divisionLabel}</span>
                              </div>
                              <span className="text-muted-foreground">
                                gen {dp.generation}/{dp.maxGenerations} fitness={dp.bestFitness}
                              </span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* ── Summary (after completion) ── */}
        {state.summary && (
          <div className="mt-4 pt-3 border-t border-border/40 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span className="font-medium">
                {state.summary.perfectDivisions} / {state.summary.totalDivisions} divisions -- perfect
              </span>
            </div>

            {state.summary.divisionsWithViolations > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <AlertTriangle className="size-4" />
                  <span className="font-medium">
                    {state.summary.divisionsWithViolations} division(s) with warnings
                  </span>
                </div>

                {state.summary.allViolations.map((dv) => (
                  <div key={dv.divisionId} className="ml-6">
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700"
                      onClick={() => toggleViolation(dv.divisionId)}
                    >
                      {expandedViolations.has(dv.divisionId) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                      {dv.divisionLabel} ({dv.violations?.length ?? 0} issues)
                    </button>
                    {expandedViolations.has(dv.divisionId) && dv.violations && (
                      <div className="mt-1 ml-4 space-y-0.5">
                        {dv.violations.map((v, vi) => (
                          <div key={vi} className="text-[11px] flex items-center gap-1.5">
                            <Badge
                              variant={v.severity === 'hard' ? 'destructive' : 'warning'}
                              className="text-[8px] px-1 py-0 uppercase"
                            >
                              {v.severity}
                            </Badge>
                            <span className="text-muted-foreground">{v.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Failure Analysis (actionable suggestions) ── */}
            {state.summary.failureAnalysis?.length > 0 && (
              <FailureAnalysisSection analyses={state.summary.failureAnalysis} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Failure Analysis Sub-component ──

const ANALYSIS_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  TEACHER_OVERLOAD: { label: 'Teacher Overload', color: 'text-red-600' },
  TEACHER_BUSY: { label: 'Teacher Busy', color: 'text-orange-600' },
  ELECTIVE_TEACHER_CONFLICT: { label: 'Elective Conflict', color: 'text-red-600' },
  MISSING_TEACHER: { label: 'Missing Teacher', color: 'text-red-600' },
  PERIOD_PREFERENCE_CONFLICT: { label: 'Period Preference', color: 'text-amber-600' },
  MAX_PER_DAY_CONFLICT: { label: 'Max Per Day', color: 'text-amber-600' },
  DAY_PREFERENCE_CONFLICT: { label: 'Day Preference', color: 'text-amber-600' },
  DIVISION_FULL: { label: 'Division Full', color: 'text-red-600' },
  PLACEMENT_FAILED: { label: 'Placement Failed', color: 'text-orange-600' },
};

function FailureAnalysisSection({ analyses }: { analyses: FailureAnalysis[] }) {
  const [expanded, setExpanded] = useState(true);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Group by division for cleaner display
  const grouped = analyses.reduce<Record<string, FailureAnalysis[]>>((acc, a) => {
    const key = a.division;
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  const toggleItem = (idx: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="mt-3 pt-3 border-t border-border/40">
      <button
        type="button"
        className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 w-full"
        onClick={() => setExpanded(!expanded)}
      >
        <AlertTriangle className="size-4" />
        <span>{analyses.length} placement issue(s) -- data fixes needed</span>
        {expanded ? <ChevronDown className="size-3 ml-auto" /> : <ChevronRight className="size-3 ml-auto" />}
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {Object.entries(grouped).map(([divLabel, items]) => (
            <div key={divLabel} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <BookOpen className="size-3.5 text-red-500" />
                {divLabel}
                <Badge variant="destructive" className="text-[8px] px-1.5 py-0 ml-1">
                  {items.length} issue{items.length > 1 ? 's' : ''}
                </Badge>
              </div>

              {items.map((a, idx) => {
                const globalIdx = analyses.indexOf(a);
                const typeInfo = ANALYSIS_TYPE_LABELS[a.type] || ANALYSIS_TYPE_LABELS.PLACEMENT_FAILED;
                const isExpanded = expandedItems.has(globalIdx);

                return (
                  <div key={idx} className="ml-1 space-y-1">
                    <button
                      type="button"
                      className="flex items-start gap-2 text-left w-full group"
                      onClick={() => toggleItem(globalIdx)}
                    >
                      <div className="flex items-center gap-1 mt-0.5 shrink-0">
                        {isExpanded ? <ChevronDown className="size-3 text-muted-foreground" /> : <ChevronRight className="size-3 text-muted-foreground" />}
                        <Badge variant="outline" className={cn('text-[8px] px-1.5 py-0 uppercase border-current', typeInfo.color)}>
                          {typeInfo.label}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground leading-tight">
                        <span className="font-medium text-foreground">{a.subject}</span>
                        {a.teachers.length > 0 && (
                          <span> -- {a.teachers.join(', ')}</span>
                        )}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="ml-5 space-y-1.5 pb-1">
                        {/* Problem */}
                        <div className="text-[11px] text-muted-foreground leading-relaxed">
                          {a.message}
                        </div>

                        {/* Suggestion */}
                        <div className="flex items-start gap-1.5 text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 rounded px-2 py-1.5">
                          <Lightbulb className="size-3 mt-0.5 shrink-0" />
                          <span className="leading-relaxed">{a.suggestion}</span>
                        </div>

                        {/* Teacher loads */}
                        {Object.keys(a.details.teacherLoads).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(a.details.teacherLoads).map(([name, load]) => (
                              <div key={name} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <User className="size-2.5" />
                                <span>{name}</span>
                                <Badge
                                  variant={load > a.details.totalSlots ? 'destructive' : 'outline'}
                                  className="text-[8px] px-1 py-0"
                                >
                                  {load}pw
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
