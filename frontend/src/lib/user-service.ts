import api from './api';

export const UserService = {
    async getAllUsers(options?: { suppressErrorToast?: boolean }) {
        const response = await api.get('/users', { meta: options } as any);
        // Map _id to id consistently
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((u: any) => ({
                ...u,
                id: u._id || u.id
            }));
        }
        return response.data;
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
        return response.data;
    },

    async updateUser(id: string, userData: any) {
        const response = await api.put(`/users/${id}`, userData, { timeout: 10000 });
        return response.data;
    },

    async patchMyProfile(userData: { name?: string; email?: string; avatar?: string; phone?: string }) {
        const response = await api.patch('/users/profile', userData, { timeout: 10000 });
        return response.data;
    },

    async deleteUser(id: string) {
        const response = await api.delete(`/users/${id}`);
        return response.data;
    },

    async archiveUser(id: string) {
        const response = await api.patch(`/users/${id}/archive`);
        return response.data;
    },

    async activateUser(id: string) {
        const response = await api.patch(`/users/${id}/activate`);
        return response.data;
    },

    async changePassword(userIdOrCurrent: string, currentOrNext: string, maybeNext?: string) {
        const currentPassword = maybeNext ? currentOrNext : userIdOrCurrent;
        const newPassword = maybeNext || currentOrNext;
        const response = await api.patch('/users/change-password', { currentPassword, newPassword });
        return response.data;
    }
};
