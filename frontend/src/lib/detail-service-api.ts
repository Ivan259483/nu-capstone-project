import api from './api';
import { cachedGet, invalidate, TTL } from './queryCache';

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

    async getPublishedServices() {
        const data = await cachedGet('/services/published', undefined, TTL.SHORT);
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
        invalidate('/services');
        return response.data;
    },

    /**
     * Updates service details (price, description, etc).
     */
    async updateService(id: string, serviceData: any) {
        const response = await api.put(`/services/${id}`, serviceData);
        invalidate('/services');
        return response.data;
    },

    async updateServicePricing(id: string, pricingData: {
        vehicleType: string;
        basePrice: number | null;
        originalPrice: number | null;
        addonPrice: number | null;
    }) {
        const response = await api.patch(`/services/${id}/pricing`, pricingData);
        invalidate('/services');
        return response.data;
    },

    /**
     * Removes a service package.
     */
    async deleteService(id: string) {
        const response = await api.delete(`/services/${id}`);
        invalidate('/services');
        return response.data;
    }
};
