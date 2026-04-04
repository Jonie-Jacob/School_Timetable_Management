import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useGetSetupWizardQuery } from '@/features/dashboard/dashboardApi';
import { useGetNotificationCountQuery } from '@/features/notifications/notificationApi';
import { SetupPopoverPanel } from './SetupPopoverPanel';
import { ConflictPopoverPanel } from './ConflictPopoverPanel';

type FabMode = 'setup' | 'conflict' | 'hidden';

function useFabMode(): { mode: FabMode; setupProgress: string; conflictCount: number } {
  const { data: wizard } = useGetSetupWizardQuery();
  const { data: notifications } = useGetNotificationCountQuery(undefined, {
    pollingInterval: 60_000,
  });

  const conflictCount = notifications?.count ?? 0;

  if (wizard && !wizard.dismissed && wizard.totalComplete < wizard.totalSteps) {
    return {
      mode: 'setup',
      setupProgress: `${wizard.totalComplete}/${wizard.totalSteps}`,
      conflictCount,
    };
  }

  if (conflictCount > 0) {
    return { mode: 'conflict', setupProgress: '', conflictCount };
  }

  return { mode: 'hidden', setupProgress: '', conflictCount: 0 };
}

function SetupProgressRing({ progress, total }: { progress: number; total: number }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const pct = total > 0 ? progress / total : 0;
  const offset = circumference * (1 - pct);

  return (
    <svg className="size-12 -rotate-90" viewBox="0 0 44 44">
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-white/25"
      />
      <circle
        cx="22"
        cy="22"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-white transition-all duration-500"
      />
    </svg>
  );
}

export function FloatingActionButton() {
  const { t } = useTranslation('dashboard');
  const isDesktop = useBreakpoint('lg');
  const [open, setOpen] = useState(false);
  const { mode, setupProgress, conflictCount } = useFabMode();

  if (mode === 'hidden') {
    return (
      <div className="fixed bottom-6 right-6 z-50 lg:bottom-8 lg:right-8 max-lg:bottom-20">
        <div className="flex size-10 items-center justify-center rounded-full bg-success/90 text-white shadow-lg">
          <CheckCircle2 className="size-5" />
        </div>
      </div>
    );
  }

  const triggerButton = (
    <button
      className={cn(
        'flex items-center justify-center rounded-full shadow-lg transition-all',
        'hover:scale-105 active:scale-95',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        mode === 'setup' && 'size-14 bg-primary text-white',
        mode === 'conflict' && 'size-12 bg-warning text-white',
      )}
      aria-label={mode === 'setup' ? t('fab.setupLabel') : t('fab.conflictLabel')}
    >
      {mode === 'setup' && (
        <div className="relative flex items-center justify-center">
          <SetupProgressRing
            progress={parseInt(setupProgress.split('/')[0])}
            total={parseInt(setupProgress.split('/')[1])}
          />
          <span className="absolute text-xs font-bold">{setupProgress}</span>
        </div>
      )}
      {mode === 'conflict' && (
        <span className="text-sm font-bold">{conflictCount}</span>
      )}
    </button>
  );

  if (isDesktop) {
    return (
      <div className="fixed bottom-8 right-8 z-50">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
          <PopoverContent side="top" align="end" className="p-4">
            {mode === 'setup' ? <SetupPopoverPanel /> : <ConflictPopoverPanel />}
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className="fixed bottom-20 right-4 z-50">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{triggerButton}</SheetTrigger>
        <SheetContent side="bottom" className="p-4 pb-8">
          {mode === 'setup' ? <SetupPopoverPanel /> : <ConflictPopoverPanel />}
        </SheetContent>
      </Sheet>
    </div>
  );
}
