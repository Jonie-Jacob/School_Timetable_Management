import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarRange,
  School,
  BookOpen,
  Users,
  Link2,
  Eye,
  Settings,
  Clock,
  CalendarCheck,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { SidebarLink } from './SidebarLink';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface SidebarProps {
  className?: string;
}

interface NavItem {
  key: string;
  to: string;
  icon: LucideIcon;
  color: string;
}

interface NavSection {
  /** Section header label, or null for the un-headered top group (Dashboard). */
  heading: string | null;
  items: NavItem[];
}

// Sidebar grouped into Workspace / Timetables / Setup sections.
// Notifications moved to the topbar bell. Unassigned Subjects removed
// from the sidebar (still reachable directly via /unassigned-subjects).
const NAV_SECTIONS: NavSection[] = [
  {
    heading: null,
    items: [
      { key: 'dashboard', to: '/', icon: LayoutDashboard, color: 'text-amber-400' },
    ],
  },
  {
    heading: 'workspace',
    items: [
      { key: 'classes', to: '/classes', icon: School, color: 'text-violet-400' },
      { key: 'classTeachers', to: '/class-teachers', icon: UserCheck, color: 'text-fuchsia-400' },
      { key: 'subjects', to: '/subjects', icon: BookOpen, color: 'text-rose-400' },
      { key: 'teachers', to: '/teachers', icon: Users, color: 'text-emerald-400' },
      { key: 'electiveGroups', to: '/elective-groups', icon: Link2, color: 'text-orange-400' },
    ],
  },
  {
    heading: 'timetables',
    items: [
      { key: 'classTimetables', to: '/timetables', icon: CalendarCheck, color: 'text-lime-400' },
      { key: 'teacherTimetables', to: '/teacher-timetable', icon: Eye, color: 'text-cyan-400' },
    ],
  },
  {
    heading: 'setup',
    items: [
      { key: 'academicYears', to: '/academic-years', icon: CalendarRange, color: 'text-sky-400' },
      { key: 'periodStructures', to: '/period-structures', icon: Clock, color: 'text-teal-400' },
      { key: 'settings', to: '/settings', icon: Settings, color: 'text-stone-400' },
    ],
  },
];

export function Sidebar({ className }: SidebarProps) {
  const { t } = useTranslation();
  const isXl = useBreakpoint('xl');

  const collapsed = !isXl;

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col shrink-0 h-full overflow-y-auto',
        'bg-sidebar border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-60',
        'transition-[width] duration-200',
        className,
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-14 shrink-0 px-3',
          collapsed ? 'justify-center' : 'gap-3',
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
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_SECTIONS.map((section, sectionIdx) => (
          <div
            key={section.heading ?? `section-${sectionIdx}`}
            className={sectionIdx > 0 ? 'pt-3 mt-2 border-t border-white/5' : undefined}
          >
            {section.heading && !collapsed && (
              <div className="px-3 pb-1 text-[10px] uppercase tracking-widest font-semibold text-stone-500">
                {t(`nav.sections.${section.heading}`)}
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <SidebarLink
                  key={item.key}
                  to={item.to}
                  icon={item.icon}
                  iconColor={item.color}
                  label={t(`nav.${item.key}`)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

// Flat list of all nav items, used by MobileDrawer / MoreSheet that don't
// need section headers.
const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);
export { NAV_ITEMS };
