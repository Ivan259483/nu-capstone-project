#!/usr/bin/env node

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { BSON, MongoClient } from 'mongodb';

const { EJSON } = BSON;

const RECEIPT_VERSION = 1;
const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const BACKUP_MAGIC = Buffer.from('AUTOSPF1\n', 'ascii');
const SCRYPT_PARAMETERS = Object.freeze({ N: 16384, r: 8, p: 1, keyLength: 32 });
const scryptAsync = promisify(crypto.scrypt);
const COLLECTION_NAME_PATTERN = /^(?!system\.)(?!.*\0)[A-Za-z0-9_.-]{1,120}$/;
const MANAGED_ASSET_PROVIDERS = new Set(['cloudinary', 'firebase_storage']);
const SAFE_INDEX_FIELDS = new Set([
  'key',
  'name',
  'unique',
  'sparse',
  'expireAfterSeconds',
  'partialFilterExpression',
  'collation',
  'wildcardProjection',
  'hidden',
  'weights',
  'default_language',
  'language_override',
  'textIndexVersion',
  '2dsphereIndexVersion',
  'bits',
  'min',
  'max',
  'bucketSize',
  'storageEngine',
]);

const usage = `
AutoSPF+ encrypted backup restore (offline only)

Dry run (required first):
  AUTOSPF_RESTORE_PASSPHRASE='...' npm run restore:backup -- \\
    --file /secure/path/backup.autospf-backup \\
    --checksum <sha256-from-download-receipt> \\
    --target-db autospf_restore_drill

Execute the verified plan:
  AUTOSPF_RESTORE_PASSPHRASE='...' npm run restore:backup -- \\
    --file /secure/path/backup.autospf-backup \\
    --checksum <sha256-from-download-receipt> \\
    --target-db autospf_restore_drill \\
    --confirm-target autospf_restore_drill \\
    --receipt /secure/path/backup.autospf-backup.restore-plan.json \\
    --asset-dir /secure/path/autospf-restored-assets \\
    --execute

MONGODB_URI is required. The passphrase is read from a hidden terminal prompt
when AUTOSPF_RESTORE_PASSPHRASE is not set. Passphrases are never accepted as
command-line arguments, persisted in the dry-run receipt, or printed.
When managed assets are present, execution also requires the target provider
credentials (CLOUDINARY_* and/or FIREBASE_* plus FIREBASE_STORAGE_BUCKET). It
re-uploads provider objects, remaps restored records, and writes a resumable
asset receipt beside the dry-run receipt.
`;

const fail = (message, code = 'RESTORE_VALIDATION_FAILED') => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const parseArguments = (argv) => {
  const options = { execute: false };
  const valueOptions = new Set([
    '--file',
    '--checksum',
    '--checksum-file',
    '--target-db',
    '--confirm-target',
    '--receipt',
    '--asset-dir',
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (argument === '--execute') {
      options.execute = true;
      continue;
    }
    if (argument === '--passphrase' || argument.startsWith('--passphrase=')) {
      fail('Passphrases are not accepted on the command line.', 'PASSPHRASE_IN_ARGUMENTS');
    }
    if (!valueOptions.has(argument)) fail(`Unknown argument: ${argument}`, 'UNKNOWN_ARGUMENT');
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${argument}.`, 'MISSING_ARGUMENT_VALUE');
    options[argument.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
};

const readHiddenPassphrase = async () => {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') {
    fail(
      'Set AUTOSPF_RESTORE_PASSPHRASE when running without an interactive terminal.',
      'PASSPHRASE_REQUIRED',
    );
  }

  process.stdout.write('Backup passphrase: ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (character) => {
      if (character === '\u0003') {
        cleanup();
        reject(Object.assign(new Error('Restore cancelled.'), { code: 'RESTORE_CANCELLED' }));
        return;
      }
      if (character === '\r' || character === '\n') {
        cleanup();
        resolve(value);
        return;
      }
      if (character === '\u007f' || character === '\b') {
        value = value.slice(0, -1);
        return;
      }
      if (character >= ' ') value += character;
    };
    process.stdin.on('data', onData);
  });
};

const normalizeChecksum = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.match(/\b[a-f0-9]{64}\b/)?.[0]
    || normalized.replace(/^sha-?256[=:]/, '').split(/\s+/)[0];
};

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

const timingSafeHexEqual = (left, right) => {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
};

const decryptBackupArchive = async (artifact, passphrase) => {
  if (
    artifact.length <= BACKUP_MAGIC.length + 4
    || !artifact.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)
  ) {
    fail('Invalid AutoSPF backup file.', 'INVALID_BACKUP_FORMAT');
  }
  const headerLength = artifact.readUInt32BE(BACKUP_MAGIC.length);
  const headerStart = BACKUP_MAGIC.length + 4;
  const headerEnd = headerStart + headerLength;
  if (headerLength < 2 || headerLength > 64 * 1024 || headerEnd >= artifact.length) {
    fail('Invalid AutoSPF backup header.', 'INVALID_BACKUP_FORMAT');
  }

  let header;
  try {
    header = JSON.parse(artifact.subarray(headerStart, headerEnd).toString('utf8'));
  } catch {
    fail('Invalid AutoSPF backup header.', 'INVALID_BACKUP_FORMAT');
  }
  const kdfMatches = Object.entries(SCRYPT_PARAMETERS)
    .every(([key, value]) => Number(header?.kdf?.[key]) === value);
  if (
    header?.format !== 'autospf-backup'
    || header?.version !== 1
    || header?.cipher !== 'aes-256-gcm'
    || header?.kdf?.name !== 'scrypt'
    || !kdfMatches
  ) {
    fail('Unsupported or unsafe AutoSPF backup format.', 'UNSUPPORTED_BACKUP_FORMAT');
  }

  try {
    const salt = Buffer.from(String(header.salt || ''), 'base64');
    const iv = Buffer.from(String(header.iv || ''), 'base64');
    const authTag = Buffer.from(String(header.authTag || ''), 'base64');
    if (salt.length !== 16 || iv.length !== 12 || authTag.length !== 16) throw new Error('invalid_parameters');
    const key = await scryptAsync(passphrase, salt, SCRYPT_PARAMETERS.keyLength, {
      N: SCRYPT_PARAMETERS.N,
      r: SCRYPT_PARAMETERS.r,
      p: SCRYPT_PARAMETERS.p,
      maxmem: 64 * 1024 * 1024,
    });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([
      decipher.update(artifact.subarray(headerEnd)),
      decipher.final(),
    ]);
    return { header, payload: EJSON.parse(plaintext.toString('utf8')) };
  } catch (error) {
    if (error?.code && String(error.code).startsWith('INVALID_')) throw error;
    fail(
      'The backup could not be decrypted. The passphrase may be incorrect or the file is damaged.',
      'BACKUP_DECRYPTION_FAILED',
    );
  }
};

const readExpectedChecksum = async (options) => {
  if (options.checksum && options.checksumFile) {
    fail('Use either --checksum or --checksum-file, not both.', 'AMBIGUOUS_CHECKSUM');
  }
  if (options.checksum) return normalizeChecksum(options.checksum);
  if (options.checksumFile) {
    return normalizeChecksum(await fs.readFile(path.resolve(options.checksumFile), 'utf8'));
  }
  fail('A trusted download checksum is required via --checksum or --checksum-file.', 'CHECKSUM_REQUIRED');
};

const validateTargetDatabaseName = (value) => {
  const name = String(value || '').trim();
  if (
    !name
    || name.length > 63
    || /[\s/\\."$*<>:|?]/.test(name)
    || ['admin', 'local', 'config'].includes(name.toLowerCase())
  ) {
    fail('Provide a valid, explicit non-system --target-db name.', 'INVALID_TARGET_DATABASE');
  }
  return name;
};

const validateCollectionName = (name) => {
  if (!COLLECTION_NAME_PATTERN.test(String(name || ''))) {
    fail(`Backup contains an unsafe collection name: ${String(name)}`, 'UNSAFE_COLLECTION_NAME');
  }
  return String(name);
};

const sanitizeIndexDefinition = (definition, collectionName) => {
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    fail(`Invalid index definition for ${collectionName}.`, 'INVALID_INDEX_MANIFEST');
  }
  const clean = {};
  for (const [key, value] of Object.entries(definition)) {
    if (!SAFE_INDEX_FIELDS.has(key)) {
      fail(`Unsupported index option ${key} for ${collectionName}.`, 'INVALID_INDEX_MANIFEST');
    }
    clean[key] = value;
  }
  if (!clean.key || typeof clean.key !== 'object' || Array.isArray(clean.key) || Object.keys(clean.key).length === 0) {
    fail(`Index for ${collectionName} has no key specification.`, 'INVALID_INDEX_MANIFEST');
  }
  if (clean.name && (typeof clean.name !== 'string' || clean.name.includes('\0') || clean.name.length > 127)) {
    fail(`Index for ${collectionName} has an unsafe name.`, 'INVALID_INDEX_MANIFEST');
  }
  return clean;
};

const validateAndSummarizePayload = (payload) => {
  if (!payload || payload.formatVersion !== 1 || !Array.isArray(payload.collections)) {
    fail('The decrypted archive payload is unsupported.', 'INVALID_BACKUP_PAYLOAD');
  }
  if (!payload.databaseName || typeof payload.databaseName !== 'string') {
    fail('The backup does not identify its source database.', 'SOURCE_DATABASE_MISSING');
  }

  const seenCollections = new Set();
  let documentCount = 0;
  for (const entry of payload.collections) {
    const name = validateCollectionName(entry?.name);
    if (seenCollections.has(name)) fail(`Duplicate collection ${name} in backup.`, 'DUPLICATE_COLLECTION');
    if (!Array.isArray(entry.documents)) fail(`Collection ${name} has no document array.`, 'INVALID_BACKUP_PAYLOAD');
    seenCollections.add(name);
    documentCount += entry.documents.length;
  }

  const indexesByCollection = new Map();
  let indexCount = 0;
  for (const entry of Array.isArray(payload.indexes) ? payload.indexes : []) {
    const collection = validateCollectionName(entry?.collection);
    if (!seenCollections.has(collection) || indexesByCollection.has(collection)) {
      fail(`Invalid index manifest entry for ${collection}.`, 'INVALID_INDEX_MANIFEST');
    }
    const definitions = Array.isArray(entry.definitions)
      ? entry.definitions.map((definition) => sanitizeIndexDefinition(definition, collection))
      : [];
    indexesByCollection.set(collection, definitions);
    indexCount += definitions.length;
  }

  const assets = Array.isArray(payload.assetManifest) ? payload.assetManifest : [];
  const seenAssetIds = new Set();
  for (const asset of assets) {
    const assetId = String(asset?.assetId || '');
    const bytes = Buffer.from(String(asset?.data || ''), 'base64');
    const expected = normalizeChecksum(asset?.checksum);
    if (
      !/^[a-f0-9]{24}$/i.test(assetId)
      || seenAssetIds.has(assetId)
      || !MANAGED_ASSET_PROVIDERS.has(asset?.provider)
      || typeof asset?.publicId !== 'string'
      || !asset.publicId.trim()
      || asset.publicId.length > 512
      || !timingSafeHexEqual(sha256(bytes), expected)
    ) {
      fail(`Managed asset ${assetId || 'unknown'} failed verification.`, 'INVALID_ASSET_MANIFEST');
    }
    seenAssetIds.add(assetId);
  }

  return {
    collections: payload.collections,
    indexesByCollection,
    assets,
    collectionCount: payload.collections.length,
    documentCount,
    indexCount,
    unresolvedAssetCount: Array.isArray(payload.unresolvedAssets) ? payload.unresolvedAssets.length : 0,
  };
};

const assertEmptyTarget = async (database) => {
  const collections = await database.listCollections({}, { nameOnly: true }).toArray();
  const applicationCollections = collections.filter(({ name }) => !String(name).startsWith('system.'));
  if (applicationCollections.length > 0) {
    fail(
      `Target database is not empty (${applicationCollections.map(({ name }) => name).join(', ')}).`,
      'TARGET_DATABASE_NOT_EMPTY',
    );
  }
};

const assertTransactionSupport = async (client) => {
  const hello = await client.db('admin').command({ hello: 1 });
  const sessionsAvailable = Number.isFinite(Number(hello.logicalSessionTimeoutMinutes));
  const transactionalTopology = Boolean(hello.setName || hello.msg === 'isdbgrid');
  if (!sessionsAvailable || !transactionalTopology) {
    fail(
      'The target MongoDB deployment does not support replica-set transactions.',
      'TRANSACTIONS_UNAVAILABLE',
    );
  }
};

const buildReceipt = ({ archivePath, checksum, targetDatabase, payload, summary }) => ({
  version: RECEIPT_VERSION,
  kind: 'autospf-restore-dry-run',
  archivePath,
  archiveChecksum: checksum,
  targetDatabase,
  sourceDatabase: payload.databaseName,
  dataFingerprint: String(payload.dataFingerprint || ''),
  backupCreatedAt: payload.createdAt || null,
  collectionCount: summary.collectionCount,
  documentCount: summary.documentCount,
  indexCount: summary.indexCount,
  managedAssetCount: summary.assets.length,
  unresolvedAssetCount: summary.unresolvedAssetCount,
  verifiedAt: new Date().toISOString(),
});

const assertMatchingReceipt = async (receiptPath, expected) => {
  let receipt;
  try {
    receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  } catch {
    fail('A readable dry-run receipt is required before execution.', 'DRY_RUN_RECEIPT_REQUIRED');
  }
  const verifiedAt = new Date(receipt.verifiedAt).getTime();
  if (
    receipt.version !== RECEIPT_VERSION
    || receipt.kind !== 'autospf-restore-dry-run'
    || receipt.archivePath !== expected.archivePath
    || receipt.archiveChecksum !== expected.archiveChecksum
    || receipt.targetDatabase !== expected.targetDatabase
    || receipt.dataFingerprint !== expected.dataFingerprint
    || !Number.isFinite(verifiedAt)
    || Date.now() - verifiedAt > RECEIPT_MAX_AGE_MS
    || verifiedAt > Date.now() + 60_000
  ) {
    fail('The dry-run receipt is expired or does not match this restore plan.', 'DRY_RUN_RECEIPT_MISMATCH');
  }
};

const stageAssets = async (assets, assetDirectory) => {
  if (assets.length === 0) return null;
  if (!assetDirectory) fail('--asset-dir is required when the backup contains managed assets.', 'ASSET_DIRECTORY_REQUIRED');
  const finalDirectory = path.resolve(assetDirectory);
  const parentDirectory = path.dirname(finalDirectory);
  const existing = await fs.stat(finalDirectory).catch(() => null);
  if (existing) fail('The asset restore directory already exists.', 'ASSET_DIRECTORY_NOT_EMPTY');
  await fs.mkdir(parentDirectory, { recursive: true });
  const stagingDirectory = await fs.mkdtemp(path.join(parentDirectory, '.autospf-assets-'));
  const manifest = [];

  try {
    for (const asset of assets) {
      const provider = String(asset.provider).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
      const providerDirectory = path.join(stagingDirectory, provider);
      await fs.mkdir(providerDirectory, { recursive: true });
      const filename = `${crypto.createHash('sha256').update(String(asset.publicId)).digest('hex')}.bin`;
      const bytes = Buffer.from(String(asset.data), 'base64');
      await fs.writeFile(path.join(providerDirectory, filename), bytes, { mode: 0o600, flag: 'wx' });
      manifest.push({
        assetId: String(asset.assetId || ''),
        provider: asset.provider,
        publicId: asset.publicId,
        resourceType: asset.resourceType || null,
        contentType: asset.contentType || 'application/octet-stream',
        checksum: asset.checksum,
        byteSize: bytes.length,
        file: `${provider}/${filename}`,
      });
    }
    await fs.writeFile(
      path.join(stagingDirectory, 'managed-assets.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    return { stagingDirectory, finalDirectory };
  } catch (error) {
    await fs.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
};

const normalizedIdentifier = (value) => String(value || '')
  .replace(/[^A-Za-z0-9/_-]+/g, '-')
  .replace(/^\/+|\/+$/g, '')
  .slice(0, 180);

const assetReceiptPathFor = (receiptPath) => `${receiptPath}.assets.json`;

const writeAssetReceipt = async (receiptPath, receipt) => {
  await fs.writeFile(
    assetReceiptPathFor(receiptPath),
    `${JSON.stringify(receipt, null, 2)}\n`,
    { mode: 0o600 },
  );
};

const loadAssetReceipt = async (receiptPath, expected) => {
  const raw = await fs.readFile(assetReceiptPathFor(receiptPath), 'utf8').catch(() => null);
  if (!raw) {
    return {
      version: 1,
      kind: 'autospf-provider-asset-restore',
      archiveChecksum: expected.archiveChecksum,
      targetDatabase: expected.targetDatabase,
      status: 'uploading',
      mappings: [],
      updatedAt: new Date().toISOString(),
    };
  }
  let receipt;
  try {
    receipt = JSON.parse(raw);
  } catch {
    fail('The provider asset receipt is unreadable.', 'ASSET_RESTORE_RECEIPT_INVALID');
  }
  if (
    receipt?.version !== 1
    || receipt?.kind !== 'autospf-provider-asset-restore'
    || receipt?.archiveChecksum !== expected.archiveChecksum
    || receipt?.targetDatabase !== expected.targetDatabase
    || !Array.isArray(receipt?.mappings)
  ) {
    fail('The provider asset receipt does not match this restore.', 'ASSET_RESTORE_RECEIPT_MISMATCH');
  }
  const seenAssetIds = new Set();
  for (const mapping of receipt.mappings) {
    const assetId = String(mapping?.assetId || '');
    if (!/^[a-f0-9]{24}$/i.test(assetId) || seenAssetIds.has(assetId)) {
      fail('The provider asset receipt contains an invalid or duplicate asset mapping.', 'ASSET_RESTORE_RECEIPT_INVALID');
    }
    seenAssetIds.add(assetId);
  }
  return receipt;
};

const restoredPublicIdFor = (asset, archiveChecksum) => {
  const assetId = String(asset.assetId || '');
  const original = normalizedIdentifier(asset.publicId);
  if (!/^[a-f0-9]{24}$/i.test(assetId) || !original) {
    fail('A managed asset has an unsafe provider identifier.', 'INVALID_ASSET_MANIFEST');
  }
  return `autospf-restores/${archiveChecksum.slice(0, 16)}/${assetId}/${original}`;
};

const assertProviderRestoreCredentials = (assets) => {
  const providers = new Set(assets.map((asset) => asset.provider));
  const configuredValue = (value) => {
    const normalized = String(value || '').trim();
    return Boolean(normalized)
      && !normalized.startsWith('<')
      && !['null', 'undefined'].includes(normalized.toLowerCase());
  };
  if (providers.has('cloudinary')) {
    const configured = [
      process.env.CLOUDINARY_CLOUD_NAME,
      process.env.CLOUDINARY_API_KEY,
      process.env.CLOUDINARY_API_SECRET,
    ].every(configuredValue);
    if (!configured) {
      fail('Cloudinary restore credentials are not configured.', 'CLOUDINARY_RESTORE_UNAVAILABLE');
    }
  }
  if (providers.has('firebase_storage')) {
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const configured = [
      process.env.FIREBASE_STORAGE_BUCKET,
      process.env.FIREBASE_PROJECT_ID,
      process.env.FIREBASE_CLIENT_EMAIL,
    ].every(configuredValue)
      && configuredValue(privateKey)
      && privateKey.includes('BEGIN PRIVATE KEY')
      && privateKey.includes('END PRIVATE KEY');
    if (!configured) {
      fail('Firebase Storage restore credentials are not configured.', 'FIREBASE_STORAGE_RESTORE_UNAVAILABLE');
    }
  }
};

const providerMappingUrlMatches = (asset, mapping, expectedPublicId) => {
  try {
    const url = new URL(String(mapping?.secureUrl || ''));
    if (url.protocol !== 'https:' || mapping.publicId !== expectedPublicId) return false;
    if (asset.provider === 'cloudinary') {
      const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const uploadIndex = parts.indexOf('upload');
      if (
        !cloudName
        || mapping.accountIdentifier !== cloudName
        || url.hostname !== 'res.cloudinary.com'
        || parts[0] !== cloudName
        || uploadIndex < 2
      ) return false;
      const afterUpload = parts.slice(uploadIndex + 1);
      if (/^v\d+$/.test(afterUpload[0] || '')) afterUpload.shift();
      const deliveredIdentifier = afterUpload.join('/');
      if (!deliveredIdentifier.startsWith(expectedPublicId)) return false;
      const suffix = deliveredIdentifier.slice(expectedPublicId.length);
      return deliveredIdentifier === expectedPublicId || /^\.[A-Za-z0-9]+$/.test(suffix);
    }
    if (asset.provider === 'firebase_storage') {
      const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
      if (!bucketName || mapping.accountIdentifier !== bucketName) return false;
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (url.hostname === 'firebasestorage.googleapis.com') {
        return parts[0] === 'v0'
          && parts[1] === 'b'
          && parts[2] === bucketName
          && parts[3] === 'o'
          && parts[4] === expectedPublicId;
      }
      return url.hostname === 'storage.googleapis.com'
        && parts[0] === bucketName
        && parts.slice(1).join('/') === expectedPublicId;
    }
    return false;
  } catch {
    return false;
  }
};

const isReusableProviderMapping = async ({ asset, mapping, archiveChecksum }) => {
  const expectedPublicId = restoredPublicIdFor(asset, archiveChecksum);
  const expectedChecksum = normalizeChecksum(asset.checksum);
  if (
    String(mapping?.assetId || '') !== String(asset.assetId || '')
    || mapping?.provider !== asset.provider
    || mapping?.originalPublicId !== asset.publicId
    || !timingSafeHexEqual(normalizeChecksum(mapping?.checksum), expectedChecksum)
    || Number(mapping?.byteSize) !== Buffer.from(String(asset.data || ''), 'base64').length
    || !providerMappingUrlMatches(asset, mapping, expectedPublicId)
  ) return false;
  try {
    const url = new URL(mapping.secureUrl);
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

const uploadCloudinaryAsset = async ({ asset, bytes, archiveChecksum }) => {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  if (!cloudName || !apiKey || !apiSecret) {
    fail('Cloudinary restore credentials are not configured.', 'CLOUDINARY_RESTORE_UNAVAILABLE');
  }
  const resourceType = ['image', 'video', 'raw'].includes(asset.resourceType)
    ? asset.resourceType
    : 'image';
  const publicId = restoredPublicIdFor(asset, archiveChecksum);
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `overwrite=true&public_id=${publicId}&timestamp=${timestamp}&unique_filename=false${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: asset.contentType || 'application/octet-stream' }), 'asset.bin');
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('public_id', publicId);
  form.append('overwrite', 'true');
  form.append('unique_filename', 'false');
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
    { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url || result.public_id !== publicId) {
    fail(`Cloudinary asset restore failed (${response.status}).`, 'CLOUDINARY_ASSET_RESTORE_FAILED');
  }
  return {
    assetId: String(asset.assetId),
    provider: 'cloudinary',
    originalPublicId: asset.publicId,
    publicId,
    accountIdentifier: cloudName,
    secureUrl: result.secure_url,
    checksum: asset.checksum,
    byteSize: bytes.length,
    restoredAt: new Date().toISOString(),
  };
};

const uploadFirebaseStorageAsset = async ({ asset, bytes, archiveChecksum }) => {
  const bucketName = String(process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  if (!bucketName) {
    fail('FIREBASE_STORAGE_BUCKET is required to restore Firebase Storage assets.', 'FIREBASE_STORAGE_RESTORE_UNAVAILABLE');
  }
  const { default: firebaseAdmin } = await import('../config/firebaseAdmin.js');
  if (!firebaseAdmin) {
    fail('Firebase Admin restore credentials are not configured.', 'FIREBASE_STORAGE_RESTORE_UNAVAILABLE');
  }
  const publicId = restoredPublicIdFor(asset, archiveChecksum);
  const downloadToken = crypto.randomUUID();
  const file = firebaseAdmin.storage().bucket(bucketName).file(publicId);
  await file.save(bytes, {
    resumable: false,
    validation: 'crc32c',
    metadata: {
      contentType: asset.contentType || 'application/octet-stream',
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  const secureUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(publicId)}?alt=media&token=${encodeURIComponent(downloadToken)}`;
  return {
    assetId: String(asset.assetId),
    provider: 'firebase_storage',
    originalPublicId: asset.publicId,
    publicId,
    accountIdentifier: bucketName,
    secureUrl,
    checksum: asset.checksum,
    byteSize: bytes.length,
    restoredAt: new Date().toISOString(),
  };
};

const restoreProviderAssets = async ({ assets, archiveChecksum, targetDatabase, receiptPath }) => {
  if (!assets.length) return { mappings: [], receiptPath: null };
  assertProviderRestoreCredentials(assets);
  const receipt = await loadAssetReceipt(receiptPath, { archiveChecksum, targetDatabase });
  const mappings = new Map(receipt.mappings.map((mapping) => [String(mapping.assetId), mapping]));

  for (const asset of assets) {
    const assetId = String(asset.assetId || '');
    const existing = mappings.get(assetId);
    if (existing && await isReusableProviderMapping({ asset, mapping: existing, archiveChecksum })) continue;

    const bytes = Buffer.from(String(asset.data || ''), 'base64');
    let mapping;
    if (asset.provider === 'cloudinary') {
      mapping = await uploadCloudinaryAsset({ asset, bytes, archiveChecksum });
    } else if (asset.provider === 'firebase_storage') {
      mapping = await uploadFirebaseStorageAsset({ asset, bytes, archiveChecksum });
    } else {
      fail(`Unsupported managed asset provider: ${String(asset.provider)}`, 'UNSUPPORTED_ASSET_PROVIDER');
    }
    mappings.set(assetId, mapping);
    receipt.mappings = [...mappings.values()];
    receipt.updatedAt = new Date().toISOString();
    await writeAssetReceipt(receiptPath, receipt);
  }

  receipt.status = 'uploaded';
  receipt.mappings = [...mappings.values()];
  receipt.updatedAt = new Date().toISOString();
  await writeAssetReceipt(receiptPath, receipt);
  return { mappings: receipt.mappings, receiptPath: assetReceiptPathFor(receiptPath) };
};

const collectionAliasesForOwner = (ownerCollection) => {
  const normalized = String(ownerCollection || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const explicit = {
    user: ['users'],
    vehicle: ['vehicles'],
    order: ['orders'],
    aiscan: ['aiscans'],
    aiservicerequest: ['aiservicerequests'],
    chatconversation: ['chatconversations'],
    chatsession: ['chatsessions'],
  };
  return new Set(explicit[normalized] || [normalized, `${normalized}s`]);
};

const setDocumentPath = (document, fieldPath, value, expectedCurrentValue) => {
  const segments = String(fieldPath || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean);
  if (!segments.length || segments.some((segment) => (
    segment === '__proto__' || segment === 'constructor' || segment === 'prototype'
  ))) {
    fail('A managed asset owner field path is unsafe.', 'INVALID_MANAGED_ASSET_OWNER');
  }

  let target;
  if (
    segments.length === 3
    && segments[0] === 'trackerStageMedia'
    && !/^\d+$/.test(segments[1])
  ) {
    const media = document.trackerStageMedia;
    if (!Array.isArray(media)) {
      fail('A managed tracker asset has no restorable media array.', 'MANAGED_ASSET_OWNER_FIELD_MISSING');
    }
    const stage = segments[1];
    const slot = segments[2];
    const entry = media.find((item) => (
      item?.stage === stage && String(item?.slot || 'default') === slot
    ));
    if (!entry || !Object.prototype.hasOwnProperty.call(entry, 'photoUrl')) {
      fail('A managed tracker asset has no matching owner field.', 'MANAGED_ASSET_OWNER_FIELD_MISSING');
    }
    target = { container: entry, key: 'photoUrl' };
  } else {
    let cursor = document;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (/^\d+$/.test(segment)) {
        const numericIndex = Number(segment);
        if (!Array.isArray(cursor) || !Number.isSafeInteger(numericIndex) || numericIndex >= cursor.length) {
          fail('A managed asset owner array path is missing.', 'MANAGED_ASSET_OWNER_FIELD_MISSING');
        }
        cursor = cursor[numericIndex];
      } else {
        if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
          fail('A managed asset owner field path is missing.', 'MANAGED_ASSET_OWNER_FIELD_MISSING');
        }
        cursor = cursor[segment];
      }
    }
    const key = segments.at(-1);
    if (!cursor || typeof cursor !== 'object' || !Object.prototype.hasOwnProperty.call(cursor, key)) {
      fail('A managed asset owner field path is missing.', 'MANAGED_ASSET_OWNER_FIELD_MISSING');
    }
    target = { container: cursor, key };
  }

  if (
    typeof expectedCurrentValue !== 'string'
    || !expectedCurrentValue
    || target.container[target.key] !== expectedCurrentValue
  ) {
    fail('A managed asset does not match its owner field.', 'MANAGED_ASSET_OWNER_REFERENCE_MISMATCH');
  }
  target.container[target.key] = value;
};

const remapManagedAssets = (summary, mappings) => {
  if (!mappings.length) return;
  const managedCollection = summary.collections.find((entry) => entry.name === 'managedassets');
  if (!managedCollection) fail('Managed asset records are missing from the backup.', 'MANAGED_ASSET_RECORDS_MISSING');
  const collectionsByName = new Map(summary.collections.map((entry) => [entry.name, entry]));

  for (const mapping of mappings) {
    const managed = managedCollection.documents.find((entry) => String(entry._id) === String(mapping.assetId));
    if (!managed) fail(`Managed asset ${mapping.assetId} is missing from its collection.`, 'MANAGED_ASSET_RECORD_MISSING');
    if (managed.provider !== mapping.provider || managed.publicId !== mapping.originalPublicId) {
      fail(`Managed asset ${mapping.assetId} does not match the provider receipt.`, 'ASSET_RESTORE_RECEIPT_MISMATCH');
    }
    const aliases = collectionAliasesForOwner(managed.ownerCollection);
    const owner = [...collectionsByName.entries()]
      .filter(([name]) => aliases.has(name))
      .flatMap(([, entry]) => entry.documents)
      .find((entry) => String(entry._id) === String(managed.ownerId));
    if (!owner) fail(`Managed asset ${mapping.assetId} has no restorable owner record.`, 'MANAGED_ASSET_OWNER_MISSING');

    setDocumentPath(owner, managed.fieldPath, mapping.secureUrl, managed.secureUrl);
    managed.accountIdentifier = mapping.accountIdentifier;
    managed.publicId = mapping.publicId;
    managed.secureUrl = mapping.secureUrl;
    managed.checksum = mapping.checksum;
    managed.byteSize = mapping.byteSize;
    managed.status = 'active';
    managed.deletedAt = null;
  }
};

const restoreDatabase = async ({ client, database, summary }) => {
  const createdCollections = [];
  try {
    for (const entry of summary.collections) {
      await database.createCollection(entry.name);
      createdCollections.push(entry.name);
      const indexes = summary.indexesByCollection.get(entry.name) || [];
      if (indexes.length > 0) await database.collection(entry.name).createIndexes(indexes);
    }

    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const entry of summary.collections) {
          for (let offset = 0; offset < entry.documents.length; offset += 500) {
            const batch = entry.documents.slice(offset, offset + 500);
            if (batch.length > 0) {
              await database.collection(entry.name).insertMany(batch, { ordered: true, session });
            }
          }
        }
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
      });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    for (const name of createdCollections.reverse()) {
      await database.collection(name).drop().catch(() => {});
    }
    throw error;
  }
};

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage);
    return;
  }
  if (!options.file) fail('--file is required.', 'BACKUP_FILE_REQUIRED');
  if (!process.env.MONGODB_URI) fail('MONGODB_URI is required.', 'MONGODB_URI_REQUIRED');

  const archivePath = path.resolve(options.file);
  const targetDatabase = validateTargetDatabaseName(options.targetDb);
  const expectedChecksum = await readExpectedChecksum(options);
  const artifact = await fs.readFile(archivePath);
  const actualChecksum = sha256(artifact);
  if (!timingSafeHexEqual(actualChecksum, expectedChecksum)) {
    fail('Backup checksum does not match the trusted download receipt.', 'BACKUP_CHECKSUM_MISMATCH');
  }

  const passphrase = process.env.AUTOSPF_RESTORE_PASSPHRASE || await readHiddenPassphrase();
  delete process.env.AUTOSPF_RESTORE_PASSPHRASE;
  if (typeof passphrase !== 'string' || passphrase.length < 12 || passphrase.length > 1024) {
    fail('The backup passphrase is invalid.', 'INVALID_BACKUP_PASSPHRASE');
  }
  const { payload } = await decryptBackupArchive(artifact, passphrase);
  const summary = validateAndSummarizePayload(payload);
  const receipt = buildReceipt({
    archivePath,
    checksum: actualChecksum,
    targetDatabase,
    payload,
    summary,
  });
  const receiptPath = path.resolve(options.receipt || `${archivePath}.restore-plan.json`);

  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  await client.connect();
  try {
    await assertTransactionSupport(client);
    const database = client.db(targetDatabase);
    if (database.databaseName !== targetDatabase) {
      fail('Connected target database does not match --target-db.', 'TARGET_DATABASE_MISMATCH');
    }
    await assertEmptyTarget(database);

    if (!options.execute) {
      await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
      process.stdout.write(`${JSON.stringify({
        success: true,
        dryRun: true,
        targetDatabase,
        sourceDatabase: payload.databaseName,
        archiveChecksum: actualChecksum,
        dataFingerprint: payload.dataFingerprint,
        collectionCount: summary.collectionCount,
        documentCount: summary.documentCount,
        indexCount: summary.indexCount,
        managedAssetCount: summary.assets.length,
        unresolvedAssetCount: summary.unresolvedAssetCount,
        receiptPath,
        providerAssetRestoreRequired: summary.assets.length > 0,
        next: 'Review this plan and provider credentials, then rerun with --execute, --confirm-target, and this --receipt.',
      }, null, 2)}\n`);
      return;
    }

    if (options.confirmTarget !== targetDatabase) {
      fail('--confirm-target must exactly match --target-db.', 'TARGET_CONFIRMATION_MISMATCH');
    }
    await assertMatchingReceipt(receiptPath, receipt);
    const stagedAssets = await stageAssets(summary.assets, options.assetDir);
    let databaseRestored = false;
    let providerRestore = { mappings: [], receiptPath: null };
    try {
      providerRestore = await restoreProviderAssets({
        assets: summary.assets,
        archiveChecksum: actualChecksum,
        targetDatabase,
        receiptPath,
      });
      remapManagedAssets(summary, providerRestore.mappings);
      await restoreDatabase({ client, database, summary });
      databaseRestored = true;
      if (stagedAssets) {
        try {
          await fs.rename(stagedAssets.stagingDirectory, stagedAssets.finalDirectory);
        } catch (error) {
          const assetError = new Error(
            `Database restore completed, but managed assets could not be finalized. Staged files remain at ${stagedAssets.stagingDirectory}.`,
          );
          assetError.code = 'ASSET_FINALIZATION_FAILED_AFTER_DATABASE_RESTORE';
          assetError.cause = error;
          throw assetError;
        }
      }
      if (providerRestore.receiptPath) {
        const assetReceipt = await loadAssetReceipt(receiptPath, {
          archiveChecksum: actualChecksum,
          targetDatabase,
        });
        assetReceipt.status = 'completed';
        assetReceipt.databaseRestoredAt = new Date().toISOString();
        assetReceipt.updatedAt = new Date().toISOString();
        await writeAssetReceipt(receiptPath, assetReceipt);
      }
    } catch (error) {
      if (stagedAssets && !databaseRestored) {
        await fs.rm(stagedAssets.stagingDirectory, { recursive: true, force: true }).catch(() => {});
      }
      throw error;
    }

    process.stdout.write(`${JSON.stringify({
      success: true,
      dryRun: false,
      targetDatabase,
      sourceDatabase: payload.databaseName,
      archiveChecksum: actualChecksum,
      dataFingerprint: payload.dataFingerprint,
      restoredCollections: summary.collectionCount,
      restoredDocuments: summary.documentCount,
      restoredIndexes: summary.indexCount,
      restoredManagedAssets: summary.assets.length,
      providerAssetReceipt: providerRestore.receiptPath,
      assetDirectory: summary.assets.length ? path.resolve(options.assetDir) : null,
      unresolvedAssetCount: summary.unresolvedAssetCount,
      warning: summary.unresolvedAssetCount > 0
        ? 'The archive contains unresolved legacy assets; review its unresolved-asset report.'
        : null,
    }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsScript) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({
      success: false,
      code: error?.code || 'RESTORE_FAILED',
      message: error?.message || 'Restore failed.',
    })}\n`);
    process.exitCode = 1;
  });
}

export {
  decryptBackupArchive,
  remapManagedAssets,
  validateAndSummarizePayload,
};
