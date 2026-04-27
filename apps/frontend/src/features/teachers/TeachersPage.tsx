import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Users, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import {
  useGetTeachersQuery,
  useUpdateTeacherMutation,
  useDeleteTeacherMutation,
  type Teacher,
} from './teacherApi';

function InlineEditName({
  teacher,
  isReadOnly,
}: {
  teacher: Teacher;
  isReadOnly: boolean;
}) {
  const { t } = useTranslation('teachers');
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(teacher.name);
  const [updateTeacher, { isLoading }] = useUpdateTeacherMutation();

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === teacher.name) {
      setEditing(false);
      setValue(teacher.name);
      return;
    }
    try {
      await updateTeacher({ id: teacher.id, name: trimmed }).unwrap();
      toast.success(t('updateSuccess'));
      setEditing(false);
    } catch {
      toast.error(t('updateError'));
    }
  }, [value, teacher.id, teacher.name, updateTeacher, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSave();
      if (e.key === 'Escape') {
        setEditing(false);
        setValue(teacher.name);
      }
    },
    [handleSave, teacher.name],
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
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleSave}
          disabled={isLoading}
          className="text-emerald-600 hover:text-emerald-700 shrink-0"
        >
          <Check className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => { setEditing(false); setValue(teacher.name); }}
          disabled={isLoading}
          className="text-muted-foreground shrink-0"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <span
      className={
        isReadOnly
          ? ''
          : 'cursor-pointer hover:text-primary border-b border-transparent hover:border-primary/30 transition-colors'
      }
      onClick={() => !isReadOnly && setEditing(true)}
      title={isReadOnly ? undefined : 'Click to edit'}
    >
      {teacher.name}
    </span>
  );
}

export function Component() {
  const { t } = useTranslation('teachers');
  const navigate = useNavigate();
  const isReadOnly = useReadOnly();

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useGetTeachersQuery({ page: pageIndex + 1, pageSize, search: search || undefined });
  const [deleteTeacher, { isLoading: isDeleting }] = useDeleteTeacherMutation();

  const [deleteTarget, setDeleteTarget] = useState<Teacher | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const teachers = data?.data ?? [];
  const meta = data?.meta;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTeacher({ id: deleteTarget.id, confirm: !!deleteError }).unwrap();
      toast.success(t('deleteSuccess'));
      setDeleteTarget(null);
      setDeleteError(null);
    } catch (err: unknown) {
      const error = err as { status?: number; data?: { error?: { code?: string; message?: string } } };
      if (error?.status === 409 || error?.data?.error?.code === 'CONFIRM_REQUIRED') {
        try {
          const details = JSON.parse(error.data?.error?.message ?? '{}');
          setDeleteError(
            t('deleteWarning', {
              assignments: details.affectedAssignments ?? 0,
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

  const columns: ColumnDef<Teacher>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: t('table.name'),
        cell: ({ row }) => (
          <InlineEditName teacher={row.original} isReadOnly={isReadOnly} />
        ),
      },
      {
        id: 'subjects',
        header: t('table.subjects'),
        cell: ({ row }) => {
          const subjects = row.original.teacherSubjects ?? [];
          if (subjects.length === 0) return <span className="text-muted-foreground">--</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {subjects.map((ts) => (
                <Badge key={ts.subjectId} variant="secondary" className="text-xs">
                  {ts.subject.name}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: t('table.actions'),
        enableResizing: false,
        size: 80,
        maxSize: 100,
        cell: ({ row }) => {
          const teacher = row.original;
          return (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate(`/teachers/${teacher.id}/edit`)}
                disabled={isReadOnly}
                title={t('edit')}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteTarget(teacher);
                }}
                disabled={isReadOnly}
                title={t('delete')}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [t, isReadOnly, navigate],
  );

  const renderCard = (teacher: Teacher) => {
    const subjects = teacher.teacherSubjects ?? [];
    return (
      <div key={teacher.id} className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold">{teacher.name}</span>
        </div>
        {subjects.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {subjects.map((ts) => (
              <Badge key={ts.subjectId} variant="secondary" className="text-xs">
                {ts.subject.name}
              </Badge>
            ))}
          </div>
        )}
        {teacher.contact && (
          <p className="text-xs text-muted-foreground">{teacher.contact}</p>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/teachers/${teacher.id}/edit`)}
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
              setDeleteTarget(teacher);
            }}
            disabled={isReadOnly}
          >
            <Trash2 className="size-3 mr-1 text-destructive" />
            {t('delete')}
          </Button>
        </div>
      </div>
    );
  };

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
              <Button onClick={() => navigate('/teachers/new')}>
                <Plus className="size-4" />
                {t('addTeacher')}
              </Button>
            )}
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={teachers}
        isLoading={isLoading}
        storageKey="teachers"
        emptyIcon={Users}
        emptyTitle={t('empty.title')}
        emptyDescription={t('empty.description')}
        emptyAction={
          !isReadOnly && (
            <Button onClick={() => navigate('/teachers/new')}>
              <Plus className="size-4" />
              {t('addTeacher')}
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
