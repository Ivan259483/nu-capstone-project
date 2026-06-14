import test from 'node:test';
import assert from 'node:assert/strict';
import {
  attachProfileImageForClient,
  resolveProfileImageForClient,
} from '../utils/profile-image.utils.js';

test('profile image resolver prefers canonical avatar', () => {
  assert.equal(
    resolveProfileImageForClient({
      avatar: 'https://cdn.example.com/avatar.jpg',
      photoURL: 'https://cdn.example.com/legacy.jpg',
    }),
    'https://cdn.example.com/avatar.jpg',
  );
});

test('profile image resolver supports legacy fields and rejects blob URLs', () => {
  assert.equal(
    resolveProfileImageForClient({
      avatar: 'blob:https://app.example.com/temporary',
      profilePhoto: 'https://cdn.example.com/saved.png',
    }),
    'https://cdn.example.com/saved.png',
  );
});

test('client payload exposes one normalized image with photoURL compatibility alias', () => {
  const payload = {
    profileImage: 'https://cdn.example.com/profile.png',
    profilePhoto: 'https://cdn.example.com/older.png',
  };

  attachProfileImageForClient(payload, payload);

  assert.equal(payload.avatar, 'https://cdn.example.com/profile.png');
  assert.equal(payload.photoURL, 'https://cdn.example.com/profile.png');
  assert.equal('profileImage' in payload, false);
  assert.equal('profilePhoto' in payload, false);
});
