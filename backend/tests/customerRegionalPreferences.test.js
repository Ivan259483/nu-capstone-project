import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'customer_regional_preferences_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
const { config } = await import('../config/environment.js');
const { default: Customer } = await import('../models/customer.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: customerRoutes } = await import('../routes/customers.routes.js');
const { STAFF_2FA_AUTH_LEVEL } = await import('../constants/roles.js');
let mongo;
let server;
let baseUrl;
let customer;
let secondCustomer;
const empty = { language: null, region: null, timezone: null, dateFormat: null };

const token = (user) => jwt.sign({ id: String(user._id), role: user.role, clientType: user.role === 'customer' ? 'mobile' : 'web', otpVerified: true, authLevel: STAFF_2FA_AUTH_LEVEL }, config.jwtSecret, { expiresIn: '5m' });
async function request({ user = customer, body, auth = true } = {}) {
  const response = await fetch(`${baseUrl}/api/customers/me/regional-preferences`, {
    method: body === undefined ? 'GET' : 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-Client-Type': user.role === 'customer' ? 'mobile' : 'web', ...(auth ? { Authorization: `Bearer ${token(user)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('customer-regional-preferences-test'));
  const app = express(); app.use(express.json()); app.use('/api/customers', customerRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, message: error.message }));
  server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  customer = await User.create({ name: 'Regional Customer', email: 'regional@example.test', role: 'customer', isActive: true, status: 'active', isVerified: true });
  secondCustomer = await User.create({ name: 'Second Customer', email: 'second@example.test', role: 'customer', isActive: true, status: 'active', isVerified: true });
});
after(async () => { await new Promise((resolve) => server.close(resolve)); await mongoose.disconnect(); await mongo.stop(); });

test('regional reads leave missing customer preferences unset without creating records', async () => {
  const response = await request();
  assert.equal(response.status, 200); assert.deepEqual(response.body.data, empty);
  assert.equal(await Customer.countDocuments(), 0);
});
test('regional preferences persist with partial updates and remain isolated between accounts', async () => {
  const first = await request({ body: { language: 'Japanese', timezone: 'UTC' } });
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.data, { ...empty, language: 'Japanese', timezone: 'UTC' });
  const second = await request({ body: { region: 'Singapore', dateFormat: 'YYYY-MM-DD' } });
  assert.equal(second.status, 200);
  assert.deepEqual((await request()).body.data, { language: 'Japanese', timezone: 'UTC', region: 'Singapore', dateFormat: 'YYYY-MM-DD' });
  assert.deepEqual((await request({ user: secondCustomer })).body.data, empty);
  const saved = await Customer.findOne({ user: customer._id }).lean();
  assert.equal(saved.notificationPreferences.pushEnabled, true);
});
test('unknown fields and invalid regional values fail without partial writes', async () => {
  for (const body of [{}, [], { language: 'Spanish' }, { timezone: 'Invalid/Zone' }, { region: false }, { language: null }, { language: 'English', user: String(secondCustomer._id) }, { notificationPreferences: { pushEnabled: false } }]) {
    assert.equal((await request({ body })).status, 400);
  }
  assert.deepEqual((await request()).body.data, empty);
});
test('regional endpoints require authentication and customer role', async () => {
  assert.equal((await request({ auth: false })).status, 401);
  assert.equal((await request({ auth: false, body: { language: 'English' } })).status, 401);
  const staff = await User.create({ name: 'Staff', email: 'staff@example.test', role: 'sales', isActive: true, status: 'active', isVerified: true });
  assert.equal((await request({ user: staff })).status, 403);
  assert.equal((await request({ user: staff, body: { timezone: 'UTC' } })).status, 403);
});
