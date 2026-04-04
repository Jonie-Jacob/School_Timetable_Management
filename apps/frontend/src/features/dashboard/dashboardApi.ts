import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface DashboardStats {
  academicYear: {
    id: string;
    label: string;
    startDate: string;
    endDate: string;
    status: string;
  };
  counts: {
    classes: number;
    divisions: number;
    teachers: number;
    subjects: number;
    assignments: number;
  };
  timetables: {
    total: number;
    divisionsWithoutTimetable: number;
    byStatus: Record<string, number>;
  };
  unresolvedConflicts: number;
}

export interface SetupStep {
  step: number;
  name: string;
  complete: boolean;
  detail?: string;
}

export interface SetupWizardData {
  steps: SetupStep[];
  totalComplete: number;
  totalSteps: number;
  dismissed: boolean;
  dismissedAt: string | null;
}

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery,
  tagTypes: ['DashboardStats', 'SetupWizard'],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => '/dashboard/stats',
      transformResponse: (response: { data: DashboardStats }) => response.data,
      providesTags: ['DashboardStats'],
    }),
    getSetupWizard: builder.query<SetupWizardData, void>({
      query: () => '/dashboard/setup-wizard',
      transformResponse: (response: { data: SetupWizardData }) => response.data,
      providesTags: ['SetupWizard'],
    }),
    dismissSetupWizard: builder.mutation<{ dismissed: boolean }, void>({
      query: () => ({
        url: '/dashboard/setup-wizard/dismiss',
        method: 'PUT',
      }),
      invalidatesTags: ['SetupWizard'],
    }),
  }),
});

export const {
  useGetDashboardStatsQuery,
  useGetSetupWizardQuery,
  useDismissSetupWizardMutation,
} = dashboardApi;
