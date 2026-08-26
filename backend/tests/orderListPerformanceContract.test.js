import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
delete process.env.LEGACY_ENCRYPTION_KEY;

const { getAllOrders } = await import('../controllers/order.controller.js');
const { default: Order } = await import('../models/order.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');

const mongoDownloadDir = fileURLToPath(new URL('../.mongodb-binaries', import.meta.url));

let mongo;

const makeResponse = () => {
  const headers = new Map();

  return {
    body: undefined,
    headersSent: false,
    locals: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    json(payload) {
      // Exercise the wire representation: Express removes undefined values while
      // serializing JSON and has sent headers before sendJsonWithTiming returns.
      this.body = JSON.parse(JSON.stringify(payload));
      this.headersSent = true;
      return this;
    },
  };
};

const invokeGetAllOrders = async (query = {}) => {
  const res = makeResponse();
  let forwardedError;
  const req = {
    id: 'order-list-contract-test',
    method: 'GET',
    originalUrl: '/api/bookings',
    query,
    user: {
      id: new mongoose.Types.ObjectId().toString(),
      role: 'sales',
    },
  };

  await getAllOrders(req, res, (error) => {
    forwardedError = error;
  });

  if (forwardedError) throw forwardedError;
  assert.equal(res.statusCode, 200);
  assert.ok(res.body, 'controller should send a JSON response');
  return res;
};

const serverTimingNames = (res) => new Set(
  String(res.getHeader('Server-Timing') || '')
    .split(',')
    .map((entry) => entry.trim().split(';', 1)[0])
    .filter(Boolean),
);

const localTimingNames = (res) => new Set(
  (res.locals.performanceTimings || []).map(({ kind, name }) => `${kind}.${name}`),
);

const seedOrderList = async () => {
  const snapshotCustomer = await User.create({
    name: 'Live Snapshot Customer',
    email: 'snapshot-list@example.com',
    role: 'customer',
    phone: '09179999999',
  });
  const fallbackCustomer = await User.create({
    name: 'Live Fallback Customer',
    email: 'fallback-list@example.com',
    role: 'customer',
    phone: '09172222222',
  });

  const snapshotVehicle = await Vehicle.create({
    customer: snapshotCustomer._id,
    year: '2030',
    make: 'Live Make',
    model: 'Live Model',
    color: 'Live Color',
    plateNumber: 'LIVE111',
    vehicleType: 'Live Type',
  });
  const fallbackVehicle = await Vehicle.create({
    customer: fallbackCustomer._id,
    year: '2025',
    make: 'Live Fallback Make',
    model: 'Live Fallback Model',
    color: 'Live Fallback Color',
    plateNumber: 'LIVE222',
    vehicleType: 'SUV',
  });

  const thirdCustomerId = new mongoose.Types.ObjectId();
  const thirdVehicleId = new mongoose.Types.ObjectId();
  const completeOrderId = new mongoose.Types.ObjectId();
  const fallbackOrderId = new mongoose.Types.ObjectId();
  const thirdOrderId = new mongoose.Types.ObjectId();

  // Raw inserts let this fixture represent both current and legacy snapshot
  // fields, including vehicleType, without invoking unrelated write middleware.
  await Order.collection.insertMany([
    {
      _id: completeOrderId,
      orderNumber: 'ORDER-COMPLETE-SNAPSHOT',
      bookingReference: 'BOOK-COMPLETE-SNAPSHOT',
      customer: snapshotCustomer._id,
      vehicle: snapshotVehicle._id,
      customerName: 'Stored Snapshot Customer',
      customerPhone: '09171111111',
      serviceType: 'Projected Service',
      items: [{
        name: 'Projected Service',
        quantity: 1,
        price: 1500,
        product: new mongoose.Types.ObjectId(),
        internalBlob: 'must not be returned',
      }],
      totalAmount: 1500,
      totalPrice: 1500,
      status: 'approved',
      paymentStatus: 'unpaid',
      archived: false,
      vehicleYear: '2024',
      vehicleMake: 'Stored Make',
      vehicleModel: 'Stored Model',
      vehicleColor: 'Stored Color',
      vehicleType: 'Stored Type',
      vehiclePlate: 'STORED111',
      bookingDate: '2026-09-01',
      bookingTime: '09:00',
      notes: 'small list note',
      paymentProofUrl: 'https://example.invalid/heavy-proof.png',
      downpaymentProof: 'data:image/png;base64,heavy',
      damagePhotos: ['https://example.invalid/damage.png'],
      trackerStageMedia: [{ photoUrl: 'https://example.invalid/tracker.png' }],
      legalCompliance: { waiverSignature: 'heavy signature' },
      workflow: { currentStep: 7, completedSteps: [1, 2, 3] },
      inventoryReservation: { items: [{ productName: 'heavy inventory data' }] },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
    {
      _id: fallbackOrderId,
      orderNumber: 'ORDER-NEEDS-FALLBACK',
      customer: fallbackCustomer._id,
      vehicle: fallbackVehicle._id,
      customerName: 'Stored Fallback Customer',
      serviceType: 'Fallback Service',
      items: [{ name: 'Fallback Service', quantity: 1, price: 900 }],
      totalAmount: 900,
      totalPrice: 900,
      status: 'approved',
      paymentStatus: 'unpaid',
      archived: false,
      vehicleMake: 'Stored Preferred Make',
      vehiclePlate: 'STORED222',
      bookingDate: '2026-09-02',
      bookingTime: '10:00',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
    {
      _id: thirdOrderId,
      orderNumber: 'ORDER-THIRD',
      customer: thirdCustomerId,
      vehicle: thirdVehicleId,
      customerName: 'Third Customer',
      customerPhone: '+639173333333',
      serviceType: 'Third Service',
      items: [{ name: 'Third Service', quantity: 1, price: 700 }],
      totalAmount: 700,
      totalPrice: 700,
      status: 'approved',
      paymentStatus: 'unpaid',
      archived: false,
      vehicleYear: '2023',
      vehicleMake: 'Third Make',
      vehicleModel: 'Third Model',
      vehicleColor: 'Third Color',
      vehicleType: 'Sedan',
      vehiclePlate: 'THIRD333',
      bookingDate: '2026-09-03',
      bookingTime: '11:00',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      updatedAt: new Date('2026-01-03T00:00:00.000Z'),
    },
  ]);

  return {
    completeOrderId,
    fallbackOrderId,
    snapshotCustomer,
    fallbackCustomer,
  };
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: mongoDownloadDir,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-order-list-contract-test'), {
    autoIndex: false,
  });
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('getAllOrders preserves the exact paginated envelope and a projected list payload', async () => {
  await seedOrderList();

  const firstPage = await invokeGetAllOrders({
    limit: '2',
    page: '1',
    sortBy: 'createdAt',
    sortOrder: 'asc',
  });

  assert.deepEqual(Object.keys(firstPage.body).sort(), ['data', 'pagination', 'success']);
  assert.equal(firstPage.body.success, true);
  assert.deepEqual(firstPage.body.pagination, {
    page: 1,
    skip: 0,
    limit: 2,
    hasNextPage: true,
    hasPrevPage: false,
  });
  assert.deepEqual(
    firstPage.body.data.map(({ orderNumber }) => orderNumber),
    ['ORDER-COMPLETE-SNAPSHOT', 'ORDER-NEEDS-FALLBACK'],
  );

  const projected = firstPage.body.data[0];
  assert.equal(projected.customerName, 'Stored Snapshot Customer');
  assert.equal(projected.customerPhone, '+639171111111');
  assert.equal(projected.vehicleInfo, '2024 Stored Make Stored Model');
  assert.equal(projected.serviceName, 'Projected Service');
  assert.deepEqual(projected.items, [{ name: 'Projected Service', quantity: 1, price: 1500 }]);
  for (const heavyField of [
    'paymentProofUrl',
    'downpaymentProof',
    'damagePhotos',
    'trackerStageMedia',
    'legalCompliance',
    'workflow',
    'inventoryReservation',
  ]) {
    assert.equal(Object.hasOwn(projected, heavyField), false, `${heavyField} must stay off list rows`);
  }

  const secondPage = await invokeGetAllOrders({
    limit: '2',
    page: '2',
    includeTotal: 'true',
    sortBy: 'createdAt',
    sortOrder: 'asc',
  });
  assert.deepEqual(secondPage.body.pagination, {
    page: 2,
    skip: 2,
    limit: 2,
    hasNextPage: false,
    hasPrevPage: true,
    total: 3,
    totalPages: 2,
  });
  assert.deepEqual(
    secondPage.body.data.map(({ orderNumber }) => orderNumber),
    ['ORDER-THIRD'],
  );

  const firstPageTimings = serverTimingNames(firstPage);
  assert.ok(firstPageTimings.has('db.bookings.aggregatepage'));
  assert.ok(firstPageTimings.has('cpu.bookings.formatresponse'));
  assert.equal(firstPageTimings.has('db.bookings.counttotal'), false);
  assert.ok(serverTimingNames(secondPage).has('db.bookings.counttotal'));
  assert.ok(localTimingNames(secondPage).has('serialization.bookings.response'));
});

test('getAllOrders prefers snapshots and only fills missing customer/vehicle fields from live records', async () => {
  const { snapshotCustomer, fallbackCustomer } = await seedOrderList();

  const complete = await invokeGetAllOrders({
    customerId: snapshotCustomer._id.toString(),
    limit: '10',
  });
  assert.equal(complete.body.data.length, 1);
  assert.equal(complete.body.data[0].customerName, 'Stored Snapshot Customer');
  assert.equal(complete.body.data[0].customerPhone, '+639171111111');
  assert.equal(complete.body.data[0].vehicleYear, '2024');
  assert.equal(complete.body.data[0].vehicleMake, 'Stored Make');
  assert.equal(complete.body.data[0].vehicleModel, 'Stored Model');
  assert.equal(complete.body.data[0].vehicleColor, 'Stored Color');
  assert.equal(complete.body.data[0].vehicleType, 'Stored Type');
  assert.equal(complete.body.data[0].vehiclePlate, 'STORED111');

  const completeTimingNames = serverTimingNames(complete);
  assert.ok(completeTimingNames.has('db.bookings.aggregatepage'));
  assert.ok(completeTimingNames.has('cpu.bookings.formatresponse'));

  const fallback = await invokeGetAllOrders({
    customerId: fallbackCustomer._id.toString(),
    limit: '10',
  });
  assert.equal(fallback.body.data.length, 1);
  const row = fallback.body.data[0];

  // Existing snapshots win; only absent values come from the current records.
  assert.equal(row.customerName, 'Stored Fallback Customer');
  assert.equal(row.customerPhone, '+639172222222');
  assert.equal(row.vehicleYear, '2025');
  assert.equal(row.vehicleMake, 'Stored Preferred Make');
  assert.equal(row.vehicleModel, 'Live Fallback Model');
  assert.equal(row.vehicleColor, 'Live Fallback Color');
  assert.equal(row.vehicleType, 'SUV');
  assert.equal(row.vehiclePlate, 'STORED222');
  assert.equal(row.vehicleInfo, '2025 Stored Preferred Make Live Fallback Model');

  const fallbackTimingNames = serverTimingNames(fallback);
  assert.ok(fallbackTimingNames.has('db.bookings.aggregatepage'));
  assert.ok(fallbackTimingNames.has('cpu.bookings.formatresponse'));
  assert.ok(localTimingNames(fallback).has('serialization.bookings.response'));
});
