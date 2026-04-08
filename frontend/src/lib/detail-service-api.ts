import api from './api';
import { cachedGet, TTL } from './queryCache';

/**
 * Service for managing service packages (e.g., Ceramic Coating, Full Detail).
 */
export const DetailService = {
    /**
     * Fetches all available services.
     * Maps MongoDB _id to id for frontend consistency.
     */
    async getAllServices() {
        const data = await cachedGet('/services', undefined, TTL.MEDIUM);
        if (data.success && Array.isArray(data.data)) {
            data.data = data.data.map((s: any) => ({
                ...s,
                id: s._id || s.id
            }));
        }
        return data;
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
