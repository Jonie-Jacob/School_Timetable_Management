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
import { SetupStepCard, SetupStepCardSkeleton } from './SetupStepCard';
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
    { icon: School, label: t('summaryCards.classes'), count: data?.counts?.classes ?? 0, to: '/classes', iconColor: 'text-violet-600 dark:text-violet-400', iconBg: 'bg-violet-500/10' },
    { icon: LayoutGrid, label: t('summaryCards.divisions'), count: data?.counts?.divisions ?? 0, to: '/classes', iconColor: 'text-sky-600 dark:text-sky-400', iconBg: 'bg-sky-500/10' },
    { icon: Users, label: t('summaryCards.teachers'), count: data?.counts?.teachers ?? 0, to: '/teachers', iconColor: 'text-emerald-600 dark:text-emerald-400', iconBg: 'bg-emerald-500/10' },
    { icon: BookOpen, label: t('summaryCards.subjects'), count: data?.counts?.subjects ?? 0, to: '/subjects', iconColor: 'text-rose-600 dark:text-rose-400', iconBg: 'bg-rose-500/10' },
    { icon: CheckCircle2, label: t('summaryCards.generated'), count: generatedCount, to: '/teacher-timetable', iconColor: 'text-teal-600 dark:text-teal-400', iconBg: 'bg-teal-500/10' },
    { icon: Clock, label: t('summaryCards.pending'), count: pendingCount, to: '/teacher-timetable', iconColor: 'text-amber-600 dark:text-amber-400', iconBg: 'bg-amber-500/10' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title={t('title')} />

      {/* Loading state */}
      {isLoading && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <SummaryCardSkeleton key={i} />
            ))}
          </div>
          <Skeleton className="h-14 w-full rounded-xl" />
        </>
      )}

      {/* Error or empty — show welcome state */}
      {!isLoading && (isError || isEmpty) && <WelcomeState />}

      {/* Data loaded */}
      {!isLoading && !isError && !isEmpty && (
        <>
          {/* Summary cards — 6 in a row on xl, 3 on lg, 2 on mobile */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {cards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>

          <ConflictBanner count={data.unresolvedConflicts} />

          {/* Setup wizard step cards */}
          {wizardLoading && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <SetupStepCardSkeleton key={i} />
              ))}
            </div>
          )}

          {showSetupWizard && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold">{t('setupWizard.title')}</h2>
                <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1">
                  <div className="size-2 rounded-full bg-amber-500" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {t('setupWizard.stepsComplete', {
                      count: wizard.totalComplete,
                      total: wizard.totalSteps,
                    })}
                  </span>
                </div>
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {wizard.steps.map((step) => {
                  const isLocked =
                    step.step > 1 && !wizard.steps[step.step - 2].complete;
                  return (
                    <SetupStepCard
                      key={step.step}
                      step={step}
                      isLocked={isLocked}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick links — always visible when not loading */}
      {!isLoading && <QuickLinks />}
    </div>
  );
}
