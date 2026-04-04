import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Users, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DataTable, SearchInput, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import {
  useGetTeachersQuery,
  useDeleteTeacherMutation,
  type Teacher,
} from './teacherApi';

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
      },
      {
        id: 'subjects',
        header: t('table.subjects'),
        cell: ({ row }) => {
          const subjects = row.original.teacherSubjects ?? [];
          if (subjects.length === 0) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-wrap gap-1">
              {subjects.slice(0, 3).map((ts) => (
                <Badge key={ts.subjectId} variant="secondary" className="text-xs">
                  {ts.subject.name}
                </Badge>
              ))}
              {subjects.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{subjects.length - 3}
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: t('table.actions'),
        cell: ({ row }) => {
          const teacher = row.original;
          return (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/teachers/${teacher.id}/edit`)}
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
                  setDeleteTarget(teacher);
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
          !isReadOnly && (
            <Button onClick={() => navigate('/teachers/new')}>
              <Plus className="size-4" />
              {t('addTeacher')}
            </Button>
          )
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('searchPlaceholder')}
      />

      <DataTable
        columns={columns}
        data={teachers}
        isLoading={isLoading}
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
        onPaginationChange={(p) => { setPageIndex(p.pageIndex); setPageSize(p.pageSize); }}
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
