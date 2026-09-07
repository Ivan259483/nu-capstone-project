import assert from 'node:assert/strict';
import test from 'node:test';
import {
  patchVehicleForm,
  requestVehicleClassification,
} from '../src/lib/vehicleFormState.ts';

const startingVehicle = () => ({
  plate: 'ABC1234',
  year: '2024',
  brand: 'Honda',
  model: 'Civic',
  color: 'Black',
  type: 'Sedan',
  pricingCategory: 'SEDAN',
  classificationStatus: 'classified',
  transmission: 'Automatic',
  fuelType: 'Gasoline',
});

test('Brand then Model clears stale pricing and applies the API classification', async () => {
  let form = patchVehicleForm(startingVehicle(), { brand: 'Toyota' });
  assert.equal(form.model, '');
  assert.equal(form.pricingCategory, null);
  assert.equal(form.classificationStatus, undefined);

  form = patchVehicleForm(form, { model: 'Fortuner' });
  assert.equal(form.classificationStatus, 'loading');

  const request = requestVehicleClassification(
    form,
    (update) => { form = update(form); },
    async () => ({
      status: 'classified',
      vehicleType: 'SUV',
      pricingCategory: 'SUV',
    }),
  );
  await request.done;

  assert.equal(form.type, 'SUV');
  assert.equal(form.pricingCategory, 'SUV');
  assert.equal(form.classificationStatus, 'classified');
});

test('unknown vehicles remain saveable without inventing a pricing category', async () => {
  let form = patchVehicleForm(startingVehicle(), { model: 'Prototype' });
  await requestVehicleClassification(
    form,
    (update) => { form = update(form); },
    async () => ({ status: 'review_required', pricingCategory: null }),
  ).done;

  assert.equal(form.type, 'Other');
  assert.equal(form.pricingCategory, null);
  assert.equal(form.classificationStatus, 'review_required');
});

test('a stale classification response cannot overwrite the current model', async () => {
  let resolveOld;
  const oldResult = new Promise((resolve) => { resolveOld = resolve; });
  let form = startingVehicle();
  const oldRequest = requestVehicleClassification(
    form,
    (update) => { form = update(form); },
    () => oldResult,
  );

  form = patchVehicleForm(form, { model: 'Fortuner' });
  await requestVehicleClassification(
    form,
    (update) => { form = update(form); },
    async () => ({ status: 'classified', vehicleType: 'SUV', pricingCategory: 'SUV' }),
  ).done;

  resolveOld({ status: 'classified', vehicleType: 'Sedan', pricingCategory: 'SEDAN' });
  await oldRequest.done;
  assert.equal(form.model, 'Fortuner');
  assert.equal(form.pricingCategory, 'SUV');
});
