import type { ActivityLog } from '@/types';

const API_BASE = '/api';

const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token')}`
});

export const ActivityService = {
    /**
     * Get recent activity logs
     */
    async getActivityLogs(limit = 50, type?: string) {
        try {
            const params = new URLSearchParams();
            params.append('limit', limit.toString());
            if (type) params.append('type', type);

            const response = await fetch(`${API_BASE}/activity?${params.toString()}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            return {
                success: data.success,
                data: data.data as ActivityLog[],
            };
        } catch (error: any) {
            console.error('Failed to fetch activity logs:', error);
            return {
                success: false,
                message: error.message || 'Failed to fetch activity logs',
                data: [] as ActivityLog[],
            };
        }
    },

    /**
     * Create new activity log
     */
    async createActivityLog(
        type: ActivityLog['type'],
        title: string,
        description: string,
        userId: string,
        userName: string,
        metadata?: any
    ) {
        try {
            const response = await fetch(`${API_BASE}/activity`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    type,
                    title,
                    description,
                    userId,
                    userName,
                    metadata,
                })
            });
            const data = await response.json();

            return {
                success: data.success,
                data: data.data as ActivityLog,
            };
        } catch (error: any) {
            console.error('Failed to create activity log:', error);
            return {
                success: false,
                message: error.message || 'Failed to create activity log',
            };
        }
    },
};
