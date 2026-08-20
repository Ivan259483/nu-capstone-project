import api from './api';
import { cachedGet, invalidate, TTL } from './queryCache';

export interface SystemNotification {
    id: string;
    _id?: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'booking' | 'inventory' | 'chat' | (string & {});
    priority?: 'low' | 'normal' | 'high';
    isRead: boolean;
    readAt?: string | null;
    isArchived?: boolean;
    archivedAt?: string | null;
    category?: 'appointments' | 'live_tracking' | 'payments' | 'inventory' | 'security' | 'system' | string;
    severity?: 'critical' | 'warning' | 'info' | 'success';
    source?: string;
    actionRequired?: boolean;
    action?: {
        label?: string;
        link?: string;
    } | null;
    groupingKey?: string;
    groupCount?: number;
    firstOccurredAt?: string;
    lastOccurredAt?: string;
    createdAt: string;
    updatedAt?: string;
    link?: string;
    metadata?: Record<string, unknown>;
}

export interface NotificationPagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface NotificationFacets {
    categories?: Record<string, number>;
    severities?: Record<string, number>;
    sources?: Record<string, number>;
    read?: number;
    unread?: number;
    actionRequired?: number;
    critical?: number;
    [key: string]: unknown;
}

export interface NotificationsResponse {
    success: boolean;
    data?: SystemNotification[];
    unreadCount?: number;
    pagination?: NotificationPagination;
    facets?: NotificationFacets;
    message?: string;
}

export interface NotificationQuery {
    search?: string;
    category?: string;
    type?: string;
    severity?: string;
    source?: string;
    readStatus?: 'all' | 'read' | 'unread';
    actionRequired?: boolean;
    archived?: 'exclude' | 'include' | 'only';
    page?: number;
    limit?: number;
}

interface NotificationMutationResponse {
    success: boolean;
    data?: SystemNotification | SystemNotification[];
    unreadCount?: number;
    message?: string;
}

function getErrorMessage(error: any, fallback: string): string {
    return error?.response?.data?.message || fallback;
}

export const NotificationService = {
    getNotifications: async (query: NotificationQuery = {}): Promise<NotificationsResponse> => {
        try {
            const params = { limit: 20, ...query };
            return await cachedGet<NotificationsResponse>('/notifications', { params }, TTL.LIVE);
        } catch (error: any) {
            return {
                success: false,
                message: getErrorMessage(error, 'Failed to fetch notifications'),
            };
        }
    },

    getUnreadCount: async (): Promise<{ success: boolean; unreadCount: number; message?: string }> => {
        try {
            return await cachedGet('/notifications/unread-count', undefined, TTL.LIVE);
        } catch (error: any) {
            return {
                success: false,
                unreadCount: 0,
                message: getErrorMessage(error, 'Failed to fetch unread count'),
            };
        }
    },

    setReadStatus: async (id: string, isRead: boolean): Promise<NotificationMutationResponse> => {
        try {
            const response = await api.patch(`/notifications/${id}/read`, { isRead });
            invalidate('/notifications');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: getErrorMessage(error, `Failed to mark notification as ${isRead ? 'read' : 'unread'}`),
            };
        }
    },

    markAsRead: async (id: string): Promise<NotificationMutationResponse> => (
        NotificationService.setReadStatus(id, true)
    ),

    markAsUnread: async (id: string): Promise<NotificationMutationResponse> => (
        NotificationService.setReadStatus(id, false)
    ),

    markAllAsRead: async (): Promise<NotificationMutationResponse> => {
        try {
            const response = await api.post('/notifications/mark-all-read');
            invalidate('/notifications');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: getErrorMessage(error, 'Failed to mark all as read'),
            };
        }
    },

    bulkSetReadStatus: async (ids: string[], isRead: boolean): Promise<NotificationMutationResponse> => {
        try {
            const response = await api.post('/notifications/bulk-status', { ids, isRead });
            invalidate('/notifications');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: getErrorMessage(error, `Failed to mark notifications as ${isRead ? 'read' : 'unread'}`),
            };
        }
    },

    setArchived: async (ids: string[], archived = true): Promise<NotificationMutationResponse> => {
        try {
            const response = await api.post('/notifications/archive', { ids, archived });
            invalidate('/notifications');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: getErrorMessage(error, `Failed to ${archived ? 'archive' : 'restore'} notifications`),
            };
        }
    },

    clear: async (ids: string[]): Promise<NotificationMutationResponse> => {
        try {
            const response = await api.post('/notifications/clear', { ids });
            invalidate('/notifications');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: getErrorMessage(error, 'Failed to clear notifications'),
            };
        }
    },
};
