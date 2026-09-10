/**
 * Backfill inline base64 `trackerStageMedia.photoUrl` entries on existing Orders
 * to permanent Cloudinary URLs.
 *
 * Every QC/live-tracker stage photo whose background Cloudinary upload failed
 * (see the "Upload preset not found" root cause documented in the perf audit)
 * was left permanently embedded as a `data:image/...;base64,...` string on the
 * Order document. This script uploads each of those to Cloudinary and swaps the
 * stored value for the resulting secure_url, shrinking the affected Order
 * documents back down to normal size.
 *
 * Run this only AFTER Cloudinary is confirmed working (fix CLOUDINARY_API_SECRET
 * or the CLOUDINARY_UPLOAD_PRESET, per the audit report) — otherwise every row
 * will simply fail again with the same error.
 *
 * Read-only preview:
 *   node scripts/migrate-inline-tracker-media-to-cloudinary.js --dry-run
 *
 * Apply:
 *   node scripts/migrate-inline-tracker-media-to-cloudinary.js --apply
 */

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

const DATA_IMAGE_PATTERN = /^data:image\/(png|jpe?g|webp);base64,([\s\S]+)$/i;
const MAX_INLINE_PHOTO_BYTES = 10 * 1024 * 1024;

export function parseDataImage(value) {
  const match = typeof value === 'string' ? value.match(DATA_IMAGE_PATTERN) : null;
  if (!match) return null;

  const mimeSubtype = match[1].toLowerCase();
  const mimeType = mimeSubtype === 'png' ? 'image/png' : mimeSubtype === 'webp' ? 'image/webp' : 'image/jpeg';
  const extension = mimeSubtype === 'png' ? 'png' : mimeSubtype === 'webp' ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_INLINE_PHOTO_BYTES) return null;

  return { buffer, mimeType, extension, byteLength: buffer.length };
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
    throw new Error(`Cloudinary is not configured. ${getCloudinaryMissingConfigMessage()}`);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const orders = client.db().collection('orders');
  const query = { 'trackerStageMedia.photoUrl': { $regex: '^data:image/' } };
  const cursor = orders.find(query, {
    projection: { orderNumber: 1, trackerStageMedia: 1 },
  });

  const summary = {
    mode: apply ? 'apply' : 'dry-run',
    ordersScanned: 0,
    photosFound: 0,
    photosMigrated: 0,
    photosFailed: 0,
    bytesBefore: 0,
    bytesAfterUrls: 0,
  };

  try {
    for await (const order of cursor) {
      summary.ordersScanned += 1;
      const media = Array.isArray(order.trackerStageMedia) ? order.trackerStageMedia : [];

      for (let index = 0; index < media.length; index += 1) {
        const entry = media[index];
        const parsed = parseDataImage(entry?.photoUrl);
        if (!parsed) continue;

        summary.photosFound += 1;
        summary.bytesBefore += entry.photoUrl.length;
        const label = `${order.orderNumber || order._id} stage=${entry.stage} slot=${entry.slot || '(none)'}`;

        if (!apply) {
          console.log(`[dry-run] ${label} bytes=${parsed.byteLength}`);
          continue;
        }

        try {
          const secureUrl = await uploadBufferToCloudinary(parsed.buffer, {
            folder: 'live-tracker-stages',
            filename: `stage_photo_${order._id}_${index}.${parsed.extension}`,
            contentType: parsed.mimeType,
          });

          // Optimistic concurrency: only overwrite if the field still holds the
          // exact inline value we just read (nobody re-uploaded/removed it since).
          const result = await orders.updateOne(
            { _id: order._id, [`trackerStageMedia.${index}.photoUrl`]: entry.photoUrl },
            { $set: { [`trackerStageMedia.${index}.photoUrl`]: secureUrl, updatedAt: new Date() } }
          );

          if (!result.matchedCount) {
            summary.photosFailed += 1;
            console.error(`[failed] ${label} reason=concurrent-change`);
            continue;
          }

          summary.photosMigrated += 1;
          summary.bytesAfterUrls += secureUrl.length;
          console.log(`[migrated] ${label} -> ${secureUrl}`);
        } catch (error) {
          summary.photosFailed += 1;
          console.error(`[failed] ${label} reason=${error.message}`);
        }
      }
    }
  } finally {
    await client.close();
  }

  console.log(JSON.stringify(summary, null, 2));
  if (summary.photosFailed > 0) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  run().catch((error) => {
    console.error(`[tracker-media-migration] ${error.message}`);
    process.exitCode = 1;
  });
}
