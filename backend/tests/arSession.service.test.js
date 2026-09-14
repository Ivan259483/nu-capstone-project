import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSceneViewerUrl,
  normalizeArAssetUrl,
  createArSession,
  getArSession,
} from '../services/arSession.service.js';

// Minimal Express-request stand-in — just enough for getPublicOrigin/normalizeArAssetUrl.
const fakeReq = ({ host = 'nu-capstone-project.onrender.com', protocol = 'https', forwardedProto } = {}) => ({
  protocol,
  get(header) {
    const key = String(header).toLowerCase();
    if (key === 'host') return host;
    if (key === 'x-forwarded-proto') return forwardedProto || '';
    return '';
  },
});

test('buildSceneViewerUrl wraps the GLB URL for Google Scene Viewer (Android)', () => {
  const url = buildSceneViewerUrl('https://assets.meshy.ai/vehicle.glb?sig=abc&x=1');
  assert.ok(url.startsWith('https://arvr.google.com/scene-viewer/1.0?file='));
  assert.equal(
    decodeURIComponent(url.split('file=')[1]),
    'https://assets.meshy.ai/vehicle.glb?sig=abc&x=1'
  );
});

test('normalizeArAssetUrl accepts an allow-listed external model host over https', () => {
  const req = fakeReq();
  assert.equal(
    normalizeArAssetUrl(req, 'https://assets.meshy.ai/vehicle.glb'),
    'https://assets.meshy.ai/vehicle.glb'
  );
  assert.equal(
    normalizeArAssetUrl(req, 'https://res.cloudinary.com/demo/vehicle.glb'),
    'https://res.cloudinary.com/demo/vehicle.glb'
  );
});

test('normalizeArAssetUrl rejects hosts outside the AR asset allow-list', () => {
  const req = fakeReq();
  assert.equal(normalizeArAssetUrl(req, 'https://evil.example.com/vehicle.glb'), '');
});

test('normalizeArAssetUrl rejects plain-http for a non-loopback host and rejects embedded credentials', () => {
  const req = fakeReq();
  assert.equal(normalizeArAssetUrl(req, 'http://assets.meshy.ai/vehicle.glb'), '');
  assert.equal(normalizeArAssetUrl(req, 'https://user:pass@assets.meshy.ai/vehicle.glb'), '');
  assert.equal(normalizeArAssetUrl(req, ''), '');
});

test('normalizeArAssetUrl allows http on localhost for local development', () => {
  const req = fakeReq({ host: 'localhost:3000', protocol: 'http' });
  assert.equal(
    normalizeArAssetUrl(req, 'http://localhost:3000/webar/models/fallback-car.glb'),
    'http://localhost:3000/webar/models/fallback-car.glb'
  );
});

test('createArSession returns null when the modelUrl fails validation, so no orphaned session is stored', () => {
  const req = fakeReq();
  const session = createArSession(req, { modelUrl: 'https://evil.example.com/x.glb' });
  assert.equal(session, null);
});

test('createArSession builds a token, Scene Viewer URL and QR launch URL, retrievable via getArSession', () => {
  const req = fakeReq();
  const session = createArSession(req, {
    modelUrl: 'https://assets.meshy.ai/vehicle.glb',
    usdzUrl: 'https://assets.meshy.ai/vehicle.usdz',
    damages: [{ type: 'Dent', severity: 'high', coordinates: { x: 1.4, y: -0.2, width: 0.3, height: 0.3 } }],
  });

  assert.ok(session);
  assert.ok(session.token.length > 10);
  assert.equal(session.sceneViewerUrl, buildSceneViewerUrl('https://assets.meshy.ai/vehicle.glb'));
  assert.equal(session.usdzUrl, 'https://assets.meshy.ai/vehicle.usdz');
  assert.equal(
    session.launchUrl,
    `https://nu-capstone-project.onrender.com/api/ai/ar-launch?token=${session.token}`
  );

  // The QR code encodes launchUrl — a single, device-sniffing link that
  // routes to Scene Viewer on Android and Quick Look on iPhone.
  const stored = getArSession(session.token);
  assert.ok(stored);
  assert.equal(stored.modelUrl, 'https://assets.meshy.ai/vehicle.glb');
  assert.equal(stored.usdzUrl, 'https://assets.meshy.ai/vehicle.usdz');
  // Coordinates outside [0, 1] are clamped rather than trusted verbatim.
  assert.equal(stored.damages[0].coordinates.x, 1);
  assert.equal(stored.damages[0].coordinates.y, 0);
});

test('getArSession returns null for an unknown or expired token', () => {
  assert.equal(getArSession('does-not-exist'), null);
});
