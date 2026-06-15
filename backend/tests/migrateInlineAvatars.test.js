import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAvatarMigrationPlan,
  migrateAvatarDocument,
  parseDataImage,
} from '../scripts/migrate-inline-avatars-to-cloudinary.js';

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=';

test('inline avatar parser validates supported image data', () => {
  const parsed = parseDataImage(PNG_DATA_URI);
  assert.equal(parsed.mimeType, 'image/png');
  assert.equal(parsed.extension, 'png');
  assert.ok(parsed.byteLength > 0);
  assert.equal(parseDataImage('data:text/plain;base64,SGVsbG8='), null);
});

test('migration dry-run reports an upload without writing or uploading', async () => {
  let uploadCount = 0;
  let updateCount = 0;
  const result = await migrateAvatarDocument({
    user: {
      _id: 'sales-1',
      email: 'sales@example.com',
      avatar: PNG_DATA_URI,
    },
    upload: async () => {
      uploadCount += 1;
      return 'https://cdn.example.com/avatar.png';
    },
    updateOne: async () => {
      updateCount += 1;
      return { matchedCount: 1 };
    },
  });

  assert.equal(result.status, 'dry-run');
  assert.equal(result.plan.action, 'upload');
  assert.equal(uploadCount, 0);
  assert.equal(updateCount, 0);
});

test('migration apply uploads once and replaces inline aliases conditionally', async () => {
  const updates = [];
  const result = await migrateAvatarDocument({
    user: {
      _id: 'sales-1',
      email: 'sales@example.com',
      avatar: PNG_DATA_URI,
      profileImage: PNG_DATA_URI,
    },
    apply: true,
    upload: async (_buffer, options) => {
      assert.match(options.publicId, /^user_sales-1_[a-f0-9]{16}$/);
      return 'https://cdn.example.com/avatar.png';
    },
    updateOne: async (filter, update) => {
      updates.push({ filter, update });
      return { matchedCount: 1 };
    },
  });

  assert.equal(result.status, 'migrated');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].filter.avatar, PNG_DATA_URI);
  assert.equal(updates[0].update.$set.avatar, 'https://cdn.example.com/avatar.png');
  assert.equal(updates[0].update.$set.photoURL, 'https://cdn.example.com/avatar.png');
  assert.equal(updates[0].update.$unset.profileImage, '');
});

test('migration prefers an existing URL and is idempotent after replacement', () => {
  const plan = buildAvatarMigrationPlan({
    _id: 'sales-1',
    avatar: PNG_DATA_URI,
    profileImage: 'https://cdn.example.com/existing.png',
  });
  assert.equal(plan.action, 'reuse-url');
  assert.equal(plan.existingUrl, 'https://cdn.example.com/existing.png');

  assert.equal(
    buildAvatarMigrationPlan({
      _id: 'sales-1',
      avatar: 'https://cdn.example.com/existing.png',
      photoURL: 'https://cdn.example.com/existing.png',
    }),
    null
  );
});

test('migration does not overwrite a concurrent profile change', async () => {
  const result = await migrateAvatarDocument({
    user: {
      _id: 'sales-1',
      avatar: PNG_DATA_URI,
    },
    apply: true,
    upload: async () => 'https://cdn.example.com/avatar.png',
    updateOne: async () => ({ matchedCount: 0 }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'concurrent-profile-change');
});
