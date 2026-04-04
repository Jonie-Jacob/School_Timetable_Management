import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/skeleton';
import type { SetupStep } from './dashboardApi';

const STEP_ROUTES: Record<number, string> = {
  1: '/academic-years',
  2: '/classes',
  3: '/period-structures',
  4: '/subjects',
  5: '/teachers',
  6: '/classes',
  7: '/classes',
};

interface SetupStepperProps {
  steps: SetupStep[];
}

export function SetupStepper({ steps }: SetupStepperProps) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const currentStep = steps.find((s) => !s.complete);

  return (
    <div className="rounded-xl bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 text-white p-4 overflow-x-auto shadow-lg border border-white/10 backdrop-blur-sm">
      <div className="flex items-start min-w-max gap-0">
        {steps.map((step, idx) => {
          const isLast = idx === steps.length - 1;
          const prevComplete = idx === 0 || steps[idx - 1].complete;
          const isLocked = !step.complete && !prevComplete;
          const isCurrent = currentStep?.step === step.step;

          const stepKey = `step${step.step}` as const;
          const label = t(`setupWizard.stepCard.${stepKey}.title`);

          return (
            <div key={step.step} className="flex items-start flex-1 min-w-0">
              {/* Step circle + label */}
              <div className="flex flex-col items-center gap-1.5 min-w-[72px]">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => !isLocked && navigate(STEP_ROUTES[step.step])}
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300',
                    step.complete && 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/25',
                    isCurrent && 'bg-amber-500 text-amber-950 shadow-sm shadow-amber-500/25 ring-4 ring-amber-500/20 animate-pulse',
                    isLocked && 'bg-white/10 text-white/30 cursor-not-allowed',
                    !step.complete && !isCurrent && !isLocked && 'bg-white/10 text-white/50 border border-white/20',
                  )}
                >
                  {step.complete ? (
                    <Check className="size-4" />
                  ) : isLocked ? (
                    <Lock className="size-3" />
                  ) : (
                    step.step
                  )}
                </button>
                <span className={cn(
                  'text-[10px] font-medium text-center leading-tight max-w-[72px]',
                  step.complete ? 'text-emerald-400' : isCurrent ? 'text-amber-400' : 'text-white/40',
                )}>
                  {label}
                </span>
                {isCurrent && (
                  <button
                    type="button"
                    onClick={() => navigate(STEP_ROUTES[step.step])}
                    className="text-[10px] font-semibold text-amber-400 hover:underline"
                  >
                    Continue
                  </button>
                )}
              </div>

              {/* Connecting line */}
              {!isLast && (
                <div className="flex-1 flex items-center pt-4 px-1 min-w-[24px]">
                  <div
                    className={cn(
                      'h-[2px] w-full rounded-full transition-colors',
                      step.complete && steps[idx + 1]?.complete
                        ? 'bg-emerald-500/50'
                        : step.complete
                          ? 'bg-gradient-to-r from-emerald-500/50 to-border'
                          : 'bg-white/15',
                    )}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SetupStepperSkeleton() {
  return (
    <div className="rounded-xl bg-gradient-to-r from-stone-900 via-stone-800 to-stone-900 p-4 shadow-lg border border-white/10">
      <div className="flex items-center gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center flex-1">
            <Skeleton className="size-8 rounded-full" />
            {i < 6 && <Skeleton className="h-0.5 flex-1 mx-1" />}
          </div>
        ))}
      </div>
    </div>
  );
}
