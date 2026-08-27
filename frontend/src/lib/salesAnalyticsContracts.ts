export type AnalyticsRange = '7d' | '30d' | '90d' | 'all' | 'custom';
export type AnalyticsServiceMetric = 'orders' | 'booked_value';

export const DEFAULT_CUSTOMER_ACTIVITY_RANGE: AnalyticsRange = '90d';
export const CUSTOMER_LIFETIME_VALUE_LABEL = 'Lifetime payments less refunds';

export function buildSalesReportQuery(
  range: AnalyticsRange,
  serviceMetric: AnalyticsServiceMetric,
  custom: { from: string; to: string },
) {
  return {
    range,
    serviceMetric,
    ...(range === 'custom' ? { from: custom.from, to: custom.to } : {}),
  };
}

export type CustomerActivityQueryInput = {
  range: AnalyticsRange;
  custom: { from: string; to: string };
  search: string;
  status: 'all' | 'active' | 'inactive';
  sort: string;
  direction: 'asc' | 'desc';
  page: number;
  limit: number;
};

export function buildCustomerActivityQuery(input: CustomerActivityQueryInput) {
  return {
    range: input.range,
    ...(input.range === 'custom' ? { from: input.custom.from, to: input.custom.to } : {}),
    search: input.search,
    status: input.status,
    sort: input.sort,
    direction: input.direction,
    page: input.page,
    limit: input.limit,
  };
}

export function buildCustomerDetailEndpoints(customerKey: string) {
  const key = encodeURIComponent(customerKey);
  const root = `/sales-analytics/customers/${key}`;
  return { overview: root, bookings: `${root}/bookings`, transactions: `${root}/transactions` };
}

export type RefundDraft = {
  amount: number;
  refundableBalance: number;
  reason: string;
  confirmed: boolean;
};

export function getRefundValidationError(draft: RefundDraft): string | null {
  if (!draft.confirmed) return 'Refund confirmation is required.';
  if (draft.reason.trim().length < 3) return 'A refund reason is required.';
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) return 'Refund amount must be positive.';
  if (draft.amount > draft.refundableBalance + 0.009) return 'Refund amount exceeds the refundable balance.';
  return null;
}

export function buildRefundRequest(draft: RefundDraft) {
  const error = getRefundValidationError(draft);
  if (error) throw new Error(error);
  return { amount: draft.amount, reason: draft.reason.trim(), confirmed: true as const };
}
