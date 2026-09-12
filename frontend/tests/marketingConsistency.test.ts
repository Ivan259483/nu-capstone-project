import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
const mobileSource = (path: string) => readFileSync(new URL(`../../mobile/src/${path}`, import.meta.url), 'utf8');

test('public review and reply promises use the approved copy', () => {
  const translations = `${source('translations/en.ts')}\n${source('translations/fil.ts')}`;
  assert.doesNotMatch(translations, /5K\+ Reviews|Same-Day Reply|Sagot sa Araw Ding iyon/);
  assert.match(translations, /68 Reviews · 100% Recommend/);
  assert.match(translations, /Reply Within 24 Hours/);
  assert.match(translations, /Sagot sa Loob ng 24 Oras/);
});

test('mobile trust badge shows the approved rating and review count', () => {
  assert.match(mobileSource('app/(customer)/index.tsx'), /4\.9 · 68 reviews/);
});

test('active vehicle-category fallbacks use the canonical labels', () => {
  const activeCategorySources = [
    'lib/service-pricing.ts',
    'lib/customer-booking-catalog.ts',
    'components/shared/vehicle-garage-constants.ts',
    'components/sales/pos/ServiceCartPanel.tsx',
    'pages/CustomerDashboard.tsx',
    'translations/en.ts',
    'translations/fil.ts',
  ].map(source).join('\n');
  assert.doesNotMatch(activeCategorySources, /['"](?:Midsized|Pick Up|Pick UP|Highend Sedan|High-End Sedan)['"]/);
  for (const label of ['Hatchback', 'Sedan', 'Midsize', 'SUV', 'Pickup', 'Large SUV / Van', 'High-end Sedan']) {
    assert.match(activeCategorySources, new RegExp(label.replace('/', '\\/')));
  }
});

test('both public chat launchers share the branded 60px launcher class', () => {
  const theme = source('components/chat/chat-theme.ts');
  const app = source('App.tsx');
  const widget = source('components/ChatWidget.tsx');
  assert.match(theme, /h-\[60px\].*w-\[60px\].*from-\[#F4B63D\].*to-\[#D58A12\].*text-\[#07070A\]/s);
  assert.match(app, /className=\{chatLauncherClass\}/);
  assert.match(widget, /className=\{chatLauncherClass\}/);
});

test('About and Contact use the reduced hero bottom padding', () => {
  for (const page of ['pages/About.tsx', 'pages/Contact.tsx']) {
    assert.match(source(page), /pt-36 pb-8/);
    assert.doesNotMatch(source(page), /pt-36 pb-24/);
  }
});
