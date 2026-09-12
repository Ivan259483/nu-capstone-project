import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'test_jwt_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.EMAIL_PROVIDER = 'console';
const { config } = await import('../config/environment.js');
const { STAFF_2FA_AUTH_LEVEL } = await import('../constants/roles.js');
const { default: User } = await import('../models/user.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: Billing } = await import('../models/billing.model.js');
const { buildSalesReportFromRecords, salesReportToCsv } = await import('../services/salesAnalytics.service.js');
const { parseReportingRange } = await import('../utils/reportingRange.utils.js');
const { readyPickupSlotProgress, REQUIRED_READY_PICKUP_SLOTS } = await import('../utils/trackerGatePhotos.utils.js');
const { evaluateReadyForPickupQueueEligibility } = await import('../utils/readyPickupPaymentFlow.utils.js');
const analyticsRoutes = (await import('../routes/salesAnalytics.routes.js')).default;
const paymentRoutes = (await import('../routes/payment.routes.js')).default;
const orderRoutes = (await import('../routes/orders.routes.js')).default;
const image = `data:image/jpeg;base64,${'A'.repeat(1024 * 1024)}`;
const query = { range: 'custom', from: '2026-09-01', to: '2026-09-30', serviceMetric: 'orders' };
let mongo, server, baseUrl, token, kevin, payment, expectedReport, expectedCsv;
let capture = false;
const commands = [];
const batches = [];

const request = async (path) => {
  const response = await fetch(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
  assert.equal(response.status, 200, typeof body === 'string' ? body : JSON.stringify(body));
  return { response, body };
};

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { downloadDir: `${process.cwd()}/.mongodb-binaries`, version: '7.0.14' } });
  await mongoose.connect(mongo.getUri('autospf-sales-sync-projections'), { monitorCommands: true });
  const sales = await User.create({ name: 'Sync Sales', email: 'sync-sales@example.test', role: 'sales', isActive: true, isVerified: true, status: 'active' });
  const customer = await User.create({ name: 'kevin', email: 'sync-kevin@example.test', role: 'customer', isActive: true, status: 'active' });
  token = jwt.sign({ id: String(sales._id), role: sales.role, email: sales.email, authLevel: STAFF_2FA_AUTH_LEVEL }, config.jwtSecret, { expiresIn: '1h' });
  const date = new Date('2026-09-10T01:00:00Z');
  kevin = await Order.create({
    orderNumber: 'SYNC-KEVIN', bookingReference: 'ASPF-SYNC-KEVIN', customer: customer._id, customerName: 'kevin',
    vehiclePlate: 'ABC1234', notes: 'Preserve encrypted notes', serviceType: 'SPF 80',
    serviceTotal: 0, totalPrice: 7999, totalAmount: 7999, approvedAt: date,
    status: 'in_progress', serviceTrackingStage: 'ready_pickup', qcCompletedAt: date,
    paymentStatus: 'partially_paid', bookingDate: '2099-08-17', bookingTime: '10:00',
    trackerStageMedia: [...REQUIRED_READY_PICKUP_SLOTS, 'front'].map((slot) => ({ stage: 'ready_pickup', slot, photoUrl: image })),
    paymentProofUrl: image, downpaymentProof: image,
  });
  const refunded = await Order.create({ orderNumber: 'SYNC-REFUND', customer: customer._id, customerName: 'kevin', serviceType: 'Detailing', serviceTotal: 2000, status: 'confirmed', approvedAt: date });
  await Order.create({ orderNumber: 'SYNC-CANCELLED', customer: customer._id, status: 'cancelled', cancelledAt: date, totalPrice: 1000 });
  await Billing.create({ order: kevin._id, status: 'updated', downpayment: 500, lineItems: [{ name: 'SPF 80', unitPrice: 7999, quantity: 1 }] });
  const addPayment = (invoiceId, order, amount, fields = {}) => Payment.create({
    invoiceId, order, customer: customer._id, amount, amountSubmitted: amount, amountVerified: amount,
    status: 'succeeded', transactionType: 'full_service_payment', method: 'cash', submittedAt: date, effectiveAt: date,
    proofImage: image, statusHistory: [{ status: 'pending', proofImage: image }], ...fields,
  });
  payment = await addPayment('SYNC-RSV', kevin._id, 500, { transactionType: 'reservation_fee', method: 'gcash' });
  const original = await addPayment('SYNC-FULL', refunded._id, 2000, { method: 'split', splitPayments: [{ method: 'cash', amount: 1200 }, { method: 'gcash', amount: 800 }] });
  await addPayment('SYNC-REFUND', refunded._id, 200, { transactionType: 'refund', status: 'refunded', relatedPayment: original._id });
  await addPayment('SYNC-PENDING', refunded._id, 100, { status: 'pending', amountVerified: null, effectiveAt: null });

  // Build the reference with the original full document reads, including media.
  expectedReport = buildSalesReportFromRecords({
    orders: await Order.find().populate('customer').populate('vehicle serviceId'),
    payments: await Payment.find().populate('customer').populate('order').populate('vehicle service'),
    range: parseReportingRange(query), serviceMetric: 'orders',
  });
  expectedCsv = salesReportToCsv(expectedReport);
  delete expectedReport._rows;
  mongoose.connection.getClient().on('commandStarted', (event) => { if (capture) commands.push(event.command); });
  mongoose.connection.getClient().on('commandSucceeded', (event) => {
    if (capture && event.reply?.cursor?.firstBatch) batches.push(event.reply.cursor.firstBatch);
  });
  const app = express();
  app.use('/api/sales-analytics', analyticsRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/bookings', orderRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  server = await new Promise((resolve) => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('large proofs preserve report, CSV, refund caps and pending balances with compact database reads', async () => {
  capture = true;
  try {
    const report = await request(`/api/sales-analytics/report?${new URLSearchParams(query)}`);
    assert.deepEqual(report.body.data, expectedReport);
    assert.equal(report.body.data.kpis.netCollectedRevenue, 2300);
    assert.equal(report.body.data.kpis.bookedSalesValue, 9999);
    assert.equal(report.body.data.secondary.pendingVerification, 100);
    assert.equal(report.body.data.secondary.refunds, 200);
    assert.equal(report.body.data.secondary.outstandingBalance, 7699);
    assert.match(report.response.headers.get('server-timing'), /db.salesreport.orders;dur=/);
    const csv = await request(`/api/sales-analytics/report.csv?${new URLSearchParams(query)}`);
    assert.equal(csv.body.replace(/^\uFEFF/, ''), expectedCsv);
    const ledger = await request('/api/payments?page=1&limit=100&sortBy=effectiveAt&sortOrder=desc');
    assert.equal(ledger.body.totalRevenue, 2300);
    assert.equal(ledger.body.pendingPaymentsSummary.totalOutstanding, 7699);
    assert.equal(ledger.body.data.find((row) => row.invoiceId === 'SYNC-FULL').refundableBalance, 1800);
    assert.equal(ledger.body.data.find((row) => row.invoiceId === 'SYNC-RSV').outstandingBalance, 7499);
    assert.equal(ledger.body.data.find((row) => row.invoiceId === 'SYNC-REFUND').signedAmount, -200);
    const supportingReads = commands.filter((command) => command.find === 'payments' && command.filter?.order?.$in);
    assert.equal(supportingReads.length, 2);
    for (const command of supportingReads) {
      assert.equal(command.projection.amountVerified, 1);
      assert.equal(command.projection.relatedPayment, 1);
      assert.equal(command.projection.proofImage, undefined);
      assert.equal(command.projection.statusHistory, undefined);
    }
    assert.ok(batches.every((batch) => JSON.stringify(batch).length < 64_000), 'every result batch excludes embedded images');
    assert.ok(batches.every((batch) => !JSON.stringify(batch).includes('data:image')));
  } finally { capture = false; }
});

test('Kevin remains eligible at 7499; queue state saves never overwrite stored evidence or encrypted fields', async () => {
  const before = await Order.collection.findOne({ _id: kevin._id });
  commands.length = 0;
  batches.length = 0;
  capture = true;
  let queue;
  try { queue = await request('/api/bookings/queue/balance-pickup'); } finally { capture = false; }
  assert.equal(queue.body.count, 1);
  assert.equal(queue.body.data[0].customerName, 'kevin');
  assert.equal(queue.body.data[0].remainingBalance, 7499);
  assert.equal(queue.body.data[0].readyPickupSlotCount, 5);
  assert.equal(queue.body.data[0].vehiclePlate, 'ABC1234');
  assert.equal(commands.filter((command) => command.find === 'payments').length, 1, 'financial payment read is reused');
  assert.equal(commands.filter((command) => command.find === 'billings').length, 1);
  assert.equal(commands.filter((command) => command.find === 'invoicerecords').length, 1);
  const projected = batches.flat().find((row) => row.pickupEvidence);
  assert.equal(projected.trackerStageMedia, undefined);
  assert.equal(projected.pickupEvidence.length, 6);
  assert.ok(projected.pickupEvidence.every((row) => row.hasPhoto === true && row.photoUrl === undefined));
  assert.ok(batches.every((batch) => JSON.stringify(batch).length < 64_000));
  const saved = await Order.collection.findOne({ _id: kevin._id });
  for (const field of ['trackerStageMedia', 'paymentProofUrl', 'downpaymentProof', 'vehiclePlate', 'notes']) {
    assert.deepEqual(saved[field], before[field], `${field} is unchanged after eligibility save`);
  }
  assert.equal(saved.pickupEvidence, undefined);
  assert.equal(saved.posQueueStatus, 'balance_pickup_queue');
  assert.equal((await Payment.findById(payment._id)).proofImage, image);
  assert.equal((await request('/api/bookings/queue/balance-pickup')).body.count, 1);
});

test('compact evidence preserves aliases, duplicate slots, missing photos, and genuine empty queue responses', async () => {
  const originalMedia = (await Order.collection.findOne({ _id: kevin._id })).trackerStageMedia;
  const aliasMedia = originalMedia.map((row) => row.slot === 'close_up' ? { ...row, slot: ' Pickup-Handover ' } : row);
  await Order.collection.updateOne({ _id: kevin._id }, { $set: { trackerStageMedia: aliasMedia } });
  assert.equal((await request('/api/bookings/queue/balance-pickup')).body.count, 1);
  for (const photoUrl of ['', ' \t\n\u00a0\ufeff', null]) {
    const media = aliasMedia.map((row) => row.slot === 'right' ? { ...row, photoUrl } : row);
    await Order.collection.updateOne({ _id: kevin._id }, { $set: { trackerStageMedia: media } });
    const full = await Order.findById(kevin._id);
    assert.equal(readyPickupSlotProgress(full).complete, false);
    const evaluation = await evaluateReadyForPickupQueueEligibility(full, { persist: false, emit: false, notify: false });
    assert.equal(evaluation.reason, 'missing_ready_pickup_slots');
    const empty = await request('/api/bookings/queue/balance-pickup');
    assert.deepEqual(empty.body, { success: true, data: [], count: 0 });
    assert.deepEqual((await Order.collection.findOne({ _id: kevin._id })).trackerStageMedia, media);
  }
});
