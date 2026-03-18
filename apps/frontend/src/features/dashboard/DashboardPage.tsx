import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>
      <p className="mt-2 text-muted-foreground">Dashboard — Phase 4</p>
    </div>
  );
}
