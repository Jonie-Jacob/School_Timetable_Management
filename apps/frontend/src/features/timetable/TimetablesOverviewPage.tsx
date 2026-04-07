import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Eye, Zap, CheckCircle2, AlertTriangle, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetClassesQuery } from '@/features/classes/classApi';
import { useGenerateTimetableMutation } from './timetableApi';

export function Component() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: classes, isLoading } = useGetClassesQuery();
  const [generateAll, { isLoading: isGeneratingAll }] = useGenerateTimetableMutation();
  const [confirmGenerateAll, setConfirmGenerateAll] = useState(false);

  // Flatten all divisions across classes
  const allDivisions = (classes ?? []).flatMap((cls) =>
    (cls.divisions ?? []).map((div) => ({
      ...div,
      className: cls.name,
      classId: cls.id,
    })),
  );

  const generated = allDivisions.filter((d) => d.timetable?.status === 'GENERATED').length;
  const outdated = allDivisions.filter((d) => d.timetable?.status === 'OUTDATED').length;
  const pending = allDivisions.filter((d) => !d.timetable).length;
  const pendingIds = allDivisions.filter((d) => !d.timetable || d.timetable.status === 'OUTDATED').map((d) => d.id);

  const handleGenerateAll = async () => {
    setConfirmGenerateAll(false);
    if (pendingIds.length === 0) {
      toast.info('All timetables are already generated.');
      return;
    }
    try {
      await generateAll({ divisionIds: pendingIds }).unwrap();
      toast.success(`Generated timetables for ${pendingIds.length} division(s).`);
    } catch {
      toast.error('Some timetables failed to generate. Check individual divisions.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="All Timetables"
        description="View and manage timetables across all classes and divisions."
        actions={
          pendingIds.length > 0 ? (
            <Button
              variant="gradient"
              onClick={() => setConfirmGenerateAll(true)}
              disabled={isGeneratingAll}
              className="gap-2"
            >
              {isGeneratingAll ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {isGeneratingAll ? 'Generating...' : `Generate All (${pendingIds.length})`}
            </Button>
          ) : undefined
        }
      />

      {/* Summary stats */}
      {!isLoading && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <span className="text-sm font-medium">{generated}</span>
            <span className="text-xs text-muted-foreground">Generated</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="text-sm font-medium">{outdated}</span>
            <span className="text-xs text-muted-foreground">Outdated</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-2">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium">{pending}</span>
            <span className="text-xs text-muted-foreground">Pending</span>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {!isLoading && allDivisions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mb-4">
            <CalendarDays className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">No divisions found</h3>
          <p className="mt-1 text-sm text-muted-foreground">Create classes and divisions first to generate timetables.</p>
          <Button className="mt-4" onClick={() => navigate('/classes')}>Go to Classes</Button>
        </div>
      )}

      {!isLoading && allDivisions.length > 0 && (
        <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white/90">
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Class</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Division</th>
                <th className="h-10 px-4 text-left text-xs uppercase tracking-wider font-medium">Period Structure</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium">Status</th>
                <th className="h-10 px-4 text-center text-xs uppercase tracking-wider font-medium w-40">Actions</th>
              </tr>
            </thead>
            <tbody>
              {allDivisions.map((div, idx) => {
                const status = div.timetable?.status;
                return (
                  <tr
                    key={div.id}
                    className={`border-b border-border/40 transition-[background-color] duration-300 ease-in-out hover:bg-sidebar/10 ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium">{div.className}</td>
                    <td className="px-4 py-3">
                      Division {div.label}
                      {div.streamName && <span className="text-muted-foreground"> — {div.streamName}</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {div.periodStructure?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={status === 'GENERATED' ? 'success' : status === 'OUTDATED' ? 'warning' : 'outline'}
                        className="text-[10px]"
                      >
                        {status === 'GENERATED' ? 'Generated' : status === 'OUTDATED' ? 'Outdated' : 'Pending'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {status === 'GENERATED' && (
                          <Button
                            variant="outline"
                            size="xs"
                            className="text-[11px] gap-1"
                            onClick={() => navigate(`/classes/${div.classId}/divisions/${div.id}/timetable`)}
                          >
                            <Eye className="size-3" />
                            View
                          </Button>
                        )}
                        <Button
                          variant={status ? 'outline' : 'default'}
                          size="xs"
                          className="text-[11px] gap-1"
                          onClick={() => navigate(`/classes/${div.classId}/divisions/${div.id}/generate`)}
                        >
                          <Zap className="size-3" />
                          {status ? 'Regenerate' : 'Generate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white">
                <td colSpan={5} className="px-4 py-2.5 text-xs text-white/60">
                  {allDivisions.length} division(s) — {generated} generated, {outdated} outdated, {pending} pending
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirmGenerateAll}
        title="Generate All Timetables"
        description={`This will generate timetables for ${pendingIds.length} division(s) that are pending or outdated. Existing outdated timetables will be regenerated. This may take a few minutes.`}
        confirmLabel={`Generate ${pendingIds.length} Timetable(s)`}
        loading={isGeneratingAll}
        onConfirm={handleGenerateAll}
        onCancel={() => setConfirmGenerateAll(false)}
      />
    </div>
  );
}
