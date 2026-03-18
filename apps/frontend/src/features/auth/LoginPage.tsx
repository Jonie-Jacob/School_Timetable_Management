import { useTranslation } from 'react-i18next';

export function Component() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">
          {t('appName')}
        </h1>
        <p className="mt-2 text-muted-foreground">Login page — Phase 3</p>
      </div>
    </div>
  );
}
