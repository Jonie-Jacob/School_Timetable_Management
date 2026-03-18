import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './ThemeToggle';
import { MobileDrawer } from './MobileDrawer';
import { Badge } from '@/components/ui/badge';
import { useAppSelector } from '@/app/hooks';

const SEGMENT_LABELS: Record<string, string> = {
  '': 'Dashboard',
  'academic-years': 'Academic Years',
  'period-structures': 'Period Structures',
  classes: 'Classes',
  subjects: 'Subjects',
  teachers: 'Teachers',
  'elective-groups': 'Elective Groups',
  notifications: 'Notifications',
  'teacher-timetable': 'Teacher Timetable',
  settings: 'Settings',
};

export function MobileHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeAYId = useAppSelector((s) => s.auth.activeAcademicYearId);

  // Derive page title from first pathname segment
  const firstSegment = location.pathname.split('/').filter(Boolean)[0] ?? '';
  const pageTitle = SEGMENT_LABELS[firstSegment] ?? t('appName');

  return (
    <>
      <header className="flex lg:hidden items-center h-12 shrink-0 border-b border-border bg-background px-3 gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-5" />
          <span className="sr-only">Open menu</span>
        </Button>

        <span className="flex-1 text-sm font-semibold truncate">{pageTitle}</span>

        {activeAYId && (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {activeAYId}
          </Badge>
        )}
        <ThemeToggle />
      </header>

      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
