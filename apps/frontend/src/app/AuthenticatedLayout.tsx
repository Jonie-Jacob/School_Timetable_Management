import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { loggedIn, authChecked } from '@/features/auth/authSlice';
import { AppShell } from '@/components/layout/AppShell';
import { useWebSocket } from '@/hooks/useWebSocket';
import { isCognitoMode, cognitoGetSession } from '@/lib/cognito-auth';
import { mockGetSession } from '@/lib/mock-auth';

const SESSION_KEY = 'app-session';

interface StoredSession {
  email: string;
  schoolId: string;
  userId: string;
  schoolName: string;
}

/** Save session data to localStorage for fast restore on page refresh */
export function saveSessionData(data: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

function loadSessionData(): StoredSession | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function clearSessionData() {
  localStorage.removeItem(SESSION_KEY);
}

export function Component() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, isLoading } = useAppSelector((state) => state.auth);

  useWebSocket();

  // Restore session on mount
  useEffect(() => {
    if (isAuthenticated) return;

    (async () => {
      try {
        if (isCognitoMode()) {
          // Try Cognito session (persisted by SDK in localStorage)
          const session = await cognitoGetSession();
          // Load school info from our localStorage cache (avoids /auth/me call)
          const cached = loadSessionData();
          if (cached) {
            dispatch(loggedIn({
              token: session.idToken,
              email: session.email,
              schoolId: cached.schoolId,
              userId: session.sub,
              schoolName: cached.schoolName,
            }));
            return;
          }
          // No cached school data — try /auth/login to get it
          const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: session.email, password: 'refresh' }),
          });
          if (resp.ok) {
            const data = await resp.json();
            const schoolId = data.data?.school?.id || '';
            const schoolName = data.data?.school?.name || session.email;
            saveSessionData({ email: session.email, schoolId, userId: session.sub, schoolName });
            dispatch(loggedIn({
              token: session.idToken,
              email: session.email,
              schoolId,
              userId: session.sub,
              schoolName,
            }));
            return;
          }
        } else {
          const user = await mockGetSession();
          dispatch(loggedIn(user));
          return;
        }
      } catch {
        // No valid session — user needs to log in
      }
      dispatch(authChecked());
    })();
  }, [dispatch, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppShell />;
}
