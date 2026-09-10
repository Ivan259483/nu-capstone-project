import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'booking_transaction_test_jwt_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';
process.env.RESEND_API_KEY = '';
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';

const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { persistBookingWithReservationPayment } = await import('../controllers/order.controller.js');

let mongo;

const orderPayload = (suffix) => ({
  orderNumber: `TXN-${suffix}`,
  bookingReference: `TXN-REF-${suffix}`,
  customer: new mongoose.Types.ObjectId(),
  serviceType: 'Atomic Reservation Test',
  totalAmount: 1000,
  totalPrice: 1000,
  status: 'pending_confirmation',
  bookingDate: '2099-08-17',
  bookingTime: '08:00',
  downpaymentProof: 'https://example.test/payment-proof.jpg',
  paymentProofUrl: 'https://example.test/payment-proof.jpg',
  paymentMethod: 'gcash',
});

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(mongo.getUri('autospf-booking-transaction-test'));
  await Promise.all([Order.syncIndexes(), Payment.syncIndexes()]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test('booking and reservation payment commit or abort as one replica-set transaction', async () => {
  const firstPayload = orderPayload('SUCCESS');
  const result = await persistBookingWithReservationPayment({
    orderPayload: firstPayload,
    reservationPayment: {
      amount: 500,
      proofImage: firstPayload.paymentProofUrl,
      paymentMethod: 'gcash',
      submittedBy: firstPayload.customer,
    },
  });

  assert.ok(await Order.exists({ _id: result.order._id }));
  const payment = await Payment.findOne({
    order: result.order._id,
    transactionType: 'reservation_fee',
  }).lean();
  assert.equal(payment.amount, 500);
  assert.equal(payment.status, 'pending');
  assert.equal(payment.method, 'gcash');

  const failingPayload = orderPayload('ABORT');
  const originalCreate = Payment.create;
  Payment.create = async () => {
    const error = new Error('Injected reservation payment validation failure');
    error.name = 'ValidationError';
    error.errors = { method: { message: 'Injected invalid payment method' } };
    throw error;
  };
  try {
    await assert.rejects(
      persistBookingWithReservationPayment({
        orderPayload: failingPayload,
        reservationPayment: {
          amount: 500,
          proofImage: failingPayload.paymentProofUrl,
          paymentMethod: 'gcash',
          submittedBy: failingPayload.customer,
        },
      }),
      /Injected reservation payment validation failure/,
    );
  } finally {
    Payment.create = originalCreate;
  }

  assert.equal(await Order.countDocuments({ orderNumber: failingPayload.orderNumber }), 0);
  assert.equal(await Payment.countDocuments({ customer: failingPayload.customer }), 0);
});
