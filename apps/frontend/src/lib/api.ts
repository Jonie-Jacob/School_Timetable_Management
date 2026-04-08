import { fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '@/app/store';
import { cognitoGetSession, isCognitoMode } from './cognito-auth';
import { loggedIn, loggedOut } from '@/features/auth/authSlice';

const isMockAuth = import.meta.env.VITE_AUTH_MODE !== 'cognito';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
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

/**
 * Wrapper around fetchBaseQuery that automatically refreshes the Cognito token
 * when a 401 is received. The Cognito SDK's getSession() uses the stored
 * refresh token to get a new idToken transparently.
 */
export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  if (result.error?.status === 401 && isCognitoMode()) {
    // Try refreshing the token
    try {
      const session = await cognitoGetSession();
      const state = api.getState() as RootState;

      // Update the token in Redux
      if (state.auth.email && state.auth.schoolId && state.auth.userId && state.auth.schoolName) {
        api.dispatch(
          loggedIn({
            token: session.idToken,
            email: session.email,
            schoolId: state.auth.schoolId,
            userId: state.auth.userId,
            schoolName: state.auth.schoolName,
          }),
        );
      }

      // Retry the original request with the new token
      result = await rawBaseQuery(args, api, extraOptions);
    } catch {
      // Refresh failed — session is truly expired, force logout
      api.dispatch(loggedOut());
    }
  }

  return result;
};
