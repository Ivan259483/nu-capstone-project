import api from './api';

export interface SystemNotification {
    id: string;
    _id?: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'booking' | 'inventory' | 'chat';
    isRead: boolean;
    createdAt: string;
    link?: string;
}

export const NotificationService = {
    getNotifications: async () => {
        try {
            const response = await api.get('/notifications');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch notifications',
            };
        }
    },

    markAsRead: async (id: string) => {
        try {
            const response = await api.patch(`/notifications/${id}/read`);
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to mark as read',
            };
        }
    },

    markAllAsRead: async () => {
        try {
            const response = await api.post('/notifications/mark-all-read');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to mark all as read',
            };
        }
    },
};
