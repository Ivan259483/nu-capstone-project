import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.JWT_SECRET ||= 'system_demo_reset_test_secret';
process.env.ENCRYPTION_KEY ||= '12345678901234567890123456789012';
process.env.NODE_ENV = 'test';
process.env.EMAIL_PROVIDER = 'console';

const { default: ActivityLog } = await import('../models/activityLog.model.js');
const { default: BookingSlotCounter } = await import('../models/bookingSlotCounter.model.js');
const { default: Category } = await import('../models/category.model.js');
const { default: Customer } = await import('../models/customer.model.js');
const { default: InventoryTransaction } = await import('../models/inventoryTransaction.model.js');
const { default: Notification } = await import('../models/notification.model.js');
const { default: Order } = await import('../models/order.model.js');
const { default: Payment } = await import('../models/payment.model.js');
const { default: Product } = await import('../models/product.model.js');
const { default: Service } = await import('../models/service.model.js');
const { default: Setting } = await import('../models/setting.model.js');
const { default: Store } = await import('../models/store.model.js');
const { default: Supplier } = await import('../models/supplier.model.js');
const { default: SupplierOrder } = await import('../models/supplierOrder.model.js');
const { default: SystemDataClassification } = await import('../models/systemDataClassification.model.js');
const { default: SystemOperation } = await import('../models/systemOperation.model.js');
const { default: SystemState } = await import('../models/systemState.model.js');
const { default: User } = await import('../models/user.model.js');
const { default: Vehicle } = await import('../models/vehicle.model.js');
const {
  createDemoResetPreview,
  executeDemoReset,
} = await import('../services/systemDemoReset.service.js');
const { initializeProtectedAdministrator } = await import('../services/systemState.service.js');

const ADMIN_EMAIL = 'ivantadena18@gmail.com';
const ADMIN_PASSWORD = 'Reset!DemoEnvironment123';

let replSet;
let admin;

const actor = () => ({
  id: String(admin._id),
  name: admin.name,
  email: admin.email,
  role: admin.role,
});

const createUser = (role, suffix) => User.create({
  name: `${role} ${suffix}`,
  email: `${role}.${suffix}@example.test`,
  password: 'Demo!Account123',
  role,
  isVerified: true,
  isActive: true,
  status: 'active',
});

before(async () => {
  replSet = await MongoMemoryReplSet.create({
    binary: {
      downloadDir: `${process.cwd()}/.mongodb-binaries`,
      version: '7.0.14',
    },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri('autospf-demo-reset-test'));
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  admin = await User.create({
    name: 'Protected Administrator',
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    role: 'administrator',
    isVerified: true,
    isActive: true,
    status: 'active',
  });
  await initializeProtectedAdministrator();
});

after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

test('Reset Demo Environment removes the complete operational graph and preserves configuration', async () => {
  const [customer, sales, qualityChecker, officeAdmin, otherAdmin] = await Promise.all([
    createUser('customer', 'reset'),
    createUser('sales', 'reset'),
    createUser('staff_quality_checker', 'reset'),
    createUser('office_admin', 'reset'),
    createUser('administrator', 'reset'),
  ]);
  const supplier = await Supplier.create({ name: 'Preserved Supplier', totalSpent: 8750, lastOrder: new Date() });
  const category = await Category.create({ name: 'Preserved Category' });
  const product = await Product.create({
    name: 'Preserved Product',
    description: 'Catalog definition survives.',
    price: 450,
    category: category._id,
    supplier: supplier._id,
    inventory: 18,
    reserved: 4,
    sku: 'RESET-TEST-PRODUCT',
  });
  const service = await Service.create({
    name: 'Preserved Service',
    basePrice: 2500,
    bookingCount: 12,
  });
  await Setting.create({ businessName: 'AutoSPF+', logoUrl: '/preserved-logo.png' });
  const store = await Store.create({ name: 'Preserved Store', manager: sales._id });
  const vehicle = await Vehicle.create({ customer: customer._id, make: 'Toyota', model: 'Vios', color: 'White', plateNumber: 'DEMO-RESET' });
  await Customer.create({ user: customer._id, vehicles: [vehicle._id] });
  const order = await Order.create({
    orderNumber: 'RESET-DEMO-ORDER',
    customer: customer._id,
    vehicle: vehicle._id,
    assignedDetailer: qualityChecker._id,
    serviceId: service._id,
  });
  await Promise.all([
    Payment.create({
      invoiceId: 'RESET-DEMO-INVOICE',
      order: order._id,
      customer: customer._id,
      vehicle: vehicle._id,
      amount: 1000,
      proofImage: 'https://legacy.example.test/payment-proof.jpg',
    }),
    Notification.create({
      title: 'Reset demo notification',
      message: 'Operational notification.',
      recipientRole: 'customer',
      recipientUserId: customer._id,
    }),
    SupplierOrder.create({ supplier: supplier._id, status: 'Completed', amount: 8750 }),
    InventoryTransaction.create({
      product: product._id,
      type: 'out',
      quantity: 4,
      previousStock: 22,
      newStock: 18,
      referenceId: order._id,
      referenceModel: 'Order',
    }),
    BookingSlotCounter.create({ date: '2026-09-01', time: '09:00 AM', count: 1 }),
    ActivityLog.create({
      type: 'booking_created',
      title: 'Demo booking audit',
      description: 'Operational activity should be removed.',
      userId: customer._id,
      userName: customer.name,
      userRole: customer.role,
      module: 'Booking',
    }),
  ]);
  const securityAudit = await ActivityLog.create({
    type: 'access_denied',
    title: 'Authoritative security audit',
    description: 'Security evidence must survive reset.',
    userId: sales._id,
    userName: sales.name,
    userRole: sales.role,
    module: 'System',
    status: 'warning',
  });

  const beforeState = await SystemState.findOne({ key: 'primary' }).lean();
  const preview = await createDemoResetPreview({ actor: actor() });
  assert.equal(preview.blockers.length, 0);
  assert.equal(preview.requiresBackup, false);
  assert.equal(preview.counts.customers, 1);
  assert.equal(preview.counts.salesUsers, 1);
  assert.equal(preview.counts.qualityCheckerUsers, 1);
  assert.equal(preview.counts.officeAdminUsers, 1);
  assert.equal(preview.counts.otherNonProtectedUsers, 1);
  assert.equal(preview.counts.bookings, 1);
  assert.equal(preview.counts.payments, 1);

  const completed = await executeDemoReset({
    actor: actor(),
    body: {
      previewId: preview.previewId,
      planHash: preview.planHash,
      password: ADMIN_PASSWORD,
      phrase: 'RESET DEMO ENVIRONMENT',
      idempotencyKey: 'reset-demo-environment-complete-1',
    },
  });
  assert.ok(['completed', 'completed_with_warnings'].includes(completed.status));

  const survivingUsers = await User.find({}).lean();
  assert.equal(survivingUsers.length, 1);
  assert.equal(String(survivingUsers[0]._id), String(admin._id));
  assert.equal(survivingUsers[0].role, 'administrator');
  assert.equal(survivingUsers[0].isActive, true);
  assert.equal(survivingUsers[0].isVerified, true);
  assert.equal(survivingUsers[0].status, 'active');
  assert.equal(await User.findById(admin._id).then((user) => user.comparePassword(ADMIN_PASSWORD)), true);

  const operationalCounts = await Promise.all([
    Customer.countDocuments({}), Vehicle.countDocuments({}), Order.countDocuments({}),
    Payment.countDocuments({}), Notification.countDocuments({}), SupplierOrder.countDocuments({}),
    InventoryTransaction.countDocuments({}), BookingSlotCounter.countDocuments({}),
    SystemDataClassification.countDocuments({}),
  ]);
  assert.deepEqual(operationalCounts, [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(await ActivityLog.exists({ _id: securityAudit._id }).then(Boolean), true);
  assert.equal(await ActivityLog.countDocuments({ type: 'booking_created' }), 0);

  const preservedProduct = await Product.findById(product._id).lean();
  const preservedService = await Service.findById(service._id).lean();
  const preservedSupplier = await Supplier.findById(supplier._id).lean();
  const preservedStore = await Store.findById(store._id).lean();
  assert.equal(preservedProduct.name, 'Preserved Product');
  assert.equal(preservedProduct.price, 450);
  assert.equal(preservedProduct.inventory, 0);
  assert.equal(preservedProduct.reserved, 0);
  assert.equal(preservedService.name, 'Preserved Service');
  assert.equal(preservedService.basePrice, 2500);
  assert.equal(preservedService.bookingCount, 0);
  assert.equal(preservedSupplier.name, 'Preserved Supplier');
  assert.equal(preservedSupplier.totalSpent, 0);
  assert.equal(preservedSupplier.lastOrder, null);
  assert.equal(preservedStore.manager, undefined);
  assert.equal(await Category.countDocuments({}), 1);
  assert.equal(await Setting.countDocuments({}), 1);

  const afterState = await SystemState.findOne({ key: 'primary' }).lean();
  assert.equal(String(afterState.protectedAdministratorId), String(admin._id));
  assert.equal(afterState.globalSessionEpoch, beforeState.globalSessionEpoch);
  assert.equal(afterState.operationalDataEpoch, beforeState.operationalDataEpoch + 1);
  assert.equal(afterState.mode, 'development');
  const storedOperation = await SystemOperation.findById(preview.previewId).lean();
  assert.equal(storedOperation.action, 'reset_demo_environment');
  assert.ok(storedOperation.receipt);
  assert.equal(storedOperation.receipt.protectedAdministratorId, String(admin._id));
  assert.ok(await User.exists({ _id: admin._id }));
  assert.equal(await User.exists({ _id: otherAdmin._id }), null);
  assert.equal(await User.exists({ _id: officeAdmin._id }), null);
});

test('Reset Demo Environment is denied with a stable code in Production', async () => {
  await SystemState.updateOne({ key: 'primary' }, { $set: { mode: 'production' } });
  await assert.rejects(
    createDemoResetPreview({ actor: actor() }),
    (error) => error.code === 'DEMO_RESET_NOT_ALLOWED_IN_PRODUCTION' && error.status === 409,
  );
});

test('Reset Demo Environment fails stale with zero changes when operational data changes', async () => {
  const customer = await createUser('customer', 'stale');
  const preview = await createDemoResetPreview({ actor: actor() });
  const lateOrder = await Order.create({ orderNumber: 'LATE-RESET-ORDER', customer: customer._id });

  await assert.rejects(
    executeDemoReset({
      actor: actor(),
      body: {
        previewId: preview.previewId,
        planHash: preview.planHash,
        password: ADMIN_PASSWORD,
        phrase: 'RESET DEMO ENVIRONMENT',
        idempotencyKey: 'reset-demo-environment-stale-1',
      },
    }),
    (error) => error.code === 'PREVIEW_STALE',
  );
  assert.ok(await User.exists({ _id: customer._id }));
  assert.ok(await Order.exists({ _id: lateOrder._id }));
  assert.ok(await User.exists({ _id: admin._id }));
});
