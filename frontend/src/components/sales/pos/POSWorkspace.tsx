import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import CustomerVehiclePanel, { type CustomerVehiclePanelHandle } from './CustomerVehiclePanel';
import ServiceCartPanel from './ServiceCartPanel';
import PaymentSummaryPanel from './PaymentSummaryPanel';
import ReceiptModal from './ReceiptModal';
import BillingWorkspace, { type BillingChargesPayload } from '@/components/sales/billing/BillingWorkspace';
import type { BillingDiscount, BillingDoc } from '@/lib/billing-service';
import InvoiceA4, { type InvoiceA4Snapshot } from '@/components/sales/billing/InvoiceA4';
import { Customer, Vehicle, CartItem, formatPeso } from '@/lib/salesData';
import { useServices, VehicleType, getEffectivePrice } from '@/hooks/useServices';
import {
  BillingService,
  extractInvoiceSnapshot,
  fetchInvoiceSnapshot,
} from '@/lib/billing-service';
import { computeBillingTotals, type BillingComputed, type BillingLineItem } from '@/lib/billingTotals';
import { toast } from 'sonner';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { sanitizeVehiclePlate } from '@/lib/vehicle-display';
import { DEFAULT_SPF_ADDON_PRICES } from '@/lib/service-pricing';
import { resolveReceiptPhone } from '@/lib/receipt-phone';
import { normalizePlateNumber } from '@/lib/plate';
import { VehicleService, mapApiVehicleToPosVehicle } from '@/lib/vehicle-service';
import {
  idString,
  isValidMongoObjectId,
  normalizeMoney,
  normalizeQueuedPickupOrder,
  posQueueDebug,
} from '@/lib/pos-pickup-queue';

// Map vehicle.type string → VehicleType key
const VEHICLE_TYPE_MAP: Record<string, VehicleType> = {
  hatchback:  'hatchback',
  sedan:      'sedan',
  midsized:   'midsized',
  'mid-sized':'midsized',
  midsize:    'midsized',
  suv:        'suv',
  'pick up':  'pickup',
  pickup:     'pickup',
  'pick-up':  'pickup',
  'large suv':'largesuv',
  largesuv:   'largesuv',
  van:        'largesuv',
  'large suv/van': 'largesuv',
  'highend sedan': 'highend',
  highend:    'highend',
  'high-end': 'highend',
};

function resolveVehicleType(vehicleTypeStr: string): VehicleType {
  const normalized = (vehicleTypeStr || '').trim().toLowerCase();
  return VEHICLE_TYPE_MAP[normalized] ?? 'sedan';
}

const TINT_PRICES: Record<string, Partial<Record<VehicleType, number | null>>> = {
  'SPF 80': DEFAULT_SPF_ADDON_PRICES.spf80,
  'SPF 89': DEFAULT_SPF_ADDON_PRICES.spf89,
  'SPF 99': DEFAULT_SPF_ADDON_PRICES.spf99,
};

/** When billing + order have no stored reservation, assume ₱500 for booking-linked POS checkout. */
const BOOKING_RESERVATION_DP_FALLBACK = 500;

type PosBillingCharges = {
  discount: BillingDiscount;
  taxVatAmount: number;
  additionalFees: number;
  downpayment: number;
};

type PosCartItem = CartItem & {
  source?: 'manual' | 'pickup_queue';
  orderLinked?: boolean;
  queuedOrderId?: string;
  billingServiceId?: string | null;
  queueLabel?: string;
  vehicleType?: VehicleType;
};

type QueuedFinancialState = {
  originalTotal: number;
  discountTotal: number;
  taxVatTotal: number;
  additionalFeesTotal: number;
  amountPaid: number;
  downpaymentApplied: number;
  remainingBalance: number;
  totalDue: number;
  grandTotal: number;
};

type QueuedOrderContext = {
  orderId: string;
  label: string;
  bookingReference?: string;
  orderNumber?: string;
  customerName?: string;
  financial: QueuedFinancialState;
};

type HydratedQueuedOrderState = {
  orderId: string;
  row: any;
  order: any;
  customer: Customer;
  vehicle: Vehicle;
  cartItems: PosCartItem[];
  billingCharges: PosBillingCharges;
  billingComputed: BillingComputed | null;
  queuedContext: QueuedOrderContext;
};

const emptyBillingCharges = (): PosBillingCharges => ({
  discount: { discountType: 'fixed', value: 0 },
  taxVatAmount: 0,
  additionalFees: 0,
  downpayment: 0,
});

function chargesFromBillingDoc(
  bd: {
    discount?: BillingDiscount;
    taxVatAmount?: number;
    additionalFees?: number;
    downpayment?: number;
  } | null,
  orderDownPayment: unknown,
  isBookingOrder: boolean
): PosBillingCharges {
  const d = bd?.discount;
  return {
    discount: {
      discountType: d?.discountType === 'percent' ? 'percent' : 'fixed',
      value: Math.max(0, Number(d?.value) || 0),
      reason: d?.reason,
    },
    taxVatAmount: Math.max(0, Number(bd?.taxVatAmount) || 0),
    additionalFees: Math.max(0, Number(bd?.additionalFees) || 0),
    downpayment: resolvePosDownpayment(bd?.downpayment, orderDownPayment, isBookingOrder),
  };
}

function chargesToPutBody(charges: PosBillingCharges) {
  const val = Math.max(0, Number(charges.discount.value) || 0);
  return {
    discount: {
      discountType: charges.discount.discountType,
      value: val,
      reason: charges.discount.reason,
    },
    taxVatAmount: charges.taxVatAmount,
    additionalFees: charges.additionalFees,
    downpayment: charges.downpayment,
  };
}

function cartItemsFromSavedReceipt(items: any[] | undefined, fallback: CartItem[]): CartItem[] {
  if (!Array.isArray(items) || items.length === 0) return fallback.map((c) => ({ ...c }));
  return items.map((item, index) => ({
    id: String(item.serviceId || item.id || item.name || `receipt-line-${index}`),
    name: String(item.name || 'Service'),
    category: item.isAddon ? 'Add-on' : 'Service',
    price: Math.max(0, Number(item.price) || 0),
    duration: '',
    description: '',
    quantity: Math.max(1, Math.floor(Number(item.quantity)) || 1),
  }));
}

function discountAmountFromSavedReceipt(receipt: any, fallback: number): number {
  const savedDiscount = receipt?.discount;
  if (savedDiscount && typeof savedDiscount === 'object') {
    return Math.max(0, Number(savedDiscount.amount) || 0);
  }
  return Math.max(0, Number(fallback) || 0);
}

function resolvePosDownpayment(
  billingDownpayment: unknown,
  orderDownPaymentAmount: unknown,
  isBookingOrder: boolean
): number {
  const fromBilling = Math.max(0, Number(billingDownpayment) || 0);
  if (fromBilling > 0) return fromBilling;
  const fromOrder = Math.max(0, Number(orderDownPaymentAmount) || 0);
  if (fromOrder > 0) return fromOrder;
  return isBookingOrder ? BOOKING_RESERVATION_DP_FALLBACK : 0;
}

function money(value: unknown): number {
  return normalizeMoney(value);
}

function orderReference(row: any): string {
  const normalized = normalizeQueuedPickupOrder(row);
  return String(normalized.bookingReference || row?.orderNumber || normalized.orderId || 'Queued order');
}

function financialFromQueueAndBilling(row: any, billing?: BillingDoc | null): QueuedFinancialState {
  const normalized = normalizeQueuedPickupOrder(row);
  const computed = billing?.computed;
  const discountTotal = money(computed?.discountTotal ?? row?.discountAmount);
  const taxVatTotal = money(computed?.taxVatTotal ?? row?.taxVatAmount);
  const additionalFeesTotal = money(computed?.additionalFeesTotal ?? row?.additionalFees);
  const grandTotal = money(computed?.grandTotal ?? row?.totalAmount ?? row?.totalPrice);
  const downpaymentApplied = money(row?.downpaymentApplied ?? billing?.downpayment ?? row?.downPaymentAmount);
  const amountPaid = money(row?.amountPaid ?? downpaymentApplied);
  const remainingBalance = normalized.remainingBalance;
  const billingBalanceDue = money(computed?.balanceDue);
  if (Math.abs(remainingBalance - billingBalanceDue) > 0.009) {
    posQueueDebug('[POS Queue] queue/billing balance mismatch', {
      queueRemainingBalance: remainingBalance,
      billingComputedBalanceDue: billingBalanceDue,
      orderPaymentStatus: row?.paymentStatus,
      billingStatus: billing?.status,
      checkedOutState: billing?.status === 'checked_out',
    });
  }
  return {
    originalTotal: grandTotal,
    discountTotal,
    taxVatTotal,
    additionalFeesTotal,
    amountPaid,
    downpaymentApplied,
    remainingBalance,
    totalDue: remainingBalance,
    grandTotal,
  };
}

function vehicleSnapshotFromOrder(order: any, orderId: string): Vehicle {
  const plate = sanitizeVehiclePlate(order?.vehiclePlate || '');
  return {
    id: String(order?.vehicleId || order?.vehicle || (plate ? `plate-${plate}` : `order-${orderId}-vehicle`)),
    plate,
    make: String(order?.vehicleMake || ''),
    model: String(order?.vehicleModel || ''),
    year:
      typeof order?.vehicleYear === 'number'
        ? order.vehicleYear
        : parseInt(String(order?.vehicleYear || '0'), 10) || 0,
    color: String(order?.vehicleColor || ''),
    type: String(order?.vehicleType || order?.vehicleClass || order?.vehicleCategory || 'sedan'),
  };
}

function customerFromOrder(order: any): Customer {
  const rawCustomer = order?.customer && typeof order.customer === 'object' ? order.customer : null;
  const id = String(
    order?.customerId ||
    rawCustomer?._id ||
    rawCustomer?.id ||
    order?.customer ||
    ''
  );
  return {
    id,
    name: String(order?.customerName || rawCustomer?.name || 'Customer'),
    phone: resolveReceiptPhone(rawCustomer, order) || '',
    email: String(rawCustomer?.email || order?.customerEmail || ''),
    vehicles: [],
    totalSpent: 0,
    visitCount: 0,
    lastVisit: new Date().toISOString(),
    memberSince: rawCustomer?.createdAt ? new Date(rawCustomer.createdAt).toISOString() : new Date().toISOString(),
    notes: '',
    tier: 'bronze',
    isSynthetic: false,
    garagePlateHints: [],
  };
}

function findExactQueuedVehicle(vehicles: Vehicle[], order: any, fallback: Vehicle): Vehicle {
  const wantedVehicleId = String(order?.vehicleId || order?.vehicle || '').trim();
  if (wantedVehicleId) {
    const byId = vehicles.find((v) => String(v.id) === wantedVehicleId);
    if (byId) return byId;
  }
  const wantedPlate = normalizePlateNumber(order?.vehiclePlate || fallback.plate || '');
  if (wantedPlate) {
    const byPlate = vehicles.find((v) => normalizePlateNumber(v.plate || '') === wantedPlate);
    if (byPlate) return byPlate;
  }
  return fallback;
}

function cartItemsFromBillingOrOrder(orderId: string, order: any, billing: BillingDoc | null, services: any[]): PosCartItem[] {
  if (billing?.lineItems?.length) {
    return billing.lineItems.map((li, i) => {
      const serviceId = li.serviceId ? String(li.serviceId) : null;
      const svc = serviceId ? services.find((s) => s._id === serviceId) : undefined;
      return {
        id: serviceId || `billing-line-${orderId}-${i}`,
        name: li.name || 'Service',
        category: (svc as { category?: string } | undefined)?.category || 'Service',
        price: money(li.unitPrice),
        duration: (svc as { duration?: string } | undefined)?.duration || '',
        description: 'Included in original booking',
        quantity: Math.max(1, Math.floor(Number(li.quantity)) || 1),
        source: 'pickup_queue',
        orderLinked: true,
        queuedOrderId: orderId,
        billingServiceId: serviceId,
        queueLabel: 'Included in original booking',
      };
    });
  }

  const rawItems = Array.isArray(order?.items) ? order.items : [];
  if (rawItems.length > 0) {
    return rawItems.map((it: any, i: number) => {
      const product = it.product;
      const serviceId = typeof product === 'object' && product?._id ? String(product._id) : null;
      return {
        id: serviceId || `order-line-${orderId}-${i}`,
        name: String((typeof product === 'object' && product?.name) || it.name || order?.serviceType || 'Service'),
        category: String((typeof product === 'object' && product?.category) || 'Service'),
        price: money(it.price),
        duration: '',
        description: 'Included in original booking',
        quantity: Math.max(1, Math.floor(Number(it.quantity)) || 1),
        source: 'pickup_queue',
        orderLinked: true,
        queuedOrderId: orderId,
        billingServiceId: serviceId,
        queueLabel: 'Included in original booking',
      };
    });
  }

  const total = money(order?.totalPrice ?? order?.totalAmount);
  if (total <= 0) return [];
  return [
    {
      id: `order-${orderId}-total`,
      name: String(order?.serviceType || order?.serviceName || 'Booked service'),
      category: 'Service',
      price: total,
      duration: '',
      description: 'Included in original booking',
      quantity: 1,
      source: 'pickup_queue',
      orderLinked: true,
      queuedOrderId: orderId,
      billingServiceId: null,
      queueLabel: 'Included in original booking',
    },
  ];
}

// ── Balance / Pickup Queue indicator ─────────────────────────────────────────
function CheckInQueuePanel({
  bookings,
  loading,
  onOpenSearch,
  onRefresh,
}: {
  bookings: any[];
  loading: boolean;
  onOpenSearch: () => void;
  onRefresh: () => void;
}) {
  const queueCount = bookings.length;
  const first = bookings[0] || null;

  return (
    <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_1px_6px_rgba(15,23,42,0.05)]">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" style={{ animation: 'posQPulse 1.5s ease-in-out infinite' }} />
          <span className="shrink-0 text-xs font-bold text-slate-800">Balance / Pickup Queue</span>
          <span className="shrink-0 text-xs font-semibold text-slate-400">·</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            queueCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {loading ? 'Syncing...' : `${queueCount} due`}
          </span>
          {first && !loading && (
            <span className="ml-1 min-w-0 truncate rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {(first.customerName || 'Customer').split(' ')[0]} · {first.bookingTime || 'Ready'} · {formatPeso(money(first.remainingBalance ?? first.totalAmount ?? first.totalPrice))}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-white hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          aria-label="Refresh pickup queue"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
    </div>
  );
}

type POSWorkspaceProps = {
  /** When set (e.g. from balance notification), load this order into checkout */
  preloadOrderId?: string | null;
  onPreloadConsumed?: () => void;
};

// ── Main POS Workspace ────────────────────────────────────────────────────────
export default function POSWorkspace({
  preloadOrderId = null,
  onPreloadConsumed,
}: POSWorkspaceProps = {}) {
  const { services, isLoading: servicesLoading } = useServices();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [manualVehicleType, setManualVehicleType] = useState<VehicleType | null>(null);

  useEffect(() => {
    if (selectedVehicle?.type) setManualVehicleType(null);
  }, [selectedVehicle]);

  const customerVehicleType: VehicleType | null = selectedVehicle
    ? resolveVehicleType(selectedVehicle.type)
    : null;

  const effectiveVehicleType: VehicleType = manualVehicleType ?? customerVehicleType ?? 'sedan';
  const isVehicleFromCustomer = !manualVehicleType && customerVehicleType !== null;

  const customerPanelRef = useRef<CustomerVehiclePanelHandle>(null);
  const staleToastKeysRef = useRef<Set<string>>(new Set());

  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [billingCharges, setBillingCharges] = useState<PosBillingCharges>(emptyBillingCharges);
  const [billingComputedLive, setBillingComputedLive] = useState<BillingComputed | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [transactionNotes, setTransactionNotes] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [paymentConfirmAmountLabel, setPaymentConfirmAmountLabel] = useState('');
  const [processing, setProcessing] = useState(false);
  const [completedTxnId, setCompletedTxnId] = useState<string>('');
  /** Snapshot for receipt after payment (cart is cleared in same flow). */
  const [receiptData, setReceiptData] = useState<{
    txnId: string;
    cartItems: CartItem[];
    subtotal: number;
    discount: number;
    vatAmount: number;
    total: number;
    paymentMethod: string;
    customerPhone?: string;
    /** Reservation / GCash credited before this POS payment (for receipt line item). */
    reservationApplied?: number;
  } | null>(null);
  /** When set, Pay uses billing checkout for this existing order (queue / booking). */
  const [linkedOrderId, setLinkedOrderId] = useState<string | null>(null);
  /** Manually selected unpaid order (dropdown); queue selection uses `linkedOrderId`. */
  const [posBillingOrderId, setPosBillingOrderId] = useState<string | null>(null);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  const [unpaidOrdersLoading, setUnpaidOrdersLoading] = useState(false);
  const [selectedOrderStale, setSelectedOrderStale] = useState(false);
  const [billingSyncNonce, setBillingSyncNonce] = useState(0);
  const [lastInvoiceSnap, setLastInvoiceSnap] = useState<InvoiceA4Snapshot | null>(null);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<string | null>(null);
  const [queuedOrderContext, setQueuedOrderContext] = useState<QueuedOrderContext | null>(null);
  const [pendingQueuedOrder, setPendingQueuedOrder] = useState<any | null>(null);
  const [hydratingOrderId, setHydratingOrderId] = useState<string | null>(null);

  const handleBillingChargesChange = useCallback((payload: BillingChargesPayload) => {
    setBillingCharges({
      discount: payload.discount,
      taxVatAmount: payload.taxVatAmount,
      additionalFees: payload.additionalFees,
      downpayment: payload.downpayment,
    });
    if (payload.computed) setBillingComputedLive(payload.computed);
  }, []);

  const resetPosTransaction = useCallback(() => {
    setBillingCharges(emptyBillingCharges());
    setBillingComputedLive(null);
    setLastInvoiceSnap(null);
    setLastInvoiceNumber(null);
  }, []);

  const effectiveOrderId = idString(linkedOrderId ?? posBillingOrderId);

  const showStaleToastOnce = useCallback((orderId: unknown) => {
    const key = idString(orderId) || 'unknown';
    if (staleToastKeysRef.current.has(key)) return;
    staleToastKeysRef.current.add(key);
    toast.warning('This order is no longer eligible for checkout.');
  }, []);

  const clearQueuedOrderContext = useCallback(() => {
    const queuedOrderId = idString(queuedOrderContext?.orderId);
    setQueuedOrderContext(null);
    setPendingQueuedOrder(null);
    setSelectedOrderStale(false);
    setBillingComputedLive(null);
    setBillingCharges(emptyBillingCharges());
    setLastInvoiceSnap(null);
    setLastInvoiceNumber(null);
    if (queuedOrderId) {
      setCartItems((prev) =>
        prev.filter((item) => item.source !== 'pickup_queue' || idString(item.queuedOrderId) !== queuedOrderId)
      );
      setLinkedOrderId((current) => (idString(current) === queuedOrderId ? null : current));
      setPosBillingOrderId((current) => (idString(current) === queuedOrderId ? null : current));
    }
  }, [queuedOrderContext?.orderId]);

  const loadUnpaidOrders = useCallback(async (options?: { notifyStale?: boolean; clearStale?: boolean }) => {
    setUnpaidOrdersLoading(true);
    try {
      const { OrderService } = await import('@/lib/order-service');
      const res = await OrderService.getBalancePickupQueue({
        suppressErrorToast: true,
        limit: 100,
      });
      if (res.success && Array.isArray(res.data)) {
        const queueRows = res.data.filter((o: any) => o.paymentStatus !== 'paid');
        setUnpaidOrders(queueRows);
        if (effectiveOrderId) {
          const stillEligible = queueRows.some((o: any) => idString(normalizeQueuedPickupOrder(o).orderId) === effectiveOrderId);
          setSelectedOrderStale(!stillEligible);
          if (!stillEligible && options?.notifyStale) {
            showStaleToastOnce(effectiveOrderId);
          }
          if (!stillEligible && options?.clearStale && idString(queuedOrderContext?.orderId) === effectiveOrderId) {
            clearQueuedOrderContext();
          }
        } else {
          setSelectedOrderStale(false);
        }
      }
    } catch {
      /* silent */
    }
    setUnpaidOrdersLoading(false);
  }, [clearQueuedOrderContext, effectiveOrderId, queuedOrderContext?.orderId, showStaleToastOnce]);

  useEffect(() => {
    loadUnpaidOrders();
  }, [loadUnpaidOrders]);

  useEffect(() => {
    const socket = getSharedSocket();
    const refreshQueue = () => {
      void loadUnpaidOrders({ notifyStale: true, clearStale: true });
    };
    const onBalancePickupNotif = (payload: { metadata?: { kind?: string } }) => {
      if (payload?.metadata?.kind === 'balance_pickup') {
        refreshQueue();
      }
    };
    socket.on('notification:booking-manager', onBalancePickupNotif);
    socket.on('orderUpdated', refreshQueue);
    socket.on('pos:queue_updated', refreshQueue);
    return () => {
      socket.off('notification:booking-manager', onBalancePickupNotif);
      socket.off('orderUpdated', refreshQueue);
      socket.off('pos:queue_updated', refreshQueue);
    };
  }, [loadUnpaidOrders]);

  const buildLineItemsFromCart = useCallback(() => {
    return cartItems.map((c) => {
      const explicitServiceId = c.billingServiceId;
      const baseId = String(c.id).split('-')[0];
      const serviceId =
        explicitServiceId !== undefined
          ? explicitServiceId
          : String(c.id).startsWith('billing-line-') ||
              String(c.id).startsWith('order-line-') ||
              String(c.id).startsWith('order-')
            ? null
            : baseId;
      const svc = serviceId ? services.find((s) => s._id === serviceId || s._id === c.id) : undefined;
      const isTintBundle = String(c.id).includes('-tint');
      return {
        serviceId: isTintBundle ? null : serviceId,
        name: c.name,
        billingGroup: (svc as { billingGroup?: string } | undefined)?.billingGroup || 'uncategorized',
        unitPrice: c.price,
        quantity: c.quantity,
      };
    });
  }, [cartItems, services]);

  const buildHydratedQueuedOrderState = useCallback(
    async (seedRow: any): Promise<HydratedQueuedOrderState> => {
      const selectedQueueRow = normalizeQueuedPickupOrder(seedRow);
      const orderId = idString(selectedQueueRow.orderId);
      posQueueDebug('[POS Queue] normalized row', selectedQueueRow);
      posQueueDebug('[POS Queue] selected orderId', orderId);
      if (!orderId || !isValidMongoObjectId(orderId)) {
        const invalidError = new Error(selectedQueueRow.disabledReason || 'Invalid queue record');
        (invalidError as Error & { code?: string }).code = 'POS_QUEUE_INVALID';
        throw invalidError;
      }

      const { OrderService } = await import('@/lib/order-service');
      const queueRes = await OrderService.getBalancePickupQueue({
        suppressErrorToast: true,
        limit: 100,
      });
      if (!queueRes.success || !Array.isArray(queueRes.data)) {
        throw new Error('Queue refresh failed');
      }
      const normalizedRows = queueRes.data.map((row: any) => normalizeQueuedPickupOrder(row));
      posQueueDebug('[POS Queue] refetched ids', normalizedRows.map((row) => row.orderId));
      const freshNormalized = normalizedRows.find((row) => idString(row.orderId) === orderId);
      posQueueDebug('[POS Queue] revalidation found', Boolean(freshNormalized));
      if (!freshNormalized) {
        posQueueDebug('[POS Queue] stale reason', {
          selectedOrderId: orderId,
          refetchedOrderIds: normalizedRows.map((row) => row.orderId),
        });
        const staleError = new Error('This order is no longer eligible for checkout.');
        (staleError as Error & { code?: string }).code = 'POS_QUEUE_STALE';
        throw staleError;
      }
      const freshRow = freshNormalized.raw;

      const [orderRes, billingRes] = await Promise.all([
        OrderService.getOrderById(orderId),
        BillingService.getBilling(orderId),
      ]);
      const order = orderRes.success ? (orderRes.data as any) : null;
      const billing =
        billingRes.success && 'data' in billingRes && billingRes.data
          ? (billingRes.data as BillingDoc)
          : null;
      if (!order || !billing) {
        throw new Error('Order or billing could not be loaded');
      }

      const cart = cartItemsFromBillingOrOrder(orderId, order, billing, services);
      if (cart.length === 0) {
        throw new Error('Queued order has no payable line items');
      }

      const baseCustomer = customerFromOrder(order);
      if (!baseCustomer.id) {
        throw new Error('Queued order is missing a customer profile');
      }

      let garageVehicles: Vehicle[] = [];
      try {
        const vehRes = await VehicleService.getVehiclesForUser(baseCustomer.id);
        if (vehRes.success && Array.isArray(vehRes.data)) {
          garageVehicles = vehRes.data.map(mapApiVehicleToPosVehicle);
        }
      } catch {
        garageVehicles = [];
      }

      const fallbackVehicle = vehicleSnapshotFromOrder(order, orderId);
      const selectedQueuedVehicle = findExactQueuedVehicle(garageVehicles, order, fallbackVehicle);
      const vehicleHints = new Set<string>();
      garageVehicles.forEach((v) => {
        const plate = normalizePlateNumber(v.plate || '');
        if (plate) vehicleHints.add(plate);
      });
      const fallbackPlate = normalizePlateNumber(fallbackVehicle.plate || '');
      if (fallbackPlate) vehicleHints.add(fallbackPlate);
      const customer = {
        ...baseCustomer,
        vehicles: garageVehicles.some((v) => v.id === selectedQueuedVehicle.id)
          ? garageVehicles
          : [selectedQueuedVehicle, ...garageVehicles],
        garagePlateHints: [...vehicleHints],
      };
      const financial = financialFromQueueAndBilling(freshRow, billing);
      if (financial.remainingBalance <= 0) {
        const staleError = new Error('This order is no longer eligible for checkout.');
        (staleError as Error & { code?: string }).code = 'POS_QUEUE_STALE';
        throw staleError;
      }

      const ref = orderReference(freshRow);
      return {
        orderId,
        row: freshRow,
        order,
        customer,
        vehicle: selectedQueuedVehicle,
        cartItems: cart,
        billingCharges: chargesFromBillingDoc(billing, order?.downPaymentAmount, true),
        billingComputed: billing.computed ?? null,
        queuedContext: {
          orderId,
          label: ref,
          bookingReference: freshRow.bookingReference || order.bookingReference,
          orderNumber: freshRow.orderNumber || order.orderNumber,
          customerName: freshRow.customerName || order.customerName,
          financial,
        },
      };
    },
    [services]
  );

  useEffect(() => {
    if (!effectiveOrderId || hydratingOrderId || cartItems.length === 0) return undefined;
    const t = window.setTimeout(() => {
      void (async () => {
        const put = await BillingService.putBilling(effectiveOrderId, {
          lineItems: buildLineItemsFromCart(),
        });
        if (put.success && 'data' in put && put.data?.computed) {
          setBillingComputedLive(put.data.computed);
          setBillingCharges(chargesFromBillingDoc(put.data, undefined, true));
        }
      })();
    }, 450);
    return () => window.clearTimeout(t);
  }, [effectiveOrderId, hydratingOrderId, cartItems, buildLineItemsFromCart]);

  const persistInvoiceAfterCheckout = useCallback(
    async (invoiceNumber: string, snapshotFromCheckout?: InvoiceA4Snapshot) => {
      if (snapshotFromCheckout && typeof snapshotFromCheckout === 'object') {
        setLastInvoiceSnap(snapshotFromCheckout);
        setLastInvoiceNumber(invoiceNumber);
        return;
      }
      const snap = await fetchInvoiceSnapshot(invoiceNumber);
      if (snap) {
        setLastInvoiceSnap(snap);
        setLastInvoiceNumber(invoiceNumber);
      } else {
        toast.warning('Payment saved. Invoice preview could not load — use Print PDF from billing.');
      }
    },
    []
  );

  const onBillingCheckoutSuccess = useCallback(
    async ({ invoiceNumber, snapshot }: { invoiceNumber: string; pdfUrl: string; snapshot?: InvoiceA4Snapshot }) => {
      await persistInvoiceAfterCheckout(invoiceNumber, snapshot);
      setCartItems([]);
      setBillingCharges(emptyBillingCharges());
      setBillingComputedLive(null);
      setReceiptData(null);
      setLinkedOrderId(null);
      setPosBillingOrderId(null);
      setQueuedOrderContext(null);
      setPendingQueuedOrder(null);
      loadUnpaidOrders();
    },
    [loadUnpaidOrders, persistInvoiceAfterCheckout]
  );

  const hasActivePosTransaction = useMemo(() => {
    const chargesChanged =
      money(billingCharges.discount.value) > 0 ||
      money(billingCharges.taxVatAmount) > 0 ||
      money(billingCharges.additionalFees) > 0 ||
      money(billingCharges.downpayment) > 0;
    return Boolean(
      selectedCustomer ||
      selectedVehicle ||
      cartItems.length > 0 ||
      transactionNotes.trim() ||
      chargesChanged ||
      paymentMethod !== 'cash' ||
      linkedOrderId ||
      posBillingOrderId ||
      queuedOrderContext
    );
  }, [
    billingCharges,
    cartItems.length,
    linkedOrderId,
    paymentMethod,
    posBillingOrderId,
    queuedOrderContext,
    selectedCustomer,
    selectedVehicle,
    transactionNotes,
  ]);

  const applyHydratedQueuedOrder = useCallback((hydrated: HydratedQueuedOrderState) => {
    setSelectedCustomer(hydrated.customer);
    setSelectedVehicle(hydrated.vehicle);
    setManualVehicleType(null);
    setCartItems(hydrated.cartItems);
    setBillingCharges(hydrated.billingCharges);
    setBillingComputedLive(hydrated.billingComputed);
    setLinkedOrderId(hydrated.orderId);
    setPosBillingOrderId(null);
    setQueuedOrderContext(hydrated.queuedContext);
    setSelectedOrderStale(false);
    setLastInvoiceSnap(null);
    setLastInvoiceNumber(null);
    setBillingSyncNonce((n) => n + 1);
  }, []);

  const loadQueuedOrder = useCallback(
    async (row: any): Promise<boolean> => {
      posQueueDebug('[POS Queue] clicked row', row);
      const normalized = normalizeQueuedPickupOrder(row);
      const orderId = idString(normalized.orderId);
      posQueueDebug('[POS Queue] normalized row', normalized);
      if (!orderId) return false;
      if (!isValidMongoObjectId(orderId)) {
        posQueueDebug('[POS Queue] load disabled reason', {
          reason: normalized.disabledReason || 'Invalid queue record',
          row,
        });
        toast.error('Could not load this queued order. Please refresh the queue.');
        return false;
      }
      setHydratingOrderId(orderId);
      try {
        const hydrated = await buildHydratedQueuedOrderState(row);
        applyHydratedQueuedOrder(hydrated);
        setPendingQueuedOrder(null);
        toast.success(`Loaded pickup payment: ${hydrated.customer.name}`);
        void loadUnpaidOrders();
        return true;
      } catch (err: any) {
        if (err?.code === 'POS_QUEUE_STALE') {
          showStaleToastOnce(orderId);
          if (idString(queuedOrderContext?.orderId) === orderId) clearQueuedOrderContext();
          void loadUnpaidOrders({ notifyStale: false });
        } else {
          toast.error('Could not load this queued order. Please refresh the queue.');
        }
        return false;
      } finally {
        setHydratingOrderId(null);
      }
    },
    [
      applyHydratedQueuedOrder,
      buildHydratedQueuedOrderState,
      clearQueuedOrderContext,
      loadUnpaidOrders,
      queuedOrderContext?.orderId,
      showStaleToastOnce,
    ]
  );

  const requestLoadQueuedOrder = useCallback(
    async (row: any): Promise<boolean> => {
      const normalized = normalizeQueuedPickupOrder(row);
      const orderId = idString(normalized.orderId);
      if (!orderId) return false;
      if (hasActivePosTransaction && idString(queuedOrderContext?.orderId) !== orderId) {
        setPendingQueuedOrder(row);
        return false;
      }
      return loadQueuedOrder(row);
    },
    [hasActivePosTransaction, loadQueuedOrder, queuedOrderContext?.orderId]
  );

  const confirmPendingQueuedOrder = useCallback(async () => {
    if (!pendingQueuedOrder) return false;
    return loadQueuedOrder(pendingQueuedOrder);
  }, [loadQueuedOrder, pendingQueuedOrder]);

  const loadOrderForCheckout = useCallback(
    async (orderId: string) => {
      const id = String(orderId).trim();
      if (!id) return;
      let b = unpaidOrders.find((x: any) => idString(normalizeQueuedPickupOrder(x).orderId) === idString(id));
      if (!b) {
        const { OrderService } = await import('@/lib/order-service');
        const res = await OrderService.getOrderById(id);
        if (res.success && res.data) b = res.data;
      }
      if (!b) {
        toast.error('Could not load order for POS');
        return;
      }
      await loadQueuedOrder(b);
    },
    [loadQueuedOrder, unpaidOrders]
  );

  useEffect(() => {
    if (!preloadOrderId) return;
    void loadOrderForCheckout(preloadOrderId).finally(() => onPreloadConsumed?.());
  }, [preloadOrderId, loadOrderForCheckout, onPreloadConsumed]);

  const addToCart = (svcId: string, withTint = false) => {
    const svc = services.find((s) => s._id === svcId);
    if (!svc) return;
    const lockedVehicleType = effectiveVehicleType;

    if (withTint) {
      const spfKey = Object.keys(TINT_PRICES).find((k) => svc.name.includes(k));
      const tintPrice = spfKey ? (TINT_PRICES[spfKey][lockedVehicleType] ?? 0) : 0;
      if (tintPrice > 0) {
        const tintId = `${svcId}-tint`;
        if (!cartItems.find((c) => c.id === tintId)) {
          setCartItems((prev) => [...prev, {
            id: tintId,
            name: `${svc.name} + Nano Ceramic Window Tint`,
            category: svc.category,
            price: tintPrice,
            duration: '',
            description: 'Bundle with Nano Ceramic Window Tint',
            quantity: 1,
            source: 'manual',
            vehicleType: lockedVehicleType,
          } as PosCartItem]);
        }
        toast.success(`Tint bundle added: ${svc.name}`);
        return;
      }
    }

    const price = getEffectivePrice(svc, lockedVehicleType);
    const existing = cartItems.find((c) => c.id === svcId);
    if (existing) {
      setCartItems(cartItems.map((c) => c.id === svcId ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCartItems([...cartItems, {
        id: svc._id,
        name: svc.name,
        category: svc.category,
        price,
        duration: svc.duration || '',
        description: '',
        quantity: 1,
        source: 'manual',
        vehicleType: lockedVehicleType,
      } as PosCartItem]);
    }
    toast.success(`Added: ${svc.name} (${lockedVehicleType})`);
  };

  const removeFromCart = (svcId: string) => setCartItems(cartItems.filter((c) => c.id !== svcId));
  const updateQty = (svcId: string, qty: number) => {
    if (qty < 1) { removeFromCart(svcId); return; }
    setCartItems(cartItems.map((c) => c.id === svcId ? { ...c, quantity: qty } : c));
  };

  const subtotal = cartItems.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const totalsFromCharges = useCallback(
    (lineItems: BillingLineItem[]) =>
      computeBillingTotals({
        lineItems,
        discount: billingCharges.discount,
        taxVatAmount: billingCharges.taxVatAmount,
        additionalFees: billingCharges.additionalFees,
        downpayment: billingCharges.downpayment,
      }),
    [billingCharges]
  );

  const walkInTotals = useMemo(
    () =>
      cartItems.length > 0
        ? totalsFromCharges(buildLineItemsFromCart() as BillingLineItem[])
        : null,
    [cartItems.length, totalsFromCharges, buildLineItemsFromCart]
  );

  const total = walkInTotals?.grandTotal ?? 0;

  const walkInDiscountDisplay =
    billingCharges.discount.discountType === 'fixed'
      ? billingCharges.discount.value
      : walkInTotals?.discountTotal ?? 0;

  const balanceCheckoutPreview = useMemo(() => {
    if (!effectiveOrderId || cartItems.length === 0) return null;
    const queuedFinancial =
      idString(queuedOrderContext?.orderId) === effectiveOrderId ? queuedOrderContext.financial : null;
    if (queuedFinancial) {
      return {
        originalTotal: queuedFinancial.originalTotal,
        grandTotal: billingComputedLive?.grandTotal ?? queuedFinancial.grandTotal,
        reservationApplied: queuedFinancial.downpaymentApplied,
        amountPaid: queuedFinancial.amountPaid,
        balanceDue: queuedFinancial.remainingBalance,
        remainingBalance: queuedFinancial.remainingBalance,
        totalDue: queuedFinancial.totalDue,
        discountTotal: billingComputedLive?.discountTotal ?? queuedFinancial.discountTotal,
        taxVatTotal: billingComputedLive?.taxVatTotal ?? queuedFinancial.taxVatTotal,
        additionalFeesTotal: billingComputedLive?.additionalFeesTotal ?? queuedFinancial.additionalFeesTotal,
        queued: true,
      };
    }
    const computed =
      billingComputedLive ??
      totalsFromCharges(buildLineItemsFromCart() as BillingLineItem[]);
    return {
      originalTotal: computed.grandTotal,
      grandTotal: computed.grandTotal,
      reservationApplied: billingCharges.downpayment,
      amountPaid: billingCharges.downpayment,
      balanceDue: computed.balanceDue,
      remainingBalance: computed.balanceDue,
      totalDue: computed.balanceDue,
      discountTotal: computed.discountTotal,
      taxVatTotal: computed.taxVatTotal,
      additionalFeesTotal: computed.additionalFeesTotal,
      queued: false,
    };
  }, [
    effectiveOrderId,
    cartItems.length,
    billingComputedLive,
    billingCharges.downpayment,
    queuedOrderContext,
    totalsFromCharges,
    buildLineItemsFromCart,
  ]);

  const activeUnpaidOrder = useMemo(() => {
    if (!effectiveOrderId) return null;
    return unpaidOrders.find((o: any) => idString(normalizeQueuedPickupOrder(o).orderId) === effectiveOrderId) ?? null;
  }, [effectiveOrderId, unpaidOrders]);

  /** Live A4 preview while order is loaded (not a static screenshot). */
  const liveInvoicePreview = useMemo((): InvoiceA4Snapshot | null => {
    if (lastInvoiceSnap) return null;
    if (!effectiveOrderId || cartItems.length === 0) return null;
    const lineItems = buildLineItemsFromCart() as BillingLineItem[];
    const computed =
      billingComputedLive ?? totalsFromCharges(lineItems);
    const o = activeUnpaidOrder;
    return {
      invoiceNumber: 'Preview',
      issuedAt: new Date().toISOString(),
      orderNumber: o?.orderNumber,
      bookingReference: o?.bookingReference,
      customerName: selectedCustomer?.name || o?.customerName,
      customerPhone: resolveReceiptPhone(selectedCustomer, o),
      vehicle: selectedVehicle
        ? {
            year: selectedVehicle.year,
            make: selectedVehicle.make,
            model: selectedVehicle.model,
            plate: sanitizeVehiclePlate(selectedVehicle.plate) || selectedVehicle.plate,
            color: selectedVehicle.color,
            type: selectedVehicle.type,
          }
        : o
          ? {
              year: o.vehicleYear,
              make: o.vehicleMake,
              model: o.vehicleModel,
              plate: sanitizeVehiclePlate(o.vehiclePlate) || o.vehiclePlate,
              color: o.vehicleColor,
              type: o.vehicleType || o.vehicleClass || o.vehicleCategory,
            }
          : undefined,
      lineItems: lineItems.map((li) => ({
        name: li.name,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        lineTotal: li.unitPrice * li.quantity,
        billingGroup: li.billingGroup,
      })),
      discount: billingCharges.discount,
      taxVatAmount: billingCharges.taxVatAmount,
      additionalFees: billingCharges.additionalFees,
      downpayment: billingCharges.downpayment,
      computed,
      paymentStatus: 'draft',
    };
  }, [
    lastInvoiceSnap,
    effectiveOrderId,
    cartItems.length,
    buildLineItemsFromCart,
    billingComputedLive,
    totalsFromCharges,
    activeUnpaidOrder,
    selectedCustomer,
    selectedVehicle,
    billingCharges,
  ]);

  const displayInvoiceSnap = lastInvoiceSnap ?? liveInvoicePreview;
  const invoicePanelSuffix = lastInvoiceNumber
    ? `— ${lastInvoiceNumber}`
    : liveInvoicePreview
      ? '— live preview'
      : '(A4)';

  const handleProcessPayment = () => {
    if (selectedOrderStale) {
      showStaleToastOnce(effectiveOrderId);
      clearQueuedOrderContext();
      void loadUnpaidOrders({ notifyStale: false });
      return;
    }
    if (!selectedCustomer) { toast.error('Please select a customer before processing payment.'); return; }
    if (!selectedVehicle) { toast.error('Please select a vehicle for this transaction.'); return; }
    if (cartItems.length === 0) { toast.error('Add at least one service to proceed.'); return; }

    const lineItemsForConfirm = buildLineItemsFromCart() as BillingLineItem[];
    const confirmBalance = effectiveOrderId
      ? (balanceCheckoutPreview?.remainingBalance ?? totalsFromCharges(lineItemsForConfirm).balanceDue)
      : total;

    setPaymentConfirmAmountLabel(
      effectiveOrderId
        ? `Balance due: ${formatPeso(confirmBalance)}`
        : `Total: ${formatPeso(confirmBalance)}`
    );
    setShowPaymentConfirm(true);
  };

  const executeConfirmedPayment = async () => {
    setShowPaymentConfirm(false);
    if (!selectedCustomer || !selectedVehicle) {
      toast.error('Customer or vehicle missing. Reload the order and try again.');
      return;
    }
    setProcessing(true);
    try {
      if (effectiveOrderId) {
        const lineItems = buildLineItemsFromCart();
        const put = await BillingService.putBilling(effectiveOrderId, {
          lineItems,
          ...chargesToPutBody(billingCharges),
        });
        if (!put.success || !('data' in put) || !put.data) {
          toast.error((put as { message?: string }).message || 'Could not update billing');
          setProcessing(false);
          return;
        }
        const balanceDue = put.data.computed?.balanceDue ?? 0;
        const mapPm = (pm: string): 'cash' | 'gcash' =>
          pm === 'gcash' ? 'gcash' : 'cash';
        const pm = mapPm(paymentMethod);
        const chk = await BillingService.checkout(effectiveOrderId, {
          paymentMethod: pm,
          cashReceived: pm === 'cash' ? balanceDue : undefined,
        });
        if (!chk.success || !('data' in chk) || !chk.data) {
          if ((chk as { status?: number; code?: string }).status === 409 || (chk as { code?: string }).code === 'POS_QUEUE_STALE') {
            setSelectedOrderStale(true);
            showStaleToastOnce(effectiveOrderId);
            clearQueuedOrderContext();
            void loadUnpaidOrders({ notifyStale: false });
            setProcessing(false);
            return;
          }
          toast.error(chk.message || 'Checkout failed');
        } else {
          const chkData = chk.data;
          const savedReceipt = (chkData.receipt || {}) as any;
          const txnId = String(
            savedReceipt.transactionId ||
            chkData.posInvoiceId ||
            chkData.invoiceNumber ||
            chkData.paymentId ||
            ''
          );
          const discTotal = put.data.computed?.discountTotal ?? 0;
          setReceiptData({
            txnId,
            cartItems: cartItemsFromSavedReceipt(savedReceipt.items, cartItems),
            subtotal: Number(savedReceipt.subtotal ?? put.data.computed?.subtotal ?? subtotal),
            discount: discountAmountFromSavedReceipt(savedReceipt, discTotal),
            vatAmount: Number(savedReceipt.taxVatAmount ?? billingCharges.taxVatAmount),
            total: Number(savedReceipt.amountCollected ?? savedReceipt.total ?? balanceDue),
            paymentMethod: String(savedReceipt.paymentMethod || paymentMethod),
            customerPhone: resolveReceiptPhone(savedReceipt),
            reservationApplied: Number(savedReceipt.downpayment ?? billingCharges.downpayment),
          });
          setCompletedTxnId(txnId);
          setShowReceipt(true);
          const invNum = chkData.invoiceNumber || '';
          toast.success(invNum ? `Invoice ${invNum} generated` : 'Payment recorded');
          if (invNum) {
            const snapFromCheckout =
              chkData.snapshot && typeof chkData.snapshot === 'object'
                ? (chkData.snapshot as InvoiceA4Snapshot)
                : extractInvoiceSnapshot({ success: true, data: chkData });
            await persistInvoiceAfterCheckout(invNum, snapFromCheckout ?? undefined);
          }
          setCartItems([]);
          setBillingCharges(emptyBillingCharges());
          setBillingComputedLive(null);
          setLinkedOrderId(null);
          setPosBillingOrderId(null);
          setQueuedOrderContext(null);
          setPendingQueuedOrder(null);
          loadUnpaidOrders();
        }
        setProcessing(false);
        return;
      }

      const { OrderService } = await import('@/lib/order-service');
      if (selectedCustomer.isSynthetic) {
        toast.error('Reload the linked booking before processing payment.');
        return;
      }

      const lineItems = buildLineItemsFromCart();
      const computed = totalsFromCharges(lineItems as BillingLineItem[]);
      const serviceType = cartItems.map((c) => c.name).join(', ') || 'POS service';
      const orderPayload = {
        customer: selectedCustomer.id,
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email,
        customerPhone: resolveReceiptPhone(selectedCustomer) || '',
        vehicle: selectedVehicle.id,
        vehicleYear: selectedVehicle.year ? String(selectedVehicle.year) : '',
        vehiclePlate: selectedVehicle.plate,
        vehicleMake: selectedVehicle.make,
        vehicleModel: selectedVehicle.model,
        vehicleType: selectedVehicle.type,
        vehicleColor: selectedVehicle.color,
        serviceType,
        serviceName: serviceType,
        items: [],
        totalAmount: computed.grandTotal,
        totalPrice: computed.grandTotal,
        price: computed.grandTotal,
        notes: transactionNotes,
      };
      const createRes = await OrderService.createOrder(orderPayload);
      if (!createRes.success) {
        toast.error(createRes.message || 'Failed to create booking for POS payment');
        return;
      }

      const createdOrderId = String(createRes.data?._id || createRes.data?.id || '');
      if (!createdOrderId) {
        toast.error('Booking was created, but no order id was returned.');
        return;
      }

      const put = await BillingService.putBilling(createdOrderId, {
        lineItems,
        ...chargesToPutBody(billingCharges),
        downpayment: 0,
      });
      if (!put.success || !('data' in put) || !put.data) {
        toast.error((put as { message?: string }).message || 'Could not save POS billing');
        return;
      }

      const balanceDue = put.data.computed?.balanceDue ?? computed.balanceDue;
      const mapPm = (pm: string): 'cash' | 'gcash' => (pm === 'gcash' ? 'gcash' : 'cash');
      const pm = mapPm(paymentMethod);
      const chk = await BillingService.checkout(createdOrderId, {
        paymentMethod: pm,
        cashReceived: pm === 'cash' ? balanceDue : undefined,
      });
      if (!chk.success || !('data' in chk) || !chk.data) {
        toast.error(chk.message || 'Checkout failed');
        return;
      }

      const chkData = chk.data;
      const savedReceipt = (chkData.receipt || {}) as any;
      const txnId = String(
        savedReceipt.transactionId ||
        chkData.posInvoiceId ||
        chkData.invoiceNumber ||
        chkData.paymentId ||
        ''
      );
      setReceiptData({
        txnId,
        cartItems: cartItemsFromSavedReceipt(savedReceipt.items, cartItems),
        subtotal: Number(savedReceipt.subtotal ?? put.data.computed?.subtotal ?? subtotal),
        discount: discountAmountFromSavedReceipt(savedReceipt, put.data.computed?.discountTotal ?? walkInDiscountDisplay),
        vatAmount: Number(savedReceipt.taxVatAmount ?? billingCharges.taxVatAmount),
        total: Number(savedReceipt.amountCollected ?? savedReceipt.total ?? balanceDue),
        paymentMethod: String(savedReceipt.paymentMethod || paymentMethod),
        customerPhone: resolveReceiptPhone(savedReceipt),
        reservationApplied: Number(savedReceipt.downpayment ?? 0),
      });
      setCompletedTxnId(txnId);
      setShowReceipt(true);
      const invNum = chkData.invoiceNumber || '';
      toast.success(invNum ? `Invoice ${invNum} generated` : 'Payment recorded');
      if (invNum) {
        const snapFromCheckout =
          chkData.snapshot && typeof chkData.snapshot === 'object'
            ? (chkData.snapshot as InvoiceA4Snapshot)
            : extractInvoiceSnapshot({ success: true, data: chkData });
        await persistInvoiceAfterCheckout(invNum, snapFromCheckout ?? undefined);
      }
      setCartItems([]);
      setBillingCharges(emptyBillingCharges());
      setBillingComputedLive(null);
      setLinkedOrderId(null);
      setPosBillingOrderId(null);
      setQueuedOrderContext(null);
      setPendingQueuedOrder(null);
      loadUnpaidOrders();
    } catch (err: any) {
      console.error('POS Payment Error:', err);
      if (err?.response?.status === 409 || err?.response?.data?.code === 'POS_QUEUE_STALE') {
        setSelectedOrderStale(true);
        clearQueuedOrderContext();
        void loadUnpaidOrders({ notifyStale: false });
        showStaleToastOnce(effectiveOrderId);
        return;
      }
      toast.error(
        err?.response?.data?.message ||
        err?.message ||
        'Payment was not saved. No receipt was generated.'
      );
    } finally {
      setProcessing(false);
    }
  };

  const handleNewTransaction = () => {
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setManualVehicleType(null);
    setCartItems([]);
    resetPosTransaction();
    setPaymentMethod('cash');
    setTransactionNotes('');
    setShowReceipt(false);
    setShowPaymentConfirm(false);
    setCompletedTxnId('');
    setReceiptData(null);
    setLinkedOrderId(null);
    setPosBillingOrderId(null);
    setQueuedOrderContext(null);
    setPendingQueuedOrder(null);
    setSelectedOrderStale(false);
  };

  const receiptSnap = receiptData;
  const receiptCartItems = receiptSnap?.cartItems ?? cartItems;
  const receiptSubtotal = receiptSnap?.subtotal ?? subtotal;
  const receiptDiscount = receiptSnap?.discount ?? walkInDiscountDisplay;
  const receiptVat = receiptSnap?.vatAmount ?? billingCharges.taxVatAmount;
  const receiptTotal = receiptSnap?.total ?? total;
  const receiptTxnId = receiptSnap?.txnId ?? completedTxnId;
  const receiptPm = receiptSnap?.paymentMethod ?? paymentMethod;
  const receiptCustomer = selectedCustomer && receiptSnap?.customerPhone
    ? { ...selectedCustomer, phone: receiptSnap.customerPhone }
    : selectedCustomer;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes posQSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes posQPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.8); } }
      ` }} />
      <div className="h-full flex flex-col gap-3">
        <CheckInQueuePanel
          bookings={unpaidOrders}
          loading={unpaidOrdersLoading}
          onOpenSearch={() => customerPanelRef.current?.focusQueueSearch()}
          onRefresh={() => void loadUnpaidOrders()}
        />

        {/* POS 3-column area — fills remaining space */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-1 min-h-0">
          <div className="lg:col-span-3 flex flex-col overflow-hidden">
            <CustomerVehiclePanel
              ref={customerPanelRef}
              selectedCustomer={selectedCustomer}
              selectedVehicle={selectedVehicle}
              pickupQueueOrders={unpaidOrders}
              unpaidOrderOptions={unpaidOrders}
              queueLoading={unpaidOrdersLoading}
              hydratingOrderId={hydratingOrderId}
              pendingQueuedOrder={pendingQueuedOrder}
              selectedQueuedOrderId={queuedOrderContext?.orderId ?? null}
              onRequestLoadQueuedOrder={requestLoadQueuedOrder}
              onConfirmPendingQueuedOrder={confirmPendingQueuedOrder}
              onCancelPendingQueuedOrder={() => setPendingQueuedOrder(null)}
              onSelectCustomer={(c) => {
                clearQueuedOrderContext();
                setSelectedCustomer(c);
                setSelectedVehicle(null);
                setManualVehicleType(null);
                setLinkedOrderId(null);
                setPosBillingOrderId(null);
                resetPosTransaction();
              }}
              onSelectVehicle={(v) => { setSelectedVehicle(v); setManualVehicleType(null); }}
            />
          </div>

          <div className="lg:col-span-5 flex flex-col overflow-hidden">
            <ServiceCartPanel
              services={services}
              servicesLoading={servicesLoading}
              selectedVehicleType={effectiveVehicleType}
              onVehicleTypeChange={setManualVehicleType}
              isVehicleFromCustomer={isVehicleFromCustomer}
              cartItems={cartItems}
              onAddToCart={addToCart}
              onRemoveFromCart={removeFromCart}
              onUpdateQty={updateQty}
            />
          </div>

          <div className="lg:col-span-4 flex flex-col min-h-0 overflow-hidden gap-2">
            {/* Balance checkout: summary stays full height (no squeeze); billing scrolls below */}
            <div
              className={
                effectiveOrderId
                  ? 'shrink-0 flex flex-col'
                  : 'flex-1 min-h-0 flex flex-col'
              }
            >
              <PaymentSummaryPanel
                cartItems={cartItems}
                subtotal={subtotal}
                discount={walkInDiscountDisplay}
                vatAmount={billingCharges.taxVatAmount}
                total={total}
                balanceCheckout={balanceCheckoutPreview}
                compact={Boolean(effectiveOrderId)}
                paymentMethod={paymentMethod}
                processing={processing}
                paymentDisabled={selectedOrderStale || Boolean(hydratingOrderId)}
                queuedOrderLabel={queuedOrderContext?.label ?? null}
                onClearQueuedOrder={queuedOrderContext ? clearQueuedOrderContext : undefined}
                transactionNotes={transactionNotes}
                onTransactionNotesChange={setTransactionNotes}
                onDiscountChange={(v) =>
                  setBillingCharges((c) => ({
                    ...c,
                    discount: { discountType: 'fixed', value: v },
                  }))
                }
                onVatChange={(v) =>
                  setBillingCharges((c) => ({ ...c, taxVatAmount: Math.max(0, v) }))
                }
                onPaymentMethodChange={setPaymentMethod}
                onProcessPayment={handleProcessPayment}
              />
            </div>
            {effectiveOrderId && (
              <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pr-0.5 min-h-[120px]">
                <BillingWorkspace
                  orderId={effectiveOrderId}
                  syncNonce={billingSyncNonce}
                  onCheckoutSuccess={onBillingCheckoutSuccess}
                  onChargesChange={handleBillingChargesChange}
                  compact
                  hideCheckout
                  autoSaveCharges
                />
              </div>
            )}
            {displayInvoiceSnap && (effectiveOrderId || lastInvoiceSnap) && (
              <details
                className="rounded-xl border border-slate-200 bg-white shrink-0 min-w-0"
                open
              >
                <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-800 bg-slate-50 border-b border-slate-100">
                  Invoice {invoicePanelSuffix}
                </summary>
                <div className="p-2 max-h-[min(70vh,560px)] overflow-y-auto overflow-x-auto min-w-0">
                  {liveInvoicePreview && !lastInvoiceSnap && (
                    <p className="text-[10px] text-amber-800 font-medium mb-2 px-1">
                      Live preview — matches Billing discount/VAT. Final invoice number appears after Process Payment.
                    </p>
                  )}
                  <InvoiceA4 snapshot={displayInvoiceSnap} embedded />
                </div>
              </details>
            )}
          </div>
        </div>

        {showPaymentConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-5 text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={24} className="text-blue-700" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Confirm payment</h3>
                <p className="text-sm text-slate-700 font-medium mb-1">
                  Are you sure you want to confirm this payment?
                </p>
                {paymentConfirmAmountLabel ? (
                  <p className="text-xs text-slate-500 mb-4">{paymentConfirmAmountLabel}</p>
                ) : (
                  <p className="text-xs text-slate-500 mb-4">&nbsp;</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPaymentConfirm(false)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void executeConfirmedPayment()}
                    disabled={processing}
                    className="flex-1 rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    Yes, confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showReceipt && receiptCustomer && selectedVehicle && (
          <ReceiptModal
            txnId={receiptTxnId}
            customer={receiptCustomer}
            vehicle={selectedVehicle}
            cartItems={receiptCartItems}
            subtotal={receiptSubtotal}
            discount={receiptDiscount}
            vatAmount={receiptVat}
            total={receiptTotal}
            reservationApplied={receiptSnap?.reservationApplied ?? 0}
            paymentMethod={receiptPm}
            onClose={() => {
              setShowReceipt(false);
              setReceiptData(null);
            }}
            onNewTransaction={handleNewTransaction}
          />
        )}
      </div>
    </>
  );
}
