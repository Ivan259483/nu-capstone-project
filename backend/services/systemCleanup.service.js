import crypto from 'node:crypto';
import mongoose from 'mongoose';
import AccountSetupToken from '../models/accountSetupToken.model.js';
import AIServiceRequest from '../models/aIServiceRequest.model.js';
import AIScan from '../models/aiScan.model.js';
import ActivityLog from '../models/activityLog.model.js';
import Billing from '../models/billing.model.js';
import BookingSlotCounter from '../models/bookingSlotCounter.model.js';
import ChatConversation from '../models/chatConversation.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ChatSession from '../models/chatSession.model.js';
import Customer from '../models/customer.model.js';
import ExternalCleanupJob from '../models/externalCleanupJob.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import ManagedAsset from '../models/managedAsset.model.js';
import Notification from '../models/notification.model.js';
import NotificationUserState from '../models/notificationUserState.model.js';
import OTP from '../models/oTP.model.js';
import Order from '../models/order.model.js';
import Payment from '../models/payment.model.js';
import PaymentReconciliationEvent from '../models/paymentReconciliationEvent.model.js';
import Product from '../models/product.model.js';
import QualityNotificationRetry from '../models/qualityNotificationRetry.model.js';
import Service from '../models/service.model.js';
import StaffVerificationIssuance from '../models/staffVerificationIssuance.model.js';
import StaffVerificationToken from '../models/staffVerificationToken.model.js';
import Store from '../models/store.model.js';
import Supplier from '../models/supplier.model.js';
import SupplierOrder from '../models/supplierOrder.model.js';
import SystemBackup from '../models/systemBackup.model.js';
import SystemBootstrapOperation from '../models/systemBootstrapOperation.model.js';
import SystemDataClassification from '../models/systemDataClassification.model.js';
import SystemOperation from '../models/systemOperation.model.js';
import User from '../models/user.model.js';
import Vehicle from '../models/vehicle.model.js';
import { waitForInFlightMutations } from '../middleware/systemLifecycle.middleware.js';
import { clearResponseCache } from '../utils/responseCache.utils.js';
import { processDueExternalCleanupJobs } from './systemExternalCleanup.service.js';
import {
  computeDataFingerprint,
  findUnmanagedAssetReferences,
  getVerifiedBackupForFingerprint,
} from './systemBackup.service.js';
import {
  DEMO_OPERATIONAL_ACTIVITY_TYPES,
  OPERATIONAL_ROOTS,
  getClassificationSummary,
  getClassifiedDocumentIds,
  reconcileNewOperationalClassifications,
} from './systemClassification.service.js';
import {
  DESTRUCTIVE_TRANSACTION_LEASE_MS,
  SystemManagementError,
  acquireSystemMutationLease,
  assertProtectedAdministrator,
  buildInventoryBaselineMetadata,
  getSystemState,
  incrementGlobalSessionEpoch,
  incrementOperationalDataEpoch,
  releaseSystemMutationLease,
  renewSystemMutationLease,
  updateLifecycleState,
} from './systemState.service.js';

const PREVIEW_TTL_MS = 15 * 60 * 1000;
const SAFE_BACKUP_SKIP_CATEGORIES = new Set(['notifications', 'rewards', 'activity', 'ai', 'chat']);
const SLOT_CONSUMING_STATUSES = new Set([
  'pending_confirmation',
  'pending',
  'approved',
  'confirmed',
  'assigned',
  'queued',
  'received',
  'in_progress',
  'in-progress',
  'processing',
  'quality_check',
]);
const DAILY_COUNTER_TIME = '__DAILY_CAPACITY_V2__';

const ACTIVITY_ORDER_REFERENCE_PATHS = Object.freeze([
  'referenceId',
  'metadata.referenceId',
  'metadata.orderId',
  'metadata.order',
  'metadata.orderNumber',
  'metadata.orderRef',
  'metadata.bookingId',
  'metadata.booking',
  'metadata.bookingReference',
  'metadata.bookingRef',
]);

/**
 * Every durable reference that can make a selected demo staff account unsafe
 * to hard-delete. `planned` identifies records that the same cleanup plan will
 * remove, so only references in records that survive the transaction count.
 * Authoritative system records deliberately have no planned-deletion source.
 */
export const STAFF_SURVIVING_REFERENCE_MANIFEST = Object.freeze([
  Object.freeze({
    key: 'users',
    model: User,
    fields: Object.freeze(['referredBy']),
  }),
  Object.freeze({
    key: 'customerProfiles',
    model: Customer,
    fields: Object.freeze(['user']),
    planned: Object.freeze({ scope: 'derived', key: 'customerProfiles' }),
  }),
  Object.freeze({
    key: 'vehicles',
    model: Vehicle,
    fields: Object.freeze(['customer']),
    planned: Object.freeze({ scope: 'sets', key: 'vehicles' }),
  }),
  Object.freeze({
    key: 'orders',
    model: Order,
    fields: Object.freeze([
      'customer',
      'assignedDetailer',
      'approvedBy',
      'rejectedBy',
      'cancelledBy',
      'staffNotes.detailerId',
      'jobOrder.completedBy',
      'ingressChecklist.completedBy',
      'damageAnnotations.addedBy',
      'serviceProper.completedBy',
      'qcChecklist.checkedBy',
      'egressData.completedBy',
    ]),
    planned: Object.freeze({ scope: 'sets', key: 'orders' }),
  }),
  Object.freeze({
    key: 'payments',
    model: Payment,
    fields: Object.freeze([
      'customer',
      'reviewedBy',
      'refundedBy',
      'staffAssigned',
      'statusHistory.changedBy',
    ]),
    planned: Object.freeze({ scope: 'derived', key: 'payments' }),
  }),
  Object.freeze({
    key: 'activity',
    model: ActivityLog,
    fields: Object.freeze(['userId']),
    planned: Object.freeze({ scope: 'sets', key: 'activity' }),
  }),
  Object.freeze({
    key: 'notifications',
    model: Notification,
    fields: Object.freeze(['recipientUserId']),
    planned: Object.freeze({ scope: 'sets', key: 'notifications' }),
  }),
  Object.freeze({
    key: 'notificationStates',
    model: NotificationUserState,
    fields: Object.freeze(['userId']),
    planned: Object.freeze({ scope: 'derived', key: 'notificationStates' }),
  }),
  Object.freeze({
    key: 'chatConversations',
    model: ChatConversation,
    fields: Object.freeze(['userId', 'assignedSalesId', 'resolvedBy', 'internalNotes.authorId']),
    planned: Object.freeze({ scope: 'sets', key: 'chat_conversations' }),
  }),
  Object.freeze({
    key: 'chatSessions',
    model: ChatSession,
    fields: Object.freeze(['userId']),
    planned: Object.freeze({ scope: 'sets', key: 'chat_sessions' }),
  }),
  Object.freeze({
    key: 'chatMessages',
    model: ChatMessage,
    fields: Object.freeze(['senderId', 'userId']),
    planned: Object.freeze({ scope: 'derived', key: 'chatMessages' }),
  }),
  Object.freeze({
    key: 'billings',
    model: Billing,
    fields: Object.freeze(['lastEditedBy', 'events.userId']),
    planned: Object.freeze({ scope: 'derived', key: 'billings' }),
  }),
  Object.freeze({
    key: 'invoices',
    model: InvoiceRecord,
    fields: Object.freeze(['createdBy']),
    planned: Object.freeze({ scope: 'derived', key: 'invoices' }),
  }),
  Object.freeze({
    key: 'aiScans',
    model: AIScan,
    fields: Object.freeze(['customer']),
    planned: Object.freeze({ scope: 'sets', key: 'ai_scans' }),
  }),
  Object.freeze({
    key: 'aiRequests',
    model: AIServiceRequest,
    fields: Object.freeze(['customer']),
    planned: Object.freeze({ scope: 'sets', key: 'ai_requests' }),
  }),
  Object.freeze({
    key: 'inventoryTransactions',
    model: InventoryTransaction,
    fields: Object.freeze(['referenceId']),
    filter: Object.freeze({ referenceModel: 'User' }),
    planned: Object.freeze({ scope: 'sets', key: 'inventory_transactions' }),
  }),
  Object.freeze({
    key: 'services',
    model: Service,
    fields: Object.freeze(['lastUpdatedBy']),
  }),
  Object.freeze({
    key: 'stores',
    model: Store,
    fields: Object.freeze(['manager']),
  }),
  Object.freeze({
    key: 'systemOperations',
    model: SystemOperation,
    fields: Object.freeze(['actor.id']),
  }),
  Object.freeze({
    key: 'systemBootstrapOperations',
    model: SystemBootstrapOperation,
    fields: Object.freeze(['targetUserId']),
  }),
  Object.freeze({
    key: 'systemBackups',
    model: SystemBackup,
    fields: Object.freeze(['createdBy', 'verifiedBy']),
  }),
  Object.freeze({
    key: 'paymentReconciliationEvents',
    model: PaymentReconciliationEvent,
    fields: Object.freeze(['reviewedBy']),
  }),
  Object.freeze({
    key: 'classifications',
    model: SystemDataClassification,
    fields: Object.freeze(['classifiedBy']),
    excludePlannedClassifications: true,
  }),
]);

export const CLEANUP_CATEGORY_MANIFEST = Object.freeze({
  customers: Object.freeze({ canonical: 'customers', label: 'Customers' }),
  vehicles: Object.freeze({ canonical: 'vehicles', label: 'Vehicles' }),
  orders: Object.freeze({ canonical: 'order_bundle', label: 'Order bundles' }),
  order_bundle: Object.freeze({ canonical: 'order_bundle', label: 'Order bundles' }),
  bookings: Object.freeze({ canonical: 'order_bundle', label: 'Bookings' }),
  appointments: Object.freeze({ canonical: 'order_bundle', label: 'Appointments' }),
  transactions: Object.freeze({ canonical: 'order_bundle', label: 'Transactions' }),
  proofs: Object.freeze({ canonical: 'order_bundle', label: 'Proofs' }),
  approvals: Object.freeze({ canonical: 'order_bundle', label: 'Approvals' }),
  tracking: Object.freeze({ canonical: 'order_bundle', label: 'Tracking' }),
  qc: Object.freeze({ canonical: 'order_bundle', label: 'Quality control' }),
  documents: Object.freeze({ canonical: 'order_bundle', label: 'Documents' }),
  notifications: Object.freeze({ canonical: 'notifications', label: 'Notifications' }),
  rewards: Object.freeze({ canonical: 'rewards', label: 'Rewards' }),
  activity: Object.freeze({ canonical: 'activity', label: 'Demo activity and reports' }),
  demo_activity: Object.freeze({ canonical: 'activity', label: 'Demo activity and reports' }),
  reports: Object.freeze({ canonical: 'activity', label: 'Reports' }),
  ai: Object.freeze({ canonical: 'ai', label: 'AI artifacts' }),
  chat: Object.freeze({ canonical: 'chat', label: 'Chat' }),
  procurement: Object.freeze({ canonical: 'procurement', label: 'Procurement history' }),
  procurement_history: Object.freeze({ canonical: 'procurement', label: 'Procurement history' }),
  staff: Object.freeze({ canonical: 'staff', label: 'Selected demo staff' }),
});

const TURNOVER_CATEGORIES = Object.freeze([
  'customers',
  'vehicles',
  'order_bundle',
  'notifications',
  'rewards',
  'activity',
  'ai',
  'chat',
  'procurement',
]);

const asStrings = (values) => [...new Set(Array.from(values || [], String))].sort();
const asObjectIds = (values) => asStrings(values).map((value) => new mongoose.Types.ObjectId(value));
const addIds = (set, values) => { for (const value of values || []) set.add(String(value)); };
const mapIds = (set) => [...set].sort();
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const actorSnapshot = (actor) => ({
  id: actor?.id || actor?._id,
  name: actor?.name || '',
  email: actor?.email || '',
  role: actor?.role || '',
});
const queryWithSession = (query, session) => (session ? query.session(session) : query);

const plannedIdsForReference = (entry, context) => {
  if (!entry.planned) return [];
  return asObjectIds(context[entry.planned.scope]?.[entry.planned.key] || []);
};

const plannedClassificationClauses = (sets) => Object.keys(OPERATIONAL_ROOTS)
  .filter((collectionName) => sets[collectionName]?.size)
  .map((collectionName) => ({
    collectionName,
    documentId: { $in: asObjectIds(sets[collectionName]) },
  }));

const buildStaffSurvivingReferenceFilter = (entry, staffObjectId, context) => {
  const filter = {
    ...(entry.filter || {}),
    $or: entry.fields.map((field) => ({ [field]: staffObjectId })),
  };
  const plannedIds = plannedIdsForReference(entry, context);
  if (plannedIds.length) filter._id = { $nin: plannedIds };
  if (entry.excludePlannedClassifications) {
    const clauses = plannedClassificationClauses(context.sets);
    if (clauses.length) filter.$nor = clauses;
  }
  return filter;
};

const countStaffSurvivingReferences = async ({ staffObjectId, sets, derived, session }) => {
  const context = { sets, derived };
  const counts = await Promise.all(STAFF_SURVIVING_REFERENCE_MANIFEST.map(async (entry) => {
    let query = entry.model.countDocuments(
      buildStaffSurvivingReferenceFilter(entry, staffObjectId, context),
    );
    query = queryWithSession(query, session);
    return [entry.key, await query];
  }));
  return Object.fromEntries(counts);
};

const stableValue = (value) => {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value?._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) return value.map(stableValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

const planHashFor = (plan) => sha256(JSON.stringify(stableValue(plan)));

const operationResponse = (operation) => ({
  previewId: String(operation._id),
  operationType: operation.action,
  planHash: operation.planHash,
  expiresAt: operation.previewExpiresAt,
  categories: operation.categories,
  resolvedCategories: operation.resolvedCategories,
  counts: operation.counts,
  preserved: operation.preserved,
  dependencies: operation.dependencies,
  requiresBackup: operation.requiresBackup,
  blockers: operation.blockers,
  warnings: operation.warnings,
  status: operation.status,
  receipt: operation.receipt || undefined,
});

const normalizeCategories = (categories, operationType) => {
  if (operationType === 'turnover') return [...TURNOVER_CATEGORIES];
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new SystemManagementError('Select at least one cleanup category.', 'CLEANUP_CATEGORY_REQUIRED', 400);
  }
  const canonical = [];
  for (const raw of categories) {
    const key = String(raw || '').trim().toLowerCase();
    const manifest = CLEANUP_CATEGORY_MANIFEST[key];
    if (!manifest) {
      throw new SystemManagementError(
        `Unsupported cleanup category: ${raw}`,
        'INVALID_CLEANUP_CATEGORY',
        400,
        { allowed: Object.keys(CLEANUP_CATEGORY_MANIFEST) },
      );
    }
    canonical.push(manifest.canonical);
  }
  const resolved = new Set(canonical);
  // The Admin Hub exposes Demo Activity / Reports / AI / Chat as one reviewed
  // derived-artifact category. Selecting it must apply the same closure on the
  // server even if an older client sends only the canonical `activity` value.
  if (resolved.has('activity')) {
    resolved.add('ai');
    resolved.add('chat');
  }
  return [...resolved].sort();
};

const requestedSelection = (selection, ...keys) => {
  const values = keys.flatMap((key) => Array.isArray(selection?.[key]) ? selection[key] : []);
  if (!values.length) return null;
  const unique = asStrings(values);
  if (unique.some((id) => !mongoose.isValidObjectId(id))) {
    throw new SystemManagementError('Selection contains an invalid record ID.', 'INVALID_DOCUMENT_ID', 400);
  }
  return unique;
};

const selectDemoIds = async (collectionName, selection, blockers, session) => {
  const ids = await getClassifiedDocumentIds(collectionName, 'demo', {
    requestedIds: selection,
    session,
  });
  if (selection && ids.length !== selection.length) {
    const found = new Set(ids.map(String));
    blockers.push({
      code: 'SELECTION_NOT_DEMO',
      collection: collectionName,
      documentIds: selection.filter((id) => !found.has(String(id))),
      message: 'Only explicitly classified demo records can be deleted.',
    });
  }
  return ids;
};

const ensureDemoDependencies = async (planSets, blockers, session) => {
  for (const [collectionName, set] of Object.entries(planSets)) {
    if (!OPERATIONAL_ROOTS[collectionName] || set.size === 0) continue;
    const ids = [...set];
    let query = SystemDataClassification.find({
      collectionName,
      documentId: { $in: ids },
      dataEnvironment: 'demo',
    }).select('documentId').lean();
    query = queryWithSession(query, session);
    const demo = new Set((await query).map((entry) => String(entry.documentId)));
    const unsafe = ids.filter((id) => !demo.has(String(id)));
    if (unsafe.length) {
      blockers.push({
        code: 'DEPENDENCY_NOT_DEMO',
        collection: collectionName,
        documentIds: unsafe.sort(),
        message: 'A linked dependency is production or unclassified and cannot be deleted.',
      });
    }
  }
};

const normalizeOpeningInventory = async (openingInventory, plannedOrderIds, session) => {
  let productsQuery = Product.find({ isActive: { $ne: false } })
    .select('_id name sku inventory reserved')
    .sort({ _id: 1 })
    .lean();
  productsQuery = queryWithSession(productsQuery, session);
  const products = await productsQuery;
  const entries = Array.isArray(openingInventory) ? openingInventory : [];
  const byId = new Map();
  const errors = [];
  for (const entry of entries) {
    const productId = String(entry?.productId || '');
    const quantity = Number(entry?.quantity);
    if (!mongoose.isValidObjectId(productId) || !Number.isSafeInteger(quantity) || quantity < 0) {
      errors.push({ productId, code: 'INVALID_OPENING_QUANTITY' });
      continue;
    }
    if (byId.has(productId)) errors.push({ productId, code: 'DUPLICATE_PRODUCT' });
    byId.set(productId, quantity);
  }
  for (const product of products) {
    if (!byId.has(String(product._id))) {
      errors.push({ productId: String(product._id), code: 'MISSING_ACTIVE_PRODUCT' });
    }
  }
  for (const productId of byId.keys()) {
    if (!products.some((product) => String(product._id) === productId)) {
      errors.push({ productId, code: 'UNKNOWN_OR_INACTIVE_PRODUCT' });
    }
  }

  const reservedByProduct = new Map();
  const match = {
    _id: { $nin: asObjectIds(plannedOrderIds) },
    'inventoryReservation.status': 'reserved',
  };
  const aggregate = Order.aggregate([
    { $match: match },
    { $unwind: '$inventoryReservation.items' },
    {
      $group: {
        _id: '$inventoryReservation.items.product',
        quantity: { $sum: '$inventoryReservation.items.quantity' },
      },
    },
  ]);
  if (session) aggregate.session(session);
  for (const row of await aggregate) reservedByProduct.set(String(row._id), Number(row.quantity || 0));
  for (const [productId, quantity] of byId) {
    const reserved = reservedByProduct.get(productId) || 0;
    if (quantity < reserved) errors.push({ productId, code: 'BELOW_RESERVED_QUANTITY', reserved, quantity });
  }

  return {
    entries: products.map((product) => ({
      productId: String(product._id),
      quantity: byId.get(String(product._id)),
      reserved: reservedByProduct.get(String(product._id)) || 0,
    })),
    errors,
  };
};

async function buildCleanupPlan(input, { session = null } = {}) {
  await reconcileNewOperationalClassifications({ session });
  const state = await getSystemState({ session, lean: true });
  const operationType = input.operationType === 'turnover' ? 'turnover' : 'clear_demo_data';
  const resolvedCategories = normalizeCategories(input.categories, operationType);
  const blockers = [];
  const dependencies = [];
  const selection = operationType === 'turnover' ? {} : (input.selection || {});
  const sets = Object.fromEntries(Object.keys(OPERATIONAL_ROOTS).map((key) => [key, new Set()]));
  sets.staff = new Set();
  const derived = {
    customerProfiles: new Set(),
    chatMessages: new Set(),
    payments: new Set(),
    billings: new Set(),
    invoices: new Set(),
    notificationStates: new Set(),
    qualityRetryJobs: new Set(),
    managedAssets: new Set(),
    staffDelete: new Set(),
    staffArchive: new Set(),
  };

  if (!['development', 'demo'].includes(state.mode)) {
    blockers.push({
      code: 'CLEANUP_MODE_BLOCKED',
      message: 'Cleanup and turnover are available only in Development or Demo mode.',
    });
  }

  if (resolvedCategories.includes('customers')) {
    addIds(sets.customers, await selectDemoIds(
      'customers',
      requestedSelection(selection, 'customers'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('vehicles')) {
    addIds(sets.vehicles, await selectDemoIds(
      'vehicles',
      requestedSelection(selection, 'vehicles'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('order_bundle')) {
    addIds(sets.orders, await selectDemoIds(
      'orders',
      requestedSelection(
        selection,
        'orders',
        'order_bundle',
        'bookings',
        'appointments',
        'transactions',
        'proofs',
        'approvals',
        'tracking',
        'qc',
        'documents',
      ),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('notifications')) {
    addIds(sets.notifications, await selectDemoIds(
      'notifications',
      requestedSelection(selection, 'notifications'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('activity')) {
    addIds(sets.activity, await selectDemoIds(
      'activity',
      requestedSelection(selection, 'activity', 'demo_activity', 'reports'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('ai')) {
    addIds(sets.ai_scans, await selectDemoIds(
      'ai_scans',
      requestedSelection(selection, 'ai_scans'),
      blockers,
      session,
    ));
    addIds(sets.ai_requests, await selectDemoIds(
      'ai_requests',
      requestedSelection(selection, 'ai_requests'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('chat')) {
    addIds(sets.chat_conversations, await selectDemoIds(
      'chat_conversations',
      requestedSelection(selection, 'chat_conversations'),
      blockers,
      session,
    ));
    addIds(sets.chat_sessions, await selectDemoIds(
      'chat_sessions',
      requestedSelection(selection, 'chat_sessions'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('procurement')) {
    addIds(sets.supplier_orders, await selectDemoIds(
      'supplier_orders',
      requestedSelection(selection, 'supplier_orders', 'procurement'),
      blockers,
      session,
    ));
    addIds(sets.inventory_transactions, await selectDemoIds(
      'inventory_transactions',
      requestedSelection(selection, 'inventory_transactions'),
      blockers,
      session,
    ));
  }
  if (resolvedCategories.includes('staff')) {
    const staffSelection = requestedSelection(selection, 'staff', 'staffUserIds');
    if (!staffSelection?.length) {
      blockers.push({
        code: 'STAFF_SELECTION_REQUIRED',
        message: 'Staff cleanup requires an explicit reviewed selection.',
      });
    } else {
      addIds(sets.staff, await selectDemoIds('staff', staffSelection, blockers, session));
    }
  }

  if (sets.customers.size) {
    const customerIds = asObjectIds(sets.customers);
    let profilesQuery = Customer.find({ user: { $in: customerIds } }).select('_id vehicles bookings').lean();
    profilesQuery = queryWithSession(profilesQuery, session);
    const profiles = await profilesQuery;
    addIds(derived.customerProfiles, profiles.map((profile) => profile._id));

    let vehiclesQuery = Vehicle.find({ customer: { $in: customerIds } }).select('_id').lean();
    vehiclesQuery = queryWithSession(vehiclesQuery, session);
    addIds(sets.vehicles, (await vehiclesQuery).map((vehicle) => vehicle._id));

    let ordersQuery = Order.find({ customer: { $in: customerIds } }).select('_id').lean();
    ordersQuery = queryWithSession(ordersQuery, session);
    addIds(sets.orders, (await ordersQuery).map((order) => order._id));

    let customerPaymentsQuery = Payment.find({ customer: { $in: customerIds } })
      .select('order').lean();
    customerPaymentsQuery = queryWithSession(customerPaymentsQuery, session);
    addIds(sets.orders, (await customerPaymentsQuery).map((payment) => payment.order).filter(Boolean));

    let aiScanQuery = AIScan.find({ customer: { $in: customerIds } }).select('_id').lean();
    aiScanQuery = queryWithSession(aiScanQuery, session);
    addIds(sets.ai_scans, (await aiScanQuery).map((row) => row._id));

    let aiRequestQuery = AIServiceRequest.find({ customer: { $in: customerIds } }).select('_id').lean();
    aiRequestQuery = queryWithSession(aiRequestQuery, session);
    addIds(sets.ai_requests, (await aiRequestQuery).map((row) => row._id));

    let conversationsQuery = ChatConversation.find({ userId: { $in: customerIds } }).select('_id').lean();
    conversationsQuery = queryWithSession(conversationsQuery, session);
    addIds(sets.chat_conversations, (await conversationsQuery).map((row) => row._id));

    let directMessagesQuery = ChatMessage.find({ userId: { $in: customerIds } }).select('_id').lean();
    directMessagesQuery = queryWithSession(directMessagesQuery, session);
    addIds(derived.chatMessages, (await directMessagesQuery).map((row) => row._id));

    let sessionsQuery = ChatSession.find({ userId: { $in: customerIds } }).select('_id').lean();
    sessionsQuery = queryWithSession(sessionsQuery, session);
    addIds(sets.chat_sessions, (await sessionsQuery).map((row) => row._id));

    let notificationsQuery = Notification.find({ recipientUserId: { $in: customerIds } }).select('_id').lean();
    notificationsQuery = queryWithSession(notificationsQuery, session);
    addIds(sets.notifications, (await notificationsQuery).map((row) => row._id));

    let activityQuery = ActivityLog.find({
      userId: { $in: customerIds },
      type: { $in: DEMO_OPERATIONAL_ACTIVITY_TYPES },
    }).select('_id').lean();
    activityQuery = queryWithSession(activityQuery, session);
    addIds(sets.activity, (await activityQuery).map((row) => row._id));

    dependencies.push({
      source: 'customers',
      includes: ['vehicles', 'order_bundle', 'notifications', 'demo_activity', 'ai', 'chat'],
    });
  }

  if (sets.vehicles.size) {
    const vehicleIds = asObjectIds(sets.vehicles);
    let ordersQuery = Order.find({ vehicle: { $in: vehicleIds } }).select('_id').lean();
    let paymentsQuery = Payment.find({ vehicle: { $in: vehicleIds } }).select('order').lean();
    let conversationsQuery = ChatConversation.find({ vehicleId: { $in: vehicleIds } }).select('_id').lean();
    [ordersQuery, paymentsQuery, conversationsQuery] = [ordersQuery, paymentsQuery, conversationsQuery]
      .map((query) => queryWithSession(query, session));
    const [linkedOrders, linkedPayments, linkedConversations] = await Promise.all([
      ordersQuery,
      paymentsQuery,
      conversationsQuery,
    ]);
    if (linkedOrders.length || linkedPayments.length) {
      dependencies.push({ source: 'vehicles', includes: ['order_bundle'] });
    }
    if (linkedConversations.length) dependencies.push({ source: 'vehicles', includes: ['chat'] });
    addIds(sets.orders, linkedOrders.map((order) => order._id));
    addIds(sets.orders, linkedPayments.map((payment) => payment.order).filter(Boolean));
    addIds(sets.chat_conversations, linkedConversations.map((conversation) => conversation._id));
  }

  if (sets.orders.size) {
    const orderIds = asObjectIds(sets.orders);
    const orderIdStrings = mapIds(sets.orders);
    let orderAliasesQuery = Order.find({ _id: { $in: orderIds } })
      .select('orderNumber bookingReference').lean();
    let paymentsQuery = Payment.find({ order: { $in: orderIds } }).select('_id').lean();
    let billingsQuery = Billing.find({ order: { $in: orderIds } }).select('_id').lean();
    let invoicesQuery = InvoiceRecord.find({ order: { $in: orderIds } }).select('_id').lean();
    let retriesQuery = QualityNotificationRetry.find({ orderId: { $in: orderIds } }).select('_id').lean();
    let inventoryQuery = InventoryTransaction.find({
      referenceModel: 'Order',
      referenceId: { $in: orderIds },
    }).select('_id').lean();
    let conversationsQuery = ChatConversation.find({ linkedBookingId: { $in: orderIds } })
      .select('_id').lean();
    let notificationsQuery = Notification.find({
      $or: [
        { actionId: { $in: orderIdStrings } },
        { 'metadata.orderId': { $in: [...orderIds, ...orderIdStrings] } },
        { 'metadata.bookingId': { $in: [...orderIds, ...orderIdStrings] } },
      ],
    }).select('_id').lean();
    orderAliasesQuery = queryWithSession(orderAliasesQuery, session);
    const orderAliases = await orderAliasesQuery;
    const activityReferenceValues = [
      ...orderIds,
      ...orderIdStrings,
      ...orderAliases.flatMap((order) => [order.orderNumber, order.bookingReference]).filter(Boolean),
    ];
    let activityQuery = ActivityLog.find({
      type: { $in: DEMO_OPERATIONAL_ACTIVITY_TYPES },
      $or: ACTIVITY_ORDER_REFERENCE_PATHS.map((path) => ({
        [path]: { $in: activityReferenceValues },
      })),
    }).select('_id').lean();
    [paymentsQuery, billingsQuery, invoicesQuery, retriesQuery, inventoryQuery, conversationsQuery, notificationsQuery, activityQuery]
      = [paymentsQuery, billingsQuery, invoicesQuery, retriesQuery, inventoryQuery, conversationsQuery, notificationsQuery, activityQuery]
        .map((query) => queryWithSession(query, session));
    const [payments, billings, invoices, retries, inventoryRows, conversations, notifications, activity] = await Promise.all([
      paymentsQuery,
      billingsQuery,
      invoicesQuery,
      retriesQuery,
      inventoryQuery,
      conversationsQuery,
      notificationsQuery,
      activityQuery,
    ]);
    addIds(derived.payments, payments.map((row) => row._id));
    addIds(derived.billings, billings.map((row) => row._id));
    addIds(derived.invoices, invoices.map((row) => row._id));
    addIds(derived.qualityRetryJobs, retries.map((row) => row._id));
    addIds(sets.inventory_transactions, inventoryRows.map((row) => row._id));
    addIds(sets.chat_conversations, conversations.map((row) => row._id));
    addIds(sets.notifications, notifications.map((row) => row._id));
    addIds(sets.activity, activity.map((row) => row._id));
    dependencies.push({
      source: 'order_bundle',
      includes: [
        'payments',
        'billing',
        'invoices',
        'qc_jobs',
        'inventory_ledgers',
        'notifications',
        'demo_activity',
        'chat',
      ],
    });
  }

  if (sets.supplier_orders.size) {
    let query = InventoryTransaction.find({
      referenceModel: 'SupplierOrder',
      referenceId: { $in: asObjectIds(sets.supplier_orders) },
    }).select('_id').lean();
    query = queryWithSession(query, session);
    addIds(sets.inventory_transactions, (await query).map((row) => row._id));
    dependencies.push({ source: 'procurement', includes: ['inventory_ledgers'] });
  }

  if (sets.chat_conversations.size || sets.chat_sessions.size) {
    let conversationsQuery = ChatConversation.find({ _id: { $in: asObjectIds(sets.chat_conversations) } })
      .select('conversationId').lean();
    let sessionsQuery = ChatSession.find({ _id: { $in: asObjectIds(sets.chat_sessions) } })
      .select('sessionId').lean();
    conversationsQuery = queryWithSession(conversationsQuery, session);
    sessionsQuery = queryWithSession(sessionsQuery, session);
    const [conversations, sessions] = await Promise.all([conversationsQuery, sessionsQuery]);
    let messagesQuery = ChatMessage.find({
      $or: [
        { conversationId: { $in: conversations.map((row) => row.conversationId).filter(Boolean) } },
        { sessionId: { $in: sessions.map((row) => row.sessionId).filter(Boolean) } },
      ],
    }).select('_id').lean();
    messagesQuery = queryWithSession(messagesQuery, session);
    addIds(derived.chatMessages, (await messagesQuery).map((row) => row._id));
  }

  if (sets.notifications.size || sets.customers.size) {
    const clauses = [];
    if (sets.notifications.size) clauses.push({ notificationId: { $in: asObjectIds(sets.notifications) } });
    if (sets.customers.size) clauses.push({ userId: { $in: asObjectIds(sets.customers) } });
    let query = NotificationUserState.find({ $or: clauses }).select('_id').lean();
    query = queryWithSession(query, session);
    addIds(derived.notificationStates, (await query).map((row) => row._id));
  }

  if (sets.staff.size) {
    for (const staffId of mapIds(sets.staff)) {
      if (String(staffId) === String(state.protectedAdministratorId || '')) {
        blockers.push({
          code: 'PROTECTED_ADMINISTRATOR_IMMUTABLE',
          userId: staffId,
          message: 'The protected administrator can never be selected for cleanup.',
        });
        continue;
      }
      const staffObjectId = new mongoose.Types.ObjectId(staffId);
      const references = await countStaffSurvivingReferences({
        staffObjectId,
        sets,
        derived,
        session,
      });
      const referenceCount = Object.values(references)
        .reduce((total, count) => total + Number(count || 0), 0);
      if (referenceCount > 0) {
        if (input.staffFallback === 'archive') {
          derived.staffArchive.add(staffId);
        } else {
          blockers.push({
            code: 'STAFF_ARCHIVE_REQUIRED',
            userId: staffId,
            referenceCount,
            references,
            message: 'This staff account is referenced by preserved records and must be archived instead.',
          });
        }
      } else {
        derived.staffDelete.add(staffId);
      }
    }
    dependencies.push({
      source: 'staff',
      includes: ['auth_artifacts'],
      fallback: 'archive_when_referenced',
    });
  }

  const ownerClauses = [];
  const ownerMappings = [
    ['customers', ['User', 'users', 'customers']],
    ['vehicles', ['Vehicle', 'vehicles']],
    ['orders', ['Order', 'orders']],
    ['ai_scans', ['AIScan', 'aiscans', 'ai_scans']],
    ['ai_requests', ['AIServiceRequest', 'aiservicerequests', 'ai_requests']],
    ['chat_conversations', ['ChatConversation', 'chatconversations']],
  ];
  for (const [key, collectionAliases] of ownerMappings) {
    if (sets[key].size) ownerClauses.push({
      ownerCollection: { $in: collectionAliases },
      ownerId: { $in: asObjectIds(sets[key]) },
    });
  }
  if (derived.staffDelete.size) ownerClauses.push({
    ownerCollection: { $in: ['User', 'users', 'staff'] },
    ownerId: { $in: asObjectIds(derived.staffDelete) },
  });
  if (ownerClauses.length) {
    let query = ManagedAsset.find({ status: 'active', $or: ownerClauses }).select('_id').lean();
    query = queryWithSession(query, session);
    addIds(derived.managedAssets, (await query).map((row) => row._id));
  }

  await ensureDemoDependencies(sets, blockers, session);
  const classificationSummary = await getClassificationSummary({ session, reconcile: false });
  if (operationType === 'turnover' && classificationSummary.unclassified > 0) {
    blockers.push({
      code: 'UNCLASSIFIED_DATA_REMAINS',
      count: classificationSummary.unclassified,
      message: 'Every operational root must be classified before turnover.',
    });
  }

  let openingInventory = [];
  if (operationType === 'turnover') {
    const normalized = await normalizeOpeningInventory(input.openingInventory, mapIds(sets.orders), session);
    openingInventory = normalized.entries;
    if (normalized.errors.length) {
      blockers.push({
        code: 'INVENTORY_BASELINE_INVALID',
        errors: normalized.errors,
        message: 'Opening inventory must cover every active product and preserve existing reservations.',
      });
    }
  }

  const rewardsUserIds = resolvedCategories.includes('rewards')
    ? await selectDemoIds(
      'customers',
      requestedSelection(selection, 'rewards', 'customers'),
      blockers,
      session,
    )
    : [];
  const planIds = {
    ...Object.fromEntries(Object.entries(sets).map(([key, set]) => [key, mapIds(set)])),
    ...Object.fromEntries(Object.entries(derived).map(([key, set]) => [key, mapIds(set)])),
    rewards: asStrings(rewardsUserIds).filter((id) => !sets.customers.has(id)),
  };
  const assetScanMappings = [
    ['customers', User, planIds.customers],
    ['staff', User, [...planIds.staffDelete, ...planIds.staffArchive]],
    ['vehicles', Vehicle, planIds.vehicles],
    ['orders', Order, planIds.orders],
    ['payments', Payment, planIds.payments],
    ['billings', Billing, planIds.billings],
    ['invoices', InvoiceRecord, planIds.invoices],
    ['notifications', Notification, planIds.notifications],
    ['activity', ActivityLog, planIds.activity],
    ['ai_scans', AIScan, planIds.ai_scans],
    ['ai_requests', AIServiceRequest, planIds.ai_requests],
    ['chat_conversations', ChatConversation, planIds.chat_conversations],
    ['chat_sessions', ChatSession, planIds.chat_sessions],
    ['chat_messages', ChatMessage, planIds.chatMessages],
    ['supplier_orders', SupplierOrder, planIds.supplier_orders],
    ['inventory_transactions', InventoryTransaction, planIds.inventory_transactions],
  ];
  const assetReferenceRecords = [];
  for (const [collection, Model, ids] of assetScanMappings) {
    if (!ids?.length) continue;
    let query = Model.find({ _id: { $in: asObjectIds(ids) } }).lean();
    query = queryWithSession(query, session);
    for (const document of await query) assetReferenceRecords.push({
      collection,
      documentId: document._id,
      document,
    });
  }
  const unresolvedAssets = await findUnmanagedAssetReferences(assetReferenceRecords, { session });
  const counts = Object.fromEntries(Object.entries(planIds).map(([key, ids]) => [key, ids.length]));
  counts.unresolvedAssets = unresolvedAssets.length;
  const backupMayBeSkipped = resolvedCategories.every(
    (category) => SAFE_BACKUP_SKIP_CATEGORIES.has(category),
  );
  const requiresBackup = !(input.skipBackup === true && backupMayBeSkipped);
  if (input.skipBackup === true && !backupMayBeSkipped) {
    blockers.push({
      code: 'BACKUP_REQUIRED',
      message: 'This selection contains records that require a verified encrypted backup.',
    });
  }
  const preserved = {
    products: await queryWithSession(Product.countDocuments({}), session),
    services: await queryWithSession(Service.countDocuments({}), session),
    suppliers: await queryWithSession(Supplier.countDocuments({}), session),
    protectedAdministratorId: state.protectedAdministratorId ? String(state.protectedAdministratorId) : null,
    unresolvedAssets,
  };
  const dataFingerprint = await computeDataFingerprint({ session });
  const hashInput = {
    operationType,
    resolvedCategories,
    ids: planIds,
    openingInventory,
    dataFingerprint,
    mode: state.mode,
    operationalDataEpoch: state.operationalDataEpoch,
  };

  return {
    operationType,
    resolvedCategories,
    counts,
    preserved,
    dependencies,
    blockers,
    warnings: unresolvedAssets.length
      ? [`${unresolvedAssets.length} legacy asset reference(s) require manual cleanup.`]
      : [],
    requiresBackup,
    dataFingerprint,
    planHash: planHashFor(hashInput),
    plan: {
      input: {
        operationType,
        categories: resolvedCategories,
        selection,
        skipBackup: input.skipBackup === true,
        openingInventory,
        staffFallback: input.staffFallback === 'archive' ? 'archive' : null,
      },
      ids: planIds,
      openingInventory,
      unresolvedAssets,
    },
    stateRevision: state.revision,
  };
}

export async function createCleanupPreview({ actor, body = {}, requestMetadata = {} }) {
  const state = await getSystemState({ lean: true });
  await assertProtectedAdministrator(actor, state);
  const operationType = body.operationType === 'turnover' ? 'turnover' : 'clear_demo_data';
  const plan = await buildCleanupPlan({ ...body, operationType });
  const preview = await SystemOperation.create({
    kind: operationType === 'turnover' ? 'turnover' : 'cleanup',
    action: operationType,
    status: 'preview',
    actor: actorSnapshot(actor),
    categories: Array.isArray(body.categories) ? body.categories.map(String) : [],
    resolvedCategories: plan.resolvedCategories,
    selection: body.selection || {},
    counts: plan.counts,
    preserved: plan.preserved,
    dependencies: plan.dependencies,
    blockers: plan.blockers,
    warnings: plan.warnings,
    plan: plan.plan,
    planHash: plan.planHash,
    dataFingerprint: plan.dataFingerprint,
    stateRevision: plan.stateRevision,
    requiresBackup: plan.requiresBackup,
    previewExpiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    requestMetadata,
  });
  return operationResponse(preview);
}

const isTransactionUnavailable = (error) => (
  error?.code === 20
  || error?.codeName === 'IllegalOperation'
  || /transaction numbers are only allowed on a replica set member or mongos/i.test(String(error?.message || ''))
);

const deleteExpected = async (Model, ids, session, label) => {
  if (!ids.length) return 0;
  const result = await Model.deleteMany({ _id: { $in: asObjectIds(ids) } }, { session });
  if (result.deletedCount !== ids.length) {
    throw new SystemManagementError(
      `${label} changed after preview. No cleanup was committed.`,
      'PREVIEW_STALE',
      409,
      { expected: ids.length, deleted: result.deletedCount, collection: label },
    );
  }
  return result.deletedCount;
};

const recomputeDerivedState = async (session, openingInventory = null) => {
  await Product.updateMany({}, { $set: { reserved: 0 } }, { session });
  const reservedAggregate = Order.aggregate([
    { $match: { 'inventoryReservation.status': 'reserved' } },
    { $unwind: '$inventoryReservation.items' },
    {
      $group: {
        _id: '$inventoryReservation.items.product',
        reserved: { $sum: '$inventoryReservation.items.quantity' },
      },
    },
  ]).session(session);
  const reservedRows = await reservedAggregate;
  for (const row of reservedRows) {
    await Product.updateOne({ _id: row._id }, { $set: { reserved: Math.max(0, Number(row.reserved || 0)) } }, { session });
  }
  if (Array.isArray(openingInventory)) {
    for (const entry of openingInventory) {
      await Product.updateOne(
        { _id: entry.productId, isActive: { $ne: false } },
        { $set: { inventory: entry.quantity, reserved: entry.reserved } },
        { session },
      );
    }
  }

  await Supplier.updateMany({}, { $set: { totalSpent: 0, lastOrder: null } }, { session });
  const supplierRows = await SupplierOrder.aggregate([
    { $match: { status: 'Completed' } },
    { $group: { _id: '$supplier', totalSpent: { $sum: '$amount' }, lastOrder: { $max: '$orderDate' } } },
  ]).session(session);
  for (const row of supplierRows) {
    await Supplier.updateOne(
      { _id: row._id },
      { $set: { totalSpent: Number(row.totalSpent || 0), lastOrder: row.lastOrder || null } },
      { session },
    );
  }

  await Service.updateMany({}, { $set: { bookingCount: 0 } }, { session });
  const serviceRows = await Order.aggregate([
    { $match: { serviceId: { $ne: null }, status: { $ne: 'cancelled' } } },
    { $group: { _id: '$serviceId', bookingCount: { $sum: 1 } } },
  ]).session(session);
  for (const row of serviceRows) {
    await Service.updateOne({ _id: row._id }, { $set: { bookingCount: row.bookingCount } }, { session });
  }

  const customers = await Customer.find({}).select('_id user').session(session).lean();
  for (const customer of customers) {
    const [vehicles, bookings] = await Promise.all([
      Vehicle.find({ customer: customer.user }).select('_id').session(session).lean(),
      Order.find({ customer: customer.user }).select('_id').session(session).lean(),
    ]);
    await Customer.updateOne(
      { _id: customer._id },
      { $set: { vehicles: vehicles.map((row) => row._id), bookings: bookings.map((row) => row._id) } },
      { session },
    );
  }

  await BookingSlotCounter.deleteMany({}, { session });
  const activeBookings = await Order.find({
    status: { $in: [...SLOT_CONSUMING_STATUSES] },
    archived: { $ne: true },
    isWalkIn: { $ne: true },
    bookingDate: { $type: 'string', $ne: '' },
    bookingTime: { $type: 'string', $ne: '' },
  }).select('bookingDate bookingTime').session(session).lean();
  const counters = new Map();
  for (const booking of activeBookings) {
    const date = String(booking.bookingDate).trim();
    const time = String(booking.bookingTime).trim();
    if (!date || !time) continue;
    counters.set(`${date}\u0000${time}`, (counters.get(`${date}\u0000${time}`) || 0) + 1);
    counters.set(`${date}\u0000${DAILY_COUNTER_TIME}`, (counters.get(`${date}\u0000${DAILY_COUNTER_TIME}`) || 0) + 1);
  }
  if (counters.size) {
    await BookingSlotCounter.insertMany([...counters].map(([key, count]) => {
      const [date, time] = key.split('\u0000');
      return { date, time, count };
    }), { session });
  }
};

export const buildExternalJobs = async (operationId, userIds, orderIds, managedAssetIds, session) => {
  const jobs = [];
  if (userIds.length) {
    const users = await User.find({ _id: { $in: asObjectIds(userIds) } })
      .select('_id firebaseUid').session(session).lean();
    for (const user of users) {
      if (!user.firebaseUid) continue;
      jobs.push({
        operationId,
        provider: 'firebase_auth',
        action: 'delete_identity',
        target: { uid: user.firebaseUid },
        targetHash: sha256(`firebase_auth:${user.firebaseUid}`),
      });
      jobs.push({
        operationId,
        provider: 'firestore',
        action: 'delete_document',
        target: { collection: 'users', documentId: user.firebaseUid },
        targetHash: sha256(`firestore:users:${user.firebaseUid}`),
      });
    }
  }
  for (const orderId of asStrings(orderIds)) {
    jobs.push({
      operationId,
      provider: 'firestore',
      action: 'delete_document',
      target: { collection: 'bookings', documentId: orderId },
      targetHash: sha256(`firestore:bookings:${orderId}`),
    });
  }
  if (managedAssetIds.length) {
    const assets = await ManagedAsset.find({ _id: { $in: asObjectIds(managedAssetIds) } })
      .session(session).lean();
    for (const asset of assets) {
      if (!asset.publicId || asset.provider !== 'cloudinary') continue;
      jobs.push({
        operationId,
        provider: 'cloudinary',
        action: 'delete_asset',
        target: {
          assetId: String(asset._id),
          publicId: asset.publicId,
          resourceType: asset.resourceType || 'image',
        },
        targetHash: sha256(`cloudinary:${asset.resourceType || 'image'}:${asset.publicId}`),
      });
    }
    await ManagedAsset.updateMany(
      { _id: { $in: asObjectIds(managedAssetIds) } },
      { $set: { status: 'pending_delete' } },
      { session },
    );
  }
  if (jobs.length) await ExternalCleanupJob.insertMany(jobs, { session, ordered: false });
  return jobs.length;
};

const applyCleanupPlan = async (operation, fresh, session) => {
  const ids = fresh.plan.ids;
  const deleted = {};
  const operationId = operation._id;
  let inventoryBaseline = null;

  const deletedUserIds = asStrings([...(ids.customers || []), ...(ids.staffDelete || [])]);
  const externalJobs = await buildExternalJobs(
    operationId,
    deletedUserIds,
    ids.orders,
    ids.managedAssets,
    session,
  );

  if (deletedUserIds.length) {
    const users = await User.find({ _id: { $in: asObjectIds(deletedUserIds) } })
      .select('_id email').session(session).lean();
    const emails = users.map((user) => user.email).filter(Boolean);
    await Promise.all([
      OTP.deleteMany({ $or: [{ userId: { $in: asObjectIds(deletedUserIds) } }, { email: { $in: emails } }] }, { session }),
      AccountSetupToken.deleteMany({ userId: { $in: asObjectIds(deletedUserIds) } }, { session }),
      StaffVerificationToken.deleteMany({ userId: { $in: asObjectIds(deletedUserIds) } }, { session }),
      StaffVerificationIssuance.deleteMany({ userId: { $in: asObjectIds(deletedUserIds) } }, { session }),
    ]);
  }

  deleted.notificationStates = await deleteExpected(NotificationUserState, ids.notificationStates, session, 'notification user states');
  deleted.notifications = await deleteExpected(Notification, ids.notifications, session, 'notifications');
  deleted.chatMessages = await deleteExpected(ChatMessage, ids.chatMessages, session, 'chat messages');
  deleted.chatConversations = await deleteExpected(ChatConversation, ids.chat_conversations, session, 'chat conversations');
  deleted.chatSessions = await deleteExpected(ChatSession, ids.chat_sessions, session, 'chat sessions');
  deleted.qualityRetryJobs = await deleteExpected(QualityNotificationRetry, ids.qualityRetryJobs, session, 'quality retry jobs');
  deleted.invoices = await deleteExpected(InvoiceRecord, ids.invoices, session, 'invoice records');
  deleted.billings = await deleteExpected(Billing, ids.billings, session, 'billing records');
  deleted.payments = await deleteExpected(Payment, ids.payments, session, 'payments');
  deleted.inventoryTransactions = await deleteExpected(
    InventoryTransaction,
    ids.inventory_transactions,
    session,
    'inventory transactions',
  );
  deleted.orders = await deleteExpected(Order, ids.orders, session, 'orders');
  deleted.aiRequests = await deleteExpected(AIServiceRequest, ids.ai_requests, session, 'AI service requests');
  deleted.aiScans = await deleteExpected(AIScan, ids.ai_scans, session, 'AI scans');
  deleted.activity = await deleteExpected(ActivityLog, ids.activity, session, 'activity records');
  deleted.supplierOrders = await deleteExpected(SupplierOrder, ids.supplier_orders, session, 'supplier orders');
  deleted.customerProfiles = await deleteExpected(Customer, ids.customerProfiles, session, 'customer profiles');
  deleted.vehicles = await deleteExpected(Vehicle, ids.vehicles, session, 'vehicles');
  deleted.customers = await deleteExpected(User, ids.customers, session, 'customer accounts');
  deleted.staff = await deleteExpected(User, ids.staffDelete, session, 'staff accounts');

  if (ids.staffArchive.length) {
    const archived = await User.updateMany(
      {
        _id: { $in: asObjectIds(ids.staffArchive) },
        role: { $in: ['office_admin', 'sales', 'staff_quality_checker'] },
        isDeleted: { $ne: true },
      },
      {
        $set: { isActive: false, status: 'suspended', archivedAt: new Date() },
        $inc: { authVersion: 1 },
      },
      { session },
    );
    if (archived.matchedCount !== ids.staffArchive.length) {
      throw new SystemManagementError(
        'Selected staff changed after preview. No cleanup was committed.',
        'PREVIEW_STALE',
        409,
      );
    }
    deleted.staffArchived = archived.modifiedCount;
  }

  if (ids.rewards.length) {
    await Promise.all([
      User.updateMany(
        { _id: { $in: asObjectIds(ids.rewards) } },
        { $set: { loyaltyPoints: 0, loyaltyTier: 'Bronze' } },
        { session },
      ),
      Customer.updateMany(
        { user: { $in: asObjectIds(ids.rewards) } },
        { $set: { loyaltyPoints: 0 } },
        { session },
      ),
    ]);
  }

  const classificationClauses = [];
  for (const collectionName of Object.keys(OPERATIONAL_ROOTS)) {
    if (ids[collectionName]?.length) classificationClauses.push({
      collectionName,
      documentId: { $in: asObjectIds(ids[collectionName]) },
    });
  }
  if (ids.staffDelete.length) classificationClauses.push({
    collectionName: 'staff',
    documentId: { $in: asObjectIds(ids.staffDelete) },
  });
  if (classificationClauses.length) {
    await SystemDataClassification.deleteMany({ $or: classificationClauses }, { session });
  }

  await recomputeDerivedState(
    session,
    operation.action === 'turnover' ? fresh.plan.openingInventory : null,
  );
  await incrementOperationalDataEpoch({ session });
  await incrementGlobalSessionEpoch({ session });
  if (operation.action === 'turnover') {
    const baselineVerifiedAt = new Date();
    inventoryBaseline = buildInventoryBaselineMetadata(fresh.plan.openingInventory, {
      turnoverOperationId: operation._id,
      capturedAt: baselineVerifiedAt,
    });
    await updateLifecycleState({
      turnoverCompletedAt: baselineVerifiedAt,
      inventoryBaselineVerifiedAt: baselineVerifiedAt,
      inventoryBaseline,
    }, { session });
  }
  return {
    deleted,
    rewardsReset: ids.rewards.length,
    externalJobs,
    unresolvedAssets: fresh.plan.unresolvedAssets || [],
    ...(inventoryBaseline ? { inventoryBaseline } : {}),
  };
};

export const verifyExecutionSecret = async (actorId, password) => {
  if (typeof password !== 'string' || !password) {
    throw new SystemManagementError('Current administrator password is required.', 'PASSWORD_REQUIRED', 400);
  }
  const user = await User.findById(actorId).select('_id password role isActive isDeleted');
  if (!user || user.isDeleted || !user.isActive || user.role !== 'administrator') {
    throw new SystemManagementError('Administrator account is not usable.', 'ADMINISTRATOR_UNAVAILABLE', 403);
  }
  if (!await user.comparePassword(password)) {
    throw new SystemManagementError('Current administrator password is incorrect.', 'INVALID_PASSWORD', 401);
  }
  return user;
};

export async function executeCleanup({ actor, body = {} }) {
  const previewId = String(body.previewId || '');
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (!mongoose.isValidObjectId(previewId)) {
    throw new SystemManagementError('Cleanup preview was not found.', 'PREVIEW_NOT_FOUND', 404);
  }
  if (!idempotencyKey || idempotencyKey.length > 180) {
    throw new SystemManagementError('A valid idempotency key is required.', 'IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  let operation = await SystemOperation.findById(previewId);
  if (!operation || !['cleanup', 'turnover'].includes(operation.kind)) {
    throw new SystemManagementError('Cleanup preview was not found.', 'PREVIEW_NOT_FOUND', 404);
  }
  if (String(operation.actor.id) !== String(actor?.id || actor?._id)) {
    throw new SystemManagementError('This preview belongs to another administrator.', 'PREVIEW_ACTOR_MISMATCH', 403);
  }
  if (operation.idempotencyKey === idempotencyKey && operation.receipt) {
    return operationResponse(operation);
  }
  if (operation.status !== 'preview') {
    throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
  }
  if (operation.previewExpiresAt <= new Date()) {
    operation.status = 'expired';
    await operation.save();
    throw new SystemManagementError('Cleanup preview has expired.', 'PREVIEW_EXPIRED', 409);
  }
  if (String(body.planHash || '') !== operation.planHash) {
    throw new SystemManagementError('Cleanup plan hash does not match.', 'PREVIEW_STALE', 409);
  }
  if (operation.blockers.length) {
    throw new SystemManagementError('Cleanup preview has unresolved blockers.', 'PREVIEW_BLOCKED', 409, {
      blockers: operation.blockers,
    });
  }
  const expectedPhrase = operation.action === 'turnover' ? 'PREPARE AUTOSPF' : 'CLEAR DEMO DATA';
  if (body.phrase !== expectedPhrase) {
    throw new SystemManagementError('Confirmation phrase does not match.', 'CONFIRMATION_PHRASE_MISMATCH', 400);
  }
  await assertProtectedAdministrator(actor);
  await verifyExecutionSecret(actor.id || actor._id, body.password);

  const leaseState = await acquireSystemMutationLease({
    operationId: operation._id,
    owner: `system:${operation.action}:${actor.id || actor._id}`,
    ttlMs: 120_000,
  });
  const lease = {
    operationId: operation._id,
    fencingToken: leaseState.mutationLease?.fencingToken,
  };
  try {
    await waitForInFlightMutations({ timeoutMs: 15_000 });
    await renewSystemMutationLease({
      ...lease,
      ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS,
    });
    const session = await mongoose.startSession();
    try {
      let receipt;
      await session.withTransaction(async () => {
        const fresh = await buildCleanupPlan(operation.plan.input, { session });
        if (fresh.planHash !== operation.planHash || fresh.dataFingerprint !== operation.dataFingerprint) {
          throw new SystemManagementError(
            'Operational data changed after preview. No records were deleted.',
            'PREVIEW_STALE',
            409,
          );
        }
        if (fresh.blockers.length) {
          throw new SystemManagementError('Cleanup now has unresolved blockers.', 'PREVIEW_BLOCKED', 409, {
            blockers: fresh.blockers,
          });
        }
        if (operation.requiresBackup) {
          const backup = await getVerifiedBackupForFingerprint(
            body.backupId,
            operation.dataFingerprint,
            { session, requiredPurpose: 'lifecycle' },
          );
          if (!backup) {
            throw new SystemManagementError(
              'A verified backup for this exact preview is required.',
              'VERIFIED_BACKUP_REQUIRED',
              409,
            );
          }
          operation.backupId = backup._id;
        }

        const claimed = await SystemOperation.updateOne(
          { _id: operation._id, status: 'preview', idempotencyKey: null },
          { $set: { status: 'running', idempotencyKey, consumedAt: new Date() } },
          { session },
        );
        if (claimed.modifiedCount !== 1) {
          throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
        }
        const result = await applyCleanupPlan(operation, fresh, session);
        receipt = {
          operationId: String(operation._id),
          action: operation.action,
          completedAt: new Date(),
          dataFingerprint: operation.dataFingerprint,
          planHash: operation.planHash,
          backupId: operation.backupId ? String(operation.backupId) : null,
          ...result,
        };
        const finalStatus = result.externalJobs > 0 || result.unresolvedAssets.length > 0
          ? 'completed_with_warnings'
          : 'completed';
        await SystemOperation.updateOne(
          { _id: operation._id, status: 'running', idempotencyKey },
          {
            $set: {
              status: finalStatus,
              completedAt: receipt.completedAt,
              receipt,
              warnings: [
                ...(result.externalJobs > 0
                  ? [`${result.externalJobs} external cleanup jobs are pending.`]
                  : []),
                ...(result.unresolvedAssets.length > 0
                  ? [`${result.unresolvedAssets.length} legacy asset reference(s) require manual cleanup.`]
                  : []),
              ],
              backupId: operation.backupId || null,
            },
          },
          { session },
        );
        // This transactional write is the commit fence: an expired/replaced
        // executor cannot commit operational changes under a later lease.
        await renewSystemMutationLease({
          ...lease,
          ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS,
          session,
        });
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      operation = await SystemOperation.findById(operation._id);
      clearResponseCache();
      try {
        const { disconnectAllAuthenticatedSockets } = await import('../utils/socket.utils.js');
        disconnectAllAuthenticatedSockets('OPERATIONAL_DATA_EPOCH_CHANGED');
      } catch (error) {
        console.warn('[system-cleanup] Immediate socket revocation failed:', error?.message || error);
      }
      void processDueExternalCleanupJobs({ operationId: operation._id }).catch((error) => {
        console.warn('[system-cleanup] Initial external cleanup pass failed:', error?.message || error);
      });
      return operationResponse(operation);
    } catch (error) {
      if (isTransactionUnavailable(error)) {
        throw new SystemManagementError(
          'Destructive system operations require MongoDB replica-set transactions.',
          'TRANSACTIONS_REQUIRED',
          503,
        );
      }
      if (error?.code === 'PREVIEW_STALE') {
        await SystemOperation.updateOne(
          { _id: operation._id, status: 'preview' },
          { $set: { status: 'stale', error: { code: error.code, message: error.message } } },
        );
      }
      throw error;
    } finally {
      await session.endSession();
    }
  } finally {
    await releaseSystemMutationLease(lease);
  }
}

export { buildCleanupPlan };

export default {
  CLEANUP_CATEGORY_MANIFEST,
  createCleanupPreview,
  executeCleanup,
};
