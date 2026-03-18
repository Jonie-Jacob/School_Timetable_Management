import { RouterProvider } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GlobalErrorBoundary } from '@/components/shared/GlobalErrorBoundary';
import { store } from '@/app/store';
import { router } from '@/app/router';
import '@/i18n';

export default function App() {
  return (
    <GlobalErrorBoundary>
      <Provider store={store}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster richColors position="top-right" />
        </TooltipProvider>
      </Provider>
    </GlobalErrorBoundary>
  );
}
