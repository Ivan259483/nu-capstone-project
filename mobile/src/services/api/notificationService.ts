import { apiClient } from '@/services/api/client';
import type { NotificationPage, NotificationRecord } from '@/services/api/types';

export const normalizeNotification = (raw: any): NotificationRecord => {
  return {
    id: raw?._id || raw?.id || '',
    title: raw?.title || 'Notification',
    message: raw?.message || '',
    type: raw?.type,
    event: raw?.event || raw?.type,
    category: raw?.category,
    priority: raw?.priority,
    isRead: Boolean(raw?.isRead),
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt,
    link: raw?.link,
    action: raw?.action || raw?.quickAction,
    actionType: raw?.actionType,
    actionId: raw?.actionId,
    data: raw?.data || raw?.metadata,
    metadata: raw?.metadata || raw?.data,
  };
};

export const notificationService = {
  async getNotifications(page = 1, limit = 20): Promise<NotificationPage> {
    const response = await apiClient.get<any>('/notifications', {
      params: { page, limit, sort: 'newest' },
    });
    const rows = Array.isArray(response.data.data) ? response.data.data : [];
    return {
      notifications: rows
        .map(normalizeNotification)
        .filter((row: NotificationRecord) => Boolean(row.id)),
      unreadCount: Number(response.data.unreadCount || 0),
      pagination: {
        page: Number(response.data.pagination?.page || page),
        limit: Number(response.data.pagination?.limit || limit),
        total: Number(response.data.pagination?.total || rows.length),
        pages: Number(response.data.pagination?.pages || 0),
        hasNextPage: Boolean(response.data.pagination?.hasNextPage),
        hasPreviousPage: Boolean(response.data.pagination?.hasPreviousPage),
      },
      facets: {
        categories: response.data.facets?.categories || {},
        unreadCategories: response.data.facets?.unreadCategories || {},
      },
    };
  },

  async getUnreadCount(): Promise<number> {
    const response = await apiClient.get<{ success: boolean; unreadCount: number }>(
      '/notifications/unread-count'
    );
    return Number(response.data.unreadCount || 0);
  },

  async markAsRead(id: string): Promise<number> {
    const response = await apiClient.patch<{ success: boolean; unreadCount: number }>(
      `/notifications/${encodeURIComponent(id)}/read`
    );
    return Number(response.data.unreadCount || 0);
  },

  async markAllAsRead(): Promise<number> {
    const response = await apiClient.patch<{ success: boolean; unreadCount: number }>(
      '/notifications/read-all'
    );
    return Number(response.data.unreadCount || 0);
  },
};
