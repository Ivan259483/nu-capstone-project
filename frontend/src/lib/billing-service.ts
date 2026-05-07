import api from './api';

export type BillingLineItem = {
  _id?: string;
  serviceId?: string | null;
  name: string;
  billingGroup?: string;
  unitPrice: number;
  quantity: number;
  vehicleTier?: string;
};

export type BillingDiscount = {
  discountType: 'fixed' | 'percent';
  value: number;
  reason?: string;
};

export type BillingDoc = {
  _id: string;
  order: string;
  status: string;
  lineItems: BillingLineItem[];
  discount: BillingDiscount;
  taxVatAmount: number;
  additionalFees: number;
  downpayment: number;
  computed: {
    subtotal: number;
    discountTotal: number;
    taxVatTotal: number;
    additionalFeesTotal: number;
    grandTotal: number;
    balanceDue: number;
  };
  version: number;
  dedupeByServiceId?: boolean;
  events?: unknown[];
};

export const BillingService = {
  getBilling: async (orderId: string) => {
    try {
      const { data } = await api.get(`/orders/${orderId}/billing`);
      return data as { success: boolean; data: BillingDoc; message?: string };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to load billing',
      };
    }
  },

  putBilling: async (
    orderId: string,
    body: {
      lineItems?: BillingLineItem[];
      discount?: BillingDiscount;
      taxVatAmount?: number;
      additionalFees?: number;
      downpayment?: number;
      dedupeByServiceId?: boolean;
    }
  ) => {
    try {
      const { data } = await api.put(`/orders/${orderId}/billing`, body);
      return data as { success: boolean; data: BillingDoc; message?: string };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to save billing',
      };
    }
  },

  checkout: async (
    orderId: string,
    body: {
      paymentMethod: 'cash' | 'gcash' | 'maya' | 'card' | 'split';
      staffId?: string | null;
      cashReceived?: number | null;
      splitPayments?: { method: string; amount: number }[];
    }
  ) => {
    try {
      const { data } = await api.post(`/orders/${orderId}/billing/checkout`, body);
      return data as {
        success: boolean;
        data?: {
          invoiceNumber: string;
          invoiceRecordId: string;
          paymentId: string;
          posInvoiceId: string;
          receipt: Record<string, unknown>;
          inventoryWarnings: unknown[];
          pdfUrl: string;
        };
        message?: string;
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Checkout failed',
      };
    }
  },

  getInvoice: async (invoiceNumber: string) => {
    try {
      const { data } = await api.get(`/invoices/${encodeURIComponent(invoiceNumber)}`);
      return data as { success: boolean; data: Record<string, unknown>; message?: string };
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Failed to load invoice',
      };
    }
  },

  getInvoicePdfUrl: (invoiceNumber: string) =>
    `/api/invoices/${encodeURIComponent(invoiceNumber)}/pdf`,
};
