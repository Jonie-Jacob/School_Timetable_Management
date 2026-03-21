import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface ConflictBannerProps {
  count: number;
}

export function ConflictBanner({ count }: ConflictBannerProps) {
  const { t } = useTranslation('dashboard');

  if (count <= 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/25 bg-warning/10 p-4">
      <AlertTriangle className="size-5 text-warning shrink-0" />
      <p className="text-sm text-warning flex-1">
        {t('conflictBanner.message', { count })}
      </p>
      <Link
        to="/notifications"
        className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
      >
        {t('conflictBanner.viewNotifications')}
      </Link>
    </div>
  );
}
