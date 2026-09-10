import { requireVehiclePricing } from '../services/vehicleIntelligence.service.js';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import Service from '../models/service.model.js';
import Vehicle from '../models/vehicle.model.js';
import User from '../models/user.model.js';
import ChatConversation from '../models/chatConversation.model.js';
import Notification from '../models/notification.model.js';
import Setting from '../models/setting.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';
import Payment from '../models/payment.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import emailService from '../utils/emailService.utils.js';
import { getIO } from '../utils/socket.utils.js';
import { jsPDF } from 'jspdf';
import { generateTermsAndConditionsPDF, generateWarrantyPDF, generateQCPDF } from '../utils/pdf.utils.js';
import { generateOperationsChecklist } from '../utils/checklist.utils.js';
import {
  FULL_ADMIN_ROLES,
  isBookingManagerRole,
  isCustomerRole,
  isFullAdminRole,
  isPosManagerRole,
  isServiceStaffRole,
  isStaffRole,
  normalizeToCanonical,
} from '../constants/roles.js';
import { emitBookingManagerNotification } from '../utils/bookingManagerNotifications.utils.js';
import {
  createCustomerBookingCancelledNotification,
  createCustomerBookingRejectedNotification,
  createCustomerBookingRescheduledNotification,
  createCustomerDamageReportNotification,
  createCustomerPaymentConfirmedNotification,
  createCustomerServiceProgressNotification,
  createCustomerStageNotification,
  createCustomerTechnicianAssignedNotification,
} from '../utils/customerStageNotifications.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import { decrypt, looksLikeEncryptedValue } from '../utils/encryption.utils.js';
import { countGatePhotos, REQUIRED_GATE_PHOTOS } from '../utils/trackerGatePhotos.utils.js';
import {
  buildQueueReason,
  computeOrderFinancialState,
  evaluateReadyForPickupQueueEligibility,
} from '../utils/readyPickupPaymentFlow.utils.js';
import {
  resolveReceiptPhoneForClient,
  USER_PHONE_SELECT_FIELDS,
} from '../utils/phone-client.utils.js';
import {
  captureOrderSlotOccupancy,
  getDateAvailabilitySnapshot,
  normalizeBookingDate,
  normalizeBookingTime,
  orderOccupiesSlot,
  releaseBookingReservation,
  releaseBookingSlot,
  releaseBookingSlotsForOrders,
  reserveBookingSlot,
  saveOrderWithSlotTransition,
  validateSlotAvailability,
} from '../services/slot.service.js';
import { getPackageKeyFromName } from '../constants/spfPricing.js';
import {
  ServicePricingError,
  buildPricingSnapshot,
  resolveBookingQuote,
} from '../services/servicePricing.service.js';
import { emitAvailabilityUpdated } from '../utils/availabilityBroadcast.utils.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';
import {
  handleQualityStageTransition,
  notifyQualityJobAssignment,
} from '../services/qualityNotification.service.js';
import { timeOperation } from '../utils/performance.utils.js';
import { normalizePosPaymentMethod } from '../utils/paymentMethod.utils.js';
import {
  assertVerificationChecklistComplete,
  ensurePendingReservationPayment,
  MINIMUM_RESERVATION_FEE,
  normalizeReservationAmount,
  reservationPaymentAmount,
  reservationRemainingBalance,
} from '../services/reservationPayment.service.js';
import {
  createVerifiedLedgerPayment,
  getOrderLedger,
  getOrderServiceTotal,
  roundMoney,
  summarizeLedgerRows,
} from '../services/financialLedger.service.js';
import {
  assertBookingsEnabled,
  runTrackedSystemMutation,
} from '../middleware/systemLifecycle.middleware.js';
import { getCustomerVisibleTrackerStageMedia } from '../utils/customerTrackerEvidence.utils.js';

import { buildCustomerStagePayload } from '../utils/customerTrackerStage.utils.js';
const DEFAULT_SERVICE_STEPS = [
  { name: 'Initial Wash & Prep', status: 'pending' },
  { name: 'Surface Decontamination', status: 'pending' },
  { name: 'Main Service Execution', status: 'pending' },
  { name: 'Quality Inspection', status: 'pending' },
  { name: 'Customer Handover Ready', status: 'pending' }
];

const LOW_STOCK_THRESHOLD = 10;

const isMongoTransactionUnavailable = (error) =>
  error?.code === 20
  || /transaction numbers are only allowed on a replica set member or mongos/i.test(String(error?.message || ''));

/** Atlas/production uses the transaction path; standalone local Mongo keeps a CAS-backed fallback. */
async function runReservationDecisionTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (!isMongoTransactionUnavailable(error)) throw error;
    console.warn('[payments] MongoDB transactions unavailable; using guarded standalone decision flow.');
    return work(null);
  } finally {
    await session.endSession();
  }
}

/** Booking + reservation payment commit together on Atlas; standalone Mongo gets explicit cleanup. */
export async function persistBookingWithReservationPayment({
  orderPayload,
  reservationPayment,
}) {
  const persist = async (session) => {
    const order = new Order(orderPayload);
    let orderWasSaved = false;
    try {
      await order.save(session ? { session } : undefined);
      orderWasSaved = true;
      const payment = reservationPayment
        ? await ensurePendingReservationPayment({
            order,
            ...reservationPayment,
            session,
          })
        : null;
      return { order, payment };
    } catch (error) {
      if (!session && orderWasSaved) {
        try {
          // Delete the financial child first. If that cleanup fails, retain the
          // booking so the system never creates Booking-without-Transaction state.
          await Payment.deleteMany({ order: order._id });
          await Order.deleteOne({ _id: order._id });
        } catch (rollbackError) {
          console.error('[BOOKING_PAYMENT_ROLLBACK_ERROR]', {
            errorName: rollbackError?.name || 'Error',
            errorMessage: rollbackError?.message || String(rollbackError),
            bookingId: String(order._id),
            customerId: String(order.customer || ''),
          });
        }
      }
      throw error;
    }
  };

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await persist(session);
    });
    return result;
  } catch (error) {
    if (!isMongoTransactionUnavailable(error)) throw error;
    console.warn('[bookings] MongoDB transactions unavailable; using guarded booking/payment cleanup flow.');
    return persist(null);
  } finally {
    await session.endSession();
  }
}

const syncQualityStageNotifications = async (order, previousStage, nextStage) => {
  try {
    await handleQualityStageTransition(order, previousStage, nextStage);
  } catch (error) {
    console.warn('[orders] Quality notification synchronization failed:', error.message);
  }
};

const findAssignableQualityChecker = async (userId) => {
  const id = String(userId || '').trim();
  if (!mongoose.isValidObjectId(id)) return null;
  return User.findOne({
    _id: id,
    role: 'staff_quality_checker',
    isActive: true,
    isVerified: true,
    isDeleted: { $ne: true },
  }).select('_id name email role').lean();
};

const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const SAFE_IMAGE_DATA_URL = /^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i;
const validateImageReference = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const trimmed = value.trim();
  const dataMatch = trimmed.match(SAFE_IMAGE_DATA_URL);
  if (dataMatch) {
    const estimatedBytes = Math.floor((dataMatch[2].replace(/\s/g, '').length * 3) / 4);
    return estimatedBytes > 0 && estimatedBytes <= MAX_INLINE_IMAGE_BYTES;
  }
  if (trimmed.length > 2048) return false;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
};

const validatePdfReference = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const trimmed = value.trim();
  const match = trimmed.match(/^data:application\/pdf;base64,([a-z0-9+/=\s]+)$/i);
  if (match) {
    const estimatedBytes = Math.floor((match[1].replace(/\s/g, '').length * 3) / 4);
    return estimatedBytes > 0 && estimatedBytes <= MAX_INLINE_IMAGE_BYTES;
  }
  if (trimmed.length > 2048) return false;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
};

const isSPFService = (service) => Boolean(
  service
  && (
    service.billingGroup === 'ceramic_spf'
    || service.packageCode
    || getPackageKeyFromName(service.name)
  )
);

const SERVICE_INVENTORY_MAP = [
  {
    keyword: 'wash',
    productNames: ['Premium Wash Soap', 'Car Wash Shampoo', 'Wash Shampoo', 'Wash Soap'],
    quantity: 0.5
  },
  {
    keyword: 'wax',
    productNames: ['Wax Sealant', 'Wax', 'Ceramic Coating'],
    quantity: 1
  },
  {
    keyword: 'detail',
    productNames: ['Interior Detailer', 'Detailing Spray', 'Detailer'],
    quantity: 1
  }
];

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CUSTOMER_STATUS_VALUES = ['queued', 'in-progress', 'finishing', 'ready'];
const BALANCE_PICKUP_QUEUE_LIMIT = 100;

const normalizeCustomerStatus = (value = '') => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  if (!CUSTOMER_STATUS_VALUES.includes(normalized)) {
    return null;
  }
  return normalized;
};

const emitCustomerStatusUpdate = (order) => {
  try {
    const io = getIO();
    const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
    if (!customerId) return;
    io.to(`user:${customerId.toString()}`).emit('booking:status', {
      bookingId: order._id?.toString?.() || order.id,
      customerStatus: order.customerStatus,
      status: order.status,
      paymentStatus: order.paymentStatus,
      approvedAt: order.approvedAt || null,
      downPaymentAmount: order.downPaymentAmount || 0,
      amountCollected: order.amountCollected || 0,
      rejectionReason: order.rejectionReason || null,
      // Live tracking fields (QC-controlled)
      serviceTrackingStage: order.serviceTrackingStage || null,
      ...buildCustomerStagePayload(order),
      serviceStaffAssignments: order.serviceStaffAssignments || [],
      trackerStageMedia: getCustomerVisibleTrackerStageMedia(order),
      updatedAt: order.customerStatusUpdatedAt || new Date().toISOString(),
    });
  } catch (error) {
    console.warn('Socket not initialized for status update:', error.message);
  }
};

const findProductByName = async (name) => {
  if (!name) return null;
  let product = await Product.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
  if (product) return product;
  product = await Product.findOne({ name: new RegExp(escapeRegex(name), 'i') });
  return product;
};

const notifyInventoryIssue = async ({ title, message, metadata }) => {
  try {
    const normalizedTitle = String(title || '').toLowerCase();
    const event = normalizedTitle.includes('out of stock') || Number(metadata?.available) <= 0
      ? 'out_of_stock'
      : normalizedTitle.includes('low stock')
        ? 'low_stock'
        : 'required_item_unavailable';
    const severity = event === 'out_of_stock' ? 'critical' : 'warning';
    const productIdentity = metadata?.productId
      || metadata?.productName
      || metadata?.keyword
      || metadata?.serviceId
      || metadata?.serviceName
      || title;
    const link = buildAdminDeepLink('inventory', {
      ...(metadata?.productId ? { productId: String(metadata.productId) } : {}),
    });

    await createAdminNotification({
      category: 'inventory',
      event,
      severity,
      title,
      message,
      source: 'Inventory',
      actionRequired: true,
      groupingKey: buildAdminGroupingKey('inventory', event, productIdentity),
      groupingWindowMs: 24 * 60 * 60 * 1000,
      link,
      action: { label: 'View inventory', link },
      metadata,
    });
  } catch (notifyErr) {
    console.error('Failed to create inventory notification:', notifyErr);
  }
};

const emitAdminNotification = (notification) => {
  try {
    const io = getIO();
    io.to('admin:chat').emit('admin:notification', notification);
  } catch (error) {
    console.warn('Socket not initialized for admin notification:', error.message);
  }
};

const normalizeCurrency = (value) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const numeric = value.replace(/[^\d.-]/g, '');
    const parsed = parseFloat(numeric);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
};

/**
 * Generate a human-readable booking reference in format: ASPF-YYMMDD-XXXX
 * Example: ASPF-260411-A7F3
 */
const generateBookingReference = () => {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hex = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  return `ASPF-${yy}${mm}${dd}-${hex}`;
};

const BOOKING_LIST_DEFAULT_LIMIT = 50;
const BOOKING_LIST_MAX_LIMIT = 100;
/**
 * Positive list projection: keep list payloads tiny and predictable.
 * Heavy fields (payment proof blobs, photos, workflow/checklist docs, waivers,
 * signatures, ratings, reservations) stay on detail endpoints.
 */
const ORDER_LIST_SELECT_FIELDS = [
  '_id',
  'orderNumber',
  'bookingReference',
  'customer',
  'vehicle',
  'customerName',
  'customerPhone',
  'serviceId',
  'serviceType',
  'items.name',
  'items.quantity',
  'items.price',
  'subtotal',
  'discountAmount',
  'taxVatAmount',
  'additionalFees',
  'serviceTotal',
  'pricingSnapshot',
  'amountCollected',
  'totalAmount',
  'totalPrice',
  'downPaymentAmount',
  'finalPaymentAmount',
  'invoiceId',
  'paymentStatus',
  'paymentMethod',
  'paymentProvider',
  'paidAt',
  'approvedAt',
  'rejectedAt',
  'rejectionReason',
  'status',
  'customerStatus',
  'customerStatusUpdatedAt',
  'archived',
  'archivedAt',
  'archivedReason',
  'vehicleYear',
  'vehicleMake',
  'vehicleModel',
  'vehicleColor',
  'vehicleType',
  'vehicleClass',
  'vehicleCategory',
  'vehiclePlate',
  'bookingDate',
  'bookingTime',
  'isWalkIn',
  'notes',
  'assignedDetailer',
  'serviceTrackingStage',
  'serviceTrackingUpdatedAt',
  'serviceTrackingUpdatedBy',
  'serviceStaffAssignments',
  'createdAt',
  'updatedAt',
].join(' ');

const ORDER_TRACKER_MEDIA_SELECT_FIELDS = [
  '_id',
  'customer',
  'assignedDetailer',
  'status',
  'archived',
  'paymentStatus',
  'serviceTrackingStage',
  'serviceStaffAssignments',
  'trackerStageMedia.stage',
  'trackerStageMedia.slot',
  'trackerStageMedia.photoUrl',
  'trackerStageMedia.description',
  'trackerStageMedia.uploadedAt',
  'trackerStageMedia.uploadedBy',
  'updatedAt',
].join(' ');

const parsePositiveInt = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const parseBoolQuery = (value) => value === true || String(value).toLowerCase() === 'true';

const parseCsvValues = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseCsvValues(entry));
  }
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const applyCsvFilter = (query, field, value) => {
  const values = parseCsvValues(value);
  if (values.length === 1) query[field] = values[0];
  if (values.length > 1) query[field] = { $in: values };
};

const getBookingListSort = ({ sortBy, sortOrder }) => {
  const allowed = new Set(['createdAt', 'updatedAt', 'bookingDate', 'bookingTime', 'status', 'paymentStatus']);
  const field = allowed.has(String(sortBy || '')) ? String(sortBy) : 'createdAt';
  const direction = String(sortOrder || '').toLowerCase() === 'asc' ? 1 : -1;

  if (field === 'bookingDate') {
    return { bookingDate: direction, bookingTime: direction, createdAt: -1 };
  }
  if (field === 'bookingTime') {
    return { bookingTime: direction, createdAt: -1 };
  }
  return { [field]: direction, _id: direction };
};

/** Sales GCash review: same exclusions as lite lists but KEEP inline proof fields (still omits multi‑MB blobs). */
const ORDER_APPROVAL_PREVIEW_PROJECTION =
  '-damageAnnotations -damagePhotos -photos -ingressChecklist -customerWaiver -serviceProper -qcChecklist -egressData -operationsChecklist -warrantyAndReceipt -workflow -jobOrder -staffNotes -rating -inventoryReservation -serviceSteps -trackerStageMedia -legalCompliance';

/** Modal context only — proof loaded via `getOrderGcashProofFields` so the first round-trip stays small and Axios can finish. */
const ORDER_APPROVAL_CONTEXT_PROJECTION =
  `${ORDER_APPROVAL_PREVIEW_PROJECTION} -downpaymentProof -paymentProofUrl -notes`;

const safeDecryptOrderValue = (val) => {
  if (!val || typeof val !== 'string') return val;
  if (!looksLikeEncryptedValue(val)) return val;
  try {
    return decrypt(val);
  } catch {
    return null;
  }
};

const getOrderIdentity = (order) => ({
  id: order._id?.toString?.() || order.id,
  customerId: typeof order.customer === 'object'
    ? (order.customer?._id?.toString?.() || order.customer?.id)
    : (order.customer?.toString?.() || order.customer),
});

function sanitizeCustomerTrackerMediaForResponse(orderDoc, reqUser) {
  if (!orderDoc || !isCustomerRole(reqUser?.role)) return orderDoc;
  const order = typeof orderDoc.toObject === 'function'
    ? orderDoc.toObject({ virtuals: true })
    : { ...orderDoc };
  return {
    ...order,
    trackerStageMedia: getCustomerVisibleTrackerStageMedia(order),
  };
}

const formatBookingDto = (orderDoc) => {
  if (!orderDoc) return null;
  const order = typeof orderDoc.toObject === 'function'
    ? orderDoc.toObject({ virtuals: true })
    : orderDoc;

  const id = order._id?.toString?.() || order.id;
  const customerId = typeof order.customer === 'object'
    ? (order.customer?._id?.toString?.() || order.customer?.id)
    : (order.customer?.toString?.() || order.customer);

  // ── Decrypt fields that may still be encrypted (e.g. from .lean() queries) ──
  // Mongoose post('init') middleware only fires for non-lean queries, so we
  // need to handle decryption manually for lean results.
  const safeDecrypt = safeDecryptOrderValue;

  const decryptedNotes = safeDecrypt(order.notes);
  const decryptedPlate = safeDecrypt(order.vehiclePlate);

  // Never expose unreadable ciphertext as a human-readable plate.
  const couldNotDecryptPlate = looksLikeEncryptedValue(order.vehiclePlate)
    && decryptedPlate === null;
  const vehiclePlateOut = couldNotDecryptPlate
    ? ''
    : (decryptedPlate || '');

  const vehicleInfo =
    order.vehicleInfo
    || [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ').trim();

  const serviceName =
    order.serviceName
    || order.serviceType
    || order.items?.[0]?.product?.name
    || 'Service';

  const customerName =
    order.customerName
    || (typeof order.customer === 'object' ? order.customer?.name : '')
    || '';

  const customerPhone = resolveReceiptPhoneForClient(order);

  const customerAvatar = typeof order.customer === 'object' ? order.customer?.avatar : null;

  return {
    ...order,
    id,
    customerId,
    vehicleId: order.vehicle?.toString?.() || order.vehicle || '',
    serviceName,
    bookingReference: order.bookingReference || order.orderNumber,
    hasPaymentProof: Boolean(
      order.paymentProofUrl
      || order.downpaymentProof
      || order.reservationPayment?.submittedAt
      || Number(order.reservationPayment?.amountSubmitted || 0) > 0
    ),
    date: order.date || order.bookingDate || '',
    time: order.time || order.bookingTime || '',
    vehicleInfo: vehicleInfo || '',
    vehiclePlate: vehiclePlateOut,
    /** True when ciphertext remains undecryptable with ENCRYPTION_KEY / LEGACY_ENCRYPTION_KEY */
    vehiclePlateDecryptFailed: couldNotDecryptPlate,
    customerName,
    customerPhone,
    customerAvatar,
    notes: decryptedNotes || '',
    // ── Live Tracking (QC-controlled) ──────────────────────────
    serviceTrackingStage: order.serviceTrackingStage || null,
    serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || null,
    serviceTrackingUpdatedBy: order.serviceTrackingUpdatedBy || null,
    // Canonical customer stage: label, step X of 5 and progress % resolved server-side.
    ...buildCustomerStagePayload(order),
    serviceStaffAssignments: order.serviceStaffAssignments || [],
    trackerStageMedia: Array.isArray(order.trackerStageMedia) ? order.trackerStageMedia : [],
    // Also decrypt legal compliance fields if present
    ...(order.legalCompliance ? {
      legalCompliance: {
        ...order.legalCompliance,
        waiverSignature: safeDecrypt(order.legalCompliance.waiverSignature),
        damageNotes: safeDecrypt(order.legalCompliance.damageNotes),
      }
    } : {}),
  };
};

const formatBookingListDto = (orderDoc) => {
  if (!orderDoc) return null;
  const order = typeof orderDoc.toObject === 'function'
    ? orderDoc.toObject({ virtuals: true })
    : orderDoc;

  const { id, customerId } = getOrderIdentity(order);
  const decryptedNotes = safeDecryptOrderValue(order.notes);
  const decryptedPlate = safeDecryptOrderValue(order.vehiclePlate);
  const couldNotDecryptPlate = looksLikeEncryptedValue(order.vehiclePlate)
    && decryptedPlate === null;
  const vehiclePlate = couldNotDecryptPlate ? '' : (decryptedPlate || '');
  const vehicleInfo =
    order.vehicleInfo
    || [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ').trim();
  const serviceName =
    order.serviceName
    || order.serviceType
    || order.items?.[0]?.product?.name
    || 'Service';
  const customerName =
    order.customerName
    || (typeof order.customer === 'object' ? order.customer?.name : '')
    || '';
  const customerPhone = resolveReceiptPhoneForClient(order);
  const customerAvatar = typeof order.customer === 'object' ? order.customer?.avatar : null;

  return {
    _id: order._id,
    id,
    orderNumber: order.orderNumber,
    bookingReference: order.bookingReference || order.orderNumber,
    customer: order.customer,
    customerId,
    customerName,
    customerPhone,
    customerAvatar,
    vehicleId: order.vehicle?.toString?.() || order.vehicle || '',
    serviceId: order.serviceId?.toString?.() || order.serviceId || '',
    serviceType: order.serviceType,
    serviceName,
    items: order.items,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    taxVatAmount: order.taxVatAmount,
    additionalFees: order.additionalFees,
    serviceTotal: order.serviceTotal,
    pricingSnapshot: order.pricingSnapshot || null,
    amountCollected: order.amountCollected,
    totalAmount: order.totalAmount,
    totalPrice: order.totalPrice,
    downPaymentAmount: order.downPaymentAmount,
    finalPaymentAmount: order.finalPaymentAmount,
    invoiceId: order.invoiceId,
    paymentStatus: order.paymentStatus,
    // Expose one canonical API field. A succeeded Payment is authoritative for
    // completed checkout; invoice/order values are compatibility fallbacks only.
    paymentMethod:
      order.latestPayment?.method
      ?? order.invoiceRecord?.snapshot?.payment?.method
      ?? order.paymentMethod
      ?? null,
    paymentProvider: order.paymentProvider,
    paidAt: order.paidAt,
    approvedAt: order.approvedAt,
    rejectedAt: order.rejectedAt,
    rejectionReason: order.rejectionReason,
    status: order.status,
    customerStatus: order.customerStatus,
    customerStatusUpdatedAt: order.customerStatusUpdatedAt,
    hasPaymentProof: Boolean(
      order.paymentProofUrl
      || order.downpaymentProof
      || order.reservationPayment?.submittedAt
      || Number(order.reservationPayment?.amountSubmitted || 0) > 0
    ),
    archived: order.archived,
    archivedAt: order.archivedAt,
    archivedReason: order.archivedReason,
    vehicleYear: order.vehicleYear,
    vehicleMake: order.vehicleMake,
    vehicleModel: order.vehicleModel,
    vehicleColor: order.vehicleColor,
    vehicleType: order.vehicleType,
    vehicleClass: order.vehicleClass,
    vehicleCategory: order.vehicleCategory,
    vehiclePlate,
    vehiclePlateDecryptFailed: couldNotDecryptPlate,
    vehicleInfo: vehicleInfo || '',
    bookingDate: order.bookingDate,
    bookingTime: order.bookingTime,
    isWalkIn: !!order.isWalkIn,
    date: order.date || order.bookingDate || '',
    time: order.time || order.bookingTime || '',
    notes: decryptedNotes || '',
    assignedDetailer: order.assignedDetailer,
    serviceTrackingStage: order.serviceTrackingStage || null,
    serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || null,
    serviceTrackingUpdatedBy: order.serviceTrackingUpdatedBy || null,
    ...buildCustomerStagePayload(order),
    serviceStaffAssignments: order.serviceStaffAssignments || [],
    latestPayment: order.latestPayment || null,
    reservationPayment: order.reservationPayment || null,
    balancePayment: order.balancePayment || null,
    invoiceRecord: order.invoiceRecord || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

async function attachLatestReceiptRecords(orderRows = []) {
  const idFromReference = (value) => {
    if (!value) return '';
    if (typeof value === 'object') {
      return value._id?.toString?.() || value.id?.toString?.() || '';
    }
    return value.toString?.() || String(value);
  };

  const receiptOrderIds = orderRows.map((order) => order?._id).filter(Boolean);
  const customerIds = [...new Set(orderRows.map((order) => idFromReference(order?.customer)).filter(Boolean))];
  const vehicleIds = [...new Set(orderRows.map((order) => idFromReference(order?.vehicle)).filter(Boolean))];

  const [payments, invoices, customers, vehicles] = await Promise.all([
    receiptOrderIds.length
      ? Payment.find({
          order: { $in: receiptOrderIds },
        })
          .select(
            '_id order invoiceId items subtotal discount discountAmount taxVatAmount additionalFees ' +
            'downpayment grandTotal amount amountSubmitted amountVerified amountPaid balanceRemaining method status ' +
            'transactionType paymentReference submittedAt reviewedAt reviewedBy reviewReason staffAssigned createdAt'
          )
          .sort({ createdAt: -1 })
          .lean()
      : [],
    receiptOrderIds.length
      ? InvoiceRecord.find({ order: { $in: receiptOrderIds } })
          .select('_id order invoiceNumber billingVersion snapshot payment createdAt')
          .sort({ createdAt: -1 })
          .lean()
      : [],
    customerIds.length
      ? User.find({ _id: { $in: customerIds } })
          .select(`_id ${USER_PHONE_SELECT_FIELDS}`)
          .lean()
      : [],
    vehicleIds.length
      ? Vehicle.find({ _id: { $in: vehicleIds } })
          .select('_id year make model color plateNumber vehicleType')
          .lean()
      : [],
  ]);

  const latestPaymentByOrder = new Map();
  const reservationPaymentByOrder = new Map();
  const balancePaymentByOrder = new Map();
  for (const payment of payments) {
    const key = String(payment.order || '');
    if (key && !latestPaymentByOrder.has(key)) latestPaymentByOrder.set(key, payment);
    if (
      key
      && payment.transactionType === 'reservation_fee'
      && !reservationPaymentByOrder.has(key)
    ) {
      reservationPaymentByOrder.set(key, payment);
    }
    if (
      key
      && !['reservation_fee', 'refund'].includes(payment.transactionType)
      && !balancePaymentByOrder.has(key)
    ) {
      balancePaymentByOrder.set(key, payment);
    }
  }

  const latestInvoiceByOrder = new Map();
  for (const invoice of invoices) {
    const key = String(invoice.order || '');
    if (key && !latestInvoiceByOrder.has(key)) latestInvoiceByOrder.set(key, invoice);
  }

  const customerById = new Map(
    customers.map((customer) => [String(customer._id || ''), customer])
  );
  const vehicleById = new Map(
    vehicles.map((vehicle) => [String(vehicle._id || ''), vehicle])
  );

  return orderRows.map((order) => {
    const key = String(order?._id || '');
    const customer = customerById.get(idFromReference(order?.customer));
    const vehicle = vehicleById.get(idFromReference(order?.vehicle));
    return {
      ...order,
      customerPhone: resolveReceiptPhoneForClient(order, customer),
      vehicleYear: order.vehicleYear || vehicle?.year,
      vehicleMake: order.vehicleMake || vehicle?.make,
      vehicleModel: order.vehicleModel || vehicle?.model,
      vehicleColor: order.vehicleColor || vehicle?.color,
      vehicleType:
        order.vehicleType ||
        order.vehicleClass ||
        order.vehicleCategory ||
        vehicle?.vehicleType,
      vehiclePlate: order.vehiclePlate || vehicle?.plateNumber,
      latestPayment: latestPaymentByOrder.get(key) || null,
      reservationPayment: reservationPaymentByOrder.get(key) || null,
      balancePayment: balancePaymentByOrder.get(key) || null,
      invoiceRecord: latestInvoiceByOrder.get(key) || null,
    };
  });
}

const toApprovalQueueBookingDto = (orderDoc) => {
  const booking = formatBookingListDto(orderDoc);
  if (!booking) return null;

  return {
    ...booking,
    paymentProofUrl: undefined,
    downpaymentProof: undefined,
  };
};

const emitBookingApprovalQueueUpdate = (orderDoc) => {
  try {
    const booking = toApprovalQueueBookingDto(orderDoc);
    if (!booking) return;
    const io = getIO();
    io.to('booking:approvals').emit('booking:approval-updated', {
      type: 'upsert',
      bookingId: booking.id || booking._id,
      booking,
      status: booking.status,
    });
  } catch (error) {
    console.warn('Socket not initialized for booking approvals update:', error.message);
  }
};

function hasReservationPaymentProof(orderOrBody = {}) {
  const proof =
    orderOrBody.downpaymentProof ||
    orderOrBody.paymentProofUrl ||
    orderOrBody.downpaymentProofInput ||
    orderOrBody.paymentProofUrlInput ||
    '';
  return typeof proof === 'string' && proof.trim().length > 0;
}

function getNormalizedSlotPair(date, time) {
  const normalizedDate = normalizeBookingDate(date);
  const normalizedTime = normalizeBookingTime(time);
  if (!normalizedDate || !normalizedTime) return null;
  return { date: normalizedDate, time: normalizedTime };
}

function getOrderSlotPair(order) {
  return getNormalizedSlotPair(order?.bookingDate, order?.bookingTime);
}

function captureOrderOccupancyWithStatus(order, status) {
  return captureOrderSlotOccupancy({
    status,
    archived: order?.archived,
    isWalkIn: order?.isWalkIn,
    bookingDate: order?.bookingDate,
    bookingTime: order?.bookingTime,
  });
}

function sameSlotPair(a, b) {
  return Boolean(a && b && a.date === b.date && a.time === b.time);
}

async function notifyAppointmentCapacity(date) {
  try {
    const snapshot = await getDateAvailabilitySnapshot(date);
    const totalCapacity = Math.max(0, Number(snapshot.totalCapacity ?? snapshot.slotsLimit ?? 0));
    const remaining = Math.max(0, Number(snapshot.remaining ?? 0));
    const isFull = snapshot.errorCode === 'DATE_FULL';
    const isNearingCapacity = snapshot.ok
      && totalCapacity > 0
      && remaining > 0
      && remaining <= Math.max(1, Math.ceil(totalCapacity * 0.2));

    if (!isFull && !isNearingCapacity) return;

    const isToday = date === snapshot.businessDate;
    const event = isFull ? 'date_fully_booked' : 'nearing_capacity';
    const title = isFull
      ? (isToday ? 'Today is fully booked' : `${date} is fully booked`)
      : `${date} is nearing full capacity`;
    const message = isFull
      ? totalCapacity > 0
        ? `The daily booking capacity of ${totalCapacity} appointments for ${date} has been reached.`
        : `The daily booking capacity for ${date} has been reached.`
      : `${remaining} of ${totalCapacity} daily booking seats remain for ${date}.`;
    const link = buildAdminDeepLink('appointments', { date });

    await createAdminNotification({
      category: 'appointments',
      event,
      severity: 'warning',
      title,
      message,
      source: 'Appointment Capacity',
      actionRequired: false,
      groupingKey: buildAdminGroupingKey('appointments', event, date),
      groupingWindowMs: 24 * 60 * 60 * 1000,
      link,
      action: { label: 'Review schedule', link },
      metadata: {
        date,
        bookedCount: snapshot.bookedCount || 0,
        totalCapacity,
        remaining,
      },
    });
  } catch (error) {
    console.warn('[appointments] Capacity notification failed:', error.message);
  }
}

function emitOrderCapacityChange(beforeState, orderAfter, type = 'appointment_capacity_changed') {
  const before = beforeState?.slot !== undefined
    ? beforeState
    : captureOrderSlotOccupancy(beforeState || {});
  const after = captureOrderSlotOccupancy(orderAfter || {});
  const sameSlot = sameSlotPair(before.slot, after.slot);
  const dates = new Set();
  if (before.occupies && (!after.occupies || !sameSlot)) dates.add(before.slot.date);
  if (after.occupies && (!before.occupies || !sameSlot)) dates.add(after.slot.date);
  if (dates.size > 0) {
    const changedDates = [...dates];
    emitAvailabilityUpdated({ type, dates: changedDates });
    void Promise.all(changedDates.map((date) => notifyAppointmentCapacity(date)));
  }
}

async function releaseOrderSlotIfConsumed(orderLike) {
  if (!orderLike || !orderOccupiesSlot(orderLike.status, orderLike.archived, orderLike.isWalkIn)) return;
  await releaseBookingSlot(orderLike.bookingDate, orderLike.bookingTime);
}

function slotErrorResponsePayload(slotCheck, fallbackCode = 'SLOT_FULL') {
  return {
    success: false,
    errorCode: slotCheck.errorCode || fallbackCode,
    message: slotCheck.message || 'Selected time slot is no longer available.',
    error: slotCheck.error || slotCheck.message || 'Selected time slot is no longer available.',
  };
}

/**
 * Get all orders
 */
export const getAllOrders = async (req, res, next) => {
  try {
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authorized - Invalid or missing user session' 
        });
    }

    const {
      status,
      paymentStatus,
      customerId,
      serviceId,
      bookingDate,
      bookingDateFrom,
      bookingDateTo,
      skip,
      page,
      limit,
      includeArchived,
      includeTotal,
      sortBy,
      sortOrder,
    } = req.query;

    const query = {};
    const andFilters = [];

    applyCsvFilter(query, 'status', status);
    applyCsvFilter(query, 'paymentStatus', paymentStatus);
    if (bookingDate) query.bookingDate = { $regex: `^${escapeRegex(String(bookingDate))}` };
    if (!bookingDate && (bookingDateFrom || bookingDateTo)) {
      const dateRange = {};
      const from = String(bookingDateFrom || '').trim();
      const to = String(bookingDateTo || '').trim();
      if (from) dateRange.$gte = from;
      if (to) dateRange.$lte = `${to}\uffff`;
      query.bookingDate = dateRange;
    }

    if (includeArchived === 'only') {
      query.archived = true;
    } else if (includeArchived !== 'true') {
      // Match the indexed schema default plus legacy rows that predate the field.
      andFilters.push({ $or: [{ archived: false }, { archived: null }] });
    }

    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({ success: false, message: 'Invalid customerId' });
      }
      query.customer = customerId;
    }

    if (serviceId) {
      if (!mongoose.Types.ObjectId.isValid(serviceId)) {
        return res.status(400).json({ success: false, message: 'Invalid serviceId' });
      }
      query.serviceId = serviceId;
    }

    const canonicalRole = normalizeToCanonical(req.user.role);

    if (isCustomerRole(req.user.role)) {
      query.customer = req.user.id;
    } else if (canonicalRole === 'staff_quality_checker') {
      // Quality Checker / Live Tracker: full operational queue — NOT limited to orders where this user is assignedDetailer
      // (assigned-only filtering left the Customer Tracker empty for QC accounts).
    } else if (isStaffRole(req.user.role)) {
      query.assignedDetailer = req.user.id;
    } else if (!isBookingManagerRole(req.user.role) && !isPosManagerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    if (andFilters.length) query.$and = andFilters;

    const parsedLimit = parsePositiveInt(limit, BOOKING_LIST_DEFAULT_LIMIT, {
      min: 1,
      max: BOOKING_LIST_MAX_LIMIT,
    });
    const parsedPage = parsePositiveInt(page, 1, { min: 1 });
    const parsedSkip = skip !== undefined
      ? parsePositiveInt(skip, 0, { min: 0 })
      : (parsedPage - 1) * parsedLimit;
    const resolvedPage = Math.floor(parsedSkip / parsedLimit) + 1;
    const sort = getBookingListSort({ sortBy, sortOrder });
    const shouldIncludeTotal = parseBoolQuery(includeTotal);

    const ordersPromise = Order.find(query)
      .select(ORDER_LIST_SELECT_FIELDS)
      .sort(sort)
      .skip(parsedSkip)
      .limit(parsedLimit + 1)
      .lean();

    const [fetchedOrders, total] = await Promise.all([
      ordersPromise,
      shouldIncludeTotal ? Order.countDocuments(query) : Promise.resolve(undefined),
    ]);

    const hasNextPage = fetchedOrders.length > parsedLimit;
    const orders = hasNextPage ? fetchedOrders.slice(0, parsedLimit) : fetchedOrders;
    const ordersWithReceipts = await attachLatestReceiptRecords(orders);

    const pagination = {
      page: resolvedPage,
      skip: parsedSkip,
      limit: parsedLimit,
      hasNextPage,
      hasPrevPage: parsedSkip > 0,
      ...(shouldIncludeTotal ? { total } : {}),
    };

    if (shouldIncludeTotal) {
      pagination.totalPages = Math.ceil((total || 0) / parsedLimit);
    }

    res.json({
      success: true,
      data: ordersWithReceipts.map((o) => formatBookingListDto(o)),
      pagination,
    });
  } catch (error) {
    next(error);
  }
};

function buildBalancePickupQueueDto(order, evaluation, financial) {
  const raw = order?.toObject ? order.toObject({ virtuals: true }) : order;
  const base = formatBookingListDto(raw);
  const orderId = order._id?.toString?.() || raw._id?.toString?.() || base.id;
  const readyForPaymentAt = order.readyForPaymentAt || raw.readyForPaymentAt || order.updatedAt || raw.updatedAt;

  return {
    ...base,
    orderId,
    bookingId: orderId,
    posQueueStatus: order.posQueueStatus || null,
    readyForPickupEvidenceComplete: Boolean(order.readyForPickupEvidenceComplete),
    readyForPaymentAt,
    qcCompletedAt: order.qcCompletedAt || null,
    queueReason: buildQueueReason(evaluation),
    eligibilitySummary: evaluation.eligibilitySummary || {
      readyForFinalPayment: true,
      readyPickupEvidenceComplete: true,
      remainingBalanceDue: financial.remainingBalance,
    },
    readyPickupSlotCount: evaluation.readyPickupSlotCount,
    evidenceCount: evaluation.readyPickupSlotCount,
    missingSlots: evaluation.missingSlots || [],
    trackerStage: order.serviceTrackingStage || null,
    amountPaid: financial.amountPaid,
    downpaymentApplied: financial.downpaymentApplied,
    remainingBalance: financial.remainingBalance,
    totalAmount: financial.totalAmount || base.totalAmount || base.totalPrice || 0,
    paymentStatus: order.paymentStatus || base.paymentStatus || 'unpaid',
    billingStatus: financial.billingStatus,
  };
}

/**
 * GET /api/orders/queue/balance-pickup
 * POS Balance / Pickup queue from backend order/payment/tracker truth.
 */
export const getBalancePickupQueue = async (req, res, next) => {
  try {
    const debugQueue =
      process.env.POS_QUEUE_DEBUG === 'true' ||
      (process.env.NODE_ENV !== 'production' && req.query.debug === 'true');
    const limit = parsePositiveInt(req.query.limit, BALANCE_PICKUP_QUEUE_LIMIT, {
      min: 1,
      max: BALANCE_PICKUP_QUEUE_LIMIT,
    });

    const candidateOrders = await Order.find({
      archived: { $ne: true },
      paymentStatus: { $ne: 'paid' },
      status: { $nin: ['cancelled', 'rejected', 'released', 'completed'] },
      $or: [
        { posQueueStatus: 'balance_pickup_queue' },
        { status: 'ready_for_payment' },
        { serviceTrackingStage: 'ready_pickup' },
        { 'trackerStageMedia.stage': 'ready_pickup' },
      ],
    })
      .select(
        `${ORDER_LIST_SELECT_FIELDS} bookingReference qcCompletedAt posQueueStatus readyForPickupEvidenceComplete readyForPaymentAt ` +
        'trackerStageMedia.stage trackerStageMedia.slot trackerStageMedia.photoUrl'
      )
      .sort({ readyForPaymentAt: 1, updatedAt: -1 })
      .limit(limit * 3);

    const rows = [];
    for (const order of candidateOrders) {
      const evaluation = await evaluateReadyForPickupQueueEligibility(order, {
        persist: true,
        emit: true,
        notify: true,
      });
      if (!evaluation.eligible) {
        if (debugQueue) {
          console.debug('[POS Queue] backend eligibility reason', {
            orderId: order._id?.toString?.(),
            reason: evaluation.reason,
            remainingBalance: evaluation.remainingBalance,
            missingSlots: evaluation.missingSlots,
            status: order.status,
            paymentStatus: order.paymentStatus,
            posQueueStatus: order.posQueueStatus,
          });
        }
        continue;
      }
      const financial = await computeOrderFinancialState(order);
      rows.push(buildBalancePickupQueueDto(order, evaluation, financial));
      if (rows.length >= limit) break;
    }

    rows.sort((a, b) => {
      const at = new Date(a.readyForPaymentAt || a.updatedAt || 0).getTime();
      const bt = new Date(b.readyForPaymentAt || b.updatedAt || 0).getTime();
      return at - bt;
    });

    res.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get booked time slots for a specific date
 */
export const getAvailableSlots = async (req, res, next) => {
  try {
    const { date } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const snapshot = await getDateAvailabilitySnapshot(date);
    if (snapshot.errorCode === 'INVALID_DATE') {
      return res.status(400).json({
        success: false,
        message: snapshot.message,
        error: snapshot.error,
        emergencyClosed: false,
        closureType: snapshot.closureType || null,
        closureReason: snapshot.closureReason || null,
        businessDate: snapshot.businessDate || null,
        businessTimeZone: snapshot.businessTimeZone || null,
      });
    }

    const structuredSlots = Array.isArray(snapshot.slots) ? snapshot.slots : [];
    const fullSlotLabels = structuredSlots
      .filter((slot) => slot.status === 'FULL' || slot.status === 'OVER_CAPACITY')
      .map((slot) => slot.label || slot.time)
      .filter(Boolean);

    return res.json({
      success: true,
      // Legacy clients receive only persisted/generated slots that are actually
      // unavailable. Closed days are represented by `unavailable`, never by a
      // hard-coded list of hours.
      bookedSlots: fullSlotLabels,
      slots: structuredSlots,
      unavailable: !!snapshot.unavailable,
      errorCode: snapshot.errorCode || null,
      message: snapshot.message || null,
      error: snapshot.error || null,
      emergencyClosed: !!snapshot.emergencyClosed,
      closureType: snapshot.closureType || null,
      closureReason: snapshot.closureReason || null,
      businessDate: snapshot.businessDate || null,
      businessTimeZone: snapshot.businessTimeZone || null,
      bookedCount: snapshot.bookedCount ?? 0,
      slotsLimit: snapshot.slotsLimit ?? null,
      dailyCapacity: snapshot.slotsLimit ?? null,
      remaining: snapshot.remaining ?? null,
      availableSlots: snapshot.remaining ?? null,
      totalSlots: snapshot.totalSlots ?? 0,
      totalCapacity: snapshot.totalCapacity ?? null,
      overCapacitySlots: snapshot.overCapacitySlots ?? 0,
      overCapacityBy: snapshot.overCapacityBy ?? 0,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cleanup stale bookings (admin)
 */
export const cleanupStaleBookings = async (req, res, next) => {
  try {
    const staleQuery = {
      archived: { $ne: true },
      $or: [
        { customerName: { $in: [null, ''] } },
        { serviceType: { $in: [null, ''] } }
      ]
    };

    const staleCandidates = await Order.find(staleQuery)
      .select('bookingDate bookingTime status archived isWalkIn __v')
      .lean();
    const archivedAt = new Date();
    const archivedOrders = (await Promise.all(
      staleCandidates.map((candidate) => Order.findOneAndUpdate(
        { _id: candidate._id, __v: candidate.__v, ...staleQuery },
        {
          $set: {
            archived: true,
            archivedAt,
            archivedReason: 'stale_booking_cleanup',
            status: 'cancelled',
          },
          $inc: { __v: 1 },
        },
        { new: false }
      ).lean())
    )).filter(Boolean);

    await releaseBookingSlotsForOrders(archivedOrders);
    const modifiedCount = archivedOrders.length;

    res.json({
      success: true,
      archived: modifiedCount
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get active/in-progress jobs
 */
export const getActiveJobs = async (req, res, next) => {
  try {
    let query = {
      status: { $in: ['pending_confirmation', 'pending', 'approved', 'confirmed', 'received', 'in_progress'] }
    };

    if (isStaffRole(req.user.role)) {
      // Staff (including staff_quality_checker / Technician-QC) sees:
      // 1. Their own assigned jobs (confirmed, received, in_progress, assigned)
      // 2. Unassigned approved/confirmed jobs they can claim
      query = {
        $or: [
          { assignedDetailer: req.user.id, status: { $in: ['confirmed', 'assigned', 'received', 'in_progress'] } },
          {
            $and: [
              { $or: [{ assignedDetailer: null }, { assignedDetailer: { $exists: false } }] },
              // 'approved' = Sales approved but no technician auto-assigned yet (needs manual claim)
              { status: { $in: ['approved', 'confirmed'] } }
            ]
          }
        ]
      };
    } else if (!isBookingManagerRole(req.user.role) && !isPosManagerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const orders = await Order.find(query)
      .populate('customer', 'name email phone avatar')
      .populate('assignedDetailer', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: orders.map((o) => formatBookingDto(o)),
      count: orders.length
    });
  } catch (error) {
    next(error);
  }
};

/** Same scope as qc.controller shop-floor jobs — QC/live tracker may read without being assignedDetailer. */
const FLOOR_QC_READ_ORDER_STATUSES = [
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'ready_for_payment',
  'completed',
  'released',
];

function canServiceStaffViewShopFloorOrder(userRole, order) {
  if (!isServiceStaffRole(userRole)) return false;
  if (order.archived === true) return false;
  const st = String(order.status || '');
  return FLOOR_QC_READ_ORDER_STATUSES.includes(st);
}

/** Shared GET guard: booking/POS admins, customer (own), assigned detailer, or QC on active shop-floor orders. */
function canViewOrderWithRoleConstraints(reqUser, order) {
  const toIdString = (value) => {
    if (!value) return '';
    if (typeof value === 'object') {
      return value._id?.toString?.() || value.id?.toString?.() || value.toString?.() || '';
    }
    return value.toString?.() || String(value);
  };

  const customerId = toIdString(order.customer);
  const assignedDetailerId = toIdString(order.assignedDetailer);

  return (
    isBookingManagerRole(reqUser.role) ||
    isPosManagerRole(reqUser.role) ||
    (isCustomerRole(reqUser.role) && customerId === reqUser.id) ||
    (isServiceStaffRole(reqUser.role) && assignedDetailerId === reqUser.id) ||
    canServiceStaffViewShopFloorOrder(reqUser.role, order)
  );
}

/**
 * Lightweight live tracker media payload for customer-facing web/mobile trackers.
 */
export const getOrderTrackerMedia = async (req, res, next) => {
  try {
    const order = await timeOperation(
      { req, res, kind: 'db', name: 'trackerMedia.order.findById' },
      () => Order.findById(req.params.id)
        .select(ORDER_TRACKER_MEDIA_SELECT_FIELDS)
        .lean()
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!canViewOrderWithRoleConstraints(req.user, order)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const trackerStageMedia = await timeOperation(
      { req, res, kind: 'cpu', name: 'trackerMedia.customerVisibilityFilter' },
      () => (isCustomerRole(req.user.role)
        ? getCustomerVisibleTrackerStageMedia(order)
        : (Array.isArray(order.trackerStageMedia) ? order.trackerStageMedia : []))
    );

    // Diagnostic only (no image bytes logged): how much of this response is
    // still inline base64 pending a Cloudinary upload. This is the metric that
    // explains multi-second findById/serialization times on bloated orders —
    // see PHASE 3 of the perf audit report for the root cause.
    let inlineBase64Bytes = 0;
    let inlineBase64Count = 0;
    for (const entry of trackerStageMedia) {
      const url = entry?.photoUrl;
      if (typeof url === 'string' && url.startsWith('data:')) {
        inlineBase64Bytes += url.length;
        inlineBase64Count += 1;
      }
    }
    console.info(
      `[PERF] kind=media operation=trackerMedia.payload method=${req.method} path=${req.originalUrl} ` +
      `mediaCount=${trackerStageMedia.length} inlineBase64Count=${inlineBase64Count} inlineBase64KB=${(inlineBase64Bytes / 1024).toFixed(1)}`
    );

    res.json({
      success: true,
      data: {
        id: order._id?.toString?.() || String(order._id),
        status: order.status,
        paymentStatus: order.paymentStatus || null,
        serviceTrackingStage: order.serviceTrackingStage || null,
        ...buildCustomerStagePayload(order),
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia,
        updatedAt: order.updatedAt || null,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get order by ID
 */
export const getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customer', 'name email phone avatar')
      .populate('items.product')
      .populate('assignedDetailer', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!canViewOrderWithRoleConstraints(req.user, order)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const [orderWithReceipt] = await attachLatestReceiptRecords([
      order.toObject({ virtuals: true }),
    ]);

    const data = formatBookingDto(orderWithReceipt);
    if (isCustomerRole(req.user.role)) {
      data.trackerStageMedia = getCustomerVisibleTrackerStageMedia(orderWithReceipt);
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lean order payload for Sales GCash proof review.
 * Full `getOrderById` documents can exceed multi‑MB JSON (workflow + tracker media + inline proof),
 * which breaks the browser/axios path — this route keeps proof + booking context only.
 */
export const getOrderApprovalPreview = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .select(ORDER_APPROVAL_CONTEXT_PROJECTION)
      .populate('customer', 'name email phone avatar')
      .populate('items.product', 'name price')
      .populate('assignedDetailer', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!canViewOrderWithRoleConstraints(req.user, order)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    const latestPayment = await Payment.findOne({ order: order._id })
      .select(
        '_id invoiceId amount amountSubmitted amountVerified method status transactionType ' +
        'paymentReference submittedAt reviewedAt reviewedBy reviewReason createdAt'
      )
      .sort({ createdAt: -1 })
      .lean();
    const dto = formatBookingDto({ ...order.toObject({ virtuals: true }), latestPayment });

    res.json({
      success: true,
      data: dto,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GCash receipt payload only (may be large base64). Split from approval-preview so the modal context loads first.
 */
export const getOrderGcashProofFields = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Order id is invalid' });
    }

    const [order] = await Order.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(req.params.id) } },
      {
        $project: {
          customer: 1,
          assignedDetailer: 1,
          status: 1,
          archived: 1,
          proofImage: {
            $cond: [
              { $gt: [{ $strLenCP: { $ifNull: ['$paymentProofUrl', ''] } }, 0] },
              '$paymentProofUrl',
              '$downpaymentProof',
            ],
          },
        },
      },
      { $limit: 1 },
    ]).option({ maxTimeMS: 5_000 });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!canViewOrderWithRoleConstraints(req.user, order)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    let paymentProofUrl = order.proofImage || null;
    if (!paymentProofUrl) {
      const reservationPayment = await Payment.findOne({
        order: order._id,
        transactionType: 'reservation_fee',
      }).select('proofImage').lean();
      paymentProofUrl = reservationPayment?.proofImage || null;
    }

    res.json({
      success: true,
      // Return one canonical copy. Older responses duplicated the same base64
      // string in both fields, doubling JSON parsing and transfer work.
      data: { paymentProofUrl },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create order
 */
export const createOrder = async (req, res, next) => {
  let reservedSlot = null;
  let conciergeSourceConversationId = '';
  let bookingRequestId = '';
  let pricingContextVehicle = null;
  try {
    await assertBookingsEnabled(req.systemState);
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authorized - Invalid or missing user session' 
        });
    }

    const { 
      customer: customerInput, 
      items, 
      shippingAddress, 
      notes,
      vehicleYear,
      vehicleMake,
      vehicleModel,
      vehicleColor,
      vehiclePlate,
      bookingDate,
      bookingTime,
      isWalkIn,
      vehicle: vehicleId,
      service: serviceId,
      customerName: customerNameInput,
      customerId: customerIdInput,
      customerPhone: customerPhoneInput,
      serviceType: serviceTypeInput,
      serviceName: serviceNameInput,
      totalPrice: totalPriceInput,
      price: priceInput,
      downpaymentProof: downpaymentProofInput,
      paymentProofUrl: paymentProofUrlInput,
      reservationPaymentAmount: reservationPaymentAmountInput,
      bookingRequestId: bookingRequestIdInput,
      sourceConversationId: sourceConversationIdInput,
      vehicleType: vehicleTypeInput,
      vehiclePricingCategory: vehiclePricingCategoryInput,
      selectedAddOns: selectedAddOnsInput,
    } = req.body;

    // Defense in depth for any direct controller mount: staff appointment
    // creation is allowed only when it is tied to a verified Concierge handoff.
    const sourceConversationId = typeof sourceConversationIdInput === 'string'
      ? sourceConversationIdInput.trim()
      : '';
    conciergeSourceConversationId = sourceConversationId;
    const requestIdInput = bookingRequestIdInput || req.get('idempotency-key');
    bookingRequestId = typeof requestIdInput === 'string' ? requestIdInput.trim() : '';
    if (bookingRequestId && !/^[A-Za-z0-9._:-]{8,128}$/.test(bookingRequestId)) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_BOOKING_REQUEST_ID',
        message: 'The booking request identifier is invalid.',
      });
    }
    const isConciergeSalesBooking = req.user.role === 'sales' && Boolean(sourceConversationId);
    if (!isCustomerRole(req.user.role) && isWalkIn !== true && !isConciergeSalesBooking) {
      return res.status(403).json({
        success: false,
        errorCode: 'APPOINTMENT_CUSTOMER_ONLY',
        message: 'Only customer accounts may create service appointments.',
      });
    }

    // Always trust the authenticated user for customer appointments. A POS
    // walk-in must identify the existing customer receiving the service.
    const requestedCustomerId = customerInput || customerIdInput;
    let resolvedCustomerId = req.user.id;
    if (isBookingManagerRole(req.user.role)) {
      if (!requestedCustomerId || !mongoose.Types.ObjectId.isValid(requestedCustomerId)) {
        return res.status(400).json({ success: false, message: 'A valid customer ID is required.' });
      }
      const targetCustomer = await User.findById(requestedCustomerId).select('role isActive isDeleted name').lean();
      if (!targetCustomer || targetCustomer.isDeleted || !targetCustomer.isActive) {
        return res.status(404).json({ success: false, message: 'Active customer account not found.' });
      }
      if (!isCustomerRole(targetCustomer.role)) {
        return res.status(400).json({ success: false, message: 'Order owner must be a customer account.' });
      }
      resolvedCustomerId = String(targetCustomer._id);
    }

    if (isConciergeSalesBooking) {
      const sourceConversation = await ChatConversation.findOne({
        conversationId: sourceConversationId,
        userId: resolvedCustomerId,
        status: { $in: ['needs_sales', 'in_conversation', 'waiting_customer', 'booking_created'] },
      }).select('_id linkedBookingId').lean();
      if (!sourceConversation) {
        return res.status(400).json({
          success: false,
          errorCode: 'INVALID_CONCIERGE_CONVERSATION',
          message: 'The Sales conversation does not belong to this customer.',
        });
      }
      const existingBooking = await Order.findOne({ sourceConversationId }).lean();
      if (existingBooking) {
        return res.status(200).json({
          success: true,
          message: 'Existing booking returned for this conversation.',
          data: formatBookingDto(existingBooking),
        });
      }
    }

    let fallbackCustomerName = isCustomerRole(req.user.role)
      ? (req.user?.name || '')
      : ((typeof customerNameInput === 'string' && customerNameInput.trim()) || '');
    const fallbackServiceType = (typeof serviceTypeInput === 'string' && serviceTypeInput.trim())
      || (typeof serviceNameInput === 'string' && serviceNameInput.trim())
      || '';

    const normalizedTotalPriceInput = normalizeCurrency(
      totalPriceInput !== undefined ? totalPriceInput : priceInput
    );

    if (!fallbackCustomerName && resolvedCustomerId && mongoose.Types.ObjectId.isValid(resolvedCustomerId)) {
      const customerRecord = await User.findById(resolvedCustomerId);
      if (customerRecord?.name) {
        fallbackCustomerName = customerRecord.name;
      }
    }

    // FormData sends all values as strings — parse items if it arrived as a JSON string
    let parsedItems = items;
    if (typeof items === 'string') {
      try {
        parsedItems = JSON.parse(items);
      } catch {
        parsedItems = [];
      }
    }
    let finalItems = Array.isArray(parsedItems) ? parsedItems : [];
    let selectedAddOns = selectedAddOnsInput;
    if (typeof selectedAddOnsInput === 'string') {
      try {
        selectedAddOns = JSON.parse(selectedAddOnsInput);
      } catch {
        selectedAddOns = [];
      }
    }
    if (!Array.isArray(selectedAddOns)) selectedAddOns = [];
    let finalTotalAmount = 0;
    let finalTotalPrice = Number.isFinite(normalizedTotalPriceInput) ? normalizedTotalPriceInput : undefined;
    let finalServiceType = fallbackServiceType;
    let resolvedServiceId = mongoose.Types.ObjectId.isValid(serviceId) ? serviceId : undefined;
    let pricingSnapshot;
    let finalVehicleData = {
        vehicleYear,
        vehicleMake,
        vehicleModel,
        vehicleColor,
        vehiclePlate
    };

    let resolvedVehicle = null;
    if (vehicleId) {
      if (!mongoose.Types.ObjectId.isValid(vehicleId)) {
        return res.status(400).json({ success: false, message: 'Invalid vehicle ID.' });
      }
      resolvedVehicle = await Vehicle.findById(vehicleId).lean();
      if (!resolvedVehicle) {
        return res.status(404).json({ success: false, message: 'Vehicle not found.' });
      }
      if (String(resolvedVehicle.customer) !== String(resolvedCustomerId)) {
        return res.status(403).json({ success: false, message: 'Vehicle does not belong to the order customer.' });
      }
      pricingContextVehicle = resolvedVehicle;
      finalVehicleData = {
        vehicleYear: resolvedVehicle.year,
        vehicleMake: resolvedVehicle.make,
        vehicleModel: resolvedVehicle.model,
        vehicleColor: resolvedVehicle.color,
        vehiclePlate: resolvedVehicle.plateNumber,
      };
    }

    // Handle Service Booking Mode (if service & vehicle IDs are provided)
    if (serviceId && vehicleId) {
        // 1. Fetch Service details (strict)
        let service = null;
        if (mongoose.Types.ObjectId.isValid(serviceId)) {
            service = await Service.findById(serviceId);
        }

        if (!service) {
            return res.status(400).json({ success: false, message: 'Invalid or missing service selected' });
        }
        resolvedServiceId = service._id;

        let servicePrice;
        if (isSPFService(service)) {
          const classifiedVehicle = await requireVehiclePricing(resolvedVehicle);
          const quote = resolveBookingQuote({
            vehiclePricingCategory: classifiedVehicle.pricingCategory,
            packageCode: service.packageCode || service.name,
            service,
            selectedAddOns,
          });
          servicePrice = quote.quotedPrice;
          pricingSnapshot = { ...buildPricingSnapshot(quote), vehicleClassification: {
            ...classifiedVehicle.classification, source: classifiedVehicle.pricingCategorySource,
            reviewedBy: classifiedVehicle.pricingCategoryReviewedBy, pricingCategory: classifiedVehicle.pricingCategory,
          } };
        } else {
          servicePrice = normalizeCurrency(service.basePrice);
          if (!Number.isFinite(servicePrice) || servicePrice <= 0) {
            return res.status(409).json({
              success: false,
              errorCode: 'PRICE_CONFIGURATION_ERROR',
              message: 'The selected service does not have a configured price.',
            });
          }
        }

        // 3. Construct Order Items (Treat service as a product item)
        // Note: 'product' field in Order Schema refs Product, but we can store the ID or create a dummy item structure.
        // If strict refs are enforced, this might fail population, but saving should work.
        finalItems = [{
            product: service._id, // Using service ID as product
            quantity: 1,
            price: servicePrice,
        }];
        finalServiceType = service.name || finalServiceType;

        finalTotalAmount = servicePrice;
        finalTotalPrice = servicePrice;

        // 4. Populate Vehicle Data (fallback to provided fields if lookup fails)
        if (resolvedVehicle) {
            finalVehicleData = {
                vehicleYear: resolvedVehicle.year,
                vehicleMake: resolvedVehicle.make,
                vehicleModel: resolvedVehicle.model,
                vehicleColor: resolvedVehicle.color,
                vehiclePlate: resolvedVehicle.plateNumber
            };
        } else {
            finalVehicleData = {
                vehicleYear,
                vehicleMake,
                vehicleModel,
                vehicleColor,
                vehiclePlate
            };
        }
    } else if (isConciergeSalesBooking && mongoose.Types.ObjectId.isValid(serviceId)) {
        const service = await Service.findOne({
          _id: serviceId,
          status: 'Active',
          isPublished: true,
        });
        if (!service) {
          return res.status(400).json({ success: false, message: 'Select an active published service.' });
        }
        let servicePrice;
        if (isSPFService(service)) {
          const classifiedVehicle = await requireVehiclePricing(resolvedVehicle || { make: vehicleMake, model: vehicleModel, year: vehicleYear });
          const quote = resolveBookingQuote({
            vehiclePricingCategory: classifiedVehicle.pricingCategory,
            packageCode: service.packageCode || service.name,
            service,
            selectedAddOns,
          });
          servicePrice = quote.quotedPrice;
          pricingSnapshot = { ...buildPricingSnapshot(quote), vehicleClassification: {
            ...classifiedVehicle.classification, source: classifiedVehicle.pricingCategorySource,
            reviewedBy: classifiedVehicle.pricingCategoryReviewedBy, pricingCategory: classifiedVehicle.pricingCategory,
          } };
        } else {
          servicePrice = normalizeCurrency(service.basePrice);
        }
        if (!Number.isFinite(servicePrice) || servicePrice <= 0) {
          return res.status(409).json({
            success: false,
            errorCode: 'PRICE_CONFIGURATION_ERROR',
            message: 'The selected service does not have a configured price.',
          });
        }
        resolvedServiceId = service._id;
        finalItems = [{ quantity: 1, price: servicePrice }];
        finalServiceType = service.name;
        finalTotalAmount = servicePrice;
        finalTotalPrice = servicePrice;
    } else {
        // Standard Product Order Mode (with a "custom package" escape hatch)

        const hasCustomServiceType = typeof finalServiceType === 'string' && finalServiceType.trim().length > 0;
        const hasValidTotal = Number.isFinite(normalizedTotalPriceInput) && normalizedTotalPriceInput > 0;

        // If frontend submits a package booking (no real Product IDs), allow saving it as a service booking
        // by storing items without `product` refs and using the provided price.
        const hasNonObjectIdItem =
          Array.isArray(finalItems) &&
          finalItems.some((item) => {
            const productId = item?.product || item?._id || item?.id;
            return productId && !mongoose.Types.ObjectId.isValid(productId);
          });

        if ((finalItems.length === 0 || hasNonObjectIdItem) && hasCustomServiceType && hasValidTotal) {
          if (isCustomerRole(req.user.role)) {
            if (!resolvedVehicle) {
              return res.status(400).json({ success: false, message: 'Select a vehicle from your garage.' });
            }
            const packageKey = getPackageKeyFromName(finalServiceType)
              || getPackageKeyFromName(finalItems[0]?.product || '');
            if (!packageKey) {
              return res.status(422).json({
                success: false,
                errorCode: 'PRICE_PACKAGE_REQUIRED',
                message: 'Unable to identify the selected SPF package.',
              });
            }

            const packageDigits = packageKey.replace('spf', '');
            const publishedService = await Service.findOne({
              name: new RegExp(`SPF\\s*${packageDigits}`, 'i'),
              status: 'Active',
              isPublished: true,
            });
            if (!publishedService) {
              return res.status(409).json({
                success: false,
                errorCode: 'PRICE_CONFIGURATION_ERROR',
                message: 'The selected SPF package is not published in the backend catalog.',
              });
            }
            const classifiedVehicle = await requireVehiclePricing(resolvedVehicle);
            const quote = resolveBookingQuote({
              vehiclePricingCategory: classifiedVehicle.pricingCategory,
              packageCode: publishedService.packageCode || publishedService.name,
              service: publishedService,
              selectedAddOns,
            });
            pricingSnapshot = { ...buildPricingSnapshot(quote), vehicleClassification: {
            ...classifiedVehicle.classification, source: classifiedVehicle.pricingCategorySource,
            reviewedBy: classifiedVehicle.pricingCategoryReviewedBy, pricingCategory: classifiedVehicle.pricingCategory,
          } };
            finalServiceType = publishedService.name;
            resolvedServiceId = publishedService._id;
            finalTotalPrice = quote.quotedPrice;
            finalTotalAmount = quote.quotedPrice;
          } else {
            finalTotalAmount = normalizedTotalPriceInput;
            finalTotalPrice = normalizedTotalPriceInput;
          }
          finalItems = [{
            quantity: 1,
            price: finalTotalPrice,
          }];
        } else {
          if (finalItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
          }

          // RECALCULATE PRICES FROM DATABASE
          try {
            finalItems = await Promise.all(finalItems.map(async (item) => {
              const productId = item.product || item._id || item.id;
              if (!mongoose.Types.ObjectId.isValid(productId)) {
                throw new Error(`Invalid product ID format`);
              }
              const dbProduct = await Product.findById(productId);
              if (!dbProduct) {
                throw new Error(`Product not found: ${item.name || productId}`);
              }
              return {
                ...item,
                product: dbProduct._id,
                price: dbProduct.price // Enforce server-side price
              };
            }));
          } catch (err) {
            return res.status(400).json({ success: false, message: err.message });
          }

          finalTotalAmount = finalItems.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);
          finalTotalPrice = finalTotalAmount;
        }
    }

    const safeTotalPrice = finalTotalPrice;
    // Always start as pending_confirmation — Sales must approve before service flow begins
    const initialStatus = 'pending_confirmation';
    const resolvedCustomerPhone = (typeof customerPhoneInput === 'string' && customerPhoneInput.trim()) || '';

    const resolvedPaymentProof = (() => {
      const a = typeof downpaymentProofInput === 'string' ? downpaymentProofInput.trim() : '';
      const b = typeof paymentProofUrlInput === 'string' ? paymentProofUrlInput.trim() : '';
      const proof = a || b;
      return proof && validateImageReference(proof) ? proof : undefined;
    })();

    if ((downpaymentProofInput || paymentProofUrlInput) && !resolvedPaymentProof) {
      return res.status(400).json({ success: false, message: 'Payment proof must be a valid JPG, PNG, or WebP image under 8 MB.' });
    }

    if (isCustomerRole(req.user.role) && !resolvedPaymentProof) {
      return res.status(400).json({
        success: false,
        errorCode: 'PAYMENT_PROOF_REQUIRED',
        message: 'Upload a GCash payment proof before submitting your booking.',
        error: 'Upload a GCash payment proof before submitting your booking.',
      });
    }

    const submittedReservationAmount = resolvedPaymentProof
      ? normalizeReservationAmount(
          reservationPaymentAmountInput,
          finalTotalPrice || finalTotalAmount
        )
      : null;

    if (bookingRequestId) {
      const existingBooking = await Order.findOne({
        customer: resolvedCustomerId,
        bookingRequestId,
      });
      if (existingBooking) {
        const requestMatchesExisting = (
          String(existingBooking.vehicle || '') === String(vehicleId || '')
          && String(existingBooking.serviceId || '') === String(resolvedServiceId || '')
          && existingBooking.bookingDate === normalizeBookingDate(bookingDate)
          && existingBooking.bookingTime === normalizeBookingTime(bookingTime)
        );
        if (!requestMatchesExisting) {
          return res.status(409).json({
            success: false,
            errorCode: 'BOOKING_REQUEST_REUSED',
            message: 'This booking request identifier was already used for different booking details.',
          });
        }
        if (resolvedPaymentProof) {
          await ensurePendingReservationPayment({
            order: existingBooking,
            amount: submittedReservationAmount,
            proofImage: resolvedPaymentProof,
            paymentMethod: 'gcash',
            submittedBy: req.user.id,
          });
        }
        return res.status(200).json({
          success: true,
          message: 'Existing booking returned for this request.',
          idempotent: true,
          data: formatBookingDto(existingBooking),
        });
      }
    }

    const bookingDateWasProvided = bookingDate !== undefined && bookingDate !== null && bookingDate !== '';
    const bookingTimeWasProvided = bookingTime !== undefined && bookingTime !== null && bookingTime !== '';
    if (
      (bookingDateWasProvided && typeof bookingDate !== 'string')
      || (bookingTimeWasProvided && typeof bookingTime !== 'string')
    ) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'bookingDate and bookingTime must be strings.',
        error: 'bookingDate and bookingTime must be strings.',
      });
    }
    const hasBookingDate = bookingDateWasProvided && bookingDate.trim().length > 0;
    const hasBookingTime = bookingTimeWasProvided && bookingTime.trim().length > 0;
    const isAuthorizedWalkIn = isWalkIn === true && isPosManagerRole(req.user.role);
    if (isWalkIn === true && !isAuthorizedWalkIn) {
      return res.status(403).json({
        success: false,
        errorCode: 'WALK_IN_NOT_AUTHORIZED',
        message: 'Only authorized POS users may create an unscheduled walk-in order.',
      });
    }
    if (isAuthorizedWalkIn && (hasBookingDate || hasBookingTime)) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'Walk-in orders must not include appointment date or time fields.',
      });
    }
    if (hasBookingDate !== hasBookingTime) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'Both bookingDate and bookingTime are required for an appointment.',
        error: 'Both bookingDate and bookingTime are required for an appointment.',
      });
    }
    if (!isAuthorizedWalkIn && !hasBookingDate && !hasBookingTime) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'bookingDate and bookingTime are required for an appointment.',
        error: 'bookingDate and bookingTime are required for an appointment.',
      });
    }

    let canonicalBookingDate;
    let canonicalBookingTime;
    // Explicit POS walk-ins may have neither field. Every appointment
    // (customer or admin-created) has both and is reserved atomically here.
    if (hasBookingDate && hasBookingTime) {
      const slotCheck = await reserveBookingSlot(bookingDate, bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
      canonicalBookingDate = slotCheck.date;
      canonicalBookingTime = slotCheck.time;
    }

    // ── Create Order ──────────────────────────────────────────────────
    const orderPayload = {
      orderNumber: `ORD-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`,
      bookingReference: generateBookingReference(),
      customer: resolvedCustomerId,
      vehicle: mongoose.Types.ObjectId.isValid(vehicleId) ? vehicleId : null,
      customerName: fallbackCustomerName,
      customerPhone: resolvedCustomerPhone,
      serviceId: resolvedServiceId,
      serviceType: finalServiceType,
      items: finalItems,
      pricingSnapshot,
      totalAmount: finalTotalAmount,
      totalPrice: safeTotalPrice,
      status: initialStatus, // 'pending_confirmation' — awaits sales approval
      shippingAddress,
      notes,
      ...finalVehicleData,
      bookingDate: canonicalBookingDate,
      bookingTime: canonicalBookingTime,
      sourceConversationId: sourceConversationId || undefined,
      bookingRequestId: bookingRequestId || undefined,
      isWalkIn: isAuthorizedWalkIn,
      downpaymentProof: resolvedPaymentProof,
      paymentProofUrl: resolvedPaymentProof,
      paymentMethod: resolvedPaymentProof ? 'gcash' : undefined,
    };

    const checklist = generateOperationsChecklist(finalServiceType);
    orderPayload.operationsChecklist = checklist;
    // ⚠️ Technician assignment is intentionally deferred until Sales APPROVES the booking.
    // Auto-assign was removed to prevent unconfirmed bookings entering the service queue.

    const { order } = resolvedPaymentProof
      ? await persistBookingWithReservationPayment({
          orderPayload,
          reservationPayment: {
            amount: submittedReservationAmount,
            proofImage: resolvedPaymentProof,
            paymentMethod: 'gcash',
            submittedBy: req.user.id,
          },
        })
      : { order: await Order.create(orderPayload) };
    reservedSlot = null;
    emitOrderCapacityChange(null, order, 'appointment_created');

    if (resolvedPaymentProof) {
      emitBookingApprovalQueueUpdate(order);
    }

    // ⚠️ Bug #3 fix: Wrapped debug log in dev-only guard — never runs in production.
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 [SAVED_ORDER] Vehicle Data:', {
        id: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        vehicleYear: order.vehicleYear,
        vehicleMake: order.vehicleMake,
        vehicleModel: order.vehicleModel,
        vehicleColor: order.vehicleColor,
        vehiclePlate: order.vehiclePlate,
        customerPhone: order.customerPhone,
        serviceType: order.serviceType,
        status: order.status,
      });
    }

    const responsePayload = {
      success: true,
      message: 'Order created successfully. Admin has been notified.',
      data: formatBookingDto(order),
    };

    // Respond immediately — email + in-app notifications can take seconds on cold DB / SMTP.
    res.status(201).json(responsePayload);

    if (process.env.NODE_ENV === 'test') return;

    const orderIdForSideEffects = order._id;
    const orderNumberForSideEffects = order.orderNumber;
    const bookingRefForSideEffects = order.bookingReference;
    const customerRef = order.customer;
    const hasReservationProof = Boolean(resolvedPaymentProof);
    setImmediate(() => {
      void runTrackedSystemMutation(async () => {
        try {
          const customerLabel = fallbackCustomerName || 'Customer';
          const serviceLabel = finalServiceType || 'Service';
          const vehicleLine = [finalVehicleData.vehicleYear, finalVehicleData.vehicleMake, finalVehicleData.vehicleModel]
            .filter(Boolean)
            .join(' ')
            .trim();
          const notifTitle = hasReservationProof
            ? 'GCash reservation submitted'
            : 'New service booking';
          const notifMessage = hasReservationProof
            ? `${customerLabel} sent a reservation fee proof for ${serviceLabel}. Ref ${bookingRefForSideEffects}. Review payment in Booking Approvals.`
            : `New booking ${orderNumberForSideEffects} — ${customerLabel}, ${serviceLabel}${vehicleLine ? ` (${vehicleLine})` : ''}. Review in Booking Approvals.`;
          const adminLink = buildAdminDeepLink('appointments', {
            orderId: orderIdForSideEffects.toString(),
            bookingReference: bookingRefForSideEffects,
          });
          await createAdminNotification({
            category: 'appointments',
            event: hasReservationProof ? 'booking_payment_review' : 'booking_created',
            severity: hasReservationProof ? 'warning' : 'info',
            title: hasReservationProof ? 'New booking awaiting payment review' : 'New booking received',
            message: notifMessage,
            source: 'Appointments',
            actionRequired: hasReservationProof,
            groupingKey: buildAdminGroupingKey(
              'appointments',
              hasReservationProof ? 'booking_payment_review' : 'booking_created',
            ),
            groupedTitle: hasReservationProof
              ? '{count} bookings await payment review'
              : '{count} new bookings received',
            groupedMessage: hasReservationProof
              ? '{count} recent bookings include payment proof that needs review.'
              : '{count} new customer bookings were received in the last few minutes.',
            link: adminLink,
            action: { label: hasReservationProof ? 'Review payment' : 'Review booking', link: adminLink },
            metadata: {
              orderId: orderIdForSideEffects,
              bookingReference: bookingRefForSideEffects,
              bookingDate,
              bookingTime,
              latestCustomerName: customerLabel,
            },
          });
          const salesNotif = await Notification.create({
            title: notifTitle,
            message: notifMessage,
            type: 'booking',
            recipientRole: 'sales',
            link: `/admin/bookings/${orderIdForSideEffects}`,
            metadata: {
              orderId: orderIdForSideEffects,
              bookingReference: bookingRefForSideEffects,
              kind: hasReservationProof ? 'reservation_fee' : 'booking',
            },
          });
          emitBookingManagerNotification(salesNotif);
        } catch (notifyErr) {
          console.error('Failed to create notification:', notifyErr);
        }

        try {
          const settings = await Setting.findOne();
          if (settings?.notifications?.emailNewBookings) {
            const admins = await User.find({ role: { $in: FULL_ADMIN_ROLES }, isActive: true });
            const adminEmails = admins.map((a) => a.email);

            if (adminEmails.length > 0) {
              const customer = await User.findById(customerRef);

              await emailService.sendBookingNotification(adminEmails, {
                orderNumber: orderNumberForSideEffects,
                customerName: customer?.name || 'Customer',
                serviceName:
                  finalServiceType ||
                  (serviceId && (await Service.findById(serviceId))?.name) ||
                  'Premium Detailing',
                bookingDate,
                bookingTime,
                vehicleInfo: `${finalVehicleData.vehicleYear} ${finalVehicleData.vehicleMake} ${finalVehicleData.vehicleModel}`,
              });
            }
          }
        } catch (emailErr) {
          console.error('Failed to send booking email notification:', emailErr);
        }

        try {
          logActivity({
            req,
            type: 'booking_created',
            module: 'Booking',
            action: 'Booking Created',
            description: `${fallbackCustomerName || 'Customer'} created booking ${orderNumberForSideEffects} — ${finalServiceType || 'Service'}.`,
            status: 'success',
            referenceId: orderNumberForSideEffects,
            metadata: { orderId: orderIdForSideEffects, serviceType: finalServiceType, totalPrice: safeTotalPrice },
          });
        } catch (actErr) {
          console.error('Failed to log booking activity:', actErr);
        }
      }).catch((error) => {
        console.warn('[Booking] Background side effects skipped or failed:', error.message);
      });
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingReservation(reservedSlot);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after createOrder failure:', releaseError.message);
      }
    }
    if (error?.code === 11000 && bookingRequestId) {
      const existingBooking = await Order.findOne({
        customer: req.user?.id,
        bookingRequestId,
      }).lean();
      if (existingBooking) {
        const reservationPayment = await Payment.exists({
          order: existingBooking._id,
          transactionType: 'reservation_fee',
        });
        if (reservationPayment) {
          return res.status(200).json({
            success: true,
            message: 'Existing booking returned for this request.',
            idempotent: true,
            data: formatBookingDto(existingBooking),
          });
        }
      }
    }
    if (error?.code === 11000 && conciergeSourceConversationId) {
      const existingBooking = await Order.findOne({
        sourceConversationId: conciergeSourceConversationId,
      }).lean();
      if (existingBooking) {
        return res.status(200).json({
          success: true,
          message: 'Existing booking returned for this conversation.',
          data: formatBookingDto(existingBooking),
        });
      }
    }
    if (error instanceof ServicePricingError) {
      console.error('[pricing] Booking price resolution failed', {
        errorCode: error.code,
        vehicleId: pricingContextVehicle?._id?.toString?.() || req.body?.vehicle || null,
        make: pricingContextVehicle?.make || req.body?.vehicleMake || null,
        model: pricingContextVehicle?.model || req.body?.vehicleModel || null,
        vehicleType: pricingContextVehicle?.vehicleType || req.body?.vehicleType || null,
        packageCode: error.details?.packageCode || null,
        details: error.details,
      });
      return res.status(error.statusCode).json({
        success: false,
        errorCode: error.code,
        message: error.message,
        details: error.details,
      });
    }
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map(val => val.message);
        return res.status(400).json({
            success: false,
            message: messages.join(', ')
        });
    }
    next(error);
  }
};

/**
 * Customer signs waiver
 */
export const signWaiver = async (req, res, next) => {
  try {
    const { waiverSignature, waiverPdf } = req.body;

    if (!waiverSignature) {
      return res.status(400).json({ success: false, message: 'Waiver signature is required' });
    }

    const isValidSignature = validateImageReference(waiverSignature);
    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid waiver signature format. Use base64 data URL or a signed URL.'
      });
    }
    if (waiverPdf) {
      const isValidPdf = validatePdfReference(waiverPdf);
      if (!isValidPdf) {
        return res.status(400).json({
          success: false,
          message: 'Invalid waiver PDF format. Use base64 data URL or a signed URL.'
        });
      }
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!isFullAdminRole(req.user.role) && (!order.customer || order.customer.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only sign your own waiver' });
    }

    order.legalCompliance = {
      ...order.legalCompliance,
      waiverSignature,
      waiverSignedAt: new Date(),
      waiverPdf: waiverPdf || order.legalCompliance?.waiverPdf,
    };

    const preServiceCount = order.legalCompliance?.preServicePhotos?.length || 0;
    if (
      order.assignedDetailer
      && preServiceCount >= 2
      && orderOccupiesSlot(order.status, order.archived, order.isWalkIn)
    ) {
      order.status = 'in_progress';
      if (!order.serviceSteps || order.serviceSteps.length === 0) {
        order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
      }
    }

    await order.save();

    try {
      const customerName = order.customerName || req.user?.name || 'Customer';
      const notification = await Notification.create({
        title: 'Waiver Signed',
        message: `${customerName} signed the service waiver for order ${order.orderNumber || order._id}`,
        type: 'booking',
        recipientRole: 'admin_family',
        link: '/admin/dashboard?tab=waivers',
        metadata: {
          orderId: order._id,
          customerId: order.customer,
          waiverSignedAt: order.legalCompliance?.waiverSignedAt,
        },
      });
      emitAdminNotification({
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        link: notification.link,
      });

      const io = getIO();
      if (io) {
        io.to('admin:chat').emit('waiver:signed', {
          orderId: order._id,
          customerName,
          signedAt: order.legalCompliance.waiverSignedAt,
        });
      }
    } catch (notifyError) {
      console.error('Failed to notify waiver signature:', notifyError.message);
    }

    res.json({ success: true, data: sanitizeCustomerTrackerMediaForResponse(order, req.user) });
  } catch (error) {
    next(error);
  }
};

/**
 * Detailer uploads pre-service inspection
 */
export const updateInspection = async (req, res, next) => {
  try {
    const { preServicePhotos = [], damageNotes } = req.body;

    if (!Array.isArray(preServicePhotos)) {
      return res.status(400).json({ success: false, message: 'preServicePhotos must be an array' });
    }

    const invalidPhoto = preServicePhotos.find((url) => !validateImageReference(url));
    if (invalidPhoto) {
      return res.status(400).json({
        success: false,
        message: 'Pre-service photos must be signed URLs or valid Base64 data URLs.'
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (isServiceStaffRole(req.user.role) &&
        (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const existingPhotos = order.legalCompliance?.preServicePhotos || [];
    const mergedPhotos = [...new Set([...existingPhotos, ...preServicePhotos])];

    order.legalCompliance = {
      ...order.legalCompliance,
      preServicePhotos: mergedPhotos,
      damageNotes: damageNotes || order.legalCompliance?.damageNotes,
    };

    if (
      order.legalCompliance?.waiverSignature
      && mergedPhotos.length >= 2
      && orderOccupiesSlot(order.status, order.archived, order.isWalkIn)
    ) {
      order.status = 'in_progress';
      if (!order.serviceSteps || order.serviceSteps.length === 0) {
        order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
      }
    }

    await order.save();

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order
 */
export const updateOrder = async (req, res, next) => {
  let reservedSlot = null;
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // Check ownership, assigned detailer, or admin status
    const isOwner = order.customer && order.customer.toString() === req.user.id;
    const isAdmin = isBookingManagerRole(req.user.role) || isPosManagerRole(req.user.role);
    const assignedDetailerId = order.assignedDetailer
      ? (typeof order.assignedDetailer === 'object' ? order.assignedDetailer._id?.toString() : order.assignedDetailer.toString())
      : null;
    const isAssignedDetailer = isServiceStaffRole(req.user.role) && assignedDetailerId === req.user.id;
    const isClaimingUnassigned = isServiceStaffRole(req.user.role) && !assignedDetailerId && ['pending', 'confirmed', 'received'].includes(order.status);

    if (!isOwner && !isAdmin && !isAssignedDetailer && !isClaimingUnassigned) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only update your own bookings',
      });
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ success: false, message: 'Request body must be an object.' });
    }

    const allowedFields = new Set();
    if (isOwner && isCustomerRole(req.user.role)) {
      ['status', 'cancellationReason', 'archived', 'archivedAt', 'archivedReason']
        .forEach((field) => allowedFields.add(field));
    }
    if (isBookingManagerRole(req.user.role)) {
      ['status', 'customerStatus', 'bookingDate', 'bookingTime', 'assignedDetailer', 'cancellationReason', 'archived', 'archivedAt', 'archivedReason']
        .forEach((field) => allowedFields.add(field));
    }
    if (isAssignedDetailer || isClaimingUnassigned) {
      ['status', 'customerStatus', 'assignedDetailer'].forEach((field) => allowedFields.add(field));
    }

    const unexpectedFields = Object.keys(req.body).filter((field) => !allowedFields.has(field));
    if (unexpectedFields.length > 0) {
      return res.status(403).json({
        success: false,
        message: `Protected or unsupported order fields: ${unexpectedFields.join(', ')}`,
      });
    }

    const requestsAppointmentSlot = Object.prototype.hasOwnProperty.call(req.body, 'bookingDate')
      || Object.prototype.hasOwnProperty.call(req.body, 'bookingTime');
    const createsAppointmentFromUnscheduledOrder = requestsAppointmentSlot
      && (order.isWalkIn === true || !order.bookingDate || !order.bookingTime);
    if (createsAppointmentFromUnscheduledOrder && !isCustomerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        errorCode: 'APPOINTMENT_CUSTOMER_ONLY',
        message: 'Only customer accounts may create service appointments.',
      });
    }

    const update = {};
    const validOrderStatuses = new Set(Order.schema.path('status').enumValues);
    if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      if (typeof req.body.status !== 'string' || !validOrderStatuses.has(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Invalid order status.' });
      }
      if (isOwner && isCustomerRole(req.user.role)) {
        const customerCancellableStatuses = new Set(['pending_confirmation', 'rejected', 'pending', 'confirmed', 'approved']);
        if (req.body.status !== 'cancelled' || !customerCancellableStatuses.has(order.status)) {
          return res.status(403).json({ success: false, message: 'This booking can no longer be cancelled by the customer.' });
        }
      }
      if ((isAssignedDetailer || isClaimingUnassigned) && !isAdmin) {
        const staffStatuses = new Set(['assigned', 'queued', 'received', 'in_progress', 'ready_for_payment', 'completed']);
        if (!staffStatuses.has(req.body.status)) {
          return res.status(403).json({ success: false, message: 'Quality staff cannot set this order status.' });
        }
      }
      if (normalizeToCanonical(req.user.role) === 'sales') {
        const salesStatuses = new Set(['pending_confirmation', 'approved', 'rejected', 'pending', 'confirmed', 'assigned', 'cancelled']);
        if (!salesStatuses.has(req.body.status)) {
          return res.status(403).json({ success: false, message: 'Sales cannot set service-operation status.' });
        }
      }
      update.status = req.body.status;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'customerStatus')) {
      const customerStatus = normalizeCustomerStatus(req.body.customerStatus);
      if (!customerStatus) {
        return res.status(400).json({ success: false, message: 'Invalid customer tracking status.' });
      }
      update.customerStatus = customerStatus;
      update.customerStatusUpdatedAt = new Date();
    }

    for (const field of ['bookingDate', 'bookingTime']) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (typeof req.body[field] !== 'string' || req.body[field].trim().length === 0 || req.body[field].length > 80) {
          return res.status(400).json({ success: false, message: `Invalid ${field}.` });
        }
        update[field] = req.body[field].trim();
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'assignedDetailer')) {
      const detailerId = String(req.body.assignedDetailer || '');
      if (!mongoose.isValidObjectId(detailerId)) {
        return res.status(400).json({ success: false, message: 'Invalid assignedDetailer ID.' });
      }
      if ((isAssignedDetailer || isClaimingUnassigned) && !isAdmin && detailerId !== String(req.user.id)) {
        return res.status(403).json({ success: false, message: 'Quality staff may only claim a job for themselves.' });
      }
      const detailer = await findAssignableQualityChecker(detailerId);
      if (!detailer || !isServiceStaffRole(detailer.role)) {
        return res.status(400).json({ success: false, message: 'Assigned user must be an active Quality Checker.' });
      }
      update.assignedDetailer = detailerId;
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'archived')) {
      if (typeof req.body.archived !== 'boolean') {
        return res.status(400).json({ success: false, message: 'archived must be a boolean.' });
      }
      if (isOwner && isCustomerRole(req.user.role) &&
        (!req.body.archived || !['completed', 'paid', 'released', 'cancelled'].includes(order.status))) {
        return res.status(403).json({ success: false, message: 'Only finished or cancelled bookings may be archived.' });
      }
      update.archived = req.body.archived;
      update.archivedAt = req.body.archived ? new Date() : null;
      if (req.body.archivedReason != null) {
        if (typeof req.body.archivedReason !== 'string' || req.body.archivedReason.length > 120) {
          return res.status(400).json({ success: false, message: 'Invalid archive reason.' });
        }
        update.archivedReason = req.body.archivedReason.trim();
      }
    }

    // Accepted for mobile compatibility, but never mass-assigned to the schema.
    if (Object.prototype.hasOwnProperty.call(req.body, 'cancellationReason') &&
      (typeof req.body.cancellationReason !== 'string' || req.body.cancellationReason.length > 500)) {
      return res.status(400).json({ success: false, message: 'Invalid cancellation reason.' });
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'cancellationReason')) {
      update.cancellationReason = req.body.cancellationReason.trim() || null;
    }
    if (update.status === 'cancelled' && order.status !== 'cancelled') {
      update.cancelledAt = new Date();
      update.cancelledBy = req.user.id;
    }

    const previousOccupancy = captureOrderSlotOccupancy(order);
    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;
    const previousAssignedDetailerId = order.assignedDetailer
      ? String(order.assignedDetailer?._id || order.assignedDetailer)
      : null;
    const previousSlot = getOrderSlotPair(order);
    const previousConsumedSlot = orderOccupiesSlot(previousStatus, order.archived, order.isWalkIn);

    // ── Anti-Double Booking Validation (Update) ─────────────────────
    const newDate = update.bookingDate || order.bookingDate;
    const newTime = update.bookingTime || order.bookingTime;
    const nextStatus = update.status || order.status;
    const nextSlot = getNormalizedSlotPair(newDate, newTime);
    const changesAppointmentSlot = Object.prototype.hasOwnProperty.call(update, 'bookingDate')
      || Object.prototype.hasOwnProperty.call(update, 'bookingTime');
    const nextArchived = Object.prototype.hasOwnProperty.call(update, 'archived')
      ? update.archived
      : order.archived;
    const nextIsWalkIn = changesAppointmentSlot
      ? false
      : Object.prototype.hasOwnProperty.call(update, 'isWalkIn')
        ? update.isWalkIn
        : order.isWalkIn;
    const nextConsumesSlot = orderOccupiesSlot(nextStatus, nextArchived, nextIsWalkIn);

    if (nextConsumesSlot && !nextSlot) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'A valid bookingDate and bookingTime are required for an appointment that occupies a slot.',
      });
    }
    if (changesAppointmentSlot && nextSlot) {
      // Canonical persistence keeps indexed counting and atomic counters aligned,
      // even when a client submits a human-readable date or 12-hour clock.
      update.bookingDate = nextSlot.date;
      update.bookingTime = nextSlot.time;
      update.isWalkIn = false;
    }

    if (newDate && newTime && nextConsumesSlot && (!previousConsumedSlot || !sameSlotPair(previousSlot, nextSlot))) {
      const sameDateTransfer = Boolean(
        previousConsumedSlot
        && previousSlot?.date === nextSlot?.date
      );
      const slotCheck = await reserveBookingSlot(newDate, newTime, {
        excludeOrderId: order._id,
        preserveDailyCapacity: sameDateTransfer,
      });
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck, 'DATE_UNAVAILABLE'),
        });
      }
      reservedSlot = slotCheck;
    }
    // ────────────────────────────────────────────────────────────────

    // Update fields
    Object.assign(order, update);
    await order.save();
    reservedSlot = null;

    if (previousStatus !== order.status) {
      await syncQualityStageNotifications(order, previousStatus, order.status);
    }

    if (
      previousConsumedSlot &&
      previousSlot &&
      (!orderOccupiesSlot(order.status, order.archived, order.isWalkIn)
        || !sameSlotPair(previousSlot, getOrderSlotPair(order)))
    ) {
      const finalSlot = getOrderSlotPair(order);
      await releaseBookingSlot(previousSlot.date, previousSlot.time, {
        releaseDaily: !orderOccupiesSlot(order.status, order.archived, order.isWalkIn)
          || previousSlot.date !== finalSlot?.date,
      });
    }
    emitOrderCapacityChange(previousOccupancy, order, 'appointment_updated');

    if (previousStatus !== order.status || previousPaymentStatus !== order.paymentStatus) {
      await evaluateReadyForPickupQueueEligibility(order, {
        persist: true,
        emit: true,
        notify: true,
      });
    }

    // ── Fire real-time events when payment is marked paid ─────────────────
    const paymentJustMarkedPaid =
      previousPaymentStatus !== 'paid' && order.paymentStatus === 'paid';

    if (paymentJustMarkedPaid) {
      // 1. Push live status update to the customer's socket room
      emitCustomerStatusUpdate(order);

      // 2. Persist and deliver the customer payment notification idempotently.
      try {
        await createCustomerPaymentConfirmedNotification(order, {
          invoiceId: order.invoiceId,
          amount: order.totalPrice || order.totalAmount,
        });
      } catch (notifyError) {
        console.error('Failed to create payment notification:', notifyError.message);
      }

    }
    // ─────────────────────────────────────────────────────────────────────

    if (previousStatus !== order.status) {
      emitCustomerStatusUpdate(order);
      logActivity({
        req, type: 'status_change', module: 'Booking', action: 'Booking Status Updated',
        description: `${req.user?.name || 'Staff'} changed booking ${order.orderNumber || order._id} from ${previousStatus} to ${order.status}.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus, newStatus: order.status },
      });
    }

    if (previousPaymentStatus !== order.paymentStatus) {
      logActivity({
        req, type: 'payment_status_changed', module: 'Payment', action: 'Payment Status Updated',
        description: `${req.user?.name || 'POS user'} changed booking ${order.orderNumber || order._id} payment status from ${previousPaymentStatus} to ${order.paymentStatus}.`,
        status: 'warning', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousPaymentStatus, newPaymentStatus: order.paymentStatus },
      });
    }

    const currentSlot = getOrderSlotPair(order);
    const bookingLink = buildAdminDeepLink('appointments', {
      orderId: order._id.toString(),
      bookingReference: order.bookingReference || order.orderNumber || '',
    });

    if (previousStatus !== 'cancelled' && order.status === 'cancelled') {
      try {
        await createAdminNotification({
          category: 'appointments',
          event: 'booking_cancelled',
          severity: 'warning',
          title: 'Booking cancelled',
          message: `${order.customerName || 'A customer'} cancelled booking ${order.bookingReference || order.orderNumber || order._id}.`,
          source: 'Appointments',
          actionRequired: false,
          groupingKey: buildAdminGroupingKey('appointments', 'booking_cancelled', order._id),
          link: bookingLink,
          action: { label: 'Review schedule', link: bookingLink },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            cancellationReason: req.body.cancellationReason || null,
            previousStatus,
          },
        });
      } catch (notificationError) {
        console.warn('[appointments] Cancellation notification failed:', notificationError.message);
      }
      try {
        await createCustomerBookingCancelledNotification(order, req.body.cancellationReason);
      } catch (notificationError) {
        console.warn('[appointments] Customer cancellation notification failed:', notificationError.message);
      }
    } else if (
      previousSlot
      && currentSlot
      && !sameSlotPair(previousSlot, currentSlot)
    ) {
      try {
        await createAdminNotification({
          category: 'appointments',
          event: 'booking_rescheduled',
          severity: 'info',
          title: 'Booking rescheduled',
          message: `${order.bookingReference || order.orderNumber || order._id} moved from ${previousSlot.date} ${previousSlot.time} to ${currentSlot.date} ${currentSlot.time}.`,
          source: 'Appointments',
          actionRequired: false,
          groupingKey: buildAdminGroupingKey('appointments', 'booking_rescheduled', order._id),
          link: bookingLink,
          action: { label: 'Open appointment', link: bookingLink },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            oldDate: previousSlot.date,
            oldTime: previousSlot.time,
            newDate: currentSlot.date,
            newTime: currentSlot.time,
          },
        });
      } catch (notificationError) {
        console.warn('[appointments] Reschedule notification failed:', notificationError.message);
      }
      try {
        await createCustomerBookingRescheduledNotification(order, previousSlot);
      } catch (notificationError) {
        console.warn('[appointments] Customer reschedule notification failed:', notificationError.message);
      }
    }

    if (previousPaymentStatus !== order.paymentStatus) {
      const paymentSpec = {
        paid: {
          event: 'payment_completed',
          severity: 'success',
          title: 'Payment completed',
          actionRequired: false,
        },
        failed: {
          event: 'payment_failed',
          severity: 'critical',
          title: 'Payment failed',
          actionRequired: true,
        },
        refunded: {
          event: 'refund_processed',
          severity: 'success',
          title: 'Refund processed',
          actionRequired: false,
        },
        unpaid: {
          event: 'payment_pending_review',
          severity: 'warning',
          title: 'Payment requires review',
          actionRequired: true,
        },
      }[order.paymentStatus];

      if (paymentSpec) {
        try {
          const link = buildAdminDeepLink('payments', { orderId: order._id.toString() });
          await createAdminNotification({
            category: 'payments',
            ...paymentSpec,
            message: `Booking ${order.bookingReference || order.orderNumber || order._id} changed from ${previousPaymentStatus || 'unknown'} to ${order.paymentStatus}.`,
            source: 'Payments',
            groupingKey: buildAdminGroupingKey('payments', paymentSpec.event, order._id),
            groupingWindowMs: 24 * 60 * 60 * 1000,
            link,
            action: { label: paymentSpec.actionRequired ? 'Review payment' : 'View payment', link },
            metadata: {
              orderId: order._id,
              bookingReference: order.bookingReference || order.orderNumber,
              previousPaymentStatus,
              paymentStatus: order.paymentStatus,
              paymentMethod: order.paymentMethod || null,
              changedBy: req.user?.name || req.user?.email || 'Staff',
            },
          });
        } catch (notificationError) {
          console.warn('[payments] Status notification failed:', notificationError.message);
        }
      }
    }

    const currentAssignedDetailerId = order.assignedDetailer
      ? String(order.assignedDetailer?._id || order.assignedDetailer)
      : null;
    if (previousAssignedDetailerId !== currentAssignedDetailerId) {
      try {
        const hasAssignment = Boolean(currentAssignedDetailerId);
        const link = buildAdminDeepLink('live_tracking', { orderId: order._id.toString() });
        await createAdminNotification({
          category: 'live_tracking',
          event: hasAssignment ? 'technician_assigned' : 'unassigned_technician',
          severity: hasAssignment ? 'info' : 'warning',
          title: hasAssignment ? 'Technician assigned' : 'No technician assigned',
          message: hasAssignment
            ? `A technician was assigned to ${order.bookingReference || order.orderNumber || order._id}.`
            : `${order.bookingReference || order.orderNumber || order._id} no longer has an assigned technician.`,
          source: 'Live Tracking',
          actionRequired: !hasAssignment,
          groupingKey: buildAdminGroupingKey(
            'live_tracking',
            hasAssignment ? 'technician_assigned' : 'unassigned_technician',
            order._id,
          ),
          link,
          action: { label: hasAssignment ? 'View assignment' : 'Assign technician', link },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            previousAssignedDetailerId,
            assignedDetailerId: currentAssignedDetailerId,
          },
        });
      } catch (notificationError) {
        console.warn('[live-tracking] Assignment notification failed:', notificationError.message);
      }
      try {
        await notifyQualityJobAssignment(order, previousAssignedDetailerId);
      } catch (notificationError) {
        console.warn('[live-tracking] Quality assignment notification failed:', notificationError.message);
      }
    }

    if (previousStatus !== order.status && ['in_progress', 'ready_for_payment', 'completed'].includes(order.status)) {
      const stageSpec = order.status === 'in_progress'
        ? { event: 'job_in_progress', severity: 'info', title: 'Job in progress' }
        : order.status === 'completed'
          ? { event: 'service_completed', severity: 'success', title: 'Service completed' }
          : { event: 'ready_for_pickup', severity: 'success', title: 'Job ready for final payment' };
      try {
        const link = buildAdminDeepLink('live_tracking', { orderId: order._id.toString() });
        await createAdminNotification({
          category: 'live_tracking',
          ...stageSpec,
          message: `${order.bookingReference || order.orderNumber || order._id} changed from ${previousStatus} to ${order.status}.`,
          source: 'Live Tracking',
          actionRequired: false,
          groupingKey: buildAdminGroupingKey('live_tracking', stageSpec.event, order._id),
          groupingWindowMs: 24 * 60 * 60 * 1000,
          link,
          action: { label: 'View job', link },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            previousStatus,
            status: order.status,
          },
        });
      } catch (notificationError) {
        console.warn('[live-tracking] Status notification failed:', notificationError.message);
      }
    }

    if (previousStatus !== order.status && order.status === 'confirmed') {
      try {
        await createCustomerStageNotification(order, 'confirmed');
      } catch (notifyError) {
        console.error('Failed to notify customer booking confirmation:', notifyError.message);
      }
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: sanitizeCustomerTrackerMediaForResponse(order, req.user),
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingReservation(reservedSlot);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after updateOrder failure:', releaseError.message);
      }
    }
    next(error);
  }
};

/**
 * Delete order
 */
export const deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    if (!isFullAdminRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only the Administrator may hard-delete a booking.',
      });
    }

    const hasLedgerHistory = Boolean(await Payment.exists({ order: order._id }));
    if (hasLedgerHistory || ['paid', 'partially_paid', 'refunded'].includes(order.paymentStatus) || ['completed', 'paid', 'released'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: 'Bookings with financial history or completed service activity must be retained. Archive the booking instead.',
      });
    }

    logActivity({
      req, type: 'booking_cancelled', module: 'Booking', action: 'Booking Deleted',
      description: `${req.user?.name || 'User'} deleted booking ${order.orderNumber || order._id}.`,
      status: 'warning', referenceId: order.orderNumber,
      metadata: { orderId: order._id },
    });

    const deletedOrder = await Order.findOneAndDelete({ _id: order._id, __v: order.__v });
    if (!deletedOrder) {
      return res.status(409).json({
        success: false,
        errorCode: 'BOOKING_CHANGED',
        message: 'The booking changed or was already deleted. Refresh and try again.',
      });
    }
    await releaseOrderSlotIfConsumed(deletedOrder);
    emitOrderCapacityChange(deletedOrder, null, 'appointment_deleted');

    res.json({
      success: true,
      message: 'Order deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Unified Admin flow:
 * Assign a detailer AND optionally mark payment as paid in a single transaction.
 */
export const assignDetailerAndMarkPaid = async (req, res, next) => {
  try {
    const { detailerId, markPaid, paymentMethod } = req.body || {};
    const isMarkPaid = markPaid === true || markPaid === 'true';

    if (!detailerId) {
      return res.status(400).json({
        success: false,
        message: 'detailerId is required',
      });
    }

    // Defensive guard – route already uses authorize(...BOOKING_MANAGER_ROLES)
    if (!req.user || !isBookingManagerRole(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only booking managers can assign staff and mark payments as paid',
      });
    }

    const assignableDetailer = await findAssignableQualityChecker(detailerId);
    if (!assignableDetailer) {
      return res.status(400).json({
        success: false,
        message: 'Assigned user must be an active, verified Quality Checker.',
      });
    }

    // (Restriction removed: Detailers can have multiple scheduled active bookings)

    const order = await Order.findById(req.params.id).populate('customer', 'name email avatar');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;
    const previousAssignedDetailerId = order.assignedDetailer
      ? String(order.assignedDetailer?._id || order.assignedDetailer)
      : null;

    // Perform assignment
    order.assignedDetailer = assignableDetailer._id;
    if (['pending', 'confirmed'].includes(order.status)) {
      order.status = 'assigned';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    // Optionally collect the exact server-side balance as part of the assignment.
    // The paid flag is a ledger projection; it is never written without a Payment row.
    if (isMarkPaid) {
      const canonicalPaymentMethod = normalizePosPaymentMethod(paymentMethod);
      if (!canonicalPaymentMethod) {
        return res.status(400).json({
          success: false,
          message: 'Payment method is required and must be cash or gcash when marking an order paid.',
        });
      }
      const ledgerRows = await getOrderLedger(order._id);
      const ledger = summarizeLedgerRows(ledgerRows, getOrderServiceTotal(order));
      if (ledger.outstandingBalance > 0) {
        await createVerifiedLedgerPayment({
          order,
          amount: ledger.outstandingBalance,
          expectedAmount: ledger.outstandingBalance,
          method: canonicalPaymentMethod,
          actorId: req.user.id,
          provider: 'admin',
          transactionType: ledger.netVerified > 0 ? 'service_balance' : 'full_service_payment',
          metadata: { assignAndPay: true, orderNumber: order.orderNumber },
        });
      }
      if (['pending', 'confirmed'].includes(order.status)) {
        order.status = 'assigned';
      }
    }

    await order.save();
    await order.populate('assignedDetailer', 'name email');

    try {
      await notifyQualityJobAssignment(order, previousAssignedDetailerId);
    } catch (notificationError) {
      console.warn('[live-tracking] Quality assignment notification failed:', notificationError.message);
    }

    const assignmentLink = buildAdminDeepLink('live_tracking', {
      orderId: order._id.toString(),
    });
    if (previousAssignedDetailerId !== String(order.assignedDetailer?._id || order.assignedDetailer)) {
      try {
        await createAdminNotification({
          category: 'live_tracking',
          event: 'technician_assigned',
          severity: 'info',
          title: 'Technician assigned',
          message: `${order.assignedDetailer?.name || 'A technician'} was assigned to ${order.bookingReference || order.orderNumber || order._id}.`,
          source: 'Live Tracking',
          actionRequired: false,
          groupingKey: buildAdminGroupingKey('live_tracking', 'technician_assigned', order._id),
          groupingWindowMs: 24 * 60 * 60 * 1000,
          link: assignmentLink,
          action: { label: 'View assignment', link: assignmentLink },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            previousAssignedDetailerId,
            assignedDetailerId: order.assignedDetailer?._id || order.assignedDetailer,
            assignedDetailerName: order.assignedDetailer?.name || null,
          },
        });
      } catch (notificationError) {
        console.warn('[live-tracking] Assignment notification failed:', notificationError.message);
      }
    }

    if (previousPaymentStatus !== 'paid' && order.paymentStatus === 'paid') {
      try {
        const paymentLink = buildAdminDeepLink('payments', { orderId: order._id.toString() });
        await createAdminNotification({
          category: 'payments',
          event: 'payment_completed',
          severity: 'success',
          title: 'Payment completed',
          message: `Booking ${order.bookingReference || order.orderNumber || order._id} was marked as paid.`,
          source: 'Payments',
          actionRequired: false,
          groupingKey: buildAdminGroupingKey('payments', 'payment_completed', order._id),
          groupingWindowMs: 24 * 60 * 60 * 1000,
          link: paymentLink,
          action: { label: 'View payment', link: paymentLink },
          metadata: {
            orderId: order._id,
            bookingReference: order.bookingReference || order.orderNumber,
            previousPaymentStatus,
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod || null,
          },
        });
      } catch (notificationError) {
        console.warn('[payments] Completion notification failed:', notificationError.message);
      }
    }

    // Push live status update to the customer
    emitCustomerStatusUpdate(order);

    // Trigger workflow orchestrator for status transition
    if (previousStatus !== order.status) {
      onOrderStatusChange(order, previousStatus, req.user).catch(err =>
        console.error('[WORKFLOW] Orchestrator error in assignDetailerAndMarkPaid:', err.message)
      );
    }

    // Create unified customer notification that a detailer is assigned.
    try {
      await createCustomerTechnicianAssignedNotification(order);
    } catch (notifyError) {
      console.error('Failed to send detailer-assigned notification:', notifyError.message);
    }

    // Activity logs for assignment and status changes
    logActivity({
      req, type: 'booking_assigned', module: 'Booking', action: 'Detailer Assigned',
      description: `${req.user?.name || 'Admin'} assigned detailer to booking ${order.orderNumber || order._id}.`,
      status: 'success', referenceId: order.orderNumber,
      metadata: { orderId: order._id, detailerId, paymentStatus: order.paymentStatus },
    });

    if (previousStatus !== order.status) {
      logActivity({
        req, type: 'status_change', module: 'Booking', action: 'Booking Status Updated',
        description: `Booking ${order.orderNumber || order._id} status changed from ${previousStatus} to ${order.status} during assignment.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus, newStatus: order.status },
      });
    }

    return res.json({
      success: true,
      message: isMarkPaid
        ? 'Detailer assigned and payment marked as paid.'
        : 'Detailer assigned successfully.',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Assign a detailer to an order
 */
export const assignDetailer = async (req, res, next) => {
  try {
    const { detailerId } = req.body;
    const assignableDetailer = await findAssignableQualityChecker(detailerId);
    if (!assignableDetailer) {
      return res.status(400).json({
        success: false,
        message: 'Assigned user must be an active, verified Quality Checker.',
      });
    }
    
    // (Restriction removed: Detailers can have multiple scheduled active bookings)

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'pending_confirmation') {
      return res.status(400).json({ success: false, message: 'Cannot assign detailer to a booking that is pending confirmation. Sales must approve the GCash proof first.' });
    }

    // 2. Perform assignment
    const previousStatus = order.status;
    const previousAssignedDetailerId = order.assignedDetailer
      ? String(order.assignedDetailer?._id || order.assignedDetailer)
      : null;
    order.assignedDetailer = assignableDetailer._id;
    if (['pending', 'confirmed'].includes(order.status)) {
      order.status = 'assigned';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    await order.save();

    // Populate for return
    await order.populate('assignedDetailer', 'name email');

    try {
      await notifyQualityJobAssignment(order, previousAssignedDetailerId);
    } catch (notificationError) {
      console.warn('[live-tracking] Quality assignment notification failed:', notificationError.message);
    }

    // Fire workflow orchestrator for status transition (handles inventory, notifications)
    if (previousStatus !== order.status) {
      onOrderStatusChange(order, previousStatus, req.user).catch(err =>
        console.error('[WORKFLOW] Orchestrator error in assignDetailer:', err.message)
      );
    }

    logActivity({
      req, type: 'booking_assigned', module: 'Booking', action: 'Detailer Assigned',
      description: `${req.user?.name || 'Admin'} assigned detailer to booking ${order.orderNumber || order._id}. Status: ${previousStatus} → ${order.status}`,
      status: 'success', referenceId: order.orderNumber,
      metadata: { orderId: order._id, detailerId, previousStatus, newStatus: order.status },
    });

    res.json({
      success: true,
      message: 'Detailer assigned successfully. Booking is now ready for check-in.',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update order progress (for Detailer)
 */
export const updateOrderProgress = async (req, res, next) => {
  try {
    const { stepIndex, status, completed, orderStatus } = req.body;
    const normalizedOrderStatus = orderStatus === 'in-progress' ? 'in_progress' : orderStatus;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if user is the assigned detailer or admin
    if (isServiceStaffRole(req.user.role) && 
       (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const wantsInProgress = normalizedOrderStatus === 'in_progress';
    const hasWaiver = !!order.legalCompliance?.waiverSignature;
    const preServiceCount = order.legalCompliance?.preServicePhotos?.length || 0;
    if (wantsInProgress && (!hasWaiver || preServiceCount < 2)) {
      return res.status(400).json({
        success: false,
        message: 'Waiver signature and at least 2 pre-service photos are required before starting the job'
      });
    }

    const previousStatus = order.status;
    const normalizedStepIndex = stepIndex !== undefined ? Number(stepIndex) : undefined;

    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    // Update top-level status if provided
    if (normalizedOrderStatus) {
        order.status = normalizedOrderStatus;
    }

    // Update specific step if provided
    if (normalizedStepIndex !== undefined && order.serviceSteps[normalizedStepIndex]) {
      order.serviceSteps[normalizedStepIndex].status = status || 'completed';
      if (order.serviceSteps[normalizedStepIndex].status === 'completed') {
        order.serviceSteps[normalizedStepIndex].completedAt = new Date();
      }
      
      // Auto-advance current step index
      if (status === 'completed' && normalizedStepIndex === order.currentStepIndex) {
          order.currentStepIndex = Math.min(order.currentStepIndex + 1, order.serviceSteps.length - 1);
      }
    }
    
    // Complete entire order if last step is done or explicit completion
    const lastStepIndex = order.serviceSteps.length - 1;
    const shouldComplete =
      completed === true ||
      normalizedOrderStatus === 'completed' ||
      (normalizedStepIndex !== undefined && normalizedStepIndex === lastStepIndex && status === 'completed');

    if (shouldComplete) {
      if (previousStatus !== 'completed') {
        if (!order.inventoryDeductedAt) {
          const serviceStepNames = (order.serviceSteps || []).map(step => step.name).join(' ');
          let serviceLabel = '';
          let serviceForRecipe = null;

          if (order.items?.length) {
            const itemProduct = order.items[0]?.product;
            if (itemProduct && typeof itemProduct === 'object' && itemProduct.name) {
              serviceLabel = itemProduct.name;
            }
            if (itemProduct) {
              serviceForRecipe = await Service.findById(itemProduct);
              if (serviceForRecipe?.name) {
                serviceLabel = serviceForRecipe.name;
              }
            }
          }

          const resolvedInventory = [];
          const insufficientInventory = [];

          if (serviceForRecipe?.recipe?.length) {
            for (const entry of serviceForRecipe.recipe) {
              let product = null;
              if (entry.product) {
                product = await Product.findById(entry.product);
              }
              if (!product && entry.productName) {
                product = await findProductByName(entry.productName);
              }

              const quantity = Number(entry.quantity);
              if (!Number.isFinite(quantity) || quantity <= 0) {
                continue;
              }

              if (!product) {
                await notifyInventoryIssue({
                  title: 'Inventory Mapping Missing',
                  message: `${serviceForRecipe.name}: recipe item not found (${entry.productName || 'Unnamed item'})`,
                  metadata: {
                    serviceId: serviceForRecipe._id,
                    serviceName: serviceForRecipe.name,
                    productName: entry.productName,
                    quantity,
                    unit: entry.unit
                  }
                });
                continue;
              }

              if (product.inventory < quantity) {
                insufficientInventory.push({ product, quantity, unit: entry.unit, serviceName: serviceForRecipe.name });
                continue;
              }

              resolvedInventory.push({ product, quantity });
            }
          } else {
            const serviceText = `${serviceLabel} ${serviceStepNames}`.toLowerCase();
            const requiredInventory = SERVICE_INVENTORY_MAP.filter(entry => serviceText.includes(entry.keyword));

            if (requiredInventory.length > 0) {
              for (const entry of requiredInventory) {
                let product = null;

                for (const name of entry.productNames) {
                  product = await findProductByName(name);
                  if (product) break;
                }

                if (!product) {
                  console.warn(`[INVENTORY_SKIP] No matching inventory item found for ${entry.keyword}`);
                  await notifyInventoryIssue({
                    title: 'Inventory Mapping Missing',
                    message: `Missing inventory mapping for ${entry.keyword} (${serviceLabel || 'Service'})`,
                    metadata: {
                      keyword: entry.keyword,
                      serviceName: serviceLabel
                    }
                  });
                  continue;
                }

                if (product.inventory < entry.quantity) {
                  insufficientInventory.push({ product, quantity: entry.quantity, serviceName: serviceLabel });
                  continue;
                }

                resolvedInventory.push({ product, quantity: entry.quantity });
              }
            }
          }

          for (const item of insufficientInventory) {
            await notifyInventoryIssue({
              title: 'Inventory Alert',
              message: `${item.product.name} out of stock for ${item.serviceName || 'service'} (needed ${item.quantity}${item.unit ? ` ${item.unit}` : ''}, available ${item.product.inventory})`,
              metadata: {
                productId: item.product._id,
                productName: item.product.name,
                required: item.quantity,
                available: item.product.inventory,
                serviceName: item.serviceName
              }
            });
          }

          for (const item of resolvedInventory) {
            const previousInventory = Number.isFinite(item.product.inventory) ? item.product.inventory : 0;
            const updatedInventory = previousInventory - item.quantity;

            item.product.inventory = updatedInventory;
            await item.product.save();

            // Log ledger entry for usage history
            try {
              await InventoryTransaction.create({
                product: item.product._id,
                type: 'out',
                quantity: item.quantity,
                previousStock: previousInventory,
                newStock: updatedInventory,
                referenceId: order._id,
                referenceModel: 'Order',
                notes: `Auto-deducted for service execution.`,
              });
            } catch (err) {
              console.error('[INVENTORY_LEDGER_ERROR] Failed to log inventory transaction:', err);
            }

            if (previousInventory > LOW_STOCK_THRESHOLD && updatedInventory <= LOW_STOCK_THRESHOLD) {
              await notifyInventoryIssue({
                title: 'Low Stock',
                message: `Low Stock: ${item.product.name} only has ${updatedInventory} units left`,
                metadata: {
                  productId: item.product._id,
                  productName: item.product.name,
                  threshold: LOW_STOCK_THRESHOLD,
                  remaining: updatedInventory
                }
              });
            }
          }

          order.inventoryDeductedAt = new Date();
        }
      }

      order.status = 'completed';

      // Send completion email to customer
      try {
        const customer = await User.findById(order.customer);
        if (customer) {
          // -- Loyalty Points Reward (5% back) --
          if (order.totalAmount && order.totalAmount > 0) {
              const pointsEarned = Math.floor(order.totalAmount * 0.05);
              customer.loyaltyPoints = (customer.loyaltyPoints || 0) + pointsEarned;
              
              const currentPoints = customer.loyaltyPoints;
              let newTier = 'Bronze';
              if (currentPoints >= 10000) newTier = 'Platinum';
              else if (currentPoints >= 5000) newTier = 'Gold';
              else if (currentPoints >= 2000) newTier = 'Silver';
              
              customer.loyaltyTier = newTier;
              await customer.save();
              console.log(`[Loyalty] Awarded ${pointsEarned} points to user ${customer._id}. New Tier: ${newTier}`);
          }

          if (customer.email) {
            const service = order.items?.[0]?.product
              ? await Service.findById(order.items[0].product)
              : null;
            
            await emailService.sendServiceCompletedEmail(customer.email, {
              orderNumber: order.orderNumber,
              customerName: customer.name || 'Valued Customer',
              serviceName: service?.name || 'Premium Detailing',
              vehicleInfo: `${order.vehicleYear || ''} ${order.vehicleMake || ''} ${order.vehicleModel || ''}`.trim() || 'Your Vehicle',
              ratingLink: `${process.env.FRONTEND_URL || 'https://autospf.com'}/dashboard?rating=${order._id}`
            });
          }
        }
      } catch (rewardErr) {
        console.error('Failed to process rewards or send completion email:', rewardErr);
      }
    }

    await saveOrderWithSlotTransition(
      order,
      captureOrderOccupancyWithStatus(order, previousStatus)
    );

    if (previousStatus !== order.status) {
      await syncQualityStageNotifications(order, previousStatus, order.status);
    }

    if (normalizedStepIndex !== undefined || shouldComplete) {
      const completedSteps = (order.serviceSteps || []).filter((step) => step.status === 'completed').length;
      const progress = shouldComplete
        ? 100
        : Math.round((completedSteps / Math.max(order.serviceSteps.length, 1)) * 100);
      try {
        await createCustomerServiceProgressNotification(order, progress);
      } catch (notificationError) {
        console.warn('[orders] Customer progress notification failed:', notificationError.message);
      }
    }

    // Activity logs for status changes (fire-and-forget)
    if (previousStatus !== order.status) {
      logActivity({
        req, type: 'status_change', module: 'Booking', action: 'Service Status Updated',
        description: `Service on booking ${order.orderNumber || order._id} changed from ${previousStatus} to ${order.status}.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus, newStatus: order.status },
      });
    }
    if (['confirmed', 'received'].includes(previousStatus) && order.status === 'in_progress') {
      logActivity({
        req, type: 'service_started', module: 'Service', action: 'Job Started',
        description: `${req.user?.name || 'Detailer'} started job ${order.orderNumber || order._id}.`,
        status: 'success', referenceId: order.orderNumber,
        metadata: { orderId: order._id },
      });
    }
    if (order.status === 'completed' && previousStatus !== 'completed') {
      logActivity({
        req, type: 'service_completed', module: 'Service', action: 'Job Completed',
        description: `${req.user?.name || 'Detailer'} completed job ${order.orderNumber || order._id}.`,
        status: 'success', referenceId: order.orderNumber,
        metadata: { orderId: order._id },
      });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Update customer-facing status (Queued/In Progress/Finishing/Ready)
 */
export const updateCustomerStatus = async (req, res, next) => {
  try {
    const requestedStatus = req.body?.status;
    const normalizedStatus = normalizeCustomerStatus(requestedStatus);

    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed: ${CUSTOMER_STATUS_VALUES.join(', ')}`
      });
    }

    const order = await Order.findById(req.params.id).populate('customer', 'email name avatar');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (isServiceStaffRole(req.user.role) &&
      (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
      return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const hasWaiver = !!order.legalCompliance?.waiverSignature;
    if (normalizedStatus !== 'queued' && !hasWaiver) {
      return res.status(400).json({
        success: false,
        message: 'Waiver signature is required before status can progress'
      });
    }

    const previousCustomerStatus = order.customerStatus || 'queued';
    order.customerStatus = normalizedStatus;
    order.customerStatusUpdatedAt = new Date();

    await order.save();
    emitCustomerStatusUpdate(order);

    if (previousCustomerStatus !== normalizedStatus) {
      logActivity({
        req, type: 'customer_status_change', module: 'Booking', action: 'Customer Status Updated',
        description: `${req.user?.name || 'Staff'} updated customer status from ${previousCustomerStatus} to ${normalizedStatus} on booking ${order.orderNumber || order._id}.`,
        status: 'info', referenceId: order.orderNumber,
        metadata: { orderId: order._id, previousStatus: previousCustomerStatus, newStatus: normalizedStatus },
      });
    }

    if (normalizedStatus === 'ready' && previousCustomerStatus !== 'ready' && order.status !== 'completed') {
      const customerEmail = order.customer?.email;
      if (customerEmail) {
        const vehicleInfo = order.vehicleInfo
          || [order.vehicleYear, order.vehicleMake, order.vehicleModel].filter(Boolean).join(' ')
          || 'N/A';
        const orderData = {
          customerName: order.customerName || order.customer?.name || 'Customer',
          serviceName: order.serviceType || order.items?.[0]?.product?.name || 'Service',
          orderNumber: order.orderNumber || order._id?.toString?.(),
          vehicleInfo,
        };
        await emailService.sendServiceCompletedEmail(customerEmail, orderData);
      }
    }

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Get orders assigned to specific detailer
 */
export const getDetailerOrders = async (req, res, next) => {
  try {
    // Only return jobs explicitly assigned to this detailer
    // Jobs must be in actionable states: assigned, received, in_progress, completed
    // Projected to the same lightweight list fields as getAllOrders — this query
    // previously ran with no .select() at all, so every matching order (including
    // its full trackerStageMedia array, which can hold multi-hundred-KB inline
    // base64 photos pending Cloudinary backfill) was hydrated and serialized in
    // full. That was the root cause of this endpoint's ~14s response time.
    const orders = await timeOperation(
      { req, res, kind: 'db', name: 'detailerOrders.order.find' },
      () => Order.find({
        archived: { $ne: true },
        assignedDetailer: req.user.id,
        status: { $in: ['assigned', 'received', 'in_progress', 'completed'] },
      })
        .select(`${ORDER_LIST_SELECT_FIELDS} serviceSteps operationsChecklist`)
        .populate('customer', 'name email phone avatar')
        .populate('assignedDetailer', 'name email')
        .sort({ createdAt: -1 })
        .lean()
    );

    const dto = await timeOperation(
      { req, res, kind: 'map', name: 'detailerOrders.formatBookingListDto' },
      () => orders.map((o) => ({
        ...formatBookingListDto(o),
        serviceSteps: o.serviceSteps || [],
        operationsChecklist: o.operationsChecklist || null,
      }))
    );

    res.json({ success: true, data: dto });
  } catch (error) {
    console.error('❌ [DETAILER_ORDERS] Error:', error.message);
    next(error);
  }
};

/**
 * Submit rating for completed order
 */
export const submitRating = async (req, res, next) => {
  try {
    const { score, comment } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Verify user is the customer who owns this order
    if (order.customer.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: You can only rate your own bookings' });
    }

    // Verify order is completed
    if (order.status !== 'completed') {
      return res.status(400).json({ success: false, message: 'Can only rate completed bookings' });
    }

    // Verify not already rated
    if (order.rating?.score) {
      return res.status(400).json({ success: false, message: 'You have already rated this booking' });
    }

    // Validate score
    if (!score || score < 1 || score > 5) {
      return res.status(400).json({ success: false, message: 'Rating score must be between 1 and 5' });
    }

    order.rating = {
      score,
      comment: comment || '',
      ratedAt: new Date()
    };

    await order.save();

    res.json({ 
      success: true, 
      message: 'Thank you for your feedback!',
      data: sanitizeCustomerTrackerMediaForResponse(order, req.user)
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download Auto-Generated Waiver PDF
 */
export const getWaiverPdf = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'name email avatar');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!canViewOrderWithRoleConstraints(req.user, order)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    if (!order.legalCompliance?.waiverSignature) {
      return res.status(400).json({ success: false, message: 'Waiver has not been signed yet' });
    }

    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.text('AutoSPF+ Liability Waiver', 20, 20);

    doc.setFontSize(12);
    doc.text(`Order Number: ${order.orderNumber || order._id}`, 20, 35);
    doc.text(`Customer Name: ${order.customer?.name || order.customerName || 'N/A'}`, 20, 42);
    doc.text(`Date Signed: ${new Date(order.legalCompliance.waiverSignedAt).toLocaleString()}`, 20, 49);

    doc.setFontSize(14);
    doc.text('Terms and Conditions', 20, 65);
    doc.setFontSize(10);
    const terms = 'By signing this document, the customer acknowledges and agrees that AutoSPF+ and its technicians are not liable for any pre-existing damage, wear and tear, or underlying conditions prior to the detailing service. All loose items, valuables, and sensitive materials must be removed from the vehicle before the service begins. The customer releases AutoSPF+ from all claims damages from standard operations.';
    const splitTerms = doc.splitTextToSize(terms, 170);
    doc.text(splitTerms, 20, 75);

    doc.setFontSize(14);
    doc.text('Customer Signature:', 20, 110);
    
    const sigStr = order.legalCompliance.waiverSignature;
    if (sigStr.startsWith('data:image')) {
      const imgType = sigStr.split(';')[0].split('/')[1].toUpperCase(); // PNG, JPEG, etc.
      doc.addImage(sigStr, imgType, 20, 120, 80, 40);
    } else {
      doc.text('(Signature file stored securely on server)', 20, 130);
    }

    doc.setFontSize(8);
    doc.text('AutoSPF+ Legal Dept. | Auto-generated via Node System', 20, 280);

    const pdfBuffer = doc.output('arraybuffer');

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="waiver-${order._id}.pdf"`,
    });

    return res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    next(error);
  }
};

/**
 * Send Waiver Reminder via Email/SMS (Mock/Placeholder for now)
 */
export const sendWaiverReminder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'name email phone avatar');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.legalCompliance?.waiverSignature) {
      return res.status(400).json({ success: false, message: 'Waiver is already signed.' });
    }

    // In a real implementation, you would trigger the emailService / SMS service here.
    // Example: await emailService.sendWaiverReminder(order.customer.email, order);

    return res.status(200).json({ 
      success: true, 
      message: 'Reminder sent successfully' 
    });
  } catch (error) {
    next(error);
  }
};
export const updateOperationsChecklist = async (req, res, next) => {
  try {
    const { phase, index, completed } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.operationsChecklist || !order.operationsChecklist[phase]) {
       return res.status(400).json({ success: false, message: 'Invalid checklist phase' });
    }

    order.operationsChecklist[phase][index].completed = completed;
    order.operationsChecklist[phase][index].completedAt = completed ? new Date() : null;

    await order.save();

    res.json({
      success: true,
      data: {
        operationsChecklist: order.operationsChecklist
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateWarrantyReceipt = async (req, res, next) => {
  try {
    const { warrantyAndReceipt } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!order.warrantyAndReceipt) {
      order.warrantyAndReceipt = {};
    }

    // Auto-generate certificate number if not already present
    if (!order.warrantyAndReceipt.certificateNumber && !warrantyAndReceipt.certificateNumber) {
        const timestamp = Date.now().toString().slice(-4);
        const orderSuffix = order._id.toString().slice(-4);
        order.warrantyAndReceipt.certificateNumber = `W-${orderSuffix}${timestamp}`;
    }

    // Merge incoming warrantyAndReceipt fields with the existing ones
    Object.assign(order.warrantyAndReceipt, warrantyAndReceipt);
    order.warrantyAndReceipt.signedAt = new Date();

    await order.save();

    res.json({
      success: true,
      data: {
        warrantyAndReceipt: order.warrantyAndReceipt
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a note to the order's staffNotes array
 */
export const addOrderNote = async (req, res, next) => {
  try {
    const { content } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!content) {
      return res.status(400).json({ success: false, message: 'Note content is required' });
    }

    if (!order.staffNotes) {
      order.staffNotes = [];
    }

    order.staffNotes.push({
      content,
      detailerId: req.user.id,
      detailerName: req.user.name || 'Staff Member',
    });

    await order.save();

    // Log the action
    logActivity({
      req,
      type: 'system',
      module: 'Service',
      action: 'Note Added',
      description: `${req.user.name || 'Staff Member'} added a note to order ${order.orderNumber}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { role: req.user.role }
    });

    res.json({
      success: true,
      data: { staffNotes: order.staffNotes }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a photo to the order's photos array (before/after)
 */
export const addOrderPhoto = async (req, res, next) => {
  try {
    const { phase, photoUrl } = req.body; // phase: 'before' or 'after'
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!photoUrl) {
      return res.status(400).json({ success: false, message: 'Photo URL/Data is required' });
    }

    if (!validateImageReference(photoUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Photo must be a valid JPG, PNG, or WebP image reference under 8 MB.',
      });
    }

    if (phase !== 'before' && phase !== 'after') {
      return res.status(400).json({ success: false, message: 'Phase must be "before" or "after"' });
    }

    if (!order.photos) {
      order.photos = { before: [], after: [] };
    }

    order.photos[phase].push(photoUrl);

    await order.save();
    
    // Log the action
    logActivity({
      req,
      type: 'system',
      module: 'Service',
      action: 'Photo Uploaded',
      description: `${req.user.name || 'Staff Member'} uploaded a ${phase} photo to order ${order.orderNumber}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { role: req.user.role, phase }
    });

    res.json({
      success: true,
      data: { photos: order.photos }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a specific workflow step for an order.
 * Strict step-locking: step N+1 cannot be saved unless step N is completed.
 * PATCH /api/orders/:id/workflow
 */
export const updateWorkflowStep = async (req, res, next) => {
  try {
    const { step, data } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'pending_confirmation') {
      return res.status(400).json({ success: false, message: 'Cannot update workflow for a booking that is pending confirmation.' });
    }

    const previousStatus = order.status;

    if (!step || step < 1 || step > 7) {
      return res.status(400).json({ success: false, message: 'Invalid step number (1-7)' });
    }

    // Workflow unification: Read from canonical workflow.completedSteps sub-document
    const completedSteps = order.workflow?.completedSteps || [];
    for (let i = 1; i < step; i++) {
      if (!completedSteps.includes(i)) {
        return res.status(403).json({
          success: false,
          message: `Step ${i} must be completed before step ${step} can be saved.`,
          requiredStep: i,
        });
      }
    }

    const STEP_FIELD_MAP = {
      1: 'jobOrder',
      2: 'ingressChecklist',
      3: null, // handled specially (damageAnnotations + damagePhotos)
      4: 'customerWaiver',
      5: 'serviceProper',
      6: null, // handled specially (qcChecklist)
      7: 'egressData',
    };

    const now = new Date();
    const userId = req.user?._id || req.user?.id;

    // Apply step-specific data
    switch (step) {
      case 1:
        order.jobOrder = { ...(order.jobOrder || {}), ...data, completedAt: now, completedBy: userId };
        // Also sync top-level fields
        if (data.vehicleModel) order.vehicleModel = data.vehicleModel;
        if (data.vehicleYear) order.vehicleYear = data.vehicleYear;
        if (data.vehicleColor) order.vehicleColor = data.vehicleColor;
        if (data.vehiclePlate) order.vehiclePlate = data.vehiclePlate;
        if (data.customerName) order.customerName = data.customerName;
        if (data.serviceCategory) order.serviceType = data.serviceCategory;
        break;

      case 2:
        order.ingressChecklist = { ...(order.ingressChecklist || {}), ...data, completedAt: now, completedBy: userId };
        break;

      case 3:
        if (data.annotations) order.damageAnnotations = data.annotations;
        if (data.photos) order.damagePhotos = data.photos;
        order.damageCompletedAt = now;
        break;

      case 4:
        order.customerWaiver = { ...(order.customerWaiver || {}), ...data, completedAt: now };
        break;

      case 5:
        order.serviceProper = { ...(order.serviceProper || {}), ...data, completedAt: now, completedBy: userId };
        break;

      case 6:
        if (data.items) order.qcChecklist = data.items;
        order.qcCompletedAt = now;
        break;

      case 7:
        order.egressData = { ...(order.egressData || {}), ...data, completedAt: now, completedBy: userId };
        if (data.releaseTimestamp) {
          order.status = 'released'; // Step 7 final releases vehicle to Customer
          order.customerStatus = 'ready';
          order.customerStatusUpdatedAt = now;
        }
        break;
    }

    // Mark step as completed — write to canonical workflow sub-document only
    if (!order.workflow) order.workflow = { currentStep: 1, completedSteps: [], status: 'pending' };
    if (!order.workflow.completedSteps.includes(step)) {
      order.workflow.completedSteps.push(step);
    }
    order.workflow.currentStep = Math.max(order.workflow.currentStep || 1, step);
    order.markModified('workflow');

    // Declarative Status Sync (Fallback to ensure Web POS accuracy)
    const maxStep = Math.max(...order.workflow.completedSteps, step);
    if (maxStep >= 1 && maxStep < 7 && !['cancelled', 'failed'].includes(order.status)) {
       order.status = 'in_progress';
    } else if (maxStep >= 7 && !['cancelled', 'failed'].includes(order.status)) {
       order.status = 'completed'; // Trigger POS System to record it as ready for invoice / release
    }

    await saveOrderWithSlotTransition(
      order,
      captureOrderOccupancyWithStatus(order, previousStatus)
    );

    // Fire exact real-time payload socket for customers and admins immediately to reduce syncing delay
    import('../socket.js').then((socketModule) => {
      const io = socketModule.getIO();
      if (io) io.to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status, workflowStep: order.workflow?.currentStep });
    }).catch(err => console.error("Error retrieving socket io module inside updateWorkflowStep", err));

    // Log activity
    const STEP_LABELS = ['', 'Job Order', 'Pre-Assessment & Ingress Checklist', 'Damage Annotation', 'Customer Waiver', 'Service Proper', 'QC Checklist', 'Egress Release'];
    logActivity({
      req,
      type: 'system',
      module: 'Workflow',
      action: `Step ${step} Completed`,
      description: `${req.user?.name || 'Staff'} completed "${STEP_LABELS[step]}" for order ${order.orderNumber}.`,
      status: 'success',
      referenceId: order._id,
      metadata: { step, stepLabel: STEP_LABELS[step] },
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * Mobile-Specific Workflow Updater
 * Handles the 9-step operations flow securely.
 * PATCH /api/orders/:id/mobile-workflow
 */
export const updateMobileWorkflow = async (req, res, next) => {
  try {
    const { workflow, stepData, step } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'pending_confirmation') {
      return res.status(400).json({ success: false, message: 'Cannot update workflow for a booking that is pending confirmation.' });
    }

    const previousProgress = Number(order.serviceProper?.progressPercentage || 0);

    // 1. Update the generic Mobile Workflow state
    if (workflow) {
      if (!order.workflow) order.workflow = {};
      
      if (typeof workflow.currentStep === 'number') {
        order.workflow.currentStep = workflow.currentStep;
      }
      if (Array.isArray(workflow.completedSteps)) {
        order.workflow.completedSteps = workflow.completedSteps;
      }
      if (typeof workflow.status === 'string') {
        order.workflow.status = workflow.status;
      }
    }

    const now = new Date();
    const userId = req.user?._id || req.user?.id;

    // 2. Map payload (if provided) directly into the MongoDB document exactly like the desktop site
    if (step && stepData) {
      switch (step) {
        case 2: // Ingress
          order.ingressChecklist = { ...(order.ingressChecklist || {}), ...stepData, completedAt: now, completedBy: userId };
          break;
        case 3: // Service Terms
          order.customerWaiver = { ...(order.customerWaiver || {}), ...stepData, completedAt: now };
          break;
        case 4: // Damage Annotation
          if (stepData.annotations) order.damageAnnotations = stepData.annotations;
          if (stepData.photos) order.damagePhotos = stepData.photos;
          order.damageCompletedAt = now;
          break;
        case 5: // Job Order
          order.jobOrder = { ...(order.jobOrder || {}), ...stepData, completedAt: now, completedBy: userId };
          break;
        case 6: // Live Progress
          order.serviceProper = { ...(order.serviceProper || {}), ...stepData, completedAt: now, completedBy: userId };
          break;
        case 7: // QC
          if (stepData.items) order.qcChecklist = stepData.items;
          order.qcCompletedAt = now;
          break;
        case 8: // Warranty & Receipt
        case 9: // Release
          order.egressData = { ...(order.egressData || {}), ...stepData, completedAt: now, completedBy: userId };
          break;
      }
    }

    await order.save();

    if (step === 4 && stepData) {
      try {
        await createCustomerDamageReportNotification(order);
      } catch (notificationError) {
        console.warn('[orders] Customer damage-report notification failed:', notificationError.message);
      }
    }
    if (step === 6 && Number.isFinite(Number(stepData?.progressPercentage))) {
      const progress = Number(stepData.progressPercentage);
      if (progress !== previousProgress) {
        try {
          await createCustomerServiceProgressNotification(order, progress);
        } catch (notificationError) {
          console.warn('[orders] Customer progress notification failed:', notificationError.message);
        }
      }
    }
    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * 1) POS Check-In (Pending -> Received)
 * Enforces 30% down payment
 * Requires legal signature
 */
export const operateCheckIn = async (req, res, next) => {
  let reservedSlot = null;
  try {
    const { id } = req.params;
    // Accept both frontend field names (signature, paymentMethod) and legacy (signatureBase64)
    const { downPaymentAmount, signature, signatureBase64, paymentMethod } = req.body;
    const sigData = signature || signatureBase64 || null;

    const order = await Order.findById(id).populate('customer', 'name email phone avatar');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (!['pending', 'approved', 'confirmed', 'assigned'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot check-in order in '${order.status}' status. Order must be confirmed or assigned first.` });
    }

    const previousStatusForWorkflow = order.status;
    if (
      !orderOccupiesSlot(previousStatusForWorkflow, order.archived, order.isWalkIn)
      && orderOccupiesSlot('received', order.archived, order.isWalkIn)
      && order.bookingDate
      && order.bookingTime
    ) {
      const slotCheck = await reserveBookingSlot(order.bookingDate, order.bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    const totalPrice = getOrderServiceTotal(order);
    const ledgerRows = await getOrderLedger(order._id);
    const ledger = summarizeLedgerRows(ledgerRows, totalPrice);
    const requiredAtCheckIn = roundMoney(totalPrice * 0.3);
    const additionalAmountDue = roundMoney(Math.max(0, requiredAtCheckIn - ledger.netVerified));
    const submittedAmount = roundMoney(downPaymentAmount);
    const acceptsLegacyCumulativeAmount = Math.abs(submittedAmount - requiredAtCheckIn) <= 0.009;
    const acceptsAdditionalAmount = Math.abs(submittedAmount - additionalAmountDue) <= 0.009;
    if (additionalAmountDue > 0 && !acceptsLegacyCumulativeAmount && !acceptsAdditionalAmount) {
      return res.status(409).json({
        success: false,
        code: 'LEDGER_AMOUNT_MISMATCH',
        message: `Only the additional check-in amount of ₱${additionalAmountDue.toFixed(2)} is due after verified payments.`,
        data: { requiredAtCheckIn, verifiedBeforeCheckIn: ledger.netVerified, additionalAmountDue },
      });
    }

    const canonicalPaymentMethod = additionalAmountDue > 0
      ? normalizePosPaymentMethod(paymentMethod)
      : null;
    if (additionalAmountDue > 0 && !canonicalPaymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payment method is required and must be cash or gcash.',
      });
    }
    if (additionalAmountDue > 0) {
      await createVerifiedLedgerPayment({
        order,
        amount: additionalAmountDue,
        expectedAmount: additionalAmountDue,
        method: canonicalPaymentMethod,
        actorId: req.user.id,
        provider: 'pos',
        transactionType: 'service_balance',
        metadata: { checkInCollection: true, requiredAtCheckIn, previouslyVerified: ledger.netVerified },
      });
    }

    if (sigData) {
      try {
        const waiverUrl = await generateTermsAndConditionsPDF(order, sigData);
        order.legalCompliance = {
          ...order.legalCompliance,
          waiverSignature: sigData,
          waiverSignedAt: new Date(),
          waiverPdf: waiverUrl,
        };
      } catch (pdfErr) {
        console.error('⚠️ PDF generation failed (non-fatal):', pdfErr.message);
        // Still proceed with check-in even if PDF fails
        order.legalCompliance = {
          ...order.legalCompliance,
          waiverSignature: sigData,
          waiverSignedAt: new Date(),
        };
      }
    }

    order.status = 'received';
    order.arrivedAt = order.arrivedAt || new Date();
    await order.save();
    reservedSlot = null;

    await syncQualityStageNotifications(order, previousStatusForWorkflow, order.status);
    emitBookingApprovalQueueUpdate(order);

    const io = getIO();
    io.to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status });

    // Trigger workflow orchestrator
    onOrderStatusChange(order, previousStatusForWorkflow, req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in operateCheckIn:', err.message)
    );
    
    logActivity({
      req,
      type: 'status_change',
      module: 'Booking',
      action: 'ORDER_CHECKIN',
      description: `Order checked in. Additional collection: ₱${additionalAmountDue}. Previously verified: ₱${ledger.netVerified}.`,
      referenceId: order._id,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingReservation(reservedSlot);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after operateCheckIn failure:', releaseError.message);
      }
    }
    console.error('❌ operateCheckIn error:', error);
    next(error);
  }
};

/**
 * 2) Start Service (Received -> In_Progress)
 */
export const operateStartService = async (req, res, next) => {
  try {
    const { id } = req.params;
    let order = await Order.findById(id);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'received') {
       return res.status(400).json({ message: `Cannot start service — vehicle must be checked in first. Current status: '${order.status}'.` });
    }

    const prevStatus = order.status;
    order.status = 'in_progress';
    await order.save();

    getIO().to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status });

    // Trigger workflow orchestrator
    onOrderStatusChange(order, prevStatus, req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in operateStartService:', err.message)
    );

    logActivity({
      req,
      type: 'service_started',
      module: 'Service',
      action: 'ORDER_STARTED',
      description: 'Service started.',
      referenceId: order._id,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * 3) QC Complete (In_Progress -> Completed)
 */
export const operateQCComplete = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate('customer', 'name email phone avatar').populate('items.product');

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'in_progress') {
       return res.status(400).json({ message: `Cannot complete service for order in ${order.status} status` });
    }

    try {
      const qcUrl = await generateQCPDF(order);
      if (qcUrl) {
        order.legalCompliance = {
          ...order.legalCompliance,
          qcPdf: qcUrl,
        };
      }
    } catch (err) {
      console.error('Quietly continuing despite QC PDF failure', err);
    }

    const prevQCStatus = order.status;
    order.status = 'completed';
    await saveOrderWithSlotTransition(
      order,
      captureOrderOccupancyWithStatus(order, prevQCStatus)
    );

    getIO().to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status });

    // Trigger workflow orchestrator
    onOrderStatusChange(order, prevQCStatus, req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in operateQCComplete:', err.message)
    );

    logActivity({
      req,
      type: 'service_completed',
      module: 'Service',
      action: 'ORDER_COMPLETED',
      description: 'QC Completed and QC Report generated.',
      referenceId: order._id,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * 4) Final Payment (Completed -> Paid)
 */
export const operateFinalPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { finalPaymentAmount, paymentMethod } = req.body;
    let order = await Order.findById(id);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Allow 'received', 'in_progress', 'completed' to move to 'paid' early if they want, but typically 'completed'
    if (['pending_confirmation', 'pending', 'rejected', 'confirmed', 'released', 'cancelled'].includes(order.status)) {
       return res.status(400).json({ message: `Cannot pay order in ${order.status} status` });
    }

    const prevPayStatus = order.status;
    const ledgerRows = await getOrderLedger(order._id);
    const ledger = summarizeLedgerRows(ledgerRows, getOrderServiceTotal(order));
    if (ledger.outstandingBalance <= 0) {
      return res.status(409).json({ success: false, message: 'This booking has no outstanding balance.' });
    }
    const submitted = roundMoney(finalPaymentAmount);
    if (Math.abs(submitted - ledger.outstandingBalance) > 0.009) {
      return res.status(409).json({
        success: false,
        code: 'LEDGER_AMOUNT_MISMATCH',
        message: `Final payment must match the server-calculated balance of ₱${ledger.outstandingBalance.toFixed(2)}.`,
        data: { outstandingBalance: ledger.outstandingBalance },
      });
    }
    const canonicalPaymentMethod = normalizePosPaymentMethod(paymentMethod);
    if (!canonicalPaymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Payment method is required and must be cash or gcash.',
      });
    }
    await createVerifiedLedgerPayment({
      order,
      amount: ledger.outstandingBalance,
      expectedAmount: ledger.outstandingBalance,
      method: canonicalPaymentMethod,
      actorId: req.user.id,
      provider: 'pos',
      transactionType: ledger.netVerified > 0 ? 'service_balance' : 'full_service_payment',
      metadata: { finalPayment: true, orderNumber: order.orderNumber },
    });
    order.status = order.paymentStatus === 'paid' ? 'paid' : order.status;
    
    // Auto-generate Warranty + Receipt PDF right at Payment Stage
    try {
      const warrantyUrl = await generateWarrantyPDF(order);
      if (warrantyUrl) {
        if (!order.warrantyAndReceipt) order.warrantyAndReceipt = {};
        order.warrantyAndReceipt.warrantyPdf = warrantyUrl;
      }
    } catch(err) {
      console.error('Quietly continuing despite warranty PDF failure', err);
    }

    await saveOrderWithSlotTransition(
      order,
      captureOrderOccupancyWithStatus(order, prevPayStatus)
    );

    getIO().to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status, paymentStatus: 'paid' });

    // Trigger workflow orchestrator
    onOrderStatusChange(order, prevPayStatus, req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in operateFinalPayment:', err.message)
    );

    logActivity({
      req,
      type: 'payment_completed',
      module: 'POS',
      action: 'ORDER_PAID',
      description: 'Final payment received.',
      referenceId: order._id,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

/**
 * 5) Release Vehicle (Paid -> Released)
 */
export const operateRelease = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { signatureBase64 } = req.body;
    const order = await Order.findById(id);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'paid') {
       return res.status(400).json({ message: `Cannot release order in ${order.status} status. Ensure it is paid.` });
    }

    const readyPickupPhotos = countGatePhotos(order, 'ready_pickup');
    if (readyPickupPhotos < REQUIRED_GATE_PHOTOS) {
      return res.status(400).json({
        success: false,
        message: 'Final output photos are required before releasing the vehicle.',
        uploaded: readyPickupPhotos,
        required: REQUIRED_GATE_PHOTOS,
      });
    }

    if (signatureBase64) {
      order.legalCompliance = {
        ...order.legalCompliance,
        releaseSignature: signatureBase64,
        releaseSignedAt: new Date(),
      };
    }

    order.status = 'released';
    await order.save();

    getIO().to('realtime:staff').emit('orderUpdated', { orderId: order._id, status: order.status });

    // Trigger workflow orchestrator
    onOrderStatusChange(order, 'paid', req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in operateRelease:', err.message)
    );

    logActivity({
      req,
      type: 'status_change',
      module: 'Booking',
      action: 'ORDER_RELEASED',
      description: 'Vehicle released to customer.',
      referenceId: order._id,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  CONFIRM BOOKING — Admin confirms pending → confirmed (triggers workflow)
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/orders/:id/confirm
 * Admin confirms a pending booking. This triggers the full workflow chain:
 *   → Job order auto-created
 *   → Inventory materials reserved
 *   → Staff queue notification emitted
 *   → Customer push notification sent
 */
export const confirmBooking = async (req, res, next) => {
  let reservedSlot = null;
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'name email avatar');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot confirm booking in '${order.status}' status. Only pending bookings can be confirmed.`,
      });
    }

    const previousStatus = order.status;
    const previousAssignedDetailerId = order.assignedDetailer
      ? String(order.assignedDetailer?._id || order.assignedDetailer)
      : null;

    // If admin assigns a technician during confirmation, go straight to 'assigned'
    const { assignedDetailer } = req.body || {};
    const assignableDetailer = assignedDetailer
      ? await findAssignableQualityChecker(assignedDetailer)
      : null;
    if (assignedDetailer && !assignableDetailer) {
      return res.status(400).json({
        success: false,
        message: 'Assigned user must be an active, verified Quality Checker.',
      });
    }
    const confirmedStatus = assignedDetailer ? 'assigned' : 'confirmed';
    if (!orderOccupiesSlot(previousStatus, order.archived, order.isWalkIn)
      && orderOccupiesSlot(confirmedStatus, order.archived, order.isWalkIn)
      && order.bookingDate && order.bookingTime) {
      const slotCheck = await reserveBookingSlot(order.bookingDate, order.bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    if (assignedDetailer) {
      order.assignedDetailer = assignableDetailer._id;
      order.status = confirmedStatus;
    } else {
      order.status = confirmedStatus;
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    await order.save();

    if (assignedDetailer) {
      try {
        await notifyQualityJobAssignment(order, previousAssignedDetailerId);
      } catch (notificationError) {
        console.warn('[orders] Quality assignment notification failed:', notificationError.message);
      }
    }
    reservedSlot = null;

    // Push live status update
    emitCustomerStatusUpdate(order);

    // Fire workflow orchestrator (handles job order, inventory, notifications)
    onOrderStatusChange(order, previousStatus, req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in confirmBooking:', err.message)
    );

    // Activity log
    logActivity({
      req,
      type: 'status_change',
      module: 'Booking',
      action: 'BOOKING_CONFIRMED',
      description: `${req.user?.name || 'Admin'} confirmed booking ${order.orderNumber || order._id}${assignedDetailer ? ' and assigned technician' : ''}.`,
      status: 'success',
      referenceId: order.orderNumber,
      metadata: { orderId: order._id, previousStatus, newStatus: order.status },
    });

    return res.json({
      success: true,
      message: assignedDetailer
        ? 'Booking confirmed and technician assigned. Ready for check-in.'
        : 'Booking confirmed. Awaiting technician assignment.',
      data: order,
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingReservation(reservedSlot);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after confirmBooking failure:', releaseError.message);
      }
    }
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  APPROVE BOOKING — Sales confirms GCash proof is valid
// ═══════════════════════════════════════════════════════════════════════
/**
 * @desc   Customer uploads GCash payment proof
 * @route  POST /api/orders/:id/payment-proof
 * @access Private - Customer
 */
export const uploadPaymentProof = async (req, res, next) => {
  let reservedSlot = null;
  try {
    const { id } = req.params;
    const { paymentProofUrl, reservationPaymentAmount: reservationPaymentAmountInput } = req.body;

    if (!paymentProofUrl) {
      return res.status(400).json({ success: false, message: 'Payment proof image is required' });
    }

    if (!validateImageReference(paymentProofUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Payment proof must be a valid JPG, PNG, or WebP image under 8 MB.',
      });
    }

    let order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const submittedReservationAmount = normalizeReservationAmount(
      reservationPaymentAmountInput,
      order.serviceTotal || order.totalPrice || order.totalAmount
    );

    // Must belong to the customer (authorization checked via middleware, but double check here)
    const customerId = order.customer?.toString?.();
    const userId = (req.user.id || req.user._id)?.toString?.();
    if (customerId !== userId && !isFullAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to upload proof for this booking' });
    }

    if (order.archived === true || order.isWalkIn === true) {
      return res.status(409).json({
        success: false,
        errorCode: 'BOOKING_NOT_APPOINTMENT',
        message: 'Archived and walk-in orders cannot be resubmitted as appointments.',
      });
    }

    const allowedProofStatuses = ['pending_confirmation', 'rejected'];
    if (!allowedProofStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot upload payment proof while booking is '${order.status}'. Use this only when waiting for confirmation or after a rejected payment.`,
      });
    }

    if (order.status === 'pending_confirmation' && hasReservationPaymentProof(order)) {
      const currentProof = String(order.paymentProofUrl || order.downpaymentProof || '');
      if (currentProof === paymentProofUrl) {
        return res.status(200).json({ success: true, data: formatBookingDto(order), idempotent: true });
      }
      return res.status(409).json({
        success: false,
        errorCode: 'PAYMENT_PROOF_UNDER_REVIEW',
        message: 'A GCash receipt is already under review. Wait for verification before submitting another receipt.',
      });
    }

    const previousStatus = order.status;
    const previousOccupancy = captureOrderSlotOccupancy(order);
    const storedSlot = getOrderSlotPair(order);
    if (!storedSlot) {
      return res.status(409).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'This booking has no valid appointment slot to resubmit.',
      });
    }
    if (!orderOccupiesSlot(previousStatus, order.archived, order.isWalkIn)
      && order.bookingDate && order.bookingTime) {
      const slotCheck = await reserveBookingSlot(storedSlot.date, storedSlot.time);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    // CAS makes rejected → pending_confirmation idempotent under concurrent
    // mobile retries. Only the winning request keeps its counter reservation.
    const savedOrder = await Order.findOneAndUpdate(
      { _id: order._id, __v: order.__v, status: previousStatus },
      {
        $set: {
          downpaymentProof: paymentProofUrl,
          paymentProofUrl,
          paymentMethod: 'gcash',
          status: 'pending_confirmation',
          rejectionReason: null,
          rejectedAt: null,
          rejectedBy: null,
        },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true }
    );

    if (!savedOrder) {
      if (reservedSlot) {
        await releaseBookingReservation(reservedSlot);
        reservedSlot = null;
      }
      const current = await Order.findById(order._id);
      if (current?.status === 'pending_confirmation') {
        await ensurePendingReservationPayment({
          order: current,
          amount: submittedReservationAmount,
          proofImage: paymentProofUrl,
          paymentMethod: 'gcash',
          submittedBy: req.user.id,
        });
        return res.status(200).json({
          success: true,
          data: sanitizeCustomerTrackerMediaForResponse(current, req.user),
          idempotent: true,
        });
      }
      return res.status(409).json({
        success: false,
        errorCode: 'BOOKING_CHANGED',
        message: 'The booking changed while payment proof was being submitted. Refresh and try again.',
      });
    }
    order = savedOrder;
    reservedSlot = null;
    await ensurePendingReservationPayment({
      order,
      amount: submittedReservationAmount,
      proofImage: paymentProofUrl,
      paymentMethod: 'gcash',
      submittedBy: req.user.id,
    });
    emitOrderCapacityChange(previousOccupancy, order, 'appointment_resubmitted');

    emitBookingApprovalQueueUpdate(order);

    try {
      const paymentLink = buildAdminDeepLink('payments', { orderId: order._id.toString() });
      await createAdminNotification({
        category: 'payments',
        event: 'payment_pending_review',
        severity: 'warning',
        title: 'Payment pending review',
        message: `${order.customerName || 'A customer'} submitted payment proof for ${order.bookingReference || order.orderNumber || order._id}.`,
        source: 'Payments',
        actionRequired: true,
        groupingKey: buildAdminGroupingKey('payments', 'payment_pending_review', order._id),
        groupingWindowMs: 24 * 60 * 60 * 1000,
        link: paymentLink,
        action: { label: 'Review payment', link: paymentLink },
        metadata: {
          orderId: order._id,
          bookingReference: order.bookingReference || order.orderNumber,
          paymentStatus: order.paymentStatus,
          submittedBy: req.user?.name || req.user?.email || order.customerName || 'Customer',
        },
      });
    } catch (notificationError) {
      console.warn('[payments] Review notification failed:', notificationError.message);
    }

    const io = getIO();
    // Notify customer
    io.to(`user:${order.customer.toString()}`).emit('booking:status', {
      bookingId: order._id,
      status: order.status,
    });

    try {
      const customerLabel = order.customerName || 'Customer';
      const serviceLabel = order.serviceType || 'Service';
      const salesNotif = await Notification.create({
        title: 'GCash reservation submitted',
        message: `${customerLabel} uploaded payment proof for ${serviceLabel}. Ref ${order.bookingReference || order.orderNumber}. Review in Booking Approvals.`,
        type: 'booking',
        recipientRole: 'sales',
        link: `/admin/bookings/${order._id}`,
        metadata: {
          orderId: order._id,
          bookingReference: order.bookingReference,
          kind: 'reservation_fee',
        },
      });
      emitBookingManagerNotification(salesNotif);
    } catch (notifyErr) {
      console.warn('Failed to create payment proof notification:', notifyErr.message);
    }

    res.status(200).json({
      success: true,
      data: sanitizeCustomerTrackerMediaForResponse(order, req.user),
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingReservation(reservedSlot);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after uploadPaymentProof failure:', releaseError.message);
      }
    }
    console.error('Error uploading payment proof:', error);
    if (error?.statusCode || error?.status) {
      return res.status(error.statusCode || error.status).json({
        success: false,
        errorCode: error.code,
        message: error.message,
      });
    }
    next(error);
  }
};

export const approveBooking = async (req, res, next) => {
  try {
    let order = await Order.findById(req.params.id).populate('customer', 'name email avatar');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'pending_confirmation') {
      const existingReservation = await Payment.findOne({
        order: order._id,
        transactionType: 'reservation_fee',
        status: 'succeeded',
      }).lean();
      if (order.status === 'confirmed' && existingReservation) {
        return res.json({
          success: true,
          message: 'Reservation was already approved.',
          idempotent: true,
          data: formatBookingDto(order),
        });
      }
      return res.status(400).json({ success: false, message: `Cannot approve booking with status '${order.status}'.` });
    }

    if (!hasReservationPaymentProof(order)) {
      return res.status(400).json({
        success: false,
        errorCode: 'PAYMENT_PROOF_REQUIRED',
        message: 'Payment proof is required before approving this booking.',
        error: 'Payment proof is required before approving this booking.',
      });
    }

    // The appointment's existing reservation remains authoritative here.
    // pending_confirmation already consumes the slot reserved at creation.
    // Approval is a lifecycle-only change and remains valid after Admin lowers
    // capacity below the occupancy of existing appointments.

    const verificationChecklist = assertVerificationChecklistComplete(req.body?.verificationChecklist);
    const previousStatus = order.status;
    const previousAssignedDetailerId = order.assignedDetailer
      ? String(order.assignedDetailer?._id || order.assignedDetailer)
      : null;
    const { assignedDetailer: manualDetailerId } = req.body || {};
    let detailerId = manualDetailerId;

    if (manualDetailerId) {
      const assignableDetailer = await findAssignableQualityChecker(manualDetailerId);
      if (!assignableDetailer) {
        return res.status(400).json({
          success: false,
          message: 'Assigned user must be an active, verified Quality Checker.',
        });
      }
      detailerId = assignableDetailer._id;
    }

    if (!detailerId) {
      // Priority: staff_quality_checker (Technician - Quality Checker) → technician → service_staff
      // This matches the business flow: Quality Checker handles bookings from Live Tracker
      const ASSIGNABLE_ROLES = ['staff_quality_checker'];
      let detailers = [];
      for (const role of ASSIGNABLE_ROLES) {
        detailers = await User.find({
          role,
          isActive: true,
          isVerified: true,
          isDeleted: { $ne: true },
        }).select('_id name role');
        if (detailers.length > 0) break; // Use highest-priority role that has active staff
      }
      for (const d of detailers) {
        const busy = await Order.findOne({ assignedDetailer: d._id, status: { $in: ['confirmed', 'received', 'in_progress'] } });
        if (!busy) { detailerId = d._id; break; }
      }
    }

    order = await runReservationDecisionTransaction(async (session) => {
      const sessionOptions = session ? { session } : {};
      const transactionOrder = await Order.findOne({
        _id: req.params.id,
        status: 'pending_confirmation',
      }).session(session);
      if (!transactionOrder) {
        const error = new Error('Booking changed while it was being approved. Refresh and try again.');
        error.statusCode = 409;
        error.status = 409;
        error.code = 'BOOKING_CHANGED';
        throw error;
      }

      let reservationPayment = await Payment.findOne({
        order: transactionOrder._id,
        transactionType: 'reservation_fee',
      }).session(session);
      if (!reservationPayment) {
        reservationPayment = await ensurePendingReservationPayment({
          order: transactionOrder,
          amount: MINIMUM_RESERVATION_FEE,
          proofImage: transactionOrder.paymentProofUrl || transactionOrder.downpaymentProof,
          paymentMethod: 'gcash',
          submittedBy: transactionOrder.customer,
          session,
        });
      }
      if (reservationPayment.status !== 'pending') {
        const error = new Error(`Reservation payment cannot be approved with status '${reservationPayment.status}'.`);
        error.statusCode = 409;
        error.status = 409;
        error.code = 'PAYMENT_STATUS_CHANGED';
        throw error;
      }

      const approvedAmount = normalizeReservationAmount(
        reservationPaymentAmount(reservationPayment),
        transactionOrder.serviceTotal || transactionOrder.totalPrice || transactionOrder.totalAmount
      );
      const reviewedAt = new Date();
      reservationPayment.status = 'succeeded';
      reservationPayment.amount = approvedAmount;
      reservationPayment.amountVerified = approvedAmount;
      reservationPayment.reviewedAt = reviewedAt;
      reservationPayment.effectiveAt = reviewedAt;
      reservationPayment.reviewedBy = req.user.id;
      reservationPayment.reviewReason = null;
      reservationPayment.verificationChecklist = verificationChecklist;
      reservationPayment.metadata = {
        ...(reservationPayment.metadata || {}),
        bookingStatusAtReview: 'confirmed',
        remainingBalance: reservationRemainingBalance(transactionOrder, approvedAmount),
      };
      reservationPayment.statusHistory.push({
        status: 'succeeded',
        amountSubmitted: reservationPayment.amountSubmitted,
        amountVerified: approvedAmount,
        proofImage: reservationPayment.proofImage,
        changedAt: reviewedAt,
        changedBy: req.user.id,
      });
      await reservationPayment.save(sessionOptions);

      transactionOrder.status = 'confirmed';
      transactionOrder.approvedAt = reviewedAt;
      transactionOrder.approvedBy = req.user.id;
      transactionOrder.rejectedAt = null;
      transactionOrder.rejectedBy = null;
      transactionOrder.rejectionReason = null;
      transactionOrder.downPaymentAmount = approvedAmount;
      transactionOrder.amountCollected = approvedAmount;
      transactionOrder.paymentStatus = approvedAmount + 0.009 >= getOrderServiceTotal(transactionOrder)
        ? 'paid'
        : 'partially_paid';
      if (detailerId) transactionOrder.assignedDetailer = detailerId;
      if (!transactionOrder.serviceSteps || transactionOrder.serviceSteps.length === 0) {
        transactionOrder.serviceSteps = DEFAULT_SERVICE_STEPS.map(s => ({ ...s }));
      }

      // Sales approval activates only Stage 1. Vehicle Arrival remains a
      // separate staff-recorded transition.
      transactionOrder.serviceTrackingStage = 'confirmed';
      transactionOrder.serviceTrackingUpdatedAt = reviewedAt;
      transactionOrder.serviceTrackingUpdatedBy = req.user?.name || 'Sales';
      await transactionOrder.save(sessionOptions);
      return transactionOrder;
    });
    await order.populate('customer', 'name email avatar');

    if (detailerId) {
      try {
        await notifyQualityJobAssignment(order, previousAssignedDetailerId);
      } catch (notificationError) {
        console.warn('[orders] Quality assignment notification failed:', notificationError.message);
      }
    }

    emitBookingApprovalQueueUpdate(order);

    emitCustomerStatusUpdate(order);

    // Emit booking_updated for calendar real-time refresh
    try {
      const io = getIO();
      if (io && order.bookingDate) {
        io.to('realtime:staff').emit('booking_updated', { date: order.bookingDate, orderId: order._id.toString(), status: order.status });
      }
    } catch (_) {}

    onOrderStatusChange(order, previousStatus, req.user).catch(err =>
      console.error('[WORKFLOW] approveBooking error:', err.message)
    );

    try {
      await createCustomerStageNotification(order, 'confirmed');
    } catch (ne) {
      console.warn('[orders] Failed to create confirmed customer notification:', ne.message);
    }

    logActivity({ req, type: 'status_change', module: 'Booking', action: 'BOOKING_APPROVED',
      description: `${req.user?.name} approved booking ${order.orderNumber}.`, status: 'success',
      referenceId: order.orderNumber, metadata: { orderId: order._id, previousStatus, newStatus: order.status } });

    return res.json({ success: true, message: 'Booking approved successfully.', data: formatBookingDto(order) });
  } catch (error) { next(error); }
};

// ═══════════════════════════════════════════════════════════════════════
//  REJECT BOOKING — Sales rejects invalid/unclear payment proof
// ═══════════════════════════════════════════════════════════════════════
export const rejectBooking = async (req, res, next) => {
  try {
    let order = await Order.findById(req.params.id).populate('customer', 'name email avatar');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'pending_confirmation') {
      const existingReservation = await Payment.findOne({
        order: order._id,
        transactionType: 'reservation_fee',
        status: 'rejected',
      }).lean();
      if (order.status === 'rejected' && existingReservation) {
        return res.json({
          success: true,
          message: 'Payment proof was already rejected.',
          idempotent: true,
          data: formatBookingDto(order),
        });
      }
      return res.status(400).json({ success: false, message: `Cannot reject booking with status '${order.status}'.` });
    }

    const { reason = 'Payment proof could not be verified.' } = req.body || {};
    const occupancyBefore = captureOrderSlotOccupancy(order);
    order = await runReservationDecisionTransaction(async (session) => {
      const sessionOptions = session ? { session } : {};
      const transactionOrder = await Order.findOne({
        _id: req.params.id,
        status: 'pending_confirmation',
      }).session(session);
      if (!transactionOrder) {
        const error = new Error('Booking changed while the proof was being rejected. Refresh and try again.');
        error.statusCode = 409;
        error.status = 409;
        error.code = 'BOOKING_CHANGED';
        throw error;
      }

      let reservationPayment = await Payment.findOne({
        order: transactionOrder._id,
        transactionType: 'reservation_fee',
      }).session(session);
      if (!reservationPayment) {
        reservationPayment = await ensurePendingReservationPayment({
          order: transactionOrder,
          amount: MINIMUM_RESERVATION_FEE,
          proofImage: transactionOrder.paymentProofUrl || transactionOrder.downpaymentProof,
          paymentMethod: 'gcash',
          submittedBy: transactionOrder.customer,
          session,
        });
      }
      if (reservationPayment.status !== 'pending') {
        const error = new Error(`Reservation payment cannot be rejected with status '${reservationPayment.status}'.`);
        error.statusCode = 409;
        error.status = 409;
        error.code = 'PAYMENT_STATUS_CHANGED';
        throw error;
      }

      const reviewedAt = new Date();
      reservationPayment.status = 'rejected';
      reservationPayment.amountVerified = 0;
      reservationPayment.reviewedAt = reviewedAt;
      reservationPayment.effectiveAt = null;
      reservationPayment.reviewedBy = req.user.id;
      reservationPayment.reviewReason = String(reason).trim().slice(0, 1000);
      reservationPayment.metadata = {
        ...(reservationPayment.metadata || {}),
        bookingStatusAtReview: 'rejected',
        remainingBalance: transactionOrder.serviceTotal || transactionOrder.totalPrice || transactionOrder.totalAmount || 0,
      };
      reservationPayment.statusHistory.push({
        status: 'rejected',
        amountSubmitted: reservationPayment.amountSubmitted,
        amountVerified: 0,
        proofImage: reservationPayment.proofImage,
        reason: reservationPayment.reviewReason,
        changedAt: reviewedAt,
        changedBy: req.user.id,
      });
      await reservationPayment.save(sessionOptions);

      transactionOrder.status = 'rejected';
      transactionOrder.rejectedAt = reviewedAt;
      transactionOrder.rejectedBy = req.user.id;
      transactionOrder.rejectionReason = reservationPayment.reviewReason;
      transactionOrder.serviceTrackingStage = null;
      transactionOrder.serviceTrackingUpdatedAt = null;
      transactionOrder.serviceTrackingUpdatedBy = null;
      await transactionOrder.save(sessionOptions);
      return transactionOrder;
    });
    await order.populate('customer', 'name email avatar');
    if (occupancyBefore.occupies && occupancyBefore.slot) {
      await releaseBookingSlot(occupancyBefore.slot.date, occupancyBefore.slot.time, { releaseDaily: true });
      emitAvailabilityUpdated({ type: 'appointment_capacity_changed', dates: [occupancyBefore.slot.date] });
    }
    emitBookingApprovalQueueUpdate(order);

    emitCustomerStatusUpdate(order);

    // Emit booking_updated for calendar real-time refresh
    try {
      const io = getIO();
      if (io && order.bookingDate) {
        io.to('realtime:staff').emit('booking_updated', { date: order.bookingDate, orderId: order._id.toString(), status: 'rejected' });
      }
    } catch (_) {}

    try {
      await createCustomerBookingRejectedNotification(order, reason);
    } catch (notificationError) {
      console.warn('[orders] Customer rejection notification failed:', notificationError.message);
    }

    logActivity({ req, type: 'status_change', module: 'Booking', action: 'BOOKING_REJECTED',
      description: `${req.user?.name} rejected booking ${order.orderNumber}. Reason: ${reason}`, status: 'success',
      referenceId: order.orderNumber, metadata: { orderId: order._id, newStatus: 'rejected', reason } });

    return res.json({ success: true, message: 'Booking rejected. Customer has been notified.', data: formatBookingDto(order) });
  } catch (error) { next(error); }
};

export const rescheduleBooking = async (req, res, next) => {
  let reservedSlot = null;
  try {
    const { newDate, newTime } = req.body;
    if (!newDate || !newTime) {
      return res.status(400).json({ success: false, message: 'newDate and newTime are required.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Rescheduling may move an existing customer appointment, but it must not
    // be used to turn a staff-created walk-in/unscheduled order into one.
    if (order.isWalkIn === true || !getOrderSlotPair(order)) {
      return res.status(403).json({
        success: false,
        errorCode: 'APPOINTMENT_CUSTOMER_ONLY',
        message: 'Only customer accounts may create service appointments.',
      });
    }

    if (order.archived === true) {
      return res.status(409).json({
        success: false,
        errorCode: 'BOOKING_ARCHIVED',
        message: 'Archived bookings cannot be rescheduled.',
      });
    }

    // Allow only APPROVED, QUEUED, pending_confirmation, confirmed
    const allowedStatuses = ['approved', 'queued', 'pending_confirmation', 'confirmed', 'assigned'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot reschedule booking with status '${order.status}'.` 
      });
    }

    const previousOccupancy = captureOrderSlotOccupancy(order);
    const oldDate = order.bookingDate;
    const oldTime = order.bookingTime;
    const oldSlot = getOrderSlotPair(order);
    const newSlot = getNormalizedSlotPair(newDate, newTime);
    if (!newSlot) {
      return res.status(400).json({
        success: false,
        errorCode: 'INVALID_SLOT',
        message: 'A valid newDate and newTime are required.',
      });
    }

    const occupiedOldSlot = orderOccupiesSlot(order.status, order.archived, order.isWalkIn);
    const occupiesNewSlot = orderOccupiesSlot(order.status, false, false);
    const changesExactTime = !sameSlotPair(oldSlot, newSlot);
    const needsTargetCheck = occupiesNewSlot && (!occupiedOldSlot || changesExactTime);

    if (needsTargetCheck) {
      const sameDateTransfer = Boolean(
        occupiedOldSlot
        && oldSlot?.date === newSlot.date
      );
      const slotCheck = await reserveBookingSlot(newDate, newTime, {
        excludeOrderId: order._id,
        preserveDailyCapacity: sameDateTransfer,
      });
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    const savedOrder = await Order.findOneAndUpdate(
      { _id: order._id, __v: order.__v },
      {
        $set: {
          bookingDate: newSlot.date,
          bookingTime: newSlot.time,
          isWalkIn: false,
        },
        $inc: { __v: 1 },
      },
      { new: true, runValidators: true }
    );

    if (!savedOrder) {
      if (reservedSlot) {
        await releaseBookingReservation(reservedSlot);
        reservedSlot = null;
      }
      const current = await Order.findById(order._id);
      if (
        current
        && current.archived !== true
        && current.isWalkIn !== true
        && sameSlotPair(getOrderSlotPair(current), newSlot)
      ) {
        return res.json({
          success: true,
          message: 'Booking is already scheduled for that time.',
          data: formatBookingDto(current),
        });
      }
      return res.status(409).json({
        success: false,
        errorCode: 'BOOKING_CHANGED',
        message: 'The booking changed while it was being rescheduled. Refresh and try again.',
      });
    }
    reservedSlot = null;

    if (occupiedOldSlot && oldSlot && !sameSlotPair(oldSlot, newSlot)) {
      await releaseBookingSlot(oldSlot.date, oldSlot.time, {
        releaseDaily: oldSlot.date !== newSlot.date,
      });
    }
    emitOrderCapacityChange(previousOccupancy, savedOrder, 'appointment_rescheduled');

    // Emit socket event
    try {
      const io = getIO();
      if (io) {
        io.to('realtime:staff').emit('booking_updated', {
          date: newDate,
          previousDate: oldDate,
          orderId: savedOrder._id.toString(),
          type: 'RESCHEDULE'
        });
      }
    } catch (_) {}

    logActivity({ 
      req, type: 'status_change', module: 'Booking', action: 'BOOKING_RESCHEDULED',
      description: `${req.user?.name} rescheduled booking ${savedOrder.orderNumber} to ${newSlot.date} ${newSlot.time}.`,
      status: 'success',
      referenceId: savedOrder.orderNumber,
      metadata: { orderId: savedOrder._id, oldDate, oldTime, newDate: newSlot.date, newTime: newSlot.time }
    });

    try {
      const link = buildAdminDeepLink('appointments', {
        orderId: savedOrder._id.toString(),
        bookingReference: savedOrder.bookingReference || savedOrder.orderNumber || '',
      });
      await createAdminNotification({
        category: 'appointments',
        event: 'booking_rescheduled',
        severity: 'info',
        title: 'Booking rescheduled',
        message: `${savedOrder.bookingReference || savedOrder.orderNumber || savedOrder._id} moved from ${oldDate} ${oldTime} to ${newSlot.date} ${newSlot.time}.`,
        source: 'Appointments',
        actionRequired: false,
        groupingKey: buildAdminGroupingKey('appointments', 'booking_rescheduled', savedOrder._id),
        link,
        action: { label: 'Open appointment', link },
        metadata: {
          orderId: savedOrder._id,
          bookingReference: savedOrder.bookingReference || savedOrder.orderNumber,
          oldDate,
          oldTime,
          newDate: newSlot.date,
          newTime: newSlot.time,
        },
      });
    } catch (notificationError) {
      console.warn('[appointments] Reschedule notification failed:', notificationError.message);
    }

    try {
      await createCustomerBookingRescheduledNotification(savedOrder, {
        date: oldDate,
        time: oldTime,
      });
    } catch (notificationError) {
      console.warn('[appointments] Customer reschedule notification failed:', notificationError.message);
    }

    return res.json({ success: true, message: 'Booking rescheduled successfully.', data: formatBookingDto(savedOrder) });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingReservation(reservedSlot);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after reschedule failure:', releaseError.message);
      }
    }
    next(error);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  STAFF QUEUE — Prioritized list of actionable jobs
// ═══════════════════════════════════════════════════════════════════════


/**
 * GET /api/orders/queue/staff
 * Returns a prioritized queue of jobs in staff-actionable states.
 *
 * Priority order:
 *   1. Unassigned confirmed bookings (soonest date first)
 *   2. Assigned but not started (received)
 *   3. In-progress jobs (active work)
 *
 * Optionally filters by ?detailerId= for a specific staff member's queue.
 */
export const getStaffQueue = async (req, res, next) => {
  try {
    const { detailerId } = req.query;

    const filter = {
      status: { $in: ['confirmed', 'assigned', 'received', 'in_progress'] },
      archived: { $ne: true },
    };

    // If specific detailer is requested, show their assignments + unassigned
    if (detailerId) {
      filter.$or = [
        { assignedDetailer: detailerId },
        { assignedDetailer: null },
        { assignedDetailer: { $exists: false } },
      ];
    }

    const orders = await Order.find(filter)
      .populate('customer', 'name email phone loyaltyTier avatar')
      .populate('assignedDetailer', 'name email')
      .select(
        'orderNumber bookingReference status customerStatus customerName serviceType ' +
        'bookingDate bookingTime vehicleYear vehicleMake vehicleModel vehicleColor vehiclePlate ' +
        'assignedDetailer totalPrice notes createdAt'
      )
      .sort({
        // Soonest booking date first, then by creation date
        bookingDate: 1,
        bookingTime: 1,
        createdAt: 1,
      })
      .lean();

    // Post-sort: prioritize unassigned, then by loyalty tier
    const tierPriority = { Platinum: 0, Gold: 1, Silver: 2, Bronze: 3 };
    const statusPriority = { confirmed: 0, assigned: 1, received: 2, in_progress: 3 };

    orders.sort((a, b) => {
      // Unassigned first
      const aAssigned = a.assignedDetailer ? 1 : 0;
      const bAssigned = b.assignedDetailer ? 1 : 0;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;

      // Status priority
      const aStat = statusPriority[a.status] ?? 9;
      const bStat = statusPriority[b.status] ?? 9;
      if (aStat !== bStat) return aStat - bStat;

      // Loyalty tier (higher tier = higher priority)
      const aTier = tierPriority[a.customer?.loyaltyTier] ?? 9;
      const bTier = tierPriority[b.customer?.loyaltyTier] ?? 9;
      return aTier - bTier;
    });

    return res.json({
      success: true,
      count: orders.length,
      data: orders.map((o) => formatBookingDto(o)),
    });
  } catch (error) {
    next(error);
  }
};
