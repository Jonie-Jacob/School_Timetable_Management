import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/cn';

// Map route segments to display labels
const SEGMENT_LABELS: Record<string, string> = {
  'academic-years': 'Academic Years',
  'period-structures': 'Period Structures',
  classes: 'Classes',
  subjects: 'Subjects',
  teachers: 'Teachers',
  'elective-groups': 'Elective Groups',
  notifications: 'Notifications',
  'teacher-timetable': 'Teacher Timetable',
  settings: 'Settings',
  assignments: 'Assignments',
  timetable: 'Timetable',
  new: 'New',
  edit: 'Edit',
};

export function Breadcrumb() {
  const { pathname } = useLocation();

  // Don't show breadcrumb on the root dashboard
  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex items-center gap-1 text-sm text-muted-foreground">
        <li>
          <Link
            to="/"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="size-3.5" />
            <span className="sr-only">Dashboard</span>
          </Link>
        </li>
        {segments.map((segment, index) => {
          const path = '/' + segments.slice(0, index + 1).join('/');
          const isLast = index === segments.length - 1;
          const label = SEGMENT_LABELS[segment] ?? decodeURIComponent(segment);

          return (
            <Fragment key={path}>
              <li>
                <ChevronRight className="size-3.5" />
              </li>
              <li>
                {isLast ? (
                  <span className={cn('font-medium text-foreground')}>
                    {label}
                  </span>
                ) : (
                  <Link
                    to={path}
                    className="hover:text-foreground transition-colors"
                  >
                    {label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
