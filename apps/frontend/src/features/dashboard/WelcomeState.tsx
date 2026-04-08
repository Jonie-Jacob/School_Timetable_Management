import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarRange, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WelcomeState() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 backdrop-blur-sm p-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 mb-6">
        <CalendarRange className="size-8" />
      </div>
      <h2 className="text-xl font-bold">{t('welcome.title')}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground leading-relaxed">
        {t('welcome.description')}
      </p>
      <Button
        variant="gradient"
        className="mt-6 gap-2"
        onClick={() => navigate('/academic-years')}
      >
        {t('welcome.cta')}
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}
