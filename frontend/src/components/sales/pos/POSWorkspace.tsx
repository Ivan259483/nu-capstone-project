import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import CustomerVehiclePanel, { type CustomerVehiclePanelHandle } from './CustomerVehiclePanel';
import ServiceCartPanel from './ServiceCartPanel';
import PaymentSummaryPanel from './PaymentSummaryPanel';
import ReceiptModal from './ReceiptModal';
import BillingWorkspace, { type BillingChargesPayload } from '@/components/sales/billing/BillingWorkspace';
import type { BillingDiscount, BillingDoc } from '@/lib/billing-service';
import InvoiceA4, { type InvoiceA4Snapshot } from '@/components/sales/billing/InvoiceA4';
import { Customer, Vehicle, CartItem, formatPeso, formatVehicleTypeLabel } from '@/lib/salesData';
import { useServices, VehicleType, getEffectivePrice } from '@/hooks/useServices';
import { useRefreshResource } from '@/hooks/useRefreshResource';
import { parsePickupQueueResponse } from '@/lib/salesSync';
import {
  BillingService,
  extractInvoiceSnapshot,
  fetchInvoiceSnapshot,
} from '@/lib/billing-service';
import { computeBillingTotals, type BillingComputed, type BillingLineItem } from '@/lib/billingTotals';
import { toast } from 'sonner';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { sanitizeVehiclePlate } from '@/lib/vehicle-display';
import { resolveReceiptPhone } from '@/lib/receipt-phone';
import { normalizePlateNumber } from '@/lib/plate';
import { useAuth } from '@/contexts/AuthContext';
import { VehicleService, mapApiVehicleToPosVehicle } from '@/lib/vehicle-service';
import { BACKEND_API_URL } from '@/lib/api';
import {
  idString,
  isValidMongoObjectId,
  normalizeMoney,
  normalizeQueuedPickupOrder,
  posQueueDebug,
} from '@/lib/pos-pickup-queue';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  computePosPaymentDisplayTotals,
  posPaymentTotalsReconcile,
} from '@/lib/pos-payment-summary';

function resolveVehicleType(pricingCategory?: string | null): VehicleType | null {
  const pricingCategoryMap: Record<string, VehicleType> = {
    HATCHBACK_SMALL_CAR: 'hatchback',
    SEDAN: 'sedan',
    MIDSIZED: 'midsized',
    SUV: 'suv',
    PICKUP: 'pickup',
    LARGE_SUV_VAN: 'largesuv',
    HIGH_END_SEDAN: 'highend',
  };
  return pricingCategoryMap[String(pricingCategory || '').trim().toUpperCase()] ?? null;
}

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

type QueuedOrderLoadFailure = {
  row: any;
  orderId: string;
  message: string;
};

type PosQueueLoadLog = {
  queueItemId: string;
  orderId: string;
  bookingId: string;
  reference: string;
  endpoint: string;
  httpStatus: number | string;
  responseBody: unknown;
};

function logPosQueueLoad(entry: PosQueueLoadLog): void {
  console.info(
    [
      '[POS QUEUE LOAD]',
      `queue item id: ${entry.queueItemId || '(missing)'}`,
      `order id: ${entry.orderId || '(missing)'}`,
      `booking id: ${entry.bookingId || '(missing)'}`,
      `reference: ${entry.reference || '(missing)'}`,
      `endpoint: ${entry.endpoint}`,
      `HTTP status: ${entry.httpStatus}`,
      'response body:',
    ].join('\n'),
    entry.responseBody
  );
}

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
    type: String(order?.vehicleType || order?.vehicleClass || order?.vehicleCategory || ''),
    pricingCategory: order?.pricingSnapshot?.vehiclePricingCategory || order?.vehicle?.pricingCategory || null,
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
    lastVisit: '',
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
  hasLoaded,
  error,
  onOpenSearch,
  onRefresh,
}: {
  bookings: any[];
  loading: boolean;
  hasLoaded: boolean;
  error: string | null;
  onOpenSearch: () => void;
  onRefresh: () => void;
}) {
  const queueCount = bookings.length;
  const first = bookings[0] || null;

  return (
    <div className={`shrink-0 rounded-xl border border-slate-200 bg-white px-3 shadow-[0_1px_6px_rgba(15,23,42,0.05)] ${queueCount > 0 ? 'py-2.5' : 'w-fit max-w-full py-1.5'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${queueCount > 0 ? 'bg-amber-500' : 'bg-slate-300'}`} />
          <span className="shrink-0 text-xs font-bold text-slate-800">Pickup queue</span>
          <span className="shrink-0 text-xs font-semibold text-slate-400">·</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
            queueCount > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}>
            {hasLoaded ? `${queueCount} due` : error ? 'Unavailable' : 'Syncing...'}
          </span>
          {first && (
            <span className="ml-1 min-w-0 truncate rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
              {(first.customerName || 'Customer').split(' ')[0]} · Sales/POS · {formatPeso(money(first.remainingBalance))}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className={`h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-white hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${queueCount > 0 || loading || error ? 'flex' : 'hidden sm:flex'}`}
          aria-label="Refresh pickup queue"
          disabled={loading}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 px-1.5 text-xs text-amber-700">
        {hasLoaded ? 'Pickup queue refresh failed. Showing last loaded entries.' : 'Pickup queue could not load. Try refreshing.'}
      </p>}
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
  const { services, pricingCategories, isLoading: servicesLoading } = useServices();
  const { user: cashier } = useAuth();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [manualVehicleType, setManualVehicleType] = useState<VehicleType | null>(null);

  useEffect(() => {
    if (selectedVehicle?.type) setManualVehicleType(null);
  }, [selectedVehicle]);

  const customerVehicleType: VehicleType | null = selectedVehicle
    ? resolveVehicleType(selectedVehicle.pricingCategory)
    : null;

  const effectiveVehicleType: VehicleType | null = manualVehicleType ?? customerVehicleType;
  const isVehicleFromCustomer = !manualVehicleType && customerVehicleType !== null;

  const customerPanelRef = useRef<CustomerVehiclePanelHandle>(null);
  const staleToastKeysRef = useRef<Set<string>>(new Set());
  const paymentLockRef = useRef(false);

  const [cartItems, setCartItems] = useState<PosCartItem[]>([]);
  const [billingCharges, setBillingCharges] = useState<PosBillingCharges>(emptyBillingCharges);
  const [billingComputedLive, setBillingComputedLive] = useState<BillingComputed | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [transactionNotes, setTransactionNotes] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cashReceived, setCashReceived] = useState('');
  const [gcashAmountReceived, setGcashAmountReceived] = useState('');
  const [gcashReference, setGcashReference] = useState('');
  const [paymentValidationAttempted, setPaymentValidationAttempted] = useState(false);
  const [cashFieldTouched, setCashFieldTouched] = useState(false);
  const [pickupPaymentResult, setPickupPaymentResult] = useState<{ receiptId: string; customer: string; vehicleReleaseAvailable: boolean } | null>(null);
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
    cashReceived?: number | null;
    amountReceived?: number | null;
    changeGiven?: number | null;
    paymentReference?: string | null;
    staffName?: string | null;
    transactionDate?: string | null;
    /** Reservation / GCash credited before this POS payment (for receipt line item). */
    reservationApplied?: number;
  } | null>(null);
  /** When set, Pay uses billing checkout for this existing order (queue / booking). */
  const [linkedOrderId, setLinkedOrderId] = useState<string | null>(null);
  /** Manually selected unpaid order (dropdown); queue selection uses `linkedOrderId`. */
  const [posBillingOrderId, setPosBillingOrderId] = useState<string | null>(null);
  const queue = useRefreshResource<any[]>([], async () => {
    const { OrderService } = await import('@/lib/order-service');
    const response = await OrderService.getBalancePickupQueue({ suppressErrorToast: true, limit: 100 });
    return parsePickupQueueResponse(response);
  });
  const unpaidOrders = queue.data;
  const unpaidOrdersLoading = queue.isRefreshing || (!queue.hasLoaded && !queue.error);
  const refreshQueue = queue.refresh;
  const [selectedOrderStale, setSelectedOrderStale] = useState(false);
  const [billingSyncNonce, setBillingSyncNonce] = useState(0);
  const [lastInvoiceSnap, setLastInvoiceSnap] = useState<InvoiceA4Snapshot | null>(null);
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState<string | null>(null);
  const [queuedOrderContext, setQueuedOrderContext] = useState<QueuedOrderContext | null>(null);
  const [pendingQueuedOrder, setPendingQueuedOrder] = useState<any | null>(null);
  const [hydratingOrderId, setHydratingOrderId] = useState<string | null>(null);
  const [queuedOrderLoadFailure, setQueuedOrderLoadFailure] = useState<QueuedOrderLoadFailure | null>(null);
  const skipNextHydratedBillingPersistRef = useRef(false);

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

  // Requests may finish after the cashier selects another order. Apply queue
  // eligibility to the current selection, and never clear checkout on failure.
  const queueSelectionRef = useRef({ effectiveOrderId, queuedOrderContext, clearQueuedOrderContext });
  queueSelectionRef.current = { effectiveOrderId, queuedOrderContext, clearQueuedOrderContext };
  const loadUnpaidOrders = useCallback(async (options?: { notifyStale?: boolean; clearStale?: boolean }) => {
    const queueRows = await refreshQueue();
    if (queueRows) {
      const selection = queueSelectionRef.current;
      const orderId = selection.effectiveOrderId;
      if (orderId) {
        const stillEligible = queueRows.some((o: any) => idString(normalizeQueuedPickupOrder(o).orderId) === orderId);
        setSelectedOrderStale(!stillEligible);
        if (!stillEligible && options?.notifyStale) {
          showStaleToastOnce(orderId);
        }
        if (!stillEligible && options?.clearStale && idString(selection.queuedOrderContext?.orderId) === orderId) {
          selection.clearQueuedOrderContext();
        }
      } else {
        setSelectedOrderStale(false);
      }
    }
  }, [refreshQueue, showStaleToastOnce]);

  useEffect(() => {
    loadUnpaidOrders();
  }, [loadUnpaidOrders, effectiveOrderId]);

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
      const endpointPath = `/orders/${encodeURIComponent(orderId)}/pos-queue-load`;
      const logContext = {
        queueItemId: idString(seedRow?._id) || idString(seedRow?.id),
        orderId,
        bookingId: idString(selectedQueueRow.bookingId),
        reference: selectedQueueRow.bookingReference,
        endpoint: `${BACKEND_API_URL}${endpointPath}`,
      };
      posQueueDebug('[POS Queue] normalized row', selectedQueueRow);
      posQueueDebug('[POS Queue] selected orderId', orderId);
      if (!orderId || !isValidMongoObjectId(orderId)) {
        logPosQueueLoad({
          ...logContext,
          httpStatus: 'NOT_SENT',
          responseBody: {
            success: false,
            code: 'POS_QUEUE_INVALID_ID',
            message: selectedQueueRow.disabledReason || 'Invalid queue record',
          },
        });
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

      let hydrateRes: any;
      try {
        logPosQueueLoad({
          ...logContext,
          httpStatus: 'PENDING',
          responseBody: { message: 'Awaiting POS queue hydration response' },
        });
        hydrateRes = await OrderService.getPosQueueLoad(orderId);
        logPosQueueLoad({
          ...logContext,
          httpStatus: 200,
          responseBody: hydrateRes,
        });
      } catch (error: any) {
        const timedOut = error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
        logPosQueueLoad({
          ...logContext,
          httpStatus: error?.response?.status ?? (timedOut ? 'TIMEOUT' : 'NO_HTTP_RESPONSE'),
          responseBody: error?.response?.data ?? {
            success: false,
            code: timedOut ? 'POS_QUEUE_LOAD_TIMEOUT' : 'POS_QUEUE_LOAD_NETWORK_ERROR',
            message: error?.message || 'No HTTP response received',
          },
        });
        throw error;
      }
      const order = hydrateRes.success ? (hydrateRes.data?.order as any) : null;
      const billing = hydrateRes.success ? (hydrateRes.data?.billing as BillingDoc | null) : null;
      if (!order || !billing) {
        const payloadError = new Error(hydrateRes?.message || 'Queued order payload is incomplete');
        (payloadError as Error & { code?: string }).code = hydrateRes?.code || 'POS_QUEUE_LOAD_INCOMPLETE';
        throw payloadError;
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
        const vehRes = await VehicleService.getVehiclesForUser(baseCustomer.id, {
          suppressErrorToast: true,
        });
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
    if (skipNextHydratedBillingPersistRef.current) {
      skipNextHydratedBillingPersistRef.current = false;
      return undefined;
    }
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
    // Hydration already contains the persisted billing document. Do not write
    // the same line items back immediately just because React state changed.
    skipNextHydratedBillingPersistRef.current = true;
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
    setPaymentMethod('cash');
    setCashReceived('');
    setGcashAmountReceived('');
    setGcashReference('');
    setPaymentValidationAttempted(false);
    setCashFieldTouched(false);
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
      setQueuedOrderLoadFailure(null);
      setHydratingOrderId(orderId);
      try {
        const hydrated = await buildHydratedQueuedOrderState(row);
        applyHydratedQueuedOrder(hydrated);
        setPendingQueuedOrder(null);
        setQueuedOrderLoadFailure(null);
        toast.success(`Loaded pickup payment: ${hydrated.customer.name}`);
        void loadUnpaidOrders();
        return true;
      } catch (err: any) {
        const timedOut = err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''));
        const message = err?.response?.data?.message
          || (timedOut ? 'Queued order loading timed out on the server.' : err?.message)
          || 'Could not load this queued order.';
        setQueuedOrderLoadFailure({ row, orderId, message });
        if (err?.code === 'POS_QUEUE_STALE') showStaleToastOnce(orderId);
        toast.error(message, {
          description: 'The Pickup Payment Queue remains available.',
          action: {
            label: 'Retry',
            onClick: () => { void loadQueuedOrder(row); },
          },
        });
        return false;
      } finally {
        setHydratingOrderId(null);
      }
    },
    [
      applyHydratedQueuedOrder,
      buildHydratedQueuedOrderState,
      loadUnpaidOrders,
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
    if (!selectedVehicle) {
      toast.error('Select a vehicle before adding a service.');
      return;
    }
    const svc = services.find((s) => s._id === svcId);
    if (!svc) return;
    const lockedVehicleType = effectiveVehicleType;
    if (!lockedVehicleType) {
      toast.error('PRICE_CATEGORY_REQUIRED: configure this vehicle pricing category before checkout.');
      return;
    }

    if (withTint) {
      const pricingKey = lockedVehicleType === 'largesuv' ? 'largeSuv' : lockedVehicleType;
      const tintPrice = svc.pricing?.[pricingKey]?.addon ?? null;
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
    if (price == null || price <= 0) {
      toast.error('This service has no configured price for the selected vehicle category.');
      return;
    }
    const existing = cartItems.find((c) => c.id === svcId);
    if (existing) {
      toast.info('This service is already in the transaction. Update quantity from the cart.');
      return;
    } else {
      setCartItems((prev) => [...prev, {
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
    toast.success(`Added: ${svc.name} (${formatVehicleTypeLabel(lockedVehicleType)})`);
  };

  const removeFromCart = (svcId: string) => setCartItems((prev) => prev.filter((c) => c.id !== svcId));
  const updateQty = (svcId: string, qty: number) => {
    if (qty < 1) { removeFromCart(svcId); return; }
    setCartItems((prev) => prev.map((c) => c.id === svcId ? { ...c, quantity: qty } : c));
  };

  const repriceManualCartItem = (item: PosCartItem, nextVehicleType: VehicleType): PosCartItem => {
    if (item.source === 'pickup_queue' || item.orderLinked) return item;
    const itemId = String(item.id);
    const baseServiceId = itemId.endsWith('-tint') ? itemId.slice(0, -'-tint'.length) : itemId;
    const service = services.find((candidate) => candidate._id === baseServiceId);
    if (!service) return { ...item, vehicleType: nextVehicleType };
    if (itemId.endsWith('-tint')) {
      const pricingKey = nextVehicleType === 'largesuv' ? 'largeSuv' : nextVehicleType;
      const tintPrice = service.pricing?.[pricingKey]?.addon;
      return tintPrice != null && tintPrice > 0
        ? { ...item, price: tintPrice, vehicleType: nextVehicleType }
        : item;
    }
    const nextPrice = getEffectivePrice(service, nextVehicleType);
    return nextPrice != null && nextPrice > 0
      ? { ...item, price: nextPrice, vehicleType: nextVehicleType }
      : item;
  };

  const selectVehicleAndRefreshPricing = (vehicle: Vehicle) => {
    const nextVehicleType = resolveVehicleType(vehicle.pricingCategory);
    const hadManualItems = cartItems.some((item) => item.source !== 'pickup_queue' && !item.orderLinked);
    setSelectedVehicle(vehicle);
    setManualVehicleType(null);
    setCashReceived('');
    setGcashAmountReceived('');
    setPaymentValidationAttempted(false);
    setCashFieldTouched(false);
    if (!nextVehicleType) {
      setCartItems((currentItems) => currentItems.filter((item) => item.source === 'pickup_queue' || item.orderLinked));
      toast.error('PRICE_CATEGORY_REQUIRED: configure this vehicle before adding services.');
      return;
    }
    setCartItems((currentItems) => currentItems.map((item) => repriceManualCartItem(item, nextVehicleType)));
    if (hadManualItems) toast.info('Cart pricing updated for the selected vehicle.');
  };

  const selectVehicleTypeAndRefreshPricing = (nextVehicleType: VehicleType) => {
    const hadManualItems = cartItems.some((item) => item.source !== 'pickup_queue' && !item.orderLinked);
    setManualVehicleType(nextVehicleType);
    setCashReceived('');
    setGcashAmountReceived('');
    setPaymentValidationAttempted(false);
    setCashFieldTouched(false);
    setCartItems((currentItems) => currentItems.map((item) => repriceManualCartItem(item, nextVehicleType)));
    if (hadManualItems) toast.info('Cart pricing updated for the selected vehicle class.');
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

  const walkInDiscountDisplay = walkInTotals?.discountTotal ?? 0;

  const balanceCheckoutPreview = useMemo(() => {
    if (!effectiveOrderId || cartItems.length === 0) return null;
    const queuedFinancial =
      idString(queuedOrderContext?.orderId) === effectiveOrderId ? queuedOrderContext.financial : null;
    if (queuedFinancial) {
      const discountTotal = billingComputedLive?.discountTotal ?? queuedFinancial.discountTotal;
      const taxVatTotal = billingComputedLive?.taxVatTotal ?? queuedFinancial.taxVatTotal;
      const additionalFeesTotal = billingComputedLive?.additionalFeesTotal ?? queuedFinancial.additionalFeesTotal;
      const displayTotals = computePosPaymentDisplayTotals({
        lineItems: cartItems,
        discountTotal,
        taxVatTotal,
        additionalFeesTotal,
        amountPaid: queuedFinancial.amountPaid,
      });
      if (!posPaymentTotalsReconcile(displayTotals.expectedTotalDue, queuedFinancial.remainingBalance)) {
        posQueueDebug('[POS Queue] displayed totals do not reconcile with authoritative balance', {
          ...displayTotals,
          discountTotal,
          taxVatTotal,
          additionalFeesTotal,
          amountPaid: queuedFinancial.amountPaid,
          authoritativeTotalDue: queuedFinancial.remainingBalance,
        });
      }
      return {
        originalTotal: displayTotals.originalTotal,
        grandTotal: billingComputedLive?.grandTotal ?? queuedFinancial.grandTotal,
        reservationApplied: queuedFinancial.downpaymentApplied,
        amountPaid: queuedFinancial.amountPaid,
        balanceDue: queuedFinancial.remainingBalance,
        remainingBalance: queuedFinancial.remainingBalance,
        totalDue: queuedFinancial.totalDue,
        discountTotal,
        taxVatTotal,
        additionalFeesTotal,
        queued: true,
      };
    }
    const computed =
      billingComputedLive ??
      totalsFromCharges(buildLineItemsFromCart() as BillingLineItem[]);
    return {
      originalTotal: computed.subtotal,
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
    cartItems,
    billingComputedLive,
    billingCharges.downpayment,
    queuedOrderContext,
    totalsFromCharges,
    buildLineItemsFromCart,
  ]);

  const currentPayAmount = balanceCheckoutPreview?.remainingBalance ?? balanceCheckoutPreview?.balanceDue ?? total;
  const cashReceivedAmount = Math.max(0, Number(cashReceived) || 0);
  const gcashReceivedAmount = Math.max(0, Number(gcashAmountReceived) || 0);

  const paymentValidationMessage = useMemo(() => {
    if (selectedOrderStale) return 'This queued order is no longer eligible for checkout.';
    if (hydratingOrderId) return 'Wait for the queued order to finish loading.';
    if (!selectedCustomer) return 'Select a customer before checkout.';
    if (!selectedVehicle) return 'Select a vehicle before checkout.';
    if (cartItems.length === 0) return 'Add at least one service before checkout.';
    if (currentPayAmount <= 0) return 'The transaction total must be greater than zero.';
    if (paymentMethod === 'cash' && cashReceivedAmount < currentPayAmount) {
      return cashReceivedAmount > 0
        ? `Cash received is ${formatPeso(currentPayAmount - cashReceivedAmount)} short.`
        : 'Enter the cash received.';
    }
    if (paymentMethod === 'gcash') {
      if (Math.abs(gcashReceivedAmount - currentPayAmount) > 0.009) {
        return `GCash amount received must match ${formatPeso(currentPayAmount)}.`;
      }
      if (gcashReference.trim().length < 6) return 'Enter a valid GCash reference number.';
    }
    return '';
  }, [
    cartItems.length,
    cashReceivedAmount,
    currentPayAmount,
    gcashReceivedAmount,
    gcashReference,
    hydratingOrderId,
    paymentMethod,
    selectedCustomer,
    selectedOrderStale,
    selectedVehicle,
  ]);

  const cashTenderValidationMessage = useMemo(() => {
    if (paymentMethod !== 'cash' || currentPayAmount <= 0 || cashReceivedAmount >= currentPayAmount) return '';
    return cashReceivedAmount > 0
      ? `Cash received is ${formatPeso(currentPayAmount - cashReceivedAmount)} short.`
      : 'Enter the cash received.';
  }, [cashReceivedAmount, currentPayAmount, paymentMethod]);

  const paymentSummaryValidationMessage =
    paymentValidationMessage === cashTenderValidationMessage ? '' : paymentValidationMessage;

  const handlePaymentMethodChange = useCallback((method: string) => {
    setPaymentMethod(method);
    setPaymentValidationAttempted(false);
    setCashFieldTouched(false);
    if (method === 'gcash') {
      setGcashAmountReceived((current) => current || currentPayAmount.toFixed(2));
    }
  }, [currentPayAmount]);

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
    setPaymentValidationAttempted(true);
    if (selectedOrderStale) {
      showStaleToastOnce(effectiveOrderId);
      clearQueuedOrderContext();
      void loadUnpaidOrders({ notifyStale: false });
      return;
    }
    if (paymentValidationMessage || paymentLockRef.current || processing) return;
    setShowPaymentConfirm(true);
  };

  const executeConfirmedPayment = async () => {
    if (paymentLockRef.current) return;
    if (!selectedCustomer || !selectedVehicle) {
      setPaymentValidationAttempted(true);
      return;
    }
    paymentLockRef.current = true;
    setShowPaymentConfirm(false);
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
          staffId: cashier?._id || cashier?.id || null,
          cashReceived: pm === 'cash' ? cashReceivedAmount : undefined,
          amountReceived: pm === 'gcash' ? gcashReceivedAmount : undefined,
          paymentReference: pm === 'gcash' ? gcashReference.trim() : undefined,
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
            cashReceived: savedReceipt.cashReceived == null ? null : Number(savedReceipt.cashReceived),
            amountReceived: savedReceipt.amountReceived == null ? null : Number(savedReceipt.amountReceived),
            changeGiven: savedReceipt.changeGiven == null ? null : Number(savedReceipt.changeGiven),
            paymentReference: savedReceipt.paymentReference ? String(savedReceipt.paymentReference) : null,
            staffName: savedReceipt.staff?.name ? String(savedReceipt.staff.name) : cashier?.name || null,
            transactionDate: savedReceipt.date ? String(savedReceipt.date) : new Date().toISOString(),
            reservationApplied: Number(savedReceipt.downpayment ?? billingCharges.downpayment),
          });
          setCompletedTxnId(txnId);
          setShowReceipt(true);
          const invNum = chkData.invoiceNumber || '';
          setPickupPaymentResult({ receiptId: invNum || txnId, customer: selectedCustomer?.name || 'Customer', vehicleReleaseAvailable: chkData.vehicleReleaseAvailable === true });
          toast.success('Receipt Generated', { description: chkData.vehicleReleaseAvailable ? 'Payment Completed · Vehicle Release Available. Complete customer handover to close the service.' : 'Payment Completed. Service and release requirements remain visible in Quality Control.' });
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
        isWalkIn: true,
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
        staffId: cashier?._id || cashier?.id || null,
        cashReceived: pm === 'cash' ? cashReceivedAmount : undefined,
        amountReceived: pm === 'gcash' ? gcashReceivedAmount : undefined,
        paymentReference: pm === 'gcash' ? gcashReference.trim() : undefined,
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
        cashReceived: savedReceipt.cashReceived == null ? null : Number(savedReceipt.cashReceived),
        amountReceived: savedReceipt.amountReceived == null ? null : Number(savedReceipt.amountReceived),
        changeGiven: savedReceipt.changeGiven == null ? null : Number(savedReceipt.changeGiven),
        paymentReference: savedReceipt.paymentReference ? String(savedReceipt.paymentReference) : null,
        staffName: savedReceipt.staff?.name ? String(savedReceipt.staff.name) : cashier?.name || null,
        transactionDate: savedReceipt.date ? String(savedReceipt.date) : new Date().toISOString(),
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
      paymentLockRef.current = false;
    }
  };

  const handleNewTransaction = () => {
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setManualVehicleType(null);
    setCartItems([]);
    resetPosTransaction();
    setPaymentMethod('cash');
    setCashReceived('');
    setGcashAmountReceived('');
    setGcashReference('');
    setPaymentValidationAttempted(false);
    setCashFieldTouched(false);
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
  const receiptCashReceived = receiptSnap?.cashReceived ?? null;
  const receiptAmountReceived = receiptSnap?.amountReceived ?? null;
  const receiptChangeGiven = receiptSnap?.changeGiven ?? null;
  const receiptPaymentReference = receiptSnap?.paymentReference ?? null;
  const receiptStaffName = receiptSnap?.staffName ?? cashier?.name ?? null;
  const receiptTransactionDate = receiptSnap?.transactionDate ?? null;
  const receiptCustomer = selectedCustomer && receiptSnap?.customerPhone
    ? { ...selectedCustomer, phone: receiptSnap.customerPhone }
    : selectedCustomer;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes posQSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes posQPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.8); } }
      ` }} />
      <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto lg:overflow-hidden">
        <CheckInQueuePanel
          bookings={unpaidOrders}
          loading={unpaidOrdersLoading}
          hasLoaded={queue.hasLoaded}
          error={queue.error}
          onOpenSearch={() => customerPanelRef.current?.focusQueueSearch()}
          onRefresh={() => void loadUnpaidOrders()}
        />

        {pickupPaymentResult ? <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div><p className="text-sm font-semibold text-emerald-900">Receipt Generated · {pickupPaymentResult.receiptId}</p><p className="mt-1 text-sm text-emerald-800">{pickupPaymentResult.customer} · {pickupPaymentResult.vehicleReleaseAvailable ? 'Vehicle Release Available' : 'Payment Completed'}</p><p className="mt-1 text-xs text-emerald-800">{pickupPaymentResult.vehicleReleaseAvailable ? 'Quality Control can now complete customer handover.' : 'Quality Control must finish the service requirements before customer handover.'}</p></div>
          <button type="button" onClick={() => setPickupPaymentResult(null)} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">Dismiss</button>
        </div> : null}

        {/* POS 3-column area — fills remaining space */}
        <div className="grid grid-cols-1 items-stretch gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-12">
          <div className="flex min-h-[30rem] flex-col overflow-hidden lg:col-span-3 lg:min-h-0">
            <CustomerVehiclePanel
              ref={customerPanelRef}
              selectedCustomer={selectedCustomer}
              selectedVehicle={selectedVehicle}
              pickupQueueOrders={unpaidOrders}
              unpaidOrderOptions={unpaidOrders}
              queueLoading={unpaidOrdersLoading}
              hydratingOrderId={hydratingOrderId}
              pendingQueuedOrder={pendingQueuedOrder}
              queuedOrderLoadFailure={queuedOrderLoadFailure}
              selectedQueuedOrderId={queuedOrderContext?.orderId ?? null}
              onRequestLoadQueuedOrder={requestLoadQueuedOrder}
              onRetryQueuedOrder={() => {
                if (queuedOrderLoadFailure?.row) void loadQueuedOrder(queuedOrderLoadFailure.row);
              }}
              onConfirmPendingQueuedOrder={confirmPendingQueuedOrder}
              onCancelPendingQueuedOrder={() => setPendingQueuedOrder(null)}
              onSelectCustomer={(c) => {
                clearQueuedOrderContext();
                setSelectedCustomer(c);
                setSelectedVehicle(null);
                setManualVehicleType(null);
                setLinkedOrderId(null);
                setPosBillingOrderId(null);
                setPaymentMethod('cash');
                setCashReceived('');
                setGcashAmountReceived('');
                setGcashReference('');
                setPaymentValidationAttempted(false);
                setCashFieldTouched(false);
                resetPosTransaction();
              }}
              onSelectVehicle={selectVehicleAndRefreshPricing}
            />
          </div>

          <div className="flex min-h-[40rem] flex-col overflow-hidden lg:col-span-5 lg:min-h-0">
            <ServiceCartPanel
              services={services}
              pricingCategories={pricingCategories}
              servicesLoading={servicesLoading}
              selectedVehicleType={effectiveVehicleType}
              selectedVehicle={selectedVehicle}
              onVehicleTypeChange={selectVehicleTypeAndRefreshPricing}
              isVehicleFromCustomer={isVehicleFromCustomer}
              cartItems={cartItems}
              onAddToCart={addToCart}
              onRemoveFromCart={removeFromCart}
              onUpdateQty={updateQty}
            />
          </div>

          <div className="flex min-h-[38rem] flex-col gap-2 overflow-hidden lg:sticky lg:top-0 lg:col-span-4 lg:min-h-0">
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
                discountConfig={billingCharges.discount}
                vatAmount={billingCharges.taxVatAmount}
                total={total}
                balanceCheckout={balanceCheckoutPreview}
                compact={Boolean(effectiveOrderId)}
                paymentMethod={paymentMethod}
                processing={processing}
                paymentDisabled={Boolean(paymentValidationMessage)}
                queuedOrderLabel={queuedOrderContext?.label ?? null}
                onClearQueuedOrder={queuedOrderContext ? clearQueuedOrderContext : undefined}
                transactionNotes={transactionNotes}
                cashReceived={cashReceived}
                gcashAmountReceived={gcashAmountReceived}
                gcashReference={gcashReference}
                validationAttempted={paymentValidationAttempted}
                cashValidationVisible={cashFieldTouched || paymentValidationAttempted}
                validationMessage={paymentSummaryValidationMessage}
                onTransactionNotesChange={setTransactionNotes}
                onDiscountChange={(discount) => setBillingCharges((charges) => ({ ...charges, discount }))}
                onVatChange={(v) =>
                  setBillingCharges((c) => ({ ...c, taxVatAmount: Math.max(0, v) }))
                }
                onPaymentMethodChange={handlePaymentMethodChange}
                onCashReceivedChange={setCashReceived}
                onCashReceivedBlur={() => setCashFieldTouched(true)}
                onGcashAmountReceivedChange={(value) => { setGcashAmountReceived(value); setPaymentValidationAttempted(false); }}
                onGcashReferenceChange={(value) => { setGcashReference(value); setPaymentValidationAttempted(false); }}
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

        <Dialog
          open={showPaymentConfirm}
          onOpenChange={(open) => {
            if (!processing) setShowPaymentConfirm(open);
          }}
        >
          <DialogContent
            aria-describedby={undefined}
            overlayClassName="bg-slate-900/60 backdrop-blur-sm"
            className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md gap-0 overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-xl sm:rounded-2xl [&>button]:right-4 [&>button]:top-4 [&>button]:rounded-lg [&>button]:p-1.5 [&>button]:text-slate-400 [&>button]:opacity-100 [&>button:hover]:bg-slate-100 [&>button:hover]:text-slate-700"
          >
              <div className="p-5">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                  <CheckCircle2 size={24} className="text-blue-700" />
                </div>
                <div className="text-center">
                  <DialogTitle className="text-lg font-bold leading-normal text-slate-950">Confirm {paymentMethod === 'gcash' ? 'GCash' : 'Cash'} Payment</DialogTitle>
                  <p className="mt-1 text-xs text-slate-500">Review the tender details before creating the transaction.</p>
                </div>
                <dl className="mt-5 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs">
                  <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Customer</dt><dd className="text-right font-bold text-slate-900">{selectedCustomer?.name || '—'}</dd></div>
                  <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Vehicle</dt><dd className="max-w-[65%] text-right font-bold text-slate-900">{selectedVehicle ? `${[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(' ')}${selectedVehicle.plate ? ` · ${selectedVehicle.plate}` : ''}` : '—'}</dd></div>
                  <div className="flex items-start justify-between gap-4 border-t border-slate-200 pt-2.5"><dt className="font-semibold text-slate-700">Total</dt><dd className="text-base font-black tabular-nums text-blue-700">{formatPeso(currentPayAmount)}</dd></div>
                  {paymentMethod === 'cash' ? (
                    <>
                      <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Cash Received</dt><dd className="font-bold tabular-nums text-slate-900">{formatPeso(cashReceivedAmount)}</dd></div>
                      <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Change</dt><dd className="font-bold tabular-nums text-emerald-700">{formatPeso(Math.max(0, cashReceivedAmount - currentPayAmount))}</dd></div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">Amount Received</dt><dd className="font-bold tabular-nums text-slate-900">{formatPeso(gcashReceivedAmount)}</dd></div>
                      <div className="flex items-start justify-between gap-4"><dt className="text-slate-500">GCash reference</dt><dd className="max-w-[65%] break-all text-right font-bold text-slate-900">{gcashReference.trim()}</dd></div>
                    </>
                  )}
                  <div className="flex items-start justify-between gap-4 border-t border-slate-200 pt-2.5"><dt className="text-slate-500">Cashier</dt><dd className="text-right font-semibold text-slate-800">{cashier?.name || 'Signed-in sales staff'}</dd></div>
                </dl>
                <div className="mt-5 flex gap-3">
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
                    {paymentMethod === 'gcash' ? 'Confirm GCash Payment' : 'Confirm Payment'}
                  </button>
                </div>
              </div>
          </DialogContent>
        </Dialog>

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
            cashReceived={receiptCashReceived}
            amountReceived={receiptAmountReceived}
            changeGiven={receiptChangeGiven}
            paymentReference={receiptPaymentReference}
            staffName={receiptStaffName}
            transactionDate={receiptTransactionDate}
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
