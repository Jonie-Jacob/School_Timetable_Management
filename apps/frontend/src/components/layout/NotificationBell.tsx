import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGetNotificationCountQuery } from '@/features/notifications/notificationApi';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Topbar notification bell. Polls /notifications/count every 60s and shows
 * a red pill with the unread count when > 0. Click navigates to the
 * notifications page.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const { data } = useGetNotificationCountQuery(undefined, { pollingInterval: 60_000 });
  const count = data?.count ?? 0;
  const hasUnread = count > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 rounded-lg text-white hover:bg-white/10 hover:text-white"
          onClick={() => navigate('/notifications')}
          aria-label={`Notifications${hasUnread ? ` (${count} unread)` : ''}`}
        >
          <Bell className="size-4" />
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-stone-800">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {hasUnread ? `${count} unread notification${count === 1 ? '' : 's'}` : 'No new notifications'}
      </TooltipContent>
    </Tooltip>
  );
}
