import api from './api';
import type { BusinessSettings } from '@/types';

export const SettingsService = {
    getPublicSettings: async () => {
        try {
            const response = await api.get('/settings/public');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch public settings',
            };
        }
    },
    getSettings: async () => {
        try {
            const response = await api.get('/settings');
            return response.data;
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
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to update settings',
            };
        }
    },
};
