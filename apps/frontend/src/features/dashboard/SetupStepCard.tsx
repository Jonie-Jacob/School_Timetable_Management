import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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

  return (
    <Card
      className={cn(
        'transition-all',
        step.complete && 'border-success/30 bg-success/5',
        isLocked && 'opacity-60',
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-primary/10 text-primary">
              {step.complete ? (
                <Check className="size-4 text-success" />
              ) : isLocked ? (
                <Lock className="size-3.5 text-muted-foreground" />
              ) : (
                step.step
              )}
            </span>
            <h3 className="text-sm font-semibold">{title}</h3>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{description}</p>

        {step.detail && (
          <p className="text-xs text-muted-foreground italic">{step.detail}</p>
        )}

        {!isLocked && !step.complete && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => navigate(STEP_ROUTES[step.step])}
          >
            {t('setupWizard.continue')}
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
      </CardContent>
    </Card>
  );
}

export function SetupStepCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-3 w-full bg-muted animate-pulse rounded" />
        <div className="h-8 w-full bg-muted animate-pulse rounded" />
      </CardContent>
    </Card>
  );
}
