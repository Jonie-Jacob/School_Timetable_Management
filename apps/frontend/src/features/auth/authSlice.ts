import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  email: string | null;
  schoolId: string | null;
  userId: string | null;
  schoolName: string | null;
  activeAcademicYearId: string | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: true,
  token: null,
  email: null,
  schoolId: null,
  userId: null,
  schoolName: null,
  activeAcademicYearId: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loggedIn(
      state,
      action: PayloadAction<{
        token: string;
        email: string;
        schoolId: string;
        userId: string;
        schoolName: string;
      }>,
    ) {
      state.isAuthenticated = true;
      state.isLoading = false;
      state.token = action.payload.token;
      state.email = action.payload.email;
      state.schoolId = action.payload.schoolId;
      state.userId = action.payload.userId;
      state.schoolName = action.payload.schoolName;
    },
    loggedOut(state) {
      state.isAuthenticated = false;
      state.isLoading = false;
      state.token = null;
      state.email = null;
      state.schoolId = null;
      state.userId = null;
      state.schoolName = null;
      state.activeAcademicYearId = null;
    },
    authChecked(state) {
      state.isLoading = false;
    },
    setActiveAcademicYear(state, action: PayloadAction<string | null>) {
      state.activeAcademicYearId = action.payload;
    },
  },
});

export const { loggedIn, loggedOut, authChecked, setActiveAcademicYear } =
  authSlice.actions;

export default authSlice.reducer;
