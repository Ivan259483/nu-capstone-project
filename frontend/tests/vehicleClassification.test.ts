import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  brandModels,
  getDetectedVehicleType,
  getModelsForBrand,
  getVehicleTypeForModel,
  vehicleBrands,
  FALLBACK_VEHICLE_TYPES,
} from '../src/data/vehicleData.ts';
import { brandModels as mobileBrandModels } from '../../mobile/src/data/vehicleData.ts';

test('customer brand and model dropdowns retain the original curated passenger catalog', () => {
  assert.deepEqual(getModelsForBrand('Acura'), ['ILX', 'Integra', 'TLX', 'RLX', 'NSX', 'RDX', 'MDX', 'ZDX', 'Other']);
  for (const brand of ['Acura', 'Alfa Romeo', 'Aston Martin', 'Audi', 'BAIC', 'BMW', 'BYD', 'Bentley', 'Honda', 'Toyota']) {
    assert.ok(vehicleBrands.includes(brand), brand);
    assert.ok(getModelsForBrand(brand).length > 1, `${brand} models`);
  }
  assert.ok(getModelsForBrand('BMW').includes('7 Series'));
  assert.ok(getModelsForBrand('Toyota').includes('Fortuner'));
  assert.ok(getModelsForBrand('Honda').includes('Civic'));
  assert.equal(vehicleBrands.some((brand) => /^#|customs|kustoms|ironworks|enterprises/i.test(brand)), false);
  assert.deepEqual(mobileBrandModels, brandModels);
});

test('vehicle intelligence hooks classify selections without sourcing customer dropdowns from raw APIs', () => {
  const hooks = [
    readFileSync(new URL('../src/hooks/useVehicleIntelligence.ts', import.meta.url), 'utf8'),
    readFileSync(new URL('../../mobile/src/hooks/useVehicleIntelligence.ts', import.meta.url), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(hooks, /vehicle-intelligence\/(?:manufacturers|models)/);
  assert.match(hooks, /vehicle-intelligence\/classify/);
});

test('catalog classification retains the requested SUV and hatchback examples', () => {
  assert.equal(getVehicleTypeForModel('Bentayga'), 'SUV');
  assert.equal(getVehicleTypeForModel('Giulietta'), 'Hatchback');
  assert.equal(getDetectedVehicleType('Bentley', 'Bentayga'), 'SUV');
  assert.equal(getDetectedVehicleType('Alfa Romeo', 'Giulietta'), 'Hatchback');
});

test('automatic detection requires a matching brand and model', () => {
  assert.equal(getDetectedVehicleType('Toyota', 'Fortuner'), 'SUV');
  assert.equal(getDetectedVehicleType(' toyota ', ' FORTUNER '), 'SUV');
  assert.equal(getDetectedVehicleType('Unlisted Brand', 'Fortuner'), '');
  assert.equal(getDetectedVehicleType('Toyota', 'Unknown SUV'), '');
  assert.equal(getDetectedVehicleType('Toyota', 'Other'), '');
  assert.equal(getDetectedVehicleType('', 'Fortuner'), '');
  assert.equal(getDetectedVehicleType('Toyota', ''), '');
});

test('fallback types use the requested customer-facing labels', () => {
  assert.deepEqual(FALLBACK_VEHICLE_TYPES, ['Hatchback', 'Sedan', 'Midsize', 'SUV', 'Pickup', 'Large SUV / Van', 'High-end Sedan']);
});

test('Web and Mobile Add/Edit surfaces distinguish verified and manual classification without review dead-end copy', () => {
  const webForm = readFileSync(new URL('../src/components/shared/VehicleGarageForm.tsx', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../src/pages/CustomerDashboard.tsx', import.meta.url), 'utf8');
  const mobileModal = readFileSync(new URL('../../mobile/src/components/booking/AddVehicleModal.tsx', import.meta.url), 'utf8');

  for (const source of [webForm, mobileModal]) {
    assert.match(source, /Verified classification/);
    assert.match(source, /Classification selected manually/);
    assert.doesNotMatch(source, /Classification requires review/);
  }
  assert.match(dashboard, /experience="customer-add"/);
  assert.match(dashboard, /experience="customer-edit"/);
  assert.match(mobileModal, /vehicleService\.addVehicle/);
  assert.match(mobileModal, /vehicleService\.updateVehicle/);
});
