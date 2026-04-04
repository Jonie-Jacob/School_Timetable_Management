import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGetNotificationCountQuery } from '@/features/notifications/notificationApi';

export function ConflictPopoverPanel() {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data } = useGetNotificationCountQuery(undefined, { pollingInterval: 60_000 });

  const count = data?.count ?? 0;

  if (count === 0) return null;

  return (
    <div className="w-72 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-warning" />
        <h3 className="font-semibold text-sm">{t('fab.conflictsTitle')}</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('fab.conflictsMessage', { count })}
      </p>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => navigate('/notifications')}
        >
          {t('fab.viewAll')}
        </Button>
      </div>
    </div>
  );
}
