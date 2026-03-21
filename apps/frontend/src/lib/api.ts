import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '@/app/store';

const isMockAuth = import.meta.env.VITE_AUTH_MODE !== 'cognito';

export const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '',
  prepareHeaders: (headers, { getState }) => {
    const state = getState() as RootState;
    const token = state.auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const academicYearId = state.auth.activeAcademicYearId;
    if (academicYearId) {
      headers.set('X-Academic-Year-Id', academicYearId);
    }
    // Local dev: send mock auth headers that authMiddleware falls back to
    if (isMockAuth) {
      const schoolId = state.auth.schoolId;
      const userId = state.auth.userId;
      if (schoolId) headers.set('x-school-id', schoolId);
      if (userId) headers.set('x-user-id', userId);
    }
    return headers;
  },
});
