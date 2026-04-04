import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Circle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  useGetSetupWizardQuery,
  useDismissSetupWizardMutation,
  type SetupStep,
} from '@/features/dashboard/dashboardApi';

const STEP_ROUTES: Record<number, string> = {
  1: '/academic-years',
  2: '/classes',
  3: '/period-structures',
  4: '/subjects',
  5: '/teachers',
  6: '/classes',
  7: '/classes',
};

function StepIcon({ step, steps }: { step: SetupStep; steps: SetupStep[] }) {
  if (step.complete) {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-success text-white">
        <Check className="size-3.5" />
      </div>
    );
  }

  const prevComplete = step.step === 1 || steps[step.step - 2].complete;
  if (!prevComplete) {
    return (
      <div className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-3.5" />
      </div>
    );
  }

  return (
    <div className="flex size-6 items-center justify-center rounded-full border-2 border-primary text-primary">
      <Circle className="size-2.5 fill-current" />
    </div>
  );
}

export function SetupPopoverPanel() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data } = useGetSetupWizardQuery();
  const [dismiss, { isLoading: isDismissing }] = useDismissSetupWizardMutation();

  if (!data) return null;

  const { steps, totalComplete, totalSteps } = data;

  const currentStep = steps.find((s) => !s.complete);

  return (
    <div className="w-72 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{t('setupWizard.title')}</h3>
        <span className="text-xs text-muted-foreground">
          {totalComplete}/{totalSteps}
        </span>
      </div>

      <div className="space-y-1">
        {steps.map((step) => {
          const prevComplete = step.step === 1 || steps[step.step - 2].complete;
          const isLocked = !step.complete && !prevComplete;
          const isCurrent = currentStep?.step === step.step;

          return (
            <button
              key={step.step}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLocked}
              onClick={() => {
                if (!isLocked) navigate(STEP_ROUTES[step.step]);
              }}
            >
              <StepIcon step={step} steps={steps} />
              <div className="flex-1 min-w-0">
                <span className={step.complete ? 'text-muted-foreground line-through' : ''}>
                  {step.name}
                </span>
                {step.detail && (
                  <p className="text-xs text-muted-foreground truncate">{step.detail}</p>
                )}
              </div>
              {isCurrent && (
                <span className="text-xs font-medium text-primary">{t('setupWizard.continue')}</span>
              )}
            </button>
          );
        })}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full text-muted-foreground text-xs"
        onClick={() => dismiss()}
        disabled={isDismissing}
      >
        {t('setupWizard.dismiss')}
      </Button>
    </div>
  );
}
