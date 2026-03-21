import api from './api';

/**
 * Service for managing shop inventory and product listings.
 */
export const InventoryService = {
    /**
     * Fetches all items in the inventory.
     */
    async getAllProducts() {
        const response = await api.get('/products');
        if (response.data.success && Array.isArray(response.data.data)) {
            response.data.data = response.data.data.map((p: any) => ({
                ...p,
                id: p._id || p.id
            }));
        }
        return response.data;
    },

    /**
     * Adds a new product or shop supply to the inventory.
     */
    async createProduct(productData: any) {
        const response = await api.post('/products', productData);
        if (response.data.success && response.data.data) {
            response.data.data = {
                ...response.data.data,
                id: response.data.data._id || response.data.data.id
            };
        }
        return response.data;
    },

    /**
     * Updates stock levels or product details.
     */
    async updateProduct(id: string, productData: any) {
        const response = await api.put(`/products/${id}`, productData);
        return response.data;
    },

    /**
     * Deletes a product from the system.
     */
    async deleteProduct(id: string) {
        const response = await api.delete(`/products/${id}`);
        return response.data;
    }
};
