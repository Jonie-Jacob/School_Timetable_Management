import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Search, FileText, FileSpreadsheet, AlertTriangle, Flame } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import {
  useGetTeachersQuery,
  useGetTeachersLoadQuery,
  type TeacherLoad,
} from '@/features/teachers/teacherApi';
import {
  useExportTeacherPdfMutation,
  useExportTeacherExcelMutation,
  useExportTeachersPdfMutation,
  useExportTeachersExcelMutation,
  useExportFreePeriodsMutation,
  downloadHtmlAsPdf,
  downloadExcel,
} from '@/features/export/exportApi';
import { CalendarOff } from 'lucide-react';

type SortKey = 'name' | 'load-asc' | 'load-desc';

export function Component() {
  const navigate = useNavigate();
  const isDesktop = useBreakpoint('sm');

  const { data: teachersData, isLoading: teachersLoading } = useGetTeachersQuery({ pageSize: 200 });
  const { data: teacherLoads, isLoading: loadsLoading } = useGetTeachersLoadQuery();

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);

  const [exportPdf] = useExportTeacherPdfMutation();
  const [exportExcel] = useExportTeacherExcelMutation();
  const [exportAllPdf] = useExportTeachersPdfMutation();
  const [exportAllExcel] = useExportTeachersExcelMutation();
  const [exportFreePeriods] = useExportFreePeriodsMutation();

  // Index loads by id for quick lookup, then merge with the teacher list so
  // teachers without any assignments still show up (with 0 periods).
  const loadById = useMemo(() => {
    const map = new Map<string, TeacherLoad>();
    for (const l of teacherLoads ?? []) map.set(l.id, l);
    return map;
  }, [teacherLoads]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (teachersData?.data ?? []).map((t) => {
      const load = loadById.get(t.id);
      return {
        id: t.id,
        name: t.name,
        assignedPeriods: load?.assignedPeriods ?? 0,
        timetablePeriods: load?.timetablePeriods ?? null,
        conflictCount: load?.conflictCount ?? 0,
        overloadedDays: load?.overloadedDays ?? 0,
        maxPeriodsPerWeek: t.maxPeriodsPerWeek ?? load?.maxPeriodsPerWeek ?? null,
      };
    });

    const filtered = term ? list.filter((t) => t.name.toLowerCase().includes(term)) : list;

    return [...filtered].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'load-asc') return a.assignedPeriods - b.assignedPeriods || a.name.localeCompare(b.name);
      return b.assignedPeriods - a.assignedPeriods || a.name.localeCompare(b.name);
    });
  }, [teachersData, loadById, search, sortKey]);

  const handleExportRowPdf = async (teacherId: string) => {
    setExportingId(teacherId);
    try {
      const result = await exportPdf({ teacherId }).unwrap();
      downloadHtmlAsPdf(result.html, result.filename);
      toast.success('Export ready -- use browser print dialog to save as PDF');
    } catch {
      toast.error('Export failed');
    } finally {
      setExportingId(null);
    }
  };

  const handleExportRowExcel = async (teacherId: string) => {
    setExportingId(teacherId);
    try {
      const result = await exportExcel({ teacherId }).unwrap();
      downloadExcel(result.base64, result.filename);
      toast.success('Excel downloaded');
    } catch {
      toast.error('Export failed');
    } finally {
      setExportingId(null);
    }
  };

  const handleExportAllPdf = async () => {
    setExportingAll(true);
    try {
      // Empty teacherIds array → backend returns every teacher in the AY
      const result = await exportAllPdf({ teacherIds: [] }).unwrap();
      downloadHtmlAsPdf(result.html, result.filename);
      toast.success('All-teachers export ready -- use browser print dialog to save as PDF');
    } catch (err: any) {
      toast.error(err?.data?.error?.message ?? 'Export failed');
    } finally {
      setExportingAll(false);
    }
  };

  const handleExportAllExcel = async () => {
    setExportingAll(true);
    try {
      const result = await exportAllExcel({ teacherIds: [] }).unwrap();
      downloadExcel(result.base64, result.filename);
      toast.success('All-teachers Excel downloaded');
    } catch (err: any) {
      toast.error(err?.data?.error?.message ?? 'Export failed');
    } finally {
      setExportingAll(false);
    }
  };

  const handleExportFreePeriods = async () => {
    setExportingAll(true);
    try {
      const result = await exportFreePeriods().unwrap();
      downloadHtmlAsPdf(result.html, result.filename);
      toast.success('Free periods export ready');
    } catch (err: any) {
      toast.error(err?.data?.error?.message ?? 'Export failed');
    } finally {
      setExportingAll(false);
    }
  };

  const isLoading = teachersLoading || loadsLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher Timetables"
        description="View and export weekly timetables for every teacher."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportFreePeriods} disabled={exportingAll}>
              <CalendarOff className="size-3.5" />
              Free Periods
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAllPdf} disabled={exportingAll}>
              <FileText className="size-3.5" />
              Export All (PDF)
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAllExcel} disabled={exportingAll}>
              <FileSpreadsheet className="size-3.5" />
              Export All (Excel)
            </Button>
          </div>
        }
      />

      {/* Filter + sort bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search teachers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-xs rounded-md border border-border/60 bg-card px-2 py-1 text-foreground/80 focus:outline-none focus:ring-1 focus:ring-amber-500/40"
        >
          <option value="name">Sort: Name</option>
          <option value="load-asc">Sort: Periods ↑</option>
          <option value="load-desc">Sort: Periods ↓</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{rows.length} teacher{rows.length === 1 ? '' : 's'}</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-600 mb-4">
            <Eye className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No teachers found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md">
            {search ? 'Try a different search term.' : 'Add teachers from the Teachers page first.'}
          </p>
        </div>
      ) : !isDesktop ? (
          /* Mobile card view */
          <div className="space-y-3">
            {rows.map((row) => {
              const max = row.maxPeriodsPerWeek;
              const over = max != null && row.assignedPeriods > max;
              const mismatch = row.timetablePeriods != null && row.timetablePeriods !== row.assignedPeriods;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => navigate(`/teacher-timetable/${row.id}`)}
                      className="text-sm font-semibold hover:text-amber-600 transition-colors"
                    >
                      {row.name}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={over ? 'destructive' : 'outline'} className="text-[10px]">
                      {row.assignedPeriods}{max != null ? ` / ${max}` : ''} assigned
                    </Badge>
                    {row.timetablePeriods != null ? (
                      <Badge variant={mismatch ? 'destructive' : 'outline'} className="text-[10px]">
                        {row.timetablePeriods} in TT
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">No TT</Badge>
                    )}
                    {row.conflictCount > 0 && (
                      <Badge variant="destructive" className="text-[10px] gap-0.5">
                        <AlertTriangle className="size-2.5" />
                        {row.conflictCount} conflict{row.conflictCount !== 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="xs" onClick={() => navigate(`/teacher-timetable/${row.id}`)}>
                      <Eye className="size-3" /> View
                    </Button>
                    <Button variant="outline" size="xs" disabled={exportingId === row.id} onClick={() => handleExportRowPdf(row.id)}>
                      <FileText className="size-3" /> PDF
                    </Button>
                    <Button variant="outline" size="xs" disabled={exportingId === row.id} onClick={() => handleExportRowExcel(row.id)}>
                      <FileSpreadsheet className="size-3" /> Excel
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop table view */
          <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white/90">
                  <th className="text-left text-[11px] uppercase tracking-wider font-semibold px-4 py-3">Teacher</th>
                  <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-3 w-28">Assigned</th>
                  <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-3 w-28">Timetable</th>
                  <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-3 w-28">Status</th>
                  <th className="text-center text-[11px] uppercase tracking-wider font-semibold px-4 py-3 w-28">Overload</th>
                  <th className="text-right text-[11px] uppercase tracking-wider font-semibold px-4 py-3 w-56">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const max = row.maxPeriodsPerWeek;
                  const over = max != null && row.assignedPeriods > max;
                  return (
                    <tr
                      key={row.id}
                      className={`border-t border-border/30 hover:bg-amber-500/5 transition-colors ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/teacher-timetable/${row.id}`)}
                          className="text-sm font-medium hover:text-amber-600 transition-colors"
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={over ? 'destructive' : 'outline'} className="text-[10px]">
                          {row.assignedPeriods}{max != null ? ` / ${max}` : ''}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.timetablePeriods != null ? (
                          <Badge
                            variant={row.timetablePeriods !== row.assignedPeriods ? 'destructive' : 'outline'}
                            className="text-[10px]"
                          >
                            {row.timetablePeriods}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.conflictCount > 0 ? (
                          <Badge variant="destructive" className="text-[10px] gap-0.5">
                            <AlertTriangle className="size-2.5" />
                            {row.conflictCount}
                          </Badge>
                        ) : row.timetablePeriods != null ? (
                          <Badge variant="success" className="text-[10px]">OK</Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.overloadedDays > 0 ? (
                          <Badge variant="warning" className="text-[10px] gap-0.5 bg-orange-500/15 text-orange-600 border-orange-300">
                            <Flame className="size-2.5" />
                            {row.overloadedDays} {row.overloadedDays === 1 ? 'day' : 'days'}
                          </Badge>
                        ) : row.timetablePeriods != null ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="xs" onClick={() => navigate(`/teacher-timetable/${row.id}`)}>
                            <Eye className="size-3" /> View
                          </Button>
                          <Button variant="outline" size="xs" disabled={exportingId === row.id} onClick={() => handleExportRowPdf(row.id)}>
                            <FileText className="size-3" /> PDF
                          </Button>
                          <Button variant="outline" size="xs" disabled={exportingId === row.id} onClick={() => handleExportRowExcel(row.id)}>
                            <FileSpreadsheet className="size-3" /> Excel
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}
