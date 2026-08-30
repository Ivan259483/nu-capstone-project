import crypto from 'node:crypto';
import { promisify } from 'node:util';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import ManagedAsset from '../models/managedAsset.model.js';
import SystemBackup, { SYSTEM_BACKUP_PURPOSES } from '../models/systemBackup.model.js';
import SystemOperation from '../models/systemOperation.model.js';
import {
  SystemManagementError,
  assertSystemMutationAllowed,
} from './systemState.service.js';

export const BACKUP_MAGIC = Buffer.from('AUTOSPF1\n', 'ascii');
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_CONTENT_TYPE = 'application/vnd.autospf.backup';
export const SCRYPT_PARAMETERS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 32 });

const scryptAsync = promisify(crypto.scrypt);
const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_ASSET_BYTES = 250 * 1024 * 1024;
const LIFECYCLE_BACKUP_PURPOSE = 'lifecycle';

const EXCLUDED_BACKUP_COLLECTIONS = new Set([
  'systembackups',
  'systemmutationadmissions',
  'otps',
  'accountsetuptokens',
  'staffverificationtokens',
  'staffverificationissuances',
]);

const EXCLUDED_FINGERPRINT_COLLECTIONS = new Set([
  'systemstates',
  'systemoperations',
  'systembackups',
  'systemmutationadmissions',
  'externalcleanupjobs',
  'paymentreconciliationevents',
  'otps',
  'accountsetuptokens',
  'staffverificationtokens',
  'staffverificationissuances',
]);

const TRANSIENT_BACKUP_KEYS = new Set([
  'otp',
  'otpHash',
  'tokenHash',
  'loginChallengeHash',
  'expoPushTokens',
  'accessToken',
  'refreshToken',
  'mutationLease',
  'fencingToken',
]);

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const scalarFields = (...names) => Object.fromEntries(names.map((name) => [name, true]));
const timestamps = scalarFields('createdAt', 'updatedAt');
const classificationFields = scalarFields('dataEnvironment');
const priceBreakdown = scalarFields('base', 'original', 'addon');

// Reporting exports are DTOs, not filtered database dumps. Adding a collection
// or field requires an explicit review here; arbitrary/Mixed subdocuments are
// never traversed.
const SAFE_EXPORT_SCHEMAS = Object.freeze({
  users: {
    ...scalarFields(
      '_id', 'name', 'email', 'role', 'phone', 'phoneNumber', 'contactNumber',
      'mobileNumber', 'contactNo', 'address', 'isVerified', 'isActive',
      'loyaltyPoints', 'loyaltyTier', 'isDeleted', 'deletedAt', 'status', 'archivedAt',
    ),
    ...timestamps,
  },
  customers: {
    ...scalarFields('_id', 'user', 'preferredStore', 'loyaltyPoints'),
    vehicles: [true],
    bookings: [true],
    notificationPreferences: scalarFields(
      'pushEnabled', 'emailEnabled', 'bookingConfirmation',
      'jobStatusUpdates', 'paymentReminders', 'vehicleReminders',
    ),
    ...timestamps,
  },
  vehicles: {
    ...scalarFields(
      '_id', 'customer', 'year', 'make', 'model', 'color', 'plateNumber',
      'vehicleType', 'transmission', 'fuelType',
    ),
    ...timestamps,
    ...classificationFields,
  },
  orders: {
    ...scalarFields(
      '_id', 'orderNumber', 'customer', 'vehicle', 'customerName', 'customerPhone',
      'serviceId', 'serviceType', 'subtotal', 'discountAmount', 'taxVatAmount',
      'additionalFees', 'serviceTotal', 'amountCollected', 'totalAmount', 'totalPrice',
      'downPaymentAmount', 'finalPaymentAmount', 'invoiceId', 'paymentStatus',
      'paymentMethod', 'paymentProvider', 'paidAt', 'posQueueStatus',
      'readyForPickupEvidenceComplete', 'readyForPaymentAt', 'inventoryDeductedAt',
      'customerStatus', 'customerStatusUpdatedAt', 'status', 'paymentProofUrl',
      'approvedAt', 'approvedBy', 'arrivedAt', 'cancelledAt', 'cancelledBy',
      'cancellationReason', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'archived',
      'archivedAt', 'archivedReason', 'shippingAddress', 'vehicleYear', 'vehicleMake',
      'vehicleModel', 'vehicleColor', 'vehiclePlate', 'bookingReference', 'bookingDate',
      'bookingTime', 'isWalkIn', 'assignedDetailer', 'currentStepIndex',
    ),
    items: [{ ...scalarFields('_id', 'product', 'name', 'quantity', 'price') }],
    inventoryReservation: {
      ...scalarFields('status', 'reservedAt', 'committedAt'),
      items: [{ ...scalarFields('_id', 'product', 'productName', 'quantity', 'reservedAt') }],
    },
    workflow: { ...scalarFields('currentStep', 'status'), completedSteps: [true] },
    rating: scalarFields('score', 'comment', 'ratedAt'),
    ...timestamps,
    ...classificationFields,
  },
  products: {
    ...scalarFields(
      '_id', 'name', 'description', 'price', 'category', 'supplier', 'inventory',
      'reserved', 'minLevel', 'maxLevel', 'unit', 'sku', 'isActive',
    ),
    images: [true],
    ...timestamps,
  },
  services: {
    ...scalarFields(
      '_id', 'name', 'category', 'billingGroup', 'displayOrder', 'duration', 'basePrice',
      'memberPrice', 'status', 'isPublished', 'bookingCount', 'lastUpdatedAt',
    ),
    prices: scalarFields('hatchback', 'sedan', 'midsized', 'suv', 'pickup', 'largesuv', 'highend'),
    pricing: {
      hatchback: priceBreakdown,
      sedan: priceBreakdown,
      midsized: priceBreakdown,
      suv: priceBreakdown,
      pickup: priceBreakdown,
      largeSuv: priceBreakdown,
      highend: priceBreakdown,
    },
    ...timestamps,
  },
  suppliers: {
    ...scalarFields('_id', 'name', 'contactPerson', 'email', 'phone', 'lastOrder', 'totalSpent'),
    products: [true],
    ...timestamps,
  },
  categories: {
    ...scalarFields('_id', 'name', 'description', 'slug', 'isActive'),
    ...timestamps,
  },
  payments: {
    ...scalarFields(
      '_id', 'invoiceId', 'order', 'customer', 'vehicle', 'service', 'amount', 'currency',
      'status', 'transactionType', 'amountSubmitted', 'amountVerified', 'method', 'provider',
      'providerReference', 'paymentReference', 'proofImage', 'submittedAt', 'effectiveAt',
      'reviewedAt', 'reviewedBy', 'reviewReason', 'relatedPayment', 'refundReason',
      'refundedBy', 'staffAssigned', 'cashReceived', 'amountReceived', 'changeGiven',
      'subtotal', 'discountAmount', 'taxVatAmount', 'additionalFees', 'downpayment',
      'grandTotal', 'amountPaid', 'balanceRemaining', 'billingVersion', 'invoiceRecord',
    ),
    splitPayments: [{ ...scalarFields('_id', 'method', 'amount') }],
    verificationChecklist: scalarFields('amount', 'identity', 'timestamp', 'reference'),
    discount: scalarFields('discountType', 'value', 'reason'),
    items: [{ ...scalarFields('_id', 'serviceId', 'name', 'price', 'quantity', 'isAddon') }],
    ...timestamps,
    ...classificationFields,
  },
  billings: {
    ...scalarFields(
      '_id', 'order', 'status', 'taxVatAmount', 'additionalFees', 'downpayment',
      'version', 'lastEditedBy', 'dedupeByServiceId',
    ),
    lineItems: [{ ...scalarFields('_id', 'serviceId', 'name', 'billingGroup', 'unitPrice', 'quantity', 'vehicleTier') }],
    discount: scalarFields('discountType', 'value', 'reason'),
    computed: scalarFields('subtotal', 'discountTotal', 'taxVatTotal', 'additionalFeesTotal', 'grandTotal', 'balanceDue'),
    events: [{ ...scalarFields('at', 'userId', 'action', 'summary') }],
    ...timestamps,
  },
  invoicerecords: {
    ...scalarFields('_id', 'invoiceNumber', 'order', 'billingVersion', 'payment', 'pdfUrl', 'createdBy'),
    signatures: scalarFields('clientName', 'clientSignedAt', 'salesName', 'salesSignedAt'),
    ...timestamps,
  },
  supplierorders: {
    ...scalarFields('_id', 'supplier', 'orderDate', 'status', 'amount'),
    items: [true],
    ...timestamps,
    ...classificationFields,
  },
  inventorytransactions: {
    ...scalarFields(
      '_id', 'product', 'type', 'quantity', 'previousStock', 'newStock',
      'referenceId', 'referenceModel', 'notes',
    ),
    ...timestamps,
    ...classificationFields,
  },
  notifications: {
    ...scalarFields(
      '_id', 'title', 'message', 'type', 'event', 'category', 'severity', 'source',
      'actionRequired', 'isRead', 'readAt', 'recipientRole', 'priority', 'recipientUserId',
      'link', 'actionType', 'actionId', 'resolvedAt', 'resolutionReason', 'groupCount',
      'firstOccurredAt', 'lastOccurredAt',
    ),
    action: scalarFields('label', 'link'),
    ...timestamps,
    ...classificationFields,
  },
});

const CREDENTIAL_ASSIGNMENT_PATTERN = /\b(password|passphrase|passwd|api[_. -]?key|access[_. -]?token|refresh[_. -]?token|(?:firebase[_. -]?)?download[_. -]?token|firebase[_. -]?(?:token|key)|token|client[_. -]?secret|private[_. -]?key|authorization|signature|cookie|session[_. -]?id|secret)\s*[:=]\s*([^\s,;]+)/gi;

export const sanitizeExportString = (value) => {
  const withoutCredentialAssignments = String(value).replace(
    CREDENTIAL_ASSIGNMENT_PATTERN,
    (_match, label) => `${label}=[redacted]`,
  );
  return withoutCredentialAssignments.replace(/https?:\/\/[^\s<>"']+/gi, (candidate) => {
    const trailing = candidate.match(/[),.;!?]+$/)?.[0] || '';
    const raw = trailing ? candidate.slice(0, -trailing.length) : candidate;
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) return candidate;
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return `${url.toString()}${trailing}`;
    } catch {
      return candidate;
    }
  });
};

const safeExportScalar = (value) => {
  if (typeof value === 'string') return sanitizeExportString(value);
  if (value == null || ['number', 'boolean', 'bigint'].includes(typeof value)) return value;
  if (value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
  return undefined;
};

const projectSafeExportValue = (value, schema) => {
  if (schema === true) return safeExportScalar(value);
  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) return undefined;
    return value
      .map((entry) => projectSafeExportValue(entry, schema[0]))
      .filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result = {};
  for (const [key, nestedSchema] of Object.entries(schema)) {
    const projected = projectSafeExportValue(value[key], nestedSchema);
    if (projected !== undefined) result[key] = projected;
  }
  return result;
};

const normalizedAssetUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:') return null;
    if (![
      'res.cloudinary.com',
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
    ].includes(url.hostname)) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
};

const collectAssetReferences = (value, path, output) => {
  if (typeof value === 'string') {
    const url = normalizedAssetUrl(value);
    if (url) output.push({ path, url });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectAssetReferences(entry, `${path}[${index}]`, output));
    return;
  }
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value._bsontype) return;
  for (const [key, nested] of Object.entries(value)) {
    collectAssetReferences(nested, path ? `${path}.${key}` : key, output);
  }
};

export async function findUnmanagedAssetReferences(records, { managedAssets = null, session = null } = {}) {
  let assetQuery = ManagedAsset.find({}).select('secureUrl').lean();
  if (session) assetQuery = assetQuery.session(session);
  const assets = managedAssets || await assetQuery;
  const managedUrls = new Set(assets.map((asset) => normalizedAssetUrl(asset.secureUrl)).filter(Boolean));
  const unresolved = [];
  const seen = new Set();
  for (const record of records || []) {
    const references = [];
    collectAssetReferences(record.document, '', references);
    for (const reference of references) {
      if (managedUrls.has(reference.url)) continue;
      const key = `${record.collection}:${record.documentId}:${reference.path}:${reference.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unresolved.push({
        collection: record.collection,
        documentId: String(record.documentId),
        fieldPath: reference.path,
        url: reference.url,
        reason: 'legacy_asset_not_registered',
      });
    }
  }
  return unresolved;
}

const recursivelyOmit = (value, omitKeys) => {
  if (Array.isArray(value)) return value.map((entry) => recursivelyOmit(entry, omitKeys));
  // Preserve BSON/JSON scalar objects exactly. Date has no enumerable fields,
  // so treating it as a plain object would silently turn every timestamp into
  // `{}` and make date-only data changes invisible to the fingerprint.
  if (
    !value
    || typeof value !== 'object'
    || value instanceof Date
    || value instanceof RegExp
    || Buffer.isBuffer(value)
    || ArrayBuffer.isView(value)
    || value._bsontype
  ) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !omitKeys.has(key) && !/(api.?key|private.?key|client.?secret)/i.test(key))
    .map(([key, nested]) => [key, recursivelyOmit(nested, omitKeys)]));
};

const actorSnapshot = (actor) => ({
  id: actor?.id || actor?._id,
  name: actor?.name || '',
  email: actor?.email || '',
  role: actor?.role || '',
});

const listApplicationCollections = async () => {
  const rows = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  return rows
    .map((row) => row.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();
};

const isTransactionUnavailable = (error) => (
  error?.code === 20
  || error?.codeName === 'IllegalOperation'
  || error?.codeName === 'OperationNotSupportedInTransaction'
  || /transaction numbers are only allowed on a replica set member or mongos/i.test(String(error?.message || ''))
  || /does not support.*transactions/i.test(String(error?.message || ''))
);

const normalizedIndexDefinitions = (definitions = []) => definitions
  .filter((definition) => definition.name !== '_id_')
  .map(({ v, ns, background, ...definition }) => definition)
  .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));

const readDatabaseCatalog = async () => {
  const collectionNames = await listApplicationCollections();
  const indexes = [];
  for (const name of collectionNames.filter((entry) => !EXCLUDED_BACKUP_COLLECTIONS.has(entry))) {
    let definitions;
    try {
      definitions = await mongoose.connection.db.collection(name).listIndexes().toArray();
    } catch (error) {
      if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') definitions = [];
      else throw error;
    }
    indexes.push({ collection: name, definitions: normalizedIndexDefinitions(definitions) });
  }
  const normalized = { collectionNames, indexes };
  return { ...normalized, hash: sha256(EJSON.stringify(normalized, { relaxed: false })) };
};

const fingerprintSnapshotRecords = (collectionNames, recordsByCollection) => {
  const hash = crypto.createHash('sha256');
  for (const name of collectionNames.filter((entry) => !EXCLUDED_FINGERPRINT_COLLECTIONS.has(entry))) {
    hash.update(name);
    for (const document of recordsByCollection.get(name) || []) {
      hash.update(EJSON.stringify(recursivelyOmit(document, TRANSIENT_BACKUP_KEYS), { relaxed: false }));
    }
  }
  return hash.digest('hex');
};

const isRetryableSnapshotError = (error) => (
  error?.code === 24
  || error?.code === 112
  || error?.codeName === 'LockTimeout'
  || error?.codeName === 'WriteConflict'
  || error?.hasErrorLabel?.('TransientTransactionError') === true
);

const waitForSnapshotRetry = (attempt) => new Promise((resolve) => {
  // Backups may overlap ordinary background writes. Give transient transaction
  // locks enough time to drain without weakening the snapshot/catalog checks.
  // The bounded linear delay keeps the request finite and still fails closed.
  setTimeout(resolve, Math.min(500, 50 * (attempt + 1)));
});

const captureBackupDatabaseSnapshot = async ({ maxAttempts = 16 } = {}) => {
  let lastTransientError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const catalogBefore = await readDatabaseCatalog();
    const recordsByCollection = new Map();
    const session = await mongoose.startSession();
    let committed = false;
    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        readPreference: 'primary',
      });
      // Force a transactional command even when the source database has no
      // application collections. Standalone deployments must fail closed.
      await mongoose.connection.db.collection(SystemBackup.collection.name).findOne(
        {},
        { session, projection: { _id: 1 } },
      );
      const snapshotCollectionNames = catalogBefore.collectionNames.filter((name) => (
        !EXCLUDED_BACKUP_COLLECTIONS.has(name)
        || !EXCLUDED_FINGERPRINT_COLLECTIONS.has(name)
      ));
      for (const name of snapshotCollectionNames) {
        const raw = await mongoose.connection.db.collection(name)
          .find({}, { session })
          .sort({ _id: 1 })
          .toArray();
        recordsByCollection.set(name, raw);
      }
      await session.commitTransaction();
      committed = true;
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction().catch(() => {});
      if (isTransactionUnavailable(error)) {
        throw new SystemManagementError(
          'Encrypted backups require MongoDB replica-set snapshot transactions.',
          'TRANSACTIONS_REQUIRED',
          503,
        );
      }
      if (!isRetryableSnapshotError(error)) throw error;
      lastTransientError = error;
      if (attempt + 1 < maxAttempts) {
        await waitForSnapshotRetry(attempt);
        continue;
      }
    } finally {
      await session.endSession();
    }

    if (!committed) break;

    // MongoDB does not permit listCollections/listIndexes inside a transaction.
    // Read the catalog on both sides of the snapshot and accept it only when no
    // collection or index definition changed during the snapshot window.
    const catalogAfter = await readDatabaseCatalog();
    if (catalogAfter.hash === catalogBefore.hash) return { catalog: catalogBefore, recordsByCollection };
    if (attempt + 1 < maxAttempts) {
      await waitForSnapshotRetry(attempt);
      continue;
    }
    throw new SystemManagementError(
      'The database collection or index catalog changed while the backup snapshot was captured.',
      'BACKUP_CATALOG_STALE',
      409,
    );
  }
  throw new SystemManagementError(
    'The database was busy while the backup snapshot was captured. Try again.',
    'BACKUP_SNAPSHOT_BUSY',
    409,
    { cause: lastTransientError?.codeName || lastTransientError?.code || null },
  );
};

export async function computeDataFingerprint({ session = null } = {}) {
  const hash = crypto.createHash('sha256');
  const collections = (await listApplicationCollections())
    .filter((name) => !EXCLUDED_FINGERPRINT_COLLECTIONS.has(name));
  for (const name of collections) {
    hash.update(name);
    const cursor = mongoose.connection.db.collection(name).find({}, session ? { session } : {}).sort({ _id: 1 });
    for await (const document of cursor) {
      hash.update(EJSON.stringify(recursivelyOmit(document, TRANSIENT_BACKUP_KEYS), { relaxed: false }));
    }
  }
  return hash.digest('hex');
}

const safeAssetUrl = (asset) => {
  try {
    const url = new URL(String(asset.secureUrl || ''));
    if (url.protocol !== 'https:') return null;
    if (asset.provider === 'cloudinary') {
      const configuredCloud = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
      const urlCloud = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] || '');
      if (
        !configuredCloud
        || url.hostname !== 'res.cloudinary.com'
        || String(asset.accountIdentifier || '') !== configuredCloud
        || urlCloud !== configuredCloud
      ) return null;
    }
    if (
      asset.provider === 'firebase_storage'
    ) {
      const configuredBucket = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
      const pathParts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const urlBucket = url.hostname === 'firebasestorage.googleapis.com'
        ? (pathParts[0] === 'v0' && pathParts[1] === 'b' ? pathParts[2] : null)
        : url.hostname === 'storage.googleapis.com'
          ? pathParts[0]
          : null;
      if (
        !configuredBucket
        || String(asset.accountIdentifier || '') !== configuredBucket
        || urlBucket !== configuredBucket
      ) return null;
    }
    return url;
  } catch {
    return null;
  }
};

const collectManagedAssetFiles = async (assets) => {
  const included = [];
  const unresolved = [];
  let totalBytes = 0;

  for (const asset of assets) {
    const url = safeAssetUrl(asset);
    if (!url || !asset.publicId) {
      unresolved.push({
        assetId: String(asset._id),
        provider: asset.provider,
        publicId: asset.publicId,
        reason: 'unverified_or_missing_url',
      });
      continue;
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const declaredSize = Number(response.headers.get('content-length') || 0);
      if (declaredSize > MAX_ASSET_BYTES || totalBytes + declaredSize > MAX_TOTAL_ASSET_BYTES) {
        throw new Error('asset_size_limit');
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_ASSET_BYTES || totalBytes + bytes.length > MAX_TOTAL_ASSET_BYTES) {
        throw new Error('asset_size_limit');
      }
      const checksum = sha256(bytes);
      if (asset.checksum && asset.checksum !== checksum) throw new Error('asset_checksum_mismatch');
      totalBytes += bytes.length;
      included.push({
        assetId: String(asset._id),
        provider: asset.provider,
        publicId: asset.publicId,
        resourceType: asset.resourceType,
        contentType: response.headers.get('content-type') || 'application/octet-stream',
        checksum,
        byteSize: bytes.length,
        data: bytes.toString('base64'),
      });
    } catch (error) {
      unresolved.push({
        assetId: String(asset._id),
        provider: asset.provider,
        publicId: asset.publicId,
        reason: String(error?.message || 'download_failed').slice(0, 300),
      });
    }
  }

  return {
    files: included,
    unresolved,
    coverage: { managed: assets.length, included: included.length, unresolved: unresolved.length },
  };
};

export async function buildBackupPayload({ includeAssets = true } = {}) {
  if (!mongoose.connection.db) {
    throw new SystemManagementError('Database is not connected.', 'DATABASE_UNAVAILABLE', 503);
  }
  const { catalog: catalogBefore, recordsByCollection } = await captureBackupDatabaseSnapshot();

  const collectionNames = catalogBefore.collectionNames
    .filter((name) => !EXCLUDED_BACKUP_COLLECTIONS.has(name));
  const collections = [];
  const indexes = catalogBefore.indexes;
  const assetReferenceRecords = [];
  let documentCount = 0;

  for (const name of collectionNames) {
    const raw = recordsByCollection.get(name) || [];
    for (const document of raw) assetReferenceRecords.push({
      collection: name,
      documentId: document._id,
      document,
    });
    const documents = raw.map((document) => recursivelyOmit(document, TRANSIENT_BACKUP_KEYS));
    documentCount += documents.length;
    collections.push({ name, documents });
  }

  const dataFingerprint = fingerprintSnapshotRecords(catalogBefore.collectionNames, recordsByCollection);
  const managedAssetRecords = recordsByCollection.get(ManagedAsset.collection.name) || [];
  const activeManagedAssets = managedAssetRecords.filter((asset) => asset.status === 'active');
  const snapshotManifestHash = sha256(EJSON.stringify(
    activeManagedAssets.map((asset) => recursivelyOmit(asset, TRANSIENT_BACKUP_KEYS)),
    { relaxed: false },
  ));
  const assets = includeAssets
    ? await collectManagedAssetFiles(activeManagedAssets)
    : {
      files: [],
      unresolved: activeManagedAssets.map((asset) => ({
        assetId: String(asset._id),
        provider: asset.provider,
        publicId: asset.publicId,
        reason: 'asset_download_skipped',
      })),
      coverage: { managed: activeManagedAssets.length, included: 0, unresolved: activeManagedAssets.length },
    };
  const managedUnresolved = assets.unresolved.length;
  const legacyAssets = await findUnmanagedAssetReferences(assetReferenceRecords, {
    managedAssets: managedAssetRecords,
  });
  assets.unresolved.push(...legacyAssets);
  assets.coverage = {
    requested: Boolean(includeAssets),
    managed: activeManagedAssets.length,
    included: assets.files.length,
    managedUnresolved,
    legacyUnresolved: legacyAssets.length,
    unresolved: managedUnresolved + legacyAssets.length,
    complete: managedUnresolved === 0 && assets.files.length === activeManagedAssets.length,
    snapshotManifestHash,
  };

  return {
    payload: {
      formatVersion: BACKUP_FORMAT_VERSION,
      databaseName: mongoose.connection.db.databaseName,
      createdAt: new Date(),
      dataFingerprint,
      snapshotCatalogHash: catalogBefore.hash,
      collections,
      indexes,
      assetManifest: assets.files,
      unresolvedAssets: assets.unresolved,
      assetCoverage: assets.coverage,
    },
    metadata: {
      dataFingerprint,
      collectionCount: collections.length,
      documentCount,
      assetCoverage: assets.coverage,
      snapshotCatalogHash: catalogBefore.hash,
      snapshotCompletedAt: new Date(),
    },
  };
}

const deriveBackupKey = (passphrase, salt, kdf = SCRYPT_PARAMETERS) => scryptAsync(
  passphrase,
  salt,
  kdf.keyLength,
  { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 64 * 1024 * 1024 },
);

export async function encryptBackupArchive(payload, passphrase, { backupId = null } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new SystemManagementError(
      'Backup passphrase must contain between 12 and 1024 characters.',
      'INVALID_BACKUP_PASSPHRASE',
      400,
    );
  }
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = await deriveBackupKey(passphrase, salt);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(EJSON.stringify(payload, { relaxed: false }), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const header = {
    format: 'autospf-backup',
    version: BACKUP_FORMAT_VERSION,
    backupId: backupId ? String(backupId) : null,
    cipher: 'aes-256-gcm',
    kdf: { name: 'scrypt', ...SCRYPT_PARAMETERS },
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    createdAt: new Date().toISOString(),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8');
  const headerLength = Buffer.alloc(4);
  headerLength.writeUInt32BE(headerBytes.length, 0);
  return Buffer.concat([BACKUP_MAGIC, headerLength, headerBytes, ciphertext]);
}

const parseBackupEnvelope = (artifact) => {
  const bytes = Buffer.isBuffer(artifact) ? artifact : Buffer.from(artifact);
  if (bytes.length <= BACKUP_MAGIC.length + 4 || !bytes.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
    throw new SystemManagementError('Invalid AutoSPF backup file.', 'INVALID_BACKUP_FORMAT', 400);
  }
  const headerLength = bytes.readUInt32BE(BACKUP_MAGIC.length);
  const headerStart = BACKUP_MAGIC.length + 4;
  const headerEnd = headerStart + headerLength;
  if (headerLength < 2 || headerEnd >= bytes.length) {
    throw new SystemManagementError('Invalid AutoSPF backup header.', 'INVALID_BACKUP_FORMAT', 400);
  }
  let header;
  try {
    header = JSON.parse(bytes.subarray(headerStart, headerEnd).toString('utf8'));
  } catch {
    throw new SystemManagementError('Invalid AutoSPF backup header.', 'INVALID_BACKUP_FORMAT', 400);
  }
  if (
    header.format !== 'autospf-backup'
    || header.version !== BACKUP_FORMAT_VERSION
    || header.cipher !== 'aes-256-gcm'
    || header.kdf?.name !== 'scrypt'
  ) {
    throw new SystemManagementError('Unsupported AutoSPF backup format.', 'UNSUPPORTED_BACKUP_FORMAT', 400);
  }
  return { header, ciphertext: bytes.subarray(headerEnd) };
};

export async function decryptBackupArchive(artifact, passphrase) {
  const { header, ciphertext } = parseBackupEnvelope(artifact);
  try {
    const salt = Buffer.from(header.salt, 'base64');
    const iv = Buffer.from(header.iv, 'base64');
    const authTag = Buffer.from(header.authTag, 'base64');
    const key = await deriveBackupKey(passphrase, salt, header.kdf);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = EJSON.parse(plaintext.toString('utf8'));
    if (payload?.formatVersion !== BACKUP_FORMAT_VERSION || !Array.isArray(payload?.collections)) {
      throw new Error('invalid_payload');
    }
    return { header, payload };
  } catch (error) {
    if (error instanceof SystemManagementError) throw error;
    throw new SystemManagementError(
      'The backup could not be decrypted. The passphrase may be incorrect or the file is damaged.',
      'BACKUP_DECRYPTION_FAILED',
      400,
    );
  }
}

export async function createEncryptedBackup({
  actor,
  passphrase,
  includeAssets = true,
  purpose = LIFECYCLE_BACKUP_PURPOSE,
}) {
  await assertSystemMutationAllowed();
  if (!mongoose.isValidObjectId(actor?.id || actor?._id)) {
    throw new SystemManagementError('A valid backup actor is required.', 'INVALID_ACTOR', 400);
  }
  const normalizedPurpose = String(purpose || '').trim().toLowerCase();
  if (!SYSTEM_BACKUP_PURPOSES.includes(normalizedPurpose)) {
    throw new SystemManagementError('Backup purpose is invalid.', 'INVALID_BACKUP_PURPOSE', 400);
  }
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    throw new SystemManagementError(
      'Backup passphrase must contain between 12 and 1024 characters.',
      'INVALID_BACKUP_PASSPHRASE',
      400,
    );
  }
  const backup = await SystemBackup.create({
    status: 'creating',
    createdBy: actor.id || actor._id,
    dataFingerprint: `pending:${crypto.randomUUID()}`,
    purpose: normalizedPurpose,
    includeAssetsRequested: Boolean(includeAssets),
  });
  try {
    const { payload, metadata } = await buildBackupPayload({ includeAssets });
    payload.backupPurpose = normalizedPurpose;
    const lifecycleEligible = normalizedPurpose === LIFECYCLE_BACKUP_PURPOSE
      && metadata.assetCoverage.complete === true;
    if (
      normalizedPurpose === LIFECYCLE_BACKUP_PURPOSE
      && metadata.assetCoverage.managed > 0
      && includeAssets !== true
    ) {
      throw new SystemManagementError(
        'Lifecycle backups must include every active managed asset.',
        'LIFECYCLE_BACKUP_ASSETS_REQUIRED',
        409,
      );
    }
    if (normalizedPurpose === LIFECYCLE_BACKUP_PURPOSE && !lifecycleEligible) {
      throw new SystemManagementError(
        'One or more active managed assets could not be included in the lifecycle backup.',
        'LIFECYCLE_BACKUP_ASSET_COVERAGE_INCOMPLETE',
        409,
        { assetCoverage: metadata.assetCoverage },
      );
    }
    const artifact = await encryptBackupArchive(payload, passphrase, { backupId: backup._id });
    const checksum = sha256(artifact);
    backup.status = 'ready';
    backup.dataFingerprint = metadata.dataFingerprint;
    backup.checksum = checksum;
    backup.artifactSize = artifact.length;
    backup.assetCoverage = metadata.assetCoverage;
    backup.lifecycleEligible = lifecycleEligible;
    backup.snapshotCatalogHash = metadata.snapshotCatalogHash;
    backup.snapshotCompletedAt = metadata.snapshotCompletedAt;
    backup.collectionCount = metadata.collectionCount;
    backup.documentCount = metadata.documentCount;
    await backup.save();

    await SystemOperation.create({
      kind: 'backup',
      action: 'create_encrypted_backup',
      status: 'completed',
      actor: actorSnapshot(actor),
      planHash: metadata.dataFingerprint,
      dataFingerprint: metadata.dataFingerprint,
      backupId: backup._id,
      completedAt: new Date(),
      receipt: {
        backupId: String(backup._id),
        checksum,
        artifactSize: artifact.length,
        collectionCount: metadata.collectionCount,
        documentCount: metadata.documentCount,
        assetCoverage: metadata.assetCoverage,
        purpose: normalizedPurpose,
        lifecycleEligible,
        snapshotCatalogHash: metadata.snapshotCatalogHash,
      },
      warnings: metadata.assetCoverage.legacyUnresolved > 0
        ? [`${metadata.assetCoverage.legacyUnresolved} legacy asset reference(s) require manual recovery review.`]
        : [],
    });
    return { backup, artifact };
  } catch (error) {
    backup.status = 'failed';
    backup.failureCode = error?.code || 'BACKUP_FAILED';
    backup.failedAt = new Date();
    await backup.save().catch(() => {});
    throw error;
  }
}

export async function acknowledgeBackup({ backupId, checksum, actorId }) {
  if (!mongoose.isValidObjectId(backupId)) {
    throw new SystemManagementError('Backup was not found.', 'BACKUP_NOT_FOUND', 404);
  }
  const backup = await SystemBackup.findById(backupId);
  if (!backup || !['ready', 'verified'].includes(backup.status)) {
    throw new SystemManagementError('Backup is not available for verification.', 'BACKUP_NOT_READY', 409);
  }
  const suppliedChecksum = Buffer.from(String(checksum || '').toLowerCase());
  const storedChecksum = Buffer.from(String(backup.checksum || '').toLowerCase());
  if (
    suppliedChecksum.length !== storedChecksum.length
    || storedChecksum.length !== 64
    || !crypto.timingSafeEqual(suppliedChecksum, storedChecksum)
  ) {
    throw new SystemManagementError('Downloaded backup checksum does not match.', 'BACKUP_CHECKSUM_MISMATCH', 409);
  }
  if (backup.status !== 'verified') {
    backup.status = 'verified';
    backup.downloadVerifiedAt = new Date();
    backup.verifiedBy = actorId;
    await backup.save();
  }
  return backup.toObject();
}

export async function listBackups({ limit = 25 } = {}) {
  return SystemBackup.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, Number(limit) || 25)))
    .lean();
}

export async function getVerifiedBackupForFingerprint(
  backupId,
  dataFingerprint,
  { session = null, requiredPurpose = LIFECYCLE_BACKUP_PURPOSE } = {},
) {
  if (!mongoose.isValidObjectId(backupId)) return null;
  let query = SystemBackup.findOne({
    _id: backupId,
    status: 'verified',
    dataFingerprint,
    purpose: requiredPurpose,
    lifecycleEligible: true,
    'assetCoverage.complete': true,
  }).select('_id checksum dataFingerprint downloadVerifiedAt status purpose lifecycleEligible assetCoverage snapshotCatalogHash');
  if (session) query = query.session(session);
  const backup = await query.lean();
  if (!backup) return null;
  const coverage = backup.assetCoverage || {};
  const managed = Number(coverage.managed);
  const included = Number(coverage.included);
  const managedUnresolved = Number(coverage.managedUnresolved);
  if (
    !Number.isInteger(managed)
    || managed < 0
    || included !== managed
    || managedUnresolved !== 0
    || (managed > 0 && coverage.requested !== true)
    || !/^[a-f0-9]{64}$/.test(String(coverage.snapshotManifestHash || ''))
    || !/^[a-f0-9]{64}$/.test(String(backup.snapshotCatalogHash || ''))
  ) return null;
  return backup;
}

export async function buildSafeExport({ actor }) {
  if (!mongoose.connection.db) {
    throw new SystemManagementError('Database is not connected.', 'DATABASE_UNAVAILABLE', 503);
  }
  const existingCollections = new Set(await listApplicationCollections());
  const collections = [];
  for (const [name, schema] of Object.entries(SAFE_EXPORT_SCHEMAS)) {
    if (!existingCollections.has(name)) continue;
    const projection = Object.fromEntries(Object.keys(schema).map((field) => [field, 1]));
    const raw = await mongoose.connection.db.collection(name)
      .find({}, { projection })
      .sort({ _id: 1 })
      .toArray();
    const documents = raw.map((document) => projectSafeExportValue(document, schema));
    collections.push({ name, documents });
  }
  const payload = {
    format: 'autospf-safe-export',
    version: 1,
    databaseName: mongoose.connection.db.databaseName,
    exportedAt: new Date(),
    collections,
  };
  const bytes = Buffer.from(EJSON.stringify(payload, { relaxed: true }), 'utf8');
  const checksum = sha256(bytes);
  const operation = await SystemOperation.create({
    kind: 'export',
    action: 'safe_export',
    status: 'completed',
    actor: actorSnapshot(actor),
    planHash: checksum,
    completedAt: new Date(),
    receipt: {
      checksum,
      artifactSize: bytes.length,
      collectionCount: collections.length,
      collections: collections.map(({ name, documents }) => ({ name, documentCount: documents.length })),
      contract: 'explicit_allowlist_v1',
    },
  });
  return { bytes, checksum, exportId: operation._id };
}

export default {
  computeDataFingerprint,
  findUnmanagedAssetReferences,
  buildBackupPayload,
  encryptBackupArchive,
  decryptBackupArchive,
  createEncryptedBackup,
  acknowledgeBackup,
  listBackups,
  getVerifiedBackupForFingerprint,
  buildSafeExport,
};
