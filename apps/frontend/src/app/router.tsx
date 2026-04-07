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
        path: 'period-structures/new',
        lazy: () => import('@/features/period-structures/PeriodStructureEditor'),
      },
      {
        path: 'period-structures/:id',
        lazy: () => import('@/features/period-structures/PeriodStructureEditor'),
      },
      {
        path: 'classes',
        lazy: () => import('@/features/classes/ClassesPage'),
      },
      {
        path: 'classes/:id',
        lazy: () => import('@/features/classes/ClassDetailPage'),
      },
      {
        path: 'classes/:classId/divisions/:divisionId/assignments',
        lazy: () => import('@/features/assignments/AssignmentEditorPage'),
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
        path: 'teachers/new',
        lazy: () => import('@/features/teachers/TeacherFormPage'),
      },
      {
        path: 'teachers/:id/edit',
        lazy: () => import('@/features/teachers/TeacherFormPage'),
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
