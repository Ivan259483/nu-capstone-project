// Backend integration point: replace all mock data with API calls
export type TransactionStatus = 'completed' | 'pending' | 'processing' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'gcash' | 'maya' | 'bank_transfer' | 'unknown';

export interface ServiceItem {
  id: string;
  name: string;
  category: string;
  price: number;
  duration: string;
  description: string;
}

export interface CartItem extends ServiceItem {
  quantity: number;
}

export interface Vehicle {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
  type: string;
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  midsized: 'Midsize',
  'mid-sized': 'Midsize',
  midsize: 'Midsize',
  suv: 'SUV',
  pickup: 'Pickup',
  'pick-up': 'Pickup',
  'pick up': 'Pickup',
  largesuv: 'Large SUV / Van',
  'large suv': 'Large SUV / Van',
  'large suv/van': 'Large SUV / Van',
  van: 'Large SUV / Van',
  highend: 'High-end Sedan',
  'high-end': 'High-end Sedan',
  'highend sedan': 'High-end Sedan',
  'high-end sedan': 'High-end Sedan',
};

/** Keep backend vehicle enum values intact while presenting consistent cashier-facing labels. */
export function formatVehicleTypeLabel(value?: string | null): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Vehicle class not set';
  return VEHICLE_TYPE_LABELS[raw.toLowerCase()] || raw.replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  vehicles: Vehicle[];
  totalSpent: number;
  visitCount: number;
  lastVisit: string;
  memberSince: string;
  notes: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  /** Plates from garage (for POS / staff search before vehicles are loaded client-side) */
  garagePlateHints?: string[];
  /** Built from booking/order snapshot — garage APIs use logged-in staff only on real user ids */
  isSynthetic?: boolean;
}

export interface Transaction {
  id: string;
  orderId?: string;
  orderNumber?: string;
  bookingReference?: string;
  invoiceId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  vehiclePlate: string;
  vehicleInfo: string;
  vehicleColor?: string;
  vehicleClass?: string;
  services: { name: string; price: number; qty: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  additionalFees?: number;
  downpayment?: number;
  serviceTotal?: number;
  amountCollected?: number;
  balanceRemaining?: number;
  total: number;
  paymentMethod: PaymentMethod;
  /** Normalized for filters, KPIs, and badge colors */
  status: TransactionStatus;
  /** Original `order.status` from API (e.g. released, rejected) for display labels */
  statusRaw?: string;
  /** Booking / record creation time (for tables & receipts) */
  dateTime: string;
  /** Payment or last-write time — used for dashboard KPI day buckets (Manila) */
  analyticsDateTime?: string;
  paidAt?: string;
  staffName: string;
  notes: string;
}

export const SERVICE_CATALOG: ServiceItem[] = [
  { id: 'svc-001', name: 'Full Detail Premium', category: 'Detailing', price: 3500, duration: '4 hrs', description: 'Complete interior and exterior detailing' },
  { id: 'svc-002', name: 'Exterior Wash & Wax', category: 'Detailing', price: 850, duration: '1.5 hrs', description: 'Hand wash, clay bar, carnauba wax' },
  { id: 'svc-003', name: 'Interior Deep Clean', category: 'Detailing', price: 1800, duration: '2.5 hrs', description: 'Steam clean, vacuum, leather conditioning' },
  { id: 'svc-004', name: 'Paint Protection Film (Full)', category: 'PPF', price: 28000, duration: '2 days', description: 'Full-body PPF installation — XPEL Ultimate Plus' },
  { id: 'svc-005', name: 'Paint Protection Film (Partial)', category: 'PPF', price: 12500, duration: '1 day', description: 'Hood, bumper, mirrors — XPEL Ultimate Plus' },
  { id: 'svc-006', name: 'Ceramic Coating Pro 9H', category: 'Ceramic', price: 15000, duration: '2 days', description: 'Professional 9H ceramic coating with 3-year warranty' },
  { id: 'svc-007', name: 'Ceramic Coating Lite', category: 'Ceramic', price: 6500, duration: '1 day', description: 'Entry-level ceramic coating with 1-year warranty' },
  { id: 'svc-008', name: 'Window Tint (Sedan)', category: 'Tinting', price: 4200, duration: '3 hrs', description: 'Premium 3M Crystalline tint — all windows' },
  { id: 'svc-009', name: 'Window Tint (SUV)', category: 'Tinting', price: 5800, duration: '4 hrs', description: 'Premium 3M Crystalline tint — all windows' },
  { id: 'svc-010', name: 'Headlight Restoration', category: 'Restoration', price: 1200, duration: '1 hr', description: 'UV cut + polish + sealant' },
  { id: 'svc-011', name: 'Engine Bay Cleaning', category: 'Detailing', price: 950, duration: '1 hr', description: 'Degreaser, steam clean, dress' },
  { id: 'svc-012', name: 'Odor Elimination', category: 'Interior', price: 1500, duration: '2 hrs', description: 'Ozone treatment + interior freshener' },
  { id: 'svc-013', name: 'Scratch & Swirl Removal', category: 'Paint Correction', price: 4500, duration: '5 hrs', description: '2-stage machine polish paint correction' },
  { id: 'svc-014', name: 'Wheel & Tire Detailing', category: 'Detailing', price: 600, duration: '45 min', description: 'Wheel clean, tire dressing, brake dust removal' },
  { id: 'svc-015', name: 'Dashboard Wrap', category: 'Interior', price: 3200, duration: '3 hrs', description: 'Vinyl wrap for dashboard trim pieces' },
];

// TODO: Replace with API call → GET /api/transactions
export const TRANSACTIONS: Transaction[] = [];

// TODO: Replace with API call → GET /api/dashboard/hourly-sales
export const HOURLY_SALES: { hour: string; revenue: number; transactions: number }[] = [];

// TODO: Replace with API call → GET /api/dashboard/service-mix
export const SERVICE_MIX: { name: string; value: number; fill: string; pct: number }[] = [];

// TODO: Replace with API call → GET /api/dashboard/seven-day-trend
export const SEVEN_DAY_SALES: { date: string; revenue: number }[] = [];

export const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const getPaymentMethodLabel = (method: PaymentMethod): string => {
  const map: Record<PaymentMethod, string> = {
    cash: 'Cash', card: 'Credit/Debit Card', gcash: 'GCash',
    maya: 'Maya', bank_transfer: 'Bank Transfer', unknown: 'Unknown',
  };
  return map[method];
};

/** Never infer Cash when the API has no recognized persisted method. */
export function normalizePaymentMethod(value: unknown): PaymentMethod {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : '';
  if (['cash', 'card', 'gcash', 'maya', 'bank_transfer'].includes(normalized)) {
    return normalized as PaymentMethod;
  }
  return 'unknown';
}

export type TransactionPaymentFilter = 'all' | 'cash' | 'gcash';
export const DEFAULT_TRANSACTION_PAYMENT_FILTER: TransactionPaymentFilter = 'all';

export interface TransactionFilters {
  search?: string;
  status?: TransactionStatus | 'all';
  paymentMethod?: TransactionPaymentFilter;
  dateFrom?: string;
  dateTo?: string;
}

/** Apply all Transactions-page filters to the same dataset before pagination/export. */
export function filterTransactions(
  transactions: Transaction[],
  filters: TransactionFilters
): Transaction[] {
  const query = String(filters.search || '').trim().toLowerCase();
  const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;

  return transactions.filter((transaction) => {
    const transactionTime = new Date(transaction.dateTime).getTime();
    if (from !== null && (!Number.isFinite(transactionTime) || transactionTime < from)) return false;
    if (to !== null && (!Number.isFinite(transactionTime) || transactionTime > to)) return false;
    if (filters.status && filters.status !== 'all' && transaction.status !== filters.status) return false;
    if (
      filters.paymentMethod
      && filters.paymentMethod !== 'all'
      && transaction.paymentMethod !== filters.paymentMethod
    ) return false;
    if (!query) return true;

    return (
      transaction.id.toLowerCase().includes(query)
      || transaction.customerName.toLowerCase().includes(query)
      || transaction.vehiclePlate.toLowerCase().includes(query)
      || transaction.services.some((service) => service.name.toLowerCase().includes(query))
    );
  });
}

const csvCell = (value: unknown): string =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

/** Build the exact filtered CSV payload shown by the Transactions page. */
export function transactionsToCsv(transactions: Transaction[]): string {
  const headers = [
    'Transaction ID', 'Customer', 'Vehicle Plate', 'Services', 'Amount',
    'Payment Method', 'Status', 'Date', 'Staff',
  ];
  const rows = transactions.map((transaction) => [
    transaction.id,
    transaction.customerName,
    transaction.vehiclePlate,
    transaction.services.map((service) => service.name).join('; '),
    transaction.total.toFixed(2),
    getPaymentMethodLabel(transaction.paymentMethod),
    formatTransactionStatusLabel(transaction.status, transaction.statusRaw),
    new Date(transaction.dateTime).toLocaleString('en-PH'),
    transaction.staffName,
  ].map(csvCell).join(','));
  return [headers.map(csvCell).join(','), ...rows].join('\n');
}

export const getStatusBadge = (status: TransactionStatus): string => {
  const map: Record<TransactionStatus, string> = {
    completed: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200',
    pending: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200',
    processing: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200',
    voided: 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200',
  };
  return map[status];
};

// Returns CSS badge class name used by TransactionsTable
export const getStatusColor = (status: TransactionStatus): string => {
  const map: Record<TransactionStatus, string> = {
    completed: 'sales-badge-completed',
    pending: 'sales-badge-pending',
    processing: 'sales-badge-processing',
    voided: 'sales-badge-voided',
  };
  return map[status];
};

/** Looks like legacy encrypted plate that failed server decrypt — hide from UI */
export const isEncryptedPlateToken = (value: string): boolean =>
  typeof value === 'string' && /^[0-9a-f]{32}:[0-9a-f]+$/i.test(value.trim());

/**
 * Human-readable order status for the sales table (uses API `statusRaw` when present).
 */
export function formatTransactionStatusLabel(
  canonical: TransactionStatus,
  statusRaw?: string
): string {
  const r = (statusRaw || '').toLowerCase();
  const map: Record<string, string> = {
    released: 'Released',
    rejected: 'Rejected',
    pending_confirmation: 'Pending review',
    in_progress: 'In Progress',
    pending: 'Pending',
    approved: 'Approved',
    confirmed: 'Confirmed',
    assigned: 'Assigned',
    received: 'Received',
    queued: 'Queued',
    paid: 'Paid',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  if (r && map[r]) return map[r];
  return canonical.charAt(0).toUpperCase() + canonical.slice(1);
}
