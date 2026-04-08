import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarRange,
  School,
  BookOpen,
  Users,
  Link2,
  Bell,
  Eye,
  Settings,
  Clock,
  CalendarCheck,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SidebarLink } from './SidebarLink';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useGetNotificationCountQuery } from '@/features/notifications/notificationApi';

interface SidebarProps {
  className?: string;
}

const NAV_ITEMS = [
  { key: 'dashboard', to: '/', icon: LayoutDashboard, color: 'text-amber-400' },
  { key: 'academicYears', to: '/academic-years', icon: CalendarRange, color: 'text-sky-400' },
  { key: 'classes', to: '/classes', icon: School, color: 'text-violet-400' },
  { key: 'periodStructures', to: '/period-structures', icon: Clock, color: 'text-teal-400' },
  { key: 'subjects', to: '/subjects', icon: BookOpen, color: 'text-rose-400' },
  { key: 'teachers', to: '/teachers', icon: Users, color: 'text-emerald-400' },
  { key: 'electiveGroups', to: '/elective-groups', icon: Link2, color: 'text-orange-400' },
  { key: 'timetables', to: '/timetables', icon: CalendarCheck, color: 'text-lime-400' },
  { key: 'notifications', to: '/notifications', icon: Bell, color: 'text-yellow-400' },
  { key: 'teacherTimetable', to: '/teacher-timetable', icon: Eye, color: 'text-cyan-400' },
  { key: 'unassignedSubjects', to: '/unassigned-subjects', icon: UserPlus, color: 'text-pink-400' },
  { key: 'settings', to: '/settings', icon: Settings, color: 'text-stone-400' },
] as const;

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  const isXl = useBreakpoint('xl');
  const { data: notifCount } = useGetNotificationCountQuery(undefined, { pollingInterval: 60_000 });

  const collapsed = !isXl;

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 h-full overflow-y-auto',
        'bg-sidebar border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-60',
        'transition-[width] duration-200',
        className
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-14 shrink-0 px-3',
          collapsed ? 'justify-center' : 'gap-3'
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500 font-bold text-amber-950 text-sm shadow-sm">
          ST
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-sidebar-foreground truncate">
            {t('appName')}
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-white/8" />

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.key}
            to={item.to}
            icon={item.icon}
            iconColor={item.color}
            label={t(`nav.${item.key}`)}
            collapsed={collapsed}
            badge={item.key === 'notifications' ? (notifCount?.count ?? 0) : undefined}
          />
        ))}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
