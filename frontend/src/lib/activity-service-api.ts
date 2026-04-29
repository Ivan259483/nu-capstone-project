import api from './api';
import { cachedGet, TTL } from './queryCache';
import type { ActivityLog } from '@/types';

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
     * Get activity logs with optional filters.
     * Uses the shared axios api client (with interceptors) instead of raw fetch.
     */
    async getActivityLogs(filters: ActivityLogFilters = {}) {
        try {
            const params: Record<string, string> = {};
            if (filters.limit) params.limit = filters.limit.toString();
            if (filters.type) params.type = filters.type;
            if (filters.module) params.module = filters.module;
            if (filters.status) params.status = filters.status;
            if (filters.search) params.search = filters.search;
            if (filters.dateFrom) params.dateFrom = filters.dateFrom;
            if (filters.dateTo) params.dateTo = filters.dateTo;

            const data = await cachedGet('/activity', { params, meta: { suppressErrorToast: true } }, TTL.SHORT);

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
     * Get today's activity stats.
     */
    async getActivityStats() {
        try {
            const data = await cachedGet('/activity/stats', { meta: { suppressErrorToast: true } }, TTL.SHORT);
            return { success: data.success, data: data.data };
        } catch (error: any) {
            return { success: false, data: null };
        }
    },

    /**
     * Create new activity log.
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
            const response = await api.post('/activity', {
                type,
                title,
                description,
                userId,
                userName,
                metadata,
                ...extra,
            });

            return {
                success: response.data.success,
                data: response.data.data as EnrichedActivityLog,
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
     * Seed sample data (calls backend seed endpoint).
     */
    async seedSampleData() {
        try {
            const response = await api.post('/activity/seed');
            return { success: response.data.success, message: response.data.message };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    },
};

// Extended type with enriched fields (same as ActivityLog now that it has all fields)
export type EnrichedActivityLog = ActivityLog;
