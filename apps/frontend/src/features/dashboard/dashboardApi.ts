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
    notGenerated: number;
    valid: number;
    emptySlots: number;
    excessAssignments: number;
    teacherConflict: number;
    availabilityViolation: number;
    preferenceViolationHard: number;
    preferenceViolationSoft: number;
    orphanedSlots: number;
  };
}

export const dashboardApi = createApi({
  reducerPath: 'dashboardApi',
  baseQuery,
  tagTypes: ['DashboardStats'],
  endpoints: (builder) => ({
    getDashboardStats: builder.query<DashboardStats, void>({
      query: () => 'dashboard/stats',
      transformResponse: (response: { data: DashboardStats }) => response.data,
      providesTags: ['DashboardStats'],
    }),
  }),
});

export const {
  useGetDashboardStatsQuery,
} = dashboardApi;
