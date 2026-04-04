import { useBreakpoint } from '@/hooks/useBreakpoint';
import { AcademicYearSelector } from './AcademicYearSelector';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function TopBar() {
  const isXl = useBreakpoint('xl');

  return (
    <header className="hidden lg:flex items-center h-14 shrink-0 border-b border-border/50 backdrop-blur-xl bg-background/80 px-4 gap-4">
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
        <AcademicYearSelector />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
