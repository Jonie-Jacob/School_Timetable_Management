import { Building2 } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { setActiveSchool, setActiveAcademicYear } from '@/features/auth/authSlice';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { academicYearApi } from '@/features/academic-years/academicYearApi';
import { classApi } from '@/features/classes/classApi';
import { configApi } from '@/features/period-structures/configApi';
import { subjectApi } from '@/features/subjects/subjectApi';
import { teacherApi } from '@/features/teachers/teacherApi';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { notificationApi } from '@/features/notifications/notificationApi';
import { timetableApi } from '@/features/timetable/timetableApi';

export function SchoolSelector() {
  const dispatch = useAppDispatch();
  const schools = useAppSelector((state) => state.auth.schools);
  const activeSchoolId = useAppSelector((state) => state.auth.schoolId);

  // Don't render if user has only 1 school
  if (schools.length <= 1) return null;

  const selected = schools.find((s) => s.id === activeSchoolId) ?? schools[0];

  const handleSelect = (schoolId: string, schoolName: string) => {
    if (schoolId === activeSchoolId) return;

    dispatch(setActiveSchool({ schoolId, schoolName }));
    dispatch(setActiveAcademicYear(null));
    localStorage.setItem('active-school-id', schoolId);

    // Invalidate all RTK Query caches — new school means different data
    dispatch(academicYearApi.util.resetApiState());
    dispatch(classApi.util.resetApiState());
    dispatch(configApi.util.resetApiState());
    dispatch(subjectApi.util.resetApiState());
    dispatch(teacherApi.util.resetApiState());
    dispatch(dashboardApi.util.resetApiState());
    dispatch(notificationApi.util.resetApiState());
    dispatch(timetableApi.util.resetApiState());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="gap-2 h-8 rounded-lg border border-white/15 bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
        >
          <Building2 className="size-4 text-white/60" />
          <span className="hidden sm:inline max-w-[150px] truncate font-semibold">{selected?.name ?? '—'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {schools.map((school) => (
          <DropdownMenuItem
            key={school.id}
            onClick={() => handleSelect(school.id, school.name)}
            className={`gap-2 ${school.id === activeSchoolId ? 'bg-accent' : ''}`}
          >
            <Building2 className="size-4" />
            {school.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
