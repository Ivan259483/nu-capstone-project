import api from './api';

/**
 * Service for managing service packages (e.g., Ceramic Coating, Full Detail).
 */
export const DetailService = {
    /**
     * Fetches all available services.
     * Maps MongoDB _id to id for frontend consistency.
     */
    async getAllServices() {
        const response = await api.get('/services');
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((s: any) => ({
                ...s,
                id: s._id || s.id
            }));
        }
        return response.data;
    },

    /**
     * Registers a new service package in the system.
     */
    async createService(serviceData: any) {
        const response = await api.post('/services', serviceData);
        return response.data;
    },

    /**
     * Updates service details (price, description, etc).
     */
    async updateService(id: string, serviceData: any) {
        const response = await api.put(`/services/${id}`, serviceData);
        return response.data;
    },

    /**
     * Removes a service package.
     */
    async deleteService(id: string) {
        const response = await api.delete(`/services/${id}`);
        return response.data;
    }
};
