import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TRANSACTION_PAYMENT_FILTER,
  filterTransactions,
  normalizePaymentMethod,
  getRecognizedRevenueAmount,
  transactionsToCsv,
  type Transaction,
} from '../src/lib/salesData.ts';

const transaction = (
  id: string,
  paymentMethod: Transaction['paymentMethod'],
  overrides: Partial<Transaction> = {}
): Transaction => ({
  id,
  customerId: `customer-${id}`,
  customerName: id === 'CASH-1' ? 'Cash Customer' : 'GCash Customer',
  customerPhone: '',
  vehiclePlate: id === 'CASH-1' ? 'CASH123' : 'GCASH123',
  vehicleInfo: '2026 Test Vehicle',
  services: [{ name: 'Premium Service', price: 1000, qty: 1 }],
  subtotal: 1000,
  discount: 0,
  tax: 0,
  total: 1000,
  paymentMethod,
  status: 'completed',
  dateTime: '2026-08-23T10:00:00+08:00',
  staffName: 'Sales',
  notes: '',
  ...overrides,
});

const cash = transaction('CASH-1', 'cash');
const gcash = transaction('GCASH-1', 'gcash');

test('Transactions defaults to All Payment Methods', () => {
  assert.equal(DEFAULT_TRANSACTION_PAYMENT_FILTER, 'all');
});

test('missing or unsupported persisted methods remain Unknown', () => {
  assert.equal(normalizePaymentMethod(undefined), 'unknown');
  assert.equal(normalizePaymentMethod(''), 'unknown');
  assert.equal(normalizePaymentMethod('unexpected'), 'unknown');
  assert.equal(normalizePaymentMethod('GCash'), 'gcash');
});

test('all, cash, and gcash filters return the correct persisted methods', () => {
  const rows = [cash, gcash];
  assert.deepEqual(filterTransactions(rows, { paymentMethod: 'all' }).map((row) => row.id), ['CASH-1', 'GCASH-1']);
  assert.deepEqual(filterTransactions(rows, { paymentMethod: 'cash' }).map((row) => row.id), ['CASH-1']);
  assert.deepEqual(filterTransactions(rows, { paymentMethod: 'gcash' }).map((row) => row.id), ['GCASH-1']);
});

test('payment, status, date, and search filters combine before pagination', () => {
  const rows = [
    cash,
    gcash,
    transaction('GCASH-PENDING', 'gcash', {
      status: 'pending',
      dateTime: '2026-07-01T10:00:00+08:00',
    }),
  ];
  const filtered = filterTransactions(rows, {
    paymentMethod: 'gcash',
    status: 'completed',
    search: 'GCASH123',
    dateFrom: '2026-08-01',
    dateTo: '2026-08-31',
  });
  assert.deepEqual(filtered.map((row) => row.id), ['GCASH-1']);
  assert.deepEqual(filtered.slice(0, 1).map((row) => row.id), ['GCASH-1']);
});

test('Transactions date filters use Asia/Manila calendar boundaries', () => {
  const justAfterManilaMidnight = transaction('MANILA-BOUNDARY', 'cash', {
    dateTime: '2026-08-22T16:30:00.000Z',
  });
  assert.deepEqual(
    filterTransactions([justAfterManilaMidnight], { dateFrom: '2026-08-23', dateTo: '2026-08-23' })
      .map((row) => row.id),
    ['MANILA-BOUNDARY'],
  );
  assert.deepEqual(
    filterTransactions([justAfterManilaMidnight], { dateFrom: '2026-08-22', dateTo: '2026-08-22' }),
    [],
  );
});

test('CSV export uses display labels and preserves the filtered methods', () => {
  const csv = transactionsToCsv([cash, gcash, transaction('UNKNOWN-1', 'unknown')]);
  assert.match(csv, /"Payment Method"/);
  assert.match(csv, /"Cash"/);
  assert.match(csv, /"GCash"/);
  assert.match(csv, /"Unknown"/);
});

test('revenue recognizes paid payments but excludes pending and rejected proofs', () => {
  const paid = transaction('PAID-1', 'gcash', { status: 'completed', statusRaw: 'succeeded', total: 500 });
  const pending = transaction('PENDING-1', 'gcash', { status: 'pending', statusRaw: 'pending', total: 500 });
  const rejected = transaction('REJECTED-1', 'gcash', { status: 'voided', statusRaw: 'rejected', total: 500 });
  assert.equal(getRecognizedRevenueAmount(paid), 500);
  assert.equal(getRecognizedRevenueAmount(pending), 0);
  assert.equal(getRecognizedRevenueAmount(rejected), 0);
});

test('a separate refund transaction reduces recognized revenue', () => {
  const refund = transaction('REFUND-1', 'gcash', {
    status: 'voided',
    statusRaw: 'refunded',
    transactionType: 'refund',
    total: -500,
  });
  assert.equal(getRecognizedRevenueAmount(refund), -500);
});
