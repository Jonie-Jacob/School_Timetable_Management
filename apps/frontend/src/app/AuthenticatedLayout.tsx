import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '@/app/hooks';
import { loggedIn, authChecked } from '@/features/auth/authSlice';
import { AppShell } from '@/components/layout/AppShell';
import { useWebSocket } from '@/hooks/useWebSocket';
import { isCognitoMode, cognitoGetSession } from '@/lib/cognito-auth';
import { mockGetSession } from '@/lib/mock-auth';

const SESSION_KEY = 'app-session';

export interface StoredSession {
  email: string;
  schoolId: string;
  userId: string;
  schoolName: string;
  schools?: Array<{ id: string; name: string }>;
  userRole?: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER';
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
  const location = useLocation();
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
              schools: cached.schools,
              userRole: cached.userRole,
            }));
            return;
          }
          // No cached school data -- call /auth/login to get schools list
          const resp = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: session.email, password: 'refresh' }),
          });
          if (resp.ok) {
            const data = await resp.json();
            const schools: Array<{ id: string; name: string }> = data.data?.schools ?? [];
            const userRole = data.data?.user?.role ?? 'SCHOOL_ADMIN';
            const defaultSchool = schools[0];
            const schoolId = defaultSchool?.id || '';
            const schoolName = defaultSchool?.name || session.email;
            saveSessionData({ email: session.email, schoolId, userId: session.sub, schoolName, schools, userRole });
            dispatch(loggedIn({
              token: session.idToken,
              email: session.email,
              schoolId,
              userId: session.sub,
              schoolName,
              schools,
              userRole,
            }));
            return;
          }
        } else {
          const user = await mockGetSession();
          dispatch(loggedIn(user));
          return;
        }
      } catch {
        // No valid session -- user needs to log in
      }
      dispatch(authChecked());
    })();
    // Only run once on mount; we intentionally omit isAuthenticated from deps
    // so this doesn't re-run after login.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Remember where the user was trying to go so LoginPage can send them
    // back there after a successful sign-in (instead of the dashboard).
    const intended = location.pathname + location.search + location.hash;
    return <Navigate to="/login" replace state={{ from: intended }} />;
  }

  return <AppShell />;
}
