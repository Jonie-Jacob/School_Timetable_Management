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
      {
        path: 'academic-years',
        lazy: () => import('@/features/academic-years/AcademicYearsPage'),
      },
      {
        path: 'period-structures',
        lazy: () => import('@/features/period-structures/PeriodStructuresPage'),
      },
      {
        path: 'classes',
        lazy: () => import('@/features/classes/ClassesPage'),
      },
      {
        path: 'subjects',
        lazy: () => import('@/features/subjects/SubjectsPage'),
      },
      {
        path: 'teachers',
        lazy: () => import('@/features/teachers/TeachersPage'),
      },
      {
        path: 'elective-groups',
        lazy: () => import('@/features/elective-groups/ElectiveGroupsPage'),
      },
      {
        path: 'notifications',
        lazy: () => import('@/features/notifications/NotificationsPage'),
      },
      {
        path: 'teacher-timetable',
        lazy: () => import('@/features/teacher-timetable/TeacherTimetablePage'),
      },
      {
        path: 'settings',
        lazy: () => import('@/features/settings/SettingsPage'),
      },
    ],
  },
]);
