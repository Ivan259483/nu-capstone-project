import test from 'node:test';
import assert from 'node:assert/strict';

import { SPF_PACKAGE_PRICING } from '../constants/spfPricing.js';
import { normalizeServicePricing } from '../controllers/service.controller.js';

test('official SPF package metadata uses the approved tiers, badges, and FREE wording', () => {
  const spf80 = SPF_PACKAGE_PRICING.spf80;
  const spf89 = SPF_PACKAGE_PRICING.spf89;
  const spf99 = SPF_PACKAGE_PRICING.spf99;
  const spf101 = SPF_PACKAGE_PRICING.spf101;

  assert.deepEqual(
    [spf80.tier, spf89.tier, spf99.tier, spf101.tier],
    ['Essential', 'Advanced', 'Premium', 'Flagship']
  );
  assert.deepEqual(
    [spf80.catalogCard.badge, spf89.catalogCard.badge, spf99.catalogCard.badge, spf101.catalogCard.badge],
    ['SPECIAL OFFER', 'RECOMMENDED', 'PREMIUM', 'ALL-IN PACKAGE']
  );
  assert.equal(spf89.catalogCard.flagship, false);
  assert.equal(spf80.catalogCard.fullInclusions[2].title, 'FREE 1 visit Signature AutoSPF Carwash');
  assert.equal(spf89.catalogCard.fullInclusions[2].title, 'FREE 1 visit Reboost / Maintenance');
  assert.equal(spf89.catalogCard.fullInclusions[2].savingsLabel, 'Save ₱1,500');
  assert.equal(spf99.catalogCard.fullInclusions[1].title, 'FREE Full Recoat After 5 Years');
  assert.equal(spf99.catalogCard.fullInclusions[2].title, 'FREE 2 visits Reboost / Maintenance');
  assert.equal(spf99.catalogCard.fullInclusions[2].savingsLabel, 'Save ₱3,000');
  assert.equal(spf101.catalogCard.fullInclusions.length, 6);
  assert.match(spf101.catalogCard.fullInclusions[0].detail, /not a full-vehicle wrap/i);
  assert.deepEqual(spf101.catalogCard.ppfCoverage, [
    'Hood', 'Front Bumper', 'Stepsills', 'Door Bowls', 'Side Mirrors', 'Headlight & Taillight',
  ]);
  assert.equal(spf101.catalogCard.tintIncluded, true);
  assert.equal(spf101.catalogCard.undercoatingIncluded, true);
});

test('published normalization keeps unverified duration separate from protection', () => {
  const normalized = normalizeServicePricing({
    name: 'SPF 99 — Premium',
    duration: '4-6 hours',
    catalogCard: { warrantyLabel: 'stale value' },
    pricing: { highend: { base: 22999, original: 40000, addon: 28999 } },
  });

  assert.equal(normalized.duration, '4-6 hours');
  assert.equal(normalized.durationNeedsClientVerification, true);
  assert.equal(normalized.catalogCard.warrantyLabel, '10 Years Protection');
  assert.equal(normalized.catalogCard.badge, 'PREMIUM');
  assert.deepEqual(normalized.pricing.highend, { base: 22999, original: 40000, addon: 28999 });
});

test('SPF101 has no tint-bundle price and does not revive stale stored metadata', () => {
  const normalized = normalizeServicePricing({
    name: 'SPF 101 — Flagship ALL-IN',
    duration: '6-8 hours',
    catalogCard: { badge: 'STALE', ppfCoverage: ['Full vehicle'] },
    pricing: { sedan: { base: 39999, original: 80000, addon: null } },
  });

  assert.equal(normalized.catalogCard.badge, 'ALL-IN PACKAGE');
  assert.deepEqual(normalized.catalogCard.ppfCoverage, SPF_PACKAGE_PRICING.spf101.catalogCard.ppfCoverage);
  assert.equal(normalized.pricing.sedan.addon, null);
});
