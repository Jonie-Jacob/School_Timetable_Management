import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Link2, Trash2, X, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';
import {
  useGetElectiveGroupsQuery,
  useCreateElectiveGroupMutation,
  useUpdateElectiveGroupMutation,
  useDeleteElectiveGroupMutation,
  useAddElectiveSubjectMutation,
  useUpdateElectiveSubjectMutation,
  useRemoveElectiveSubjectMutation,
  type ElectiveGroup,
} from './electiveGroupApi';

const groupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  periodsPerWeek: z.number().int().min(1, 'Must be at least 1').max(50),
});

type GroupFormValues = z.infer<typeof groupSchema>;

export function Component() {
  const { t } = useTranslation();
  const isReadOnly = useReadOnly();

  const { data: groups, isLoading } = useGetElectiveGroupsQuery();
  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });
  const [createGroup, { isLoading: isCreating }] = useCreateElectiveGroupMutation();
  const [deleteGroup, { isLoading: isDeleting }] = useDeleteElectiveGroupMutation();
  const [addSubject] = useAddElectiveSubjectMutation();
  const [updateElectiveSubject] = useUpdateElectiveSubjectMutation();
  const [removeSubject] = useRemoveElectiveSubjectMutation();
  const [updateGroup] = useUpdateElectiveGroupMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ElectiveGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ElectiveGroup | null>(null);
  const [addSubjectTarget, setAddSubjectTarget] = useState<ElectiveGroup | null>(null);
  // Map of subjectId -> { selected, parallelSections }
  const [selectedSubjects, setSelectedSubjects] = useState<Record<string, number>>({});
  const [createSubjects, setCreateSubjects] = useState<Record<string, number>>({});
  const [editSubjects, setEditSubjects] = useState<Record<string, number>>({});

  const allSubjects = subjectsData?.data ?? [];

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: { name: '', periodsPerWeek: 1 },
  });

  // For the "add subjects" dialog, filter out subjects already in the group
  const availableSubjects = useMemo(() => {
    if (!addSubjectTarget) return allSubjects;
    const existingIds = new Set(
      (addSubjectTarget.subjects ?? []).map((egs) => egs.subjectId)
    );
    return allSubjects.filter((s) => !existingIds.has(s.id));
  }, [addSubjectTarget, allSubjects]);

  const handleCreate = async (values: GroupFormValues) => {
    try {
      const group = await createGroup(values).unwrap();
      // Add selected subjects with their parallelSections
      const entries = Object.entries(createSubjects);
      if (entries.length > 0) {
        for (const [subjectId, parallelSections] of entries) {
          try {
            await addSubject({ groupId: group.id, subjectId, parallelSections }).unwrap();
          } catch { /* skip duplicates */ }
        }
      }
      toast.success('Elective group created.');
      setFormOpen(false);
      setCreateSubjects({});
      form.reset();
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to create elective group.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteGroup(deleteTarget.id).unwrap();
      toast.success('Elective group deleted.');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to delete elective group.');
    }
  };

  const handleAddSubjects = async () => {
    if (!addSubjectTarget) return;
    const entries = Object.entries(selectedSubjects);
    if (entries.length === 0) return;
    let added = 0;
    for (const [subjectId, parallelSections] of entries) {
      try {
        await addSubject({ groupId: addSubjectTarget.id, subjectId, parallelSections }).unwrap();
        added++;
      } catch { /* skip duplicates */ }
    }
    if (added > 0) {
      toast.success(`${added} subject(s) added.`);
    } else {
      toast.info('All selected subjects were already in the group.');
    }
    setAddSubjectTarget(null);
    setSelectedSubjects({});
  };

  const handleEditGroup = async (values: GroupFormValues) => {
    if (!editTarget) return;
    try {
      // 1. Update group fields if changed
      const nameChanged = values.name !== editTarget.name;
      const periodsChanged = values.periodsPerWeek !== (editTarget.periodsPerWeek || 0);
      if (nameChanged || periodsChanged) {
        await updateGroup({ id: editTarget.id, name: values.name, periodsPerWeek: values.periodsPerWeek }).unwrap();
      }

      // 2. Diff subjects and apply add/remove/update
      const original = new Map<string, number>(
        (editTarget.subjects ?? []).map((s) => [s.subjectId, s.parallelSections]),
      );
      const next = editSubjects;
      const errors: string[] = [];

      // Removals
      for (const [subjectId] of original) {
        if (next[subjectId] === undefined) {
          try {
            await removeSubject({ groupId: editTarget.id, subjectId }).unwrap();
          } catch (err: any) {
            errors.push(err?.data?.error?.message || `Failed to remove subject`);
          }
        }
      }
      // Additions + updates
      for (const [subjectId, sections] of Object.entries(next)) {
        if (!original.has(subjectId)) {
          try {
            await addSubject({ groupId: editTarget.id, subjectId, parallelSections: sections }).unwrap();
          } catch (err: any) {
            errors.push(err?.data?.error?.message || `Failed to add subject`);
          }
        } else if (original.get(subjectId) !== sections) {
          try {
            await updateElectiveSubject({ groupId: editTarget.id, subjectId, parallelSections: sections }).unwrap();
          } catch (err: any) {
            errors.push(err?.data?.error?.message || `Failed to update sections`);
          }
        }
      }

      if (errors.length > 0) {
        toast.error(errors[0]);
      } else {
        toast.success('Group updated.');
        setEditTarget(null);
        setEditSubjects({});
      }
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to update group.');
    }
  };

  const toggleEditSubject = (id: string) => {
    setEditSubjects((prev) => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
  };

  const handleRemoveSubject = async (group: ElectiveGroup, subjectId: string) => {
    const subjectCount = group.subjects?.length ?? 0;
    if (subjectCount <= 2) {
      toast.warning('Elective groups require at least 2 subjects.');
      return;
    }
    try {
      await removeSubject({ groupId: group.id, subjectId }).unwrap();
      toast.success('Subject removed.');
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to remove subject.');
    }
  };

  const handleUpdateSections = async (groupId: string, subjectId: string, parallelSections: number) => {
    try {
      await updateElectiveSubject({ groupId, subjectId, parallelSections }).unwrap();
      toast.success('Parallel sections updated.');
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to update sections.');
    }
  };

  const toggleCreateSubject = (id: string) => {
    setCreateSubjects((prev) => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
  };

  const toggleSelectedSubject = (id: string) => {
    setSelectedSubjects((prev) => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elective Groups"
        description="Define elective groups, their block duration, and parallel sections per subject."
        actions={
          !isReadOnly ? (
            <Button onClick={() => { form.reset({ name: '', periodsPerWeek: 1 }); setCreateSubjects({}); setFormOpen(true); }}>
              <Plus className="size-4" />
              Add Elective Group
            </Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      )}

      {!isLoading && (!groups || groups.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 mb-4">
            <Link2 className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No elective groups yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">Create elective groups to co-schedule subjects for student parallel sessions.</p>
          {!isReadOnly && (
            <Button className="mt-4" onClick={() => { form.reset({ name: '', periodsPerWeek: 1 }); setCreateSubjects({}); setFormOpen(true); }}>
              <Plus className="size-4" />
              Add Elective Group
            </Button>
          )}
        </div>
      )}

      {!isLoading && groups && groups.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5 hover:border-amber-500/20">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{group.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {group.periodsPerWeek > 0 ? `${group.periodsPerWeek} period${group.periodsPerWeek === 1 ? '' : 's'}/week` : 'No duration set'}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!isReadOnly && (
                    <>
                      <Button variant="ghost" size="icon-xs" onClick={() => {
                        form.reset({ name: group.name, periodsPerWeek: group.periodsPerWeek || 1 });
                        const initial: Record<string, number> = {};
                        for (const egs of group.subjects ?? []) initial[egs.subjectId] = egs.parallelSections;
                        setEditSubjects(initial);
                        setEditTarget(group);
                      }} title="Edit group">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => { setAddSubjectTarget(group); setSelectedSubjects({}); }} title="Add subjects">
                        <Plus className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={() => setDeleteTarget(group)} title="Delete">
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {group.subjects?.map((egs) => (
                  <Badge key={egs.subjectId} variant="secondary" className="text-xs gap-1">
                    {egs.subject.name}
                    <span className="text-muted-foreground">×{egs.parallelSections}</span>
                    {!isReadOnly && (
                      <>
                        <SectionEditButton
                          current={egs.parallelSections}
                          onSave={(v) => handleUpdateSections(group.id, egs.subjectId, v)}
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveSubject(group, egs.subjectId)}
                          className="ml-0.5 rounded-full hover:bg-white/20"
                          title="Remove subject"
                        >
                          <X className="size-2.5" />
                        </button>
                      </>
                    )}
                  </Badge>
                ))}
                {(!group.subjects || group.subjects.length === 0) && (
                  <span className="text-xs text-muted-foreground">No subjects assigned</span>
                )}
              </div>

              {(group._count?.divisionAssignments ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground">
                  Used in {group._count?.divisionAssignments} division(s)
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit dialog — name + periodsPerWeek + subjects */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) { setEditTarget(null); setEditSubjects({}); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Edit Elective Group</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(handleEditGroup)} className="space-y-4">
            <div className="space-y-2">
              <Label>Group Name</Label>
              <Input placeholder="e.g. Biology / Computer Science" {...form.register('name')} autoFocus />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Periods per week</Label>
              <Input
                type="number"
                min={1}
                max={50}
                {...form.register('periodsPerWeek', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">The number of periods each student attends from this elective per week.</p>
              {form.formState.errors.periodsPerWeek && <p className="text-sm text-destructive">{form.formState.errors.periodsPerWeek.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Subjects in this group</Label>
              <p className="text-xs text-muted-foreground">Toggle subjects on/off and adjust how many concurrent sections of each run. Changes apply when you click Save.</p>
              <SubjectChecklistWithSections
                subjects={allSubjects}
                selected={editSubjects}
                onToggle={toggleEditSubject}
                onChangeSections={(id, v) => setEditSubjects((prev) => ({ ...prev, [id]: v }))}
                periodsPerWeek={form.watch('periodsPerWeek') || 0}
              />
              {Object.keys(editSubjects).length > 0 && (
                <p className="text-xs text-muted-foreground">{Object.keys(editSubjects).length} subject(s) selected</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setEditTarget(null); setEditSubjects({}); }}>{t('actions.cancel')}</Button>
              <Button type="submit">{t('actions.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Create Elective Group</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
            <div className="space-y-2">
              <Label>Group Name</Label>
              <Input placeholder="e.g. Biology / Computer Science" {...form.register('name')} autoFocus />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Periods per week</Label>
              <Input
                type="number"
                min={1}
                max={50}
                placeholder="e.g. 8"
                {...form.register('periodsPerWeek', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">The number of periods each student attends from this elective per week.</p>
              {form.formState.errors.periodsPerWeek && <p className="text-sm text-destructive">{form.formState.errors.periodsPerWeek.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>Subjects in this group</Label>
              <p className="text-xs text-muted-foreground">Select subjects that will run in parallel, and set how many concurrent sections of each run.</p>
              <SubjectChecklistWithSections
                subjects={allSubjects}
                selected={createSubjects}
                onToggle={toggleCreateSubject}
                onChangeSections={(id, v) => setCreateSubjects((prev) => ({ ...prev, [id]: v }))}
                periodsPerWeek={form.watch('periodsPerWeek') || 0}
              />
              {Object.keys(createSubjects).length > 0 && (
                <p className="text-xs text-muted-foreground">{Object.keys(createSubjects).length} subject(s) selected</p>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={isCreating}>{t('actions.cancel')}</Button>
              <Button type="submit" disabled={isCreating}>{isCreating ? 'Creating...' : t('actions.create')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add subjects dialog */}
      <Dialog open={!!addSubjectTarget} onOpenChange={(open) => { if (!open) setAddSubjectTarget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Subjects to {addSubjectTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {availableSubjects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">All subjects are already in this group.</p>
            ) : (
              <>
                <SubjectChecklistWithSections
                  subjects={availableSubjects}
                  selected={selectedSubjects}
                  onToggle={toggleSelectedSubject}
                  onChangeSections={(id, v) => setSelectedSubjects((prev) => ({ ...prev, [id]: v }))}
                  periodsPerWeek={addSubjectTarget?.periodsPerWeek ?? 0}
                />
                {Object.keys(selectedSubjects).length > 0 && (
                  <p className="text-xs text-muted-foreground">{Object.keys(selectedSubjects).length} subject(s) selected</p>
                )}
              </>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSubjectTarget(null)}>{t('actions.cancel')}</Button>
              <Button onClick={handleAddSubjects} disabled={Object.keys(selectedSubjects).length === 0}>
                Add {Object.keys(selectedSubjects).length > 0 ? `${Object.keys(selectedSubjects).length} Subject(s)` : ''}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Elective Group"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This will remove all subject associations.${(deleteTarget?._count?.divisionAssignments ?? 0) > 0 ? ` This group is used in ${deleteTarget?._count?.divisionAssignments} division assignment(s) — those assignments will be dissolved and affected timetables flagged as outdated.` : ''}`}
        confirmLabel={t('actions.delete')}
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// ── Subject checklist with sections input ──

function SubjectChecklistWithSections({
  subjects,
  selected,
  onToggle,
  onChangeSections,
  periodsPerWeek,
}: {
  subjects: Array<{ id: string; name: string }>;
  selected: Record<string, number>;
  onToggle: (id: string) => void;
  onChangeSections: (id: string, value: number) => void;
  periodsPerWeek: number;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm p-2 max-h-56 overflow-y-auto space-y-0.5">
      {subjects.map((s) => {
        const isSelected = selected[s.id] !== undefined;
        const sections = selected[s.id] ?? 1;
        const required = sections * periodsPerWeek;
        return (
          <div
            key={s.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-amber-500/5 transition-colors"
          >
            <label className="flex items-center gap-2 flex-1 cursor-pointer">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(s.id)}
              />
              <span className="flex-1">{s.name}</span>
            </label>
            {isSelected && (
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Sections</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={sections}
                  onChange={(e) => onChangeSections(s.id, Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-7 w-14 text-xs"
                />
                {periodsPerWeek > 0 && (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    = {required} hrs
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {subjects.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">No subjects available.</p>
      )}
    </div>
  );
}

// ── Inline sections edit button ──

function SectionEditButton({
  current,
  onSave,
}: {
  current: number;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <Input
          type="number"
          min={1}
          max={10}
          value={value}
          onChange={(e) => setValue(Math.max(1, parseInt(e.target.value) || 1))}
          className="h-5 w-10 text-[10px] px-1"
        />
        <button
          type="button"
          onClick={() => { onSave(value); setEditing(false); }}
          className="text-[10px] text-green-600 hover:text-green-700"
          title="Save"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={() => { setValue(current); setEditing(false); }}
          className="text-[10px] text-destructive hover:text-destructive/80"
          title="Cancel"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setValue(current); setEditing(true); }}
      className="ml-0.5 rounded-full hover:bg-white/20 p-0.5"
      title="Edit parallel sections"
    >
      <Pencil className="size-2.5" />
    </button>
  );
}
