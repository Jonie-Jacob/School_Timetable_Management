import { useMemo, useState } from 'react';
import { Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGetClassesQuery,
  useSetClassTeacherMutation,
  useRemoveClassTeacherMutation,
  type ClassItem,
  type Division,
} from '@/features/classes/classApi';
import { ClassTeacherField } from '@/features/classes/ClassDetailPage';
import { useReadOnly } from '@/hooks/useReadOnly';

interface Row {
  classItem: ClassItem;
  division: Division;
}

export function Component() {
  const isReadOnly = useReadOnly();
  const { data: classes, isLoading } = useGetClassesQuery();

  const [setClassTeacher] = useSetClassTeacherMutation();
  const [removeClassTeacher] = useRemoveClassTeacherMutation();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');

  const rows: Row[] = useMemo(() => {
    const flat: Row[] = [];
    for (const c of classes ?? []) {
      for (const d of c.divisions ?? []) {
        flat.push({ classItem: c, division: d });
      }
    }
    return flat;
  }, [classes]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      // Filter by assignment status
      if (filter === 'assigned' && !r.division.classTeacherId) return false;
      if (filter === 'unassigned' && r.division.classTeacherId) return false;

      // Search by class name, division label, or teacher name
      if (!term) return true;
      const haystack = `${r.classItem.name} ${r.division.label} ${r.division.classTeacher?.name ?? ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rows, search, filter]);

  const stats = useMemo(() => {
    const total = rows.length;
    const assigned = rows.filter((r) => r.division.classTeacherId).length;
    return { total, assigned, unassigned: total - assigned };
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Class Teachers"
        description="View and manage the class teacher for every division across all classes."
      />

      {/* Stats + filter bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search class, division, or teacher..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'assigned', 'unassigned'] as const).map((f) => {
            const active = filter === f;
            const count = f === 'all' ? stats.total : f === 'assigned' ? stats.assigned : stats.unassigned;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all capitalize ${
                  active
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-card border-border/60 text-foreground/70 hover:border-amber-500/40'
                }`}
              >
                {f} <span className="opacity-70">· {count}</span>
              </button>
            );
          })}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {filteredRows.length} of {stats.total} division{stats.total === 1 ? '' : 's'}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 mb-4">
            <UserCheck className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No divisions found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            {search || filter !== 'all'
              ? 'Try a different search or filter.'
              : 'Add classes and divisions first to assign class teachers.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white/90">
                <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-3">Class</th>
                <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-3">Division</th>
                <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-3">Status</th>
                <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-3 min-w-[280px]">Class Teacher</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, idx) => (
                <tr
                  key={row.division.id}
                  className={`border-t border-border/30 hover:bg-amber-500/5 transition-colors ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
                >
                  <td className="px-4 py-3 font-medium">{row.classItem.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm">Division {row.division.label}</span>
                    {row.division.streamName && (
                      <span className="ml-2 text-[10px] text-muted-foreground">({row.division.streamName})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.division.classTeacherId ? (
                      <Badge variant="success" className="text-[10px]">Assigned</Badge>
                    ) : (
                      <Badge variant="warning" className="text-[10px]">Unassigned</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ClassTeacherField
                      classId={row.classItem.id}
                      division={row.division}
                      isReadOnly={isReadOnly}
                      onSet={async (teacherId) => {
                        try {
                          await setClassTeacher({
                            classId: row.classItem.id,
                            divisionId: row.division.id,
                            teacherId,
                          }).unwrap();
                          toast.success('Class teacher assigned');
                        } catch (err: any) {
                          toast.error(err?.data?.error?.message || 'Failed to assign class teacher');
                        }
                      }}
                      onRemove={async () => {
                        try {
                          await removeClassTeacher({
                            classId: row.classItem.id,
                            divisionId: row.division.id,
                          }).unwrap();
                          toast.success('Class teacher removed');
                        } catch {
                          toast.error('Failed to remove class teacher');
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
