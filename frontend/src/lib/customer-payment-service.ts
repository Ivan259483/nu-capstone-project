import api, { ensureBackendAuthToken } from "./api";
import type {
  CustomerPaymentReceipt,
  CustomerPaymentTransaction,
} from "./customer-payment-history";

export const CustomerPaymentService = {
  async getHistory(signal: AbortSignal) {
    await ensureBackendAuthToken();
    const transactions: CustomerPaymentTransaction[] = [];
    let page = 1;
    let pages = 1;
    let totalPaid = 0;
    do {
      const { data } = await api.get("/payments/my", {
        params: { page, limit: 100 },
        signal,
      });
      if (!data.success || !Array.isArray(data.data))
        throw new Error(data.message || "Could not load payment history.");
      transactions.push(...data.data);
      pages = data.pagination?.pages || 1;
      totalPaid = data.totalSpent;
      page += 1;
    } while (page <= pages);
    return { transactions, totalPaid };
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
