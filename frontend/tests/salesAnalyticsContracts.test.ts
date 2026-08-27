import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCustomerActivityQuery,
  buildCustomerDetailEndpoints,
  buildRefundRequest,
  buildSalesReportQuery,
  CUSTOMER_LIFETIME_VALUE_LABEL,
  DEFAULT_CUSTOMER_ACTIVITY_RANGE,
  getRefundValidationError,
} from '../src/lib/salesAnalyticsContracts.ts';

test('report API and CSV filters use the same exact range and service metric query', () => {
  assert.deepEqual(buildSalesReportQuery('30d', 'orders', { from: '', to: '' }), {
    range: '30d',
    serviceMetric: 'orders',
  });
  assert.deepEqual(buildSalesReportQuery('custom', 'booked_value', {
    from: '2026-08-01',
    to: '2026-08-18',
  }), {
    range: 'custom',
    serviceMetric: 'booked_value',
    from: '2026-08-01',
    to: '2026-08-18',
  });
});

test('customer analytics defaults to a 90-day activity window while value labels stay lifetime-based', () => {
  assert.equal(DEFAULT_CUSTOMER_ACTIVITY_RANGE, '90d');
  assert.equal(CUSTOMER_LIFETIME_VALUE_LABEL, 'Lifetime payments less refunds');
  assert.deepEqual(buildCustomerActivityQuery({
    range: DEFAULT_CUSTOMER_ACTIVITY_RANGE,
    custom: { from: '', to: '' },
    search: 'Ivan',
    status: 'active',
    sort: 'totalSpent',
    direction: 'desc',
    page: 2,
    limit: 20,
  }), {
    range: '90d', search: 'Ivan', status: 'active', sort: 'totalSpent', direction: 'desc', page: 2, limit: 20,
  });
});

test('customer detail routes preserve opaque keys and expose separate histories', () => {
  assert.deepEqual(buildCustomerDetailEndpoints('hist.customer/key'), {
    overview: '/sales-analytics/customers/hist.customer%2Fkey',
    bookings: '/sales-analytics/customers/hist.customer%2Fkey/bookings',
    transactions: '/sales-analytics/customers/hist.customer%2Fkey/transactions',
  });
});

test('refund requests require confirmation, a reason, and a capped positive amount', () => {
  const base = { amount: 250, refundableBalance: 500, reason: 'Customer-approved adjustment', confirmed: true };
  assert.equal(getRefundValidationError(base), null);
  assert.deepEqual(buildRefundRequest(base), {
    amount: 250,
    reason: 'Customer-approved adjustment',
    confirmed: true,
  });
  assert.match(getRefundValidationError({ ...base, confirmed: false }) || '', /confirmation/i);
  assert.match(getRefundValidationError({ ...base, reason: '' }) || '', /reason/i);
  assert.match(getRefundValidationError({ ...base, amount: 501 }) || '', /exceeds/i);
});
