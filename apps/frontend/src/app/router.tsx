import { createBrowserRouter } from 'react-router-dom';

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('@/features/auth/LoginPage'),
  },
  {
    path: '/',
    lazy: () => import('@/app/AuthenticatedLayout'),
    children: [
      {
        index: true,
        lazy: () => import('@/features/dashboard/DashboardPage'),
      },
      // Routes are added incrementally per phase
    ],
  },
]);
