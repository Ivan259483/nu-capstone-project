import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
const { default: Definition } = await import('../models/vehicleDefinition.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');
const { default: VehicleColor } = await import('../models/vehicleColor.model.js');
const { default: Service } = await import('../models/service.model.js');
const { classifyVehicle, classifyDefinitions, publishDefinition, validateDefinition, requireVehiclePricing, vehicleCatalog, vehicleClassificationFields, submittedVehicleClassification, BOOTSTRAP_DEFINITIONS } = await import('../services/vehicleIntelligence.service.js');
const {
  detectVehicleColorFinish,
  normalizeStandardVehicleColor,
  resolveVehicleColor,
  upsertVehicleColorBatch,
} = await import('../services/vehicleColorIntelligence.service.js');
const { addVehicle, updateVehicle } = await import('../controllers/customer.controller.js');
const { getBookingOptions } = await import('../controllers/service.controller.js');
const { default: router } = await import('../routes/vehicleIntelligence.routes.js');
const { SPF_PACKAGE_PRICING, buildRichPricing, buildLegacyPrices } = await import('../constants/spfPricing.js');
let mongo;
const actor = new mongoose.Types.ObjectId();
const customer = new mongoose.Types.ObjectId();
const fixture = (patch = {}) => ({ brand: 'Test Motors', model: 'Future One', generation: 'G1', facelift: '', yearFrom: 2027, yearTo: 2030,
  bodyType: 'SUV', vehicleCategory: 'SUV', pricingCategory: 'SUV', fuelType: 'PHEV', drivetrain: 'AWD', sizeSegment: 'D',
  confidenceLevel: 'high', status: 'approved', sources: ['Synthetic test fixture; not real vehicle data'],
  reviewExpiresAt: '2099-01-01T00:00:00Z', reason: 'Test approval', ...patch });
const response = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(data) { this.body = JSON.parse(JSON.stringify(data)); return this; }, set() { return this; } });
const invoke = async (fn, req) => { const res = response(); await fn(req, res, (err) => { if (err) throw err; }); return res; };
const vehicleRequest = (body = {}) => ({ user: { id: String(customer), role: 'customer' }, body: {
  make: 'Bentley', model: 'Bentayga', color: 'Black', year: '2024', plateNumber: 'INT1234', fuelType: 'Gasoline', ...body,
} });

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: '7.0.14', downloadDir: fileURLToPath(new URL('../.mongodb-binaries', import.meta.url)) } });
  await mongoose.connect(mongo.getUri('vehicle-intelligence-test'));
});
beforeEach(async () => { await mongoose.connection.db.dropDatabase(); await Promise.all([Definition.createIndexes(), VehicleColor.createIndexes()]); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('owner-supplied examples resolve by exact brand + model, including pricing category', async () => {
  for (const [brand, model, category] of [['Bentley', 'Bentayga', 'SUV'], ['Alfa Romeo', 'Giulietta', 'HATCHBACK_SMALL_CAR'], ['BMW', '7 Series', 'HIGH_END_SEDAN']]) {
    const value = await classifyVehicle({ brand, model });
    assert.equal(value.status, 'classified'); assert.equal(value.pricingCategory, category);
    assert.equal(value.classification, value.vehicleType);
    assert.deepEqual(value.validPricingCategories, [category]);
    assert.deepEqual(value.validClassifications, [value.vehicleType]);
    assert.equal(value.verified, true); assert.equal(value.requiresSelection, false);
  }
  assert.equal((await classifyVehicle({ brand: 'BMW', model: 'Bentayga' })).pricingCategory, null);
  assert.equal((await classifyVehicle({ brand: 'Bentley', model: 'Bentayga Future' })).pricingCategory, null);
  assert.equal((await classifyVehicle({ brand: 'Bentley', model: 'Bentayga', year: 2035 })).pricingCategory, null);
});

test('new releases, PHEV metadata and generations are added at runtime without changing source', async () => {
  const saved = await publishDefinition(fixture(), actor);
  const next = await publishDefinition(fixture({ generation: 'G2', yearFrom: 2031, yearTo: 2035, fuelType: 'BEV', pricingCategory: 'LARGE_SUV_VAN', vehicleCategory: 'Large SUV / Van' }), actor);
  assert.notEqual(saved.definitionKey, next.definitionKey);
  const g1 = await classifyVehicle({ brand: 'Test Motors', model: 'Future One', year: 2028, fuelType: 'PHEV' });
  assert.equal(g1.pricingCategory, 'SUV'); assert.equal(g1.drivetrain, 'AWD'); assert.equal(g1.generation, 'G1');
  assert.equal((await classifyVehicle({ brand: 'Test Motors', model: 'Future One', year: 2032 })).pricingCategory, 'LARGE_SUV_VAN');
  assert.equal((await classifyVehicle({ brand: 'Test Motors', model: 'Future One' })).reason, 'AMBIGUOUS_VEHICLE');
  assert.equal((await classifyVehicle({ brand: 'Test Motors', model: 'Future One', generation: 'G2' })).pricingCategory, 'LARGE_SUV_VAN');
  assert.ok((await vehicleCatalog())['Test Motors'].includes('Future One'));
});

test('one pricing class can span body styles, while untrusted definitions and Other never quote', async () => {
  const identity = { brand: 'Bentley', model: 'Bentayga' };
  const base = BOOTSTRAP_DEFINITIONS[0];
  for (const patch of [{ status: 'draft' }, { status: 'retired' }, { confidenceLevel: 'medium' }, { reviewExpiresAt: '2000-01-01' }, { pricingCategory: 'OTHER' }]) {
    assert.equal(classifyDefinitions(identity, [{ ...base, ...patch }]).pricingCategory, null);
  }
  const samePricingClass = classifyDefinitions(identity, [base, { ...base, bodyType: 'Coupe' }]);
  assert.equal(samePricingClass.status, 'classified');
  assert.equal(samePricingClass.bodyType, '');
  assert.deepEqual(samePricingClass.validClassifications, ['SUV']);
  assert.equal(classifyDefinitions({ ...identity, year: 'bad' }, [base]).reason, 'INVALID_YEAR');
  assert.equal(classifyDefinitions(identity, [base], new Date('2028-01-01')).pricingCategory, null);
});

test('revisions preserve history, reject stale concurrent edits and cannot change identity', async () => {
  const original = await publishDefinition(fixture(), actor);
  const edits = await Promise.allSettled([1, 2].map(() => publishDefinition(fixture({ reason: 'Correction' }), actor, original.definitionKey, 1)));
  assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(edits.find((r) => r.status === 'rejected').reason.code, 'VEHICLE_REVISION_CONFLICT');
  assert.equal(await Definition.countDocuments({ definitionKey: original.definitionKey }), 2);
  await assert.rejects(publishDefinition(fixture({ model: 'Different' }), actor, original.definitionKey, 2), /immutable/);
});

test('a retirement cannot reactivate a bootstrap classification', async () => {
  const row = await publishDefinition(fixture({ brand: 'Bentley', model: 'Bentayga', generation: '', yearFrom: null, yearTo: 2026, fuelType: '' }), actor);
  await publishDefinition(fixture({ brand: 'Bentley', model: 'Bentayga', generation: '', yearFrom: null, yearTo: 2026, fuelType: '', status: 'retired' }), actor, row.definitionKey, 1);
  assert.equal((await classifyVehicle({ brand: 'Bentley', model: 'Bentayga' })).pricingCategory, null);
});

test('publishing validates evidence, review expiry, confidence, categories and year bounds', () => {
  for (const patch of [{ sources: [] }, { confidenceLevel: 'low' }, { yearTo: null }, { yearFrom: 2031 }, { pricingCategory: 'invented' }, { reviewExpiresAt: '2000-01-01' }]) {
    assert.throws(() => validateDefinition(fixture(patch)), { code: 'VEHICLE_DEFINITION_INVALID' });
  }
  assert.equal(validateDefinition(fixture({ pricingCategory: 'Other' })).pricingCategory, 'OTHER');
});

test('vehicle colors map factory names into universal families and detect finishes', () => {
  for (const [name, expected] of [
    ['Ruby Red', 'Red'], ['Deep Blue Pearl', 'Blue'], ['Obsidian Black', 'Black'],
    ['Glacier White', 'White'], ['Graphite Gray', 'Gray'], ['Champagne Gold', 'Gold'],
    ['British Racing Green', 'Green'], ['Copper Bronze', 'Bronze'], ['Bi-tone roof', 'Two-Tone'],
    ['Owner custom wrap', 'Custom'],
  ]) assert.equal(normalizeStandardVehicleColor(name), expected, name);
  assert.equal(detectVehicleColorFinish('Frozen Black Metallic'), 'Matte Metallic');
  assert.equal(detectVehicleColorFinish('Soul Red Crystal'), 'Pearlescent');
  assert.equal(detectVehicleColorFinish('Carbon Fiber'), 'Carbon Fiber');
});

test('exact OEM color wins, while selected and missing colors fall back without Unknown', async () => {
  await upsertVehicleColorBatch([{
    vehicle_brand: 'Toyota', vehicle_model: 'Corolla', year: 2025,
    factory_color_name: 'Celestite Gray Metallic', standard_color: 'Gray', paint_code: '1K3',
    finish_type: 'Metallic', hex_color: '#6F7478', rgb_value: '111,116,120', availability: 'available',
    provider: 'test-oem-catalog', source_id: 'corolla-2025-1k3',
  }]);
  const exact = await resolveVehicleColor({ brand: 'Toyota', model: 'Corolla', year: 2025, color: 'Celestite Gray Metallic' });
  assert.equal(exact.displayColor, 'Celestite Gray Metallic');
  assert.equal(exact.standardColor, 'Gray');
  assert.equal(exact.paintCode, '1K3');
  assert.equal(exact.colorSource, 'oem_database');

  const selected = await invoke(addVehicle, vehicleRequest({ color: 'Red' }));
  assert.equal(selected.statusCode, 201);
  assert.equal(selected.body.data.color, 'Red');
  assert.equal(selected.body.data.standardColor, 'Red');
  assert.equal(selected.body.data.colorSource, 'user_selected');

  const missing = await invoke(addVehicle, vehicleRequest({ color: '', plateNumber: 'NOC1234' }));
  assert.equal(missing.body.data.color, 'Not specified');
  assert.equal(missing.body.data.colorSource, 'not_specified');
  assert.doesNotMatch(JSON.stringify(missing.body.data), /Unknown color/i);
});

test('garage add and edit resolve OEM records by paint code and retain selected fallback', async () => {
  await upsertVehicleColorBatch([{
    vehicleBrand: 'Toyota', vehicleModel: 'Corolla', year: 2025,
    factoryColorName: 'Celestite Gray Metallic', standardColor: 'Gray', paintCode: '1K3',
    finishType: 'Metallic', hexColor: '#6F7478', availability: 'available', provider: 'test-provider',
  }]);
  const saved = await invoke(addVehicle, vehicleRequest({
    make: 'Toyota', model: 'Corolla', year: '2025', color: 'Celestite Gray Metallic', paintCode: '1K3',
  }));
  assert.equal(saved.body.data.color, 'Celestite Gray Metallic');
  assert.equal(saved.body.data.colorSource, 'oem_database');
  assert.equal(saved.body.data.colorHex, '#6F7478');

  const edited = await invoke(updateVehicle, {
    user: { id: String(customer), role: 'customer' }, params: { id: saved.body.data._id }, body: { color: 'Blue' },
  });
  assert.equal(edited.body.data.color, 'Blue');
  assert.equal(edited.body.data.standardColor, 'Blue');
  assert.equal(edited.body.data.factoryColorName, '');
  assert.equal(edited.body.data.paintCode, '');
  assert.equal(edited.body.data.colorSource, 'user_selected');
});

test('vehicle color API imports, pages and resolves indexed OEM records', async () => {
  const record = {
    vehicleBrand: 'BMW', vehicleModel: 'M4 Competition', year: 2024,
    factoryColorName: 'Frozen Black Metallic', standardColor: 'Black', paintCode: 'U91',
    finishType: 'Matte Metallic', hexColor: '#202124', availability: 'limited',
    provider: 'test-oem-api', sourceId: 'bmw-m4-2024-u91',
  };
  const importHandler = router.stack.find((layer) => layer.route?.path === '/colors/import').route.stack[1].handle;
  const imported = await invoke(importHandler, { user: { id: String(actor), role: 'administrator' }, body: { records: [record] } });
  assert.equal(imported.statusCode, 201);
  assert.equal(imported.body.data.received, 1);

  const listHandler = router.stack.find((layer) => layer.route?.path === '/colors').route.stack[0].handle;
  const listed = await invoke(listHandler, { query: { brand: 'BMW', model: 'M4 Competition', year: '2024' } });
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].finishType, 'Matte Metallic');

  const resolveHandler = router.stack.find((layer) => layer.route?.path === '/colors/resolve').route.stack[0].handle;
  const resolved = await invoke(resolveHandler, { query: { brand: 'BMW', model: 'M4 Competition', year: '2024', paintCode: 'U91' } });
  assert.equal(resolved.body.data.displayColor, 'Frozen Black Metallic');
  assert.equal(resolved.body.data.standardColor, 'Black');
});

test('add and edit reject category tampering with a useful canonical correction', async () => {
  await assert.rejects(
    invoke(addVehicle, vehicleRequest({ pricingCategory: 'HATCHBACK_SMALL_CAR', vehicleType: 'Hatchback' })),
    (error) => error.code === 'VEHICLE_CLASSIFICATION_MISMATCH'
      && error.statusCode === 422
      && error.message === 'The selected vehicle classification does not match this vehicle. Bentley Bentayga is classified as SUV.'
      && error.details.expectedPricingCategory === 'SUV',
  );
  const saved = await invoke(addVehicle, vehicleRequest({ pricingCategory: 'SUV', vehicleType: 'SUV' }));
  const req = vehicleRequest({ pricingCategory: 'HATCHBACK_SMALL_CAR', vehicleType: 'Hatchback' }); req.params = { id: saved.body.data._id };
  await assert.rejects(invoke(updateVehicle, req), { code: 'VEHICLE_CLASSIFICATION_MISMATCH', statusCode: 422 });
  const changed = await invoke(updateVehicle, { ...req, body: { make: 'Unknown Brand', model: 'Future Model' } });
  assert.equal(changed.body.data.pricingCategory, undefined); assert.equal(changed.body.data.pricingCategoryNeedsReview, true);
  const record = await Vehicle.findById(saved.body.data._id).lean();
  await assert.rejects(requireVehiclePricing(record), { code: 'PRICE_CATEGORY_REQUIRED' });
});

test('unknown fallback saves and edits a supported manual category for reload and booking', async () => {
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'Unknown', model: 'Prototype', vehicleType: 'SUV', pricingCategory: 'SUV' }));
  assert.equal(saved.statusCode, 201); assert.equal(saved.body.data.pricingCategory, 'SUV');
  assert.equal(saved.body.data.pricingCategorySource, 'customer_selected');
  assert.equal(saved.body.data.pricingCategoryNeedsReview, false);
  const edited = await invoke(updateVehicle, {
    user: { id: String(customer), role: 'customer' }, params: { id: saved.body.data._id },
    body: { vehicleType: 'Sedan', pricingCategory: 'SEDAN' },
  });
  assert.equal(edited.body.data.pricingCategory, 'SEDAN');
  assert.equal(edited.body.data.pricingCategorySource, 'customer_selected');
  const persisted = await Vehicle.findById(saved.body.data._id).lean();
  const reloaded = await vehicleClassificationFields(persisted, persisted);
  assert.equal(reloaded.pricingCategory, 'SEDAN');
  assert.equal(reloaded.classification.verified, false);
  assert.equal(reloaded.classification.reason, 'MANUAL_CLASSIFICATION_SELECTED');
  const options = await invoke(getBookingOptions, { user: { id: String(customer), role: 'customer' }, query: { vehicleId: saved.body.data._id } });
  assert.equal(options.statusCode, 200); assert.equal(options.body.data.vehicle.pricingCategory, 'SEDAN');
});

test('booking options recheck a changed definition and retain package availability rules', async () => {
  await Service.insertMany(Object.values(SPF_PACKAGE_PRICING).map((pkg) => ({ name: pkg.name, category: pkg.category,
    billingGroup: 'ceramic_spf', packageCode: pkg.packageCode, tier: pkg.tier, displayOrder: pkg.displayOrder,
    pricing: buildRichPricing(pkg), prices: buildLegacyPrices(pkg), status: 'Active', isPublished: true })));
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'BMW', model: '7 Series' }));
  const req = { user: { id: String(customer), role: 'customer' }, query: { vehicleId: saved.body.data._id } };
  const options = await invoke(getBookingOptions, req);
  assert.equal(options.statusCode, 200);
  assert.equal(options.body.data.packages.find((p) => p.packageCode === 'SPF80').available, false);
  await publishDefinition(fixture({ brand: 'BMW', model: '7 Series', generation: '', yearFrom: null, yearTo: 2026, fuelType: '', status: 'draft' }), actor);
  assert.equal((await invoke(getBookingOptions, req)).statusCode, 422);
});

test('admin override is role-guarded, audited, concurrency-checked and invalidated by identity edits', async () => {
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'Unknown', model: 'Prototype' }));
  const route = router.stack.find((layer) => layer.route?.path === '/vehicles/:id/override').route;
  const guard = route.stack[0].handle;
  for (const role of ['customer', 'sales', 'office_admin']) {
    const rejected = await invoke(guard, { user: { id: String(customer), role } }); assert.equal(rejected.statusCode, 403);
  }
  const apply = route.stack[1].handle;
  const req = { user: { id: String(actor), role: 'administrator' }, params: { id: saved.body.data._id }, body: { pricingCategory: 'SUV', expectedVersion: 0, reason: 'Measured and verified by administrator' } };
  const approved = await invoke(apply, req);
  assert.equal(approved.statusCode, 200); assert.equal(approved.body.data.classificationOverrides.length, 1);
  assert.equal((await requireVehiclePricing(await Vehicle.findById(saved.body.data._id).lean())).pricingCategory, 'SUV');
  assert.equal((await invoke(apply, req)).statusCode, 409);
  await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: req.params, body: { color: 'Red' } });
  assert.equal((await requireVehiclePricing(await Vehicle.findById(saved.body.data._id).lean())).pricingCategory, 'SUV');
  await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: req.params, body: { model: 'Another Prototype' } });
  await assert.rejects(requireVehiclePricing(await Vehicle.findById(saved.body.data._id).lean()), { code: 'PRICE_CATEGORY_REQUIRED' });
});

test('review queue exposes unknown vehicles and canonical admin guards protect every management route', async () => {
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'Unknown', model: 'Prototype' }));
  const customerReadRoutes = new Set(['/catalog', '/manufacturers', '/models', '/variants', '/classifications',
    '/colors/categories', '/colors', '/colors/resolve', '/classify']);
  for (const layer of router.stack.filter((entry) => entry.route && !customerReadRoutes.has(entry.route.path))) {
    const denied = await invoke(layer.route.stack[0].handle, { user: { id: String(customer), role: 'customer' } });
    assert.equal(denied.statusCode, 403);
  }
  const route = router.stack.find((layer) => layer.route?.path === '/review-queue').route;
  const queue = await invoke(route.stack[1].handle, { user: { id: String(actor), role: 'administrator' }, query: {} });
  assert.equal(queue.body.data.length, 1); assert.equal(queue.body.data[0]._id, saved.body.data._id);
  assert.equal(queue.body.data[0].__v, 0);
});

test('SPF order submission rejects an unreviewed saved vehicle before creating an order', async () => {
  const { createOrder } = await import('../controllers/order.controller.js');
  const { default: Order } = await import('../models/order.model.js');
  const pkg = Object.values(SPF_PACKAGE_PRICING)[0];
  const service = await Service.create({ name: pkg.name, category: pkg.category, billingGroup: 'ceramic_spf',
    packageCode: pkg.packageCode, pricing: buildRichPricing(pkg), prices: buildLegacyPrices(pkg), status: 'Active', isPublished: true });
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'Unknown', model: 'Prototype' }));
  const result = await invoke(createOrder, { user: { id: String(customer), role: 'customer', name: 'Test Customer' },
    systemState: { mode: 'active', bookingsEnabled: true }, body: { vehicle: saved.body.data._id,
      service: String(service._id), vehiclePricingCategory: 'HATCHBACK_SMALL_CAR', price: 1 } });
  assert.equal(result.statusCode, 422); assert.equal(result.body.errorCode, 'PRICE_CATEGORY_REQUIRED');
  assert.equal(await Order.countDocuments(), 0);
});

test('canonical aliases resolve punctuation, spaces and case without brand-only guessing', async () => {
  for (const [brand, model, category] of [
    [' toyota ', ' RAV 4 ', 'SUV'], ['HONDA', 'crv', 'SUV'], ['mazda', 'CX 5', 'SUV'],
    ['Mercedes', 'C Class', 'SEDAN'], ['VW', 'Golf', 'HATCHBACK_SMALL_CAR'],
    ['Toyota', 'Wigo', 'HATCHBACK_SMALL_CAR'], ['Toyota', 'Camry', 'HIGH_END_SEDAN'],
    ['Toyota', 'Innova', 'MIDSIZED'], ['Toyota', 'Hiace', 'LARGE_SUV_VAN'], ['Toyota', 'Hilux', 'PICKUP'],
  ]) assert.equal((await classifyVehicle({ brand, model })).pricingCategory, category, `${brand} ${model}`);
  for (const identity of [{ brand: 'BMW', model: 'Vios' }, { brand: 'Acura', model: 'Integra' }, { brand: 'Honda', model: 'CRV prototype' }]) {
    assert.equal((await classifyVehicle(identity)).pricingCategory, null);
  }
});

test('classification contract auto-verifies one class and offers supported manual choices when ambiguous', async () => {
  const records = [
    fixture({ definitionKey: 'future-one-sedan', generation: 'G1', yearFrom: 2027, yearTo: 2030, bodyType: 'Sedan', vehicleCategory: 'Sedan', pricingCategory: 'SEDAN' }),
    fixture({ definitionKey: 'future-one-hatch', generation: 'G2', yearFrom: 2027, yearTo: 2030, bodyType: 'Hatchback', vehicleCategory: 'Hatchback', pricingCategory: 'HATCHBACK_SMALL_CAR' }),
  ];
  const ambiguous = classifyDefinitions({ brand: 'Test Motors', model: 'Future One', year: 2028 }, records);
  assert.equal(ambiguous.classification, null);
  assert.equal(ambiguous.verified, false);
  assert.equal(ambiguous.requiresSelection, true);
  assert.deepEqual(ambiguous.validPricingCategories, [
    'HATCHBACK_SMALL_CAR', 'SEDAN', 'MIDSIZED', 'SUV', 'PICKUP', 'LARGE_SUV_VAN', 'HIGH_END_SEDAN',
  ]);

  const fields = await vehicleClassificationFields(
    { make: 'Test Motors', model: 'Future One', year: 2028 },
    null,
    records,
    submittedVehicleClassification({ pricingCategory: 'SEDAN' }),
  );
  assert.equal(fields.pricingCategory, 'SEDAN');
  assert.equal(fields.pricingCategorySource, 'customer_selected');
  assert.equal(fields.pricingCategoryNeedsReview, false);
  assert.equal(fields.classification.selectionValidated, true);

  const supportedFallback = await vehicleClassificationFields(
    { make: 'Test Motors', model: 'Future One', year: 2028 }, null, records,
    submittedVehicleClassification({ vehicleClassification: 'SUV' }),
  );
  assert.equal(supportedFallback.pricingCategory, 'SUV');
  assert.equal(supportedFallback.classification.verified, false);

  await assert.rejects(vehicleClassificationFields(
    { make: 'Test Motors', model: 'Future One', year: 2028 }, null, records,
    submittedVehicleClassification({ vehicleClassification: 'Coupe' }),
  ), { code: 'VEHICLE_CLASSIFICATION_MISMATCH', statusCode: 422 });
});

test('saved add/edit/reload categories use every established price tier in Services', async () => {
  const { getVehicles } = await import('../controllers/customer.controller.js');
  const { getVehiclePricingApiKey } = await import('../constants/pricingCategories.js');
  await Service.insertMany(Object.values(SPF_PACKAGE_PRICING).map(pkg => ({ name: pkg.name, category: pkg.category,
    billingGroup: 'ceramic_spf', packageCode: pkg.packageCode, pricing: buildRichPricing(pkg), prices: buildLegacyPrices(pkg), status: 'Active', isPublished: true })));
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'Toyota', model: 'Fortuner', vehicleType: 'SUV', pricingCategory: 'SUV' }));
  assert.equal(saved.statusCode, 201);
  for (const [model, category] of [['Wigo', 'HATCHBACK_SMALL_CAR'], ['Vios', 'SEDAN'], ['Innova', 'MIDSIZED'], ['Fortuner', 'SUV'], ['Hilux', 'PICKUP'], ['Hiace', 'LARGE_SUV_VAN'], ['Camry', 'HIGH_END_SEDAN']]) {
    const edited = await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: { id: saved.body.data._id }, body: { model, pricingCategory: category } });
    assert.equal(edited.body.data.pricingCategory, category);
    const stored = await Vehicle.findById(saved.body.data._id).lean();
    assert.equal(stored.pricingCategory, category); assert.equal(stored.classification.pricingCategory, category);
    const reloaded = await invoke(getVehicles, { user: { id: String(customer), role: 'customer' }, query: {} });
    assert.equal(reloaded.body.data[0].pricingCategory, category);
    const options = await invoke(getBookingOptions, { user: { id: String(customer), role: 'customer' }, query: { vehicleId: saved.body.data._id } });
    assert.equal(options.statusCode, 200); assert.equal(options.body.data.vehicle.pricingCategory, category);
    for (const pkg of Object.values(SPF_PACKAGE_PRICING)) {
      const price = options.body.data.packages.find(p => p.packageCode === pkg.packageCode);
      assert.equal(price.promoPrice, pkg.base[getVehiclePricingApiKey(category)]);
      assert.equal(price.available, pkg.base[getVehiclePricingApiKey(category)] !== null);
    }
  }
});

test('legacy normalization is read-only until edit and duplicate add returns effective classification', async () => {
  const { getVehicles } = await import('../controllers/customer.controller.js');
  const legacy = await Vehicle.create({ customer, make: 'Toyota', model: 'Fortuner', color: 'Black', plateNumber: 'LEG1234', vehicleType: 'Sedan', pricingCategory: 'SEDAN' });
  const listed = await invoke(getVehicles, { user: { id: String(customer), role: 'customer' }, query: {} });
  assert.equal(listed.body.data[0].pricingCategory, 'SUV');
  assert.equal((await Vehicle.findById(legacy._id).lean()).pricingCategory, 'SEDAN');
  const duplicate = await invoke(addVehicle, vehicleRequest({ plateNumber: 'LEG1234' }));
  assert.equal(duplicate.statusCode, 200); assert.equal(duplicate.body.data.pricingCategory, 'SUV');
  assert.equal(await Vehicle.countDocuments(), 1);
  await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: { id: String(legacy._id) }, body: { color: 'White' } });
  assert.equal((await Vehicle.findById(legacy._id).lean()).pricingCategory, 'SUV');
});

test('classification endpoint preserves only customer-owned unchanged administrator overrides', async () => {
  const saved = await Vehicle.create({ customer, make: 'Custom', model: 'Prototype', color: 'Black', plateNumber: 'ADM1234', vehicleType: 'SUV', pricingCategory: 'SUV', pricingCategorySource: 'admin_assigned', pricingCategoryReviewedBy: actor, pricingCategoryNeedsReview: false, classification: { status: 'classified', pricingCategory: 'SUV' } });
  const handler = router.stack.find(layer => layer.route?.path === '/classify').route.stack[0].handle;
  const req = { user: { id: String(customer), role: 'customer' }, query: { vehicleId: String(saved._id), brand: 'Custom', model: 'Prototype' } };
  assert.equal((await invoke(handler, req)).body.data.pricingCategory, 'SUV');
  assert.equal((await invoke(handler, { ...req, query: { ...req.query, model: 'Different' } })).body.data.pricingCategory, null);
  assert.equal((await invoke(handler, { ...req, user: { id: String(actor), role: 'customer' } })).statusCode, 404);
});

test('malformed vehicle identities cannot be added or patched', async () => {
  const saved = await invoke(addVehicle, vehicleRequest());
  for (const body of [{ make: '' }, { model: { bad: true } }, { model: ' '.repeat(4) }, { year: 'not a year' }, { generation: [] }]) {
    assert.equal((await invoke(addVehicle, vehicleRequest(body))).statusCode, 422);
    assert.equal((await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: { id: saved.body.data._id }, body })).statusCode, 422);
  }
});

test('customer booking stores the canonical category and immutable quoted price after model edit', async () => {
  const { createOrder } = await import('../controllers/order.controller.js');
  const { default: Order } = await import('../models/order.model.js');
  const { default: ShopAvailability, buildDefaultRecurringSchedule } = await import('../models/shopAvailability.model.js');
  const availability = await ShopAvailability.getSingleton();
  availability.emergencyClosed = false;
  availability.recurringSchedule = buildDefaultRecurringSchedule().map(row => ({ ...row, open: true, from: '08:00', to: '17:00', slots: 10 }));
  await availability.save();
  const pkg = SPF_PACKAGE_PRICING.spf80;
  const service = await Service.create({ name: pkg.name, category: pkg.category, billingGroup: 'ceramic_spf', packageCode: pkg.packageCode, pricing: buildRichPricing(pkg), prices: buildLegacyPrices(pkg), status: 'Active', isPublished: true });
  const saved = await invoke(addVehicle, vehicleRequest({ make: 'Toyota', model: 'Vios' }));
  await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: { id: saved.body.data._id }, body: { model: 'Fortuner' } });
  const booked = await invoke(createOrder, { user: { id: String(customer), role: 'customer', name: 'Test Customer' }, systemState: { mode: 'active', bookingsEnabled: true }, body: {
    vehicle: saved.body.data._id, service: String(service._id), price: 1, vehiclePricingCategory: 'SEDAN',
    bookingDate: '2099-08-17', bookingTime: '09:00',
    downpaymentProof: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6V1sAAAAASUVORK5CYII=',
    reservationPaymentAmount: 500,
  } });
  assert.equal(booked.statusCode, 201, JSON.stringify(booked.body));
  const order = await Order.findById(booked.body.data._id || booked.body.data.id).lean();
  assert.equal(order.pricingSnapshot.vehicleClassification.pricingCategory, 'SUV');
  assert.equal(order.totalPrice, pkg.base.suv);
  await invoke(updateVehicle, { user: { id: String(customer), role: 'customer' }, params: { id: saved.body.data._id }, body: { model: 'Wigo' } });
  assert.equal((await Order.findById(order._id).lean()).totalPrice, pkg.base.suv);
});

test('every established selectable mapping reaches the same canonical backend definition', () => {
  const categories = new Set();
  let classified = 0;
  for (const record of BOOTSTRAP_DEFINITIONS) {
    const resolved = classifyDefinitions({ brand: record.brand, model: record.model }, BOOTSTRAP_DEFINITIONS);
    assert.equal(resolved.pricingCategory, record.pricingCategory, `${record.brand} ${record.model}`);
    categories.add(resolved.pricingCategory); classified++;
  }
  assert.equal(classified, 304); assert.equal(categories.size, 7);
});
