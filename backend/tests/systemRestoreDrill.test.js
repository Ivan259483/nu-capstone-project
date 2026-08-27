import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';
import { ObjectId as ArchiveObjectId } from 'bson';
import { MongoClient, ObjectId as MongoObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import test from 'node:test';

process.env.JWT_SECRET ||= 'system_restore_drill_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';

const { encryptBackupArchive } = await import('../services/systemBackup.service.js');

const execFileAsync = promisify(execFile);
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_DIRECTORY = path.resolve(TEST_DIRECTORY, '..');
const RESTORE_SCRIPT = path.join(BACKEND_DIRECTORY, 'scripts', 'restore-autospf-backup.js');

const parseLastJsonLine = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  try {
    return JSON.parse(normalized);
  } catch {
    const line = normalized.split('\n').filter(Boolean).at(-1);
    return line ? JSON.parse(line) : null;
  }
};

const runRestore = async ({ args, mongoUri, passphrase }) => {
  try {
    const result = await execFileAsync(process.execPath, [RESTORE_SCRIPT, ...args], {
      cwd: BACKEND_DIRECTORY,
      env: {
        ...process.env,
        MONGODB_URI: mongoUri,
        AUTOSPF_RESTORE_PASSPHRASE: passphrase,
      },
      maxBuffer: 10 * 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: Number(error?.code || 1),
      stdout: error?.stdout || '',
      stderr: error?.stderr || '',
    };
  }
};

test('offline restore CLI requires dry run and restores records, indexes, and password hashes', async (t) => {
  const replSet = await MongoMemoryReplSet.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'autospf-restore-drill-'));
  const client = new MongoClient(replSet.getUri(), { serverSelectionTimeoutMS: 10_000 });
  t.after(async () => {
    await client.close().catch(() => {});
    await replSet.stop().catch(() => {});
    await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  });
  await client.connect();

  const passphrase = 'Restore Drill!Passphrase123';
  const passwordHash = await bcrypt.hash('Restored!Password123', 10);
  const userId = new ArchiveObjectId();
  const createdAt = new Date('2026-08-27T10:30:00.000Z');
  const payload = {
    formatVersion: 1,
    databaseName: 'autospf_restore_source',
    createdAt,
    dataFingerprint: crypto.createHash('sha256').update('restore-drill').digest('hex'),
    collections: [
      {
        name: 'users',
        documents: [{
          _id: userId,
          name: 'Restored Administrator',
          email: 'restore.admin@example.test',
          password: passwordHash,
          role: 'administrator',
          isVerified: true,
          isActive: true,
          createdAt,
          updatedAt: createdAt,
        }],
      },
      {
        name: 'counters',
        documents: [{ _id: 'orders', seq: 41 }],
      },
    ],
    indexes: [
      {
        collection: 'users',
        definitions: [{ key: { email: 1 }, name: 'restore_unique_email', unique: true }],
      },
      {
        collection: 'counters',
        definitions: [{ key: { seq: -1 }, name: 'restore_counter_sequence' }],
      },
    ],
    assetManifest: [],
    unresolvedAssets: [],
    assetCoverage: {
      requested: true,
      managed: 0,
      included: 0,
      unresolved: 0,
      complete: true,
    },
  };
  const artifact = await encryptBackupArchive(payload, passphrase);
  const checksum = crypto.createHash('sha256').update(artifact).digest('hex');
  const archivePath = path.join(temporaryDirectory, 'drill.autospf-backup');
  const receiptPath = path.join(temporaryDirectory, 'drill.restore-plan.json');
  const targetDatabase = 'autospf_restore_drill';
  await fs.writeFile(archivePath, artifact, { mode: 0o600 });

  const invalidTarget = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: ['--file', archivePath, '--checksum', checksum, '--target-db', 'ADMIN'],
  });
  assert.equal(invalidTarget.exitCode, 1);
  assert.equal(parseLastJsonLine(invalidTarget.stderr).code, 'INVALID_TARGET_DATABASE');

  const wrongChecksum = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: ['--file', archivePath, '--checksum', '0'.repeat(64), '--target-db', targetDatabase],
  });
  assert.equal(wrongChecksum.exitCode, 1);
  assert.equal(parseLastJsonLine(wrongChecksum.stderr).code, 'BACKUP_CHECKSUM_MISMATCH');

  const wrongPassphrase = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase: 'Wrong Restore!Passphrase123',
    args: ['--file', archivePath, '--checksum', checksum, '--target-db', targetDatabase],
  });
  assert.equal(wrongPassphrase.exitCode, 1);
  assert.equal(parseLastJsonLine(wrongPassphrase.stderr).code, 'BACKUP_DECRYPTION_FAILED');

  const missingReceipt = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: [
      '--file', archivePath,
      '--checksum', checksum,
      '--target-db', targetDatabase,
      '--confirm-target', targetDatabase,
      '--receipt', path.join(temporaryDirectory, 'missing.restore-plan.json'),
      '--execute',
    ],
  });
  assert.equal(missingReceipt.exitCode, 1);
  assert.equal(parseLastJsonLine(missingReceipt.stderr).code, 'DRY_RUN_RECEIPT_REQUIRED');

  const dryRun = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: [
      '--file', archivePath,
      '--checksum', checksum,
      '--target-db', targetDatabase,
      '--receipt', receiptPath,
    ],
  });
  assert.equal(dryRun.exitCode, 0, dryRun.stderr);
  const dryRunOutput = parseLastJsonLine(dryRun.stdout);
  assert.equal(dryRunOutput.dryRun, true);
  assert.equal(dryRunOutput.documentCount, 2);
  assert.equal(dryRunOutput.indexCount, 2);
  assert.equal(dryRunOutput.providerAssetRestoreRequired, false);
  assert.equal((await fs.stat(receiptPath)).mode & 0o777, 0o600);
  assert.equal(
    (await client.db(targetDatabase).listCollections({}, { nameOnly: true }).toArray()).length,
    0,
    'dry run must not create target collections',
  );

  const wrongConfirmation = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: [
      '--file', archivePath,
      '--checksum', checksum,
      '--target-db', targetDatabase,
      '--confirm-target', 'different_restore_database',
      '--receipt', receiptPath,
      '--execute',
    ],
  });
  assert.equal(wrongConfirmation.exitCode, 1);
  assert.equal(parseLastJsonLine(wrongConfirmation.stderr).code, 'TARGET_CONFIRMATION_MISMATCH');
  assert.equal(
    (await client.db(targetDatabase).listCollections({}, { nameOnly: true }).toArray()).length,
    0,
  );

  const execution = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: [
      '--file', archivePath,
      '--checksum', checksum,
      '--target-db', targetDatabase,
      '--confirm-target', targetDatabase,
      '--receipt', receiptPath,
      '--execute',
    ],
  });
  assert.equal(execution.exitCode, 0, execution.stderr);
  const executionOutput = parseLastJsonLine(execution.stdout);
  assert.equal(executionOutput.dryRun, false);
  assert.equal(executionOutput.restoredCollections, 2);
  assert.equal(executionOutput.restoredDocuments, 2);
  assert.equal(executionOutput.restoredIndexes, 2);
  assert.equal(executionOutput.restoredManagedAssets, 0);

  const restoredUser = await client.db(targetDatabase).collection('users').findOne({
    _id: new MongoObjectId(String(userId)),
  });
  assert.equal(restoredUser.email, 'restore.admin@example.test');
  assert.equal(restoredUser.password, passwordHash);
  assert.equal(restoredUser.createdAt.toISOString(), createdAt.toISOString());
  assert.equal(await bcrypt.compare('Restored!Password123', restoredUser.password), true);
  assert.deepEqual(
    await client.db(targetDatabase).collection('counters').findOne({ _id: 'orders' }),
    { _id: 'orders', seq: 41 },
  );
  const userIndexes = await client.db(targetDatabase).collection('users').listIndexes().toArray();
  const emailIndex = userIndexes.find((index) => index.name === 'restore_unique_email');
  assert.deepEqual(emailIndex.key, { email: 1 });
  assert.equal(emailIndex.unique, true);
  const counterIndexes = await client.db(targetDatabase).collection('counters').listIndexes().toArray();
  assert.ok(counterIndexes.some((index) => index.name === 'restore_counter_sequence'));

  const replay = await runRestore({
    mongoUri: replSet.getUri(),
    passphrase,
    args: [
      '--file', archivePath,
      '--checksum', checksum,
      '--target-db', targetDatabase,
      '--confirm-target', targetDatabase,
      '--receipt', receiptPath,
      '--execute',
    ],
  });
  assert.equal(replay.exitCode, 1);
  assert.equal(parseLastJsonLine(replay.stderr).code, 'TARGET_DATABASE_NOT_EMPTY');
});
