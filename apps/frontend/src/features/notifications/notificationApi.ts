import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface NotificationCount {
  count: number;
}

export const notificationApi = createApi({
  reducerPath: 'notificationApi',
  baseQuery,
  tagTypes: ['Notification', 'NotificationCount'],
  endpoints: (builder) => ({
    getNotificationCount: builder.query<NotificationCount, void>({
      query: () => '/notifications/count',
      transformResponse: (response: { data: NotificationCount }) => response.data,
      providesTags: ['NotificationCount'],
    }),
  }),
});

export const { useGetNotificationCountQuery } = notificationApi;
