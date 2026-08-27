import ExternalCleanupJob from '../models/externalCleanupJob.model.js';
import Order from '../models/order.model.js';
import PaymentReconciliationEvent from '../models/paymentReconciliationEvent.model.js';
import Product from '../models/product.model.js';
import SystemBackup from '../models/systemBackup.model.js';
import SystemOperation from '../models/systemOperation.model.js';
import User from '../models/user.model.js';
import { getClassificationSummary } from './systemClassification.service.js';
import {
  getSystemCapabilities,
  getSystemState,
} from './systemState.service.js';

const safeOperation = (operation, { includeSensitive = false } = {}) => ({
  id: String(operation._id),
  kind: operation.kind,
  action: operation.action,
  status: operation.status,
  ...(includeSensitive ? { actor: operation.actor } : {}),
  categories: operation.categories,
  resolvedCategories: operation.resolvedCategories,
  counts: operation.counts,
  warnings: operation.warnings,
  externalCleanup: operation.externalCleanup,
  error: operation.error,
  ...(includeSensitive ? {
    blockers: operation.blockers,
    backupId: operation.backupId ? String(operation.backupId) : null,
    receipt: operation.receipt,
  } : {}),
  createdAt: operation.createdAt,
  completedAt: operation.completedAt,
});

const safeBackup = (backup, { includeSensitive = false } = {}) => {
  if (!backup) return null;
  if (includeSensitive) return backup;
  return {
    id: String(backup._id),
    status: backup.status,
    purpose: backup.purpose,
    lifecycleEligible: backup.lifecycleEligible === true,
    createdAt: backup.createdAt,
    downloadVerifiedAt: backup.downloadVerifiedAt,
    assetCoverage: backup.assetCoverage,
  };
};

export async function getSystemOverview(user) {
  const state = await getSystemState({ lean: true });
  const capabilities = await getSystemCapabilities(user, state);
  const [
    classificationSummary,
    usersByRole,
    orderCount,
    activeOrderCount,
    latestBackup,
    operations,
    externalCleanup,
    reconciliationPending,
  ] = await Promise.all([
    getClassificationSummary({ reconcile: false }),
    User.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    Order.countDocuments({}),
    Order.countDocuments({
      status: { $nin: ['completed', 'paid', 'released', 'cancelled', 'rejected'] },
      archived: { $ne: true },
    }),
    SystemBackup.findOne({}).select('-artifact').sort({ createdAt: -1 }).lean(),
    SystemOperation.find({}).sort({ createdAt: -1 }).limit(25).lean(),
    ExternalCleanupJob.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PaymentReconciliationEvent.countDocuments({ status: 'pending' }),
  ]);

  const result = {
    state: {
      mode: state.mode,
      phase: state.decommissioningPhase,
      registrationEnabled: state.registrationEnabled,
      bookingEnabled: state.bookingsEnabled,
      revision: state.revision,
      operationalDataEpoch: state.operationalDataEpoch,
      protectedAdministratorId: state.protectedAdministratorId
        ? String(state.protectedAdministratorId)
        : null,
      turnoverCompletedAt: state.turnoverCompletedAt,
      inventoryBaselineVerifiedAt: state.inventoryBaselineVerifiedAt,
      productionEnteredAt: state.productionEnteredAt,
      archivedAt: state.archivedAt,
      updatedAt: state.updatedAt,
    },
    capabilities,
    counts: {
      usersByRole: Object.fromEntries(usersByRole.map((row) => [row._id, row.count])),
      orders: orderCount,
      activeOrders: activeOrderCount,
      pendingReconciliationEvents: reconciliationPending,
      externalCleanupByStatus: Object.fromEntries(externalCleanup.map((row) => [row._id, row.count])),
    },
    classificationSummary,
    latestBackup: safeBackup(latestBackup, { includeSensitive: capabilities.protectedAdministrator }),
    operations: operations.map((operation) => safeOperation(operation, {
      includeSensitive: capabilities.protectedAdministrator,
    })),
  };

  if (capabilities.protectedAdministrator) {
    const [handoverCandidates, inventoryProducts] = await Promise.all([
      User.find({
        role: 'office_admin',
        isActive: true,
        isVerified: true,
        status: 'active',
        isDeleted: { $ne: true },
        password: { $type: 'string', $ne: '' },
        lastPasswordOtpSignInAt: { $type: 'date' },
      }).select('_id name email isVerified status +lastPasswordOtpSignInAt').sort({ name: 1 }).lean(),
      Product.find({ isActive: { $ne: false } })
        .select('_id name sku isActive inventory reserved')
        .sort({ name: 1 })
        .lean(),
    ]);
    result.handoverCandidates = handoverCandidates.map((candidate) => ({
      id: String(candidate._id),
      name: candidate.name,
      email: candidate.email,
      isVerified: candidate.isVerified,
      status: candidate.status,
      passwordOtpSignInComplete: Boolean(candidate.lastPasswordOtpSignInAt),
    }));
    result.inventoryProducts = inventoryProducts.map((product) => ({
      id: String(product._id),
      name: product.name,
      sku: product.sku || '',
      isActive: product.isActive !== false,
      inventory: Number(product.inventory || 0),
      reserved: Number(product.reserved || 0),
    }));
  }

  return result;
}

export async function getSystemOperation(operationId) {
  const operation = await SystemOperation.findById(operationId).lean();
  return operation ? safeOperation(operation, { includeSensitive: true }) : null;
}

export async function listPaymentReconciliationEvents({ status, limit = 50 } = {}) {
  const filter = status ? { status } : {};
  return PaymentReconciliationEvent.find(filter)
    .sort({ receivedAt: -1 })
    .limit(Math.min(200, Math.max(1, Number(limit) || 50)))
    .lean();
}

export async function reviewPaymentReconciliationEvent({ eventId, actorId, status, notes }) {
  if (!['reviewed', 'dismissed'].includes(status)) return null;
  return PaymentReconciliationEvent.findOneAndUpdate(
    { _id: eventId, status: { $in: ['pending', 'reviewed'] } },
    {
      $set: {
        status,
        reviewedAt: new Date(),
        reviewedBy: actorId,
        notes: String(notes || '').slice(0, 2000) || null,
      },
    },
    { new: true },
  ).lean();
}

export default {
  getSystemOverview,
  getSystemOperation,
  listPaymentReconciliationEvents,
  reviewPaymentReconciliationEvent,
};
