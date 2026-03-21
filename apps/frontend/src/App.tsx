import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GlobalErrorBoundary } from '@/components/shared/GlobalErrorBoundary';
import { store } from '@/app/store';
import { router } from '@/app/router';
import { loggedIn, authChecked } from '@/features/auth/authSlice';
import { mockGetSession } from '@/lib/mock-auth';
import '@/i18n';

function AuthInit() {
  useEffect(() => {
    mockGetSession()
      .then((user) => store.dispatch(loggedIn(user)))
      .catch(() => store.dispatch(authChecked()));
  }, []);
  return null;
}

export default function App() {
  return (
    <GlobalErrorBoundary>
      <Provider store={store}>
        <AuthInit />
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </Provider>
    </GlobalErrorBoundary>
  );
}
