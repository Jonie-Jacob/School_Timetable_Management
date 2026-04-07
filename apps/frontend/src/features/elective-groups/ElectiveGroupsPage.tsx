import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Link2, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { MultiSelect, type MultiSelectOption } from '@/components/shared/MultiSelect';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetSubjectsQuery } from '@/features/subjects/subjectApi';
import {
  useGetElectiveGroupsQuery,
  useCreateElectiveGroupMutation,
  useDeleteElectiveGroupMutation,
  useAddElectiveSubjectMutation,
  useRemoveElectiveSubjectMutation,
  type ElectiveGroup,
} from './electiveGroupApi';

const groupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
});

export function Component() {
  const { t } = useTranslation();
  const isReadOnly = useReadOnly();

  const { data: groups, isLoading } = useGetElectiveGroupsQuery();
  const { data: subjectsData } = useGetSubjectsQuery({ pageSize: 200 });
  const [createGroup, { isLoading: isCreating }] = useCreateElectiveGroupMutation();
  const [deleteGroup, { isLoading: isDeleting }] = useDeleteElectiveGroupMutation();
  const [addSubject] = useAddElectiveSubjectMutation();
  const [removeSubject] = useRemoveElectiveSubjectMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ElectiveGroup | null>(null);
  const [addSubjectTarget, setAddSubjectTarget] = useState<ElectiveGroup | null>(null);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);

  const form = useForm({ resolver: zodResolver(groupSchema), defaultValues: { name: '' } });

  const subjectOptions: MultiSelectOption[] = (subjectsData?.data ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const handleCreate = async (values: { name: string }) => {
    try {
      await createGroup(values).unwrap();
      toast.success('Elective group created.');
      setFormOpen(false);
      form.reset();
    } catch {
      toast.error('Failed to create elective group.');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteGroup(deleteTarget.id).unwrap();
      toast.success('Elective group deleted.');
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to delete elective group.');
    }
  };

  const handleAddSubjects = async () => {
    if (!addSubjectTarget) return;
    try {
      for (const subjectId of selectedSubjects) {
        await addSubject({ groupId: addSubjectTarget.id, subjectId }).unwrap();
      }
      toast.success('Subjects added.');
      setAddSubjectTarget(null);
      setSelectedSubjects([]);
    } catch {
      toast.error('Failed to add subjects.');
    }
  };

  const handleRemoveSubject = async (groupId: string, subjectId: string) => {
    try {
      await removeSubject({ groupId, subjectId }).unwrap();
      toast.success('Subject removed.');
    } catch {
      toast.error('Failed to remove subject.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elective Groups"
        description="Define elective groups and their subject pools."
        actions={
          !isReadOnly ? (
            <Button onClick={() => { form.reset(); setFormOpen(true); }}>
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
          <div className="flex size-14 items-center justify-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400 mb-4">
            <Link2 className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No elective groups yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">Create elective groups to co-schedule subjects for student parallel sessions.</p>
          {!isReadOnly && (
            <Button className="mt-4" onClick={() => { form.reset(); setFormOpen(true); }}>
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
                <h3 className="font-semibold">{group.name}</h3>
                <div className="flex items-center gap-1">
                  {!isReadOnly && (
                    <>
                      <Button variant="ghost" size="icon-xs" onClick={() => { setAddSubjectTarget(group); setSelectedSubjects([]); }} title="Add subjects">
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
                {group.electiveGroupSubjects?.map((egs) => (
                  <Badge key={egs.subjectId} variant="secondary" className="text-xs gap-1">
                    {egs.subject.name}
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSubject(group.id, egs.subjectId)}
                        className="ml-0.5 rounded-full hover:bg-white/20"
                      >
                        <X className="size-2.5" />
                      </button>
                    )}
                  </Badge>
                ))}
                {(!group.electiveGroupSubjects || group.electiveGroupSubjects.length === 0) && (
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

      {/* Create dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Create Elective Group</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
            <div className="space-y-2">
              <Label>Group Name</Label>
              <Input placeholder="e.g. Biology / Computer Science" {...form.register('name')} autoFocus />
              {form.formState.errors.name && <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Subjects to {addSubjectTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <MultiSelect options={subjectOptions} value={selectedSubjects} onChange={setSelectedSubjects} placeholder="Select subjects..." />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSubjectTarget(null)}>{t('actions.cancel')}</Button>
              <Button onClick={handleAddSubjects} disabled={selectedSubjects.length === 0}>{t('actions.add')}</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Elective Group"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}"? This will remove all subject associations.`}
        confirmLabel={t('actions.delete')}
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
