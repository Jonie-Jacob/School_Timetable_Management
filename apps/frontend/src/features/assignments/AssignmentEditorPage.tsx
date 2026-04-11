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
import { useGetTeachersQuery } from '@/features/teachers/teacherApi';
import {
  useGetElectiveGroupsQuery,
  useUpdateElectiveGroupMutation,
  useUpdateElectiveSubjectMutation,
} from '@/features/elective-groups/electiveGroupApi';
import {
  useGetAssignmentsQuery,
  useCreateAssignmentMutation,
  useCreateElectiveAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
  type Assignment,
} from './assignmentApi';

const assignmentSchema = z.object({
  subjectId: z.string().min(1, 'Subject is required'),
  teacherId: z.string().optional(), // empty string = unassigned
  assistantTeacherId: z.string().optional(),
  weightage: z.number().int().min(1, 'At least 1 period required'),
  electiveGroupId: z.string().optional(),
});

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
  const { data: electiveGroups } = useGetElectiveGroupsQuery();

  const [createAssignment, { isLoading: isCreating }] = useCreateAssignmentMutation();
  const [createElectiveAssignment, { isLoading: isCreatingElective }] = useCreateElectiveAssignmentMutation();
  const [updateAssignment] = useUpdateAssignmentMutation();
  const [deleteAssignment, { isLoading: isDeleting }] = useDeleteAssignmentMutation();
  const [updateElectiveGroupMutation, { isLoading: isUpdatingGroup }] = useUpdateElectiveGroupMutation();
  const [updateElectiveSubjectMutation, { isLoading: isUpdatingSubject }] = useUpdateElectiveSubjectMutation();

  // Inline elective group edit state
  const [electiveEditOpen, setElectiveEditOpen] = useState(false);
  const [electiveEditPeriods, setElectiveEditPeriods] = useState(0);
  const [electiveEditSections, setElectiveEditSections] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Assignment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);

  const subjects = subjectsData?.data ?? [];
  const teachers = teachersData?.data ?? [];
  const division = classItem?.divisions?.find((d) => d.id === divisionId);

  const form = useForm<AssignmentFormValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: { subjectId: '', teacherId: '', assistantTeacherId: '', weightage: 1, electiveGroupId: '' },
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
      if (values.electiveGroupId) {
        await createElectiveAssignment({
          divisionId,
          electiveGroupId: values.electiveGroupId,
          subjectId: values.subjectId,
          teacherId: values.teacherId || null,
          assistantTeacherId: values.assistantTeacherId || null,
          weightage: values.weightage,
        }).unwrap();
      } else {
        await createAssignment({
          divisionId,
          subjectId: values.subjectId,
          teacherId: values.teacherId || null,
          assistantTeacherId: values.assistantTeacherId || null,
          weightage: values.weightage,
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
    form.reset({
      subjectId: assignment.subjectId,
      teacherId: assignment.teacherId ?? '',
      assistantTeacherId: assignment.assistantTeacherId ?? '',
      weightage: assignment.weightage,
      electiveGroupId: assignment.electiveGroupId ?? '',
    });
    setElectiveEditOpen(false);
    setEditTarget(assignment);
  };

  const openElectiveEditor = () => {
    if (!activeElectiveGroup || !activeGroupSubject) return;
    setElectiveEditPeriods(activeElectiveGroup.periodsPerWeek);
    setElectiveEditSections(activeGroupSubject.parallelSections);
    setElectiveEditOpen(true);
  };

  const handleSaveElectiveSettings = async () => {
    if (!activeElectiveGroup || !activeGroupSubject) return;
    const periodsChanged = electiveEditPeriods !== activeElectiveGroup.periodsPerWeek;
    const sectionsChanged = electiveEditSections !== activeGroupSubject.parallelSections;
    if (!periodsChanged && !sectionsChanged) {
      setElectiveEditOpen(false);
      return;
    }
    try {
      if (periodsChanged) {
        await updateElectiveGroupMutation({
          id: activeElectiveGroup.id,
          periodsPerWeek: electiveEditPeriods,
        }).unwrap();
      }
      if (sectionsChanged) {
        await updateElectiveSubjectMutation({
          groupId: activeElectiveGroup.id,
          subjectId: activeGroupSubject.subjectId,
          parallelSections: electiveEditSections,
        }).unwrap();
      }
      toast.success('Elective group updated.');
      setElectiveEditOpen(false);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to update elective group.');
    }
  };

  const divisionLabel = division
    ? `${classItem?.name ?? ''} — Division ${division.label}${division.streamName ? ` (${division.streamName})` : ''}`
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
              <Button onClick={() => { form.reset({ subjectId: '', teacherId: '', assistantTeacherId: '', weightage: 1, electiveGroupId: '' }); setFormOpen(true); }}>
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
          {totalWeightage > 0 ? t('totalBar.balanced') : '—'}
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
                        <Badge variant="outline" className="text-[10px]">Elective: {assignment.electiveGroup.name}</Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{assignment.teacher?.name ?? <span className="italic text-muted-foreground">(Unassigned)</span>}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {assignment.assistantTeacher?.name ?? '—'}
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
                          <Button variant="ghost" size="icon-xs" onClick={() => openEditForm(assignment)} title="Edit">
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
            {/* Elective Group — only on create, optional */}
            {!editTarget && electiveGroups && electiveGroups.length > 0 && (
              <div className="space-y-2">
                <Label>Elective Group <span className="text-xs text-muted-foreground font-normal">(Optional)</span></Label>
                <Select
                  value={form.watch('electiveGroupId') || '_none'}
                  onValueChange={(v) => {
                    const next = v === '_none' ? '' : v;
                    form.setValue('electiveGroupId', next);
                    // Reset subject and teacher when changing group
                    form.setValue('subjectId', '');
                    form.setValue('teacherId', '');
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Not part of an elective" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Not part of an elective</SelectItem>
                    {electiveGroups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name} ({g.periodsPerWeek} periods/week)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Select an elective group to filter subjects to those in the group, or leave empty for a regular subject.
                </p>
              </div>
            )}

            {/* Subject — only on create */}
            {!editTarget && (() => {
              // If an elective group is selected, restrict subjects to those in the group
              const selectedGroupId = form.watch('electiveGroupId');
              const selectedGroup = selectedGroupId
                ? electiveGroups?.find((g) => g.id === selectedGroupId)
                : null;
              const subjectOptions = selectedGroup
                ? subjects.filter((s) => selectedGroup.subjects.some((es) => es.subjectId === s.id))
                : subjects;
              return (
                <div className="space-y-2">
                  <Label>{t('form.subject')}</Label>
                  <Select
                    value={form.watch('subjectId')}
                    onValueChange={(v) => { form.setValue('subjectId', v); form.setValue('teacherId', ''); }}
                  >
                    <SelectTrigger><SelectValue placeholder={selectedGroup ? `Select subject from ${selectedGroup.name}` : t('form.subjectPlaceholder')} /></SelectTrigger>
                    <SelectContent>
                      {subjectOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                      {subjectOptions.length === 0 && selectedGroup && (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No subjects in this elective group yet.</div>
                      )}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.subjectId && (
                    <p className="text-sm text-destructive">{form.formState.errors.subjectId.message}</p>
                  )}
                </div>
              );
            })()}

            {/* Teacher — filtered by selected subject's qualified teachers */}
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
                          <span className="italic text-muted-foreground">(Unassigned — assign later)</span>
                        </SelectItem>
                        {(qualifiedTeachers.length > 0 ? qualifiedTeachers : teachers).map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                            {qualifiedTeachers.length > 0 && !qualifiedTeachers.find((q) => q.id === t.id) && ' (unqualified)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.teacherId && (
                      <p className="text-sm text-destructive">{form.formState.errors.teacherId.message}</p>
                    )}
                  </div>

                  {/* Assistant Teacher — excludes primary teacher */}
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
                          .map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              );
            })()}

            {/* Allocation status — shown when an elective group is selected */}
            {allocationStatus && activeElectiveGroup && activeGroupSubject && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                    Elective allocation — {activeElectiveGroup.name}
                  </p>
                  {!electiveEditOpen && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={openElectiveEditor}
                      title="Edit elective settings"
                    >
                      <Pencil className="size-3" />
                    </Button>
                  )}
                </div>

                {!electiveEditOpen ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Periods/week × Sections:
                      </span>
                      <span className="font-medium tabular-nums">
                        {activeElectiveGroup.periodsPerWeek} × {activeGroupSubject.parallelSections}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Required:</span>
                      <span className="font-bold tabular-nums">{allocationStatus.required} hrs</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Already allocated:</span>
                      <span className="font-bold tabular-nums">{allocationStatus.allocated} hrs</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Remaining:</span>
                      <span className={`font-bold tabular-nums ${allocationStatus.remaining === 0 ? 'text-green-600' : 'text-amber-700'}`}>
                        {allocationStatus.remaining} hrs
                      </span>
                    </div>
                    {allocationStatus.remaining === 0 && (
                      <p className="text-[10px] text-green-700">Fully allocated for this subject.</p>
                    )}
                  </>
                ) : (
                  <div className="space-y-2 pt-1 border-t border-amber-500/20">
                    <p className="text-[10px] text-muted-foreground">
                      Changing these affects all divisions using this elective group.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Periods/week (group)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={electiveEditPeriods}
                          onChange={(e) => setElectiveEditPeriods(Math.max(1, parseInt(e.target.value) || 1))}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">Parallel sections (subject)</Label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={electiveEditSections}
                          onChange={(e) => setElectiveEditSections(Math.max(1, parseInt(e.target.value) || 1))}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      New required: <span className="font-bold">{electiveEditPeriods * electiveEditSections} hrs</span>
                    </p>
                    <div className="flex items-center justify-end gap-1 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={() => setElectiveEditOpen(false)}
                        disabled={isUpdatingGroup || isUpdatingSubject}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-6 text-[10px] px-2"
                        onClick={handleSaveElectiveSettings}
                        disabled={isUpdatingGroup || isUpdatingSubject}
                      >
                        {(isUpdatingGroup || isUpdatingSubject) ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Weightage */}
            <div className="space-y-2">
              <Label>{t('form.weightage')}</Label>
              <Input
                type="number"
                min={1}
                placeholder={
                  allocationStatus
                    ? `Up to ${allocationStatus.remaining} hrs remaining`
                    : t('form.weightagePlaceholder')
                }
                {...form.register('weightage', { valueAsNumber: true })}
              />
              {allocationStatus && (
                <p className="text-[10px] text-muted-foreground">
                  Max {allocationStatus.remaining} hrs available for this teacher (or edit the elective settings above to change the required total).
                </p>
              )}
              {form.formState.errors.weightage && (
                <p className="text-sm text-destructive">{form.formState.errors.weightage.message}</p>
              )}
            </div>

            <Separator />

            {/* Scheduling Preferences — collapsible */}
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
                  <Select defaultValue="SOFT">
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
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <label key={day} className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] cursor-pointer hover:bg-emerald-500/10 has-[:checked]:bg-emerald-500/15 has-[:checked]:border-emerald-500/40 has-[:checked]:text-emerald-700 transition-colors">
                        <input type="checkbox" value={i} className="size-3 accent-emerald-500" />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Excluded Days */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Excluded Days</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <label key={day} className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] cursor-pointer hover:bg-destructive/10 has-[:checked]:bg-destructive/15 has-[:checked]:border-destructive/40 has-[:checked]:text-destructive transition-colors">
                        <input type="checkbox" value={i} className="size-3 accent-red-500" />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs">Prefer Adjacent Periods</Label>
                  <Switch />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Min Periods/Day</Label>
                    <Input type="number" min={1} className="h-7 text-xs" placeholder="—" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Max Periods/Day</Label>
                    <Input type="number" min={1} className="h-7 text-xs" placeholder="—" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Preferred Period Range</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={1} className="h-7 text-xs" placeholder="Min" />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input type="number" min={1} className="h-7 text-xs" placeholder="Max" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Excluded Period Range</Label>
                    <div className="flex items-center gap-1">
                      <Input type="number" min={1} className="h-7 text-xs" placeholder="Min" />
                      <span className="text-xs text-muted-foreground">–</span>
                      <Input type="number" min={1} className="h-7 text-xs" placeholder="Max" />
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">Preferences are applied during timetable generation. They do not affect existing timetables.</p>
              </CollapsibleContent>
            </Collapsible>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setFormOpen(false); setEditTarget(null); }}
                disabled={isCreating || isCreatingElective}
              >
                {t('form.cancel')}
              </Button>
              <Button type="submit" disabled={isCreating || isCreatingElective}>
                {(isCreating || isCreatingElective) ? t('form.saving') : t('form.save')}
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
    </div>
  );
}
