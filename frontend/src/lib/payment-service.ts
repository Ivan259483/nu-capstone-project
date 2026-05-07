import api from './api';

type PaymentPayload = {
    orderId: string;
    detailerId?: string | null;
};

export const PaymentService = {
    createStripePaymentIntent: async (payload: PaymentPayload) => {
        try {
            const response = await api.post('/payments/stripe/intent', payload);
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to create payment intent',
            };
        }
    },

    createLocalPayment: async (payload: PaymentPayload & { method: 'gcash' | 'maya' }) => {
        try {
            const response = await api.post('/payments/local', payload);
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to create local payment',
            };
        }
    },

    confirmStripePayment: async (paymentId: string, paymentIntentId?: string) => {
        try {
            const response = await api.post('/payments/stripe/confirm', { paymentId, paymentIntentId });
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to confirm payment',
            };
        }
    },

    getSalesToday: async () => {
        try {
            const response = await api.get('/payments/sales/today');
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch sales report',
            };
        }
    },

    getAllPayments: async (limit = 100) => {
        try {
            const response = await api.get('/payments', { params: { limit } });
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch payments',
                data: [],
                totalRevenue: 0,
            };
        }
    },

    createPOSTransaction: async (payload: {
        orderId: string;
        items: { name: string; price: number; quantity?: number }[];
        addons?: { name: string; price: number; quantity?: number }[];
        paymentMethod: 'cash' | 'gcash' | 'maya' | 'card' | 'split';
        splitPayments?: { method: string; amount: number }[];
        staffId?: string | null;
        discount?: { discountType: 'fixed' | 'percent'; value: number; reason?: string } | null;
        cashReceived?: number | null;
        taxVatAmount?: number;
        additionalFees?: number;
        downpayment?: number;
    }) => {
        try {
            const response = await api.post('/payments/pos', payload);
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'POS transaction failed',
            };
        }
    },

    getReceiptData: async (paymentId: string) => {
        try {
            const response = await api.get(`/payments/${paymentId}/receipt`);
            return response.data;
        } catch (error: any) {
            return {
                success: false,
                message: error.response?.data?.message || 'Failed to fetch receipt',
            };
        }
    },
};
