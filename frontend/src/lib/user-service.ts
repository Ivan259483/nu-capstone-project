import api from './api';
import { cachedGet, invalidate, TTL } from './queryCache';

export const UserService = {
    async getAllUsers(options?: { suppressErrorToast?: boolean }) {
        const data = await cachedGet('/users', { meta: options } as any, TTL.LIVE);
        // Map _id to id consistently
        if (data.success && Array.isArray(data.data)) {
            data.data = data.data.map((u: any) => ({
                ...u,
                id: u._id || u.id
            }));
        }
        return data;
    },

    async getUserById(id: string) {
        const response = await api.get(`/users/${id}`);
        if (response.data.success && response.data.data) {
            response.data.data.id = response.data.data._id || response.data.data.id;
        }
        return response.data;
    },

    async createUser(userData: any) {
        const response = await api.post('/users', userData);
        invalidate('/users');
        return response.data;
    },

    async resendVerification(id: string) {
        const response = await api.post(`/users/${id}/resend-verification`);
        return response.data;
    },

    async updateUser(id: string, userData: any) {
        const response = await api.put(`/users/${id}`, userData, { timeout: 10000 });
        invalidate('/users');
        return response.data;
    },

    async patchMyProfile(
        userData: { name?: string; email?: string; avatar?: string; phone?: string; address?: string },
        profilePhoto?: File | null,
    ) {
        if (profilePhoto) {
            const formData = new FormData();
            Object.entries(userData).forEach(([key, value]) => {
                if (value !== undefined) formData.append(key, value);
            });
            formData.append('photo', profilePhoto);

            const response = await api.patch('/users/profile', formData, {
                timeout: 60_000,
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            return response.data;
        }

        const response = await api.patch('/users/profile', userData, { timeout: 10000 });
        return response.data;
    },

    async deleteUser(id: string) {
        const response = await api.delete(`/users/${id}`);
        invalidate('/users');
        return response.data;
    },

    async archiveUser(id: string) {
        const response = await api.patch(`/users/${id}/archive`);
        invalidate('/users');
        return response.data;
    },

    async activateUser(id: string) {
        const response = await api.patch(`/users/${id}/activate`);
        invalidate('/users');
        return response.data;
    },

    /** Heartbeat so admin User Management can show “Active now” / last seen */
    async touchActivity() {
        const response = await api.patch('/users/me/activity');
        return response.data;
    },

    async changePassword(
        currentPassword: string,
        newPassword: string,
        options?: { suppressErrorToast?: boolean }
    ) {
        const response = await api.patch(
            '/users/change-password',
            { currentPassword, newPassword },
            { meta: options } as any
        );
        return response.data;
    }
};
