import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import test, { after, before } from 'node:test';

process.env.NODE_ENV = 'development';
process.env.SKIP_SERVER_START = 'true';
process.env.CORS_ORIGIN = '';
process.env.JWT_SECRET ||= 'development-origin-test-jwt-secret-that-is-not-used';
process.env.ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef';

const { config } = await import('../config/environment.js');
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
  if (server.listening) await new Promise((resolve) => server.close(resolve));
});

const request = (pathname, options) => fetch(`${origin}${pathname}`, options);

test('development defaults are exact and do not inherit production web origins', () => {
  assert.equal(config.nodeEnv, 'development');
  assert.ok(config.corsOrigin.includes('http://localhost:5173'));
  assert.ok(config.corsOrigin.includes('http://127.0.0.1:5173'));
  assert.ok(config.corsOrigin.includes('capacitor://localhost'));
  assert.equal(config.corsOrigin.includes('https://autospf.shop'), false);
  assert.equal(config.corsOrigin.includes('https://www.autospf.shop'), false);
});

test('development HTTP CORS accepts both loopback frontend names and rejects arbitrary origins', async () => {
  for (const allowedOrigin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const preflight = await request('/api/auth/me', {
      method: 'OPTIONS',
      headers: {
        Origin: allowedOrigin,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

    const unauthenticated = await request('/api/auth/me', {
      headers: { Origin: allowedOrigin },
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get('access-control-allow-origin'), allowedOrigin);
  }

  const rejected = await request('/api/auth/me', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  });
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
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

test('development Socket.IO shares the exact HTTP origin policy', async () => {
  assert.match(await rawWebSocketStatus('http://localhost:5173'), / 101 /);
  assert.match(await rawWebSocketStatus('http://127.0.0.1:5173'), / 101 /);
  assert.match(await rawWebSocketStatus('https://evil.example'), / 4(?:00|03) /);
});
