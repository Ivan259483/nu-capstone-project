import api from './api';
import type { Booking } from '@/types';

export const OrderService = {
    async getAllOrders() {
        const response = await api.get('/orders');
        return response.data;
    },

    async getOrderById(id: string) {
        const response = await api.get(`/orders/${id}`);
        return response.data;
    },

    async createOrder(orderData: any) {
        const response = await api.post('/orders', orderData);
        return response.data;
    },

    async updateOrder(id: string, orderData: any) {
        const response = await api.put(`/orders/${id}`, orderData);
        return response.data;
    },

    async deleteOrder(id: string) {
        const response = await api.delete(`/orders/${id}`);
        return response.data;
    },

    // Role Integration Methods
    async assignDetailer(orderId: string, detailerId: string) {
        const response = await api.put(`/orders/${orderId}/assign`, { detailerId });
        return response.data;
    },

    async updateProgress(orderId: string, stepIndex?: number, status?: string, completed: boolean = false, orderStatus?: string) {
        const response = await api.put(`/orders/${orderId}/progress`, {
            stepIndex,
            status,
            completed,
            orderStatus
        });
        return response.data;
    },

    async getDetailerOrders() {
        const response = await api.get('/orders/detailer/my-orders');
        return response.data;
    }
};
