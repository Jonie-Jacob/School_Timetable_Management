import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface SchoolInfo {
  id: string;
  name: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  email: string | null;
  schoolId: string | null;
  userId: string | null;
  schoolName: string | null;
  schools: SchoolInfo[];
  userRole: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER' | null;
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
  schools: [],
  userRole: null,
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
        schools?: SchoolInfo[];
        userRole?: 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'VIEWER';
      }>,
    ) {
      state.isAuthenticated = true;
      state.isLoading = false;
      state.token = action.payload.token;
      state.email = action.payload.email;
      state.schoolId = action.payload.schoolId;
      state.userId = action.payload.userId;
      state.schoolName = action.payload.schoolName;
      state.schools = action.payload.schools ?? [{ id: action.payload.schoolId, name: action.payload.schoolName }];
      state.userRole = action.payload.userRole ?? 'SCHOOL_ADMIN';
    },
    loggedOut(state) {
      state.isAuthenticated = false;
      state.isLoading = false;
      state.token = null;
      state.email = null;
      state.schoolId = null;
      state.userId = null;
      state.schoolName = null;
      state.schools = [];
      state.userRole = null;
      state.activeAcademicYearId = null;
    },
    authChecked(state) {
      state.isLoading = false;
    },
    setActiveAcademicYear(state, action: PayloadAction<string | null>) {
      state.activeAcademicYearId = action.payload;
    },
    setActiveSchool(state, action: PayloadAction<{ schoolId: string; schoolName: string }>) {
      state.schoolId = action.payload.schoolId;
      state.schoolName = action.payload.schoolName;
      // Reset academic year when switching schools
      state.activeAcademicYearId = null;
    },
  },
});

export const { loggedIn, loggedOut, authChecked, setActiveAcademicYear, setActiveSchool } =
  authSlice.actions;

export default authSlice.reducer;
