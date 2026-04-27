import { useTranslation } from 'react-i18next';
import {
  School,
  LayoutGrid,
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { useGetDashboardStatsQuery, useGetSetupWizardQuery } from './dashboardApi';
import { SummaryCard, SummaryCardSkeleton } from './SummaryCard';
import { SetupStepper, SetupStepperSkeleton } from './SetupStepper';
import { ConflictBanner } from './ConflictBanner';
import { QuickLinks } from './QuickLinks';
import { WelcomeState } from './WelcomeState';
import { Skeleton } from '@/components/ui/skeleton';

export function Component() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError } = useGetDashboardStatsQuery();
  const { data: wizard, isLoading: wizardLoading } = useGetSetupWizardQuery();

  const isEmpty = !data || data.counts?.classes === 0;
  const generatedCount = data?.timetables?.byStatus?.['generated'] ?? 0;
  const pendingCount = data?.timetables?.divisionsWithoutTimetable ?? 0;

  const showSetupWizard =
    wizard && !wizard.dismissed && wizard.totalComplete < wizard.totalSteps;

  const cards = [
    { icon: School, label: t('summaryCards.classes'), count: data?.counts?.classes ?? 0, to: '/classes', iconColor: 'text-violet-600', iconBg: 'bg-violet-500/10' },
    { icon: LayoutGrid, label: t('summaryCards.divisions'), count: data?.counts?.divisions ?? 0, to: '/classes', iconColor: 'text-sky-600', iconBg: 'bg-sky-500/10' },
    { icon: Users, label: t('summaryCards.teachers'), count: data?.counts?.teachers ?? 0, to: '/teachers', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-500/10' },
    { icon: BookOpen, label: t('summaryCards.subjects'), count: data?.counts?.subjects ?? 0, to: '/subjects', iconColor: 'text-rose-600', iconBg: 'bg-rose-500/10' },
    { icon: CheckCircle2, label: t('summaryCards.generated'), count: generatedCount, to: '/teacher-timetable', iconColor: 'text-teal-600', iconBg: 'bg-teal-500/10' },
    { icon: Clock, label: t('summaryCards.pending'), count: pendingCount, to: '/teacher-timetable', iconColor: 'text-amber-600', iconBg: 'bg-amber-500/10' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Loading state */}
      {isLoading && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SummaryCardSkeleton key={i} />
            ))}
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
        </>
      )}

      {/* Error or empty -- show welcome state */}
      {!isLoading && (isError || isEmpty) && <WelcomeState />}

      {/* Data loaded */}
      {!isLoading && !isError && !isEmpty && (
        <>
          {/* Summary cards -- 6 in a row on xl, 3 on lg, 2 on mobile */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {cards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>

          <ConflictBanner count={data.unresolvedConflicts} />

          {/* Setup wizard -- compact horizontal stepper */}
          {wizardLoading && <SetupStepperSkeleton />}

          {showSetupWizard && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold">{t('setupWizard.title')}</h2>
                <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5">
                  <div className="size-1.5 rounded-full bg-amber-500" />
                  <span className="text-[10px] font-medium text-amber-700">
                    {t('setupWizard.stepsComplete', {
                      count: wizard.totalComplete,
                      total: wizard.totalSteps,
                    })}
                  </span>
                </div>
              </div>
              <SetupStepper steps={wizard.steps} />
            </div>
          )}
        </>
      )}

      {/* Quick links -- always visible when not loading */}
      {!isLoading && <QuickLinks />}
    </div>
  );
}
