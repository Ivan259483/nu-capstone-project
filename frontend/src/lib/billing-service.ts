import api from './api';
import type { InvoiceA4Snapshot } from '@/components/sales/billing/InvoiceA4';

/** Normalize GET /invoices/:id or checkout payload into a renderable A4 snapshot. */
export function extractInvoiceSnapshot(
  response: { success?: boolean; data?: unknown } | null | undefined
): InvoiceA4Snapshot | null {
  if (!response?.success || !response.data || typeof response.data !== 'object') return null;
  const d = response.data as Record<string, unknown>;
  const snap = d.snapshot;
  if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
    return snap as InvoiceA4Snapshot;
  }
  if (Array.isArray(d.lineItems) && d.computed && typeof d.computed === 'object') {
    return d as InvoiceA4Snapshot;
  }
  return null;
}

/** Serialize PUT billing per order to avoid Mongoose version conflicts from parallel saves. */
const billingPutChains = new Map<string, Promise<unknown>>();

function enqueueBillingPut<T>(orderId: string, run: () => Promise<T>): Promise<T> {
  const prev = billingPutChains.get(orderId) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(run);
  billingPutChains.set(orderId, next);
  return next.finally(() => {
    if (billingPutChains.get(orderId) === next) billingPutChains.delete(orderId);
  });
}

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
    return enqueueBillingPut(orderId, async () => {
      try {
        const { data } = await api.put(`/orders/${orderId}/billing`, body);
        return data as { success: boolean; data: BillingDoc; message?: string };
      } catch (error: any) {
        return {
          success: false,
          message: error.response?.data?.message || 'Failed to save billing',
        };
      }
    });
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
          snapshot?: InvoiceA4Snapshot;
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

  /** PDF blob for customer / sales — uses order-scoped route (not /invoices/.../pdf). */
  getOrderReceiptPdfBlob: async (orderId: string) => {
    try {
      const { data, headers } = await api.get(`/orders/${encodeURIComponent(orderId)}/billing/receipt-pdf`, {
        responseType: 'blob',
        meta: { suppressErrorToast: true } as any,
      });
      const ct = String(headers['content-type'] || '');
      if (ct.includes('application/json')) {
        const text = await (data as Blob).text();
        let msg = 'Receipt not available';
        try {
          const j = JSON.parse(text) as { message?: string };
          if (j?.message) msg = j.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      return data as Blob;
    } catch (error: any) {
      const blob = error?.response?.data;
      if (blob instanceof Blob) {
        const t = await blob.text();
        let parsed: { message?: string } | null = null;
        try {
          parsed = JSON.parse(t) as { message?: string };
        } catch {
          parsed = null;
        }
        if (parsed?.message) throw new Error(parsed.message);
        throw new Error('Receipt not available');
      }
      throw new Error(error?.response?.data?.message || error?.message || 'Receipt not available');
    }
  },

  getInvoicePdfUrl: (invoiceNumber: string) =>
    `/api/invoices/${encodeURIComponent(invoiceNumber)}/pdf`,
};

export async function fetchInvoiceSnapshot(invoiceNumber: string): Promise<InvoiceA4Snapshot | null> {
  const inv = await BillingService.getInvoice(invoiceNumber);
  return extractInvoiceSnapshot(inv);
}
