import assert from 'node:assert/strict';
import test from 'node:test';
import { getQCThumbnailUrl } from '../src/lib/qc-image.ts';

test('QC Cloudinary media is rendered through a cached thumbnail derivative', () => {
  const original = 'https://res.cloudinary.com/demo/image/upload/v123/live-tracker/photo.jpg';
  assert.equal(
    getQCThumbnailUrl(original),
    'https://res.cloudinary.com/demo/image/upload/c_fill,w_640,h_480,f_auto,q_auto:eco/v123/live-tracker/photo.jpg'
  );
  assert.equal(getQCThumbnailUrl(original), getQCThumbnailUrl(original));
});

test('QC thumbnail helper never rewrites local previews or unknown hosts', () => {
  assert.equal(getQCThumbnailUrl('blob:https://app.local/preview'), 'blob:https://app.local/preview');
  assert.equal(getQCThumbnailUrl('data:image/jpeg;base64,abc'), 'data:image/jpeg;base64,abc');
  assert.equal(getQCThumbnailUrl('https://images.example.com/photo.jpg'), 'https://images.example.com/photo.jpg');
});

