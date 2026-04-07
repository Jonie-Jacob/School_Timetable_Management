import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, CheckCircle2, AlertTriangle, Clock, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useGetClassQuery } from '@/features/classes/classApi';
import {
  useGenerateTimetableMutation,
  useGetGenerationStatusQuery,
  useGetDivisionTimetableQuery,
} from './timetableApi';

export function Component() {
  const { t } = useTranslation('timetable');
  const { classId, divisionId } = useParams<{ classId: string; divisionId: string }>();
  const navigate = useNavigate();

  const { data: classItem } = useGetClassQuery(classId!, { skip: !classId });
  const { data: timetableGrid } = useGetDivisionTimetableQuery(divisionId!, { skip: !divisionId });

  const [generateTimetable, { isLoading: isGenerating }] = useGenerateTimetableMutation();

  const [adjacency, setAdjacency] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // Poll job status when generating
  const { data: jobStatus } = useGetGenerationStatusQuery(activeJobId!, {
    skip: !activeJobId,
    pollingInterval: activeJobId ? 3000 : 0,
  });

  // Stop polling when job completes
  useEffect(() => {
    if (jobStatus?.status === 'COMPLETED') {
      toast.success(t('generator.success'));
      setActiveJobId(null);
    } else if (jobStatus?.status === 'FAILED') {
      toast.error(t('generator.failed'));
      setActiveJobId(null);
    }
  }, [jobStatus?.status, t]);

  const division = classItem?.divisions?.find((d) => d.id === divisionId);
  const timetable = timetableGrid?.timetable;
  const hasExistingTimetable = !!timetable;

  const divisionLabel = division
    ? `${classItem?.name ?? ''} — Division ${division.label}${division.streamName ? ` (${division.streamName})` : ''}`
    : '';

  const handleGenerate = async () => {
    if (!divisionId) return;
    setConfirmOpen(false);
    try {
      const result = await generateTimetable({
        divisionIds: [divisionId],
        adjacencyConstraintEnabled: adjacency,
      }).unwrap();

      const job = Array.isArray(result) ? result[0] : result;
      if (job?.jobId) {
        setActiveJobId(job.jobId);
      } else {
        toast.success(t('generator.success'));
      }
    } catch {
      toast.error(t('generator.failed'));
    }
  };

  const onGenerateClick = () => {
    if (hasExistingTimetable) {
      setConfirmOpen(true);
    } else {
      handleGenerate();
    }
  };

  const isPolling = !!activeJobId;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('generator.title')}
        description={divisionLabel}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate(`/classes/${classId}`)}>
            <ArrowLeft className="size-3.5" />
            {t('generator.back')}
          </Button>
        }
      />

      {/* Status Card */}
      <div className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-6 space-y-5">
        <div className="flex items-center gap-4">
          <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${
            timetable?.status === 'GENERATED'
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : timetable?.status === 'OUTDATED'
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground'
          }`}>
            {timetable?.status === 'GENERATED' ? (
              <CheckCircle2 className="size-6" />
            ) : timetable?.status === 'OUTDATED' ? (
              <AlertTriangle className="size-6" />
            ) : (
              <Clock className="size-6" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{t('generator.status')}</span>
              <Badge
                variant={
                  timetable?.status === 'GENERATED' ? 'success'
                    : timetable?.status === 'OUTDATED' ? 'warning'
                      : 'outline'
                }
              >
                {timetable?.status === 'GENERATED'
                  ? t('generator.generated')
                  : timetable?.status === 'OUTDATED'
                    ? t('generator.outdated')
                    : t('generator.notGenerated')}
              </Badge>
            </div>
            {timetable?.generatedAt && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('generator.generatedAt', {
                  date: new Date(timetable.generatedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  }),
                })}
              </p>
            )}
          </div>
        </div>

        {/* Adjacency toggle */}
        <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
          <div>
            <Label className="font-medium">{t('generator.adjacency')}</Label>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-md">{t('generator.adjacencyHint')}</p>
          </div>
          <Switch checked={adjacency} onCheckedChange={setAdjacency} disabled={isPolling || isGenerating} />
        </div>

        {/* Generate / Generating state */}
        {isPolling || isGenerating ? (
          <div className="flex flex-col items-center py-6 space-y-3">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10">
              <Loader2 className="size-8 text-amber-500 animate-spin" />
            </div>
            <p className="font-semibold">{t('generator.generating')}</p>
            <p className="text-sm text-muted-foreground text-center max-w-sm">{t('generator.generatingHint')}</p>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Button onClick={onGenerateClick} className="gap-2">
              <CalendarDays className="size-4" />
              {hasExistingTimetable ? t('generator.regenerateButton') : t('generator.generateButton')}
            </Button>
            {hasExistingTimetable && (
              <Button
                variant="outline"
                onClick={() => navigate(`/classes/${classId}/divisions/${divisionId}/timetable`)}
                className="gap-2"
              >
                <Eye className="size-4" />
                {t('generator.viewTimetable')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Regenerate confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title={t('generator.confirmRegenerateTitle')}
        description={t('generator.confirmRegenerate')}
        confirmLabel={t('generator.regenerateButton')}
        onConfirm={handleGenerate}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
