import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import test, { after, before } from 'node:test';

process.env.NODE_ENV = 'production';
process.env.SKIP_SERVER_START = 'true';
process.env.CORS_ORIGIN = '';
process.env.JWT_SECRET ||= 'security-http-test-jwt-secret-that-is-not-used';
process.env.ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef';

const { default: app } = await import('../server.js');
const { initSocket } = await import('../utils/socket.utils.js');

let server;
let io;
let origin;

before(async () => {
  server = http.createServer(app);
  io = initSocket(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => io.close(resolve));
  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
});

const request = (pathname, options) => fetch(`${origin}${pathname}`, options);

test('Helmet and no-store cover normal errors without server disclosure', async () => {
  const response = await request('/api/ai/scans');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('x-powered-by'), null);
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.match(response.headers.get('strict-transport-security') || '', /max-age=31536000/);
  assert.equal(response.headers.get('content-security-policy'), null);
});

test('authenticated API CORS reflects only exact web and Capacitor origins', async () => {
  for (const allowedOrigin of [
    'https://www.autospf.shop',
    'https://autospf.shop',
    'capacitor://localhost',
  ]) {
    const response = await request('/api/auth/me', {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(response.headers.get('x-powered-by'), null);
  }

  const rejected = await request('/api/auth/me', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
});

test('public GLB preflight is isolated, credential-free, and Range-aware', async () => {
  const response = await request('/api/ai/proxy-glb', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'range',
    },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
  assert.match(response.headers.get('access-control-allow-headers') || '', /Range/i);
});

test('AR HTML receives route-specific CSP and only WebAR is cross-origin frameable', async () => {
  const webAr = await request('/webar/index.html');
  assert.equal(webAr.status, 200);
  const webArCsp = webAr.headers.get('content-security-policy') || '';
  assert.match(webArCsp, /frame-ancestors 'self' https:\/\/autospf\.shop https:\/\/www\.autospf\.shop/);
  assert.match(webArCsp, /script-src [^;]*sha256-/);
  assert.doesNotMatch(webArCsp, /script-src [^;]*'unsafe-inline'/);
  assert.equal(webAr.headers.get('x-frame-options'), null);
  assert.equal(webAr.headers.get('cross-origin-opener-policy'), 'unsafe-none');
  assert.equal(webAr.headers.get('cross-origin-embedder-policy'), null);

  const ar = await request('/ar.html');
  assert.equal(ar.status, 200);
  assert.equal(ar.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.match(ar.headers.get('content-security-policy') || '', /https:\/\/ajax\.googleapis\.com/);
});

test('AR session and viewer reject arbitrary redirect/model hosts', async () => {
  const invalidSession = await request('/api/ai/ar-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelUrl: 'https://evil.example/model.glb' }),
  });
  assert.equal(invalidSession.status, 400);

  const invalidViewer = await request('/api/ai/ar-viewer?src=javascript%3Aalert%281%29', {
    redirect: 'manual',
  });
  assert.equal(invalidViewer.status, 400);

  const validViewer = await request(
    `/api/ai/ar-viewer?src=${encodeURIComponent('https://assets.meshy.ai/models/car.glb')}`,
    { redirect: 'manual' }
  );
  assert.equal(validViewer.status, 302);
  assert.match(validViewer.headers.get('location') || '', /^\/ar\.html\?model=/);

  const fallback = await request('/api/ai/ar-launch');
  assert.equal(fallback.status, 400);
  assert.match(fallback.headers.get('content-security-policy') || '', /style-src 'sha256-/);
  assert.doesNotMatch(fallback.headers.get('content-security-policy') || '', /unsafe-inline/);
});

const rawWebSocketStatus = (browserOrigin) => new Promise((resolve, reject) => {
  const socket = net.createConnection(server.address().port, '127.0.0.1');
  let response = '';
  const timer = setTimeout(() => {
    socket.destroy();
    reject(new Error('WebSocket handshake timed out'));
  }, 3000);

  socket.on('connect', () => {
    socket.write([
      'GET /socket.io/?EIO=4&transport=websocket HTTP/1.1',
      `Host: 127.0.0.1:${server.address().port}`,
      `Origin: ${browserOrigin}`,
      'Connection: Upgrade',
      'Upgrade: websocket',
      'Sec-WebSocket-Version: 13',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      '',
      '',
    ].join('\r\n'));
  });
  socket.on('data', (chunk) => {
    response += chunk.toString('utf8');
    if (!response.includes('\r\n\r\n')) return;
    clearTimeout(timer);
    socket.destroy();
    resolve(response.split('\r\n', 1)[0]);
  });
  socket.on('error', (error) => {
    clearTimeout(timer);
    reject(error);
  });
});

test('WebSocket upgrade rejects unauthorized browser origins', async () => {
  assert.match(await rawWebSocketStatus('https://www.autospf.shop'), / 101 /);
  assert.match(await rawWebSocketStatus('https://evil.example'), / 4(?:00|03) /);
});
