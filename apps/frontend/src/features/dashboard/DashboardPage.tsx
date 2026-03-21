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
import { useGetDashboardStatsQuery } from './dashboardApi';
import { SummaryCard, SummaryCardSkeleton } from './SummaryCard';
import { ConflictBanner } from './ConflictBanner';
import { QuickLinks } from './QuickLinks';
import { WelcomeState } from './WelcomeState';
import { Skeleton } from '@/components/ui/skeleton';

export function Component() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError } = useGetDashboardStatsQuery();

  const isEmpty = !data || data.counts?.classes === 0;
  const generatedCount = data?.timetables?.byStatus?.['generated'] ?? 0;
  const pendingCount = data?.timetables?.divisionsWithoutTimetable ?? 0;

  const cards = [
    { icon: School, label: t('summaryCards.classes'), count: data?.counts?.classes ?? 0, to: '/classes' },
    { icon: LayoutGrid, label: t('summaryCards.divisions'), count: data?.counts?.divisions ?? 0, to: '/classes' },
    { icon: Users, label: t('summaryCards.teachers'), count: data?.counts?.teachers ?? 0, to: '/teachers' },
    { icon: BookOpen, label: t('summaryCards.subjects'), count: data?.counts?.subjects ?? 0, to: '/subjects' },
    { icon: CheckCircle2, label: t('summaryCards.generated'), count: generatedCount, to: '/teacher-timetable' },
    { icon: Clock, label: t('summaryCards.pending'), count: pendingCount, to: '/teacher-timetable' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Loading state */}
      {isLoading && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SummaryCardSkeleton key={i} />
            ))}
          </div>
          <Skeleton className="h-14 w-full rounded-lg" />
        </>
      )}

      {/* Error or empty — show welcome state */}
      {!isLoading && (isError || isEmpty) && <WelcomeState />}

      {/* Data loaded */}
      {!isLoading && !isError && !isEmpty && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => (
              <SummaryCard key={card.label} {...card} />
            ))}
          </div>

          <ConflictBanner count={data.unresolvedConflicts} />
        </>
      )}

      {/* Quick links — always visible when not loading */}
      {!isLoading && <QuickLinks />}
    </div>
  );
}
