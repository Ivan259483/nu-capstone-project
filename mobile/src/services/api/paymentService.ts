/**
 * paymentService — Syncs with backend /api/payments endpoints
 * Provides customer payment history from the backend.
 */

import { apiClient } from '@/services/api/client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
  totalSpent?: number;
  totalCount?: number;
  currency?: string;
}

export interface PaymentRecord {
  _id: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  method: 'card' | 'gcash' | 'maya' | 'cash' | 'other';
  provider: string;
  createdAt: string;
  order?: {
    _id: string;
    orderNumber?: string;
    customerName?: string;
    serviceType?: string;
    status?: string;
  };
}

export interface PaymentHistoryResponse {
  payments: PaymentRecord[];
  totalSpent: number;
  totalCount: number;
  currency: string;
}

export const paymentService = {
  /**
   * Fetch the authenticated customer's payment history.
   */
  async getMyPayments(limit = 50): Promise<PaymentHistoryResponse> {
    const response = await apiClient.get<ApiEnvelope<PaymentRecord[]>>('/payments/my', {
      params: { limit },
    });

    return {
      payments: response.data.data || [],
      totalSpent: response.data.totalSpent || 0,
      totalCount: response.data.totalCount || 0,
      currency: response.data.currency || 'PHP',
    };
  },
};
