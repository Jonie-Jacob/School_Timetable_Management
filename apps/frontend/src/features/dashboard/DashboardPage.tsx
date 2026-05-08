import { useTranslation } from 'react-i18next';
import {
  School,
  LayoutGrid,
  Users,
  BookOpen,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  CalendarOff,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/shared';
import { useGetDashboardStatsQuery } from './dashboardApi';
import { SummaryCard, SummaryCardSkeleton } from './SummaryCard';
import { QuickLinks } from './QuickLinks';
import { WelcomeState } from './WelcomeState';

interface StatusCardDef {
  icon: LucideIcon;
  labelKey: string;
  countKey: string;
  to: string;
  iconColor: string;
  iconBg: string;
}

const ENTITY_CARDS: StatusCardDef[] = [
  { icon: School, labelKey: 'summaryCards.classes', countKey: 'counts.classes', to: '/classes', iconColor: 'text-violet-600', iconBg: 'bg-violet-500/10' },
  { icon: LayoutGrid, labelKey: 'summaryCards.divisions', countKey: 'counts.divisions', to: '/classes', iconColor: 'text-sky-600', iconBg: 'bg-sky-500/10' },
  { icon: Users, labelKey: 'summaryCards.teachers', countKey: 'counts.teachers', to: '/teachers', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-500/10' },
  { icon: BookOpen, labelKey: 'summaryCards.subjects', countKey: 'counts.subjects', to: '/subjects', iconColor: 'text-rose-600', iconBg: 'bg-rose-500/10' },
];

const STATUS_CARDS: StatusCardDef[] = [
  { icon: CheckCircle2, labelKey: 'statusCards.valid', countKey: 'timetables.valid', to: '/timetables', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-500/10' },
  { icon: AlertTriangle, labelKey: 'statusCards.issues', countKey: '_issues', to: '/timetables', iconColor: 'text-amber-600', iconBg: 'bg-amber-500/10' },
  { icon: Clock, labelKey: 'statusCards.notGenerated', countKey: 'timetables.notGenerated', to: '/timetables', iconColor: 'text-stone-500', iconBg: 'bg-stone-500/10' },
];

function getNestedValue(obj: Record<string, unknown>, path: string): number {
  const parts = path.split('.');
  let val: unknown = obj;
  for (const p of parts) {
    val = (val as Record<string, unknown>)?.[p];
  }
  return (typeof val === 'number' ? val : 0);
}

export function Component() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError } = useGetDashboardStatsQuery();

  const isEmpty = !data || data.counts?.classes === 0;

  // "Issues" = timetables with any non-VALID status
  const issuesCount = data ? (
    data.timetables.teacherConflict +
    data.timetables.availabilityViolation +
    data.timetables.emptySlots +
    data.timetables.excessAssignments +
    data.timetables.preferenceViolationHard +
    data.timetables.preferenceViolationSoft +
    data.timetables.orphanedSlots
  ) : 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SummaryCardSkeleton key={i} />
          ))}
        </div>
      )}

      {/* Error or empty -- show welcome state */}
      {!isLoading && (isError || isEmpty) && <WelcomeState />}

      {/* Data loaded */}
      {!isLoading && !isError && !isEmpty && (
        <>
          {/* Entity summary cards */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            {ENTITY_CARDS.map((card) => (
              <SummaryCard
                key={card.labelKey}
                icon={card.icon}
                label={t(card.labelKey)}
                count={getNestedValue(data as unknown as Record<string, unknown>, card.countKey)}
                to={card.to}
                iconColor={card.iconColor}
                iconBg={card.iconBg}
              />
            ))}
          </div>

          {/* Timetable status cards */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">{t('statusCards.title')}</h2>
            <div className="grid gap-3 grid-cols-3">
              {STATUS_CARDS.map((card) => {
                const count = card.countKey === '_issues'
                  ? issuesCount
                  : getNestedValue(data as unknown as Record<string, unknown>, card.countKey);
                return (
                  <SummaryCard
                    key={card.labelKey}
                    icon={card.icon}
                    label={t(card.labelKey)}
                    count={count}
                    to={card.to}
                    iconColor={card.iconColor}
                    iconBg={card.iconBg}
                  />
                );
              })}
            </div>
          </div>

          {/* Detailed status breakdown -- only show if there are issues */}
          {issuesCount > 0 && (
            <div className="rounded-xl border border-border/50 bg-card backdrop-blur-sm p-5">
              <h3 className="text-sm font-semibold mb-3">{t('statusCards.breakdown')}</h3>
              <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                {data.timetables.teacherConflict > 0 && (
                  <StatusBadgeItem icon={AlertOctagon} label={t('statusCards.teacherConflict')} count={data.timetables.teacherConflict} color="text-red-600" />
                )}
                {data.timetables.availabilityViolation > 0 && (
                  <StatusBadgeItem icon={ShieldAlert} label={t('statusCards.availabilityViolation')} count={data.timetables.availabilityViolation} color="text-orange-600" />
                )}
                {data.timetables.preferenceViolationHard > 0 && (
                  <StatusBadgeItem icon={AlertTriangle} label={t('statusCards.preferenceHard')} count={data.timetables.preferenceViolationHard} color="text-amber-700" />
                )}
                {data.timetables.emptySlots > 0 && (
                  <StatusBadgeItem icon={CalendarOff} label={t('statusCards.emptySlots')} count={data.timetables.emptySlots} color="text-amber-600" />
                )}
                {data.timetables.excessAssignments > 0 && (
                  <StatusBadgeItem icon={AlertTriangle} label={t('statusCards.excessAssignments')} count={data.timetables.excessAssignments} color="text-amber-600" />
                )}
                {data.timetables.preferenceViolationSoft > 0 && (
                  <StatusBadgeItem icon={AlertTriangle} label={t('statusCards.preferenceSoft')} count={data.timetables.preferenceViolationSoft} color="text-yellow-600" />
                )}
                {data.timetables.orphanedSlots > 0 && (
                  <StatusBadgeItem icon={AlertOctagon} label={t('statusCards.orphanedSlots')} count={data.timetables.orphanedSlots} color="text-red-600" />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Quick links -- always visible when not loading */}
      {!isLoading && <QuickLinks />}
    </div>
  );
}

function StatusBadgeItem({ icon: Icon, label, count, color }: { icon: LucideIcon; label: string; count: number; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
      <Icon className={`size-4 ${color} shrink-0`} />
      <span className="text-sm truncate">{label}</span>
      <span className={`ml-auto text-sm font-bold tabular-nums ${color}`}>{count}</span>
    </div>
  );
}
