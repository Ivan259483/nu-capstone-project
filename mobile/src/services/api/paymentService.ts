/**
 * paymentService — Syncs with backend /api/payments endpoints
 * Provides customer payment history from the backend.
 */

import { apiClient } from '@/services/api/client';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  transactions?: T;
  summary?: PaymentHistorySummary;
  message?: string;
  totalSpent?: number;
  totalCount?: number;
  currency?: string;
}

export interface PaymentRecord {
  paymentId: string;
  transactionId: string;
  invoiceId: string | null;
  orderId: string | null;
  orderNumber: string | null;
  bookingReference: string | null;
  transactionType: string;
  paymentStatus: string;
  amountSubmitted: number;
  amountVerified: number;
  signedAmount: number;
  effectiveAt: string | null;
  submittedAt: string | null;
  createdAt: string | null;
  method: string;
  vehicleInfo: string;
  vehiclePlate: string;
  services: { id?: string | null; name: string; price?: number; qty?: number }[];
  outstandingBalance: number;
  receiptAvailable: boolean;
  receiptNumber: string | null;
}

export interface PaymentReceipt {
  receiptKind: 'reservation_payment' | 'official_service';
  receiptNumber: string;
  transactionNumber: string;
  transactionType: string;
  bookingReference?: string;
  orderNumber?: string;
  issuedAt?: string;
  staffName?: string;
  paymentDate: string;
  paymentMethod: string;
  paymentStatus: string;
  company: { name: string; address: string; phone: string; email: string };
  customer: { name: string; email: string; phone: string };
  vehicle: { description: string; plate: string; color: string; classification?: string };
  servicePackage: string;
  lineItems: { name: string; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  additionalFees: number;
  serviceTotal: number;
  priorPayments: number;
  reservationFee?: number | null;
  totalPaid: number;
  totalReceived?: number;
  balanceDue?: number;
  notes?: string;
}

export interface PaymentHistoryResponse {
  payments: PaymentRecord[];
  summary: PaymentHistorySummary;
  totalSpent: number;
  totalCount: number;
  currency: string;
}

export interface PaymentHistorySummary {
  totalPaid: number;
  paymentCount: number;
  refundTotal: number;
  totalReceived: number;
}

export const paymentService = {
  /**
   * Fetch the authenticated customer's payment history.
   */
  async getMyPayments(limit = 500): Promise<PaymentHistoryResponse> {
    const response = await apiClient.get<ApiEnvelope<PaymentRecord[]>>('/payments/my', {
      params: { limit },
    });

    const payments = response.data.transactions || response.data.data || [];
    const summary = {
      totalPaid: Number(response.data.summary?.totalPaid ?? response.data.totalSpent ?? 0),
      paymentCount: Number(response.data.summary?.paymentCount ?? response.data.totalCount ?? 0),
      refundTotal: Number(response.data.summary?.refundTotal ?? 0),
      totalReceived: Number(response.data.summary?.totalReceived ?? 0),
    };

    return {
      payments,
      summary,
      totalSpent: summary.totalPaid,
      totalCount: summary.paymentCount,
      currency: response.data.currency || 'PHP',
    };
  },

  /** Read the customer-owned, payment-specific official receipt payload. */
  async getMyPaymentReceipt(paymentId: string): Promise<PaymentReceipt> {
    const response = await apiClient.get<ApiEnvelope<PaymentReceipt>>(
      `/payments/my/${encodeURIComponent(paymentId)}/receipt`,
    );
    if (!response.data.success || !response.data.data) {
      throw new Error(response.data.message || 'Receipt not available');
    }
    return response.data.data;
  },
};
