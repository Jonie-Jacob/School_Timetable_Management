import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, BookOpen, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

function InlineEditSubjectName({
  subject,
  isReadOnly,
}: {
  subject: Subject;
  isReadOnly: boolean;
}) {
  const { t } = useTranslation('subjects');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(subject.name);
  const [updateSubject, { isLoading }] = useUpdateSubjectMutation();

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === subject.name) {
      setEditing(false);
      setValue(subject.name);
      return;
    }
    try {
      await updateSubject({ id: subject.id, name: trimmed }).unwrap();
      toast.success(t('updateSuccess'));
      setEditing(false);
    } catch {
      toast.error(t('updateError'));
    }
  }, [value, subject.id, subject.name, updateSubject, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') { setEditing(false); setValue(subject.name); }
    },
    [handleSave, subject.name],
  );

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-7 text-sm"
          autoFocus
          disabled={isLoading}
        />
        <Button variant="ghost" size="icon-xs" onClick={handleSave} disabled={isLoading} className="text-emerald-600 hover:text-emerald-700 shrink-0">
          <Check className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={() => { setEditing(false); setValue(subject.name); }} disabled={isLoading} className="text-muted-foreground shrink-0">
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <span
      className={isReadOnly ? '' : 'cursor-pointer hover:text-primary border-b border-transparent hover:border-primary/30 transition-colors'}
      onClick={() => !isReadOnly && setEditing(true)}
      title={isReadOnly ? undefined : 'Click to edit'}
    >
      {subject.name}
    </span>
  );
}

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

  const handleCreate = async (values: { name: string; abbreviation?: string }) => {
    try {
      await createSubject({ name: values.name, abbreviation: values.abbreviation || null }).unwrap();
      toast.success(t('createSuccess'));
      setFormOpen(false);
    } catch {
      toast.error(t('createError'));
    }
  };

  const handleUpdate = async (values: { name: string; abbreviation?: string }) => {
    if (!editTarget) return;
    try {
      await updateSubject({ id: editTarget.id, name: values.name, abbreviation: values.abbreviation || null }).unwrap();
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
        cell: ({ row }) => (
          <InlineEditSubjectName subject={row.original} isReadOnly={isReadOnly} />
        ),
      },
      {
        accessorKey: 'abbreviation',
        header: t('table.abbreviation'),
        size: 100,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs font-mono">
            {row.original.abbreviation || '--'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: t('table.actions'),
        enableResizing: false,
        size: 80,
        maxSize: 100,
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
        storageKey="subjects"
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
        totalCount={meta?.totalCount}
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
        defaultValues={editTarget ? { name: editTarget.name, abbreviation: editTarget.abbreviation || '' } : undefined}
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
