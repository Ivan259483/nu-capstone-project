import api from './api';
import { cachedGet, invalidate, TTL } from './queryCache';

export const SupplierService = {
    async getAllSuppliers() {
        const data = await cachedGet('/suppliers', undefined, TTL.MEDIUM);
        // Map _id to id consistently
        if (data.success && Array.isArray(data.data)) {
            data.data = data.data.map((s: any) => ({
                ...s,
                id: s._id || s.id
            }));
        }
        return data;
    },

    async createSupplier(supplierData: any) {
        const response = await api.post('/suppliers', supplierData);
        invalidate('/suppliers');
        return response.data;
    },

    async updateSupplier(id: string, supplierData: any) {
        const response = await api.put(`/suppliers/${id}`, supplierData);
        invalidate('/suppliers');
        return response.data;
    },

    async deleteSupplier(id: string) {
        const response = await api.delete(`/suppliers/${id}`);
        invalidate('/suppliers');
        return response.data;
    },

    async placeOrder(supplierId: string) {
        const response = await api.post('/orders/suppliers', { supplierId });
        return response.data;
    }
};
