import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from '@/lib/api';

export interface NotificationCount {
  count: number;
}

export interface TimetableNotification {
  id: string;
  timetableId: string;
  type: string;
  message: string;
  dismissed: boolean;
  createdAt: string;
  timetable: {
    id: string;
    status: string;
    division: {
      id: string;
      label: string;
      class: {
        id: string;
        name: string;
      };
    };
  };
}

interface NotificationListResponse {
  data: TimetableNotification[];
  meta: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface NotificationListParams {
  page?: number;
  pageSize?: number;
}

export const notificationApi = createApi({
  reducerPath: 'notificationApi',
  baseQuery,
  tagTypes: ['Notification', 'NotificationCount'],
  endpoints: (builder) => ({
    getNotificationCount: builder.query<NotificationCount, void>({
      query: () => 'notifications/count',
      transformResponse: (response: { data: NotificationCount }) => response.data,
      providesTags: ['NotificationCount'],
    }),

    getNotifications: builder.query<NotificationListResponse, NotificationListParams | void>({
      query: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
        const qs = searchParams.toString();
        return `notifications${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response: { data: TimetableNotification[]; meta: NotificationListResponse['meta'] }) => response,
      providesTags: ['Notification'],
    }),

    dismissNotification: builder.mutation<void, string>({
      query: (id) => ({ url: `notifications/${id}/dismiss`, method: 'PUT' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),

    dismissAllNotifications: builder.mutation<void, void>({
      query: () => ({ url: 'notifications/dismiss-all', method: 'PUT' }),
      invalidatesTags: ['Notification', 'NotificationCount'],
    }),
  }),
});

export const {
  useGetNotificationCountQuery,
  useGetNotificationsQuery,
  useDismissNotificationMutation,
  useDismissAllNotificationsMutation,
} = notificationApi;
