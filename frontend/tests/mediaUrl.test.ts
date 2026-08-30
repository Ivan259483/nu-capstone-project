import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMediaUrl } from '../src/lib/media-url.ts';

const API_URL = 'https://nu-capstone-project.onrender.com/api';
const FILE_ID = '507f1f77bcf86cd799439011';
const EXPECTED = `https://nu-capstone-project.onrender.com/api/users/profile/photo/${FILE_ID}`;

test('rebases a legacy LAN profile-photo URL to the configured backend', () => {
    assert.equal(
        resolveMediaUrl(`http://192.168.18.164:3000/api/users/profile/photo/${FILE_ID}`, API_URL),
        EXPECTED
    );
});

test('resolves a provider-independent profile-photo path', () => {
    assert.equal(
        resolveMediaUrl(`/api/users/profile/photo/${FILE_ID}`, API_URL),
        EXPECTED
    );
});

test('keeps unrelated and provider-hosted image URLs unchanged', () => {
    const cloudinary = 'https://res.cloudinary.com/demo/image/upload/avatar.jpg';
    assert.equal(resolveMediaUrl(cloudinary, API_URL), cloudinary);
    assert.equal(resolveMediaUrl('/images/avatar.jpg', API_URL), '/images/avatar.jpg');
});

test('drops query strings from the public profile-photo route', () => {
    assert.equal(
        resolveMediaUrl(`/api/users/profile/photo/${FILE_ID}?token=must-not-leak`, API_URL),
        EXPECTED
    );
});
