import { useState, useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DataTable, ConfirmDialog } from '@/components/shared';
import { useReadOnly } from '@/hooks/useReadOnly';
import {
  useGetGroupedElectiveGroupsQuery,
  useDeleteElectiveGroupMutation,
  type GroupedElectiveGroup,
} from './electiveGroupApi';
import { ElectiveGroupEditorModal } from './editor';

/** Format divisions as "X: A, B, C -- IX: A, B" */
function formatDivisions(divisions: GroupedElectiveGroup['divisions']): string {
  const byClass = new Map<string, string[]>();
  const classOrder: string[] = [];
  for (const d of divisions) {
    const shortName = d.className.replace(/^Class\s+/i, '');
    if (!byClass.has(shortName)) {
      byClass.set(shortName, []);
      classOrder.push(shortName);
    }
    byClass.get(shortName)!.push(d.divisionLabel);
  }
  return classOrder
    .map(cls => `${cls}: ${byClass.get(cls)!.join(', ')}`)
    .join(' -- ');
}

export function Component() {
  const { data: groups, isLoading } = useGetGroupedElectiveGroupsQuery();
  const [deleteGroup] = useDeleteElectiveGroupMutation();
  const isReadOnly = useReadOnly();

  const [editTarget, setEditTarget] = useState<GroupedElectiveGroup | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GroupedElectiveGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      for (const gId of deleteTarget.underlyingGroupIds) {
        await deleteGroup(gId).unwrap();
      }
      toast.success('Elective group deleted');
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err?.data?.error?.message ?? 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const columns: ColumnDef<GroupedElectiveGroup>[] = useMemo(() => [
    {
      accessorKey: 'displayName',
      header: 'Elective Name',
      size: 180,
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.original.displayName}</span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      size: 110,
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          className={row.original.type === 'cross-division'
            ? 'bg-blue-100 text-blue-800 text-[10px]'
            : 'bg-amber-100 text-amber-800 text-[10px]'}
        >
          {row.original.type === 'cross-division' ? 'Cross-Div' : 'Per-Div'}
        </Badge>
      ),
    },
    {
      id: 'subjects',
      header: 'Subjects',
      size: 160,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.subjects.map(s => s.subjectAbbreviation || s.subjectName).join(', ')}
        </span>
      ),
    },
    {
      id: 'teachers',
      header: 'Teachers',
      size: 200,
      cell: ({ row }) => {
        const names = new Set<string>();
        for (const s of row.original.subjects) {
          for (const t of s.teachers) {
            if (t.teacherName) names.add(t.teacherName);
          }
        }
        return (
          <span className="text-xs text-muted-foreground">
            {Array.from(names).join(', ') || '--'}
          </span>
        );
      },
    },
    {
      accessorFn: (row) => row.config.periodsPerWeek,
      id: 'ppw',
      header: 'P/W',
      size: 60,
      cell: ({ row }) => (
        <span className="text-sm font-mono text-center block">
          {row.original.config.periodsPerWeek}
        </span>
      ),
    },
    {
      id: 'divisions',
      header: 'Classes & Divisions',
      size: 250,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.divisions.length > 0
            ? formatDivisions(row.original.divisions)
            : '--'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      enableResizing: false,
      size: 90,
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setEditTarget(row.original)}
            disabled={isReadOnly}
            title="Edit"
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setDeleteTarget(row.original)}
            disabled={isReadOnly}
            title="Delete"
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      ),
    },
  ], [isReadOnly]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elective Groups"
        description="Manage elective groups, subjects, teachers, and division participation."
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={isReadOnly}>
            <Plus className="size-3.5 mr-1" />
            Add Elective Group
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={groups ?? []}
        isLoading={isLoading}
        emptyIcon={Layers}
        emptyTitle="No elective groups"
        emptyDescription="Create your first elective group to schedule parallel subjects."
        emptyAction={
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={isReadOnly}>
            <Plus className="size-3.5 mr-1" />
            Add Elective Group
          </Button>
        }
        storageKey="elective-groups"
        renderCard={(group) => {
          const subjectNames = group.subjects.map(s => s.subjectAbbreviation || s.subjectName).join(', ');
          const teacherNames = Array.from(new Set(group.subjects.flatMap(s => s.teachers.map(t => t.teacherName).filter(Boolean)))).join(', ');
          return (
            <div key={group.underlyingGroupIds[0]} className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold truncate">{group.displayName}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Badge
                    variant="secondary"
                    className={group.type === 'cross-division'
                      ? 'bg-blue-100 text-blue-800 text-[10px]'
                      : 'bg-amber-100 text-amber-800 text-[10px]'}
                  >
                    {group.type === 'cross-division' ? 'Cross-Div' : 'Per-Div'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <div><span className="font-medium text-foreground/70">Subjects:</span> {subjectNames || '--'}</div>
                <div><span className="font-medium text-foreground/70">Teachers:</span> {teacherNames || '--'}</div>
                <div><span className="font-medium text-foreground/70">P/W:</span> {group.config.periodsPerWeek}</div>
                <div><span className="font-medium text-foreground/70">Divisions:</span> {group.divisions.length > 0 ? formatDivisions(group.divisions) : '--'}</div>
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setEditTarget(group)} disabled={isReadOnly} title="Edit">
                  <Pencil className="size-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => setDeleteTarget(group)} disabled={isReadOnly} title="Delete">
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        }}
      />

      {/* Unified editor modal -- create */}
      <ElectiveGroupEditorModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        initialData={null}
      />

      {/* Unified editor modal -- edit */}
      <ElectiveGroupEditorModal
        open={!!editTarget}
        onOpenChange={(open) => { if (!open) setEditTarget(null); }}
        initialData={editTarget}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Elective Group"
        description={`Delete "${deleteTarget?.displayName}"? This will remove all division assignments and timetable data for this group.`}
        variant="destructive"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
