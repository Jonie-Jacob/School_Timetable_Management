import { useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { setWsConnected } from '@/slices/wsSlice';
import { dashboardApi } from '@/features/dashboard/dashboardApi';

const WS_URL = import.meta.env.VITE_WS_URL as string | undefined;
const MAX_RETRIES = 5;

// ── Global event bus for generation progress events ──
// Components can subscribe via useGenerationEvents() hook.
type GenerationEventHandler = (event: { type: string; payload: Record<string, unknown> }) => void;
const generationListeners = new Set<GenerationEventHandler>();

export function onGenerationEvent(handler: GenerationEventHandler) {
  generationListeners.add(handler);
  return () => { generationListeners.delete(handler); };
}

const GENERATION_EVENT_TYPES = new Set([
  'generation_phase',
  'generation_step',
  'division_progress',
  'division_completed',
  'generation_summary',
]);

export function useWebSocket() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const schoolId = useAppSelector((state) => state.auth.schoolId);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const connect = useCallback(() => {
    if (!WS_URL || !token || !schoolId || !isAuthenticated) return;

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(`${WS_URL}?token=${token}&schoolId=${schoolId}`);

      ws.onopen = () => {
        retriesRef.current = 0;
        dispatch(setWsConnected(true));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // Dispatch generation progress events to subscribed components
          if (GENERATION_EVENT_TYPES.has(msg.type)) {
            for (const listener of generationListeners) {
              listener(msg);
            }
          }

          switch (msg.type) {
            case 'GENERATION_COMPLETE':
            case 'generation_completed':
              dispatch(dashboardApi.util.invalidateTags(['DashboardStats']));
              break;
            case 'GENERATION_FAILED':
            case 'generation_failed':
              toast.error(`Generation failed: ${msg.payload?.error ?? 'Unknown error'}`);
              break;
            case 'TIMETABLE_OUTDATED':
              dispatch(dashboardApi.util.invalidateTags(['DashboardStats']));
              break;
            case 'generation_summary':
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
  }, [token, schoolId, isAuthenticated, dispatch]);

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
