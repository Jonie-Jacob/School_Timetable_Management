import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, School, Eye, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGetClassesQuery,
  useCreateClassMutation,
  useDeleteClassMutation,
  type ClassItem,
} from './classApi';

const classSchema = z.object({
  name: z.string().min(1, 'Class name is required').max(100),
  requiresStream: z.boolean().optional(),
});

type ClassFormValues = z.infer<typeof classSchema>;

export function Component() {
  const { t } = useTranslation('classes');
  const navigate = useNavigate();
  const isReadOnly = useReadOnly();

  const { data: classes, isLoading } = useGetClassesQuery();
  const [createClass, { isLoading: isCreating }] = useCreateClassMutation();
  const [deleteClass, { isLoading: isDeleting }] = useDeleteClassMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ClassItem | null>(null);

  const form = useForm<ClassFormValues>({
    resolver: zodResolver(classSchema),
    defaultValues: { name: '', requiresStream: false },
  });

  const handleCreate = async (values: ClassFormValues) => {
    try {
      await createClass({
        name: values.name,
        requiresStream: values.requiresStream,
        sortOrder: classes?.length ?? 0,
      }).unwrap();
      toast.success(t('createSuccess'));
      setFormOpen(false);
      form.reset();
    } catch {
      toast.error(t('createError'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClass(deleteTarget.id).unwrap();
      toast.success(t('deleteSuccess'));
      setDeleteTarget(null);
    } catch {
      toast.error(t('deleteError'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          !isReadOnly ? (
            <Button onClick={() => { form.reset(); setFormOpen(true); }}>
              <Plus className="size-4" />
              {t('addClass')}
            </Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && (!classes || classes.length === 0) && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 mb-4">
            <School className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">{t('empty.title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">{t('empty.description')}</p>
          {!isReadOnly && (
            <Button className="mt-4" onClick={() => { form.reset(); setFormOpen(true); }}>
              <Plus className="size-4" />
              {t('addClass')}
            </Button>
          )}
        </div>
      )}

      {!isLoading && classes && classes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((cls) => {
            const divCount = cls.divisions?.length ?? 0;
            const validCount = cls.divisions?.filter((d) => d.timetable?.statusJson?.statuses?.includes('VALID')).length ?? 0;
            const issueCount = cls.divisions?.filter((d) => d.timetable?.statusJson && !d.timetable.statusJson.statuses?.includes('VALID') && d.timetable.statusJson.statuses?.length > 0).length ?? 0;

            return (
              <div
                key={cls.id}
                className="group rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-3 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5 hover:border-amber-500/20 hover:-translate-y-0.5 cursor-pointer"
                onClick={() => navigate(`/classes/${cls.id}`)}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-base">{cls.name}</h3>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.stopPropagation(); navigate(`/classes/${cls.id}`); }}
                      title={t('view')}
                    >
                      <Eye className="size-3.5" />
                    </Button>
                    {!isReadOnly && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(cls); }}
                        title={t('delete')}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{divCount} {divCount === 1 ? 'division' : 'divisions'}</span>
                  {validCount > 0 && (
                    <Badge variant="success" className="text-[10px]">
                      {validCount}/{divCount} Valid
                    </Badge>
                  )}
                  {issueCount > 0 && (
                    <Badge variant="warning" className="text-[10px]">
                      {issueCount} Issues
                    </Badge>
                  )}
                </div>

                {cls.requiresStream && (
                  <Badge variant="outline" className="text-[10px]">Stream-based</Badge>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('form.createTitle')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="className">{t('form.name')}</Label>
              <Input
                id="className"
                placeholder={t('form.namePlaceholder')}
                {...form.register('name')}
                autoFocus
              />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="requiresStream">{t('form.requiresStream')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('form.requiresStreamHint')}</p>
              </div>
              <Switch
                id="requiresStream"
                checked={form.watch('requiresStream')}
                onCheckedChange={(checked) => form.setValue('requiresStream', checked)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={isCreating}>
                {t('form.cancel')}
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? t('form.saving') : t('form.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteConfirm.title')}
        description={t('deleteConfirm.description', { name: deleteTarget?.name ?? '' })}
        confirmLabel={t('deleteConfirm.confirm')}
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
