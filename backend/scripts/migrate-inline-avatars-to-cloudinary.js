/**
 * Migrate inline user profile images to Cloudinary.
 *
 * Read-only preview:
 *   node scripts/migrate-inline-avatars-to-cloudinary.js --dry-run
 *
 * Apply:
 *   node scripts/migrate-inline-avatars-to-cloudinary.js --apply
 */

import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

import {
  getCloudinaryMissingConfigMessage,
  isCloudinaryConfigured,
  uploadBufferToCloudinary,
} from '../utils/cloudinaryStorage.utils.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(SCRIPT_DIR, '../.env'), override: false });

export const PROFILE_IMAGE_FIELDS = Object.freeze([
  'avatarUrl',
  'avatar',
  'profileImage',
  'photoURL',
  'profilePhoto',
  'image',
  'photo',
]);

const CANONICAL_IMAGE_FIELDS = new Set(['avatar', 'photoURL']);
const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i;
const MAX_INLINE_AVATAR_BYTES = 10 * 1024 * 1024;

const clean = (value = '') => (typeof value === 'string' ? value.trim() : '');
const isHttpUrl = (value = '') => /^https?:\/\//i.test(clean(value));

export function maskEmail(value = '') {
  const email = clean(value);
  const at = email.indexOf('@');
  if (at <= 0) return email ? '***' : '(no email)';
  const local = email.slice(0, at);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***${email.slice(at)}`;
}

export function parseDataImage(value) {
  const match = clean(value).match(DATA_IMAGE_PATTERN);
  if (!match) return null;

  const mimeSubtype = match[1].toLowerCase();
  const mimeType = mimeSubtype === 'png' ? 'image/png' : 'image/jpeg';
  const extension = mimeSubtype === 'png' ? 'png' : 'jpg';
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_INLINE_AVATAR_BYTES) return null;

  const validMagic = mimeType === 'image/png'
    ? buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    : buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
  if (!validMagic) return null;

  return {
    buffer,
    mimeType,
    extension,
    byteLength: buffer.length,
    hash: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

export function buildAvatarMigrationPlan(user = {}) {
  const imageSnapshot = Object.fromEntries(
    PROFILE_IMAGE_FIELDS
      .map((field) => [field, clean(user[field])])
      .filter(([, value]) => value)
  );
  const inlineFields = PROFILE_IMAGE_FIELDS.filter((field) =>
    DATA_IMAGE_PATTERN.test(imageSnapshot[field] || '')
  );
  if (!inlineFields.length) return null;

  const existingUrlField = PROFILE_IMAGE_FIELDS.find((field) =>
    isHttpUrl(imageSnapshot[field])
  );
  if (existingUrlField) {
    return {
      userId: user._id,
      email: clean(user.email),
      sourceField: existingUrlField,
      sourceValue: imageSnapshot[existingUrlField],
      imageSnapshot,
      inlineFields,
      action: 'reuse-url',
      existingUrl: imageSnapshot[existingUrlField],
    };
  }

  for (const sourceField of inlineFields) {
    const parsed = parseDataImage(imageSnapshot[sourceField]);
    if (!parsed) continue;
    return {
      userId: user._id,
      email: clean(user.email),
      sourceField,
      sourceValue: imageSnapshot[sourceField],
      imageSnapshot,
      inlineFields,
      action: 'upload',
      parsed,
    };
  }

  return {
    userId: user._id,
    email: clean(user.email),
    sourceField: inlineFields[0],
    sourceValue: imageSnapshot[inlineFields[0]],
    imageSnapshot,
    inlineFields,
    action: 'invalid',
  };
}

const buildConditionalFilter = (plan) => ({
  _id: plan.userId,
  ...Object.fromEntries(
    Object.entries(plan.imageSnapshot).map(([field, value]) => [field, value])
  ),
});

const buildCanonicalUpdate = (plan, avatarUrl) => {
  const unset = {};
  for (const field of PROFILE_IMAGE_FIELDS) {
    if (!CANONICAL_IMAGE_FIELDS.has(field) && plan.imageSnapshot[field]) {
      unset[field] = '';
    }
  }

  return {
    $set: {
      avatar: avatarUrl,
      photoURL: avatarUrl,
      updatedAt: new Date(),
    },
    ...(Object.keys(unset).length ? { $unset: unset } : {}),
  };
};

export async function migrateAvatarDocument({
  user,
  apply = false,
  upload = uploadBufferToCloudinary,
  updateOne,
}) {
  const plan = buildAvatarMigrationPlan(user);
  if (!plan) return { status: 'skipped', reason: 'already-url-or-empty' };
  if (plan.action === 'invalid') {
    return { status: 'failed', reason: 'invalid-inline-image', plan };
  }
  if (!apply) return { status: 'dry-run', plan };
  if (typeof updateOne !== 'function') {
    throw new TypeError('updateOne is required in apply mode');
  }

  const avatarUrl = plan.action === 'reuse-url'
    ? plan.existingUrl
    : await upload(plan.parsed.buffer, {
        folder: 'profile-photos',
        publicId: `user_${String(plan.userId)}_${plan.parsed.hash.slice(0, 16)}`,
        filename: `profile.${plan.parsed.extension}`,
        contentType: plan.parsed.mimeType,
      });
  if (!isHttpUrl(avatarUrl)) {
    return { status: 'failed', reason: 'invalid-upload-url', plan };
  }

  const result = await updateOne(
    buildConditionalFilter(plan),
    buildCanonicalUpdate(plan, avatarUrl)
  );
  if (!result?.matchedCount) {
    return { status: 'failed', reason: 'concurrent-profile-change', plan };
  }

  return {
    status: 'migrated',
    action: plan.action,
    avatarUrl,
    plan,
  };
}

async function run() {
  const apply = process.argv.includes('--apply');
  const explicitlyDryRun = process.argv.includes('--dry-run');
  if (apply && explicitlyDryRun) {
    throw new Error('Choose either --dry-run or --apply, not both.');
  }
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }
  if (apply && !isCloudinaryConfigured()) {
    throw new Error(
      `Cloudinary is not configured. ${getCloudinaryMissingConfigMessage()}`
    );
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const users = client.db().collection('users');
  const inlineRegex = /^data:image\/(png|jpe?g);base64,/i;
  const query = {
    $or: PROFILE_IMAGE_FIELDS.map((field) => ({ [field]: inlineRegex })),
  };
  const cursor = users.find(query, {
    projection: {
      email: 1,
      ...Object.fromEntries(PROFILE_IMAGE_FIELDS.map((field) => [field, 1])),
    },
  });

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    scanned: 0,
    planned: 0,
    migrated: 0,
    reusedUrl: 0,
    failed: 0,
  };

  try {
    for await (const user of cursor) {
      summary.scanned += 1;
      const result = await migrateAvatarDocument({
        user,
        apply,
        updateOne: (filter, update) => users.updateOne(filter, update),
      });
      const plan = result.plan;
      const identity = `${String(user._id)} ${maskEmail(user.email)}`;

      if (result.status === 'dry-run') {
        summary.planned += 1;
        const bytes = plan.parsed?.byteLength || 0;
        console.log(
          `[dry-run] ${identity} source=${plan.sourceField} action=${plan.action} bytes=${bytes}`
        );
      } else if (result.status === 'migrated') {
        summary.migrated += 1;
        if (result.action === 'reuse-url') summary.reusedUrl += 1;
        console.log(
          `[migrated] ${identity} source=${plan.sourceField} action=${result.action}`
        );
      } else if (result.status === 'failed') {
        summary.failed += 1;
        console.error(
          `[failed] ${identity} reason=${result.reason} source=${plan?.sourceField || 'unknown'}`
        );
      }
    }
  } finally {
    await client.close();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.failed > 0) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  run().catch((error) => {
    console.error(`[avatar-migration] ${error.message}`);
    process.exitCode = 1;
  });
}
