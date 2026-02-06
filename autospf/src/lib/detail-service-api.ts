import api from './api';

export const DetailService = {
    async getAllServices() {
        const response = await api.get('/services');
        // Map _id to id consistently
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((s: any) => ({
                ...s,
                id: s._id || s.id
            }));
        }
        return response.data;
    },

    async createService(serviceData: any) {
        const response = await api.post('/services', serviceData);
        return response.data;
    },

    async updateService(id: string, serviceData: any) {
        const response = await api.put(`/services/${id}`, serviceData);
        return response.data;
    },

    async deleteService(id: string) {
        const response = await api.delete(`/services/${id}`);
        return response.data;
    }
};
