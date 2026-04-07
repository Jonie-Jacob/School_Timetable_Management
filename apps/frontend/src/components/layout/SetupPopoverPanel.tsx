import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Circle, Lock, ArrowRight } from 'lucide-react';
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
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <Check className="size-3.5" />
      </div>
    );
  }

  const prevComplete = step.step === 1 || steps[step.step - 2].complete;
  if (!prevComplete) {
    return (
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/30">
        <Lock className="size-3" />
      </div>
    );
  }

  return (
    <div className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-amber-400 text-amber-400">
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
    <div className="space-y-3" style={{ width: '340px' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{t('setupWizard.title')}</h3>
        <div className="flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2.5 py-0.5">
          <div className="size-1.5 rounded-full bg-amber-400" />
          <span className="text-[10px] font-medium text-amber-400">
            {totalComplete}/{totalSteps}
          </span>
        </div>
      </div>

      {/* Steps list */}
      <div className="space-y-0.5">
        {steps.map((step) => {
          const prevComplete = step.step === 1 || steps[step.step - 2].complete;
          const isLocked = !step.complete && !prevComplete;
          const isCurrent = currentStep?.step === step.step;

          return (
            <button
              key={step.step}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed overflow-hidden"
              disabled={isLocked}
              onClick={() => {
                if (!isLocked) navigate(STEP_ROUTES[step.step]);
              }}
            >
              <StepIcon step={step} steps={steps} />
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-2">
                  <span className={`truncate ${step.complete ? 'text-white/50 line-through' : 'text-white/90'}`}>
                    {step.name}
                  </span>
                  {isCurrent && (
                    <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-400 shrink-0 whitespace-nowrap">
                      {t('setupWizard.continue')}
                      <ArrowRight className="size-3" />
                    </span>
                  )}
                </div>
                {step.detail && (
                  <p className="text-[10px] text-white/40 truncate">{step.detail}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Dismiss */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full text-white/40 hover:text-white/60 hover:bg-white/5 text-xs"
        onClick={() => dismiss()}
        disabled={isDismissing}
      >
        {t('setupWizard.dismiss')}
      </Button>
    </div>
  );
}
