import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'test_jwt_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const { config } = await import('../config/environment.js');
const { STAFF_2FA_AUTH_LEVEL, requiresStaffTwoFactor } = await import('../constants/roles.js');
const { default: User } = await import('../models/user.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const salesAnalyticsRoutes = (await import('../routes/salesAnalytics.routes.js')).default;
const paymentRoutes = (await import('../routes/payment.routes.js')).default;

let mongo;
let server;
let baseUrl;
let sales;
let customer;
let registeredOnly;
let order;
let originalPayment;

const tokenFor = (user) => jwt.sign({
  id: user._id.toString(),
  role: user.role,
  email: user.email,
  name: user.name,
  ...(requiresStaffTwoFactor(user.role) ? { authLevel: STAFF_2FA_AUTH_LEVEL } : {}),
}, config.jwtSecret, { expiresIn: '1h' });

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();
  return { response, body };
};

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { downloadDir: `${process.cwd()}/.mongodb-binaries`, version: '7.0.14' },
  });
  await mongoose.connect(mongo.getUri('autospf-sales-analytics-routes'));
  sales = await User.create({
    name: 'Sales Analyst', email: 'sales-analytics@example.test', role: 'sales',
    isActive: true, isVerified: true, status: 'active',
  });
  customer = await User.create({
    name: 'Ledger Customer', email: 'ledger-customer@example.test', role: 'customer',
    isActive: true, isVerified: false, status: 'active',
  });
  registeredOnly = await User.create({
    name: 'Registered Only', email: 'registered-only@example.test', role: 'customer',
    isActive: true, isVerified: false, status: 'active',
  });
  order = await Order.create({
    orderNumber: 'ANALYTICS-ORDER-1', bookingReference: 'ASPF-ANALYTICS-1',
    customer: customer._id, customerName: customer.name,
    serviceType: 'SPF 89 — Advanced', serviceTotal: 17_999, totalPrice: 17_999,
    status: 'confirmed', approvedAt: new Date('2026-08-10T01:00:00.000Z'),
  });
  originalPayment = await Payment.create({
    invoiceId: 'ANALYTICS-RSV-1', order: order._id, customer: customer._id,
    amount: 500, amountSubmitted: 500, amountVerified: 500,
    transactionType: 'reservation_fee', status: 'succeeded', method: 'cash', provider: 'pos',
    submittedAt: new Date('2026-08-10T02:00:00.000Z'),
    effectiveAt: new Date('2026-08-10T02:00:00.000Z'),
  });

  const app = express();
  app.use(express.json());
  app.use('/api/sales-analytics', salesAnalyticsRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode || error.status || 500).json({ success: false, message: error.message, code: error.code });
  });
  server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('report, CSV, customers, and canonical ledger reconcile under identical filters', async () => {
  const token = tokenFor(sales);
  const query = 'range=custom&from=2026-08-01&to=2026-08-31&serviceMetric=orders';
  const report = await request(`/api/sales-analytics/report?${query}`, { token });
  assert.equal(report.response.status, 200);
  assert.equal(report.body.data.kpis.netCollectedRevenue, 500);
  assert.equal(report.body.data.kpis.bookedSalesValue, 17_999);
  assert.equal(report.body.data.kpis.confirmedOrders, 1);
  assert.equal(report.body.data.secondary.outstandingBalance, 17_499);
  assert.equal(report.body.data.reconciliation.netLedgerSum, 500);
  assert.equal(report.body.data.reconciliation.methodLedgerSum, 500);

  const csv = await request(`/api/sales-analytics/report.csv?${query}`, { token });
  assert.equal(csv.response.status, 200);
  assert.match(csv.body, /Row Type,Booking ID,Transaction ID/);
  assert.match(csv.body, /Booking,ASPF-ANALYTICS-1/);
  assert.match(csv.body, /Payment,ASPF-ANALYTICS-1,ANALYTICS-RSV-1/);

  const customers = await request('/api/sales-analytics/customers?range=90d&page=1&limit=20', { token });
  assert.equal(customers.response.status, 200);
  assert.equal(customers.body.summary.totalCustomers, 2);
  assert.equal(customers.body.summary.spendingCustomers, 1);
  assert.equal(customers.body.summary.averageCustomerSpend, 500);
  assert.ok(customers.body.data.some((row) => row.name === registeredOnly.name && row.totalSpent === 0));

  const ledger = await request('/api/payments?page=1&limit=1', { token });
  assert.equal(ledger.response.status, 200);
  assert.equal(ledger.body.pagination.total, 1);
  assert.equal(ledger.body.data[0].amountSubmitted, 500);
  assert.equal(ledger.body.data[0].amountVerified, 500);
  assert.equal(ledger.body.data[0].signedAmount, 500);
  assert.equal(ledger.body.data[0].serviceTotal, 17_999);
});

test('refund endpoint requires confirmation and is capped and idempotent', async () => {
  const token = tokenFor(sales);
  const path = `/api/payments/${originalPayment._id}/refunds`;
  const rejected = await request(path, {
    token,
    method: 'POST',
    body: JSON.stringify({ amount: 100, reason: 'Approved adjustment', confirmed: false }),
    headers: { 'Idempotency-Key': 'analytics-refund-no-confirm' },
  });
  assert.equal(rejected.response.status, 400);

  const options = {
    token,
    method: 'POST',
    body: JSON.stringify({ amount: 200, reason: 'Approved customer adjustment', confirmed: true }),
    headers: { 'Idempotency-Key': 'analytics-refund-0001' },
  };
  const first = await request(path, options);
  const retry = await request(path, options);
  assert.equal(first.response.status, 201);
  assert.equal(first.body.data.signedAmount, -200);
  assert.equal(retry.response.status, 200);
  assert.equal(retry.body.idempotent, true);
  assert.equal(retry.body.data.paymentId, first.body.data.paymentId);
  assert.equal((await Payment.findById(originalPayment._id)).status, 'succeeded');
  assert.equal(await Payment.countDocuments({ transactionType: 'refund' }), 1);

  const excessive = await request(path, {
    token,
    method: 'POST',
    body: JSON.stringify({ amount: 301, reason: 'Exceeds remaining balance', confirmed: true }),
    headers: { 'Idempotency-Key': 'analytics-refund-0002' },
  });
  assert.equal(excessive.response.status, 409);

  const full = await request(path, {
    token,
    method: 'POST',
    body: JSON.stringify({ reason: 'Refund the full remaining balance', confirmed: true }),
    headers: { 'Idempotency-Key': 'analytics-refund-0003' },
  });
  assert.equal(full.response.status, 201);
  assert.equal(full.body.data.signedAmount, -300);
  assert.equal(await Payment.countDocuments({ transactionType: 'refund' }), 2);

  const report = await request(
    '/api/sales-analytics/report?range=custom&from=2026-08-01&to=2026-08-31&serviceMetric=orders',
    { token },
  );
  assert.equal(report.body.data.kpis.netCollectedRevenue, 0);
  assert.equal(report.body.data.reconciliation.methodLedgerSum, 0);

  const customers = await request('/api/sales-analytics/customers?range=90d&page=1&limit=20', { token });
  assert.equal(customers.body.summary.verifiedCustomerSpend, 0);
  assert.equal(customers.body.summary.spendingCustomers, 0);
  assert.equal(customers.body.summary.averageCustomerSpend, 0);
});

test('customer accounts cannot access Sales/Admin analytics', async () => {
  const denied = await request('/api/sales-analytics/report?range=30d', { token: tokenFor(customer) });
  assert.equal(denied.response.status, 403);
});
