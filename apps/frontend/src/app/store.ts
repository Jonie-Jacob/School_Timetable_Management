import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import authReducer from '@/features/auth/authSlice';
import wsReducer from '@/slices/wsSlice';
import { dashboardApi } from '@/features/dashboard/dashboardApi';
import { academicYearApi } from '@/features/academic-years/academicYearApi';
import { configApi } from '@/features/period-structures/configApi';
import { subjectApi } from '@/features/subjects/subjectApi';
import { notificationApi } from '@/features/notifications/notificationApi';
import { teacherApi } from '@/features/teachers/teacherApi';
import { classApi } from '@/features/classes/classApi';
import { electiveGroupApi } from '@/features/elective-groups/electiveGroupApi';
import { assignmentApi } from '@/features/assignments/assignmentApi';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    ws: wsReducer,
    [dashboardApi.reducerPath]: dashboardApi.reducer,
    [academicYearApi.reducerPath]: academicYearApi.reducer,
    [configApi.reducerPath]: configApi.reducer,
    [subjectApi.reducerPath]: subjectApi.reducer,
    [notificationApi.reducerPath]: notificationApi.reducer,
    [teacherApi.reducerPath]: teacherApi.reducer,
    [classApi.reducerPath]: classApi.reducer,
    [electiveGroupApi.reducerPath]: electiveGroupApi.reducer,
    [assignmentApi.reducerPath]: assignmentApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(dashboardApi.middleware)
      .concat(academicYearApi.middleware)
      .concat(configApi.middleware)
      .concat(subjectApi.middleware)
      .concat(notificationApi.middleware)
      .concat(teacherApi.middleware)
      .concat(classApi.middleware)
      .concat(electiveGroupApi.middleware)
      .concat(assignmentApi.middleware),
});

setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
