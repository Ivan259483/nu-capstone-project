import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { getVehicles } = await import('../controllers/customer.controller.js');
const { getBookingOptions } = await import('../controllers/service.controller.js');
const { default: Service } = await import('../models/service.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');
const {
  SPF_PACKAGE_PRICING,
  buildLegacyPrices,
  buildRichPricing,
} = await import('../constants/spfPricing.js');

const mongoDownloadDir = fileURLToPath(new URL('../.mongodb-binaries', import.meta.url));
let mongo;

const makeResponse = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = JSON.parse(JSON.stringify(payload));
    return this;
  },
});

const invokeController = async (controller, req) => {
  const res = makeResponse();
  let forwardedError;
  await controller(req, res, (error) => {
    forwardedError = error;
  });
  if (forwardedError) throw forwardedError;
  return res;
};

const seedPublishedSpfServices = async () => {
  await Service.insertMany(Object.values(SPF_PACKAGE_PRICING).map((pkg) => ({
    name: pkg.name,
    category: pkg.category,
    billingGroup: 'ceramic_spf',
    packageCode: pkg.packageCode,
    tier: pkg.tier,
    displayOrder: pkg.displayOrder,
    pricing: buildRichPricing(pkg),
    prices: buildLegacyPrices(pkg),
    status: 'Active',
    isPublished: true,
  })));
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: mongoDownloadDir,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-customer-booking-vehicle-resolution'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('Garage and booking options reuse one legacy Vantage record and resolve three packages', async () => {
  const customerId = new mongoose.Types.ObjectId();
  const vehicle = await Vehicle.create({
    customer: customerId,
    year: '2024',
    make: 'Aston Martin',
    model: 'Vantage',
    color: 'Black',
    plateNumber: 'VNTG123',
  });
  await seedPublishedSpfServices();

  const garageResponse = await invokeController(getVehicles, {
    query: {},
    user: { id: String(customerId), role: 'customer' },
  });
  assert.equal(garageResponse.statusCode, 200);
  assert.equal(garageResponse.body.data.length, 1);
  assert.equal(garageResponse.body.data[0]._id, String(vehicle._id));
  assert.equal(garageResponse.body.data[0].pricingCategory, 'HIGH_END_SEDAN');

  const bookingResponse = await invokeController(getBookingOptions, {
    query: { vehicleId: String(vehicle._id) },
    user: { id: String(customerId), role: 'customer' },
  });
  assert.equal(bookingResponse.statusCode, 200);
  assert.equal(bookingResponse.body.data.vehicle.id, String(vehicle._id));
  assert.equal(bookingResponse.body.data.vehicle.pricingCategory, 'HIGH_END_SEDAN');
  assert.deepEqual(
    bookingResponse.body.data.packages
      .filter((pkg) => pkg.available)
      .map((pkg) => [pkg.packageCode, pkg.promoPrice, pkg.srp]),
    [
      ['SPF89', 17999, 36000],
      ['SPF99', 22999, 40000],
      ['SPF101', 49999, 100000],
    ],
  );
  assert.equal(
    bookingResponse.body.data.packages.find((pkg) => pkg.packageCode === 'SPF80')?.available,
    false,
  );

  const migratedVehicle = await Vehicle.findById(vehicle._id).lean();
  assert.equal(migratedVehicle.pricingCategory, 'HIGH_END_SEDAN');
  assert.equal(migratedVehicle.pricingCategorySource, 'legacy_migration');
  assert.equal(migratedVehicle.pricingCategoryNeedsReview, true);
  assert.equal(await Vehicle.countDocuments({ customer: customerId }), 1);
});

test('booking options reject a saved vehicle owned by another customer', async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const otherCustomerId = new mongoose.Types.ObjectId();
  const vehicle = await Vehicle.create({
    customer: ownerId,
    make: 'Bentley',
    model: 'Bentayga',
    color: 'Silver',
    plateNumber: 'BNTG123',
  });

  const response = await invokeController(getBookingOptions, {
    query: { vehicleId: String(vehicle._id) },
    user: { id: String(otherCustomerId), role: 'customer' },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
  assert.equal(await Vehicle.countDocuments({ customer: ownerId }), 1);
});
