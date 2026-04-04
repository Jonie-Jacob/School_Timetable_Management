import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, BookOpen, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import {
  useGetSubjectsQuery,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useDeleteSubjectMutation,
  type Subject,
} from './subjectApi';
import { SubjectForm } from './SubjectForm';

export function Component() {
  const { t } = useTranslation('subjects');
  const isReadOnly = useReadOnly();

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useGetSubjectsQuery({ page: pageIndex + 1, pageSize, search: search || undefined });
  const [createSubject, { isLoading: isCreating }] = useCreateSubjectMutation();
  const [updateSubject, { isLoading: isUpdating }] = useUpdateSubjectMutation();
  const [deleteSubject, { isLoading: isDeleting }] = useDeleteSubjectMutation();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Subject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const subjects = data?.data ?? [];
  const meta = data?.meta;

  const handleCreate = async (values: { name: string }) => {
    try {
      await createSubject(values).unwrap();
      toast.success(t('createSuccess'));
      setFormOpen(false);
    } catch {
      toast.error(t('createError'));
    }
  };

  const handleUpdate = async (values: { name: string }) => {
    if (!editTarget) return;
    try {
      await updateSubject({ id: editTarget.id, ...values }).unwrap();
      toast.success(t('updateSuccess'));
      setEditTarget(null);
    } catch {
      toast.error(t('updateError'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSubject({ id: deleteTarget.id, confirm: !!deleteError }).unwrap();
      toast.success(t('deleteSuccess'));
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err: unknown) {
      const error = err as { status?: number; data?: { error?: { code?: string; message?: string } } };
      if (error?.status === 409 || error?.data?.error?.code === 'CONFIRM_REQUIRED') {
        // Parse the cascade warning and show it
        try {
          const details = JSON.parse(error.data?.error?.message ?? '{}');
          setDeleteError(
            t('deleteWarning', {
              divisions: details.affectedDivisions ?? 0,
              timetables: details.affectedTimetables ?? 0,
            }),
          );
        } catch {
          setDeleteError(t('deleteWarningGeneric'));
        }
      } else {
        toast.error(t('deleteError'));
        setDeleteTarget(null);
      }
    }
  };

  const columns: ColumnDef<Subject>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('table.name'),
      },
      {
        id: 'actions',
        header: t('table.actions'),
        cell: ({ row }) => {
          const subject = row.original;
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditTarget(subject)}
                disabled={isReadOnly}
                title={t('edit')}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteTarget(subject);
                }}
                disabled={isReadOnly}
                title={t('delete')}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [t, isReadOnly],
  );

  const renderCard = (subject: Subject) => (
    <div key={subject.id} className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{subject.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditTarget(subject)}
          disabled={isReadOnly}
        >
          <Pencil className="size-3 mr-1" />
          {t('edit')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setDeleteError(null);
            setDeleteTarget(subject);
          }}
          disabled={isReadOnly}
        >
          <Trash2 className="size-3 mr-1 text-destructive" />
          {t('delete')}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t('searchPlaceholder')}
              className="w-64"
            />
            {!isReadOnly && (
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="size-4" />
                {t('addSubject')}
              </Button>
            )}
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={subjects}
        isLoading={isLoading}
        emptyIcon={BookOpen}
        emptyTitle={t('empty.title')}
        emptyDescription={t('empty.description')}
        emptyAction={
          !isReadOnly && (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="size-4" />
              {t('addSubject')}
            </Button>
          )
        }
        renderCard={renderCard}
        pagination={
          meta
            ? { pageIndex: meta.page - 1, pageSize: meta.pageSize }
            : undefined
        }
        pageCount={meta?.totalPages}
        onPaginationChange={(p) => { setPageIndex(p.pageIndex); setPageSize(p.pageSize); }}
      />

      {/* Create Form */}
      <SubjectForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleCreate}
        isSubmitting={isCreating}
        mode="create"
      />

      {/* Edit Form */}
      <SubjectForm
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onSubmit={handleUpdate}
        isSubmitting={isUpdating}
        defaultValues={editTarget ? { name: editTarget.name } : undefined}
        mode="edit"
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('deleteConfirm.title')}
        description={
          deleteError ??
          t('deleteConfirm.description', { name: deleteTarget?.name ?? '' })
        }
        confirmLabel={deleteError ? t('deleteConfirm.confirmCascade') : t('deleteConfirm.confirm')}
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
      />
    </div>
  );
}
