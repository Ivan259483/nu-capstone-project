import api from './api';
import { cachedGet, TTL } from './queryCache';

/**
 * Service for managing shop inventory and product listings.
 */
export const InventoryService = {
    /**
     * Fetches all items in the inventory.
     * Uses limit=1000 to ensure all products are loaded (backend defaults to 10).
     */
    async getAllProducts() {
        const data = await cachedGet('/products?limit=1000', undefined, TTL.MEDIUM);
        if (data.success && Array.isArray(data.data)) {
            data.data = data.data.map((p: any) => ({
                ...p,
                id: p._id || p.id
            }));
        }
        return data;
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
     * Normalizes frontend field names to match backend schema:
     *   stock → inventory, cost → price
     * Strips non-schema fields to prevent Mongoose cast errors.
     */
    async updateProduct(id: string, productData: any) {
        // Build a clean payload with only schema-valid fields
        const payload: Record<string, any> = {};

        // Map frontend aliases → backend schema names
        if (productData.inventory !== undefined) {
            payload.inventory = productData.inventory;
        } else if (productData.stock !== undefined) {
            payload.inventory = productData.stock;
        }

        if (productData.price !== undefined) {
            payload.price = productData.price;
        } else if (productData.cost !== undefined) {
            payload.price = productData.cost;
        }

        // Pass through valid schema fields
        if (productData.name !== undefined) payload.name = productData.name;
        if (productData.description !== undefined) payload.description = productData.description;
        if (productData.minLevel !== undefined) payload.minLevel = productData.minLevel;
        if (productData.sku !== undefined) payload.sku = productData.sku;
        if (productData.images !== undefined) payload.images = productData.images;
        if (productData.isActive !== undefined) payload.isActive = productData.isActive;

        // Only pass category/supplier if they look like valid ObjectIds
        const isValidId = (v: any) => typeof v === 'string' && v.length === 24 && /^[0-9a-fA-F]+$/.test(v);
        if (productData.category !== undefined) {
            payload.category = isValidId(productData.category) ? productData.category : null;
        }
        if (productData.supplier !== undefined) {
            payload.supplier = isValidId(productData.supplier) ? productData.supplier : null;
        }

        const response = await api.put(`/products/${id}`, payload);
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
