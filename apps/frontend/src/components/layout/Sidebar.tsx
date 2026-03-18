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
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SidebarLink } from './SidebarLink';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface SidebarProps {
  className?: string;
}

const NAV_ITEMS = [
  { key: 'dashboard', to: '/', icon: LayoutDashboard },
  { key: 'academicYears', to: '/academic-years', icon: CalendarRange },
  { key: 'periodStructures', to: '/period-structures', icon: Clock },
  { key: 'classes', to: '/classes', icon: School },
  { key: 'subjects', to: '/subjects', icon: BookOpen },
  { key: 'teachers', to: '/teachers', icon: Users },
  { key: 'electiveGroups', to: '/elective-groups', icon: Link2 },
  { key: 'notifications', to: '/notifications', icon: Bell },
  { key: 'teacherTimetable', to: '/teacher-timetable', icon: Eye },
  { key: 'settings', to: '/settings', icon: Settings },
] as const;

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  const isXl = useBreakpoint('xl');

  const collapsed = !isXl;

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 h-full overflow-y-auto',
        'bg-gradient-to-b from-primary to-secondary dark:from-background-deep dark:to-background-deep dark:border-r dark:border-border',
        collapsed ? 'w-16' : 'w-60',
        'transition-[width] duration-200',
        className
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-14 shrink-0 px-3',
          collapsed ? 'justify-center' : 'gap-2'
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-white/20 font-bold text-white text-sm">
          ST
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-white truncate">
            {t('appName')}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {NAV_ITEMS.map((item) => (
          <SidebarLink
            key={item.key}
            to={item.to}
            icon={item.icon}
            label={t(`nav.${item.key}`)}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}

export { NAV_ITEMS };
