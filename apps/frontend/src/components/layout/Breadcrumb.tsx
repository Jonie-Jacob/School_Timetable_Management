import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/cn';

const SEGMENT_LABELS: Record<string, string> = {
  'academic-years': 'Academic Years',
  'period-structures': 'Period Structures',
  classes: 'Classes',
  subjects: 'Subjects',
  teachers: 'Teachers',
  'elective-groups': 'Elective Groups',
  notifications: 'Notifications',
  'teacher-timetable': 'Teacher Timetable',
  'unassigned-subjects': 'Unassigned Subjects',
  settings: 'Settings',
  assignments: 'Assignments',
  timetable: 'Timetable',
  timetables: 'Timetables',
  generate: 'Generate',
  new: 'New',
  edit: 'Edit',
  divisions: 'Divisions',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(segment: string): boolean {
  return UUID_RE.test(segment);
}

interface CrumbEntry {
  label: string;
  path: string;
  isLast: boolean;
}

function buildCrumbs(segments: string[]): CrumbEntry[] {
  const crumbs: CrumbEntry[] = [];
  let i = 0;

  while (i < segments.length) {
    const segment = segments[i];
    const path = '/' + segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;

    if (isUuid(segment)) {
      // Skip standalone UUIDs -- they are ID params.
      // If the next segment is a known label (edit, assignments, etc.), the UUID is just a parent.
      // Collapse "teachers / <uuid> / edit" → "Teachers > Edit"
      i++;
      continue;
    }

    const label = SEGMENT_LABELS[segment] ?? decodeURIComponent(segment);
    crumbs.push({ label, path, isLast });
    i++;
  }

  // Ensure the last crumb is marked correctly
  if (crumbs.length > 0) {
    crumbs.forEach((c, idx) => {
      c.isLast = idx === crumbs.length - 1;
    });
  }

  return crumbs;
}

export function Breadcrumb() {
  const { pathname } = useLocation();

  if (pathname === '/') return null;

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const crumbs = buildCrumbs(segments);
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="px-4 lg:px-6 pt-3">
      <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <li>
          <Link
            to="/"
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Home className="size-3.5" />
          </Link>
        </li>
        {crumbs.map((crumb) => (
          <Fragment key={crumb.path}>
            <li>
              <ChevronRight className="size-3.5" />
            </li>
            <li>
              {crumb.isLast ? (
                <span className={cn('font-medium text-foreground')}>
                  {crumb.label}
                </span>
              ) : (
                <Link
                  to={crumb.path}
                  className="hover:text-foreground transition-colors"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
