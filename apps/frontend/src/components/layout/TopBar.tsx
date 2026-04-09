import { useBreakpoint } from '@/hooks/useBreakpoint';
import { SchoolSelector } from './SchoolSelector';
import { AcademicYearSelector } from './AcademicYearSelector';
import { UserMenu } from './UserMenu';

export function TopBar() {
  const isXl = useBreakpoint('xl');

  return (
    <header className="hidden lg:flex items-center h-14 shrink-0 bg-gradient-to-r from-stone-800 via-stone-700 to-stone-800 text-white px-4 gap-4 shadow-sm">
      {/* Left — logo only shows when sidebar is collapsed (lg but not xl) */}
      {!isXl && (
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-amber-500 font-bold text-amber-950 text-xs shadow-sm">
            ST
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <SchoolSelector />
        <AcademicYearSelector />
        <UserMenu />
      </div>
    </header>
  );
}
