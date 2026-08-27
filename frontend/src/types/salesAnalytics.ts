export type ReportRange = '7d' | '30d' | '90d' | 'all' | 'custom';
export type ServiceMetric = 'orders' | 'booked_value';

export interface MetricComparison {
  value: number;
  previousValue: number;
  percentChange: number;
}

export interface SalesAnalyticsReport {
  range: {
    key: ReportRange;
    from: string | null;
    to: string | null;
    start: string | null;
    end: string | null;
    timeZone: 'Asia/Manila';
    comparison: { start: string; end: string } | null;
  };
  serviceMetric: ServiceMetric;
  kpis: {
    netCollectedRevenue: number;
    bookedSalesValue: number;
    confirmedOrders: number;
    averageOrderValue: number;
    uniqueCustomers: number;
  };
  comparison: null | {
    netCollectedRevenue: MetricComparison;
    bookedSalesValue: MetricComparison;
    confirmedOrders: MetricComparison;
    averageOrderValue: MetricComparison;
    uniqueCustomers: MetricComparison;
  };
  secondary: {
    pendingVerification: number;
    pendingVerificationCount: number;
    reservationFeesCollected: number;
    refunds: number;
    refundCount: number;
    cancellations: number;
    outstandingBalance: number;
  };
  revenueTrend: Array<{
    date: string;
    netCollected: number;
    payments: number;
    refunds: number;
  }>;
  serviceMix: Array<{
    name: string;
    confirmedOrders: number;
    bookedValue: number;
    collected: number;
    value: number;
    percentage: number;
  }>;
  paymentMethods: Array<{
    method: string;
    amount: number;
    verifiedTransactions: number;
    refunds: number;
    percentage: number;
  }>;
  topServices: Array<{
    name: string;
    confirmedOrders: number;
    bookedValue: number;
    collected: number;
  }>;
}

export interface CustomerAnalyticsRow {
  customerKey: string;
  recordType: 'account' | 'historical';
  accountId: string | null;
  name: string;
  email: string;
  phone: string;
  memberSince: string | null;
  vehicles: Array<{
    id: string | null;
    plate: string;
    year: string;
    make: string;
    model: string;
    color: string;
    vehicleType: string;
    serviceHistory: Array<{ bookingId: string; service: string; date: string; status: string }>;
  }>;
  confirmedOrders: number;
  completedServices: number;
  cancelledBookings: number;
  totalSpent: number;
  refunds: number;
  outstandingBalance: number;
  lastVisit: string | null;
  status: 'active' | 'inactive';
  returning: boolean;
  periodConfirmedOrders: number;
  periodSpend: number;
  periodActivity: number;
}

