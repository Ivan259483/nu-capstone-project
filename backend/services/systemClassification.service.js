import mongoose from 'mongoose';
import ActivityLog from '../models/activityLog.model.js';
import AIServiceRequest from '../models/aIServiceRequest.model.js';
import AIScan from '../models/aiScan.model.js';
import ChatConversation from '../models/chatConversation.model.js';
import ChatSession from '../models/chatSession.model.js';
import InventoryTransaction from '../models/inventoryTransaction.model.js';
import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import SupplierOrder from '../models/supplierOrder.model.js';
import SystemDataClassification, {
  DATA_ENVIRONMENTS,
} from '../models/systemDataClassification.model.js';
import User from '../models/user.model.js';
import Vehicle from '../models/vehicle.model.js';
import { OPERATIONAL_ACTIVITY_TYPES } from '../plugins/operationalClassification.plugin.js';
import {
  SystemManagementError,
  getSystemState,
} from './systemState.service.js';

const asLabel = (value, fallback) => {
  const normalized = String(value || '').trim();
  return (normalized || fallback).slice(0, 300);
};

// ActivityLog also contains authentication, account-administration, security,
// settings, and system-error audit records. Those are authoritative audit
// evidence and are deliberately outside the demo operational-data manifest.
export const DEMO_OPERATIONAL_ACTIVITY_TYPES = OPERATIONAL_ACTIVITY_TYPES;

export const OPERATIONAL_ROOTS = Object.freeze({
  customers: Object.freeze({
    model: User,
    filter: { role: 'customer' },
    projection: 'name email createdAt',
    label: (doc) => asLabel(`${doc.name || ''} ${doc.email || ''}`, `Customer ${doc._id}`),
  }),
  vehicles: Object.freeze({
    model: Vehicle,
    filter: {},
    projection: 'year make model plateNumber createdAt',
    label: (doc) => asLabel(
      [doc.year, doc.make, doc.model, doc.plateNumber].filter(Boolean).join(' '),
      `Vehicle ${doc._id}`,
    ),
  }),
  orders: Object.freeze({
    model: Order,
    filter: {},
    projection: 'orderNumber bookingReference customerName createdAt',
    label: (doc) => asLabel(
      doc.orderNumber || doc.bookingReference || doc.customerName,
      `Order ${doc._id}`,
    ),
  }),
  notifications: Object.freeze({
    model: Notification,
    filter: {},
    projection: 'title event createdAt',
    label: (doc) => asLabel(doc.title || doc.event, `Notification ${doc._id}`),
  }),
  activity: Object.freeze({
    model: ActivityLog,
    filter: { type: { $in: DEMO_OPERATIONAL_ACTIVITY_TYPES } },
    projection: 'title action type createdAt',
    label: (doc) => asLabel(doc.title || doc.action || doc.type, `Activity ${doc._id}`),
  }),
  ai_scans: Object.freeze({
    model: AIScan,
    filter: {},
    projection: 'summary source createdAt',
    label: (doc) => asLabel(doc.summary || doc.source, `AI scan ${doc._id}`),
  }),
  ai_requests: Object.freeze({
    model: AIServiceRequest,
    filter: {},
    projection: 'status analysisSource createdAt',
    label: (doc) => asLabel(doc.status || doc.analysisSource, `AI request ${doc._id}`),
  }),
  chat_conversations: Object.freeze({
    model: ChatConversation,
    filter: {},
    projection: 'title customerName conversationId createdAt',
    label: (doc) => asLabel(
      doc.title || doc.customerName || doc.conversationId,
      `Conversation ${doc._id}`,
    ),
  }),
  chat_sessions: Object.freeze({
    model: ChatSession,
    filter: {},
    projection: 'leadName leadEmail sessionId createdAt',
    label: (doc) => asLabel(doc.leadName || doc.leadEmail || doc.sessionId, `Chat session ${doc._id}`),
  }),
  supplier_orders: Object.freeze({
    model: SupplierOrder,
    filter: {},
    projection: 'status amount orderDate createdAt',
    label: (doc) => asLabel(
      `${doc.status || 'Supplier order'} ${doc.orderDate ? new Date(doc.orderDate).toISOString().slice(0, 10) : ''}`,
      `Supplier order ${doc._id}`,
    ),
  }),
  inventory_transactions: Object.freeze({
    model: InventoryTransaction,
    filter: {},
    projection: 'type quantity referenceModel createdAt',
    label: (doc) => asLabel(
      `${doc.type || 'Inventory'} ${doc.quantity ?? ''} ${doc.referenceModel || ''}`,
      `Inventory transaction ${doc._id}`,
    ),
  }),
});

const STAFF_CLASSIFICATION_ROOT = Object.freeze({
  model: User,
  filter: { role: { $in: ['office_admin', 'sales', 'staff_quality_checker'] } },
  projection: 'name email role createdAt',
  label: (doc) => asLabel(
    `${doc.name || ''} ${doc.email || ''} ${doc.role || ''}`,
    `Staff ${doc._id}`,
  ),
});

export const CLASSIFICATION_ROOTS = Object.freeze({
  ...OPERATIONAL_ROOTS,
  staff: STAFF_CLASSIFICATION_ROOT,
});

export const OPERATIONAL_ROOT_NAMES = Object.freeze(Object.keys(CLASSIFICATION_ROOTS));

const inheritedEnvironmentForMode = (mode) => (
  mode === 'production' || mode === 'archived' ? 'production' : 'demo'
);

const validateRoot = (collectionName) => {
  const root = CLASSIFICATION_ROOTS[collectionName];
  if (!root) {
    throw new SystemManagementError(
      `Unsupported operational collection: ${collectionName}`,
      'INVALID_CLASSIFICATION_COLLECTION',
      400,
      { allowed: OPERATIONAL_ROOT_NAMES },
    );
  }
  return root;
};

/**
 * Creation paths may call this after persisting an operational root. The
 * registry, rather than email/name heuristics, records the active system mode.
 */
export async function classifyNewOperationalRecord({
  collectionName,
  documentId,
  label = '',
  session = null,
} = {}) {
  const root = validateRoot(collectionName);
  if (!mongoose.isValidObjectId(documentId)) {
    throw new SystemManagementError('Invalid operational record ID.', 'INVALID_DOCUMENT_ID', 400);
  }
  const state = await getSystemState({ session, lean: true });
  const dataEnvironment = inheritedEnvironmentForMode(state.mode);
  const now = new Date();
  let rootUpdate = root.model.updateOne(
    { _id: documentId, ...root.filter },
    {
      $set: {
        dataEnvironment,
        classificationMetadata: {
          source: 'mode_default',
          reviewed: true,
          classifiedAt: now,
          systemRevision: Number(state.revision || 0),
        },
      },
    },
    { runValidators: true },
  );
  if (session) rootUpdate = rootUpdate.session(session);
  const rootResult = await rootUpdate;
  if (rootResult.matchedCount !== 1) {
    throw new SystemManagementError(
      `Operational record ${collectionName}/${documentId} was not found.`,
      'CLASSIFICATION_RECORD_NOT_FOUND',
      404,
    );
  }
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  if (session) options.session = session;
  return SystemDataClassification.findOneAndUpdate(
    { collectionName, documentId },
    {
      $setOnInsert: {
        collectionName,
        documentId,
        dataEnvironment,
        label: asLabel(label, `${collectionName} ${documentId}`),
        classifiedAt: now,
        source: 'mode_default',
        reviewed: true,
      },
    },
    options,
  );
}

/**
 * Reconciles records written since the current mode began. Records predating
 * the singleton/mode boundary remain unclassified until a human reviews them.
 */
export async function reconcileNewOperationalClassifications({ session = null } = {}) {
  const state = await getSystemState({ session, lean: true });
  const boundary = state.modeStartedAt || state.createdAt;
  if (!boundary) return { classified: 0 };
  const dataEnvironment = inheritedEnvironmentForMode(state.mode);
  let classified = 0;

  for (const [collectionName, root] of Object.entries(CLASSIFICATION_ROOTS)) {
    let idsQuery = root.model.find({
      ...root.filter,
      createdAt: { $gte: boundary },
    }).select('_id').lean();
    if (session) idsQuery = idsQuery.session(session);
    const candidateIds = (await idsQuery).map((entry) => entry._id);
    if (!candidateIds.length) continue;

    let existingQuery = SystemDataClassification.find({
      collectionName,
      documentId: { $in: candidateIds },
    }).select('documentId').lean();
    if (session) existingQuery = existingQuery.session(session);
    const existing = new Set((await existingQuery).map((entry) => String(entry.documentId)));
    const missingIds = candidateIds.filter((id) => !existing.has(String(id)));
    if (!missingIds.length) continue;

    const operations = missingIds.map((documentId) => ({
      updateOne: {
        filter: { collectionName, documentId },
        update: {
          $setOnInsert: {
            collectionName,
            documentId,
            dataEnvironment,
            label: `${collectionName} ${documentId}`,
            classifiedAt: new Date(),
            source: 'mode_default',
            reviewed: true,
          },
        },
        upsert: true,
      },
    }));
    const result = await SystemDataClassification.bulkWrite(
      operations,
      session ? { session, ordered: false } : { ordered: false },
    );
    await root.model.updateMany(
      {
        _id: { $in: missingIds },
        $or: [
          { dataEnvironment: { $exists: false } },
          { dataEnvironment: null },
          { dataEnvironment: 'unclassified' },
        ],
      },
      {
        $set: {
          dataEnvironment,
          classificationMetadata: {
            source: 'mode_default',
            reviewed: true,
            classifiedAt: new Date(),
            systemRevision: Number(state.revision || 0),
          },
        },
      },
      session ? { session, runValidators: true } : { runValidators: true },
    );
    classified += Number(result.upsertedCount || 0);
  }

  return { classified };
}

const liveClassifiedCounts = async (collectionName, _root, session = null) => {
  const [demo, production] = await Promise.all([
    getClassifiedDocumentIds(collectionName, 'demo', { session }),
    getClassifiedDocumentIds(collectionName, 'production', { session }),
  ]);
  return { demo: demo.length, production: production.length };
};

export async function getClassificationSummary({ session = null, reconcile = true } = {}) {
  if (reconcile) await reconcileNewOperationalClassifications({ session });
  const collections = {};
  const totals = { total: 0, demo: 0, production: 0, unclassified: 0 };

  for (const [collectionName, root] of Object.entries(OPERATIONAL_ROOTS)) {
    let totalQuery = root.model.countDocuments(root.filter);
    if (session) totalQuery = totalQuery.session(session);
    const total = await totalQuery;
    const classified = await liveClassifiedCounts(collectionName, root, session);
    const item = {
      total,
      demo: Number(classified.demo || 0),
      production: Number(classified.production || 0),
      unclassified: Math.max(0, total - Number(classified.demo || 0) - Number(classified.production || 0)),
    };
    collections[collectionName] = item;
    for (const key of Object.keys(totals)) totals[key] += item[key];
  }

  return { ...totals, collections };
}

const classifiedIds = async (collectionName, environment, session = null) => {
  let query = SystemDataClassification.find({
    collectionName,
    dataEnvironment: environment,
  }).select('documentId').lean();
  if (session) query = query.session(session);
  return (await query).map((entry) => entry.documentId);
};

export async function getClassifiedDocumentIds(collectionName, environment, {
  requestedIds = null,
  session = null,
} = {}) {
  const root = validateRoot(collectionName);
  if (!DATA_ENVIRONMENTS.includes(environment)) {
    throw new SystemManagementError('Invalid data environment.', 'INVALID_DATA_ENVIRONMENT', 400);
  }
  const filter = { ...root.filter };
  if (Array.isArray(requestedIds)) {
    const ids = [...new Set(requestedIds.map(String))];
    if (ids.some((id) => !mongoose.isValidObjectId(id))) {
      throw new SystemManagementError('Selection contains an invalid record ID.', 'INVALID_DOCUMENT_ID', 400);
    }
    filter._id = { $in: ids };
  }

  if (environment === 'unclassified') {
    const classified = await SystemDataClassification.find({
      collectionName,
      dataEnvironment: { $in: ['demo', 'production'] },
    }).distinct('documentId').session(session || null);
    filter._id = {
      ...(filter._id || {}),
      $nin: classified,
    };
  } else {
    const environmentIds = await classifiedIds(collectionName, environment, session);
    const requested = filter._id?.$in;
    filter._id = {
      $in: requested
        ? environmentIds.filter((id) => requested.some((requestedId) => String(requestedId) === String(id)))
        : environmentIds,
    };
  }

  let query = root.model.find(filter).select('_id').lean();
  if (session) query = query.session(session);
  return (await query).map((entry) => entry._id);
}

export async function listClassifications({
  collectionName = 'orders',
  environment,
  page = 1,
  limit = 50,
} = {}) {
  const root = validateRoot(collectionName);
  if (environment && !DATA_ENVIRONMENTS.includes(environment)) {
    throw new SystemManagementError('Invalid data environment.', 'INVALID_DATA_ENVIRONMENT', 400);
  }
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const filter = { ...root.filter };

  if (environment === 'unclassified') {
    const classified = await SystemDataClassification.find({
      collectionName,
      dataEnvironment: { $in: ['demo', 'production'] },
    }).distinct('documentId');
    filter._id = { $nin: classified };
  } else if (environment) {
    filter._id = { $in: await classifiedIds(collectionName, environment) };
  }

  const [total, documents] = await Promise.all([
    root.model.countDocuments(filter),
    root.model.find(filter)
      .select(root.projection)
      .sort({ createdAt: -1, _id: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
  ]);
  const ids = documents.map((document) => document._id);
  const rows = await SystemDataClassification.find({
    collectionName,
    documentId: { $in: ids },
  }).lean();
  const byId = new Map(rows.map((row) => [String(row.documentId), row]));
  const items = documents.map((document) => {
    const row = byId.get(String(document._id));
    return {
      collection: collectionName,
      documentId: String(document._id),
      label: row?.label || root.label(document),
      dataEnvironment: row?.dataEnvironment || 'unclassified',
      classifiedAt: row?.classifiedAt || null,
      classifiedBy: row?.classifiedBy ? String(row.classifiedBy) : null,
      reviewed: Boolean(row?.reviewed),
      createdAt: document.createdAt || null,
    };
  });

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.max(1, Math.ceil(total / safeLimit)),
    },
    summary: await getClassificationSummary({ reconcile: false }),
  };
}

export async function updateClassifications({ items, reviewed, actorId }) {
  if (reviewed !== true) {
    throw new SystemManagementError(
      'Classification changes must be explicitly reviewed.',
      'CLASSIFICATION_REVIEW_REQUIRED',
      400,
    );
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 500) {
    throw new SystemManagementError(
      'Provide between 1 and 500 classification items.',
      'INVALID_CLASSIFICATION_BATCH',
      400,
    );
  }
  if (!mongoose.isValidObjectId(actorId)) {
    throw new SystemManagementError('A valid actor is required.', 'INVALID_ACTOR', 400);
  }

  const transactionUnavailable = (error) => (
    error?.code === 20
    || error?.codeName === 'IllegalOperation'
    || /transaction numbers are only allowed on a replica set member or mongos/i.test(String(error?.message || ''))
  );
  const session = await mongoose.startSession();
  let updated = 0;
  try {
    await session.withTransaction(async () => {
      const state = await getSystemState({ session, lean: true });
      if (!['development', 'demo'].includes(state.mode)) {
        throw new SystemManagementError(
          'Operational data classification is available only in Development or Demo mode.',
          'CLASSIFICATION_MODE_BLOCKED',
          409,
        );
      }

      const normalized = [];
      for (const item of items) {
        const root = validateRoot(item?.collection);
        const documentId = String(item?.documentId || '');
        if (!mongoose.isValidObjectId(documentId)) {
          throw new SystemManagementError('Classification contains an invalid record ID.', 'INVALID_DOCUMENT_ID', 400);
        }
        if (!DATA_ENVIRONMENTS.includes(item?.dataEnvironment)) {
          throw new SystemManagementError('Classification contains an invalid environment.', 'INVALID_DATA_ENVIRONMENT', 400);
        }
        const document = await root.model.findOne({ _id: documentId, ...root.filter })
          .select(root.projection)
          .session(session)
          .lean();
        if (!document) {
          throw new SystemManagementError(
            `Operational record ${item.collection}/${documentId} was not found.`,
            'CLASSIFICATION_RECORD_NOT_FOUND',
            404,
          );
        }
        normalized.push({
          model: root.model,
          rootFilter: root.filter,
          collectionName: item.collection,
          documentId,
          dataEnvironment: item.dataEnvironment,
          label: root.label(document),
        });
      }

      const now = new Date();
      await SystemDataClassification.bulkWrite(normalized.map((item) => ({
        updateOne: {
          filter: { collectionName: item.collectionName, documentId: item.documentId },
          update: {
            $set: {
              dataEnvironment: item.dataEnvironment,
              label: item.label,
              classifiedAt: now,
              classifiedBy: actorId,
              source: 'manual',
              reviewed: true,
            },
          },
          upsert: true,
        },
      })), { ordered: true, session });

      for (const item of normalized) {
        const result = await item.model.updateOne(
          { _id: item.documentId, ...item.rootFilter },
          {
            $set: {
              dataEnvironment: item.dataEnvironment,
              classificationMetadata: {
                source: 'manual',
                reviewed: true,
                classifiedAt: now,
                classifiedBy: actorId,
                systemRevision: Number(state.revision || 0),
              },
            },
          },
          { runValidators: true, session },
        );
        if (result.matchedCount !== 1) {
          throw new SystemManagementError(
            `Operational record ${item.collectionName}/${item.documentId} changed during classification.`,
            'CLASSIFICATION_RECORD_STALE',
            409,
          );
        }
      }
      updated = normalized.length;
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary',
    });
  } catch (error) {
    if (transactionUnavailable(error)) {
      throw new SystemManagementError(
        'Classification updates require MongoDB replica-set transactions.',
        'TRANSACTIONS_REQUIRED',
        503,
      );
    }
    throw error;
  } finally {
    await session.endSession();
  }

  return {
    updated,
    summary: await getClassificationSummary({ reconcile: false }),
  };
}

export default {
  OPERATIONAL_ROOTS,
  CLASSIFICATION_ROOTS,
  OPERATIONAL_ROOT_NAMES,
  classifyNewOperationalRecord,
  reconcileNewOperationalClassifications,
  getClassificationSummary,
  getClassifiedDocumentIds,
  listClassifications,
  updateClassifications,
};
