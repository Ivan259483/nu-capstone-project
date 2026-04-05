import type { ActivityLog } from '@/types';

const API_BASE = '/api';

const getAuthHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('autospf_token')}`
});

export interface ActivityLogFilters {
    limit?: number;
    type?: string;
    module?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
}

export const ActivityService = {
    /**
     * Get activity logs with optional filters
     */
    async getActivityLogs(filters: ActivityLogFilters = {}) {
        try {
            const params = new URLSearchParams();
            if (filters.limit) params.append('limit', filters.limit.toString());
            if (filters.type) params.append('type', filters.type);
            if (filters.module) params.append('module', filters.module);
            if (filters.status) params.append('status', filters.status);
            if (filters.search) params.append('search', filters.search);
            if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
            if (filters.dateTo) params.append('dateTo', filters.dateTo);

            const response = await fetch(`${API_BASE}/activity?${params.toString()}`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();

            return {
                success: data.success,
                data: (data.data || []) as EnrichedActivityLog[],
                seeded: data.seeded || false,
            };
        } catch (error: any) {
            console.error('Failed to fetch activity logs:', error);
            return {
                success: false,
                message: error.message || 'Failed to fetch activity logs',
                data: [] as EnrichedActivityLog[],
            };
        }
    },

    /**
     * Get today's activity stats
     */
    async getActivityStats() {
        try {
            const response = await fetch(`${API_BASE}/activity/stats`, {
                headers: getAuthHeaders()
            });
            const data = await response.json();
            return { success: data.success, data: data.data };
        } catch (error: any) {
            return { success: false, data: null };
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
        metadata?: any,
        extra?: {
            userRole?: string;
            module?: string;
            action?: string;
            status?: 'success' | 'warning' | 'error' | 'info';
        }
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
                    ...extra,
                })
            });
            const data = await response.json();

            return {
                success: data.success,
                data: data.data as EnrichedActivityLog,
            };
        } catch (error: any) {
            console.error('Failed to create activity log:', error);
            return {
                success: false,
                message: error.message || 'Failed to create activity log',
            };
        }
    },

    /**
     * Seed sample data (calls backend seed endpoint)
     */
    async seedSampleData() {
        try {
            const response = await fetch(`${API_BASE}/activity/seed`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
            const data = await response.json();
            return { success: data.success, message: data.message };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    },
};

// Extended type with enriched fields (same as ActivityLog now that it has all fields)
export type EnrichedActivityLog = ActivityLog;
