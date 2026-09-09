import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { default: Customer } = await import('../models/customer.model.js');
await import('../models/order.model.js');
await import('../models/store.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');
const {
  addVehicle,
  getMe,
  markMyGarageOnboardingSeen,
} = await import('../controllers/customer.controller.js');

let mongo;

function invoke(handler, { userId, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      user: { id: String(userId), role: 'customer' },
      body,
      query: {},
      params: {},
    };
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload });
        return this;
      },
    };
    Promise.resolve(handler(req, response, reject)).catch(reject);
  });
}

async function createCustomerUser(suffix) {
  return User.create({
    name: `Garage Customer ${suffix}`,
    email: `garage-${suffix}@example.com`,
    role: 'customer',
    status: 'active',
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('autospf-garage-onboarding-test'));
});

beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('new customers default to unseen and dismissal persists per account', async () => {
  const customerA = await createCustomerUser('a');
  const customerB = await createCustomerUser('b');

  const initial = await invoke(getMe, { userId: customerA._id });
  assert.equal(initial.status, 200);
  assert.equal(initial.body.data.garageOnboardingSeen, false);

  const dismissed = await invoke(markMyGarageOnboardingSeen, { userId: customerA._id });
  assert.equal(dismissed.status, 200);
  assert.equal(dismissed.body.data.garageOnboardingSeen, true);

  const cannotReset = await invoke(markMyGarageOnboardingSeen, {
    userId: customerA._id,
    body: { garageOnboardingSeen: false },
  });
  assert.equal(cannotReset.body.data.garageOnboardingSeen, true);

  const nextSession = await invoke(getMe, { userId: customerA._id });
  assert.equal(nextSession.body.data.garageOnboardingSeen, true);

  const persistedA = await Customer.findOne({ user: customerA._id }).lean();
  assert.equal(persistedA.garageOnboardingSeen, true);

  const untouchedB = await invoke(getMe, { userId: customerB._id });
  assert.equal(untouchedB.body.data.garageOnboardingSeen, false);
});

test('existing vehicles backfill onboarding as seen for legacy customer records', async () => {
  const user = await createCustomerUser('legacy');
  await Customer.create({ user: user._id });
  await Vehicle.create({
    customer: user._id,
    year: '2024',
    make: 'Bentley',
    model: 'Bentayga',
    color: 'Black',
    plateNumber: 'LEG2024',
  });

  const profile = await invoke(getMe, { userId: user._id });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.garageOnboardingSeen, true);

  const persisted = await Customer.findOne({ user: user._id }).lean();
  assert.equal(persisted.garageOnboardingSeen, true);
});

test('successfully adding the first vehicle marks onboarding as seen', async () => {
  const user = await createCustomerUser('first-vehicle');
  await Customer.create({ user: user._id });

  const result = await invoke(addVehicle, {
    userId: user._id,
    body: {
      year: '2025',
      make: 'Bentley',
      model: 'Bentayga',
      color: 'Black',
      plateNumber: 'NEW2025',
      vehicleType: 'SUV',
      transmission: 'Automatic',
      fuelType: 'Gasoline',
    },
  });

  assert.equal(result.status, 201);
  const persisted = await Customer.findOne({ user: user._id }).lean();
  assert.equal(persisted.garageOnboardingSeen, true);
  assert.equal(persisted.vehicles.length, 1);
});
