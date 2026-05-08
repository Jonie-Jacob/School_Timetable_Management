import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, LayoutGrid, Trash2, CalendarDays, FileText, Eye, Copy, UserCheck, X, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TimetableStatusBadge } from '@/components/shared/TimetableStatusBadge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetPeriodStructuresQuery, useAssignDivisionsMutation } from '@/features/period-structures/configApi';
import { useGetTeachersQuery } from '@/features/teachers/teacherApi';
import { assignmentApi, useGetAssignmentsQuery } from '@/features/assignments/assignmentApi';
import { useAppDispatch } from '@/app/hooks';
import {
  useGetClassQuery,
  useAddDivisionMutation,
  useDeleteDivisionMutation,
  useSetClassTeacherMutation,
  useRemoveClassTeacherMutation,
  useAnalyzeClassTeacherMutation,
  useExecuteClassTeacherSwapMutation,
  type Division,
} from './classApi';

const divisionSchema = z.object({
  label: z.string().min(1, 'Label is required').max(10),
  streamName: z.string().max(100).optional(),
});

type DivisionFormValues = z.infer<typeof divisionSchema>;

export function Component() {
  const { t } = useTranslation('classes');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isReadOnly = useReadOnly();

  const { data: classItem, isLoading } = useGetClassQuery(id!, { skip: !id, refetchOnMountOrArgChange: true });
  const { data: periodStructures } = useGetPeriodStructuresQuery();
  const [addDivision, { isLoading: isAdding }] = useAddDivisionMutation();
  const [deleteDivision, { isLoading: isDeletingDiv }] = useDeleteDivisionMutation();
  const [setClassTeacher] = useSetClassTeacherMutation();
  const [removeClassTeacher] = useRemoveClassTeacherMutation();
  const [assignDivisions] = useAssignDivisionsMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Division | null>(null);

  const form = useForm<DivisionFormValues>({
    resolver: zodResolver(divisionSchema),
    defaultValues: { label: '', streamName: '' },
  });

  const handleAddDivision = async (values: DivisionFormValues) => {
    if (!id) return;
    try {
      await addDivision({
        classId: id,
        label: values.label,
        streamName: values.streamName || null,
      }).unwrap();
      toast.success(t('detail.divisionCreateSuccess'));
      setFormOpen(false);
      form.reset();
    } catch {
      toast.error(t('detail.divisionCreateError'));
    }
  };

  const handleCopyDivision = async (source: Division) => {
    if (!id) return;
    const nextLabel = String.fromCharCode(
      Math.max(...(classItem?.divisions ?? []).map((d) => d.label.charCodeAt(0)), 64) + 1,
    );
    try {
      await addDivision({
        classId: id,
        label: nextLabel,
        streamName: source.streamName,
      }).unwrap();
      toast.success(`Division ${nextLabel} created (copy of ${source.label}).`);
    } catch {
      toast.error(t('detail.divisionCreateError'));
    }
  };


  const handleDeleteDivision = async () => {
    if (!deleteTarget || !id) return;
    try {
      await deleteDivision({ classId: id, divisionId: deleteTarget.id }).unwrap();
      toast.success(t('detail.divisionDeleteSuccess'));
      setDeleteTarget(null);
    } catch {
      toast.error(t('detail.divisionDeleteError'));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!classItem) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Class not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/classes')}>Back to Classes</Button>
      </div>
    );
  }

  const divisions = classItem.divisions ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="icon" onClick={() => navigate('/classes')} title="Back to Classes">
          <ArrowLeft className="size-4" />
        </Button>
        <div className="text-sm text-muted-foreground">
          <span className="hover:text-foreground cursor-pointer" onClick={() => navigate('/classes')}>Classes</span>
          <span className="mx-1.5">/</span>
          <span className="text-foreground font-medium">{classItem.name}</span>
        </div>
      </div>
      <PageHeader
        title={classItem.name}
        description={`${divisions.length} ${divisions.length === 1 ? 'division' : 'divisions'}`}
        actions={
          !isReadOnly ? (
            <Button onClick={() => { form.reset(); setFormOpen(true); }}>
              <Plus className="size-4" />
              {t('detail.addDivision')}
            </Button>
          ) : undefined
        }
      />

      {divisions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 mb-4">
            <LayoutGrid className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">{t('detail.noDivisions')}</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">{t('detail.noDivisionsDescription')}</p>
          {!isReadOnly && (
            <Button className="mt-4" onClick={() => { form.reset(); setFormOpen(true); }}>
              <Plus className="size-4" />
              {t('detail.addDivision')}
            </Button>
          )}
        </div>
      )}

      {divisions.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {divisions.map((div) => {
            const assignmentCount = div._count?.divisionAssignments ?? 0;
            const ttStatus = div.timetable?.status;

            return (
              <div
                key={div.id}
                className="group rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5 hover:border-amber-500/20"
              >
                {/* Header: name + actions */}
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    Division {div.label}
                    {div.streamName && (
                      <span className="font-normal text-muted-foreground"> -- {div.streamName}</span>
                    )}
                  </h3>
                  {!isReadOnly && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon-xs" onClick={() => handleCopyDivision(div)} title="Copy division">
                        <Copy className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(div)} title={t('delete')}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </div>

                {/* Period structure -- inline editable dropdown */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('detail.periodStructure')}</Label>
                  {isReadOnly ? (
                    <Badge variant="outline" className="text-[10px]">
                      {div.periodStructure?.name ?? 'Not assigned'}
                    </Badge>
                  ) : (
                    <Select
                      value={div.periodStructureId ?? '_none'}
                      onValueChange={async (v) => {
                        if (v === '_none' || v === div.periodStructureId) return;
                        try {
                          await assignDivisions({ periodStructureId: v, divisionIds: [div.id] }).unwrap();
                          toast.success('Period structure updated');
                        } catch {
                          toast.error('Failed to update period structure');
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue placeholder="Select structure..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none" className="text-xs">Not assigned</SelectItem>
                        {(periodStructures ?? []).map((ps) => (
                          <SelectItem key={ps.id} value={ps.id} className="text-xs">{ps.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Class Teacher */}
                <ClassTeacherField
                  classId={id!}
                  division={div}
                  isReadOnly={isReadOnly}
                  onSet={async (teacherId) => {
                    try {
                      await setClassTeacher({ classId: id!, divisionId: div.id, teacherId }).unwrap();
                      toast.success('Class teacher assigned');
                    } catch (err: any) {
                      toast.error(err?.data?.error?.message || 'Failed to assign class teacher');
                    }
                  }}
                  onRemove={async () => {
                    try {
                      await removeClassTeacher({ classId: id!, divisionId: div.id }).unwrap();
                      toast.success('Class teacher removed');
                    } catch {
                      toast.error('Failed to remove class teacher');
                    }
                  }}
                />

                {/* Stats row */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{assignmentCount} {t('detail.subjects')}</span>
                  <TimetableStatusBadge statusJson={div.timetable?.statusJson as any} legacyStatus={ttStatus} size="sm" />
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <Button variant="outline" size="xs" className="text-[11px]"
                    onClick={(e) => { e.stopPropagation(); navigate(`/classes/${id}/divisions/${div.id}/assignments`); }}>
                    <FileText className="size-3 mr-1" />
                    {t('detail.assignments')}
                  </Button>
                  <Button variant="outline" size="xs" className="text-[11px]"
                    onClick={(e) => { e.stopPropagation(); navigate(`/classes/${id}/divisions/${div.id}/generate`); }}>
                    <CalendarDays className="size-3 mr-1" />
                    {t('detail.generate')}
                  </Button>
                  {div.timetable && (
                    <Button variant="outline" size="xs" className="text-[11px]"
                      onClick={(e) => { e.stopPropagation(); navigate(`/classes/${id}/divisions/${div.id}/timetable`); }}>
                      <Eye className="size-3 mr-1" />
                      {t('detail.viewTimetable')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Division Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('detail.addDivision')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleAddDivision)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="divLabel">{t('detail.divisionLabel')}</Label>
              <Input id="divLabel" placeholder={t('detail.divisionLabelPlaceholder')} {...form.register('label')} autoFocus />
              {form.formState.errors.label && <p className="text-sm text-destructive">{form.formState.errors.label.message}</p>}
            </div>
            {classItem.requiresStream && (
              <div className="space-y-2">
                <Label htmlFor="streamName">{t('detail.streamName')}</Label>
                <Input id="streamName" placeholder={t('detail.streamNamePlaceholder')} {...form.register('streamName')} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={isAdding}>{t('form.cancel')}</Button>
              <Button type="submit" disabled={isAdding}>{isAdding ? t('form.saving') : t('form.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteConfirm.title')}
        description={t('detail.divisionDeleteConfirm', { label: deleteTarget?.label ?? '' })}
        confirmLabel={t('deleteConfirm.confirm')}
        variant="destructive"
        loading={isDeletingDiv}
        onConfirm={handleDeleteDivision}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── Class Teacher inline field with swap modal ──

export function ClassTeacherField({
  classId,
  division,
  isReadOnly,
  onSet,
  onRemove,
}: {
  classId: string;
  division: Division;
  isReadOnly: boolean;
  onSet: (teacherId: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { data: teachersData } = useGetTeachersQuery({ pageSize: 200 });
  const allTeachers = teachersData?.data ?? [];
  // Pull assignments for this division so we can tell which teachers already
  // teach here. Skip the query until the modal is opened to avoid loading
  // data for every division card on the page.
  const [modalOpen, setModalOpen] = useState(false);
  const { data: divisionAssignments } = useGetAssignmentsQuery(division.id, {
    skip: !modalOpen,
  });

  const dispatch = useAppDispatch();
  const [analyze] = useAnalyzeClassTeacherMutation();
  const [executeSwap] = useExecuteClassTeacherSwapMutation();

  const [step, setStep] = useState<'pick' | 'result'>('pick');
  const [search, setSearch] = useState('');
  const [analysis, setAnalysis] = useState<import('./classApi').ClassTeacherAnalysis | null>(null);
  const [selectedSwap, setSelectedSwap] = useState<import('./classApi').SwapOption | null>(null);
  const [loading, setLoading] = useState(false);

  // teacherId → list of subject names they teach in THIS division.
  // Used to pin assigned teachers to the top of the list and tag them
  // with the subjects they handle.
  const assignedTeachersInDivision = (() => {
    const map = new Map<string, string[]>();
    for (const a of divisionAssignments ?? []) {
      if (!a.teacherId) continue;
      const list = map.get(a.teacherId) ?? [];
      list.push(a.subject.name);
      map.set(a.teacherId, list);
    }
    return map;
  })();

  // Build the picker list:
  //   1. Apply search filter
  //   2. Sort: teachers already in this division first (alpha within),
  //      then everyone else (alpha within)
  const filteredTeachers = (() => {
    const term = search.trim().toLowerCase();
    const matched = allTeachers.filter((t) =>
      term === '' || t.name.toLowerCase().includes(term),
    );
    return [...matched].sort((a, b) => {
      const aIn = assignedTeachersInDivision.has(a.id);
      const bIn = assignedTeachersInDivision.has(b.id);
      if (aIn !== bIn) return aIn ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  })();

  // Index of the first non-assigned teacher -- used to render a divider row.
  const firstUnassignedIdx = filteredTeachers.findIndex(
    (t) => !assignedTeachersInDivision.has(t.id),
  );

  const handlePickTeacher = async (teacherId: string) => {
    setLoading(true);
    try {
      const result = await analyze({ classId, divisionId: division.id, teacherId }).unwrap();
      setAnalysis(result);
      if (result.case === 'A') {
        // Simple case -- set directly
        await onSet(teacherId);
        toast.success(`${result.teacher.name} set as class teacher`);
        setModalOpen(false);
      } else {
        // Show analysis result
        if (result.swapOptions.length === 1) setSelectedSwap(result.swapOptions[0]);
        setStep('result');
      }
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSwap = async () => {
    if (!analysis || !selectedSwap) return;
    setLoading(true);
    try {
      const result = await executeSwap({
        classId,
        divisionId: division.id,
        teacherId: analysis.teacher.id,
        fromAssignmentId: selectedSwap.fromAssignmentId,
        targetAssignmentId: selectedSwap.targetAssignmentId,
      }).unwrap();
      const msgs = [`${analysis.teacher.name} set as class teacher`];
      if (result.warnings.length > 0) msgs.push(...result.warnings);
      // Invalidate assignment cache for both divisions
      dispatch(assignmentApi.util.invalidateTags([{ type: 'Assignment', id: 'LIST' }]));

      if (result.affectedTimetables.length > 0) {
        toast.warning(msgs.join('. '), { duration: 6000 });
      } else {
        toast.success(msgs.join('. '));
      }
      setModalOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Swap failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCaseC = async () => {
    if (!analysis) return;
    setLoading(true);
    try {
      await onSet(analysis.teacher.id);
      toast.success(`${analysis.teacher.name} set as class teacher (no swap)`);
      setModalOpen(false);
    } catch {
      toast.error('Failed to set class teacher');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setStep('pick');
    setSearch('');
    setAnalysis(null);
    setSelectedSwap(null);
    setModalOpen(true);
  };

  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        <UserCheck className="size-3" />
        Class Teacher
      </Label>
      {isReadOnly ? (
        <Badge variant="outline" className="text-[10px]">
          {division.classTeacher?.name ?? 'Not assigned'}
        </Badge>
      ) : (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs min-w-0 flex-1 justify-start font-normal truncate" onClick={openModal}>
            {division.classTeacher?.name ?? 'Select class teacher...'}
          </Button>
          {division.classTeacherId && (
            <Button variant="ghost" size="icon-xs" className="shrink-0" onClick={() => onRemove()} title="Remove class teacher">
              <X className="size-3 text-destructive" />
            </Button>
          )}
        </div>
      )}

      {/* Multi-step modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          {step === 'pick' && (
            <>
              <DialogHeader>
                <DialogTitle>Select Class Teacher</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Search teachers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border/40">
                  {filteredTeachers.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">No teachers found</div>
                  )}

                  {/* Section header for teachers already in this division */}
                  {assignedTeachersInDivision.size > 0 && filteredTeachers.some((t) => assignedTeachersInDivision.has(t.id)) && (
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-amber-700 bg-amber-500/10 border-b border-amber-500/20">
                      Teaching this division
                    </div>
                  )}

                  {filteredTeachers.map((t, idx) => {
                    const subjects = assignedTeachersInDivision.get(t.id);
                    const isInDivision = !!subjects;
                    const showSeparator =
                      firstUnassignedIdx > 0 && idx === firstUnassignedIdx;
                    return (
                      <div key={t.id}>
                        {showSeparator && (
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted/40 border-y border-border/30">
                            Other teachers
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={loading || t.id === division.classTeacherId}
                          className="w-full flex items-start gap-2 px-3 py-2 text-sm text-left hover:bg-amber-500/5 transition-colors disabled:opacity-50 border-b border-border/30 last:border-b-0"
                          onClick={() => handlePickTeacher(t.id)}
                        >
                          <UserCheck className={`size-3.5 shrink-0 mt-0.5 ${isInDivision ? 'text-amber-600' : 'text-muted-foreground'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={isInDivision ? 'font-medium' : ''}>{t.name}</span>
                              {t.id === division.classTeacherId && (
                                <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Current</Badge>
                              )}
                              {isInDivision && t.id !== division.classTeacherId && (
                                <Badge variant="warning" className="text-[9px] h-4 px-1.5">In division</Badge>
                              )}
                            </div>
                            {isInDivision && subjects && subjects.length > 0 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                Teaches: {subjects.join(', ')}
                              </div>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {step === 'result' && analysis?.case === 'B' && (
            <>
              <DialogHeader>
                <DialogTitle>Swap Required</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  <strong>{analysis.teacher.name}</strong> doesn't currently teach in this division. Select a subject to swap:
                </p>

                <div className="space-y-2">
                  {analysis.swapOptions.map((opt) => (
                    <label
                      key={opt.fromAssignmentId}
                      className={`flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSwap?.fromAssignmentId === opt.fromAssignmentId
                          ? 'border-amber-500 bg-amber-500/5'
                          : 'border-border/40 hover:bg-muted/30'
                      }`}
                    >
                      <input
                        type="radio"
                        name="swap-option"
                        checked={selectedSwap?.fromAssignmentId === opt.fromAssignmentId}
                        onChange={() => setSelectedSwap(opt)}
                        className="mt-1"
                      />
                      <div className="text-sm space-y-1">
                        <div>
                          <strong>{opt.subjectName}</strong>: swap{' '}
                          <span className="text-amber-600">{analysis.teacher.name}</span> (from {opt.fromDivision.className}-{opt.fromDivision.label})
                          {' ↔ '}
                          <span className="text-blue-600">{opt.currentTeacherInTarget.name}</span> (from this division)
                        </div>
                        {opt.currentTeacherIsClassTeacherOfSource && (
                          <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 rounded px-2 py-1">
                            <AlertTriangle className="size-3" />
                            {opt.currentTeacherInTarget.name} is class teacher of {opt.fromDivision.className}-{opt.fromDivision.label} and will be unset
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setStep('pick'); setAnalysis(null); }}>Back</Button>
                  <Button onClick={handleConfirmSwap} disabled={!selectedSwap || loading}>
                    {loading ? 'Swapping...' : 'Confirm Swap'}
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}

          {step === 'result' && analysis?.case === 'C' && (
            <>
              <DialogHeader>
                <DialogTitle>Warning</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                  <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p>{analysis.warning}</p>
                    <p className="mt-1 text-muted-foreground">
                      <strong>{analysis.teacher.name}</strong> will be set as class teacher without any subject assignment swap.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setStep('pick'); setAnalysis(null); }}>Back</Button>
                  <Button onClick={handleConfirmCaseC} disabled={loading}>
                    {loading ? 'Setting...' : 'Set as Class Teacher'}
                  </Button>
                </DialogFooter>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
