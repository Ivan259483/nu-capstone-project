import test from 'node:test';
import assert from 'node:assert/strict';

import { SPF_PACKAGE_PRICING } from '../constants/spfPricing.js';
import { normalizeServicePricing } from '../controllers/service.controller.js';

test('official SPF package metadata contains the complete customer inclusions', () => {
  const spf89 = SPF_PACKAGE_PRICING.spf89.catalogCard;
  const spf99 = SPF_PACKAGE_PRICING.spf99.catalogCard;
  const spf101 = SPF_PACKAGE_PRICING.spf101.catalogCard;

  assert.deepEqual(
    spf89.fullInclusions.map((item) => item.title),
    [
      '4 Layers of Graphene Ceramic Coating',
      'Graphene Sealant',
      '1 Reboost / Maintenance Visit',
    ]
  );
  assert.match(spf99.fullInclusions[0].title, /SONAX Profiline CC EVO/);
  assert.equal(spf99.fullInclusions[1].title, 'Full Recoat After 5 Years');
  assert.equal(spf99.fullInclusions[2].title, '2 Reboost / Maintenance Visits');
  assert.equal(spf101.fullInclusions.find((item) => item.group === 'Maintenance')?.title, '5 Reboost / Maintenance Visits');
  assert.deepEqual(spf101.ppfCoverage, [
    'Hood',
    'Front Bumper',
    'Stepsills',
    'Door Bowls',
    'Side Mirrors',
    'Headlights',
    'Taillights',
  ]);
  assert.equal(spf101.tintIncluded, true);
  assert.equal(spf101.undercoatingIncluded, true);
});

test('published SPF normalization keeps protection and service duration separate', () => {
  const normalized = normalizeServicePricing({
    name: 'SPF 99 — Premium',
    duration: '4-6 hours',
    catalogCard: { warrantyLabel: '10 Years Protection' },
    pricing: {
      highend: { base: 22999, original: 40000, addon: 28999 },
    },
  });

  assert.equal(normalized.duration, '4-6 hours');
  assert.equal(normalized.catalogCard.warrantyLabel, '10 Years Protection');
  assert.equal(normalized.catalogCard.fullInclusions.length, 3);
  assert.deepEqual(normalized.pricing.highend, {
    base: 22999,
    original: 40000,
    addon: 28999,
  });
});

test('canonical details fill missing records without inventing an SPF 101 add-on price', () => {
  const normalized = normalizeServicePricing({
    name: 'SPF 101 — Flagship ALL-IN',
    duration: '6-8 hours',
    pricing: {
      sedan: { base: 39999, original: 80000, addon: null },
    },
  });

  assert.equal(normalized.catalogCard.fullInclusions.length, 6);
  assert.equal(normalized.catalogCard.ppfCoverage.length, 7);
  assert.equal(normalized.pricing.sedan.addon, null);
});
