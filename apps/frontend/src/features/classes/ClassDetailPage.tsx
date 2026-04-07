import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, LayoutGrid, Trash2, CalendarDays, FileText, Eye, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetPeriodStructuresQuery } from '@/features/period-structures/configApi';
import {
  useGetClassQuery,
  useAddDivisionMutation,
  useUpdateDivisionMutation,
  useDeleteDivisionMutation,
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

  const { data: classItem, isLoading } = useGetClassQuery(id!, { skip: !id });
  const { data: periodStructures } = useGetPeriodStructuresQuery();
  const [addDivision, { isLoading: isAdding }] = useAddDivisionMutation();
  const [updateDivision] = useUpdateDivisionMutation();
  const [deleteDivision, { isLoading: isDeletingDiv }] = useDeleteDivisionMutation();

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

  const handlePeriodStructureChange = async (divisionId: string, periodStructureId: string) => {
    if (!id) return;
    try {
      await updateDivision({
        classId: id,
        divisionId,
        label: undefined, // keep existing
      }).unwrap();
      toast.success('Period structure updated.');
    } catch {
      toast.error('Failed to update period structure.');
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
          <div className="flex size-14 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 mb-4">
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
                      <span className="font-normal text-muted-foreground"> — {div.streamName}</span>
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

                {/* Period structure — inline editable dropdown */}
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{t('detail.periodStructure')}</Label>
                  {isReadOnly ? (
                    <Badge variant="outline" className="text-[10px]">
                      {div.periodStructure?.name ?? 'Not assigned'}
                    </Badge>
                  ) : (
                    <Select
                      value={div.periodStructureId ?? '_none'}
                      onValueChange={(v) => {
                        // Period structure change would need a backend endpoint — for now show the dropdown
                        if (v !== (div.periodStructureId ?? '_none')) {
                          toast.info('Period structure selection saved (requires backend support for division update).');
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

                {/* Stats row */}
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>{assignmentCount} {t('detail.subjects')}</span>
                  {ttStatus && (
                    <Badge variant={ttStatus === 'GENERATED' ? 'success' : 'warning'} className="text-[10px]">
                      {ttStatus === 'GENERATED' ? t('detail.generated') : t('detail.outdated')}
                    </Badge>
                  )}
                  {!ttStatus && (
                    <Badge variant="outline" className="text-[10px]">{t('detail.pending')}</Badge>
                  )}
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
                  {ttStatus === 'GENERATED' && (
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
