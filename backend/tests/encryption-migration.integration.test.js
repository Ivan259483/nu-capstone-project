import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= 'T'.repeat(32);

const { createEncryptionService } = await import('../utils/encryption.utils.js');
const execFileAsync = promisify(execFile);
const testDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(testDir, '..');
const migrationScript = path.join(backendDir, 'scripts', 'migrate-legacy-encryption-key.js');
const CURRENT_KEY = 'C'.repeat(32);
const LEGACY_KEY = 'L'.repeat(32);
const silentLogger = { info() {}, warn() {} };

test('database migration is dry-run by default, verified, atomic, and idempotent', async (t) => {
  const mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${backendDir}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  t.after(() => mongo.stop());

  const uri = mongo.getUri('autospf-encryption-migration-test');
  const client = new MongoClient(uri);
  await client.connect();
  t.after(() => client.close());
  const db = client.db();

  const legacyService = createEncryptionService({ currentKey: LEGACY_KEY, logger: silentLogger });
  const currentService = createEncryptionService({ currentKey: CURRENT_KEY, logger: silentLogger });
  const legacyPhone = legacyService.encrypt('legacy phone');
  const legacyPlate = legacyService.encrypt('legacy plate');
  const legacyChatPhone = legacyService.encrypt('legacy chat phone');
  const currentAddress = currentService.encrypt('current address');
  const corruptNotes = `${'a'.repeat(32)}:00`;

  await db.collection('users').insertOne({ phone: legacyPhone, address: currentAddress });
  await db.collection('orders').insertOne({
    vehiclePlate: legacyPlate,
    shippingAddress: 'existing plaintext',
    notes: corruptNotes,
  });
  await db.collection('chatconversations').insertOne({ customerPhone: legacyChatPhone });

  const run = (args = []) => execFileAsync(process.execPath, [migrationScript, ...args], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MONGODB_URI: uri,
      ENCRYPTION_KEY: CURRENT_KEY,
      LEGACY_ENCRYPTION_KEY: LEGACY_KEY,
    },
  });

  const dryRun = await run();
  assert.match(dryRun.stdout, /Mode: DRY RUN/);
  let user = await db.collection('users').findOne({});
  let order = await db.collection('orders').findOne({});
  let conversation = await db.collection('chatconversations').findOne({});
  assert.equal(user.phone, legacyPhone);
  assert.equal(order.vehiclePlate, legacyPlate);
  assert.equal(conversation.customerPhone, legacyChatPhone);

  const applied = await run(['--apply']);
  assert.match(applied.stdout, /Mode: APPLY/);
  user = await db.collection('users').findOne({});
  order = await db.collection('orders').findOne({});
  conversation = await db.collection('chatconversations').findOne({});

  assert.equal(currentService.decrypt(user.phone), 'legacy phone');
  assert.equal(user.address, currentAddress, 'current-key ciphertext must not be rewritten');
  assert.equal(currentService.decrypt(order.vehiclePlate), 'legacy plate');
  assert.equal(order.shippingAddress, 'existing plaintext');
  assert.equal(order.notes, corruptNotes, 'corrupted ciphertext must be preserved');
  assert.equal(currentService.decrypt(conversation.customerPhone), 'legacy chat phone');

  const valuesAfterFirstApply = {
    phone: user.phone,
    address: user.address,
    plate: order.vehiclePlate,
    notes: order.notes,
    chatPhone: conversation.customerPhone,
  };
  await run(['--apply']);
  user = await db.collection('users').findOne({});
  order = await db.collection('orders').findOne({});
  conversation = await db.collection('chatconversations').findOne({});
  assert.deepEqual(
    {
      phone: user.phone,
      address: user.address,
      plate: order.vehiclePlate,
      notes: order.notes,
      chatPhone: conversation.customerPhone,
    },
    valuesAfterFirstApply,
    'a repeated migration must not rewrite already-current ciphertext'
  );
});
