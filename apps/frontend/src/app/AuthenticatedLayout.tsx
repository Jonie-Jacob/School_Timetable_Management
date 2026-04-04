import { Navigate } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { AppShell } from '@/components/layout/AppShell';
import { useWebSocket } from '@/hooks/useWebSocket';

export function Component() {
  const { isAuthenticated, isLoading } = useAppSelector((state) => state.auth);

  // Initialize WebSocket connection for real-time updates
  useWebSocket();

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
