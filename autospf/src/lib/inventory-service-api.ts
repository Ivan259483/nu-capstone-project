import api from './api';

export const InventoryService = {
    async getAllProducts() {
        const response = await api.get('/products');
        // Map _id to id consistently
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((p: any) => ({
                ...p,
                id: p._id || p.id
            }));
        }
        return response.data;
    },

    async createProduct(productData: any) {
        const response = await api.post('/products', productData);
        // Map the returned product's _id to id
        if (response.data.success && response.data.data) {
            response.data.data = {
                ...response.data.data,
                id: response.data.data._id || response.data.data.id
            };
        }
        return response.data;
    },

    async updateProduct(id: string, productData: any) {
        const response = await api.put(`/products/${id}`, productData);
        return response.data;
    },

    async deleteProduct(id: string) {
        const response = await api.delete(`/products/${id}`);
        return response.data;
    }
};
