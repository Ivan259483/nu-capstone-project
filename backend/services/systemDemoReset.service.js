import crypto from 'node:crypto';
import mongoose from 'mongoose';
import AccountSetupToken from '../models/accountSetupToken.model.js';
import AIServiceRequest from '../models/aIServiceRequest.model.js';
import AIScan from '../models/aiScan.model.js';
import ActivityLog from '../models/activityLog.model.js';
import Billing from '../models/billing.model.js';
import BookingSlotCounter from '../models/bookingSlotCounter.model.js';
import Category from '../models/category.model.js';
import ChatConversation from '../models/chatConversation.model.js';
import ChatMessage from '../models/chatMessage.model.js';
import ChatSession from '../models/chatSession.model.js';
import Customer from '../models/customer.model.js';
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
import Setting from '../models/setting.model.js';
import StaffVerificationIssuance from '../models/staffVerificationIssuance.model.js';
import StaffVerificationToken from '../models/staffVerificationToken.model.js';
import Store from '../models/store.model.js';
import Supplier from '../models/supplier.model.js';
import SupplierOrder from '../models/supplierOrder.model.js';
import SystemDataClassification from '../models/systemDataClassification.model.js';
import SystemOperation from '../models/systemOperation.model.js';
import User from '../models/user.model.js';
import Vehicle from '../models/vehicle.model.js';
import { waitForInFlightMutations } from '../middleware/systemLifecycle.middleware.js';
import { clearResponseCache } from '../utils/responseCache.utils.js';
import { processDueExternalCleanupJobs } from './systemExternalCleanup.service.js';
import { findUnmanagedAssetReferences } from './systemBackup.service.js';
import { DEMO_OPERATIONAL_ACTIVITY_TYPES } from './systemClassification.service.js';
import { buildExternalJobs, verifyExecutionSecret } from './systemCleanup.service.js';
import {
  DESTRUCTIVE_TRANSACTION_LEASE_MS,
  SystemManagementError,
  acquireSystemMutationLease,
  assertProtectedAdministrator,
  getSystemState,
  incrementOperationalDataEpoch,
  releaseSystemMutationLease,
  renewSystemMutationLease,
  updateLifecycleState,
} from './systemState.service.js';

const PREVIEW_TTL_MS = 15 * 60 * 1000;
export const DEMO_RESET_CONFIRMATION_PHRASE = 'RESET DEMO ENVIRONMENT';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const actorSnapshot = (actor) => ({
  id: actor?.id || actor?._id,
  name: actor?.name || '',
  email: actor?.email || '',
  role: actor?.role || '',
});
const queryWithSession = (query, session) => (session ? query.session(session) : query);
const asStrings = (values) => [...new Set(Array.from(values || [], String))].sort();
const asObjectIds = (values) => asStrings(values).map((value) => new mongoose.Types.ObjectId(value));
const stableValue = (value) => {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (value?._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) return value.map(stableValue);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};
const planHashFor = (value) => sha256(JSON.stringify(stableValue(value)));

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

const assertDemoResetMode = (state) => {
  if (state.mode === 'production') {
    throw new SystemManagementError(
      'Reset Demo Environment is not available in Production.',
      'DEMO_RESET_NOT_ALLOWED_IN_PRODUCTION',
      409,
    );
  }
  if (!['development', 'demo'].includes(state.mode)) {
    throw new SystemManagementError(
      'Reset Demo Environment is available only in Development or Demo mode.',
      'DEMO_RESET_NOT_ALLOWED_IN_CURRENT_MODE',
      409,
    );
  }
};

const idRows = async (Model, filter, session, projection = '_id') => {
  let query = Model.find(filter).select(projection).sort({ _id: 1 }).lean();
  query = queryWithSession(query, session);
  return query;
};

const FULL_RESET_MANIFEST = Object.freeze([
  { key: 'notificationStates', model: NotificationUserState, filter: {} },
  { key: 'notifications', model: Notification, filter: {} },
  { key: 'chatMessages', model: ChatMessage, filter: {} },
  { key: 'chatConversations', model: ChatConversation, filter: {} },
  { key: 'chatSessions', model: ChatSession, filter: {} },
  { key: 'qualityRetryJobs', model: QualityNotificationRetry, filter: {} },
  { key: 'invoices', model: InvoiceRecord, filter: {} },
  { key: 'billings', model: Billing, filter: {} },
  { key: 'reconciliationEvents', model: PaymentReconciliationEvent, filter: {} },
  { key: 'payments', model: Payment, filter: {} },
  { key: 'inventoryTransactions', model: InventoryTransaction, filter: {} },
  { key: 'orders', model: Order, filter: {} },
  { key: 'aiRequests', model: AIServiceRequest, filter: {} },
  { key: 'aiScans', model: AIScan, filter: {} },
  {
    key: 'activity',
    model: ActivityLog,
    filter: { type: { $in: DEMO_OPERATIONAL_ACTIVITY_TYPES } },
  },
  { key: 'supplierOrders', model: SupplierOrder, filter: {} },
  { key: 'customerProfiles', model: Customer, filter: {} },
  { key: 'vehicles', model: Vehicle, filter: {} },
  { key: 'bookingSlotCounters', model: BookingSlotCounter, filter: {} },
  { key: 'classifications', model: SystemDataClassification, filter: {} },
]);

const managedAssetOwnerAliases = Object.freeze({
  users: ['User', 'users', 'customers', 'staff'],
  vehicles: ['Vehicle', 'vehicles'],
  orders: ['Order', 'orders', 'bookings'],
  payments: ['Payment', 'payments'],
  billings: ['Billing', 'billings'],
  invoices: ['InvoiceRecord', 'invoicerecords', 'invoices'],
  notifications: ['Notification', 'notifications'],
  activity: ['ActivityLog', 'activitylogs', 'activity'],
  aiScans: ['AIScan', 'aiscans', 'ai_scans'],
  aiRequests: ['AIServiceRequest', 'aiservicerequests', 'ai_requests'],
  chatConversations: ['ChatConversation', 'chatconversations'],
  chatSessions: ['ChatSession', 'chatsessions'],
  chatMessages: ['ChatMessage', 'chatmessages'],
  supplierOrders: ['SupplierOrder', 'supplierorders', 'supplier_orders'],
  inventoryTransactions: ['InventoryTransaction', 'inventorytransactions', 'inventory_transactions'],
});

const buildManagedAssetFilter = (ids) => {
  const clauses = [];
  for (const [key, aliases] of Object.entries(managedAssetOwnerAliases)) {
    const ownerIds = ids[key] || [];
    if (!ownerIds.length) continue;
    clauses.push({ ownerCollection: { $in: aliases }, ownerId: { $in: asObjectIds(ownerIds) } });
  }
  return clauses.length ? { status: 'active', $or: clauses } : { _id: null };
};

export async function buildDemoResetPlan({ session = null } = {}) {
  const state = await getSystemState({ session, lean: true });
  assertDemoResetMode(state);
  if (!state.protectedAdministratorId) {
    throw new SystemManagementError(
      'The protected administrator must be initialized before resetting demo data.',
      'PROTECTED_ADMIN_REQUIRED',
      409,
    );
  }
  let protectedQuery = User.findOne({
    _id: state.protectedAdministratorId,
    role: 'administrator',
    isActive: { $ne: false },
    isDeleted: { $ne: true },
    isVerified: true,
    status: 'active',
  }).select('_id').lean();
  protectedQuery = queryWithSession(protectedQuery, session);
  if (!await protectedQuery) {
    throw new SystemManagementError(
      'The stored protected administrator is not a usable verified Administrator.',
      'PROTECTED_ADMIN_INVALID',
      409,
    );
  }

  const users = await idRows(
    User,
    { _id: { $ne: state.protectedAdministratorId } },
    session,
    '_id role email firebaseUid',
  );
  const ids = { users: users.map((user) => String(user._id)) };
  const userObjectIds = asObjectIds(ids.users);
  const userEmails = users.map((user) => user.email).filter(Boolean);
  const otpClauses = [
    ...(userObjectIds.length ? [{ userId: { $in: userObjectIds } }] : []),
    ...(userEmails.length ? [{ email: { $in: userEmails } }] : []),
  ];
  ids.otps = (await idRows(
    OTP, otpClauses.length ? { $or: otpClauses } : { _id: null }, session,
  )).map((row) => String(row._id));
  ids.accountSetupTokens = (await idRows(
    AccountSetupToken, { userId: { $in: userObjectIds } }, session,
  )).map((row) => String(row._id));
  ids.staffVerificationTokens = (await idRows(
    StaffVerificationToken, { userId: { $in: userObjectIds } }, session,
  )).map((row) => String(row._id));
  ids.staffVerificationIssuances = (await idRows(
    StaffVerificationIssuance, { userId: { $in: userObjectIds } }, session,
  )).map((row) => String(row._id));
  for (const entry of FULL_RESET_MANIFEST) {
    ids[entry.key] = (await idRows(entry.model, entry.filter, session)).map((row) => String(row._id));
  }
  ids.managedAssets = (await idRows(ManagedAsset, buildManagedAssetFilter(ids), session))
    .map((row) => String(row._id));

  const assetReferenceRecords = [];
  const assetModels = [
    ['users', User], ['vehicles', Vehicle], ['orders', Order], ['payments', Payment],
    ['billings', Billing], ['invoices', InvoiceRecord], ['notifications', Notification],
    ['activity', ActivityLog], ['aiScans', AIScan], ['aiRequests', AIServiceRequest],
    ['chatConversations', ChatConversation], ['chatSessions', ChatSession],
    ['chatMessages', ChatMessage], ['supplierOrders', SupplierOrder],
    ['inventoryTransactions', InventoryTransaction],
  ];
  for (const [key, Model] of assetModels) {
    if (!ids[key]?.length) continue;
    let query = Model.find({ _id: { $in: asObjectIds(ids[key]) } }).lean();
    query = queryWithSession(query, session);
    for (const document of await query) assetReferenceRecords.push({
      collection: key,
      documentId: document._id,
      document,
    });
  }
  const unresolvedAssets = await findUnmanagedAssetReferences(assetReferenceRecords, { session });

  let productsQuery = Product.find({}).select('_id inventory reserved').sort({ _id: 1 }).lean();
  let suppliersQuery = Supplier.find({}).select('_id totalSpent lastOrder').sort({ _id: 1 }).lean();
  let servicesQuery = Service.find({}).select('_id bookingCount').sort({ _id: 1 }).lean();
  [productsQuery, suppliersQuery, servicesQuery] = [productsQuery, suppliersQuery, servicesQuery]
    .map((query) => queryWithSession(query, session));
  const [products, suppliers, services] = await Promise.all([
    productsQuery, suppliersQuery, servicesQuery,
  ]);

  const roleCounts = users.reduce((counts, user) => {
    const role = String(user.role || 'other');
    counts[role] = (counts[role] || 0) + 1;
    return counts;
  }, {});
  const counts = {
    customers: Number(roleCounts.customer || 0),
    salesUsers: Number(roleCounts.sales || 0),
    qualityCheckerUsers: Number(roleCounts.staff_quality_checker || 0),
    officeAdminUsers: Number(roleCounts.office_admin || 0),
    otherNonProtectedUsers: users.length
      - Number(roleCounts.customer || 0)
      - Number(roleCounts.sales || 0)
      - Number(roleCounts.staff_quality_checker || 0)
      - Number(roleCounts.office_admin || 0),
    users: users.length,
    vehicles: ids.vehicles.length,
    bookings: ids.orders.length,
    payments: ids.payments.length,
    billingRecords: ids.billings.length,
    invoices: ids.invoices.length,
    notifications: ids.notifications.length,
    chatConversations: ids.chatConversations.length,
    chatMessages: ids.chatMessages.length,
    aiScans: ids.aiScans.length,
    aiRequests: ids.aiRequests.length,
    activityRecords: ids.activity.length,
    supplierOrders: ids.supplierOrders.length,
    inventoryTransactions: ids.inventoryTransactions.length,
    reconciliationEvents: ids.reconciliationEvents.length,
    authenticationArtifacts: ids.otps.length
      + ids.accountSetupTokens.length
      + ids.staffVerificationTokens.length
      + ids.staffVerificationIssuances.length,
    managedAssets: ids.managedAssets.length,
    unresolvedAssets: unresolvedAssets.length,
  };
  const preserved = {
    protectedAdministratorId: String(state.protectedAdministratorId),
    products: products.length,
    services: services.length,
    suppliers: suppliers.length,
    categories: await queryWithSession(Category.countDocuments({}), session),
    settings: await queryWithSession(Setting.countDocuments({}), session),
    stores: await queryWithSession(Store.countDocuments({}), session),
    systemOperations: await queryWithSession(SystemOperation.countDocuments({}), session),
  };
  const fingerprintMaterial = {
    mode: state.mode,
    operationalDataEpoch: Number(state.operationalDataEpoch || 0),
    protectedAdministratorId: String(state.protectedAdministratorId),
    ids,
    products,
    suppliers,
    services,
  };
  const planHash = planHashFor(fingerprintMaterial);
  return {
    counts,
    preserved: { ...preserved, unresolvedAssets },
    dependencies: [{
      source: 'reset_demo_environment',
      includes: ['all_non_protected_users', 'all_operational_records', 'auth_artifacts', 'managed_assets'],
    }],
    blockers: [],
    warnings: unresolvedAssets.length
      ? [`${unresolvedAssets.length} legacy asset reference(s) cannot be deleted automatically without verified ownership.`]
      : [],
    requiresBackup: false,
    dataFingerprint: planHash,
    planHash,
    stateRevision: Number(state.revision || 0),
    plan: { ids, unresolvedAssets },
  };
}

export async function createDemoResetPreview({ actor, requestMetadata = {} }) {
  const state = await getSystemState({ lean: true });
  await assertProtectedAdministrator(actor, state);
  assertDemoResetMode(state);
  const plan = await buildDemoResetPlan();
  const preview = await SystemOperation.create({
    kind: 'demo_reset',
    action: 'reset_demo_environment',
    status: 'preview',
    actor: actorSnapshot(actor),
    categories: [],
    resolvedCategories: ['all_operational_data'],
    selection: {},
    counts: plan.counts,
    preserved: plan.preserved,
    dependencies: plan.dependencies,
    blockers: [],
    warnings: plan.warnings,
    plan: plan.plan,
    planHash: plan.planHash,
    dataFingerprint: plan.dataFingerprint,
    stateRevision: plan.stateRevision,
    requiresBackup: false,
    previewExpiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
    requestMetadata,
  });
  return operationResponse(preview);
}

const deleteExpected = async (Model, ids, session, label) => {
  if (!ids.length) return 0;
  const result = await Model.deleteMany({ _id: { $in: asObjectIds(ids) } }, { session });
  if (result.deletedCount !== ids.length) {
    throw new SystemManagementError(
      `${label} changed after preview. No reset was committed.`,
      'PREVIEW_STALE',
      409,
      { collection: label, expected: ids.length, deleted: result.deletedCount },
    );
  }
  return result.deletedCount;
};

const applyDemoResetPlan = async (operation, fresh, session) => {
  const { ids } = fresh.plan;
  const deletedUserIds = asStrings(ids.users);
  const externalJobs = await buildExternalJobs(
    operation._id,
    deletedUserIds,
    ids.orders,
    ids.managedAssets,
    session,
  );

  const deleted = {};
  for (const entry of FULL_RESET_MANIFEST) {
    deleted[entry.key] = await deleteExpected(entry.model, ids[entry.key], session, entry.key);
  }
  deleted.otps = await deleteExpected(OTP, ids.otps, session, 'authentication OTPs');
  deleted.accountSetupTokens = await deleteExpected(
    AccountSetupToken, ids.accountSetupTokens, session, 'account setup tokens',
  );
  deleted.staffVerificationTokens = await deleteExpected(
    StaffVerificationToken, ids.staffVerificationTokens, session, 'staff verification tokens',
  );
  deleted.staffVerificationIssuances = await deleteExpected(
    StaffVerificationIssuance, ids.staffVerificationIssuances, session, 'staff verification issuances',
  );
  deleted.users = await deleteExpected(User, deletedUserIds, session, 'users');

  await Promise.all([
    Product.updateMany({}, { $set: { inventory: 0, reserved: 0 } }, { session }),
    Supplier.updateMany({}, { $set: { totalSpent: 0, lastOrder: null } }, { session }),
    Service.updateMany({}, { $set: { bookingCount: 0 } }, { session }),
    Store.updateMany(
      { manager: { $in: asObjectIds(deletedUserIds) } },
      { $unset: { manager: 1 } },
      { session },
    ),
  ]);
  await updateLifecycleState({
    decommissioningPhase: 'none',
    registrationEnabled: true,
    bookingsEnabled: true,
    turnoverCompletedAt: null,
    inventoryBaselineVerifiedAt: null,
    inventoryBaseline: null,
    productionEnteredAt: null,
    archivedAt: null,
  }, { session });
  const nextState = await incrementOperationalDataEpoch({ session });

  const protectedAdministrator = await User.findOne({
    _id: nextState.protectedAdministratorId,
    role: 'administrator',
    isActive: { $ne: false },
    isDeleted: { $ne: true },
    isVerified: true,
    status: 'active',
  }).select('_id').session(session).lean();
  if (!protectedAdministrator || await User.exists({ _id: { $ne: nextState.protectedAdministratorId } }).session(session)) {
    throw new SystemManagementError(
      'The protected administrator survival invariant failed. No reset was committed.',
      'PROTECTED_ADMINISTRATOR_INVARIANT_FAILED',
      409,
    );
  }
  const [remainingOrders, remainingVehicles, remainingPayments, nonzeroProducts] = await Promise.all([
    Order.countDocuments({}).session(session),
    Vehicle.countDocuments({}).session(session),
    Payment.countDocuments({}).session(session),
    Product.countDocuments({ $or: [{ inventory: { $ne: 0 } }, { reserved: { $ne: 0 } }] }).session(session),
  ]);
  if (remainingOrders || remainingVehicles || remainingPayments || nonzeroProducts) {
    throw new SystemManagementError(
      'The reset postcondition check failed. No reset was committed.',
      'DEMO_RESET_POSTCONDITION_FAILED',
      409,
    );
  }
  const preservedCounts = await Promise.all([
    Product.countDocuments({}).session(session),
    Service.countDocuments({}).session(session),
    Supplier.countDocuments({}).session(session),
    Category.countDocuments({}).session(session),
    Setting.countDocuments({}).session(session),
    Store.countDocuments({}).session(session),
  ]);
  const expectedPreservedCounts = [
    fresh.preserved.products,
    fresh.preserved.services,
    fresh.preserved.suppliers,
    fresh.preserved.categories,
    fresh.preserved.settings,
    fresh.preserved.stores,
  ];
  if (preservedCounts.some((count, index) => count !== expectedPreservedCounts[index])) {
    throw new SystemManagementError(
      'A preserved configuration collection changed during reset. No reset was committed.',
      'DEMO_RESET_PRESERVATION_FAILED',
      409,
    );
  }

  return {
    deleted,
    deletedUserIds,
    externalJobs,
    unresolvedAssets: fresh.plan.unresolvedAssets || [],
    operationalDataEpoch: Number(nextState.operationalDataEpoch || 0),
  };
};

const isTransactionUnavailable = (error) => (
  error?.code === 20
  || error?.codeName === 'IllegalOperation'
  || /transaction numbers are only allowed on a replica set member or mongos/i.test(String(error?.message || ''))
);

export async function executeDemoReset({ actor, body = {} }) {
  const previewId = String(body.previewId || '');
  const idempotencyKey = String(body.idempotencyKey || '').trim();
  if (!mongoose.isValidObjectId(previewId)) {
    throw new SystemManagementError('Demo reset preview was not found.', 'PREVIEW_NOT_FOUND', 404);
  }
  if (!idempotencyKey || idempotencyKey.length > 180) {
    throw new SystemManagementError('A valid idempotency key is required.', 'IDEMPOTENCY_KEY_REQUIRED', 400);
  }
  let operation = await SystemOperation.findById(previewId);
  if (!operation || operation.kind !== 'demo_reset' || operation.action !== 'reset_demo_environment') {
    throw new SystemManagementError('Demo reset preview was not found.', 'PREVIEW_NOT_FOUND', 404);
  }
  if (String(operation.actor.id) !== String(actor?.id || actor?._id)) {
    throw new SystemManagementError('This preview belongs to another administrator.', 'PREVIEW_ACTOR_MISMATCH', 403);
  }
  if (operation.idempotencyKey === idempotencyKey && operation.receipt) return operationResponse(operation);
  if (operation.status !== 'preview') {
    throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
  }
  if (operation.previewExpiresAt <= new Date()) {
    operation.status = 'expired';
    await operation.save();
    throw new SystemManagementError('Demo reset preview has expired.', 'PREVIEW_EXPIRED', 409);
  }
  if (String(body.planHash || '') !== operation.planHash) {
    throw new SystemManagementError('Demo reset plan hash does not match.', 'PREVIEW_STALE', 409);
  }
  const state = await getSystemState({ lean: true });
  await assertProtectedAdministrator(actor, state);
  assertDemoResetMode(state);
  if (body.phrase !== DEMO_RESET_CONFIRMATION_PHRASE) {
    throw new SystemManagementError('Confirmation phrase does not match.', 'CONFIRMATION_PHRASE_MISMATCH', 400);
  }
  await verifyExecutionSecret(actor.id || actor._id, body.password);

  const leaseState = await acquireSystemMutationLease({
    operationId: operation._id,
    owner: `system:reset_demo_environment:${actor.id || actor._id}`,
    ttlMs: 120_000,
  });
  const lease = {
    operationId: operation._id,
    fencingToken: leaseState.mutationLease?.fencingToken,
  };
  let disconnectedUserIds = [];
  try {
    await waitForInFlightMutations({ timeoutMs: 15_000 });
    await renewSystemMutationLease({ ...lease, ttlMs: DESTRUCTIVE_TRANSACTION_LEASE_MS });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const fresh = await buildDemoResetPlan({ session });
        if (fresh.planHash !== operation.planHash) {
          throw new SystemManagementError(
            'Operational data changed after preview. No records were deleted.',
            'PREVIEW_STALE',
            409,
          );
        }
        const claimed = await SystemOperation.updateOne(
          { _id: operation._id, status: 'preview', idempotencyKey: null },
          { $set: { status: 'running', idempotencyKey, consumedAt: new Date() } },
          { session },
        );
        if (claimed.modifiedCount !== 1) {
          throw new SystemManagementError('This preview has already been consumed.', 'PREVIEW_ALREADY_CONSUMED', 409);
        }
        const result = await applyDemoResetPlan(operation, fresh, session);
        disconnectedUserIds = result.deletedUserIds;
        const completedAt = new Date();
        const receipt = {
          operationId: String(operation._id),
          action: operation.action,
          completedAt,
          dataFingerprint: operation.dataFingerprint,
          planHash: operation.planHash,
          deleted: result.deleted,
          externalJobs: result.externalJobs,
          unresolvedAssets: result.unresolvedAssets,
          operationalDataEpoch: result.operationalDataEpoch,
          protectedAdministratorId: fresh.preserved.protectedAdministratorId,
          preserved: {
            products: fresh.preserved.products,
            services: fresh.preserved.services,
            suppliers: fresh.preserved.suppliers,
            categories: fresh.preserved.categories,
            settings: fresh.preserved.settings,
            stores: fresh.preserved.stores,
          },
        };
        const finalStatus = result.externalJobs > 0 || result.unresolvedAssets.length > 0
          ? 'completed_with_warnings'
          : 'completed';
        await SystemOperation.updateOne(
          { _id: operation._id, status: 'running', idempotencyKey },
          {
            $set: {
              status: finalStatus,
              completedAt,
              receipt,
              warnings: [
                ...(result.externalJobs > 0
                  ? [`${result.externalJobs} external cleanup jobs are pending.`]
                  : []),
                ...(result.unresolvedAssets.length > 0
                  ? [`${result.unresolvedAssets.length} legacy asset reference(s) require manual cleanup.`]
                  : []),
              ],
            },
          },
          { session },
        );
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
        const { disconnectUserSockets } = await import('../utils/socket.utils.js');
        disconnectUserSockets(disconnectedUserIds, 'DEMO_ENVIRONMENT_RESET');
      } catch (error) {
        console.warn('[system-demo-reset] Socket revocation failed:', error?.message || error);
      }
      void processDueExternalCleanupJobs({ operationId: operation._id }).catch((error) => {
        console.warn('[system-demo-reset] Initial external cleanup pass failed:', error?.message || error);
      });
      return operationResponse(operation);
    } catch (error) {
      if (isTransactionUnavailable(error)) {
        throw new SystemManagementError(
          'Reset Demo Environment requires MongoDB replica-set transactions.',
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
