import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReadOnly } from '@/hooks/useReadOnly';
import { useAppSelector } from '@/app/hooks';

export function ReadOnlyBanner() {
  const { t } = useTranslation();
  const isReadOnly = useReadOnly();
  const activeId = useAppSelector((state) => state.auth.activeAcademicYearId);

  if (!isReadOnly) return null;

  return (
    <div className="flex items-center gap-2 bg-warning/15 px-4 py-2 text-sm text-warning border-b border-warning/25">
      <AlertTriangle className="size-4 shrink-0" />
      <span>{t('readOnly.banner', { year: activeId ?? '' })}</span>
    </div>
  );
}
