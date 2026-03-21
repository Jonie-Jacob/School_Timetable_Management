import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WelcomeState() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 p-12 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-6">
        <CalendarRange className="size-8" />
      </div>
      <h2 className="text-xl font-bold">{t('welcome.title')}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {t('welcome.description')}
      </p>
      <Button
        variant="gradient"
        className="mt-6"
        onClick={() => navigate('/academic-years')}
      >
        {t('welcome.cta')}
      </Button>
    </div>
  );
}
