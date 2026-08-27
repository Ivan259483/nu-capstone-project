import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEMO_RESET_CONFIRMATION_PHRASE,
  LIFECYCLE_CONFIRMATION_PHRASES,
  canOpenSystemManagement,
  getHandoverInvitationError,
  getMissingOpeningInventoryProducts,
  parseOpeningInventoryCsv,
} from '../src/components/Administrator/pages/systemManagementUtils.ts';

test('System Management access is limited to administrator and office admin roles', () => {
  assert.equal(canOpenSystemManagement('administrator'), true);
  assert.equal(canOpenSystemManagement('office_admin'), true);
  assert.equal(canOpenSystemManagement('sales'), false);
  assert.equal(canOpenSystemManagement('staff_quality_checker'), false);
  assert.equal(canOpenSystemManagement('customer'), false);
});

test('client administrator invitations require a valid human name and email', () => {
  assert.equal(getHandoverInvitationError('Maria Santos', 'maria@example.test'), null);
  assert.equal(
    getHandoverInvitationError('M', 'maria@example.test'),
    'Enter a valid name between 2 and 80 characters.',
  );
  assert.equal(
    getHandoverInvitationError('Maria Santos', 'not-an-email'),
    'Enter a valid email address.',
  );
});

test('opening inventory CSV accepts IDs or SKUs and rejects unsafe quantities', () => {
  const products = [
    { id: 'p1', sku: 'SOAP', name: 'Soap', isActive: true },
    { id: 'p2', sku: 'WAX', name: 'Wax', isActive: true },
  ];
  assert.deepEqual(
    parseOpeningInventoryCsv('sku,quantity\nSOAP,4\nWAX,0', products),
    { rows: [{ productId: 'p1', quantity: 4 }, { productId: 'p2', quantity: 0 }], errors: [] },
  );
  assert.deepEqual(
    parseOpeningInventoryCsv('productId,quantity\np1,-1\nmissing,2', products).errors,
    ['Row 2: quantity must be a whole number at least 0.', 'Row 3: product was not found.'],
  );
});

test('turnover inventory validation requires every active product and permits zero', () => {
  const products = [
    { id: 'p1', isActive: true },
    { id: 'p2', isActive: true },
    { id: 'p3', isActive: false },
  ];
  assert.deepEqual(getMissingOpeningInventoryProducts(products, { p1: '0', p2: '5' }), []);
  assert.deepEqual(getMissingOpeningInventoryProducts(products, { p1: '0', p2: '' }), [products[1]]);
  assert.deepEqual(
    getMissingOpeningInventoryProducts([{ id: 'reserved', isActive: true, reserved: 2 }], { reserved: '1' }),
    [{ id: 'reserved', isActive: true, reserved: 2 }],
  );
});

test('lifecycle confirmation phrases match backend-owned exact phrases', () => {
  assert.equal(LIFECYCLE_CONFIRMATION_PHRASES.enter_production, 'ENTER PRODUCTION');
  assert.equal(LIFECYCLE_CONFIRMATION_PHRASES.leave_production, 'LEAVE PRODUCTION');
  assert.equal(LIFECYCLE_CONFIRMATION_PHRASES.archive, 'ARCHIVE AUTOSPF');
});

test('demo environment reset uses the backend-owned exact confirmation phrase', () => {
  assert.equal(DEMO_RESET_CONFIRMATION_PHRASE, 'RESET DEMO ENVIRONMENT');
});
