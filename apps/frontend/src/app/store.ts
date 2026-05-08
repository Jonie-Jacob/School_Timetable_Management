import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer from '@/features/auth/authSlice';
import wsReducer from '@/slices/wsSlice';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { academicYearApi } from '@/features/academic-years/academicYearApi';
import { configApi } from '@/features/period-structures/configApi';
import { subjectApi } from '@/features/subjects/subjectApi';
import { teacherApi } from '@/features/teachers/teacherApi';
import { classApi } from '@/features/classes/classApi';
import { electiveGroupApi } from '@/features/elective-groups/electiveGroupApi';
import { assignmentApi } from '@/features/assignments/assignmentApi';
import { timetableApi } from '@/features/timetable/timetableApi';
import { exportApi } from '@/features/export/exportApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ws: wsReducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [academicYearApi.reducerPath]: academicYearApi.reducer,
    [configApi.reducerPath]: configApi.reducer,
    [subjectApi.reducerPath]: subjectApi.reducer,
    [teacherApi.reducerPath]: teacherApi.reducer,
    [classApi.reducerPath]: classApi.reducer,
    [electiveGroupApi.reducerPath]: electiveGroupApi.reducer,
    [assignmentApi.reducerPath]: assignmentApi.reducer,
    [timetableApi.reducerPath]: timetableApi.reducer,
    [exportApi.reducerPath]: exportApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(dashboardApi.middleware)
      .concat(academicYearApi.middleware)
      .concat(configApi.middleware)
      .concat(subjectApi.middleware)
      .concat(teacherApi.middleware)
      .concat(classApi.middleware)
      .concat(electiveGroupApi.middleware)
      .concat(assignmentApi.middleware)
      .concat(timetableApi.middleware)
      .concat(exportApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
