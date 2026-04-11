import { createBrowserRouter } from 'react-router-dom';
import { RouteErrorBoundary } from './RouteErrorBoundary';

export const router = createBrowserRouter([
  {
    path: '/login',
    lazy: () => import('@/features/auth/LoginPage'),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/',
    lazy: () => import('@/app/AuthenticatedLayout'),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        index: true,
        lazy: () => import('@/features/dashboard/DashboardPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'academic-years',
        lazy: () => import('@/features/academic-years/AcademicYearsPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'period-structures',
        lazy: () => import('@/features/period-structures/PeriodStructuresPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'period-structures/new',
        lazy: () => import('@/features/period-structures/PeriodStructureEditor'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'period-structures/:id',
        lazy: () => import('@/features/period-structures/PeriodStructureEditor'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'classes',
        lazy: () => import('@/features/classes/ClassesPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'classes/:id',
        lazy: () => import('@/features/classes/ClassDetailPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'classes/:classId/divisions/:divisionId/assignments',
        lazy: () => import('@/features/assignments/AssignmentEditorPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'timetables',
        lazy: () => import('@/features/timetable/TimetablesOverviewPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'classes/:classId/divisions/:divisionId/generate',
        lazy: () => import('@/features/timetable/GeneratorPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'classes/:classId/divisions/:divisionId/timetable',
        lazy: () => import('@/features/timetable/TimetableViewPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'subjects',
        lazy: () => import('@/features/subjects/SubjectsPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'teachers',
        lazy: () => import('@/features/teachers/TeachersPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'teachers/new',
        lazy: () => import('@/features/teachers/TeacherFormPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'teachers/:id/edit',
        lazy: () => import('@/features/teachers/TeacherFormPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'elective-groups',
        lazy: () => import('@/features/elective-groups/ElectiveGroupsPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'notifications',
        lazy: () => import('@/features/notifications/NotificationsPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'teacher-timetable',
        lazy: () => import('@/features/teacher-timetable/TeacherTimetablePage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'unassigned-subjects',
        lazy: () => import('@/features/unassigned/UnassignedSubjectsPage'),
        errorElement: <RouteErrorBoundary />,
      },
      {
        path: 'settings',
        lazy: () => import('@/features/settings/SettingsPage'),
        errorElement: <RouteErrorBoundary />,
      },
    ],
  },
]);
