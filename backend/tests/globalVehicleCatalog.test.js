import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
const { default: VehicleManufacturer } = await import('../models/vehicleManufacturer.model.js');
const { default: VehicleCatalogModel } = await import('../models/vehicleCatalogModel.model.js');
const { default: VehicleVariant } = await import('../models/vehicleVariant.model.js');
const { default: VehicleClassification } = await import('../models/vehicleClassification.model.js');
const {
  findGlobalVehicleClassification, listVehicleManufacturers, listVehicleModels, listVehicleVariants,
  normalizeCatalogRecord, upsertVehicleCatalogBatch, vehicleCatalogCoverage,
} = await import('../services/globalVehicleCatalog.service.js');
const { classifyVehicle } = await import('../services/vehicleIntelligence.service.js');

let mongo;
const source = (patch = {}) => ({
  provider: 'licensed-test-provider', providerManufacturerId: 'toyota', providerModelId: 'fortuner-2',
  brandName: 'Toyota', modelName: 'Fortuner', generation: 'AN150/AN160', productionStart: 2015,
  productionEnd: 2026, bodyType: '5-Door SUV', vehicleClass: 'Midsize SUV', segment: 'D-Segment SUV',
  fuelTypes: ['Diesel', 'Gasoline'], driveTypes: ['RWD', '4WD'], transmissions: ['Automatic', 'Manual'],
  regions: ['Asia', 'Oceania'], aliases: ['Fortuner II'], classificationConfidence: 'verified',
  license: 'Synthetic licensed-provider contract fixture', variants: [{ variantName: '2.8 4x4 AT', engine: '2.8L',
    year: 2025, fuelType: 'Diesel', driveType: '4WD', transmission: 'Automatic' }], ...patch,
});

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14', downloadDir: fileURLToPath(new URL('../.mongodb-binaries', import.meta.url)) } });
  await mongoose.connect(mongo.getUri('global-vehicle-catalog-test'));
  await Promise.all([VehicleManufacturer.init(), VehicleCatalogModel.init(), VehicleVariant.init(), VehicleClassification.init()]);
});
beforeEach(async () => { await mongoose.connection.db.dropDatabase(); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('bulk import creates normalized manufacturers, models, variants and taxonomy records', async () => {
  const imported = await upsertVehicleCatalogBatch([source()]);
  assert.deepEqual(imported, { received: 1, manufacturers: 1, models: 1, variants: 1 });
  const coverage = await vehicleCatalogCoverage();
  assert.deepEqual(coverage, { manufacturers: 1, models: 1, variants: 1, classifiedModels: 1,
    partialModels: 0, unclassifiedModels: 0, classifications: 18 });
  assert.equal((await VehicleManufacturer.findOne()).brandName, 'Toyota');
  assert.equal(VehicleCatalogModel.collection.name, 'vehicle_models');
  assert.equal((await VehicleVariant.findOne()).hybrid, false);
});

test('year, case, punctuation and aliases resolve a detailed physical classification', async () => {
  await upsertVehicleCatalogBatch([source()]);
  const result = await findGlobalVehicleClassification({ brand: ' toyota ', model: 'FORTUNER-II', year: '2025', generation: 'AN150/AN160' });
  assert.equal(result.catalogStatus, 'classified');
  assert.equal(result.bodyType, '5-Door SUV');
  assert.equal(result.vehicleClass, 'Midsize SUV');
  assert.equal(result.segment, 'D-Segment SUV');
  assert.equal(await findGlobalVehicleClassification({ brand: 'Toyota', model: 'Fortuner', year: 2010 }), null);
});

test('conflicting body styles remain ambiguous until generation or variant disambiguates them', async () => {
  await upsertVehicleCatalogBatch([
    source({ brandName: 'Honda', providerManufacturerId: 'honda', modelName: 'Civic', providerModelId: 'civic-sedan',
      generation: '', classificationKey: 'sedan', bodyType: '4-Door Sedan', vehicleClass: 'Sedan', segment: 'Compact Car', variants: [] }),
    source({ brandName: 'Honda', providerManufacturerId: 'honda', modelName: 'Civic', providerModelId: 'civic-hatch',
      generation: '', classificationKey: 'hatchback', bodyType: '5-Door Hatchback', vehicleClass: 'Hatchback / Small Car', segment: 'Compact Car', variants: [] }),
  ]);
  const result = await findGlobalVehicleClassification({ brand: 'Honda', model: 'Civic', year: 2024 });
  assert.equal(result.catalogStatus, 'ambiguous');
  assert.equal(result.vehicleClass, '');
});

test('catalog search endpoints are alphabetical, bounded by year and expose logo-ready metadata', async () => {
  await upsertVehicleCatalogBatch([source({ logo: 'https://cdn.example.test/toyota.svg' })]);
  const manufacturers = await listVehicleManufacturers({ search: 'toy', limit: 10 });
  assert.equal(manufacturers.data[0].brandName, 'Toyota');
  assert.equal(manufacturers.data[0].logo, 'https://cdn.example.test/toyota.svg');
  const models = await listVehicleModels({ brand: 'TOYOTA', year: 2025 });
  assert.equal(models.data[0].modelName, 'Fortuner');
  const variants = await listVehicleVariants({ modelId: models.data[0].id, year: 2025 });
  assert.equal(variants.data[0].variantName, '2.8 4x4 AT');
});

test('the worldwide catalog enriches body data while AutoSPF pricing remains separately authoritative', async () => {
  await upsertVehicleCatalogBatch([source()]);
  const result = await classifyVehicle({ brand: 'Toyota', model: 'Fortuner', year: 2025 });
  assert.equal(result.pricingCategory, 'SUV');
  assert.equal(result.vehicleClass, 'Midsize SUV');
  assert.equal(result.recommendedServiceCategory, 'SUV');
  await upsertVehicleCatalogBatch([source({ brandName: 'Test Global', providerManufacturerId: 'test-global',
    modelName: 'Unpriced One', providerModelId: 'unpriced-one', variants: [] })]);
  const unpriced = await classifyVehicle({ brand: 'Test Global', model: 'Unpriced One', year: 2025 });
  assert.equal(unpriced.vehicleClass, 'Midsize SUV');
  assert.equal(unpriced.pricingCategory, null);
  assert.equal(unpriced.status, 'review_required');
});

test('invalid ranges and oversized API batches fail before writing', async () => {
  assert.throws(() => normalizeCatalogRecord(source({ productionStart: 2026, productionEnd: 2020 })), /cannot be after/);
  assert.throws(() => normalizeCatalogRecord(source({ vehicleClass: 'Looks Expensive' })), /must use an AutoSPF/);
  await assert.rejects(upsertVehicleCatalogBatch([source(), source()], { maxBatchSize: 1 }), { code: 'VEHICLE_CATALOG_BATCH_TOO_LARGE' });
  assert.equal(await VehicleCatalogModel.countDocuments(), 0);
});
