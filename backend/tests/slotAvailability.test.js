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
process.env.SHOP_TIME_ZONE = 'Asia/Manila';

const { config } = await import('../config/environment.js');
const { BOOKING_MANAGER_ROLES, STAFF_2FA_AUTH_LEVEL } = await import(
  '../constants/roles.js'
);
const { authenticate, authorize } = await import(
  '../middleware/auth.middleware.js'
);
const { default: ActivityLog } = await import('../models/activityLog.model.js');
const { default: BookingSlotCounter } = await import(
  '../models/bookingSlotCounter.model.js'
);
const { default: ChatConversation } = await import(
  '../models/chatConversation.model.js'
);
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: ScheduledClosure } = await import(
  '../models/scheduledClosure.model.js'
);
const { default: Service } = await import('../models/service.model.js');
const { default: Setting } = await import('../models/setting.model.js');
const {
  buildDefaultRecurringSchedule,
  default: ShopAvailability,
  SHOP_AVAILABILITY_SINGLETON_KEY,
  validateRecurringScheduleInput,
} = await import('../models/shopAvailability.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');
const availabilityRouter = (await import('../routes/admin/availability.js'))
  .default;
const orderRoutes = (await import('../routes/orders.routes.js')).default;
const slotRoutes = (await import('../routes/slot.routes.js')).default;
const {
  SHOP_TIME_ZONE,
  SLOT_CONSUMING_STATUSES,
  captureOrderSlotOccupancy,
  deleteOrdersAndReleaseSlotCounters,
  getDateAvailabilitySnapshot,
  generateTimeSlots,
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
const TUESDAY = '2099-08-18';
const SATURDAY = '2099-08-22';
let mongo;
let server;
let io;
let baseUrl;
let sequence = 0;

const scheduleWithMonday = ({
  capacity = 2,
  mondayOpen = true,
  from = '08:00',
  to = '11:00',
} = {}) =>
  buildDefaultRecurringSchedule().map((row) => ({
    ...row,
    open: row.dow === 1 ? mondayOpen : false,
    from: row.dow === 1 ? from : row.from,
    to: row.dow === 1 ? to : row.to,
    slots: row.dow === 1 ? capacity : row.slots,
  }));

const setMondayAvailability = async (options = {}) => {
  const doc = await ShopAvailability.getSingleton();
  doc.emergencyClosed = false;
  doc.recurringSchedule = scheduleWithMonday(options);
  await doc.save();
  return doc;
};

const scheduleEveryDay = ({ slots = 24 } = {}) =>
  buildDefaultRecurringSchedule().map((row) => ({
    ...row,
    open: true,
    from: '00:00',
    to: '23:59',
    slots,
  }));

const setEveryDayAvailability = async (options = {}) => {
  const doc = await ShopAvailability.getSingleton();
  doc.emergencyClosed = false;
  if ('emergencyClosureDate' in doc) doc.emergencyClosureDate = null;
  if ('affectedBusinessDate' in doc) doc.affectedBusinessDate = null;
  doc.recurringSchedule = scheduleEveryDay(options);
  await doc.save();
  return doc;
};

const addBusinessDays = (dateString, days) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const dateInTimeZone = (instant, timeZone) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const emergencyDateFrom = (value) => {
  const raw =
    value?.emergencyClosureDate ?? value?.affectedBusinessDate ?? null;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return typeof raw === 'string' ? raw.slice(0, 10) : raw;
};

const waitFor = async (
  read,
  predicate,
  { timeoutMs = 1000, intervalMs = 20 } = {},
) => {
  const started = Date.now();
  let value;
  while (Date.now() - started < timeoutMs) {
    value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return value;
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

const reserveAndPersist = async (
  date,
  time,
  status = 'pending_confirmation',
) => {
  const reservation = await reserveBookingSlot(date, time);
  if (!reservation.ok) return reservation;
  const order = await createOccupyingOrder({ date, time, status });
  return { ...reservation, order };
};

const counterAt = (date, time) =>
  BookingSlotCounter.findOne({ date, time }).lean();

const tokenFor = (user) =>
  jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      email: user.email,
      name: user.name,
      authVersion: user.authVersion || 0,
      ...(user.role === 'customer'
        ? { otpVerified: true }
        : { authLevel: STAFF_2FA_AUTH_LEVEL }),
    },
    config.jwtSecret,
    { expiresIn: '1h' },
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
    email: `customer-${(sequence += 1)}@example.test`,
    role: 'customer',
    isVerified: true,
    status: 'active',
    isActive: true,
  });
  const administrator = await User.create({
    name: 'Availability Administrator',
    email: `admin-${(sequence += 1)}@example.test`,
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

const seedStaffActor = async (role) =>
  User.create({
    name: `${role} Availability User`,
    email: `${role}-${(sequence += 1)}@example.test`,
    role,
    status: 'active',
    isActive: true,
    isVerified: true,
  });

const bookingPayload = ({
  vehicle,
  service,
  date = MONDAY,
  time = '8:00 AM',
}) => ({
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
    availabilityRouter,
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
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('each generated appointment time has capacity one and daily availability counts open times', async () => {
  await setMondayAvailability({ capacity: 3 });

  const emptyDay = await getSlotsForDate(MONDAY);
  assert.equal(emptyDay.slots.length, 3);
  assert.equal(emptyDay.dailyCapacity, 3);
  assert.equal(emptyDay.availableSlots, 3);
  assert.deepEqual(
    emptyDay.slots.map(({ capacity, booked, available, status }) => ({
      capacity,
      booked,
      available,
      status,
    })),
    Array.from({ length: 3 }, () => ({
      capacity: 1,
      booked: 0,
      available: 1,
      status: 'AVAILABLE',
    })),
  );

  assert.equal((await reserveAndPersist(MONDAY, '08:00')).ok, true);
  const duplicate = await reserveBookingSlot(MONDAY, '8:00 AM');
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.errorCode, 'SLOT_FULL');
  assert.match(duplicate.message, /already been booked/i);
  assert.equal((await reserveAndPersist(MONDAY, '09:00')).ok, true);

  const day = await getSlotsForDate(MONDAY);
  assert.equal(day.bookedSlots, 2);
  assert.equal(day.availableSlots, 1);
  assert.equal(day.slots.find((slot) => slot.time === '08:00').status, 'FULL');
  assert.equal(day.slots.find((slot) => slot.time === '09:00').status, 'FULL');
  assert.equal(
    day.slots.find((slot) => slot.time === '10:00').status,
    'AVAILABLE',
  );
});

test('operating hours generate every complete hourly start independent of daily capacity', async () => {
  assert.deepEqual(
    generateTimeSlots({ open: true, from: '08:00', to: '16:00', slots: 5 }),
    ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
  );
  assert.deepEqual(
    generateTimeSlots({ open: true, from: '09:00', to: '18:00', slots: 5 }),
    ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
  );
  assert.deepEqual(generateTimeSlots({ open: true, from: '08:30', to: '09:29', slots: 1 }), []);
  assert.deepEqual(generateTimeSlots({ open: false, from: '08:00', to: '16:00', slots: 5 }), []);
  assert.deepEqual(generateTimeSlots({ open: true, from: 'bad', to: '16:00', slots: 5 }), []);
});

test('five-seat daily capacity blocks all remaining empty times in an eight-time window', async () => {
  await setMondayAvailability({ capacity: 5, to: '16:00' });
  const initial = await getSlotsForDate(MONDAY);
  assert.equal(initial.totalSlots, 8);
  assert.equal(initial.dailyCapacity, 5);
  assert.equal(initial.availableSlots, 5);
  assert.equal(initial.slots.length, 8);

  for (const time of ['08:00', '09:00', '10:00', '11:00', '12:00']) {
    assert.equal((await reserveAndPersist(MONDAY, time)).ok, true);
  }

  const full = await getSlotsForDate(MONDAY);
  assert.equal(full.bookedCount, 5);
  assert.equal(full.availableSlots, 0);
  assert.equal(full.status, 'FULL');
  for (const time of ['13:00', '14:00', '15:00']) {
    const slot = full.slots.find((row) => row.time === time);
    assert.equal(slot.booked, 0);
    assert.equal(slot.available, 0);
    assert.equal(slot.status, 'FULL');
    assert.equal(slot.blockedByDailyCapacity, true);
  }

  const sixth = await reserveBookingSlot(MONDAY, '13:00');
  assert.equal(sixth.ok, false);
  assert.equal(sixth.errorCode, 'DATE_FULL');
});

test('parallel different-time reservations cannot exceed the daily cap', async () => {
  await setMondayAvailability({ capacity: 2, to: '16:00' });
  const attempts = await Promise.all(
    ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00'].map((time) =>
      reserveBookingSlot(MONDAY, time)),
  );
  assert.equal(attempts.filter((attempt) => attempt.ok).length, 2);
  assert.equal(
    attempts.filter((attempt) => attempt.errorCode === 'DATE_FULL').length,
    4,
  );
});

test('same-date rescheduling transfers a time without consuming another daily seat', async () => {
  await setMondayAvailability({ capacity: 2, to: '12:00' });
  await reserveAndPersist(MONDAY, '08:00');
  const moving = await reserveAndPersist(MONDAY, '09:00');
  const before = captureOrderSlotOccupancy(moving.order);
  moving.order.bookingTime = '10:00';
  await saveOrderWithSlotTransition(moving.order, before);

  const day = await getSlotsForDate(MONDAY);
  assert.equal(day.bookedCount, 2);
  assert.equal(day.status, 'FULL');
  assert.equal(day.slots.find((row) => row.time === '10:00').booked, 1);
  assert.equal(day.slots.find((row) => row.time === '09:00').booked, 0);
  assert.equal(day.slots.find((row) => row.time === '09:00').blockedByDailyCapacity, true);
});

test('cross-date rescheduling acquires the target day and releases the source day', async () => {
  const doc = await ShopAvailability.getSingleton();
  doc.recurringSchedule = buildDefaultRecurringSchedule().map((row) => ({
    ...row,
    open: row.dow === 1 || row.dow === 2,
    from: row.dow === 1 || row.dow === 2 ? '08:00' : row.from,
    to: row.dow === 1 || row.dow === 2 ? '10:00' : row.to,
    slots: row.dow === 1 || row.dow === 2 ? 1 : row.slots,
  }));
  await doc.save();

  const moving = await reserveAndPersist(MONDAY, '08:00');
  const before = captureOrderSlotOccupancy(moving.order);
  moving.order.bookingDate = TUESDAY;
  moving.order.bookingTime = '09:00';
  await saveOrderWithSlotTransition(moving.order, before);

  const monday = await getSlotsForDate(MONDAY);
  const tuesday = await getSlotsForDate(TUESDAY);
  assert.equal(monday.bookedCount, 0);
  assert.equal(monday.availableSlots, 1);
  assert.equal(tuesday.bookedCount, 1);
  assert.equal(tuesday.availableSlots, 0);
  assert.equal(tuesday.slots.find((row) => row.time === '09:00').booked, 1);
});

test('admin and customer APIs stay synchronized through booking, conflict, and cancellation release', async () => {
  await setMondayAvailability({ capacity: 10, to: '18:00' });
  const { customer, vehicle, service } = await seedBookingActors();
  const headers = { Authorization: `Bearer ${tokenFor(customer)}` };
  const createAt = (time) =>
    requestJson('/api/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(bookingPayload({ vehicle, service, time })),
    });
  const readAdminDay = () =>
    requestJson(`/api/slots?date=${MONDAY}`, { headers });
  const readCustomerDay = () =>
    requestJson(`/api/orders/available-slots?date=${MONDAY}`, { headers });
  const readRangeDay = async () => {
    const result = await requestJson(`/api/slots/range?start=${MONDAY}&end=${MONDAY}`, { headers });
    return { ...result, day: result.body.data[0] };
  };

  const initialAdmin = await readAdminDay();
  const initialCustomer = await readCustomerDay();
  const initialRange = await readRangeDay();
  assert.equal(initialAdmin.body.availableSlots, 10);
  assert.equal(initialCustomer.body.remaining, 10);
  assert.equal(initialAdmin.body.totalSlots, 10);
  assert.equal(initialCustomer.body.totalSlots, 10);
  assert.equal(initialRange.day.totalSlots, 10);
  assert.equal(initialRange.day.availableSlots, 10);
  assert.equal(initialRange.day.dailyCapacity, 10);
  assert.equal(
    initialCustomer.body.slots.filter((slot) => slot.status === 'AVAILABLE')
      .length,
    10,
  );

  const eight = await createAt('8:00 AM');
  assert.equal(eight.response.status, 201);
  const afterEightAdmin = await readAdminDay();
  const afterEightCustomer = await readCustomerDay();
  const afterEightRange = await readRangeDay();
  assert.equal(afterEightAdmin.body.availableSlots, 9);
  assert.equal(afterEightCustomer.body.remaining, 9);
  assert.equal(afterEightRange.day.availableSlots, 9);
  assert.equal(afterEightRange.day.bookedSlots, 1);
  assert.equal(
    afterEightAdmin.body.slots.find((slot) => slot.time === '08:00').status,
    'FULL',
  );
  assert.equal(
    afterEightCustomer.body.slots.find((slot) => slot.time === '08:00')
      .available,
    0,
  );

  const duplicateEight = await createAt('8:00 AM');
  assert.equal(duplicateEight.response.status, 409);
  assert.match(duplicateEight.body.message, /already been booked/i);

  const nine = await createAt('9:00 AM');
  assert.equal(nine.response.status, 201);
  assert.equal((await readAdminDay()).body.availableSlots, 8);
  assert.equal((await readCustomerDay()).body.remaining, 8);

  const eightId = eight.body.data.id || eight.body.data._id;
  const cancelled = await requestJson(`/api/orders/${eightId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      status: 'cancelled',
      cancellationReason: 'Availability release test',
    }),
  });
  assert.equal(cancelled.response.status, 200);

  const releasedAdmin = await readAdminDay();
  const releasedCustomer = await readCustomerDay();
  assert.equal(releasedAdmin.body.availableSlots, 9);
  assert.equal(releasedCustomer.body.remaining, 9);
  assert.equal(
    releasedAdmin.body.slots.find((slot) => slot.time === '08:00').status,
    'AVAILABLE',
  );
  assert.equal(
    releasedAdmin.body.slots.find((slot) => slot.time === '09:00').status,
    'FULL',
  );
});

test('parallel attempts at one time admit exactly one while different times remain independent', async () => {
  await setMondayAvailability({ capacity: 3 });
  const sameTimeAttempts = await Promise.all(
    Array.from({ length: 8 }, () => reserveBookingSlot(MONDAY, '08:00')),
  );
  assert.equal(sameTimeAttempts.filter((attempt) => attempt.ok).length, 1);
  assert.equal(sameTimeAttempts.filter((attempt) => !attempt.ok).length, 7);
  assert.equal((await counterAt(MONDAY, '08:00')).count, 1);

  assert.equal((await reserveBookingSlot(MONDAY, '09:00')).ok, true);
  assert.equal((await counterAt(MONDAY, '09:00')).count, 1);
});

test('a lifecycle re-entry cannot take a time held by another reservation', async () => {
  await setMondayAvailability({ capacity: 3 });
  const reactivated = await createOccupyingOrder({ status: 'rejected' });
  assert.equal((await reserveBookingSlot(MONDAY, '08:00')).ok, true);

  const before = captureOrderSlotOccupancy(reactivated);
  reactivated.status = 'pending_confirmation';
  await assert.rejects(
    () => saveOrderWithSlotTransition(reactivated, before),
    /already been booked/i,
  );
  assert.equal(
    (await Order.findById(reactivated._id).lean()).status,
    'rejected',
  );
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
    },
  );

  assert.equal((await Order.findById(rejected._id).lean()).status, 'rejected');
  assert.equal((await counterAt(MONDAY, '08:00')).count, 1);
});

test('cancellation and deletion release only the exact occupied time', async () => {
  await setMondayAvailability({ capacity: 3 });
  const deletingCustomer = new mongoose.Types.ObjectId();
  const cancelled = await createOccupyingOrder({ customer: deletingCustomer });
  await BookingSlotCounter.create({ date: MONDAY, time: '08:00', count: 1 });
  assert.equal((await reserveAndPersist(MONDAY, '09:00')).ok, true);

  const beforeCancellation = captureOrderSlotOccupancy(cancelled);
  cancelled.status = 'cancelled';
  await saveOrderWithSlotTransition(cancelled, beforeCancellation);
  assert.equal((await counterAt(MONDAY, '08:00')).count, 0);
  assert.equal((await counterAt(MONDAY, '09:00')).count, 1);

  const afterCancellation = await getSlotsForDate(MONDAY);
  assert.equal(afterCancellation.availableSlots, 2);
  assert.equal(
    afterCancellation.slots.find((slot) => slot.time === '08:00').status,
    'AVAILABLE',
  );

  const deletion = await deleteOrdersAndReleaseSlotCounters({
    customer: deletingCustomer,
  });
  assert.equal(deletion.deletedCount, 1);
  assert.equal((await counterAt(MONDAY, '09:00')).count, 1);
});

test('reducing operating hours preserves an out-of-schedule booking without reopening it', async () => {
  await setMondayAvailability({ capacity: 3 });
  await reserveAndPersist(MONDAY, '10:00');

  await setMondayAvailability({ capacity: 2, to: '10:00' });

  const day = await getSlotsForDate(MONDAY);
  const ten = day.slots.find((slot) => slot.time === '10:00');
  assert.equal(ten.outOfSchedule, true);
  assert.equal(ten.status, 'OVER_CAPACITY');
  assert.equal(ten.capacity, 0);

  const [rangeDay] = await getSlotsForRange(MONDAY, MONDAY);
  assert.equal(rangeDay.bookedSlots, 1);
  assert.equal(rangeDay.dailyCapacity, 2);
  assert.equal(rangeDay.overCapacitySlots, 1);
  assert.equal(rangeDay.overCapacityBy, 1);
  assert.equal(rangeDay.status, 'OVER_CAPACITY');

  const extra = await reserveBookingSlot(MONDAY, '10:00');
  assert.equal(extra.ok, false);
  assert.equal(extra.errorCode, 'SLOT_FULL');
});

test('closed days, scheduled closures, outside-hours times, and nonexistent bands are rejected', async () => {
  await setMondayAvailability({ capacity: 2 });

  assert.equal(
    (await validateSlotAvailability(MONDAY, null)).errorCode,
    'INVALID_SLOT',
  );
  assert.equal(
    (await validateSlotAvailability(null, '08:00')).errorCode,
    'INVALID_SLOT',
  );

  const recurringClosed = await reserveBookingSlot(SATURDAY, '08:00');
  assert.equal(recurringClosed.ok, false);
  assert.equal(recurringClosed.errorCode, 'CLOSED_BY_RECURRING_DAY');
  const closedDay = await getSlotsForDate(SATURDAY);
  assert.equal(closedDay.isClosed, true);
  assert.equal(closedDay.dailyCapacity, 0);
  const [closedRangeDay] = await getSlotsForRange(SATURDAY, SATURDAY);
  assert.equal(closedRangeDay.status, 'CLOSED');
  assert.equal(closedRangeDay.dailyCapacity, 0);
  assert.equal(closedRangeDay.availableSlots, 0);

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
  await setMondayAvailability({ capacity: 15, to: '23:00' });
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
  const excluded = [
    'ready_for_payment',
    'completed',
    'paid',
    'released',
    'rejected',
    'cancelled',
  ];

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
  await createOccupyingOrder({
    status: 'pending_confirmation',
    archived: true,
  });

  const snapshot = await getDateAvailabilitySnapshot(MONDAY);
  const eight = snapshot.slots.find((slot) => slot.time === '08:00');
  assert.equal(eight.booked, consuming.length);
  assert.deepEqual(SLOT_CONSUMING_STATUSES, consuming);
  for (const status of consuming)
    assert.equal(isSlotConsumingStatus(status), true);
  for (const status of excluded)
    assert.equal(isSlotConsumingStatus(status), false);

  const range = await getSlotsForRange(MONDAY, MONDAY);
  assert.equal(range[0].bookedSlots, consuming.length);
  assert.equal(range[0].overCapacitySlots, 1);
  assert.equal(range[0].pendingCount, 1);
});

test('legacy human and ISO date strings remain countable while new writes are canonical', async () => {
  await setMondayAvailability({ capacity: 10 });
  await createOccupyingOrder({ date: 'Aug 17, 2099', time: '8:00 AM' });
  await createOccupyingOrder({ date: 'August 17, 2099', time: '08:00' });
  await createOccupyingOrder({
    date: '2099-08-17T00:00:00.000Z',
    time: '08:00',
  });

  const slot = (await getSlotsForDate(MONDAY)).slots.find(
    (row) => row.time === '08:00',
  );
  assert.equal(slot.booked, 3);
});

test('Admin schedule writes reject fractional capacity and legacy slot settings update ShopAvailability', async () => {
  const { administrator } = await seedBookingActors();
  await setMondayAvailability({ capacity: 2, to: '12:00' });
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
  assert.equal(
    aliasUpdate.body.data.openingHours.monday.dailyAppointmentCapacity,
    4,
  );

  const persisted = await ShopAvailability.findOne({
    singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
  }).lean();
  assert.equal(
    persisted.recurringSchedule.find((row) => row.dow === 1).slots,
    4,
  );
  assert.equal(
    validateRecurringScheduleInput(invalidSchedule).error.includes('integer'),
    true,
  );
});

test('open-day validation enforces valid one-hour windows and bounded whole-number capacity', () => {
  const validateMonday = (patch) => {
    const schedule = scheduleWithMonday({ capacity: 2 });
    Object.assign(schedule.find((row) => row.dow === 1), patch);
    return validateRecurringScheduleInput(schedule);
  };

  assert.match(validateMonday({ from: 'bad' }).error, /invalid "from"/i);
  assert.match(validateMonday({ from: '10:00', to: '09:00' }).error, /earlier than/i);
  assert.match(validateMonday({ from: '08:30', to: '09:00', slots: 1 }).error, /complete 60-minute/i);
  assert.match(validateMonday({ from: '08:00', to: '10:00', slots: 3 }).error, /cannot exceed 2/i);
  assert.match(validateMonday({ slots: 0 }).error, /at least one daily appointment/i);
  assert.match(validateMonday({ slots: 1.5 }).error, /integer/i);

  const closed = validateMonday({ open: false, from: '08:00', to: '08:00', slots: 99 });
  assert.equal(closed.error, undefined);
  assert.equal(closed.schedule.find((row) => row.dow === 1).slots, 99);
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

  const resolved = await Promise.all(
    Array.from({ length: 8 }, () => ShopAvailability.getSingleton()),
  );
  assert.equal(new Set(resolved.map((doc) => doc._id.toString())).size, 1);
  assert.equal(resolved[0]._id.toString(), newerId.toString());
  assert.equal(
    resolved[0].recurringSchedule.find((row) => row.dow === 1).slots,
    7,
  );
  assert.equal(
    await ShopAvailability.countDocuments(),
    2,
    'legacy rows are preserved',
  );
  assert.equal(
    await ShopAvailability.countDocuments({
      singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
    }),
    1,
  );
});

test('an incomplete persisted recurring schedule fails closed for missing weekdays', async () => {
  await ShopAvailability.collection.insertOne({
    singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
    emergencyClosed: false,
    recurringSchedule: [
      { dow: 1, open: true, from: '08:00', to: '11:00', slots: 2 },
    ],
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
  assert.equal(
    historical.bookedSlots,
    1,
    'historical occupancy remains visible to calendar reads',
  );
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
    slots: row.dow === todayDow ? 24 : 0,
  }));
  await doc.save();

  const elapsedTime = `${clock.time.slice(0, 2)}:00`;
  const elapsed = await reserveBookingSlot(clock.date, elapsedTime);
  assert.equal(elapsed.ok, false);
  assert.equal(elapsed.errorCode, 'TIME_IN_PAST');
  const snapshot = await getDateAvailabilitySnapshot(clock.date);
  assert.equal(
    snapshot.slots.find((row) => row.time === elapsedTime).status,
    'ELAPSED',
  );
});

test('only customers create appointments while staff walk-ins and rescheduling remain server-enforced', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, administrator, vehicle, service } =
    await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const createAt = (time, date = MONDAY) =>
    requestJson('/api/orders', {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify(bookingPayload({ vehicle, service, date, time })),
    });

  const adminAppointmentAttempt = await requestJson('/api/orders', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      ...bookingPayload({ vehicle, service }),
      customer: customer._id.toString(),
    }),
  });
  assert.equal(adminAppointmentAttempt.response.status, 403);
  assert.equal(
    adminAppointmentAttempt.body.errorCode,
    'APPOINTMENT_CUSTOMER_ONLY',
  );
  assert.equal(await Order.countDocuments(), 0);

  const humanDateCreate = await createAt('8:00 AM', 'Aug 17, 2099');
  assert.equal(humanDateCreate.response.status, 201);
  const canonicalCreated = await Order.findById(
    humanDateCreate.body.data.id || humanDateCreate.body.data._id,
  ).lean();
  assert.equal(canonicalCreated.bookingDate, MONDAY);
  assert.equal(canonicalCreated.bookingTime, '08:00');
  const rejectedDuplicate = await createAt('8:00 AM');
  assert.equal(rejectedDuplicate.response.status, 409);
  assert.equal(rejectedDuplicate.body.errorCode, 'SLOT_FULL');
  assert.match(rejectedDuplicate.body.message, /already been booked/i);

  const nine = await createAt('9:00 AM');
  assert.equal(nine.response.status, 201);
  const nineId = nine.body.data.id || nine.body.data._id;

  const fullDay = await getSlotsForDate(MONDAY);
  assert.equal(fullDay.availableSlots, 0);
  assert.equal(fullDay.status, 'FULL');

  const sameDateReschedule = await requestJson(
    `/api/orders/${nineId}/reschedule`,
    {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ newDate: MONDAY, newTime: '8:00 AM' }),
    },
  );
  assert.equal(sameDateReschedule.response.status, 409);
  assert.match(sameDateReschedule.body.message, /already been booked/i);
  const canonicalRescheduled = await Order.findById(nineId).lean();
  assert.equal(canonicalRescheduled.bookingDate, MONDAY);
  assert.equal(canonicalRescheduled.bookingTime, '09:00');
  assert.equal((await createAt('8:00 AM')).response.status, 409);

  await setMondayAvailability({ capacity: 3 });
  const genericUpdate = await requestJson(`/api/orders/${nineId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      bookingDate: 'Aug 17, 2099',
      bookingTime: '10:00 AM',
    }),
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
  const walkIn = await Order.findById(
    authorizedWalkIn.body.data.id || authorizedWalkIn.body.data._id,
  ).lean();
  assert.equal(walkIn.isWalkIn, true);
  assert.equal(walkIn.bookingDate, undefined);
  assert.equal(walkIn.bookingTime, undefined);

  const staffWalkInConversionAttempt = await requestJson(
    `/api/orders/${walkIn._id}`,
    {
      method: 'PUT',
      headers: adminHeaders,
      body: JSON.stringify({ bookingDate: MONDAY, bookingTime: '10:00 AM' }),
    },
  );
  assert.equal(staffWalkInConversionAttempt.response.status, 403);
  assert.equal(
    staffWalkInConversionAttempt.body.errorCode,
    'APPOINTMENT_CUSTOMER_ONLY',
  );

  const staffWalkInRescheduleAttempt = await requestJson(
    `/api/orders/${walkIn._id}/reschedule`,
    {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ newDate: MONDAY, newTime: '10:00 AM' }),
    },
  );
  assert.equal(staffWalkInRescheduleAttempt.response.status, 403);
  assert.equal(
    staffWalkInRescheduleAttempt.body.errorCode,
    'APPOINTMENT_CUSTOMER_ONLY',
  );
});

test('Sales can create exactly one scheduled booking from a verified Concierge handoff', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, vehicle, service } = await seedBookingActors();
  const sales = await seedStaffActor('sales');
  const conversationId = 'concierge-booking-idempotency';
  await ChatConversation.create({
    conversationId,
    userId: customer._id,
    customerName: customer.name,
    status: 'in_conversation',
    handedOffAt: new Date(),
    assignedSalesId: sales._id,
    assignedSalesName: sales.name,
  });
  const headers = { Authorization: `Bearer ${tokenFor(sales)}` };
  const payload = {
    ...bookingPayload({ vehicle, service, time: '8:00 AM' }),
    customer: customer._id.toString(),
    sourceConversationId: conversationId,
    vehicleType: vehicle.vehicleType || 'sedan',
  };

  const created = await requestJson('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(created.response.status, 201);
  const retried = await requestJson('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  assert.equal(retried.response.status, 200);
  assert.equal(
    retried.body.data.id || retried.body.data._id,
    created.body.data.id || created.body.data._id,
  );
  assert.equal(
    await Order.countDocuments({ sourceConversationId: conversationId }),
    1,
  );
  assert.equal((await counterAt(MONDAY, '08:00')).count, 1);
});

test('parallel create requests for one time admit exactly one order', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, vehicle, service } = await seedBookingActors();
  const headers = { Authorization: `Bearer ${tokenFor(customer)}` };
  const attempts = await Promise.all(
    Array.from({ length: 8 }, () =>
      requestJson('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify(
          bookingPayload({ vehicle, service, time: '8:00 AM' }),
        ),
      }),
    ),
  );

  assert.equal(
    attempts.filter(({ response }) => response.status === 201).length,
    1,
  );
  assert.equal(
    attempts.filter(({ response }) => response.status === 409).length,
    7,
  );
  const persisted = await Order.find({
    bookingDate: MONDAY,
    bookingTime: '08:00',
    status: 'pending_confirmation',
    archived: { $ne: true },
  }).lean();
  assert.equal(persisted.length, 1);
  assert.equal(new Set(persisted.map((row) => row.orderNumber)).size, 1);
  const counter = await counterAt(MONDAY, '08:00');
  assert.equal(counter.count, persisted.length);
});

test('duplicate reschedules and rejected-proof retries are counter-idempotent', async () => {
  await setMondayAvailability({ capacity: 4 });
  const { customer, administrator, vehicle, service } =
    await seedBookingActors();
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
    Array.from({ length: 2 }, () =>
      requestJson(`/api/orders/${orderId}/reschedule`, {
        method: 'PATCH',
        headers: adminHeaders,
        body: JSON.stringify({ newDate: MONDAY, newTime: '9:00 AM' }),
      }),
    ),
  );
  const rescheduleStatuses = reschedules.map(({ response }) => response.status);
  assert.equal(
    rescheduleStatuses.filter((status) => status === 200).length >= 1,
    true,
  );
  assert.equal(
    rescheduleStatuses.every((status) => status === 200 || status === 409),
    true,
  );
  assert.equal((await counterAt(MONDAY, '08:00')).count, 0);
  assert.equal((await counterAt(MONDAY, '09:00')).count, 1);

  const rejected = await requestJson(`/api/orders/${orderId}/reject`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ reason: 'Retry test' }),
  });
  assert.equal(rejected.response.status, 200);
  assert.equal((await counterAt(MONDAY, '09:00')).count, 0);
  const rejectedPayment = await Payment.findOne({ order: orderId, transactionType: 'reservation_fee' }).lean();
  assert.equal(rejectedPayment.status, 'rejected');
  assert.equal(rejectedPayment.amountSubmitted, 500);
  assert.equal(rejectedPayment.amountVerified, 0);

  const retries = await Promise.all(
    Array.from({ length: 2 }, () =>
      requestJson(`/api/orders/${orderId}/payment-proof`, {
        method: 'POST',
        headers: customerHeaders,
        body: JSON.stringify({
          paymentProofUrl: 'https://example.test/retry-proof.jpg',
        }),
      }),
    ),
  );
  const retryStatuses = retries.map(({ response }) => response.status);
  assert.equal(
    retryStatuses.filter((status) => status === 200).length >= 1,
    true,
  );
  assert.equal(
    retryStatuses.every((status) => status === 200 || status === 409),
    true,
  );
  const current = await Order.findById(orderId).lean();
  assert.equal(current.status, 'pending_confirmation');
  assert.equal(current.bookingDate, MONDAY);
  assert.equal(current.bookingTime, '09:00');
  const reservationPayments = await Payment.find({ order: orderId, transactionType: 'reservation_fee' }).lean();
  assert.equal(reservationPayments.length, 1);
  assert.equal(reservationPayments[0].status, 'pending');
  assert.equal(reservationPayments[0].amount, 500);
  assert.equal((await counterAt(MONDAY, '09:00')).count, 1);
});

test('archiving releases occupancy and unarchiving cannot bypass a newly full slot', async () => {
  await setMondayAvailability({ capacity: 1 });
  const { customer, administrator, vehicle, service } =
    await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const createAtEight = () =>
    requestJson('/api/orders', {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify(
        bookingPayload({ vehicle, service, time: '8:00 AM' }),
      ),
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
  assert.equal((await counterAt(MONDAY, '08:00')).count, 0);
  assert.equal((await createAtEight()).response.status, 201);

  const unarchive = await requestJson(`/api/orders/${firstId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({ archived: false }),
  });
  assert.equal(unarchive.response.status, 409);
  assert.equal(unarchive.body.errorCode, 'SLOT_FULL');
  assert.equal((await Order.findById(firstId).lean()).archived, true);
  assert.equal((await counterAt(MONDAY, '08:00')).count, 1);
});

test('lowering capacity does not block approval of an appointment that already occupies the slot', async () => {
  await setMondayAvailability({ capacity: 2 });
  const { customer, administrator, vehicle, service } =
    await seedBookingActors();
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const createAtEight = () =>
    requestJson('/api/orders', {
      method: 'POST',
      headers: customerHeaders,
      body: JSON.stringify(
        bookingPayload({ vehicle, service, time: '8:00 AM' }),
      ),
    });
  const first = await createAtEight();
  assert.equal(first.response.status, 201);

  await setMondayAvailability({ capacity: 1 });
  const firstId = first.body.data.id || first.body.data._id;
  const incompleteApproval = await requestJson(`/api/orders/${firstId}/approve`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ verificationChecklist: { amount: true } }),
  });
  assert.equal(incompleteApproval.response.status, 400);
  const approved = await requestJson(`/api/orders/${firstId}/approve`, {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({
      verificationChecklist: {
        amount: true,
        identity: true,
        timestamp: true,
        reference: true,
      },
    }),
  });
  assert.equal(approved.response.status, 200);
  const [approvedOrder, approvedPayment] = await Promise.all([
    Order.findById(firstId).lean(),
    Payment.findOne({ order: firstId, transactionType: 'reservation_fee' }).lean(),
  ]);
  assert.equal(approvedOrder.status, 'confirmed');
  assert.equal(approvedOrder.serviceTrackingStage, 'confirmed');
  assert.equal(approvedOrder.downPaymentAmount, 500);
  assert.equal(approvedPayment.status, 'succeeded');
  assert.equal(approvedPayment.amountVerified, 500);
  assert.equal(approvedPayment.metadata.remainingBalance, 500);

  const slot = (await getSlotsForDate(MONDAY)).slots.find(
    (row) => row.time === '08:00',
  );
  assert.equal(slot.booked, 1);
  assert.equal(slot.capacity, 1);
  assert.equal(slot.status, 'FULL');
});

test('capacity reductions preserve over-capacity bookings and later increases reopen admission', async () => {
  await setMondayAvailability({ capacity: 3, to: '12:00' });
  for (const time of ['08:00', '09:00', '10:00']) {
    assert.equal((await reserveAndPersist(MONDAY, time)).ok, true);
  }

  await setMondayAvailability({ capacity: 1, to: '12:00' });
  const reduced = await getSlotsForDate(MONDAY);
  assert.equal(reduced.bookedCount, 3);
  assert.equal(reduced.dailyCapacity, 1);
  assert.equal(reduced.overCapacityBy, 2);
  assert.equal(reduced.status, 'OVER_CAPACITY');
  assert.equal(await Order.countDocuments(), 3);
  const blocked = await reserveBookingSlot(MONDAY, '11:00');
  assert.equal(blocked.ok, false);
  assert.equal(blocked.errorCode, 'DATE_FULL');

  await setMondayAvailability({ capacity: 4, to: '12:00' });
  assert.equal((await reserveAndPersist(MONDAY, '11:00')).ok, true);
});

test('only an authorized admin can persist todays emergency closure and the action is audited', async () => {
  await setEveryDayAvailability();
  const { customer, administrator } = await seedBookingActors();
  const sales = await seedStaffActor('sales');
  const businessDate = getShopLocalClock().date;
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const salesHeaders = { Authorization: `Bearer ${tokenFor(sales)}` };

  const malformed = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: 'yes' }),
  });
  assert.equal(malformed.response.status, 400);

  const customerDenied = await requestJson(
    '/api/admin/availability/emergency',
    {
      method: 'PATCH',
      headers: customerHeaders,
      body: JSON.stringify({ closed: true }),
    },
  );
  assert.equal(customerDenied.response.status, 403);

  const denied = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: salesHeaders,
    body: JSON.stringify({ closed: true }),
  });
  assert.equal(denied.response.status, 403);
  const untouched = await ShopAvailability.getSingleton();
  assert.equal(untouched.emergencyClosed, false);
  assert.equal(emergencyDateFrom(untouched), null);

  const enabled = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.body.emergencyClosed, true);
  assert.equal(emergencyDateFrom(enabled.body), businessDate);
  assert.equal(enabled.body.affectedBusinessDate, businessDate);
  assert.equal(enabled.body.businessDate, businessDate);
  assert.equal(enabled.body.timeZone, SHOP_TIME_ZONE);
  assert.equal(enabled.body.businessTimeZone, SHOP_TIME_ZONE);

  const persisted = await ShopAvailability.findOne({
    singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
  }).lean();
  assert.equal(persisted.emergencyClosed, true);
  assert.equal(emergencyDateFrom(persisted), businessDate);

  const reread = await requestJson('/api/admin/availability/emergency', {
    headers: adminHeaders,
  });
  assert.equal(reread.response.status, 200);
  assert.equal(reread.body.emergencyClosed, true);
  assert.equal(emergencyDateFrom(reread.body), businessDate);
  assert.equal(reread.body.businessDate, businessDate);
  assert.equal(reread.body.businessTimeZone, SHOP_TIME_ZONE);

  const auditRows = await waitFor(
    () => ActivityLog.find({ action: 'Emergency Closure Enabled' }).lean(),
    (rows) => rows.length === 1,
  );
  assert.equal(auditRows.length, 1);
  assert.equal(auditRows[0].type, 'settings');
  assert.equal(auditRows[0].module, 'Settings');
  assert.equal(String(auditRows[0].userId), String(administrator._id));
  assert.equal(auditRows[0].userRole, 'administrator');
  assert.equal(
    auditRows[0].metadata?.affectedBusinessDate ||
      auditRows[0].metadata?.businessDate,
    businessDate,
  );
});

test('all availability reads agree on todays emergency closure while future dates remain normal', async () => {
  await setEveryDayAvailability();
  const { customer, administrator } = await seedBookingActors();
  const today = getShopLocalClock().date;
  const tomorrow = addBusinessDays(today, 1);
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const enabled = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  assert.equal(enabled.response.status, 200);

  const [single, range, customerDay, futureDay] = await Promise.all([
    requestJson(`/api/slots?date=${today}`, { headers: customerHeaders }),
    requestJson(`/api/slots/range?start=${today}&end=${tomorrow}`, {
      headers: customerHeaders,
    }),
    requestJson(`/api/orders/available-slots?date=${today}`, {
      headers: customerHeaders,
    }),
    requestJson(`/api/slots?date=${tomorrow}`, { headers: customerHeaders }),
  ]);
  for (const result of [single, range, customerDay, futureDay]) {
    assert.equal(result.response.status, 200);
  }

  const rangeToday = range.body.data.find((row) => row.date === today);
  const rangeTomorrow = range.body.data.find((row) => row.date === tomorrow);
  assert.equal(range.body.businessDate, today);
  assert.equal(range.body.businessTimeZone, SHOP_TIME_ZONE);
  for (const payload of [single.body, rangeToday, customerDay.body]) {
    assert.equal(payload.emergencyClosed, true);
    assert.equal(payload.closureType, 'emergency');
    assert.match(String(payload.closureReason), /emergency/i);
    assert.equal(payload.businessDate, today);
    assert.equal(payload.businessTimeZone, SHOP_TIME_ZONE);
  }

  assert.equal(single.body.isClosed, true);
  assert.equal(single.body.closedReason, 'EMERGENCY_CLOSED');
  assert.equal(single.body.availableSlots, 0);
  assert.equal(single.body.remainingSlots, 0);
  assert.equal(
    single.body.slots.some((slot) => slot.available > 0),
    false,
  );
  assert.equal(rangeToday.isClosed, true);
  assert.equal(rangeToday.closedReason, 'emergency');
  assert.equal(rangeToday.availableSlots, 0);
  assert.equal(customerDay.body.unavailable, true);
  assert.equal(customerDay.body.errorCode, 'EMERGENCY_CLOSED');
  assert.equal(customerDay.body.remaining, 0);
  assert.equal(
    customerDay.body.slots.some((slot) => slot.available > 0),
    false,
  );

  for (const payload of [futureDay.body, rangeTomorrow]) {
    assert.equal(payload.emergencyClosed, false);
    assert.equal(payload.closureType, null);
    assert.equal(payload.closureReason, null);
    assert.equal(payload.isClosed, false);
    assert.equal(payload.availableSlots > 0, true);
  }
});

test('a customer stale-page create is rejected after emergency closure without creating an order or slot hold', async () => {
  await setEveryDayAvailability();
  const { customer, administrator, vehicle, service } =
    await seedBookingActors();
  const today = getShopLocalClock().date;
  const customerHeaders = { Authorization: `Bearer ${tokenFor(customer)}` };
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };

  const staleRead = await requestJson(
    `/api/orders/available-slots?date=${today}`,
    {
      headers: customerHeaders,
    },
  );
  assert.equal(staleRead.response.status, 200);
  assert.notEqual(staleRead.body.errorCode, 'EMERGENCY_CLOSED');

  const enabled = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  assert.equal(enabled.response.status, 200);

  const beforeCount = await Order.countDocuments({ customer: customer._id });
  const attempted = await requestJson('/api/orders', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify(
      bookingPayload({ vehicle, service, date: today, time: '8:00 AM' }),
    ),
  });
  assert.equal(attempted.response.status, 409);
  assert.equal(attempted.body.errorCode, 'EMERGENCY_CLOSED');
  assert.match(
    attempted.body.message,
    /temporarily closed.*emergency closure/i,
  );
  assert.equal(
    await Order.countDocuments({ customer: customer._id }),
    beforeCount,
  );
  assert.equal(await counterAt(today, '08:00'), null);
});

test('sales cannot move an existing appointment into an emergency-closed today through either update path', async () => {
  await setEveryDayAvailability();
  const { customer, administrator } = await seedBookingActors();
  const sales = await seedStaffActor('sales');
  const today = getShopLocalClock().date;
  const tomorrow = addBusinessDays(today, 1);
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const salesHeaders = { Authorization: `Bearer ${tokenFor(sales)}` };
  const order = await createOccupyingOrder({
    customer: customer._id,
    date: tomorrow,
    time: '08:00',
    status: 'confirmed',
  });
  await BookingSlotCounter.create({ date: tomorrow, time: '08:00', count: 1 });

  const enabled = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  assert.equal(enabled.response.status, 200);

  const attempted = await requestJson(`/api/orders/${order._id}/reschedule`, {
    method: 'PATCH',
    headers: salesHeaders,
    body: JSON.stringify({ newDate: today, newTime: '9:00 AM' }),
  });
  assert.equal(attempted.response.status, 409);
  assert.equal(attempted.body.errorCode, 'EMERGENCY_CLOSED');
  assert.match(
    attempted.body.message,
    /temporarily closed.*emergency closure/i,
  );

  const genericUpdateAttempt = await requestJson(`/api/orders/${order._id}`, {
    method: 'PUT',
    headers: salesHeaders,
    body: JSON.stringify({ bookingDate: today, bookingTime: '10:00 AM' }),
  });
  assert.equal(genericUpdateAttempt.response.status, 409);
  assert.equal(genericUpdateAttempt.body.errorCode, 'EMERGENCY_CLOSED');
  assert.match(
    genericUpdateAttempt.body.message,
    /temporarily closed.*emergency closure/i,
  );

  const unchanged = await Order.findById(order._id).lean();
  assert.equal(unchanged.bookingDate, tomorrow);
  assert.equal(unchanged.bookingTime, '08:00');
  assert.equal(unchanged.status, 'confirmed');
  assert.equal((await counterAt(tomorrow, '08:00')).count, 1);
  assert.equal(await counterAt(today, '09:00'), null);
  assert.equal(await counterAt(today, '10:00'), null);
});

test('emergency closure preserves existing appointments and reopening recomputes normal occupancy', async () => {
  await setEveryDayAvailability();
  const { customer, administrator } = await seedBookingActors();
  const today = getShopLocalClock().date;
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const existing = await createOccupyingOrder({
    customer: customer._id,
    date: today,
    time: '08:00',
    status: 'confirmed',
  });
  await BookingSlotCounter.create({ date: today, time: '08:00', count: 1 });
  const baseline = await getSlotsForDate(today);

  const enabled = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  assert.equal(enabled.response.status, 200);
  const closed = await getSlotsForDate(today);
  assert.equal(closed.isClosed, true);
  assert.equal(closed.emergencyClosed, true);
  assert.equal(closed.closureType, 'emergency');
  assert.equal(closed.bookedSlots, 1);
  const visibleExisting = closed.slots.find((slot) => slot.time === '08:00');
  assert.equal(visibleExisting.booked, 1);

  const preserved = await Order.findById(existing._id).lean();
  assert.equal(preserved.status, 'confirmed');
  assert.equal(preserved.bookingDate, today);
  assert.equal(preserved.bookingTime, '08:00');
  assert.equal((await counterAt(today, '08:00')).count, 1);

  const reopenedResponse = await requestJson(
    '/api/admin/availability/emergency',
    {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ closed: false }),
    },
  );
  assert.equal(reopenedResponse.response.status, 200);
  assert.equal(reopenedResponse.body.emergencyClosed, false);
  assert.equal(emergencyDateFrom(reopenedResponse.body), null);

  const reopened = await getSlotsForDate(today);
  const availabilityProjection = (day) => ({
    isClosed: day.isClosed,
    status: day.status,
    bookedSlots: day.bookedSlots,
    dailyCapacity: day.dailyCapacity,
    availableSlots: day.availableSlots,
    slots: day.slots.map((slot) => ({
      time: slot.time,
      capacity: slot.capacity,
      booked: slot.booked,
      available: slot.available,
      status: slot.status,
      outOfSchedule: slot.outOfSchedule === true,
    })),
  });
  assert.deepEqual(
    availabilityProjection(reopened),
    availabilityProjection(baseline),
  );
  assert.equal((await counterAt(today, '08:00')).count, 1);
  assert.equal((await Order.findById(existing._id).lean()).status, 'confirmed');

  const disabledAuditRows = await waitFor(
    () => ActivityLog.find({ action: 'Emergency Closure Disabled' }).lean(),
    (rows) => rows.length === 1,
  );
  assert.equal(disabledAuditRows.length, 1);
  assert.equal(String(disabledAuditRows[0].userId), String(administrator._id));
});

test('a scheduled closure still wins after emergency bookings are reopened', async () => {
  await setEveryDayAvailability();
  const { administrator } = await seedBookingActors();
  const today = getShopLocalClock().date;
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  await ScheduledClosure.create({
    fromDate: new Date(`${today}T00:00:00`),
    toDate: new Date(`${today}T23:59:59.999`),
    reason: 'Holiday',
    note: 'Emergency reopen priority test',
  });

  await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  const emergency = await getSlotsForDate(today);
  assert.equal(emergency.closureType, 'emergency');

  const reopened = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: false }),
  });
  assert.equal(reopened.response.status, 200);
  assert.equal(reopened.body.emergencyClosed, false);

  const stillClosed = await getSlotsForDate(today);
  assert.equal(stillClosed.isClosed, true);
  assert.equal(stillClosed.emergencyClosed, false);
  assert.equal(stillClosed.closedReason, 'CLOSED_BY_SCHEDULED_CLOSURE');
  assert.equal(stillClosed.closureType, 'scheduled');
  assert.match(String(stillClosed.closureReason), /Holiday/i);
});

test('a yesterday-scoped emergency state is inactive on the current business date', async () => {
  const doc = await setEveryDayAvailability();
  const { administrator } = await seedBookingActors();
  const today = getShopLocalClock().date;
  const yesterday = addBusinessDays(today, -1);
  const tomorrow = addBusinessDays(today, 1);
  doc.emergencyClosed = true;
  doc.emergencyClosureDate = yesterday;
  await doc.save();

  const persisted = await ShopAvailability.findById(doc._id).lean();
  assert.equal(
    persisted.emergencyClosed,
    true,
    'legacy mirror remains persisted',
  );
  assert.equal(emergencyDateFrom(persisted), yesterday);

  const [todayAvailability, futureAvailability] = await Promise.all([
    getSlotsForDate(today),
    getSlotsForDate(tomorrow),
  ]);
  for (const availability of [todayAvailability, futureAvailability]) {
    assert.equal(availability.isClosed, false);
    assert.equal(availability.emergencyClosed, false);
    assert.notEqual(availability.closureType, 'emergency');
  }

  const adminStatus = await requestJson('/api/admin/availability/emergency', {
    headers: { Authorization: `Bearer ${tokenFor(administrator)}` },
  });
  assert.equal(adminStatus.response.status, 200);
  assert.equal(adminStatus.body.emergencyClosed, false);
  assert.equal(emergencyDateFrom(adminStatus.body), yesterday);
  assert.equal(adminStatus.body.businessDate, today);
  assert.equal(adminStatus.body.businessTimeZone, SHOP_TIME_ZONE);
});

test('emergency closure uses the persisted business timezone instead of the server or browser calendar', async () => {
  await setEveryDayAvailability();
  const { administrator } = await seedBookingActors();
  const configuredTimeZone = 'Pacific/Pago_Pago';
  await Setting.create({ timezone: configuredTimeZone });
  const adminHeaders = { Authorization: `Bearer ${tokenFor(administrator)}` };
  const beforeRequest = new Date();

  const enabled = await requestJson('/api/admin/availability/emergency', {
    method: 'PATCH',
    headers: adminHeaders,
    body: JSON.stringify({ closed: true }),
  });
  const afterRequest = new Date();
  const validBusinessDates = new Set([
    dateInTimeZone(beforeRequest, configuredTimeZone),
    dateInTimeZone(afterRequest, configuredTimeZone),
  ]);

  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.body.emergencyClosed, true);
  assert.equal(enabled.body.timeZone, configuredTimeZone);
  assert.equal(enabled.body.businessTimeZone, configuredTimeZone);
  assert.equal(validBusinessDates.has(enabled.body.businessDate), true);
  assert.equal(emergencyDateFrom(enabled.body), enabled.body.businessDate);
  assert.equal(enabled.body.affectedBusinessDate, enabled.body.businessDate);

  const persisted = await ShopAvailability.findOne({
    singletonKey: SHOP_AVAILABILITY_SINGLETON_KEY,
  }).lean();
  assert.equal(emergencyDateFrom(persisted), enabled.body.businessDate);

  const reread = await requestJson('/api/admin/availability/emergency', {
    headers: adminHeaders,
  });
  assert.equal(reread.response.status, 200);
  assert.equal(reread.body.emergencyClosed, true);
  assert.equal(reread.body.businessDate, enabled.body.businessDate);
  assert.equal(reread.body.businessTimeZone, configuredTimeZone);

  const auditRows = await waitFor(
    () => ActivityLog.find({ action: 'Emergency Closure Enabled' }).lean(),
    (rows) => rows.length === 1,
  );
  assert.equal(auditRows.length, 1);
  assert.equal(
    auditRows[0].metadata?.affectedBusinessDate,
    enabled.body.businessDate,
  );
  assert.equal(auditRows[0].metadata?.businessTimeZone, configuredTimeZone);
});
