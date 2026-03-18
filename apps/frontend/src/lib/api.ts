import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { RootState } from '@/app/store';

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
    return headers;
  },
});
