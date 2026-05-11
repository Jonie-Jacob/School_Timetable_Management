import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, FileText, Trash2, Pencil, ArrowLeft, Settings2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetClassQuery } from '@/features/classes/classApi';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';
import { useGetTeachersQuery, useGetTeachersLoadQuery } from '@/features/teachers/teacherApi';
import {
  useGetElectiveGroupsQuery,
  useGetGroupedElectiveGroupsQuery,
  type GroupedElectiveGroup,
} from '@/features/elective-groups/electiveGroupApi';
import { ElectiveGroupEditorModal } from '@/features/elective-groups/editor';
import {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useCreateElectiveAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
  type Assignment,
} from './assignmentApi';

const rangeSchema = z.object({
  min: z.union([z.number().int().min(1), z.nan()]).optional(),
  max: z.union([z.number().int().min(1), z.nan()]).optional(),
});

const schedulingPrefsSchema = z.object({
  constraintType: z.enum(['HARD', 'SOFT']).default('SOFT'),
  preferredDays: z.array(z.number().int().min(0).max(6)).default([]),
  excludedDays: z.array(z.number().int().min(0).max(6)).default([]),
  preferAdjacentPeriods: z.boolean().default(false),
  minPeriodsPerDay: z.union([z.number().int().min(1).max(20), z.nan()]).optional(),
  maxPeriodsPerDay: z.union([z.number().int().min(1).max(20), z.nan()]).optional(),
  preferredPeriodRange: rangeSchema.optional(),
  excludedPeriodRange: rangeSchema.optional(),
});

const assignmentSchema = z.object({
  subjectId: z.string().min(1, 'Subject is required'),
  teacherId: z.string().optional(), // empty string = unassigned
  assistantTeacherId: z.string().optional(),
  weightage: z.number().int().min(1, 'At least 1 period required'),
  electiveGroupId: z.string().optional(),
  schedulingPreferences: schedulingPrefsSchema,
});

const DEFAULT_PREFS = {
  constraintType: 'SOFT' as const,
  preferredDays: [] as number[],
  excludedDays: [] as number[],
  preferAdjacentPeriods: false,
  minPeriodsPerDay: undefined,
  maxPeriodsPerDay: undefined,
  preferredPeriodRange: undefined,
  excludedPeriodRange: undefined,
};

// Strip NaNs / empty ranges / defaults before sending to API so the backend
// only stores real preferences. Returns undefined if nothing meaningful is set.
function normalizePrefs(p: AssignmentFormValues['schedulingPreferences']) {
  if (!p) return undefined;
  const cleanNumber = (n: number | undefined): number | undefined =>
    typeof n === 'number' && !Number.isNaN(n) ? n : undefined;
  const cleanRange = (r: { min?: number; max?: number } | undefined) => {
    if (!r) return undefined;
    const min = cleanNumber(r.min);
    const max = cleanNumber(r.max);
    if (min === undefined && max === undefined) return undefined;
    if (min === undefined || max === undefined) return undefined;
    return { min, max };
  };
  const result: any = { constraintType: p.constraintType ?? 'SOFT' };
  if (p.preferredDays?.length) result.preferredDays = p.preferredDays;
  if (p.excludedDays?.length) result.excludedDays = p.excludedDays;
  if (p.preferAdjacentPeriods) result.preferAdjacentPeriods = true;
  const minDay = cleanNumber(p.minPeriodsPerDay as number | undefined);
  const maxDay = cleanNumber(p.maxPeriodsPerDay as number | undefined);
  if (minDay !== undefined) result.minPeriodsPerDay = minDay;
  if (maxDay !== undefined) result.maxPeriodsPerDay = maxDay;
  const pr = cleanRange(p.preferredPeriodRange);
  const er = cleanRange(p.excludedPeriodRange);
  if (pr) result.preferredPeriodRange = pr;
  if (er) result.excludedPeriodRange = er;
  // If ONLY constraintType was kept (nothing else), we still send it because
  // it is a legitimate selection; backend persists as a flag.
  return result;
}

type AssignmentFormValues = z.infer<typeof assignmentSchema>;

export function Component() {
  const { t } = useTranslation('assignments');
  const { classId, divisionId } = useParams<{ classId: string; divisionId: string }>();
  const navigate = useNavigate();
  const isReadOnly = useReadOnly();

  const { data: classItem } = useGetClassQuery(classId!, { skip: !classId });
  const { data: assignments, isLoading } = useGetAssignmentsQuery(divisionId!, { skip: !divisionId });
  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });
  const { data: teachersData } = useGetTeachersQuery({ pageSize: 200 });
  const { data: teacherLoads } = useGetTeachersLoadQuery();
  const { data: electiveGroups } = useGetElectiveGroupsQuery();

  const [createAssignment, { isLoading: isCreating }] = useCreateAssignmentMutation();
  const [createElectiveAssignment, { isLoading: isCreatingElective }] = useCreateElectiveAssignmentMutation();
  const [updateAssignment, { isLoading: isUpdating }] = useUpdateAssignmentMutation();
  const [deleteAssignment, { isLoading: isDeleting }] = useDeleteAssignmentMutation();

  // Unified elective editor modal
  const { data: groupedElectives } = useGetGroupedElectiveGroupsQuery();
  const [electiveModalTarget, setElectiveModalTarget] = useState<GroupedElectiveGroup | null>(null);
  const [electiveModalCreateOpen, setElectiveModalCreateOpen] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  const subjects = subjectsData?.data ?? [];
  const teachers = teachersData?.data ?? [];
  const division = classItem?.divisions?.find((d) => d.id === divisionId);

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      subjectId: '',
      teacherId: '',
      assistantTeacherId: '',
      weightage: 1,
      electiveGroupId: '',
      schedulingPreferences: DEFAULT_PREFS,
    },
  });

  const watchedSubjectId = form.watch('subjectId');
  const watchedElectiveGroupId = form.watch('electiveGroupId');

  // The effective elective group ID for the current dialog session.
  // In edit mode, derived from editTarget; in create mode, from the form field.
  const effectiveElectiveGroupId = editTarget?.electiveGroupId ?? watchedElectiveGroupId ?? '';
  const effectiveSubjectId = editTarget?.subjectId ?? watchedSubjectId ?? '';

  // The currently selected/active elective group object
  const activeElectiveGroup = (() => {
    if (!effectiveElectiveGroupId || !electiveGroups) return null;
    return electiveGroups.find((g) => g.id === effectiveElectiveGroupId) ?? null;
  })();

  // The current elective group subject (for parallelSections)
  const activeGroupSubject = (() => {
    if (!activeElectiveGroup || !effectiveSubjectId) return null;
    return activeElectiveGroup.subjects.find((s) => s.subjectId === effectiveSubjectId) ?? null;
  })();

  // Compute allocation status for the active (group, subject) combination
  const allocationStatus = (() => {
    if (!activeElectiveGroup || !activeGroupSubject || !assignments) return null;
    const required = activeGroupSubject.parallelSections * activeElectiveGroup.periodsPerWeek;
    const existingAssignments = assignments.filter(
      (a) => a.electiveGroupId === activeElectiveGroup.id && a.subjectId === activeGroupSubject.subjectId && a.id !== editTarget?.id,
    );
    const allocated = existingAssignments.reduce((sum, a) => sum + a.weightage, 0);
    return { required, allocated, remaining: Math.max(0, required - allocated) };
  })();

  // Auto-fill weightage with remaining hours when an elective group is selected
  // (only on create flow, not edit, and only when current weightage is 1 = default)
  useEffect(() => {
    if (!editTarget && allocationStatus && form.getValues('weightage') === 1 && allocationStatus.remaining > 0) {
      form.setValue('weightage', allocationStatus.remaining);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedElectiveGroupId, watchedSubjectId]);

  // Total = sum of non-elective weightages + sum of periodsPerWeek for each
  // unique elective group. Each elective group represents a fixed time block
  // that students attend once (regardless of how many sections/teachers are
  // configured within it).
  const totalWeightage = (() => {
    const list = assignments ?? [];
    let nonElectiveSum = 0;
    const groupPeriods = new Map<string, number>();
    for (const a of list) {
      if (a.electiveGroupId) {
        if (!groupPeriods.has(a.electiveGroupId)) {
          groupPeriods.set(a.electiveGroupId, a.electiveGroup?.periodsPerWeek ?? a.weightage);
        }
      } else {
        nonElectiveSum += a.weightage;
      }
    }
    let electiveSum = 0;
    for (const v of groupPeriods.values()) electiveSum += v;
    return nonElectiveSum + electiveSum;
  })();

  const handleCreate = async (values: AssignmentFormValues) => {
    if (!divisionId) return;
    try {
      const prefs = normalizePrefs(values.schedulingPreferences);
      if (values.electiveGroupId) {
        await createElectiveAssignment({
          divisionId,
          electiveGroupId: values.electiveGroupId,
          subjectId: values.subjectId,
          teacherId: values.teacherId || null,
          assistantTeacherId: values.assistantTeacherId || null,
          weightage: values.weightage,
          schedulingPreferences: prefs,
        }).unwrap();
      } else {
        await createAssignment({
          divisionId,
          subjectId: values.subjectId,
          teacherId: values.teacherId || null,
          assistantTeacherId: values.assistantTeacherId || null,
          weightage: values.weightage,
          schedulingPreferences: prefs,
        }).unwrap();
      }
      toast.success(t('createSuccess'));
      setFormOpen(false);
      form.reset();
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('createError'));
    }
  };

  const handleEdit = async (values: AssignmentFormValues) => {
    if (!editTarget) return;
    try {
      await updateAssignment({
        id: editTarget.id,
        teacherId: values.teacherId || null,
        assistantTeacherId: values.assistantTeacherId || null,
        weightage: values.weightage,
        schedulingPreferences: normalizePrefs(values.schedulingPreferences) ?? null,
      }).unwrap();
      toast.success(t('updateSuccess'));
      setEditTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('updateError'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !divisionId) return;
    try {
      await deleteAssignment({ id: deleteTarget.id, divisionId }).unwrap();
      toast.success(t('deleteSuccess'));
      setDeleteTarget(null);
    } catch {
      toast.error(t('deleteError'));
    }
  };

  const openEditForm = (assignment: Assignment) => {
    const savedPrefs = assignment.schedulingPreferences ?? null;
    form.reset({
      subjectId: assignment.subjectId,
      teacherId: assignment.teacherId ?? '',
      assistantTeacherId: assignment.assistantTeacherId ?? '',
      weightage: assignment.weightage,
      electiveGroupId: assignment.electiveGroupId ?? '',
      schedulingPreferences: {
        constraintType: savedPrefs?.constraintType ?? 'SOFT',
        preferredDays: savedPrefs?.preferredDays ?? [],
        excludedDays: savedPrefs?.excludedDays ?? [],
        preferAdjacentPeriods: savedPrefs?.preferAdjacentPeriods ?? false,
        minPeriodsPerDay: savedPrefs?.minPeriodsPerDay,
        maxPeriodsPerDay: savedPrefs?.maxPeriodsPerDay,
        preferredPeriodRange: savedPrefs?.preferredPeriodRange,
        excludedPeriodRange: savedPrefs?.excludedPeriodRange,
      },
    });
    setEditTarget(assignment);
  };

  const divisionLabel = division
    ? `${classItem?.name ?? ''} -- Division ${division.label}${division.streamName ? ` (${division.streamName})` : ''}`
    : '';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={divisionLabel}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/classes/${classId}`)}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            {!isReadOnly && (
              <Button onClick={() => { form.reset({ subjectId: '', teacherId: '', assistantTeacherId: '', weightage: 1, electiveGroupId: '', schedulingPreferences: DEFAULT_PREFS }); setFormOpen(true); }}>
                <Plus className="size-4" />
                {t('addAssignment')}
              </Button>
            )}
          </div>
        }
      />

      {/* Total bar */}
      <div className="flex items-center justify-between rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-5 py-3">
        <span className="text-sm font-medium">
          {t('totalBar.total')}: <span className="text-lg font-bold tabular-nums">{totalWeightage}</span> {t('totalBar.periods')}
        </span>
        <Badge variant={totalWeightage > 0 ? 'success' : 'outline'} className="text-xs">
          {totalWeightage > 0 ? t('totalBar.balanced') : '--'}
        </Badge>
      </div>

      {/* Assignments list */}
      {(!assignments || assignments.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-600 mb-4">
            <FileText className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">{t('empty.description')}</p>
          {!isReadOnly && (
            <Button className="mt-4" onClick={() => { form.reset(); setFormOpen(true); }}>
              <Plus className="size-4" />
              {t('addAssignment')}
            </Button>
          )}
        </div>
      )}

      {assignments && assignments.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white/90">
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">{t('table.subject')}</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">{t('table.teacher')}</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">{t('table.assistant')}</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium">{t('table.weightage')}</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium w-20">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((assignment, idx) => (
                <tr
                  key={assignment.id}
                  className={`border-b border-border/40 transition-[background-color] duration-300 ease-in-out hover:bg-sidebar/10 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{assignment.subject.name}</Badge>
                      {assignment.electiveGroup && (
                        <Badge
                          variant="outline"
                          className="text-[10px] cursor-pointer hover:bg-amber-100 transition-colors"
                          onClick={() => {
                            const match = groupedElectives?.find(g =>
                              g.underlyingGroupIds.includes(assignment.electiveGroupId!)
                            );
                            if (match) setElectiveModalTarget(match);
                          }}
                        >
                          <Pencil className="size-2.5 mr-1" />
                          Elective: {assignment.electiveGroup.name}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{assignment.teacher?.name ?? <span className="italic text-muted-foreground">(Unassigned)</span>}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {assignment.assistantTeacher?.name ?? '--'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center size-8 rounded-lg bg-amber-500/10 text-amber-700 font-bold text-sm">
                      {assignment.weightage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {!isReadOnly && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              if (assignment.electiveGroupId) {
                                const match = groupedElectives?.find(g =>
                                  g.underlyingGroupIds.includes(assignment.electiveGroupId!)
                                );
                                if (match) setElectiveModalTarget(match);
                              } else {
                                openEditForm(assignment);
                              }
                            }}
                            title="Edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(assignment)} title="Delete">
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Footer total */}
          <div className="flex items-center justify-between bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white px-4 py-2.5">
            <span className="text-xs text-white/60">{assignments.length} assignment(s)</span>
            <span className="text-xs font-medium">
              {t('totalBar.total')}: {totalWeightage} {t('totalBar.periods')}
            </span>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog
        open={formOpen || !!editTarget}
        onOpenChange={(open) => {
          if (!open) { setFormOpen(false); setEditTarget(null); }
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? t('form.editTitle') : t('form.createTitle')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit(editTarget ? handleEdit : handleCreate)}
            className="space-y-4"
          >
            {/* Elective shortcut -- only on create */}
            {!editTarget && (
              <div className="rounded-lg border border-dashed border-amber-400 bg-amber-50/50 p-2.5 flex items-center justify-between">
                <span className="text-xs text-amber-800">For elective subjects, use the Elective Groups editor.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 border-amber-400 text-amber-800 hover:bg-amber-100"
                  onClick={() => {
                    setFormOpen(false);
                    setElectiveModalCreateOpen(true);
                  }}
                >
                  <Plus className="size-3 mr-1" /> Create Elective
                </Button>
              </div>
            )}

            {/* Subject -- only on create */}
            {!editTarget && (
              <div className="space-y-2">
                <Label>{t('form.subject')}</Label>
                <Select
                  value={form.watch('subjectId')}
                  onValueChange={(v) => { form.setValue('subjectId', v); form.setValue('teacherId', ''); }}
                >
                  <SelectTrigger><SelectValue placeholder={t('form.subjectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.subjectId && (
                  <p className="text-sm text-destructive">{form.formState.errors.subjectId.message}</p>
                )}
              </div>
            )}

            {/* Teacher -- filtered by selected subject's qualified teachers */}
            {(() => {
              const selectedSubjectId = form.watch('subjectId');
              const qualifiedTeachers = selectedSubjectId
                ? teachers.filter((t) =>
                    t.teacherSubjects?.some((ts) => ts.subjectId === selectedSubjectId)
                  )
                : teachers;
              const selectedTeacherId = form.watch('teacherId');

              return (
                <>
                  <div className="space-y-2">
                    <Label>
                      {t('form.teacher')} <span className="text-xs text-muted-foreground">(Optional)</span>
                    </Label>
                    {selectedSubjectId && qualifiedTeachers.length === 0 && (
                      <p className="text-xs text-amber-600">No teachers qualified for this subject.</p>
                    )}
                    <Select
                      value={selectedTeacherId || '_unassigned'}
                      onValueChange={(v) => form.setValue('teacherId', v === '_unassigned' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder={t('form.teacherPlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_unassigned">
                          <span className="italic text-muted-foreground">(Unassigned -- assign later)</span>
                        </SelectItem>
                        {(qualifiedTeachers.length > 0 ? qualifiedTeachers : teachers).map((tch) => {
                          const load = teacherLoads?.find((l) => l.id === tch.id);
                          const assigned = load?.assignedPeriods ?? 0;
                          const max = load?.maxPeriodsPerWeek;
                          const unqualified = qualifiedTeachers.length > 0 && !qualifiedTeachers.find((q) => q.id === tch.id);
                          const over = max != null && assigned > max;
                          return (
                            <SelectItem key={tch.id} value={tch.id}>
                              <span className="flex items-center gap-2">
                                <span>{tch.name}</span>
                                <span className={`text-[10px] ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  · {assigned}{max != null ? `/${max}` : ''} pds/wk
                                </span>
                                {unqualified && <span className="text-[10px] text-amber-600">(unqualified)</span>}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.teacherId && (
                      <p className="text-sm text-destructive">{form.formState.errors.teacherId.message}</p>
                    )}
                  </div>

                  {/* Assistant Teacher -- excludes primary teacher */}
                  <div className="space-y-2">
                    <Label>{t('form.assistantTeacher')}</Label>
                    <Select
                      value={form.watch('assistantTeacherId') || '_none'}
                      onValueChange={(v) => form.setValue('assistantTeacherId', v === '_none' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue placeholder={t('form.assistantPlaceholder')} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {teachers
                          .filter((t) => t.id !== selectedTeacherId)
                          .map((tch) => {
                            const load = teacherLoads?.find((l) => l.id === tch.id);
                            const assigned = load?.assignedPeriods ?? 0;
                            const max = load?.maxPeriodsPerWeek;
                            const over = max != null && assigned > max;
                            return (
                              <SelectItem key={tch.id} value={tch.id}>
                                <span className="flex items-center gap-2">
                                  <span>{tch.name}</span>
                                  <span className={`text-[10px] ${over ? 'text-destructive' : 'text-muted-foreground'}`}>
                                    · {assigned}{max != null ? `/${max}` : ''} pds/wk
                                  </span>
                                </span>
                              </SelectItem>
                            );
                          })}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              );
            })()}

            {/* Weightage */}
            <div className="space-y-2">
              <Label>{t('form.weightage')}</Label>
              <Input
                type="number"
                min={1}
                placeholder={t('form.weightagePlaceholder')}
                {...form.register('weightage', { valueAsNumber: true })}
              />
              {form.formState.errors.weightage && (
                <p className="text-sm text-destructive">{form.formState.errors.weightage.message}</p>
              )}
            </div>

            <Separator />

            {/* Scheduling Preferences -- collapsible, fully wired to form */}
            <SchedulingPreferencesSection form={form} />
            <p className="text-[10px] text-muted-foreground">Preferences are applied during timetable generation. They do not affect existing timetables.</p>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setFormOpen(false); setEditTarget(null); }}
                disabled={isCreating || isCreatingElective || isUpdating}
              >
                {t('form.cancel')}
              </Button>
              <Button
                type="submit"
                loading={isCreating || isCreatingElective || isUpdating}
                disabled={isCreating || isCreatingElective || isUpdating}
              >
                {(isCreating || isCreatingElective || isUpdating) ? t('form.saving') : t('form.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteConfirm.title')}
        description={t('deleteConfirm.description', { subject: deleteTarget?.subject?.name ?? '' })}
        confirmLabel={t('deleteConfirm.confirm')}
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Unified elective editor modal -- edit (from badge click) */}
      <ElectiveGroupEditorModal
        open={!!electiveModalTarget}
        onOpenChange={(open) => { if (!open) setElectiveModalTarget(null); }}
        initialData={electiveModalTarget}
      />

      {/* Unified elective editor modal -- create (from "Create Elective" button) */}
      <ElectiveGroupEditorModal
        open={electiveModalCreateOpen}
        onOpenChange={setElectiveModalCreateOpen}
        initialData={null}
      />
    </div>
  );
}

// ── Scheduling Preferences subform ──
// Wires the (previously dead) UI block to react-hook-form. Backend persists
// schedulingPreferences as JSONB on DivisionAssignment; the GA engine (Phase 2)
// will consume them.

const DAY_CHIPS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SchedulingPreferencesSection({
  form,
}: {
  form: ReturnType<typeof useForm<AssignmentFormValues>>;
}) {
  const prefs = form.watch('schedulingPreferences') ?? DEFAULT_PREFS;

  const toggleDay = (kind: 'preferredDays' | 'excludedDays', day: number) => {
    const current = (prefs[kind] ?? []) as number[];
    const has = current.includes(day);
    const next = has ? current.filter((d) => d !== day) : [...current, day].sort();
    form.setValue(`schedulingPreferences.${kind}`, next, { shouldDirty: true });
    // Mutual exclusion: a day cannot be in both lists.
    const other = kind === 'preferredDays' ? 'excludedDays' : 'preferredDays';
    const otherList = (prefs[other] ?? []) as number[];
    if (!has && otherList.includes(day)) {
      form.setValue(
        `schedulingPreferences.${other}`,
        otherList.filter((d) => d !== day),
        { shouldDirty: true },
      );
    }
  };

  const setNum = (path: string, v: string) => {
    const n = v === '' ? undefined : Number(v);
    form.setValue(path as any, n as any, { shouldDirty: true });
  };

  const setRangeNum = (
    kind: 'preferredPeriodRange' | 'excludedPeriodRange',
    field: 'min' | 'max',
    v: string,
  ) => {
    const existing = prefs[kind] ?? {};
    const n = v === '' ? undefined : Number(v);
    form.setValue(
      `schedulingPreferences.${kind}` as any,
      { ...existing, [field]: n } as any,
      { shouldDirty: true },
    );
  };

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground text-xs" type="button">
          <span className="flex items-center gap-2">
            <Settings2 className="size-3.5" />
            Scheduling Preferences (Optional)
          </span>
          <ChevronDown className="size-3.5" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-xs">Constraint Type</Label>
            <p className="text-[10px] text-muted-foreground">Hard = must be respected, Soft = best effort</p>
          </div>
          <Select
            value={prefs.constraintType ?? 'SOFT'}
            onValueChange={(v) =>
              form.setValue('schedulingPreferences.constraintType', v as 'HARD' | 'SOFT', { shouldDirty: true })
            }
          >
            <SelectTrigger className="w-24 h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SOFT" className="text-xs">Soft</SelectItem>
              <SelectItem value="HARD" className="text-xs">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Preferred Days */}
        <div className="space-y-1.5">
          <Label className="text-xs">Preferred Days</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_CHIPS.map((day, i) => {
              const checked = (prefs.preferredDays ?? []).includes(i);
              return (
                <label
                  key={day}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] cursor-pointer transition-colors ${
                    checked
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700'
                      : 'border-border/60 hover:bg-emerald-500/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-3 accent-emerald-500"
                    checked={checked}
                    onChange={() => toggleDay('preferredDays', i)}
                  />
                  {day}
                </label>
              );
            })}
          </div>
        </div>

        {/* Excluded Days */}
        <div className="space-y-1.5">
          <Label className="text-xs">Excluded Days</Label>
          <div className="flex flex-wrap gap-1.5">
            {DAY_CHIPS.map((day, i) => {
              const checked = (prefs.excludedDays ?? []).includes(i);
              return (
                <label
                  key={day}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] cursor-pointer transition-colors ${
                    checked
                      ? 'bg-destructive/15 border-destructive/40 text-destructive'
                      : 'border-border/60 hover:bg-destructive/10'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="size-3 accent-red-500"
                    checked={checked}
                    onChange={() => toggleDay('excludedDays', i)}
                  />
                  {day}
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs">Prefer Adjacent Periods</Label>
          <Switch
            checked={prefs.preferAdjacentPeriods ?? false}
            onCheckedChange={(v) =>
              form.setValue('schedulingPreferences.preferAdjacentPeriods', v, { shouldDirty: true })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Min Periods/Day</Label>
            <Input
              type="number"
              min={1}
              className="h-7 text-xs"
              placeholder="--"
              value={prefs.minPeriodsPerDay ?? ''}
              onChange={(e) => setNum('schedulingPreferences.minPeriodsPerDay', e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max Periods/Day</Label>
            <Input
              type="number"
              min={1}
              className="h-7 text-xs"
              placeholder="--"
              value={prefs.maxPeriodsPerDay ?? ''}
              onChange={(e) => setNum('schedulingPreferences.maxPeriodsPerDay', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Preferred Period Range</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                className="h-7 text-xs"
                placeholder="Min"
                value={prefs.preferredPeriodRange?.min ?? ''}
                onChange={(e) => setRangeNum('preferredPeriodRange', 'min', e.target.value)}
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                min={1}
                className="h-7 text-xs"
                placeholder="Max"
                value={prefs.preferredPeriodRange?.max ?? ''}
                onChange={(e) => setRangeNum('preferredPeriodRange', 'max', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Excluded Period Range</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={1}
                className="h-7 text-xs"
                placeholder="Min"
                value={prefs.excludedPeriodRange?.min ?? ''}
                onChange={(e) => setRangeNum('excludedPeriodRange', 'min', e.target.value)}
              />
              <span className="text-xs text-muted-foreground">–</span>
              <Input
                type="number"
                min={1}
                className="h-7 text-xs"
                placeholder="Max"
                value={prefs.excludedPeriodRange?.max ?? ''}
                onChange={(e) => setRangeNum('excludedPeriodRange', 'max', e.target.value)}
              />
            </div>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
