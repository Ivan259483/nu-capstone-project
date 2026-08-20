import assert from 'node:assert/strict';
import test from 'node:test';

process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';

const {
  calculateOutstandingTransaction,
  PENDING_PAYMENT_STATUSES,
  summarizeOutstandingOrders,
} = await import('../services/pendingPayments.service.js');

const order = (id, overrides = {}) => ({
  _id: id,
  orderNumber: `ORDER-${id}`,
  status: 'confirmed',
  paymentStatus: 'unpaid',
  totalPrice: 1000,
  downPaymentAmount: 0,
  archived: false,
  ...overrides,
});

test('pending payment summary includes supported statuses and uses outstanding balances', () => {
  const orders = [
    order('pending', { paymentStatus: 'pending' }),
    order('unpaid', { downPaymentAmount: 200 }),
    order('partial', { paymentStatus: 'partially paid' }),
    order('awaiting', { paymentStatus: 'awaiting settlement', totalPrice: 500 }),
    order('paid', { paymentStatus: 'paid' }),
    order('completed-payment', { paymentStatus: 'completed' }),
    order('cancelled', { status: 'cancelled' }),
    order('rejected', { status: 'rejected' }),
    order('archived', { archived: true }),
    order('fully-settled'),
  ];

  const settledTotalsByOrder = new Map([
    ['partial', 300],
    ['fully-settled', 1000],
  ]);
  const summary = summarizeOutstandingOrders({ orders, settledTotalsByOrder });

  assert.deepEqual(PENDING_PAYMENT_STATUSES, [
    'pending',
    'unpaid',
    'partially_paid',
    'awaiting_settlement',
  ]);
  assert.equal(summary.count, 4);
  assert.equal(summary.totalOutstanding, 3000);
  assert.deepEqual(summary.statusCounts, {
    pending: 1,
    unpaid: 0,
    partially_paid: 2,
    awaiting_settlement: 1,
  });
  assert.deepEqual(
    summary.transactions.map(({ orderId, outstandingBalance }) => [orderId, outstandingBalance]),
    [
      ['pending', 1000],
      ['unpaid', 800],
      ['partial', 700],
      ['awaiting', 500],
    ]
  );
});

test('billing service total and all recorded paid amounts determine the remaining balance', () => {
  const transaction = calculateOutstandingTransaction({
    order: order('billing', {
      totalPrice: 9999,
      downPaymentAmount: 100,
      amountCollected: 150,
    }),
    billing: {
      lineItems: [{ name: 'Service', unitPrice: 2000, quantity: 1 }],
      discount: { discountType: 'fixed', value: 100 },
      taxVatAmount: 0,
      additionalFees: 50,
      downpayment: 500,
    },
    settledPaymentTotal: 200,
  });

  assert.deepEqual(transaction, {
    orderId: 'billing',
    reference: 'ORDER-billing',
    orderStatus: 'confirmed',
    paymentStatus: 'partially_paid',
    totalServiceAmount: 1950,
    amountAlreadyPaid: 700,
    outstandingBalance: 1250,
  });
});
