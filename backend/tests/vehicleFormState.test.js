import assert from 'node:assert/strict';
import test from 'node:test';
import { patchVehicleForm, requestVehicleClassification } from '../constants/vehicleFormState.js';
import { resolveVehicleClassification } from '../constants/vehicleDatabase.js';

const state = () => ({ brand: 'Toyota', model: 'Fortuner', type: 'SUV', pricingCategory: 'SUV', classificationStatus: 'classified', generation: 'old', facelift: 'old' });
const result = (category) => ({ status: category ? 'classified' : 'review_required', pricingCategory: category, vehicleType: category === 'SUV' ? 'SUV' : 'Sedan' });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('brand change clears model, variant selectors and classification in the same transition', () => {
  const next = patchVehicleForm(state(), { brand: 'Honda' });
  assert.equal(next.model, ''); assert.equal(next.type, ''); assert.equal(next.pricingCategory, null);
  assert.equal(next.generation, ''); assert.equal(next.facelift, ''); assert.equal(next.classificationStatus, undefined);
});

test('model change immediately clears the old tier and recalculates without save', async () => {
  let value = patchVehicleForm(state(), { model: 'Vios' });
  assert.equal(value.pricingCategory, null); assert.equal(value.classificationStatus, 'loading');
  const request = requestVehicleClassification(value, updater => { value = updater(value); }, async v => result(resolveVehicleClassification(v.brand, v.model)));
  await request.done;
  assert.equal(value.pricingCategory, 'SEDAN'); assert.equal(value.type, 'Sedan');
});

test('unknown selection and API failure clear pricing but leave registration possible', async () => {
  for (const fetch of [async () => result(null), async () => { throw new Error('offline'); }]) {
    let value = patchVehicleForm(state(), { model: 'Prototype' });
    await requestVehicleClassification(value, update => { value = update(value); }, fetch).done;
    assert.equal(value.pricingCategory, null); assert.equal(value.type, 'Other');
    assert.ok(['review_required', 'unavailable'].includes(value.classificationStatus));
  }
});

test('out-of-order requests cannot restore the previous model pricing', async () => {
  let value = state(); const old = deferred();
  const first = requestVehicleClassification(value, update => { value = update(value); }, () => old.promise);
  value = patchVehicleForm(value, { model: 'Vios' });
  await requestVehicleClassification(value, update => { value = update(value); }, async () => result('SEDAN')).done;
  old.resolve(result('SUV')); await first.done;
  assert.equal(value.model, 'Vios'); assert.equal(value.pricingCategory, 'SEDAN');
});

test('cancelled requests cannot overwrite a later return to the same identity', async () => {
  let value = state(); const old = deferred();
  const request = requestVehicleClassification(value, update => { value = update(value); }, () => old.promise);
  request.abort(); value = { ...state(), pricingCategory: 'SEDAN' };
  old.resolve(result('SUV')); await request.done;
  assert.equal(value.pricingCategory, 'SEDAN');
});

test('editing revalidates an existing wrong category and metadata-only edits preserve detection', async () => {
  let value = { ...state(), pricingCategory: 'SEDAN' };
  await requestVehicleClassification(value, update => { value = update(value); }, async () => result('SUV')).done;
  assert.equal(value.pricingCategory, 'SUV');
  assert.equal(patchVehicleForm(value, { color: 'Black' }).pricingCategory, 'SUV');
});

test('catalog entries cannot fall through to object properties or keyword guesses', () => {
  for (const [brand, model] of [['Toyota', 'constructor'], ['__proto__', 'constructor'], ['constructor', 'prototype'], ['Unknown', 'Fortuner'], ['Toyota', 'Fortuner Special']]) {
    assert.equal(resolveVehicleClassification(brand, model), null);
  }
});
