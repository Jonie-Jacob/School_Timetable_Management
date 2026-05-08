import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, ArrowLeft, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MobileDrawer } from './MobileDrawer';
import { Badge } from '@/components/ui/badge';
import { useAppSelector } from '@/app/hooks';
import { useGetAcademicYearsQuery } from '@/features/academic-years/academicYearApi';

const SEGMENT_LABELS: Record<string, string> = {
  '': 'Dashboard',
  'academic-years': 'Academic Years',
  'period-structures': 'Period Structures',
  classes: 'Classes',
  subjects: 'Subjects',
  teachers: 'Teachers',
  'elective-groups': 'Elective Groups',
  timetables: 'Timetables',
  'teacher-timetable': 'Teacher Timetable',
  settings: 'Settings',
};

export function MobileHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeAYId = useAppSelector((s) => s.auth.activeAcademicYearId);

  const { data: ayData } = useGetAcademicYearsQuery({ pageSize: 50 });
  const years = ayData?.data ?? [];
  const activeYear = years.find((y) => y.id === activeAYId) ?? years.find((y) => y.status === 'ACTIVE');

  const segments = location.pathname.split('/').filter(Boolean);
  const firstSegment = segments[0] ?? '';
  const pageTitle = SEGMENT_LABELS[firstSegment] ?? t('appName');
  const isSubPage = segments.length > 1;

  return (
    <>
      <header className="flex lg:hidden items-center h-12 shrink-0 border-b border-border/50 backdrop-blur-xl bg-background/80 px-3 gap-2">
        {isSubPage ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="size-5" />
            <span className="sr-only">Go back</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="size-5" />
            <span className="sr-only">Open menu</span>
          </Button>
        )}

        <span className="flex-1 text-sm font-semibold truncate">{pageTitle}</span>

        {activeYear && (
          <Badge variant="outline" className="text-[10px] shrink-0 gap-1">
            <CalendarRange className="size-3" />
            {activeYear.label}
            {activeYear.status === 'ACTIVE' && (
              <span className="text-emerald-600">Active</span>
            )}
          </Badge>
        )}
      </header>

      <MobileDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
