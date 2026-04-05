import { apiClient } from '@/services/api/client';
import type { ApiEnvelope, NotificationRecord } from '@/services/api/types';

const normalizeNotification = (raw: any): NotificationRecord => {
  return {
    id: raw?._id || raw?.id || '',
    title: raw?.title || 'Notification',
    message: raw?.message || '',
    type: raw?.type,
    isRead: Boolean(raw?.isRead),
    createdAt: raw?.createdAt,
    link: raw?.link,
    metadata: raw?.metadata,
  };
};

export const notificationService = {
  async getNotifications(): Promise<NotificationRecord[]> {
    const response = await apiClient.get<ApiEnvelope<any[]>>('/notifications');
    const rows = Array.isArray(response.data.data) ? response.data.data : [];
    return rows.map(normalizeNotification);
  },

  async markAsRead(id: string): Promise<void> {
    await apiClient.patch(`/notifications/${id}/read`);
  },

  async markAllAsRead(): Promise<void> {
    await apiClient.post('/notifications/mark-all-read');
  },
};
