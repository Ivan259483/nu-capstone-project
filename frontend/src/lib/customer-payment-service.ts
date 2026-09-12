import api, { ensureBackendAuthToken } from "./api";
import type {
  CustomerPaymentReceipt,
  CustomerPaymentTransaction,
} from "./customer-payment-history";

export const CustomerPaymentService = {
  async getHistory(signal: AbortSignal) {
    await ensureBackendAuthToken();
    const { data } = await api.get("/payments/my", {
      params: { page: 1, limit: 500 },
      signal,
    });
    const transactions = Array.isArray(data.transactions)
      ? data.transactions
      : data.data;
    if (!data.success || !Array.isArray(transactions))
      throw new Error(data.message || "Could not load payment history.");
    return {
      transactions: transactions as CustomerPaymentTransaction[],
      summary: {
        totalPaid: Number(data.summary?.totalPaid ?? data.totalSpent ?? 0),
        paymentCount: Number(data.summary?.paymentCount ?? data.totalCount ?? 0),
        refundTotal: Number(data.summary?.refundTotal ?? 0),
        totalReceived: Number(data.summary?.totalReceived ?? 0),
      },
    };
  },
  async getReceipt(
    paymentId: string,
    signal: AbortSignal,
  ): Promise<CustomerPaymentReceipt> {
    await ensureBackendAuthToken();
    const { data } = await api.get(
      `/payments/my/${encodeURIComponent(paymentId)}/receipt`,
      { signal },
    );
    if (!data.success || !data.data)
      throw new Error(data.message || "Could not load receipt.");
    return data.data;
  },
};
