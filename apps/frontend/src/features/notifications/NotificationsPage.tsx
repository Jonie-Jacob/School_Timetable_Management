import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, X, AlertTriangle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader, ConfirmDialog } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useGetNotificationsQuery,
  useDismissNotificationMutation,
  useDismissAllNotificationsMutation,
} from './notificationApi';

const TYPE_COLORS: Record<string, string> = {
  TEACHER_REMOVED: 'destructive',
  SUBJECT_REMOVED: 'destructive',
  ASSIGNMENT_REMOVED: 'destructive',
  SLOT_STRUCTURE_CHANGED: 'destructive',
  TEACHER_AVAILABILITY_CHANGED: 'warning',
  WEIGHTAGE_CHANGED: 'warning',
  ELECTIVE_GROUP_CHANGED: 'warning',
};

export function Component() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 20;

  const { data, isLoading } = useGetNotificationsQuery({ page: pageIndex + 1, pageSize });
  const [dismissOne] = useDismissNotificationMutation();
  const [dismissAll, { isLoading: isDismissingAll }] = useDismissAllNotificationsMutation();

  const [confirmDismissAll, setConfirmDismissAll] = useState(false);

  const notifications = data?.data ?? [];
  const meta = data?.meta;

  const handleDismiss = async (id: string) => {
    try {
      await dismissOne(id).unwrap();
      toast.success('Notification dismissed.');
    } catch {
      toast.error('Failed to dismiss notification.');
    }
  };

  const handleDismissAll = async () => {
    try {
      await dismissAll().unwrap();
      toast.success('All notifications dismissed.');
      setConfirmDismissAll(false);
    } catch {
      toast.error('Failed to dismiss notifications.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Affected timetables and conflict alerts."
        actions={
          notifications.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setConfirmDismissAll(true)}>
              {t('actions.dismissAll')}
            </Button>
          ) : undefined
        }
      />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      )}

      {!isLoading && notifications.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-emerald-500/20 bg-emerald-500/5 backdrop-blur-sm p-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 mb-4">
            <CheckCircle2 className="size-7" />
          </div>
          <h3 className="text-lg font-semibold">All clear</h3>
          <p className="mt-1 text-sm text-muted-foreground">No unresolved timetable conflicts. All timetables are up to date.</p>
        </div>
      )}

      {!isLoading && notifications.length > 0 && (
        <div className="space-y-2">
          {notifications.map((notif) => {
            const badgeVariant = (TYPE_COLORS[notif.type] ?? 'outline') as 'destructive' | 'warning' | 'outline';
            const division = notif.timetable?.division;
            const className = division?.class?.name ?? '';
            const divLabel = division?.label ?? '';

            return (
              <div
                key={notif.id}
                className="rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm p-4 flex items-start gap-4 transition-all duration-300 hover:shadow-sm hover:border-amber-500/20"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 mt-0.5">
                  <AlertTriangle className="size-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{className} — Division {divLabel}</span>
                    <Badge variant={badgeVariant} className="text-[10px]">
                      {notif.type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{notif.message}</p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {new Date(notif.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {division && (
                    <Button
                      variant="outline"
                      size="xs"
                      className="text-[10px] gap-1"
                      onClick={() => navigate(`/classes/${division.class.id}/divisions/${division.id}/timetable`)}
                    >
                      <ExternalLink className="size-3" />
                      Edit TT
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-xs" onClick={() => handleDismiss(notif.id)} title="Dismiss">
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}

          {/* Simple pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">{meta.totalCount} notification(s)</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={pageIndex === 0} onClick={() => setPageIndex((p) => p - 1)}>
                  {t('pagination.previous')}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {t('pagination.page')} {pageIndex + 1} {t('pagination.of')} {meta.totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={pageIndex >= meta.totalPages - 1} onClick={() => setPageIndex((p) => p + 1)}>
                  {t('pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDismissAll}
        title="Dismiss All Notifications"
        description="Are you sure you want to dismiss all notifications? Affected timetables will remain in their current state."
        confirmLabel={t('actions.dismissAll')}
        variant="destructive"
        loading={isDismissingAll}
        onConfirm={handleDismissAll}
        onCancel={() => setConfirmDismissAll(false)}
      />
    </div>
  );
}
