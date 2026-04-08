import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, LayoutGrid, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader, DataTable, ConfirmDialog } from '@/components/shared';
import {
  useGetPeriodStructuresQuery,
  useDeletePeriodStructureMutation,
  type PeriodStructure,
} from './configApi';

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

function formatWorkingDays(workingDays: PeriodStructure['workingDays'], tShort: (key: string) => string) {
  if (!workingDays?.length) return '—';
  const sorted = [...workingDays].sort((a, b) => a.sortOrder - b.sortOrder);
  return sorted.map((d) => tShort(`daysShort.${DAY_ORDER[d.dayOfWeek]}`)).join(', ');
}

export function Component() {
  const { t } = useTranslation('period-structures');
  const navigate = useNavigate();

  const { data: structures = [], isLoading } = useGetPeriodStructuresQuery();
  const [deleteStructure, { isLoading: isDeleting }] = useDeletePeriodStructureMutation();

  const [deleteTarget, setDeleteTarget] = useState<PeriodStructure | null>(null);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStructure(deleteTarget.id).unwrap();
      toast.success(t('deleteConfirm.success'));
      setDeleteTarget(null);
    } catch {
      toast.error(t('deleteConfirm.error'));
    }
  };

  const columns: ColumnDef<PeriodStructure>[] = [
    {
      accessorKey: 'name',
      header: t('table.name'),
    },
    {
      id: 'workingDays',
      header: t('table.workingDays'),
      cell: ({ row }) => formatWorkingDays(row.original.workingDays, t),
    },
    {
      id: 'divisions',
      header: t('table.divisions'),
      cell: ({ row }) => {
        const divs = row.original.divisions;
        if (!divs?.length) return '—';
        return (
          <div className="flex flex-wrap gap-1">
            {divs.map((d: { id: string; label: string; class: { name: string } }) => (
              <span
                key={d.id}
                className="inline-flex items-center rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary-foreground"
              >
                {d.class.name} {d.label}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: t('table.actions'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/period-structures/${row.original.id}`)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  const renderCard = (ps: PeriodStructure) => (
    <div key={ps.id} className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{ps.name}</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/period-structures/${ps.id}`)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDeleteTarget(ps)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{formatWorkingDays(ps.workingDays, t)}</p>
      {ps.divisions?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ps.divisions.map((d: { id: string; label: string; class: { name: string } }) => (
            <span
              key={d.id}
              className="inline-flex items-center rounded-full bg-secondary/10 px-2 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {d.class.name} {d.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const deleteDescription = deleteTarget?.divisions?.length
    ? t('deleteConfirm.descriptionWithDivisions', {
        name: deleteTarget.name,
        count: deleteTarget.divisions.length,
      })
    : t('deleteConfirm.description', { name: deleteTarget?.name ?? '' });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => navigate('/period-structures/new')}>
            <Plus className="size-4" />
            {t('addStructure')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={structures}
        isLoading={isLoading}
        emptyIcon={LayoutGrid}
        emptyTitle={t('empty.title')}
        emptyDescription={t('empty.description')}
        emptyAction={
          <Button onClick={() => navigate('/period-structures/new')}>
            <Plus className="size-4" />
            {t('addStructure')}
          </Button>
        }
        renderCard={renderCard}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteConfirm.title')}
        description={deleteDescription}
        confirmLabel={t('deleteConfirm.confirm')}
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
