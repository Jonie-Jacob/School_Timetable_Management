import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
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

interface SetupStepCardProps {
  step: SetupStep;
  isLocked: boolean;
}

export function SetupStepCard({ step, isLocked }: SetupStepCardProps) {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const stepKey = `step${step.step}` as const;
  const title = t(`setupWizard.stepCard.${stepKey}.title`);
  const description = t(`setupWizard.stepCard.${stepKey}.description`);

  const isCurrent = !step.complete && !isLocked;

  return (
    <div
      className={cn(
        'rounded-xl border border-border/50 bg-card backdrop-blur-sm p-4 space-y-3 transition-all duration-300',
        step.complete && 'border-emerald-500/20 bg-emerald-500/5',
        isCurrent && 'border-amber-500/30 shadow-sm shadow-amber-500/5',
        isLocked && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
            step.complete
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : isCurrent
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                : 'bg-muted text-muted-foreground',
          )}
        >
          {step.complete ? (
            <Check className="size-4" />
          ) : isLocked ? (
            <Lock className="size-3.5" />
          ) : (
            step.step
          )}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>

      {step.detail && (
        <p className="text-xs text-muted-foreground italic">{step.detail}</p>
      )}

      {isCurrent && (
        <Button
          size="sm"
          className="w-full gap-2"
          onClick={() => navigate(STEP_ROUTES[step.step])}
        >
          {t('setupWizard.continue')}
          <ArrowRight className="size-3.5" />
        </Button>
      )}

      {step.complete && (
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={() => navigate(STEP_ROUTES[step.step])}
        >
          Review
        </Button>
      )}
    </div>
  );
}

export function SetupStepCardSkeleton() {
  return (
    <div className="rounded-xl border border-border/50 bg-card backdrop-blur-sm p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-muted animate-pulse" />
        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
      </div>
      <div className="h-3 w-full bg-muted animate-pulse rounded" />
      <div className="h-8 w-full bg-muted animate-pulse rounded-lg" />
    </div>
  );
}
