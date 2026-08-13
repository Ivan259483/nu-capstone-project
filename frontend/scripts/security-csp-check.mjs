import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, '..');
const vercelConfig = JSON.parse(fs.readFileSync(path.join(frontendDir, 'vercel.json'), 'utf8'));
const reportOnlyPolicy = vercelConfig.headers[0].headers
  .find((header) => header.key === 'Content-Security-Policy-Report-Only')?.value;

if (!reportOnlyPolicy) throw new Error('Content-Security-Policy-Report-Only is missing from vercel.json');

const baseUrl = process.env.CSP_TEST_BASE_URL || 'http://127.0.0.1:4173';
const chromeCandidates = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!executablePath) throw new Error('Set CHROME_PATH to a Chromium-compatible browser executable');

const routes = ['/', '/gallery', '/contact', '/login', '/ar-estimator'];
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext();

await context.route(`${baseUrl}/**`, async (route) => {
  if (route.request().resourceType() !== 'document') return route.continue();
  const response = await route.fetch();
  return route.fulfill({
    response,
    headers: {
      ...response.headers(),
      'content-security-policy-report-only': reportOnlyPolicy,
    },
  });
});

const results = [];
try {
  for (const routePath of routes) {
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations.push({
          blockedURI: event.blockedURI,
          effectiveDirective: event.effectiveDirective,
          violatedDirective: event.violatedDirective,
          sourceFile: event.sourceFile,
        });
      });
    });
    const response = await page.goto(`${baseUrl}${routePath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    await page.waitForTimeout(2500);
    const violations = await page.evaluate(() => window.__cspViolations || []);
    results.push({ route: routePath, status: response?.status(), violations });
    await page.close();
  }
} finally {
  await browser.close();
}

for (const result of results) {
  console.log(`${result.route} HTTP ${result.status} — CSP violations: ${result.violations.length}`);
  for (const violation of result.violations) console.log(JSON.stringify(violation));
}

const violationCount = results.reduce((total, result) => total + result.violations.length, 0);
if (violationCount > 0) process.exitCode = 1;
