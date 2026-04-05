import api from './api';

export const SupplierService = {
    async getAllSuppliers() {
        const response = await api.get('/suppliers');
        // Map _id to id consistently
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((s: any) => ({
                ...s,
                id: s._id || s.id
            }));
        }
        return response.data;
    },

    async createSupplier(supplierData: any) {
        const response = await api.post('/suppliers', supplierData);
        return response.data;
    },

    async updateSupplier(id: string, supplierData: any) {
        const response = await api.put(`/suppliers/${id}`, supplierData);
        return response.data;
    },

    async deleteSupplier(id: string) {
        const response = await api.delete(`/suppliers/${id}`);
        return response.data;
    },

    async placeOrder(supplierId: string) {
        const response = await api.post('/orders/suppliers', { supplierId });
        return response.data;
    }
};
