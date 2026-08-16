import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'slot_availability_test_jwt_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';
process.env.RESEND_API_KEY = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';

const { config } = await import('../config/environment.js');
const {
  BOOKING_MANAGER_ROLES,
  STAFF_2FA_AUTH_LEVEL,
} = await import('../constants/roles.js');
const { authenticate, authorize } = await import('../middleware/auth.middleware.js');
const { default: BookingSlotCounter } = await import('../models/bookingSlotCounter.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: ScheduledClosure } = await import('../models/scheduledClosure.model.js');
const { default: Service } = await import('../models/service.model.js');
const {
  buildDefaultRecurringSchedule,
  default: ShopAvailability,
  SHOP_AVAILABILITY_SINGLETON_KEY,
  validateRecurringScheduleInput,
} = await import('../models/shopAvailability.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');
const availabilityRouter = (await import('../routes/admin/availability.js')).default;
const orderRoutes = (await import('../routes/orders.routes.js')).default;
const slotRoutes = (await import('../routes/slot.routes.js')).default;
const {
  SLOT_CONSUMING_STATUSES,
  captureOrderSlotOccupancy,
  deleteOrdersAndReleaseSlotCounters,
  getDateAvailabilitySnapshot,
  getShopLocalClock,
  getSlotsForDate,
  getSlotsForRange,
  isSlotConsumingStatus,
  reserveBookingSlot,
  saveOrderWithSlotTransition,
  validateSlotAvailability,
} = await import('../services/slot.service.js');
const { initSocket } = await import('../utils/socket.utils.js');

const MONDAY = '2099-08-17';
const SATURDAY = '2099-08-22';
let mongo;
let server;
let io;
let baseUrl;
let sequence = 0;

const scheduleWithMonday = ({ capacity = 2, mondayOpen = true } = {}) =>
  buildDefaultRecurringSchedule().map((row) => ({
    ...row,
    open: row.dow === 1 ? mondayOpen : false,
    from: row.dow === 1 ? '08:00' : row.from,
    to: row.dow === 1 ? '11:00' : row.to,
    slots: row.dow === 1 ? capacity : row.slots,
  }));

const setMondayAvailability = async (options = {}) => {
  const doc = await ShopAvailability.getSingleton();
  doc.emergencyClosed = false;
  doc.recurringSchedule = scheduleWithMonday(options);
  await doc.save();
  return doc;
};

const createOccupyingOrder = async ({
  date = MONDAY,
  time = '08:00',
  status = 'pending_confirmation',
  archived = false,
  customer = new mongoose.Types.ObjectId(),
} = {}) => {
  sequence += 1;
  return Order.create({
    orderNumber: `SLOT-${sequence}`,
    bookingReference: `SLOT-REF-${sequence}`,
    customer,
    customerName: 'Slot Test Customer',
    serviceType: 'Slot Test Service',
    status,
    archived,
    bookingDate: date,
    bookingTime: time,
  });
};

const reserveAndPersist = async (date, time, status = 'pending_confirmation') => {
  const reservation = await reserveBookingSlot(date, time);
  if (reservation.ok) await createOccupyingOrder({ date, time, status });
  return reservation;
};

const tokenFor = (user) => jwt.sign(
  {
    id: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
    authVersion: user.authVersion || 0,
    ...(user.role === 'customer' ? {} : { authLevel: STAFF_2FA_AUTH_LEVEL }),
  },
  config.jwtSecret,
  { expiresIn: '1h' }
);

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
};

const seedBookingActors = async () => {
  const customer = await User.create({
    name: 'Booking Customer',
    email: `customer-${sequence += 1}@example.test`,
    role: 'customer',
    status: 'active',
    isActive: true,
  });
  const administrator = await User.create({
    name: 'Availability Administrator',
    email: `admin-${sequence += 1}@example.test`,
    role: 'administrator',
    status: 'active',
    isActive: true,
    isVerified: true,
  });
  const vehicle = await Vehicle.create({
    customer: customer._id,
    year: '2025',
    make: 'Toyota',
    model: 'Vios',
    color: 'Black',
    plateNumber: `TST${String(sequence).padStart(4, '0')}`,
    vehicleType: 'sedan',
  });
  const service = await Service.create({
    name: 'Slot Test Service',
    basePrice: 1000,
    pricing: { sedan: { base: 1000 } },
    status: 'Active',
    isPublished: true,
  });
  return { customer, administrator, vehicle, service };
};

const bookingPayload = ({ vehicle, service, date = MONDAY, time = '8:00 AM' }) => ({
  vehicle: vehicle._id.toString(),
  service: service._id.toString(),
  bookingDate: date,
  bookingTime: time,
  downpaymentProof: 'https://example.test/payment-proof.jpg',
  items: [],
});

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
  });
  await mongoose.connect(mongo.getUri('autospf-slot-availability-test'));

  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use('/api/orders', orderRoutes);
  app.use('/api/slots', slotRoutes);
  app.use(
    '/api/admin/availability',
    authenticate,
    authorize(...BOOKING_MANAGER_ROLES),
    availabilityRouter
  );
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message,
      errorCode: error.code,
    });
  });

  server = http.createServer(app);
  io = initSocket(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Promise.all([
    BookingSlotCounter.syncIndexes(),
    Order.syncIndexes(),
    ShopAvailability.syncIndexes(),
    User.syncIndexes(),
    Vehicle.syncIndexes(),
  ]);
  sequence = 0;
});

after(async () => {
  if (io) await new Promise((resolve) => io.close(resolve));
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('capacity is atomic per exact time slot and a capacity raise takes effect immediately', async () => {
  await setMondayAvailability({ capacity: 2 });

  assert.equal((await reserveAndPersist(MONDAY, '08:00')).ok, true);
  assert.equal((await reserveAndPersist(MONDAY, '8:00 AM')).ok, true);

  const thirdAtEight = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(thirdAtEight.ok, false);
  assert.equal(thirdAtEight.errorCode, 'SLOT_FULL');

  const firstAtNine = await reserveAndPersist(MONDAY, '09:00');
  assert.equal(firstAtNine.ok, true);

  const beforeRaise = await getSlotsForDate(MONDAY);
  assert.deepEqual(
    beforeRaise.slots.filter((slot) => ['08:00', '09:00'].includes(slot.time)).map((slot) => ({
      time: slot.time,
      capacity: slot.capacity,
      booked: slot.booked,
      available: slot.available,
      status: slot.status,
    })),
    [
      { time: '08:00', capacity: 2, booked: 2, available: 0, status: 'FULL' },
      { time: '09:00', capacity: 2, booked: 1, available: 1, status: 'AVAILABLE' },
    ]
  );

  await setMondayAvailability({ capacity: 3 });
  assert.equal((await reserveAndPersist(MONDAY, '08:00')).ok, true);
  assert.equal((await reserveBookingSlot(MONDAY, '08:00')).errorCode, 'SLOT_FULL');
});

test('concurrent reservations cannot exceed the persisted per-slot capacity', async () => {
  await setMondayAvailability({ capacity: 2 });

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => reserveBookingSlot(MONDAY, '08:00'))
  );
  assert.equal(attempts.filter((attempt) => attempt.ok).length, 2);
  assert.equal(attempts.filter((attempt) => !attempt.ok).length, 6);

  const counter = await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean();
  assert.equal(counter.count, 2);
});

test('a lifecycle re-entry adds its own hold without swallowing an in-flight reservation', async () => {
  await setMondayAvailability({ capacity: 3 });
  const reactivated = await createOccupyingOrder({ status: 'rejected' });
  const inFlight = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(inFlight.ok, true);

  const before = captureOrderSlotOccupancy(reactivated);
  reactivated.status = 'pending_confirmation';
  await saveOrderWithSlotTransition(reactivated, before);
  await createOccupyingOrder({ status: 'pending_confirmation' });

  const third = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(third.ok, true);
  await createOccupyingOrder({ status: 'pending_confirmation' });
  const fourth = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(fourth.ok, false);
  assert.equal(fourth.errorCode, 'SLOT_FULL');
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 3);
});

test('a non-consuming lifecycle cannot re-enter a full slot', async () => {
  await setMondayAvailability({ capacity: 1 });
  assert.equal((await reserveAndPersist(MONDAY, '08:00')).ok, true);

  const rejected = await createOccupyingOrder({ status: 'rejected' });
  const before = captureOrderSlotOccupancy(rejected);
  rejected.status = 'in_progress';

  await assert.rejects(
    () => saveOrderWithSlotTransition(rejected, before),
    (error) => {
      assert.equal(error.status, 409);
      assert.equal(error.statusCode, 409);
      assert.equal(error.code, 'SLOT_FULL');
      assert.equal(error.errorCode, 'SLOT_FULL');
      return true;
    }
  );

  assert.equal((await Order.findById(rejected._id).lean()).status, 'rejected');
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 1);
});

test('account cascade deletion releases only the atomically deleted Order state', async () => {
  await setMondayAvailability({ capacity: 3 });
  const deletingCustomer = new mongoose.Types.ObjectId();
  const cancelled = await createOccupyingOrder({ customer: deletingCustomer });
  assert.equal((await reserveBookingSlot(MONDAY, '08:00')).ok, true);
  await createOccupyingOrder();

  const inFlight = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(inFlight.ok, true);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 3);

  const beforeCancellation = captureOrderSlotOccupancy(cancelled);
  cancelled.status = 'cancelled';
  await saveOrderWithSlotTransition(cancelled, beforeCancellation);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 2);

  const deletion = await deleteOrdersAndReleaseSlotCounters({ customer: deletingCustomer });
  assert.equal(deletion.deletedCount, 1);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 2);

  assert.equal((await reserveBookingSlot(MONDAY, '08:00')).ok, true);
  const overCapacityAttempt = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(overCapacityAttempt.ok, false);
  assert.equal(overCapacityAttempt.errorCode, 'SLOT_FULL');
});

test('lowering capacity preserves real bookings and reports OVER_CAPACITY without admitting more', async () => {
  await setMondayAvailability({ capacity: 3 });
  await reserveAndPersist(MONDAY, '08:00');
  await reserveAndPersist(MONDAY, '08:00');
  await reserveAndPersist(MONDAY, '08:00');

  await setMondayAvailability({ capacity: 2 });

  const day = await getSlotsForDate(MONDAY);
  const eight = day.slots.find((slot) => slot.time === '08:00');
  assert.deepEqual(
    {
      capacity: eight.capacity,
      booked: eight.booked,
      available: eight.available,
      overCapacityBy: eight.overCapacityBy,
      status: eight.status,
    },
    { capacity: 2, booked: 3, available: 0, overCapacityBy: 1, status: 'OVER_CAPACITY' }
  );

  const [rangeDay] = await getSlotsForRange(MONDAY, MONDAY);
  assert.equal(rangeDay.bookedSlots, 3);
  assert.equal(rangeDay.perSlotCapacity, 2);
  assert.equal(rangeDay.overCapacitySlots, 1);
  assert.equal(rangeDay.overCapacityBy, 1);
  assert.equal(rangeDay.status, 'OVER_CAPACITY');

  const extra = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(extra.ok, false);
  assert.equal(extra.errorCode, 'SLOT_FULL');
  assert.equal(await Order.countDocuments({ bookingDate: MONDAY, bookingTime: '08:00' }), 3);
});

test('closed days, scheduled closures, outside-hours times, and nonexistent bands are rejected', async () => {
  await setMondayAvailability({ capacity: 2 });

  assert.equal((await validateSlotAvailability(MONDAY, null)).errorCode, 'INVALID_SLOT');
  assert.equal((await validateSlotAvailability(null, '08:00')).errorCode, 'INVALID_SLOT');

  const recurringClosed = await reserveBookingSlot(SATURDAY, '08:00');
  assert.equal(recurringClosed.ok, false);
  assert.equal(recurringClosed.errorCode, 'CLOSED_BY_RECURRING_DAY');
  assert.equal((await getSlotsForDate(SATURDAY)).isClosed, true);

  for (const time of ['07:00', '08:30', '11:00']) {
    const invalidBand = await reserveBookingSlot(MONDAY, time);
    assert.equal(invalidBand.ok, false);
    assert.equal(invalidBand.errorCode, 'SLOT_UNAVAILABLE');
  }

  await ScheduledClosure.create({
    fromDate: new Date(`${MONDAY}T00:00:00`),
    toDate: new Date(`${MONDAY}T23:59:59`),
    reason: 'Holiday',
  });
  const scheduledClosed = await reserveBookingSlot(MONDAY, '08:00');
  assert.equal(scheduledClosed.ok, false);
  assert.equal(scheduledClosed.errorCode, 'CLOSED_BY_SCHEDULED_CLOSURE');
});

test('only lifecycle statuses that occupy appointments consume capacity', async () => {
  await setMondayAvailability({ capacity: 20 });
  const canonicalConsuming = [
    'pending_confirmation',
    'pending',
    'approved',
    'confirmed',
    'assigned',
    'queued',
    'received',
    'in_progress',
  ];
  const legacyConsuming = ['in-progress', 'processing', 'quality_check'];
  const consuming = [...canonicalConsuming, ...legacyConsuming];
  const excluded = ['ready_for_payment', 'completed', 'paid', 'released', 'rejected', 'cancelled'];

  for (const status of [...canonicalConsuming, ...excluded]) {
    await createOccupyingOrder({ status });
  }
  for (const status of legacyConsuming) {
    sequence += 1;
    await Order.collection.insertOne({
      orderNumber: `LEGACY-SLOT-${sequence}`,
      bookingReference: `LEGACY-SLOT-REF-${sequence}`,
      customer: new mongoose.Types.ObjectId(),
      customerName: 'Legacy Slot Customer',
      serviceType: 'Legacy Slot Service',
      status,
      bookingDate: MONDAY,
      bookingTime: '08:00',
      archived: false,
      isWalkIn: false,
    });
  }
  await createOccupyingOrder({ status: 'pending_confirmation', archived: true });

  const snapshot = await getDateAvailabilitySnapshot(MONDAY);
  const eight = snapshot.slots.find((slot) => slot.time === '08:00');
  assert.equal(eight.booked, consuming.length);
  assert.deepEqual(SLOT_CONSUMING_STATUSES, consuming);
  for (const status of consuming) assert.equal(isSlotConsumingStatus(status), true);
  for (const status of excluded) assert.equal(isSlotConsumingStatus(status), false);

  const range = await getSlotsForRange(MONDAY, MONDAY);
  assert.equal(range[0].bookedSlots, consuming.length);
  assert.equal(range[0].pendingCount, 1);
});

test('legacy human and ISO date strings remain countable while new writes are canonical', async () => {
  await setMondayAvailability({ capacity: 10 });
  await createOccupyingOrder({ date: 'Aug 17, 2099', time: '8:00 AM' });
  await createOccupyingOrder({ date: 'August 17, 2099', time: '08:00' });
  await createOccupyingOrder({ date: '2099-08-17T00:00:00.000Z', time: '08:00' });

  const slot = (await getSlotsForDate(MONDAY)).slots.find((row) => row.time === '08:00');
  assert.equal(slot.booked, 3);
});

test('Admin schedule writes reject fractional capacity and legacy slot settings update ShopAvailability', async () => {
  const { administrator } = await seedBookingActors();
  await setMondayAvailability({ capacity: 2 });
  const auth = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const invalidSchedule = scheduleWithMonday({ capacity: 2 });
  invalidSchedule.find((row) => row.dow === 1).slots = 2.5;
  const invalid = await requestJson('/api/admin/availability/recurring', {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ schedule: invalidSchedule }),
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.body.error, /integer/i);

  const aliasUpdate = await requestJson('/api/slots/settings', {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ defaultSlotCapacity: 4 }),
  });
  assert.equal(aliasUpdate.response.status, 200);
  assert.equal(aliasUpdate.body.data.source, 'ShopAvailability');
  assert.equal(aliasUpdate.body.data.openingHours.monday.capacityPerSlot, 4);

  const persisted = await ShopAvailability.findOne({ singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY }).lean();
  assert.equal(persisted.recurringSchedule.find((row) => row.dow === 1).slots, 4);
  assert.equal(validateRecurringScheduleInput(invalidSchedule).error.includes('integer'), true);
});

test('public weekly schedule is canonical but exposes no capacity or occupancy', async () => {
  await setMondayAvailability({ capacity: 7 });
  const { response, body } = await requestJson('/api/slots/schedule');
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.length, 7);
  const monday = body.data.find((row) => row.dow === 1);
  assert.deepEqual(monday, { dow: 1, open: true, from: '08:00', to: '11:00' });
  assert.equal(Object.hasOwn(monday, 'slots'), false);
  assert.equal(Object.hasOwn(body, 'bookedSlots'), false);
});

test('legacy availability rows migrate deterministically to one canonical singleton', async () => {
  const olderId = new mongoose.Types.ObjectId();
  const newerId = new mongoose.Types.ObjectId();
  const olderSchedule = scheduleWithMonday({ capacity: 2 });
  const newerSchedule = scheduleWithMonday({ capacity: 7 });

  await ShopAvailability.collection.insertMany([
    {
      _id: olderId,
      emergencyClosed: false,
      recurringSchedule: olderSchedule,
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    },
    {
      _id: newerId,
      emergencyClosed: false,
      recurringSchedule: newerSchedule,
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    },
  ]);

  const resolved = await Promise.all(Array.from({ length: 8 }, () => ShopAvailability.getSingleton()));
  assert.equal(new Set(resolved.map((doc) => doc._id.toString())).size, 1);
  assert.equal(resolved[0]._id.toString(), newerId.toString());
  assert.equal(resolved[0].recurringSchedule.find((row) => row.dow === 1).slots, 7);
  assert.equal(await ShopAvailability.countDocuments(), 2, 'legacy rows are preserved');
  assert.equal(
    await ShopAvailability.countDocuments({ singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY }),
    1
  );
});

test('an incomplete persisted recurring schedule fails closed for missing weekdays', async () => {
  await ShopAvailability.collection.insertOne({
    singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
    emergencyClosed: false,
    recurringSchedule: [{ dow: 1, open: true, from: '08:00', to: '11:00', slots: 2 }],
    updatedAt: new Date(),
  });

  const monday = await getSlotsForDate(MONDAY);
  assert.equal(monday.isClosed, false);
  const missingTuesday = await getSlotsForDate('2099-08-18');
  assert.equal(missingTuesday.isClosed, true);
  assert.equal(missingTuesday.closedReason, 'CLOSED_BY_RECURRING_DAY');
});

test('past dates and elapsed same-day time slots are rejected by the slot service', async () => {
  await createOccupyingOrder({ date: '2000-01-03', time: '08:00' });
  const past = await reserveBookingSlot('2000-01-03', '08:00');
  assert.equal(past.ok, false);
  assert.equal(past.errorCode, 'DATE_IN_PAST');
  const historical = await getSlotsForDate('2000-01-03');
  assert.equal(historical.bookedSlots, 1, 'historical occupancy remains visible to calendar reads');
  assert.equal(historical.slots.find((row) => row.time === '08:00').booked, 1);

  const clock = getShopLocalClock();
  const [year, month, day] = clock.date.split('-').map(Number);
  const todayDow = new Date(year, month - 1, day).getDay();
  const doc = await ShopAvailability.getSingleton();
  doc.recurringSchedule = buildDefaultRecurringSchedule().map((row) => ({
    ...row,
    open: row.dow === todayDow,
    from: row.dow === todayDow ? '00:00' : row.from,
    to: row.dow === todayDow ? '23:59' : row.to,
    slots: 2,
  }));
  await doc.save();

  const elapsedTime = `${clock.time.slice(0, 2)}:00`;
  const elapsed = await reserveBookingSlot(clock.date, elapsedTime);
  assert.equal(elapsed.ok, false);
  assert.equal(elapsed.errorCode, 'TIME_IN_PAST');
  const snapshot = await getDateAvailabilitySnapshot(clock.date);
  assert.equal(snapshot.slots.find((row) => row.time === elapsedTime).status, 'ELAPSED');
});

test('customer/admin creation and rescheduling are server-enforced per slot', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, administrator, vehicle, service } = await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const createAt = (time, date = MONDAY) => requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify(bookingPayload({ vehicle, service, date, time })),
  });

  const humanDateCreate = await createAt('8:00 AM', 'Aug 17, 2099');
  assert.equal(humanDateCreate.response.status, 201);
  const canonicalCreated = await Order.findById(humanDateCreate.body.data.id || humanDateCreate.body.data._id).lean();
  assert.equal(canonicalCreated.bookingDate, MONDAY);
  assert.equal(canonicalCreated.bookingTime, '08:00');
  assert.equal((await createAt('8:00 AM')).response.status, 201);
  const rejectedThird = await createAt('8:00 AM');
  assert.equal(rejectedThird.response.status, 409);
  assert.equal(rejectedThird.body.errorCode, 'SLOT_FULL');

  const nine = await createAt('9:00 AM');
  assert.equal(nine.response.status, 201);
  const nineId = nine.body.data.id || nine.body.data._id;

  const fullReschedule = await requestJson(`/api/orders/${nineId}/reschedule`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ newDate: MONDAY, newTime: '8:00 AM' }),
  });
  assert.equal(fullReschedule.response.status, 409);
  assert.equal(fullReschedule.body.errorCode, 'SLOT_FULL');

  await setMondayAvailability({ capacity: 3 });
  const allowedAfterRaise = await requestJson(`/api/orders/${nineId}/reschedule`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ newDate: 'August 17, 2099', newTime: '8:00 AM' }),
  });
  assert.equal(allowedAfterRaise.response.status, 200);
  const canonicalRescheduled = await Order.findById(nineId).lean();
  assert.equal(canonicalRescheduled.bookingDate, MONDAY);
  assert.equal(canonicalRescheduled.bookingTime, '08:00');
  assert.equal((await createAt('8:00 AM')).response.status, 409);

  const genericUpdate = await requestJson(`/api/orders/${nineId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ bookingDate: 'Aug 17, 2099', bookingTime: '10:00 AM' }),
  });
  assert.equal(genericUpdate.response.status, 200);
  const canonicalUpdated = await Order.findById(nineId).lean();
  assert.equal(canonicalUpdated.bookingDate, MONDAY);
  assert.equal(canonicalUpdated.bookingTime, '10:00');

  const closedDay = await createAt('8:00 AM', SATURDAY);
  assert.equal(closedDay.response.status, 409);
  assert.equal(closedDay.body.errorCode, 'CLOSED_BY_RECURRING_DAY');

  const missingTime = await requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      ...bookingPayload({ vehicle, service, date: MONDAY }),
      bookingTime: undefined,
    }),
  });
  assert.equal(missingTime.response.status, 400);
  assert.equal(missingTime.body.errorCode, 'INVALID_SLOT');

  const missingBoth = await requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      ...bookingPayload({ vehicle, service }),
      bookingDate: undefined,
      bookingTime: undefined,
    }),
  });
  assert.equal(missingBoth.response.status, 400);
  assert.equal(missingBoth.body.errorCode, 'INVALID_SLOT');

  const unauthorizedWalkIn = await requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      ...bookingPayload({ vehicle, service }),
      bookingDate: undefined,
      bookingTime: undefined,
      isWalkIn: true,
    }),
  });
  assert.equal(unauthorizedWalkIn.response.status, 403);
  assert.equal(unauthorizedWalkIn.body.errorCode, 'WALK_IN_NOT_AUTHORIZED');

  const authorizedWalkIn = await requestJson('/api/orders', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ...bookingPayload({ vehicle, service }),
      customer: customer._id.toString(),
      bookingDate: undefined,
      bookingTime: undefined,
      isWalkIn: true,
    }),
  });
  assert.equal(authorizedWalkIn.response.status, 201);
  const walkIn = await Order.findById(authorizedWalkIn.body.data.id || authorizedWalkIn.body.data._id).lean();
  assert.equal(walkIn.isWalkIn, true);
  assert.equal(walkIn.bookingDate, undefined);
  assert.equal(walkIn.bookingTime, undefined);
});

test('parallel create requests admit exactly the configured capacity with unique order numbers', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, vehicle, service } = await seedBookingActors();
  const headers = { Authorization: `Bearer ${tokenFor(customer)}` };
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () => requestJson('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(bookingPayload({ vehicle, service, time: '8:00 AM' })),
    }))
  );

  assert.equal(attempts.filter(({ response }) => response.status === 201).length, 2);
  assert.equal(attempts.filter(({ response }) => response.status === 409).length, 6);
  const persisted = await Order.find({
    bookingDate: MONDAY,
    bookingTime: '08:00',
    status: 'pending_confirmation',
    archived: { $ne: true },
  }).lean();
  assert.equal(persisted.length, 2);
  assert.equal(new Set(persisted.map((row) => row.orderNumber)).size, 2);
  const counter = await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean();
  assert.equal(counter.count, persisted.length);
});

test('duplicate reschedules and rejected-proof retries are counter-idempotent', async () => {
  await setMondayAvailability({ capacity: 4 });
  const { customer, administrator, vehicle, service } = await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const created = await requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify(bookingPayload({ vehicle, service, time: '8:00 AM' })),
  });
  assert.equal(created.response.status, 201);
  const orderId = created.body.data.id || created.body.data._id;

  const reschedules = await Promise.all(
    Array.from({ length: 2 }, () => requestJson(`/api/orders/${orderId}/reschedule`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ newDate: MONDAY, newTime: '9:00 AM' }),
    }))
  );
  assert.deepEqual(reschedules.map(({ response }) => response.status).sort(), [200, 200]);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 0);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '09:00' }).lean()).count, 1);

  const rejected = await requestJson(`/api/orders/${orderId}/reject`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ reason: 'Retry test' }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '09:00' }).lean()).count, 0);

  const retries = await Promise.all(
    Array.from({ length: 2 }, () => requestJson(`/api/orders/${orderId}/payment-proof`, {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify({ paymentProofUrl: 'https://example.test/retry-proof.jpg' }),
    }))
  );
  assert.deepEqual(retries.map(({ response }) => response.status).sort(), [200, 200]);
  const current = await Order.findById(orderId).lean();
  assert.equal(current.status, 'pending_confirmation');
  assert.equal(current.bookingDate, MONDAY);
  assert.equal(current.bookingTime, '09:00');
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '09:00' }).lean()).count, 1);
});

test('archiving releases occupancy and unarchiving cannot bypass a newly full slot', async () => {
  await setMondayAvailability({ capacity: 1 });
  const { customer, administrator, vehicle, service } = await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const createAtEight = () => requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify(bookingPayload({ vehicle, service, time: '8:00 AM' })),
  });
  const first = await createAtEight();
  assert.equal(first.response.status, 201);
  const firstId = first.body.data.id || first.body.data._id;

  const archived = await requestJson(`/api/orders/${firstId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ archived: true }),
  });
  assert.equal(archived.response.status, 200);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 0);
  assert.equal((await createAtEight()).response.status, 201);

  const unarchive = await requestJson(`/api/orders/${firstId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ archived: false }),
  });
  assert.equal(unarchive.response.status, 409);
  assert.equal(unarchive.body.errorCode, 'SLOT_FULL');
  assert.equal((await Order.findById(firstId).lean()).archived, true);
  assert.equal((await BookingSlotCounter.findOne({ date: MONDAY, time: '08:00' }).lean()).count, 1);
});

test('lowering capacity does not block approval of an appointment that already occupies the slot', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, administrator, vehicle, service } = await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const createAtEight = () => requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify(bookingPayload({ vehicle, service, time: '8:00 AM' })),
  });
  const first = await createAtEight();
  const second = await createAtEight();
  assert.equal(first.response.status, 201);
  assert.equal(second.response.status, 201);

  await setMondayAvailability({ capacity: 1 });
  const firstId = first.body.data.id || first.body.data._id;
  const approved = await requestJson(`/api/orders/${firstId}/approve`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({}),
  });
  assert.equal(approved.response.status, 200);

  const slot = (await getSlotsForDate(MONDAY)).slots.find((row) => row.time === '08:00');
  assert.equal(slot.booked, 2);
  assert.equal(slot.capacity, 1);
  assert.equal(slot.status, 'OVER_CAPACITY');
});
