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

// Placeholder academic years until API slice is connected.
// Once Phase 5 (Academic Year Management) wires the RTK Query slice, this
// component will read from the API cache instead of this hard-coded list.
const PLACEHOLDER_YEARS = [
  { id: 'ay-2026-27', name: '2026-27', status: 'active' as const },
  { id: 'ay-2025-26', name: '2025-26', status: 'archived' as const },
];

export function AcademicYearSelector() {
  const dispatch = useAppDispatch();
  const activeId = useAppSelector((state) => state.auth.activeAcademicYearId);

  const selected =
    PLACEHOLDER_YEARS.find((y) => y.id === activeId) ?? PLACEHOLDER_YEARS[0];

  const handleSelect = (id: string, status: string) => {
    dispatch(setActiveAcademicYear(id));
    // Persist archived flag for useReadOnly hook
    localStorage.setItem(`ay-archived-${id}`, String(status === 'archived'));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarRange className="size-4" />
          <span className="hidden sm:inline">{selected.name}</span>
          <Badge
            variant={selected.status === 'active' ? 'success' : 'secondary'}
            className="h-5 px-1.5 text-[10px]"
          >
            {selected.status === 'active' ? 'Active' : 'Archived'}
          </Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {PLACEHOLDER_YEARS.map((year) => (
          <DropdownMenuItem
            key={year.id}
            onClick={() => handleSelect(year.id, year.status)}
            className="gap-2"
          >
            <CalendarRange className="size-4" />
            {year.name}
            <Badge
              variant={year.status === 'active' ? 'success' : 'secondary'}
              className="ml-auto h-5 px-1.5 text-[10px]"
            >
              {year.status === 'active' ? 'Active' : 'Archived'}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
