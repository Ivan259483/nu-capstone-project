import assert from 'node:assert/strict';
import test from 'node:test';
import { ObjectId } from 'mongodb';
import { remapManagedAssets } from '../scripts/restore-autospf-backup.js';

test('restore utility remaps provider assets into the managed record and owning field', () => {
  const ownerId = new ObjectId();
  const assetId = new ObjectId();
  const owner = { _id: ownerId, avatar: 'https://old.example/avatar.jpg' };
  const managed = {
    _id: assetId,
    provider: 'cloudinary',
    accountIdentifier: 'old-cloud',
    publicId: 'avatars/original',
    secureUrl: owner.avatar,
    ownerCollection: 'User',
    ownerId,
    fieldPath: 'avatar',
    status: 'active',
  };
  const summary = {
    collections: [
      { name: 'users', documents: [owner] },
      { name: 'managedassets', documents: [managed] },
    ],
  };

  remapManagedAssets(summary, [{
    assetId: String(assetId),
    provider: 'cloudinary',
    originalPublicId: 'avatars/original',
    publicId: 'autospf-restores/checksum/avatars/original',
    accountIdentifier: 'target-cloud',
    secureUrl: 'https://res.cloudinary.com/target-cloud/image/upload/autospf-restores/checksum/avatars/original.jpg',
    checksum: 'a'.repeat(64),
    byteSize: 123,
  }]);

  assert.match(owner.avatar, /target-cloud/);
  assert.equal(managed.accountIdentifier, 'target-cloud');
  assert.match(managed.publicId, /^autospf-restores\//);
  assert.equal(managed.secureUrl, owner.avatar);
  assert.equal(managed.status, 'active');
});

test('restore utility rejects unsafe managed owner paths', () => {
  const ownerId = new ObjectId();
  const assetId = new ObjectId();
  assert.throws(
    () => remapManagedAssets({
      collections: [
        { name: 'users', documents: [{ _id: ownerId }] },
        { name: 'managedassets', documents: [{
          _id: assetId,
          provider: 'cloudinary',
          publicId: 'avatars/original',
          ownerCollection: 'User',
          ownerId,
          fieldPath: '__proto__.polluted',
        }] },
      ],
    }, [{
      assetId: String(assetId),
      provider: 'cloudinary',
      originalPublicId: 'avatars/original',
      publicId: 'restored/avatar',
      accountIdentifier: 'target-cloud',
      secureUrl: 'https://example.test/restored.jpg',
      checksum: 'b'.repeat(64),
      byteSize: 1,
    }]),
    (error) => error.code === 'INVALID_MANAGED_ASSET_OWNER',
  );
  assert.equal(Object.prototype.polluted, undefined);
});

test('restore utility resolves semantic tracker-stage asset paths into array entries', () => {
  const ownerId = new ObjectId();
  const assetId = new ObjectId();
  const originalUrl = 'https://res.cloudinary.com/source/image/upload/tracker/front.jpg';
  const restoredUrl = 'https://res.cloudinary.com/target/image/upload/tracker/front.jpg';
  const owner = {
    _id: ownerId,
    trackerStageMedia: [
      { stage: 'received', slot: 'front', photoUrl: originalUrl },
      { stage: 'received', slot: 'rear', photoUrl: 'https://example.test/rear.jpg' },
    ],
  };
  const managed = {
    _id: assetId,
    provider: 'cloudinary',
    publicId: 'tracker/front',
    secureUrl: originalUrl,
    ownerCollection: 'Order',
    ownerId,
    fieldPath: 'trackerStageMedia.received.front',
  };

  remapManagedAssets({
    collections: [
      { name: 'orders', documents: [owner] },
      { name: 'managedassets', documents: [managed] },
    ],
  }, [{
    assetId: String(assetId),
    provider: 'cloudinary',
    originalPublicId: 'tracker/front',
    publicId: 'autospf-restores/checksum/tracker/front',
    accountIdentifier: 'target',
    secureUrl: restoredUrl,
    checksum: 'c'.repeat(64),
    byteSize: 42,
  }]);

  assert.equal(owner.trackerStageMedia[0].photoUrl, restoredUrl);
  assert.equal(owner.trackerStageMedia[1].photoUrl, 'https://example.test/rear.jpg');
  assert.equal(Object.hasOwn(owner.trackerStageMedia, 'received'), false);
});

test('restore utility rejects a managed record that does not match its owner URL', () => {
  const ownerId = new ObjectId();
  const assetId = new ObjectId();
  assert.throws(
    () => remapManagedAssets({
      collections: [
        { name: 'users', documents: [{ _id: ownerId, avatar: 'https://example.test/actual.jpg' }] },
        { name: 'managedassets', documents: [{
          _id: assetId,
          provider: 'cloudinary',
          publicId: 'avatars/original',
          secureUrl: 'https://example.test/different.jpg',
          ownerCollection: 'User',
          ownerId,
          fieldPath: 'avatar',
        }] },
      ],
    }, [{
      assetId: String(assetId),
      provider: 'cloudinary',
      originalPublicId: 'avatars/original',
      publicId: 'autospf-restores/checksum/avatars/original',
      accountIdentifier: 'target-cloud',
      secureUrl: 'https://example.test/restored.jpg',
      checksum: 'd'.repeat(64),
      byteSize: 1,
    }]),
    (error) => error.code === 'MANAGED_ASSET_OWNER_REFERENCE_MISMATCH',
  );
});
