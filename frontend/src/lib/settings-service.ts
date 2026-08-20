import api from './api';
import type { BusinessSettings } from '@/types';
import { cachedGet, invalidate, TTL } from './queryCache';

export const SettingsService = {
    getPublicSettings: async () => {
        try {
            return await cachedGet('/settings/public', undefined, TTL.LONG);
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch public settings',
            };
        }
    },
    getSettings: async () => {
        try {
            return await cachedGet('/settings', undefined, TTL.LONG);
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch settings',
            };
        }
    },

    updateSettings: async (settings: Partial<BusinessSettings>) => {
        try {
            const response = await api.post('/settings', settings);
            invalidate('/settings');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to update settings',
            };
        }
    },
};
