import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setWsConnected } from '@/slices/wsSlice';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { notificationApi } from '@/features/notifications/notificationApi';

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;
const MAX_RETRIES = 5;

export function useWebSocket() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!WS_URL || !token || !isAuthenticated) return;

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}`);

      ws.onopen = () => {
        retriesRef.current = 0;
        dispatch(setWsConnected(true));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'GENERATION_COMPLETE':
              dispatch(dashboardApi.util.invalidateTags(['DashboardStats', 'SetupWizard']));
              dispatch(notificationApi.util.invalidateTags(['NotificationCount']));
              toast.success('Timetable generated successfully!');
              break;
            case 'GENERATION_FAILED':
              toast.error(`Generation failed: ${msg.payload?.error ?? 'Unknown error'}`);
              break;
            case 'TIMETABLE_OUTDATED':
              dispatch(notificationApi.util.invalidateTags(['NotificationCount']));
              dispatch(dashboardApi.util.invalidateTags(['DashboardStats']));
              break;
          }
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onerror = () => {
        // Error handled via onclose
      };

      ws.onclose = () => {
        dispatch(setWsConnected(false));
        wsRef.current = null;

        if (retriesRef.current < MAX_RETRIES && isAuthenticated) {
          const delay = Math.min(1000 * 2 ** retriesRef.current, 30_000);
          timeoutRef.current = setTimeout(() => {
            retriesRef.current++;
            connect();
          }, delay);
        }
      };

      wsRef.current = ws;
    } catch {
      // WebSocket construction can fail if URL is invalid
      dispatch(setWsConnected(false));
    }
  }, [token, isAuthenticated, dispatch]);

  useEffect(() => {
    connect();

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
