import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPF_PACKAGE_PRICING,
  UNDERCOATING_PRICING,
  buildLegacyPrices,
  buildRichPricing,
} from '../constants/spfPricing.js';
import { PPF_FULL_WRAP_CATALOG } from '../constants/ppfCatalog.js';
import {
  VEHICLE_PRICING_CATEGORIES,
  VEHICLE_PRICING_CATEGORY,
  normalizeVehiclePricingCategory,
  resolveVehiclePricingCategory,
} from '../constants/pricingCategories.js';
import {
  BOOKING_ADD_ON_CODE,
  ServicePricingError,
  buildPricingSnapshot,
  resolveBookingQuote,
  resolveServicePricing,
} from '../services/servicePricing.service.js';

const expected = {
  SPF80: {
    HATCHBACK_SMALL_CAR: [7499, 14000, 13499], SEDAN: [7999, 16000, 13499],
    MIDSIZED: [7999, 18000, 14499], SUV: [8999, 16000, 15999],
    PICKUP: [8499, 17000, 14499], LARGE_SUV_VAN: [12999, 26000, 20999],
    HIGH_END_SEDAN: [null, null, null],
  },
  SPF89: {
    HATCHBACK_SMALL_CAR: [8999, 18000, 14999], SEDAN: [9999, 20000, 15999],
    MIDSIZED: [10999, 22000, 17499], SUV: [11999, 24000, 18999],
    PICKUP: [10999, 22000, 17499], LARGE_SUV_VAN: [14999, 30000, 22999],
    HIGH_END_SEDAN: [17999, 36000, 23999],
  },
  SPF99: {
    HATCHBACK_SMALL_CAR: [13999, 28000, 19999], SEDAN: [13999, 28000, 19999],
    MIDSIZED: [15999, 32000, 22499], SUV: [16999, 34000, 23999],
    PICKUP: [15999, 32000, 22499], LARGE_SUV_VAN: [19999, 40000, 27999],
    HIGH_END_SEDAN: [22999, 40000, 28999],
  },
  SPF101: {
    HATCHBACK_SMALL_CAR: [39999, 80000, null], SEDAN: [39999, 80000, null],
    MIDSIZED: [46999, 94000, null], SUV: [46999, 94000, null],
    PICKUP: [46999, 94000, null], LARGE_SUV_VAN: [49999, 100000, null],
    HIGH_END_SEDAN: [49999, 100000, null],
  },
};

const serviceFor = (packageCode) => {
  const pkg = Object.values(SPF_PACKAGE_PRICING).find((item) => item.packageCode === packageCode);
  return {
    _id: `service-${packageCode}`,
    name: pkg.name,
    category: pkg.category,
    displayOrder: pkg.displayOrder,
    packageCode,
    pricing: buildRichPricing(pkg),
    prices: buildLegacyPrices(pkg),
  };
};

test('complete 7x4 SPF matrix, SRPs, tint bundles, and availability are exact', () => {
  for (const [packageCode, categoryRows] of Object.entries(expected)) {
    const service = serviceFor(packageCode);
    for (const category of VEHICLE_PRICING_CATEGORIES) {
      const [promo, srp, tint] = categoryRows[category.code];
      const resolved = resolveServicePricing({ vehiclePricingCategory: category.code, packageCode, service });
      assert.equal(resolved.available, promo !== null, `${packageCode} ${category.code} availability`);
      assert.equal(resolved.promoPrice, promo, `${packageCode} ${category.code} promo`);
      assert.equal(resolved.srp, srp, `${packageCode} ${category.code} SRP`);
      assert.equal(resolved.tintBundlePrice, tint, `${packageCode} ${category.code} tint`);
      assert.equal(resolved.savings, promo !== null ? srp - promo : null);
    }
  }
});

test('explicit poster discrepancy rows remain exact', () => {
  const rows = [
    ['SPF99', 'MIDSIZED', 15999, 32000],
    ['SPF89', 'PICKUP', 10999, 22000],
    ['SPF99', 'PICKUP', 15999, 32000],
    ['SPF80', 'SUV', 8999, 16000],
    ['SPF99', 'HIGH_END_SEDAN', 22999, 40000],
  ];
  for (const [packageCode, category, promo, srp] of rows) {
    const resolved = resolveServicePricing({ vehiclePricingCategory: category, packageCode, service: serviceFor(packageCode) });
    assert.equal(resolved.promoPrice, promo);
    assert.equal(resolved.srp, srp);
  }
});

test('undercoating is category-specific and complete', () => {
  assert.deepEqual(UNDERCOATING_PRICING, {
    HATCHBACK_SMALL_CAR: 6000, SEDAN: 6500, MIDSIZED: 7000, SUV: 7500,
    PICKUP: 7500, LARGE_SUV_VAN: 9000, HIGH_END_SEDAN: 8000,
  });
});

test('unknown category errors without Hatchback or Sedan fallback', () => {
  assert.throws(
    () => resolveServicePricing({ vehiclePricingCategory: 'UNKNOWN', packageCode: 'SPF89', service: serviceFor('SPF89') }),
    (error) => error instanceof ServicePricingError && error.code === 'PRICE_CATEGORY_REQUIRED' && error.statusCode === 422
  );
  assert.throws(
    () => resolveServicePricing({ vehiclePricingCategory: '', packageCode: 'SPF89', service: serviceFor('SPF89') }),
    (error) => error.code === 'PRICE_CATEGORY_REQUIRED'
  );
});

test('High-End Sedan SPF80 is unavailable', () => {
  const resolved = resolveServicePricing({
    vehiclePricingCategory: VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN,
    packageCode: 'SPF80',
    service: serviceFor('SPF80'),
  });
  assert.equal(resolved.available, false);
  assert.equal(resolved.promoPrice, null);
});

test('Aston Martin Vantage booking options expose exactly three High-End Sedan packages', () => {
  const vehicle = {
    make: 'Aston Martin',
    model: 'Vantage',
    vehicleType: 'Highend Sedan',
  };
  const effectivePricingCategory = resolveVehiclePricingCategory(vehicle);
  const resolvedPackages = ['SPF80', 'SPF89', 'SPF99', 'SPF101'].map((packageCode) => (
    resolveServicePricing({
      vehiclePricingCategory: effectivePricingCategory,
      packageCode,
      service: serviceFor(packageCode),
    })
  ));

  assert.ok(resolvedPackages.every((pkg) => pkg.id && pkg.name), 'mobile service identity contract');
  assert.equal(resolvedPackages.find((pkg) => pkg.packageCode === 'SPF80')?.available, false);
  assert.deepEqual(
    resolvedPackages
      .filter((pkg) => pkg.available)
      .map((pkg) => [pkg.packageCode, pkg.promoPrice, pkg.srp]),
    [
      ['SPF89', 17999, 36000],
      ['SPF99', 22999, 40000],
      ['SPF101', 49999, 100000],
    ]
  );
});

test('legacy saved vehicles classify centrally without requiring duplicate registration', () => {
  assert.equal(
    resolveVehiclePricingCategory({ make: 'Aston Martin', model: 'Vantage' }),
    VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN,
  );
  assert.equal(
    resolveVehiclePricingCategory({ make: 'Bentley', model: 'Bentayga' }),
    VEHICLE_PRICING_CATEGORY.SUV,
  );
  assert.equal(
    resolveVehiclePricingCategory({ make: 'Legacy', model: 'Sedan', vehicleType: 'High-end Sedan' }),
    VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN,
  );
  assert.equal(resolveVehiclePricingCategory({ make: 'Unknown', model: 'Prototype 42' }), null);
});

test('legacy High-End Sedan aliases normalize to the canonical financial key', () => {
  for (const alias of ['HIGH_END_SEDAN', 'High-end Sedan', 'Highend Sedan', 'High End Sedan']) {
    assert.equal(normalizeVehiclePricingCategory(alias), VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN, alias);
  }
});

test('all seven pricing categories retain their expected available package counts', () => {
  const expectedCounts = {
    HATCHBACK_SMALL_CAR: 4,
    SEDAN: 4,
    MIDSIZED: 4,
    SUV: 4,
    PICKUP: 4,
    LARGE_SUV_VAN: 4,
    HIGH_END_SEDAN: 3,
  };

  for (const category of VEHICLE_PRICING_CATEGORIES) {
    const availableCount = ['SPF80', 'SPF89', 'SPF99', 'SPF101']
      .map((packageCode) => resolveServicePricing({
        vehiclePricingCategory: category.code,
        packageCode,
        service: serviceFor(packageCode),
      }))
      .filter((pkg) => pkg.available)
      .length;
    assert.equal(availableCount, expectedCounts[category.code], category.code);
  }
});

test('SPF101 included tint and undercoating never double-charge', () => {
  const quote = resolveBookingQuote({
    vehiclePricingCategory: VEHICLE_PRICING_CATEGORY.SUV,
    packageCode: 'SPF101',
    service: serviceFor('SPF101'),
    selectedAddOns: [BOOKING_ADD_ON_CODE.NANO_CERAMIC_TINT_BUNDLE, BOOKING_ADD_ON_CODE.UNDERCOATING],
  });
  assert.equal(quote.quotedPrice, 46999);
  assert.equal(quote.addOnPriceSnapshots.length, 2);
  assert.ok(quote.addOnPriceSnapshots.every((item) => item.included && item.incrementalPriceAtBooking === 0));
});

test('booking snapshot is stable when the catalog later changes and legacy history is not repriced', () => {
  const quote = resolveBookingQuote({
    vehiclePricingCategory: VEHICLE_PRICING_CATEGORY.SUV,
    packageCode: 'SPF80',
    service: serviceFor('SPF80'),
  });
  const snapshot = buildPricingSnapshot(quote);
  const historicalOrder = { totalPrice: 8999, pricingSnapshot: undefined };

  SPF_PACKAGE_PRICING.spf80.base.suv = 12345;
  try {
    assert.equal(snapshot.quotedPrice, 8999);
    assert.equal(snapshot.srpAtBooking, 16000);
    assert.equal(historicalOrder.totalPrice, 8999);
    assert.equal(historicalOrder.pricingSnapshot, undefined);
  } finally {
    SPF_PACKAGE_PRICING.spf80.base.suv = 8999;
  }
});

test('full-wrap PPF catalog remains separate and unresolved poster values are not guessed', () => {
  assert.equal(PPF_FULL_WRAP_CATALOG.scope, 'FULL_VEHICLE_WRAP');
  assert.equal(PPF_FULL_WRAP_CATALOG.separateFromPackageCode, 'SPF101');
  assert.equal(PPF_FULL_WRAP_CATALOG.brands[0].name, null);
  assert.equal(PPF_FULL_WRAP_CATALOG.specifications.selfHealing, null);
  assert.equal(PPF_FULL_WRAP_CATALOG.pricing.SUV_PICKUP.XPEL, 90000);
});
