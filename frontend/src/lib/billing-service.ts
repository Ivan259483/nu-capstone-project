import api, { BACKEND_API_URL } from './api';
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

const endpointFor = (orderId: string, suffix = 'billing') =>
  `${BACKEND_API_URL}/orders/${encodeURIComponent(orderId)}/${suffix}`;

function logPosRequest(input: {
  step: string;
  orderId: string;
  reference?: string | null;
  endpoint: string;
  status?: number | 'NO_RESPONSE';
  body?: unknown;
  durationMs: number;
}) {
  console.info('[POS PAYMENT REQUEST]', input);
}

function apiFailure(error: any, fallback: string, extra: Record<string, unknown> = {}) {
  const receivedResponse = Boolean(error?.response);
  return {
    success: false as const,
    data: undefined,
    status: error?.response?.status,
    code: error?.response?.data?.code || error?.code,
    axiosCode: error?.code,
    receivedResponse,
    message: receivedResponse
      ? error.response?.data?.message || fallback
      : error?.code === 'ECONNABORTED'
        ? 'The request timed out before the server responded.'
        : error?.message || 'The backend did not return an HTTP response.',
    ...extra,
  };
}

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
    const startedAt = performance.now();
    const endpoint = endpointFor(orderId);
    try {
      const { data, status } = await api.get(`/orders/${orderId}/billing`, {
        meta: { suppressErrorToast: true },
      } as any);
      logPosRequest({ step: 'refresh_billing', orderId, endpoint, status, body: data, durationMs: performance.now() - startedAt });
      return data as { success: boolean; data: BillingDoc; message?: string };
    } catch (error: any) {
      const result = apiFailure(error, 'Failed to load billing');
      logPosRequest({ step: 'refresh_billing', orderId, endpoint, status: result.status || 'NO_RESPONSE', body: error.response?.data || { code: result.code, message: result.message }, durationMs: performance.now() - startedAt });
      return result;
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
      const startedAt = performance.now();
      const endpoint = endpointFor(orderId);
      try {
        const { data, status } = await api.put(`/orders/${orderId}/billing`, body, {
          meta: { suppressErrorToast: true },
        } as any);
        logPosRequest({ step: 'save_billing', orderId, endpoint, status, body: data, durationMs: performance.now() - startedAt });
        return data as { success: boolean; data: BillingDoc; message?: string };
      } catch (error: any) {
        const result = apiFailure(error, 'Failed to save billing');
        logPosRequest({ step: 'save_billing', orderId, endpoint, status: result.status || 'NO_RESPONSE', body: error.response?.data || { code: result.code, message: result.message }, durationMs: performance.now() - startedAt });
        return result;
      }
    });
  },

  checkout: async (
    orderId: string,
    body: {
      paymentMethod: 'cash' | 'gcash' | 'maya' | 'card' | 'split';
      staffId?: string | null;
      cashReceived?: number | null;
      amountReceived?: number | null;
      paymentReference?: string | null;
      splitPayments?: { method: string; amount: number }[];
    },
    options?: { reference?: string | null; idempotencyKey?: string }
  ) => {
    const startedAt = performance.now();
    const endpoint = endpointFor(orderId, 'billing/checkout');
    const idempotencyKey = options?.idempotencyKey || `pos-final:${orderId}`;
    console.info('[CHECKOUT-TARGET] posting checkout', {
      frontendOrigin: typeof window !== 'undefined' ? window.location.origin : null,
      apiBase: BACKEND_API_URL,
      fullUrl: endpoint,
      idempotencyKey,
      callingRender: endpoint.includes('onrender.com'),
    });
    try {
      const { data, status } = await api.post(`/orders/${orderId}/billing/checkout`, body, {
        headers: { 'Idempotency-Key': idempotencyKey },
        meta: { suppressErrorToast: true },
      } as any);
      logPosRequest({ step: 'submit_payment', orderId, reference: options?.reference, endpoint, status, body: data, durationMs: performance.now() - startedAt });
      return data as {
        success: boolean;
        idempotent?: boolean;
        paymentCommitted?: boolean;
        receiptPending?: boolean;
        billingSyncPending?: boolean;
        data?: {
          invoiceNumber: string;
          invoiceRecordId: string;
          paymentId: string;
          posInvoiceId: string;
          receipt: Record<string, unknown>;
          vehicleReleaseAvailable?: boolean;
          inventoryWarnings: unknown[];
          pdfUrl: string;
          snapshot?: InvoiceA4Snapshot;
        };
        message?: string;
      };
    } catch (error: any) {
      const failure = apiFailure(error, 'Checkout failed');
      console.info('[CHECKOUT-TARGET] checkout failed', {
        fullUrl: endpoint,
        axiosCode: error?.code ?? null,
        httpStatus: error?.response?.status ?? 'NO_RESPONSE',
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      logPosRequest({ step: 'submit_payment', orderId, reference: options?.reference, endpoint, status: failure.status || 'NO_RESPONSE', body: error.response?.data || { code: failure.code, message: failure.message }, durationMs: performance.now() - startedAt });

      if (!failure.receivedResponse) {
        const statusStartedAt = performance.now();
        const statusEndpoint = endpointFor(orderId, 'billing/checkout-status');
        try {
          const { data, status } = await api.get(`/orders/${orderId}/billing/checkout-status`, {
            meta: { suppressErrorToast: true },
          } as any);
          logPosRequest({ step: 'reconcile_payment_status', orderId, reference: options?.reference, endpoint: statusEndpoint, status, body: data, durationMs: performance.now() - statusStartedAt });
          if (data?.success && data?.paymentCommitted && data?.data) return data;
          return {
            ...failure,
            paymentCommitted: false,
            paymentStatusUnknown: false,
            message: 'The payment request failed and no final payment was recorded. You can retry safely.',
          };
        } catch (statusError: any) {
          const statusFailure = apiFailure(statusError, 'Could not verify payment status');
          logPosRequest({ step: 'reconcile_payment_status', orderId, reference: options?.reference, endpoint: statusEndpoint, status: statusFailure.status || 'NO_RESPONSE', body: statusError.response?.data || { code: statusFailure.code, message: statusFailure.message }, durationMs: performance.now() - statusStartedAt });
          return {
            ...failure,
            paymentCommitted: undefined,
            paymentStatusUnknown: true,
            message: 'The server did not respond and payment status could not be verified. Reload this queued order before trying again.',
          };
        }
      }
      return { ...failure, paymentCommitted: false, paymentStatusUnknown: false };
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
      const receiptPdfConfig = {
        responseType: 'blob',
        meta: { suppressErrorToast: true },
      } as any;
      const { data, headers } = await api.get(`/orders/${encodeURIComponent(orderId)}/billing/receipt-pdf`, receiptPdfConfig);
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
