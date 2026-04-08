import { CalendarRange } from 'lucide-react';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { setActiveAcademicYear } from '@/features/auth/authSlice';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useGetAcademicYearsQuery } from '@/features/academic-years/academicYearApi';

export function AcademicYearSelector() {
  const dispatch = useAppDispatch();
  const activeId = useAppSelector((state) => state.auth.activeAcademicYearId);

  const { data } = useGetAcademicYearsQuery({ pageSize: 50 });
  const years = data?.data ?? [];

  // Auto-select the active year if none is set
  const activeYear = years.find((y) => y.status === 'ACTIVE');
  const selected = years.find((y) => y.id === activeId) ?? activeYear ?? years[0];

  // If no active ID is set but we found an active year, set it
  if (!activeId && activeYear) {
    dispatch(setActiveAcademicYear(activeYear.id));
  }

  if (years.length === 0) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled>
        <CalendarRange className="size-4" />
        <span className="hidden sm:inline text-muted-foreground">No Academic Year</span>
      </Button>
    );
  }

  const handleSelect = (id: string, status: string) => {
    dispatch(setActiveAcademicYear(id));
    localStorage.setItem(`ay-archived-${id}`, String(status === 'ARCHIVED'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarRange className="size-4" />
          <span className="hidden sm:inline">{selected?.label ?? '—'}</span>
          {selected && (
            <Badge
              variant={selected.status === 'ACTIVE' ? 'success' : 'secondary'}
              className="h-5 px-1.5 text-[10px]"
            >
              {selected.status === 'ACTIVE' ? 'Active' : 'Archived'}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {years.map((year) => (
          <DropdownMenuItem
            key={year.id}
            onClick={() => handleSelect(year.id, year.status)}
            className="gap-2"
          >
            <CalendarRange className="size-4" />
            {year.label}
            <Badge
              variant={year.status === 'ACTIVE' ? 'success' : 'secondary'}
              className="ml-auto h-5 px-1.5 text-[10px]"
            >
              {year.status === 'ACTIVE' ? 'Active' : 'Archived'}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
