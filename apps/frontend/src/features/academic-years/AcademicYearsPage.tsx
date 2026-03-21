import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, CalendarDays } from 'lucide-react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { useAppDispatch } from '@/app/hooks';
import { setActiveAcademicYear } from '@/features/auth/authSlice';
import { Button } from '@/components/ui/button';
import { PageHeader, DataTable, StatusBadge, ConfirmDialog } from '@/components/shared';
import {
  useGetAcademicYearsQuery,
  useCreateAcademicYearMutation,
  useActivateAcademicYearMutation,
  type AcademicYear,
} from './academicYearApi';
import { AcademicYearForm } from './AcademicYearForm';

export function Component() {
  const { t } = useTranslation('academic-years');
  const dispatch = useAppDispatch();

  const { data, isLoading } = useGetAcademicYearsQuery();
  const [createAcademicYear, { isLoading: isCreating }] = useCreateAcademicYearMutation();
  const [activateAcademicYear, { isLoading: isActivating }] = useActivateAcademicYearMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<AcademicYear | null>(null);

  const academicYears = data?.data ?? [];

  const handleCreate = async (values: { label: string; startDate: string; endDate: string }) => {
    try {
      await createAcademicYear(values).unwrap();
      toast.success(t('createSuccess'));
      setFormOpen(false);
    } catch {
      toast.error(t('createError'));
    }
  };

  const handleActivate = async () => {
    if (!activateTarget) return;
    try {
      await activateAcademicYear(activateTarget.id).unwrap();
      dispatch(setActiveAcademicYear(activateTarget.id));
      toast.success(t('activate.success', { label: activateTarget.label }));
      setActivateTarget(null);
    } catch {
      toast.error(t('activate.error'));
    }
  };

  const columns: ColumnDef<AcademicYear>[] = [
    {
      accessorKey: 'label',
      header: t('table.label'),
    },
    {
      accessorKey: 'startDate',
      header: t('table.startDate'),
      cell: ({ getValue }) => dayjs(getValue<string>()).format('DD MMM YYYY'),
    },
    {
      accessorKey: 'endDate',
      header: t('table.endDate'),
      cell: ({ getValue }) => dayjs(getValue<string>()).format('DD MMM YYYY'),
    },
    {
      accessorKey: 'status',
      header: t('table.status'),
      cell: ({ getValue }) => (
        <StatusBadge status={getValue<string>().toLowerCase() as 'active' | 'archived'} />
      ),
    },
    {
      id: 'actions',
      header: t('table.actions'),
      cell: ({ row }) => {
        const ay = row.original;
        if (ay.status === 'ACTIVE') return null;
        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivateTarget(ay)}
          >
            {t('setActive')}
          </Button>
        );
      },
    },
  ];

  const renderCard = (ay: AcademicYear) => (
    <div
      key={ay.id}
      className="rounded-lg border bg-card p-4 space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">{ay.label}</span>
        <StatusBadge status={ay.status.toLowerCase() as 'active' | 'archived'} />
      </div>
      <p className="text-sm text-muted-foreground">
        {dayjs(ay.startDate).format('MMM YYYY')} — {dayjs(ay.endDate).format('MMM YYYY')}
      </p>
      {ay.status !== 'ACTIVE' && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => setActivateTarget(ay)}
        >
          {t('setActive')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            {t('createNew')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={academicYears}
        isLoading={isLoading}
        emptyIcon={CalendarDays}
        emptyTitle={t('empty.title')}
        emptyDescription={t('empty.description')}
        emptyAction={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" />
            {t('createNew')}
          </Button>
        }
        renderCard={renderCard}
      />

      <AcademicYearForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
      />

      <ConfirmDialog
        open={!!activateTarget}
        title={t('activate.title')}
        description={t('activate.description', { label: activateTarget?.label ?? '' })}
        confirmLabel={t('activate.confirm')}
        loading={isActivating}
        onConfirm={handleActivate}
        onCancel={() => setActivateTarget(null)}
      />
    </div>
  );
}
