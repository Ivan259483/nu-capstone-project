import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
process.env.CORS_ORIGIN = '';
process.env.JWT_SECRET ||= 'security-hardening-test-jwt-secret-that-is-not-used';
process.env.ENCRYPTION_KEY ||= '0123456789abcdef0123456789abcdef';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(testDir, '..');
const projectDir = path.resolve(backendDir, '..');

const { buildStaticArCsp, getInlineCspHashes } = await import('../utils/csp.utils.js');
const { config } = await import('../config/environment.js');
const { isConfiguredCorsOriginAllowed } = await import('../utils/origin.utils.js');

test('frontend Report-Only CSP hash matches the current inline JSON-LD', () => {
  const indexPath = path.join(projectDir, 'frontend', 'index.html');
  const vercelPath = path.join(projectDir, 'frontend', 'vercel.json');
  const html = fs.readFileSync(indexPath, 'utf8');
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
  const frontendHeaderRule = vercelConfig.headers[0];
  assert.equal(frontendHeaderRule.source, '/((?!api(?:/|$)).*)');
  const policy = frontendHeaderRule.headers
    .find((header) => header.key === 'Content-Security-Policy-Report-Only')?.value;
  assert.ok(policy, 'Report-Only CSP header must exist');

  const inlineScript = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find((match) => !/\bsrc\s*=/i.test(match[1]))?.[2];
  assert.ok(inlineScript, 'inline JSON-LD script must exist');
  const hash = createHash('sha256').update(inlineScript, 'utf8').digest('base64');
  assert.match(policy, new RegExp(`'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /script-src-attr 'none'/);
  assert.doesNotMatch(policy, /script-src [^;]*(?:'unsafe-inline'|'unsafe-eval'| \*)/);
  assert.doesNotMatch(policy, /connect-src [^;]* \*/);
});

test('AR document CSP hashes every inline block without broad script or network wildcards', () => {
  const arFiles = [
    path.join(backendDir, 'public', 'ar.html'),
    path.join(backendDir, 'public', 'ar-viewer.html'),
    path.join(backendDir, 'public', 'webar', 'index.html'),
    path.join(backendDir, 'public', 'webar', 'mindar.html'),
  ];

  for (const filePath of arFiles) {
    const policy = buildStaticArCsp(filePath, 'production');
    const hashes = getInlineCspHashes(filePath);
    assert.ok(hashes.scriptHashes.length > 0, `${path.basename(filePath)} needs an inline script hash`);
    assert.ok(hashes.styleHashes.length > 0, `${path.basename(filePath)} needs an inline style hash`);
    for (const hash of hashes.scriptHashes) {
      assert.ok(policy.includes(hash), `${path.basename(filePath)} CSP is missing ${hash}`);
    }
    assert.match(policy, /script-src-attr 'none'/);
    assert.doesNotMatch(policy, /script-src [^;]*(?:'unsafe-inline'|'unsafe-eval'| \*)/);
    assert.doesNotMatch(policy, /(?:^| )https:(?: |;|$)/);
    assert.doesNotMatch(policy, /connect-src [^;]* \*/);
    assert.doesNotMatch(fs.readFileSync(filePath, 'utf8'), /\son[a-z]+\s*=/i);
  }

  const webArPolicy = buildStaticArCsp(arFiles[2], 'production');
  assert.match(webArPolicy, /frame-ancestors 'self' https:\/\/autospf\.shop https:\/\/www\.autospf\.shop/);
  assert.doesNotMatch(webArPolicy, /localhost/);
});

test('production browser and mobile origins are exact while native no-Origin remains supported', () => {
  assert.deepEqual(config.corsOrigin, [
    'https://autospf.shop',
    'https://www.autospf.shop',
    'capacitor://localhost',
  ]);
  assert.equal(isConfiguredCorsOriginAllowed('https://www.autospf.shop'), true);
  assert.equal(isConfiguredCorsOriginAllowed('https://autospf.shop'), true);
  assert.equal(isConfiguredCorsOriginAllowed('capacitor://localhost'), true);
  assert.equal(isConfiguredCorsOriginAllowed(undefined), true);
  assert.equal(isConfiguredCorsOriginAllowed('https://evil.example'), false);
  assert.equal(isConfiguredCorsOriginAllowed('http://localhost:5173'), false);
  assert.equal(isConfiguredCorsOriginAllowed('null'), false);
});
