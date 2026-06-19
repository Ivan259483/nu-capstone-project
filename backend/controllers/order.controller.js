import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import Service from '../models/service.model.js';
import Vehicle from '../models/vehicle.model.js';
import User from '../models/user.model.js';
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
import { createCustomerStageNotification } from '../utils/customerStageNotifications.utils.js';
import { logActivity } from '../utils/logActivity.utils.js';
import { onOrderStatusChange } from '../utils/workflow.utils.js';
import { decrypt } from '../utils/encryption.utils.js';
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
  getDateAvailabilitySnapshot,
  isSlotConsumingStatus,
  normalizeBookingDate,
  normalizeBookingTime,
  releaseBookingSlot,
  reserveBookingSlot,
  syncBookingSlotCounter,
  validateSlotAvailability,
} from '../services/slot.service.js';

const DEFAULT_SERVICE_STEPS = [
  { name: 'Initial Wash & Prep', status: 'pending' },
  { name: 'Surface Decontamination', status: 'pending' },
  { name: 'Main Service Execution', status: 'pending' },
  { name: 'Quality Inspection', status: 'pending' },
  { name: 'Customer Handover Ready', status: 'pending' }
];

const LOW_STOCK_THRESHOLD = 10;

const SIGNED_URL_QUERY_REGEX = /(X-Amz-Signature|Signature|sig|signed)=/i;
const isDataUrl = (value = '') => typeof value === 'string' && value.startsWith('data:');
const isSignedUrl = (value = '') =>
  typeof value === 'string' &&
  (value.startsWith('https://') || value.startsWith('s3://')) &&
  SIGNED_URL_QUERY_REGEX.test(value);

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
      // Live tracking fields (QC-controlled)
      serviceTrackingStage: order.serviceTrackingStage || null,
      serviceStaffAssignments: order.serviceStaffAssignments || [],
      trackerStageMedia: order.trackerStageMedia || [],
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
    await Notification.create({
      title,
      message,
      type: 'inventory',
      recipientRole: 'admin_family',
      link: '/admin/inventory',
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

const emitCustomerNotification = (customerId, notification) => {
  try {
    if (!customerId) return;
    const io = getIO();
    io.to(`user:${customerId.toString()}`).emit('notification:customer', notification);
  } catch (error) {
    console.warn('Socket not initialized for customer notification:', error.message);
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
  const hex = Math.random().toString(16).substring(2, 6).toUpperCase();
  return `ASPF-${yy}${mm}${dd}-${hex}`;
};

const BOOKING_LIST_DEFAULT_LIMIT = 50;
const BOOKING_LIST_MAX_LIMIT = 100;
const ENCRYPTED_FIELD_PATTERN = /^[0-9a-f]{32}:[0-9a-f]+$/i;

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
  if (!ENCRYPTED_FIELD_PATTERN.test(val)) return val;
  try {
    return decrypt(val);
  } catch {
    return val;
  }
};

const getOrderIdentity = (order) => ({
  id: order._id?.toString?.() || order.id,
  customerId: typeof order.customer === 'object'
    ? (order.customer?._id?.toString?.() || order.customer?.id)
    : (order.customer?.toString?.() || order.customer),
});

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
  const safeDecrypt = (val) => {
    if (!val || typeof val !== 'string') return val;
    // Encrypted format is "hex:hex" — 32+ chars of hex with a colon separator
    if (ENCRYPTED_FIELD_PATTERN.test(val)) {
      try { return decrypt(val); } catch { return val; }
    }
    return val;
  };

  const decryptedNotes = safeDecrypt(order.notes);
  const decryptedPlate = safeDecrypt(order.vehiclePlate);

  // decrypt() returns ciphertext unchanged when keys cannot decode (legacy DB rows).
  // Never expose that blob as a human-readable plate in API responses.
  const couldNotDecryptPlate = ENCRYPTED_FIELD_PATTERN.test(String(decryptedPlate || ''));
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
    hasPaymentProof: Boolean(order.paymentProofUrl || order.downpaymentProof || order.status === 'pending_confirmation'),
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
  const couldNotDecryptPlate = ENCRYPTED_FIELD_PATTERN.test(String(decryptedPlate || ''));
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
    amountCollected: order.amountCollected,
    totalAmount: order.totalAmount,
    totalPrice: order.totalPrice,
    downPaymentAmount: order.downPaymentAmount,
    finalPaymentAmount: order.finalPaymentAmount,
    invoiceId: order.invoiceId,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    paymentProvider: order.paymentProvider,
    paidAt: order.paidAt,
    approvedAt: order.approvedAt,
    rejectedAt: order.rejectedAt,
    rejectionReason: order.rejectionReason,
    status: order.status,
    customerStatus: order.customerStatus,
    customerStatusUpdatedAt: order.customerStatusUpdatedAt,
    hasPaymentProof: Boolean(order.paymentProofUrl || order.downpaymentProof || order.status === 'pending_confirmation'),
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
    date: order.date || order.bookingDate || '',
    time: order.time || order.bookingTime || '',
    notes: decryptedNotes || '',
    assignedDetailer: order.assignedDetailer,
    serviceTrackingStage: order.serviceTrackingStage || null,
    serviceTrackingUpdatedAt: order.serviceTrackingUpdatedAt || null,
    serviceTrackingUpdatedBy: order.serviceTrackingUpdatedBy || null,
    serviceStaffAssignments: order.serviceStaffAssignments || [],
    latestPayment: order.latestPayment || null,
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

  const receiptOrderIds = orderRows
    .filter((order) => order?.paymentStatus === 'paid' || order?.invoiceId)
    .map((order) => order?._id)
    .filter(Boolean);
  const customerIds = [...new Set(orderRows.map((order) => idFromReference(order?.customer)).filter(Boolean))];
  const vehicleIds = [...new Set(orderRows.map((order) => idFromReference(order?.vehicle)).filter(Boolean))];

  const [payments, invoices, customers, vehicles] = await Promise.all([
    receiptOrderIds.length
      ? Payment.find({
          order: { $in: receiptOrderIds },
          status: 'succeeded',
        })
          .select(
            '_id order invoiceId items subtotal discount discountAmount taxVatAmount additionalFees ' +
            'downpayment grandTotal amount amountPaid balanceRemaining method status staffAssigned createdAt'
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
  for (const payment of payments) {
    const key = String(payment.order || '');
    if (key && !latestPaymentByOrder.has(key)) latestPaymentByOrder.set(key, payment);
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

function sameSlotPair(a, b) {
  return Boolean(a && b && a.date === b.date && a.time === b.time);
}

async function releaseOrderSlotIfConsumed(orderLike) {
  if (!orderLike || !isSlotConsumingStatus(orderLike.status)) return;
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
      });
    }

    const LEGACY_FULL_DAY_SLOT_LIST = [
      '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
      '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM',
      '4:00 PM', '5:00 PM',
    ];

    const structuredSlots = Array.isArray(snapshot.slots) ? snapshot.slots : [];
    const fullSlotLabels = structuredSlots
      .filter((slot) => slot.status === 'FULL')
      .map((slot) => slot.label || slot.time)
      .filter(Boolean);

    const bookedSlots = snapshot.unavailable && structuredSlots.length === 0
      ? LEGACY_FULL_DAY_SLOT_LIST
      : fullSlotLabels;

    return res.json({
      success: true,
      bookedSlots, // Legacy clients: now contains only times that are actually full
      slots: structuredSlots,
      unavailable: !!snapshot.unavailable,
      errorCode: snapshot.errorCode || null,
      message: snapshot.message || null,
      error: snapshot.error || null,
      bookedCount: snapshot.bookedCount ?? 0,
      slotsLimit: snapshot.slotsLimit ?? null,
      remaining: snapshot.remaining ?? null,
      totalCapacity: snapshot.totalCapacity ?? null,
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
      $or: [
        { customerName: { $in: [null, ''] } },
        { serviceType: { $in: [null, ''] } }
      ]
    };

    const result = await Order.updateMany(staleQuery, {
      $set: {
        archived: true,
        archivedAt: new Date(),
        archivedReason: 'stale_booking_cleanup',
        status: 'cancelled'
      }
    });

    res.json({
      success: true,
      archived: result.modifiedCount || result.nModified || 0
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
    const order = await Order.findById(req.params.id)
      .select(ORDER_TRACKER_MEDIA_SELECT_FIELDS)
      .lean();

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

    res.json({
      success: true,
      data: {
        id: order._id?.toString?.() || String(order._id),
        status: order.status,
        paymentStatus: order.paymentStatus || null,
        serviceTrackingStage: order.serviceTrackingStage || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
        trackerStageMedia: Array.isArray(order.trackerStageMedia) ? order.trackerStageMedia : [],
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

    res.json({
      success: true,
      data: formatBookingDto(orderWithReceipt),
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

    const dto = formatBookingDto(order);

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
    const order = await Order.findById(req.params.id)
      .select('customer assignedDetailer downpaymentProof paymentProofUrl status archived')
      .lean();

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

    const downpaymentProof = order.downpaymentProof || null;
    const paymentProofUrl = order.paymentProofUrl || null;

    res.json({
      success: true,
      data: { downpaymentProof, paymentProofUrl },
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
  try {
    // Controller-Level Authorization Guard
    if (!req.user || !req.user.id || !req.user.role) {
        return res.status(401).json({ 
            success: false, 
            message: 'Not authorized - Invalid or missing user session' 
        });
    }

    console.log('📝 [CREATE_ORDER] Request Body:', req.body);

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
      paymentProofUrl: paymentProofUrlInput
    } = req.body;


    // Always trust the authenticated user for customer bookings.
    // Only admins can create bookings on behalf of another customer.
    const requestedCustomerId = customerInput || customerIdInput;
    const resolvedCustomerId =
      isBookingManagerRole(req.user.role) && requestedCustomerId && mongoose.Types.ObjectId.isValid(requestedCustomerId)
        ? requestedCustomerId
        : req.user.id;

    let fallbackCustomerName = (typeof customerNameInput === 'string' && customerNameInput.trim())
      || req.user?.name
      || '';
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
    let finalTotalAmount = 0;
    let finalTotalPrice = Number.isFinite(normalizedTotalPriceInput) ? normalizedTotalPriceInput : undefined;
    let finalServiceType = fallbackServiceType;
    let resolvedServiceId = mongoose.Types.ObjectId.isValid(serviceId) ? serviceId : undefined;
    let finalVehicleData = {
        vehicleYear,
        vehicleMake,
        vehicleModel,
        vehicleColor,
        vehiclePlate
    };

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

        // 2. Fetch Vehicle details (best-effort)
        let vehicle = null;
        if (mongoose.Types.ObjectId.isValid(vehicleId)) {
            vehicle = await Vehicle.findById(vehicleId);
        }

        const servicePrice = normalizeCurrency(service.basePrice);

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
        if (vehicle) {
            finalVehicleData = {
                vehicleYear: vehicle.year,
                vehicleMake: vehicle.make,
                vehicleModel: vehicle.model,
                vehicleColor: vehicle.color,
                vehiclePlate: vehicle.plateNumber
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
          finalItems = [{
            quantity: 1,
            price: normalizedTotalPriceInput,
          }];
          finalTotalAmount = normalizedTotalPriceInput;
          finalTotalPrice = normalizedTotalPriceInput;
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
      return proof || undefined;
    })();

    if (isCustomerRole(req.user.role) && !resolvedPaymentProof) {
      return res.status(400).json({
        success: false,
        errorCode: 'PAYMENT_PROOF_REQUIRED',
        message: 'Upload a GCash payment proof before submitting your booking.',
        error: 'Upload a GCash payment proof before submitting your booking.',
      });
    }

    // ── Atomic slot reservation (dynamic — reads current availability rules) ─
    if (bookingDate && bookingTime) {
      const slotCheck = await reserveBookingSlot(bookingDate, bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    // ── Create Order ──────────────────────────────────────────────────
    const order = new Order({
      orderNumber: `ORD-${Date.now()}`,
      bookingReference: generateBookingReference(),
      customer: resolvedCustomerId,
      vehicle: mongoose.Types.ObjectId.isValid(vehicleId) ? vehicleId : null,
      customerName: fallbackCustomerName,
      customerPhone: resolvedCustomerPhone,
      serviceId: resolvedServiceId,
      serviceType: finalServiceType,
      items: finalItems,
      totalAmount: finalTotalAmount,
      totalPrice: safeTotalPrice,
      status: initialStatus, // 'pending_confirmation' — awaits sales approval
      shippingAddress,
      notes,
      ...finalVehicleData,
      bookingDate,
      bookingTime,
      downpaymentProof: resolvedPaymentProof,
      paymentProofUrl: resolvedPaymentProof,
    });

    const checklist = generateOperationsChecklist(finalServiceType);
    order.operationsChecklist = checklist;
    // ⚠️ Technician assignment is intentionally deferred until Sales APPROVES the booking.
    // Auto-assign was removed to prevent unconfirmed bookings entering the service queue.

    await order.save();
    reservedSlot = null;

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

    const orderIdForSideEffects = order._id;
    const orderNumberForSideEffects = order.orderNumber;
    const bookingRefForSideEffects = order.bookingReference;
    const customerRef = order.customer;
    const hasReservationProof = Boolean(resolvedPaymentProof);
    setImmediate(() => {
      void (async () => {
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
      })();
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingSlot(reservedSlot.date, reservedSlot.time);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after createOrder failure:', releaseError.message);
      }
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

    const isValidSignature = isDataUrl(waiverSignature) || isSignedUrl(waiverSignature);
    if (!isValidSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid waiver signature format. Use base64 data URL or a signed URL.'
      });
    }
    if (waiverPdf) {
      const isValidPdf = isDataUrl(waiverPdf) || isSignedUrl(waiverPdf);
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
    if (order.assignedDetailer && preServiceCount >= 2) {
      order.status = 'in-progress';
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
        io.emit('waiver:signed', {
          orderId: order._id,
          customerName,
          signedAt: order.legalCompliance.waiverSignedAt,
        });
      }
    } catch (notifyError) {
      console.error('Failed to notify waiver signature:', notifyError.message);
    }

    res.json({ success: true, data: order });
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

    const invalidPhoto = preServicePhotos.find((url) => !isSignedUrl(url) && !isDataUrl(url));
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

    if (order.legalCompliance?.waiverSignature && mergedPhotos.length >= 2) {
      order.status = 'in-progress';
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

    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;
    const previousSlot = getOrderSlotPair(order);
    const previousConsumedSlot = isSlotConsumingStatus(previousStatus);

    // ── Anti-Double Booking Validation (Update) ─────────────────────
    const newDate = req.body.bookingDate || order.bookingDate;
    const newTime = req.body.bookingTime || order.bookingTime;
    const nextStatus = req.body.status || order.status;
    const nextSlot = getNormalizedSlotPair(newDate, newTime);
    const nextConsumesSlot = isSlotConsumingStatus(nextStatus);

    if (
      newDate &&
      newTime &&
      nextConsumesSlot &&
      (!previousConsumedSlot || !sameSlotPair(previousSlot, nextSlot))
    ) {
      const slotCheck = await reserveBookingSlot(newDate, newTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck, 'DATE_UNAVAILABLE'),
        });
      }
      reservedSlot = slotCheck;
    }
    // ────────────────────────────────────────────────────────────────

    // Update fields
    Object.assign(order, req.body);
    await order.save();
    if (previousStatus !== order.status || previousPaymentStatus !== order.paymentStatus) {
      await evaluateReadyForPickupQueueEligibility(order, {
        persist: true,
        emit: true,
        notify: true,
      });
    }
    reservedSlot = null;

    if (
      previousConsumedSlot &&
      previousSlot &&
      (!isSlotConsumingStatus(order.status) || !sameSlotPair(previousSlot, getOrderSlotPair(order)))
    ) {
      await releaseBookingSlot(previousSlot.date, previousSlot.time);
    }

    // ── Fire real-time events when payment is marked paid ─────────────────
    const paymentJustMarkedPaid =
      previousPaymentStatus !== 'paid' && order.paymentStatus === 'paid';

    if (paymentJustMarkedPaid) {
      // 1. Push live status update to the customer's socket room
      emitCustomerStatusUpdate(order);

      // 2. Create a persistent Notification for the customer
      try {
        const customerId =
          typeof order.customer === 'object' ? order.customer?._id : order.customer;
        if (customerId) {
          const createdNotification = await Notification.create({
            title: 'Payment Received ✓',
            message: `Your booking ${order.orderNumber || order._id} is confirmed and paid. Your detailer will be assigned shortly.`,
            type: 'payment',
            recipientRole: 'customer',
            recipientUserId: customerId,
            link: '/customer/dashboard?tab=tracking',
            metadata: {
              orderId: order._id,
              customerId: customerId.toString(),
            },
          });
          // 3. Push real-time notification to customer socket
          emitCustomerNotification(customerId, {
            id: createdNotification._id,
            title: createdNotification.title,
            message: createdNotification.message,
            type: createdNotification.type,
            isRead: createdNotification.isRead,
            createdAt: createdNotification.createdAt,
            link: createdNotification.link,
          });
        }
      } catch (notifyError) {
        console.error('Failed to create payment notification:', notifyError.message);
      }

      // 4. Notify admin panel (refreshes calendar dot color via optimistic update)
      emitAdminNotification({
        title: 'Payment Updated',
        message: `Booking ${order.orderNumber || order._id} marked as paid.`,
        type: 'payment',
      });
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

    if (previousStatus !== order.status && order.status === 'confirmed') {
      try {
        const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
        if (customerId) {
          const createdNotification = await Notification.create({
            title: 'Booking Confirmed',
            message: `Your booking ${order.orderNumber || order._id} is confirmed.`,
            type: 'booking',
            recipientRole: 'customer',
            recipientUserId: customerId,
            link: '/customer/dashboard?tab=bookings',
            metadata: {
              orderId: order._id,
              customerId: customerId.toString(),
            },
          });
          emitCustomerNotification(customerId, {
            id: createdNotification._id,
            title: createdNotification.title,
            message: createdNotification.message,
            type: createdNotification.type,
            isRead: createdNotification.isRead,
            createdAt: createdNotification.createdAt,
            link: createdNotification.link,
          });
        }
      } catch (notifyError) {
        console.error('Failed to notify customer booking confirmation:', notifyError.message);
      }
    }

    res.json({
      success: true,
      message: 'Order updated successfully',
      data: order,
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingSlot(reservedSlot.date, reservedSlot.time);
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

    // Check ownership or admin status
    if (!order.customer || (order.customer.toString() !== req.user.id && !isBookingManagerRole(req.user.role))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can only delete your own bookings',
      });
    }

    logActivity({
      req, type: 'booking_cancelled', module: 'Booking', action: 'Booking Deleted',
      description: `${req.user?.name || 'User'} deleted booking ${order.orderNumber || order._id}.`,
      status: 'warning', referenceId: order.orderNumber,
      metadata: { orderId: order._id },
    });

    await Order.findByIdAndDelete(req.params.id);
    await releaseOrderSlotIfConsumed(order);

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

    // (Restriction removed: Detailers can have multiple scheduled active bookings)

    const order = await Order.findById(req.params.id).populate('customer', 'name email avatar');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const previousStatus = order.status;
    const previousPaymentStatus = order.paymentStatus;

    // Perform assignment
    order.assignedDetailer = detailerId;
    if (['pending', 'confirmed'].includes(order.status)) {
      order.status = 'assigned';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    // Optionally mark as paid as part of the same transaction
    if (isMarkPaid) {
      order.paymentStatus = 'paid';
      order.paidAt = order.paidAt || new Date();
      order.paymentMethod = paymentMethod || order.paymentMethod || 'manual';
      order.paymentProvider = order.paymentProvider || 'admin';
      if (!order.invoiceId) {
        order.invoiceId = `INV-${Date.now()}`;
      }
      if (['pending', 'confirmed'].includes(order.status)) {
        order.status = 'assigned';
      }
    }

    await order.save();
    await order.populate('assignedDetailer', 'name email');

    // Push live status update to the customer
    emitCustomerStatusUpdate(order);

    // Trigger workflow orchestrator for status transition
    if (previousStatus !== order.status) {
      onOrderStatusChange(order, previousStatus, req.user).catch(err =>
        console.error('[WORKFLOW] Orchestrator error in assignDetailerAndMarkPaid:', err.message)
      );
    }

    // Create unified customer notification that a detailer is assigned
    try {
      const customerId = typeof order.customer === 'object' ? order.customer?._id : order.customer;
      if (customerId) {
        const notification = await Notification.create({
          title: 'Detailer Assigned',
          message: 'Your detailer has been assigned and is working on your car! Please check Live Tracking to track your vehicle\'s progress.',
          type: 'booking',
          recipientRole: 'customer',
          recipientUserId: customerId,
          link: '/customer/dashboard?tab=tracking',
          metadata: {
            orderId: order._id,
            customerId: customerId.toString(),
            assignedDetailer: order.assignedDetailer,
            paymentStatus: order.paymentStatus,
          },
        });

        emitCustomerNotification(customerId, {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          link: notification.link,
        });
      }
    } catch (notifyError) {
      console.error('Failed to send detailer-assigned notification:', notifyError.message);
    }

    // If payment status just transitioned to paid, emit admin notification
    if (previousPaymentStatus !== 'paid' && order.paymentStatus === 'paid') {
      emitAdminNotification({
        title: 'Payment Updated',
        message: `Booking ${order.orderNumber || order._id} marked as paid (via admin).`,
        type: 'payment',
      });
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
    order.assignedDetailer = detailerId;
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
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check if user is the assigned detailer or admin
    if (isServiceStaffRole(req.user.role) && 
       (!order.assignedDetailer || order.assignedDetailer.toString() !== req.user.id)) {
        return res.status(403).json({ success: false, message: 'Access denied: Not assigned to this order' });
    }

    const wantsInProgress = orderStatus === 'in-progress';
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
    if (orderStatus) {
        order.status = orderStatus;
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
      orderStatus === 'completed' ||
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

    await order.save();

    if (isSlotConsumingStatus(previousStatus) && !isSlotConsumingStatus(order.status)) {
      await releaseBookingSlot(order.bookingDate, order.bookingTime);
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
    console.log('📋 [DETAILER_ORDERS] Fetching for detailer:', req.user.id, req.user.name || req.user.email);

    // Only return jobs explicitly assigned to this detailer
    // Jobs must be in actionable states: assigned, received, in_progress, completed
    const orders = await Order.find({
      archived: { $ne: true },
      assignedDetailer: req.user.id,
      status: { $in: ['assigned', 'received', 'in_progress', 'completed'] },
    })
      .populate('customer', 'name email phone avatar')
      .populate('assignedDetailer', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    console.log('📋 [DETAILER_ORDERS] Total orders returned:', orders.length);
    console.log('📋 [DETAILER_ORDERS] Breakdown:', {
      assigned: orders.filter(o => o.status === 'assigned').length,
      received: orders.filter(o => o.status === 'received').length,
      in_progress: orders.filter(o => o.status === 'in_progress').length,
      completed: orders.filter(o => o.status === 'completed').length,
      statuses: [...new Set(orders.map(o => o.status))],
    });

    res.json({ success: true, data: orders.map(o => formatBookingDto(o)) });
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
      data: order 
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

    await order.save();
    if (isSlotConsumingStatus(previousStatus) && !isSlotConsumingStatus(order.status)) {
      await releaseBookingSlot(order.bookingDate, order.bookingTime);
    }

    // Fire exact real-time payload socket for customers and admins immediately to reduce syncing delay
    import('../socket.js').then((socketModule) => {
      const io = socketModule.getIO();
      if (io) io.emit('orderUpdated', { orderId: order._id, status: order.status, workflowStep: order.workflow?.currentStep });
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

    if (!['pending', 'confirmed', 'assigned'].includes(order.status)) {
      return res.status(400).json({ success: false, message: `Cannot check-in order in '${order.status}' status. Order must be confirmed or assigned first.` });
    }

    const previousStatusForWorkflow = order.status;
    if (!isSlotConsumingStatus(previousStatusForWorkflow) && order.bookingDate && order.bookingTime) {
      const slotCheck = await reserveBookingSlot(order.bookingDate, order.bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    const totalPrice = order.totalPrice || 0;
    const minDownPayment = totalPrice * 0.3;
    if (totalPrice > 0 && downPaymentAmount < minDownPayment) {
      return res.status(400).json({ success: false, message: `Down payment must be at least 30% (₱${minDownPayment.toFixed(2)})` });
    }

    order.downPaymentAmount = downPaymentAmount;
    if (paymentMethod) {
      order.paymentMethod = paymentMethod;
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
    await order.save();
    reservedSlot = null;
    emitBookingApprovalQueueUpdate(order);

    const io = getIO();
    io.emit('orderUpdated', { orderId: order._id, status: order.status });

    // Trigger workflow orchestrator
    onOrderStatusChange(order, previousStatusForWorkflow, req.user).catch(err =>
      console.error('[WORKFLOW] Orchestrator error in operateCheckIn:', err.message)
    );
    
    logActivity({
      req,
      type: 'status_change',
      module: 'Booking',
      action: 'ORDER_CHECKIN',
      description: `Order checked in. Down payment: ₱${downPaymentAmount}. Method: ${paymentMethod || 'N/A'}.`,
      referenceId: order._id,
    });

    res.json({ success: true, data: order });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingSlot(reservedSlot.date, reservedSlot.time);
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
    const order = await Order.findById(id);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.status !== 'received') {
       return res.status(400).json({ message: `Cannot start service — vehicle must be checked in first. Current status: '${order.status}'.` });
    }

    const prevStatus = order.status;
    order.status = 'in_progress';
    await order.save();

    getIO().emit('orderUpdated', { orderId: order._id, status: order.status });

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
    await order.save();
    if (isSlotConsumingStatus(prevQCStatus) && !isSlotConsumingStatus(order.status)) {
      await releaseBookingSlot(order.bookingDate, order.bookingTime);
    }

    getIO().emit('orderUpdated', { orderId: order._id, status: order.status });

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
    const { finalPaymentAmount } = req.body;
    const order = await Order.findById(id);

    if (!order) return res.status(404).json({ message: 'Order not found' });
    // Allow 'received', 'in_progress', 'completed' to move to 'paid' early if they want, but typically 'completed'
    if (['pending', 'confirmed', 'released', 'cancelled'].includes(order.status)) {
       return res.status(400).json({ message: `Cannot pay order in ${order.status} status` });
    }

    const prevPayStatus = order.status;

    // Usually remaining balance = total - downpayment
    order.finalPaymentAmount = finalPaymentAmount;
    order.paymentStatus = 'paid';
    order.paidAt = new Date();
    order.status = 'paid';
    
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

    await order.save();
    if (isSlotConsumingStatus(prevPayStatus) && !isSlotConsumingStatus(order.status)) {
      await releaseBookingSlot(order.bookingDate, order.bookingTime);
    }

    getIO().emit('orderUpdated', { orderId: order._id, status: order.status, paymentStatus: 'paid' });

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

    getIO().emit('orderUpdated', { orderId: order._id, status: order.status });

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

    // If admin assigns a technician during confirmation, go straight to 'assigned'
    const { assignedDetailer } = req.body || {};
    if (!isSlotConsumingStatus(previousStatus) && order.bookingDate && order.bookingTime) {
      const slotCheck = await reserveBookingSlot(order.bookingDate, order.bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    if (assignedDetailer) {
      order.assignedDetailer = assignedDetailer;
      order.status = 'assigned';
    } else {
      order.status = 'confirmed';
    }

    // Initialize default service steps if empty
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(step => ({ ...step }));
    }

    await order.save();
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
        await releaseBookingSlot(reservedSlot.date, reservedSlot.time);
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
    const { paymentProofUrl } = req.body;

    if (!paymentProofUrl) {
      return res.status(400).json({ success: false, message: 'Payment proof image is required' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Must belong to the customer (authorization checked via middleware, but double check here)
    const customerId = order.customer?.toString?.();
    const userId = (req.user.id || req.user._id)?.toString?.();
    if (customerId !== userId && !isFullAdminRole(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized to upload proof for this booking' });
    }

    const allowedProofStatuses = ['pending_confirmation', 'rejected'];
    if (!allowedProofStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot upload payment proof while booking is '${order.status}'. Use this only when waiting for confirmation or after a rejected payment.`,
      });
    }

    const previousStatus = order.status;
    if (!isSlotConsumingStatus(previousStatus) && order.bookingDate && order.bookingTime) {
      const slotCheck = await reserveBookingSlot(order.bookingDate, order.bookingTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    // Save proof and return to sales queue (clear rejection metadata on resubmit)
    order.paymentProofUrl = paymentProofUrl;
    order.status = 'pending_confirmation';
    order.rejectionReason = null;
    order.rejectedAt = null;
    order.rejectedBy = null;
    await order.save();
    reservedSlot = null;

    emitBookingApprovalQueueUpdate(order);

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
      data: order,
    });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingSlot(reservedSlot.date, reservedSlot.time);
      } catch (releaseError) {
        console.error('[SLOT_RELEASE_ERROR] Failed to release slot after uploadPaymentProof failure:', releaseError.message);
      }
    }
    console.error('Error uploading payment proof:', error);
    res.status(500).json({ success: false, message: 'Failed to upload payment proof' });
  }
};

export const approveBooking = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('customer', 'name email avatar');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'pending_confirmation') {
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

    // ── Re-validate slot capacity before approving ────────────────────
    // NOTE: We pass order._id to EXCLUDE this booking from the count —
    // it is still 'pending_confirmation' so it would falsely appear as
    // occupying a slot and block its own approval.
    if (order.bookingDate && order.bookingTime) {
      await syncBookingSlotCounter(order.bookingDate, order.bookingTime);
      const slotCheck = await validateSlotAvailability(order.bookingDate, order.bookingTime, order._id);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
    }

    const previousStatus = order.status;
    const { assignedDetailer: manualDetailerId } = req.body || {};
    let detailerId = manualDetailerId;

    if (!detailerId) {
      // Priority: staff_quality_checker (Technician - Quality Checker) → technician → service_staff
      // This matches the business flow: Quality Checker handles bookings from Live Tracker
      const ASSIGNABLE_ROLES = ['staff_quality_checker'];
      let detailers = [];
      for (const role of ASSIGNABLE_ROLES) {
        detailers = await User.find({ role, isActive: true }).select('_id name role');
        if (detailers.length > 0) break; // Use highest-priority role that has active staff
      }
      for (const d of detailers) {
        const busy = await Order.findOne({ assignedDetailer: d._id, status: { $in: ['confirmed', 'received', 'in_progress'] } });
        if (!busy) { detailerId = d._id; break; }
      }
    }

    order.status = detailerId ? 'confirmed' : 'approved';
    order.approvedAt = new Date();
    order.approvedBy = req.user.id;
    if (detailerId) order.assignedDetailer = detailerId;
    if (!order.serviceSteps || order.serviceSteps.length === 0) {
      order.serviceSteps = DEFAULT_SERVICE_STEPS.map(s => ({ ...s }));
    }

    // ── Activate Live Tracker — Step 1: "Appointment Confirmed" ──────
    // Setting serviceTrackingStage = 'confirmed' triggers the customer's
    // live tracker to become active, showing "Appointment Confirmed" as
    // the first completed step. The QC Checker will advance it from here.
    order.serviceTrackingStage = 'confirmed';
    order.serviceTrackingUpdatedAt = new Date();
    order.serviceTrackingUpdatedBy = req.user?.name || 'Sales';

    await order.save();

    // ── Clean up GCash proof images from DB after approval ────────────
    // Base64 images can be 200–500KB each. Once approved, the proof is no
    // longer needed and keeping it causes document bloat that can slow
    // queries and eventually crash the app. We $unset them atomically.
    await Order.updateOne(
      { _id: order._id },
      { $unset: { downpaymentProof: '', paymentProofUrl: '' } }
    );
    emitBookingApprovalQueueUpdate(order);

    emitCustomerStatusUpdate(order);

    // Emit booking_updated for calendar real-time refresh
    try {
      const io = getIO();
      if (io && order.bookingDate) {
        io.emit('booking_updated', { date: order.bookingDate, orderId: order._id.toString(), status: order.status });
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
    const order = await Order.findById(req.params.id).populate('customer', 'name email avatar');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'pending_confirmation') {
      return res.status(400).json({ success: false, message: `Cannot reject booking with status '${order.status}'.` });
    }

    const { reason = 'Payment proof could not be verified.' } = req.body || {};
    order.status = 'rejected';
    order.rejectedAt = new Date();
    order.rejectedBy = req.user.id;
    order.rejectionReason = reason;
    await order.save();
    await releaseBookingSlot(order.bookingDate, order.bookingTime);

    // ── Clean up GCash proof images from DB after rejection ───────────
    // No longer needed once a decision has been made.
    await Order.updateOne(
      { _id: order._id },
      { $unset: { downpaymentProof: '', paymentProofUrl: '' } }
    );
    emitBookingApprovalQueueUpdate(order);

    // Emit booking_updated for calendar real-time refresh
    try {
      const io = getIO();
      if (io && order.bookingDate) {
        io.emit('booking_updated', { date: order.bookingDate, orderId: order._id.toString(), status: 'rejected' });
      }
    } catch (_) {}

    try {
      const customerId = typeof order.customer === 'object'
        ? order.customer?._id : order.customer;
      const notif = await Notification.create({
        title: '❌ Appointment Not Approved',
        message: `Your booking was not approved. Reason: ${reason}. Please book again with a valid payment proof.`,
        type: 'warning',
        recipientUserId: customerId,
        metadata: { orderId: order._id, orderNumber: order.orderNumber }
      });
      try {
        const io = getIO();
        io.to(`user:${customerId.toString()}`).emit('notification:customer', {
          id: notif._id, title: notif.title, message: notif.message,
          type: notif.type, isRead: false, createdAt: notif.createdAt,
        });
      } catch (_) {}
    } catch (_) {}

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

    // Allow only APPROVED, QUEUED, pending_confirmation, confirmed
    const allowedStatuses = ['approved', 'queued', 'pending_confirmation', 'confirmed', 'assigned'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({ 
        success: false, 
        message: `Cannot reschedule booking with status '${order.status}'.` 
      });
    }

    const oldDate = order.bookingDate;
    const oldTime = order.bookingTime;
    const oldSlot = getOrderSlotPair(order);
    const newSlot = getNormalizedSlotPair(newDate, newTime);

    if (!sameSlotPair(oldSlot, newSlot)) {
      const slotCheck = await reserveBookingSlot(newDate, newTime);
      if (!slotCheck.ok) {
        return res.status(409).json({
          ...slotErrorResponsePayload(slotCheck),
        });
      }
      reservedSlot = slotCheck;
    }

    order.bookingDate = newDate;
    order.bookingTime = newTime;
    await order.save();
    reservedSlot = null;

    if (oldSlot && !sameSlotPair(oldSlot, newSlot)) {
      await releaseBookingSlot(oldSlot.date, oldSlot.time);
    }

    // Emit socket event
    try {
      const io = getIO();
      if (io) {
        io.emit('booking_updated', {
          date: newDate,
          previousDate: oldDate,
          orderId: order._id.toString(),
          type: 'RESCHEDULE'
        });
      }
    } catch (_) {}

    logActivity({ 
      req, type: 'status_change', module: 'Booking', action: 'BOOKING_RESCHEDULED',
      description: `${req.user?.name} rescheduled booking ${order.orderNumber} to ${newDate} ${newTime}.`, 
      status: 'success',
      referenceId: order.orderNumber, 
      metadata: { orderId: order._id, oldDate, oldTime, newDate, newTime } 
    });

    return res.json({ success: true, message: 'Booking rescheduled successfully.', data: formatBookingDto(order) });
  } catch (error) {
    if (reservedSlot) {
      try {
        await releaseBookingSlot(reservedSlot.date, reservedSlot.time);
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
