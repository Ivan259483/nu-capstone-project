import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getVehicleTypeForModel } from '../src/data/vehicleData.ts';
import {
  CUSTOMER_BOOKING_FUNNEL_STORAGE_KEY,
  getCatalogBookingVehicleAction,
  getLoadedCustomerGarageState,
  isCustomerGarageLoaded,
  readCustomerBookingFunnelDraft,
  resetCustomerBookingPackageIntent,
  resolveFunnelVehicleId,
  shouldPromptForVehicleRegistration,
  shouldShowGarageOnboarding,
  updateCustomerBookingFunnelDraft,
} from '../src/lib/customer-booking-funnel.ts';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

function readFrontendSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${relativePath}`, import.meta.url)), 'utf8');
}

test('zero, one, and multiple vehicle states resolve without inventing a default', () => {
  assert.equal(resolveFunnelVehicleId([], null), '');
  assert.equal(resolveFunnelVehicleId([{ id: 'bentley' }], null), 'bentley');
  assert.equal(resolveFunnelVehicleId([{ id: 'bentley' }, { id: 'aston' }], null), '');
  assert.equal(resolveFunnelVehicleId([{ id: 'bentley' }, { id: 'aston' }], 'aston'), 'aston');
  assert.equal(resolveFunnelVehicleId([{ id: 'bentley' }], 'deleted-vehicle'), 'bentley');
});

test('Garage load states distinguish not loaded, confirmed empty, one, many, and error', () => {
  assert.equal(getLoadedCustomerGarageState(0), 'loaded_empty');
  assert.equal(getLoadedCustomerGarageState(1), 'loaded_one');
  assert.equal(getLoadedCustomerGarageState(2), 'loaded_many');

  for (const state of ['idle', 'loading', 'error'] as const) {
    assert.equal(isCustomerGarageLoaded(state), false, state);
    assert.equal(shouldPromptForVehicleRegistration(state), false, state);
  }
  assert.equal(isCustomerGarageLoaded('loaded_empty'), true);
  assert.equal(shouldPromptForVehicleRegistration('loaded_empty'), true);
  assert.equal(shouldPromptForVehicleRegistration('loaded_one'), false);
  assert.equal(shouldPromptForVehicleRegistration('loaded_many'), false);
  assert.equal(getCatalogBookingVehicleAction('idle'), 'wait_for_garage');
  assert.equal(getCatalogBookingVehicleAction('loading'), 'wait_for_garage');
  assert.equal(getCatalogBookingVehicleAction('loaded_empty'), 'add_vehicle');
  assert.equal(getCatalogBookingVehicleAction('loaded_one'), 'auto_select_vehicle');
  assert.equal(getCatalogBookingVehicleAction('loaded_many'), 'choose_vehicle');
  assert.equal(getCatalogBookingVehicleAction('error'), 'garage_error');
});

test('Garage onboarding shows only for a confirmed empty Garage with an unseen backend flag', () => {
  assert.equal(shouldShowGarageOnboarding('loaded_empty', false), true);
  assert.equal(shouldShowGarageOnboarding('loaded_empty', true), false);
  assert.equal(shouldShowGarageOnboarding('loaded_empty', null), false);
  assert.equal(shouldShowGarageOnboarding('loaded_one', false), false);
  assert.equal(shouldShowGarageOnboarding('loaded_many', false), false);
  assert.equal(shouldShowGarageOnboarding('loading', false), false);
  assert.equal(shouldShowGarageOnboarding('error', false), false);
});

test('known vehicle models classify while unknown models fail closed', () => {
  assert.equal(getVehicleTypeForModel('Bentayga'), 'SUV');
  assert.equal(getVehicleTypeForModel('Vantage'), 'High-end Sedan');
  assert.equal(getVehicleTypeForModel('Unlisted Prototype 42'), '');
});

test('selected vehicle and package survive the funnel handoff and clear together safely', () => {
  const storage = memoryStorage();
  updateCustomerBookingFunnelDraft(storage, {
    selectedVehicleId: 'aston',
    selectedPackageId: 'spf89',
    wizardStarted: true,
  });
  assert.deepEqual(readCustomerBookingFunnelDraft(storage), {
    selectedVehicleId: 'aston',
    selectedPackageId: 'spf89',
    wizardStarted: true,
  });
  assert.ok(storage.getItem(CUSTOMER_BOOKING_FUNNEL_STORAGE_KEY));

  updateCustomerBookingFunnelDraft(storage, { selectedVehicleId: 'bentley' });
  assert.deepEqual(readCustomerBookingFunnelDraft(storage), {
    selectedVehicleId: 'bentley',
    selectedPackageId: 'spf89',
    wizardStarted: true,
  });

  resetCustomerBookingPackageIntent(storage, 'bentley');
  assert.deepEqual(readCustomerBookingFunnelDraft(storage), {
    selectedVehicleId: 'bentley',
    selectedPackageId: null,
    wizardStarted: false,
  });
});

test('customer Services stays browseable and vehicle validation begins only from booking', () => {
  const dashboard = readFrontendSource('pages/CustomerDashboard.tsx');
  const services = readFrontendSource('components/customer/CustomerDashboardServicesShowcase.tsx');
  const vehicleService = readFrontendSource('lib/vehicle-service.ts');

  assert.match(vehicleService, /api\.get\('\/customers\/vehicles'/);
  assert.match(dashboard, /api\.get\('\/customers\/me'\)/);
  assert.match(dashboard, /api\.patch\('\/customers\/me\/garage-onboarding'\)/);
  assert.doesNotMatch(dashboard, /setShowOnboarding\(true\)/);
  assert.match(dashboard, /VehicleService\.getVehicles\(\)/);
  assert.match(dashboard, /resolveCatalogBookingPackage/);
  assert.match(dashboard, /api\.get\('\/services\/booking-options'/);
  assert.match(dashboard, /params:\s*\{ vehicleId \}/);
  assert.match(dashboard, /useState<CustomerGarageLoadState>\('idle'\)/);
  assert.doesNotMatch(dashboard, /if \(!resolvedId && vehicles\.length === 0\) setAddVehicleOpen\(true\)/);
  assert.match(dashboard, /getVehiclePriceKeyForPricingCategory\(targetVehicle\.pricingCategory\)/);
  assert.doesNotMatch(dashboard, /Showing Hatchback pricing/);
  assert.doesNotMatch(dashboard, /vehicles\[0\]\?\.type \|\| 'hatchback'/);
  assert.match(dashboard, /servicesPackages\.flatMap/);

  assert.match(services, /CUSTOMER_BOOKING_PRICE_TIERS/);
  assert.match(services, /customer-price-tier/);
  assert.match(services, /Vehicle class/i);
  assert.match(services, /Book This Package/);
  assert.match(services, /Indicative pricing by vehicle class/);
  assert.doesNotMatch(services, /Add a vehicle to see accurate pricing|Choose your vehicle|Vehicle pricing is required before packages can be shown/);
  assert.match(dashboard, /packages=\{bookingPackages\}/);
  assert.match(dashboard, /const servicesSectionLoading = false/);
  assert.match(dashboard, /Catalog price viewed:/);
  assert.match(dashboard, /Pricing has been updated for your vehicle\./);
  assert.match(dashboard, /This package isn’t available for your/);
});

test('Book Service and /customer/book open the existing modal instead of the Services catalog', () => {
  const dashboard = readFrontendSource('pages/CustomerDashboard.tsx');

  assert.match(dashboard, /if \(pathname === '\/customer\/book'\) return 'dashboard'/);
  assert.match(dashboard, /function startBookingFunnel[\s\S]*setBookingOpen\(true\)/);
  assert.doesNotMatch(dashboard, /function startBookingFunnel[\s\S]{0,900}navigate\('\/customer\/book'\)/);
  assert.match(dashboard, /if \(!draft\.wizardStarted \|\| !draft\.selectedPackageId\) \{[\s\S]*startBookingFunnel\(\)/);
  assert.match(dashboard, /garageLoadState === 'loaded_one' \? vehicles\[0\] : null/);
  assert.match(dashboard, /Select your vehicle/);
  assert.match(
    dashboard,
    /Pricing and available packages will adjust automatically based on your selected vehicle\./,
  );
  assert.doesNotMatch(dashboard, /Tap a vehicle below|Tap your vehicle/);
  assert.match(dashboard, /Book Service/);
  assert.match(dashboard, /Book Service Modal/);
});

test('new customer vehicle creation sends a canonical pricing category and resumes booking intent', () => {
  const dashboard = readFrontendSource('pages/CustomerDashboard.tsx');
  const vehicleForm = readFrontendSource('components/shared/VehicleGarageForm.tsx');
  const vehicleService = readFrontendSource('lib/vehicle-service.ts');

  assert.match(vehicleService, /form\.classificationStatus === 'classified' \? form\.pricingCategory : null/);
  // Classification authority is exercised against MongoDB in vehicleIntelligence.test.js.
  assert.match(vehicleForm, /automaticClassification \? 'Vehicle Classification' : 'Type'/);
  assert.doesNotMatch(vehicleForm, /fallback-vehicle-type|fallback-pricing-category/);
  assert.match(dashboard, /setServicesVehicleId\(savedVehicleId\)/);
  assert.match(dashboard, /updateCustomerBookingFunnelDraft\(window\.sessionStorage, \{\s*selectedVehicleId: savedVehicleId/);
});

test('package handoff preselects the same vehicle and package in the existing wizard', () => {
  const dashboard = readFrontendSource('pages/CustomerDashboard.tsx');
  const serviceCard = readFrontendSource('components/services/LuxuryServiceCard.tsx');

  assert.match(serviceCard, /selectedVehicleId:\s*null/);
  assert.match(serviceCard, /selectedPackageId:\s*pkg\.key/);
  assert.match(serviceCard, /wizardStarted:\s*true/);
  assert.match(dashboard, /selectedVehicleId:\s*getFunnelVehicleId\(targetVehicle\)/);
  assert.match(dashboard, /selectedPackageId:\s*presetPkg\.id/);
  assert.match(dashboard, /wizardStarted:\s*true/);
  assert.match(dashboard, /service:\s*presetPkg\.id/);
  assert.match(dashboard, /servicePrice:\s*presetPrice/);
});

test('customer navigation no longer exposes a My Bookings destination', () => {
  const customerSurfaces = [
    readFrontendSource('pages/CustomerDashboard.tsx'),
    readFrontendSource('pages/CustomerLiveTrackerPage.tsx'),
    readFrontendSource('components/customer/CustomerMobileNav.tsx'),
    readFrontendSource('components/customer/CustomerSidebar.tsx'),
    readFrontendSource('components/customer/DashboardHome.tsx'),
    readFrontendSource('components/Footer.tsx'),
  ];

  for (const source of customerSurfaces) {
    assert.doesNotMatch(source, /My Bookings|View Bookings|nav\('bookings'\)|onNavigate\('bookings'\)|section=bookings/);
  }

  assert.match(
    customerSurfaces[0],
    /s === 'bookings'[\s\S]{0,180}navigate\('\/customer\/dashboard', \{ replace: true \}\)/,
  );
});
