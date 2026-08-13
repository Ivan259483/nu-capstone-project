import fs from 'node:fs';
import process from 'node:process';
import { chromium } from 'playwright-core';

const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('Set CHROME_PATH to a Chromium-compatible browser executable');

const backendOrigin = process.env.AR_TEST_BASE_URL || 'http://127.0.0.1:4180';
const frontendOrigin = process.env.CSP_TEST_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext();
await context.addInitScript(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__cspViolations.push({
      blockedURI: event.blockedURI,
      effectiveDirective: event.effectiveDirective,
      violatedDirective: event.violatedDirective,
    });
  });
});

const results = [];
try {
  for (const pathname of [
    '/ar-viewer.html',
    '/ar.html?model=/webar/models/fallback-car.glb',
  ]) {
    const page = await context.newPage();
    const response = await page.goto(`${backendOrigin}${pathname}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForFunction(() => Boolean(customElements.get('model-viewer')), null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    results.push({
      route: pathname,
      status: response?.status(),
      modelViewerDefined: await page.evaluate(() => Boolean(customElements.get('model-viewer'))),
      violations: await page.evaluate(() => window.__cspViolations || []),
    });
    await page.close();
  }

  const hostPage = await context.newPage();
  await hostPage.goto(frontendOrigin, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await hostPage.evaluate((url) => {
    const iframe = document.createElement('iframe');
    iframe.id = 'security-webar-frame';
    iframe.allow = 'camera';
    iframe.src = url;
    document.body.appendChild(iframe);
  }, `${backendOrigin}/webar/index.html?embed=1`);
  await hostPage.waitForTimeout(6000);
  const webArFrame = hostPage.frames().find((frame) => frame.url().startsWith(`${backendOrigin}/webar/index.html`));
  results.push({
    route: '/webar/index.html (cross-origin iframe)',
    status: webArFrame ? 200 : 0,
    modelViewerDefined: webArFrame
      ? await webArFrame.evaluate(() => Boolean(customElements.get('model-viewer')))
      : false,
    violations: webArFrame
      ? await webArFrame.evaluate(() => window.__cspViolations || [])
      : [{ effectiveDirective: 'frame-ancestors', blockedURI: backendOrigin }],
  });
  await hostPage.close();
} finally {
  await browser.close();
}

let failed = false;
for (const result of results) {
  console.log(
    `${result.route} HTTP ${result.status} — model-viewer: ${result.modelViewerDefined ? 'ready' : 'missing'} — CSP violations: ${result.violations.length}`
  );
  for (const violation of result.violations) console.log(JSON.stringify(violation));
  if (result.status !== 200 || !result.modelViewerDefined || result.violations.length > 0) failed = true;
}
if (failed) process.exitCode = 1;
