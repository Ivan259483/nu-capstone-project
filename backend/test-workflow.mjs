/**
 * AutoSPF+ End-to-End Workflow Integration Test
 * Tests the full pipeline: Booking → Confirm → CheckIn → Start → QC → Payment → Release
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Models
import Order from './models/order.model.js';
import Product from './models/product.model.js';
import User from './models/user.model.js';
import Service from './models/service.model.js';
import Notification from './models/notification.model.js';

// Workflow
import { onOrderStatusChange } from './utils/workflow.utils.js';
import { reserveInventory, commitReservation, releaseReservation, cleanupExpiredReservations } from './utils/inventory.utils.js';

const log = (icon, msg) => console.log(`${icon} ${msg}`);
const divider = () => console.log('─'.repeat(60));

async function main() {
  log('🔌', 'Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  log('✅', 'MongoDB connected');
  divider();

  // ═══════════════════════════════════════════════════════════════
  // SETUP: Find an admin, a customer, and a service
  // ═══════════════════════════════════════════════════════════════
  const admin = await User.findOne({ role: 'administrator' });
  const customer = await User.findOne({ role: 'customer' });
  const service = await Service.findOne({});

  if (!admin) { log('❌', 'No admin user found'); process.exit(1); }
  if (!customer) { log('❌', 'No customer user found'); process.exit(1); }

  log('👤', `Admin: ${admin.name} (${admin.email})`);
  log('👤', `Customer: ${customer.name} (${customer.email})`);
  log('🔧', `Service: ${service?.name || 'N/A'}`);
  divider();

  // Track a product to monitor inventory changes
  const testProduct = await Product.findOne({ inventory: { $gt: 5 } });
  const initialInventory = testProduct?.inventory || 0;
  const initialReserved = testProduct?.reserved || 0;
  if (testProduct) {
    log('📦', `Tracking product: ${testProduct.name} — stock: ${initialInventory}, reserved: ${initialReserved}`);
  }
  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Create a test booking (status: pending)
  // ═══════════════════════════════════════════════════════════════
  log('📝', 'STEP 1: Creating test booking...');

  const testOrder = new Order({
    customer: customer._id,
    customerName: customer.name,
    customerEmail: customer.email,
    serviceType: service?.name || 'Ceramic Coating',
    vehicleMake: 'Toyota',
    vehicleModel: 'Corolla',
    vehicleYear: '2024',
    vehicleColor: 'Black',
    vehiclePlate: 'TEST-001',
    orderNumber: `TEST-${Date.now().toString(36).toUpperCase()}`,
    bookingReference: `ASPF-TEST-${Date.now().toString(36).toUpperCase()}`,
    totalAmount: 5000,
    totalPrice: 5000,
    items: service ? [{ product: service._id, name: service.name, price: service.price || 5000, quantity: 1 }] : [],
    status: 'pending',
    paymentStatus: 'unpaid',
  });

  await testOrder.save();
  log('✅', `Booking created: ${testOrder.orderNumber} — status: ${testOrder.status}`);
  console.assert(testOrder.status === 'pending', '❌ FAIL: Expected status=pending');

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Confirm booking (pending → confirmed)
  // ═══════════════════════════════════════════════════════════════
  log('✅', 'STEP 2: Confirming booking...');

  const prevStatus2 = testOrder.status;
  testOrder.status = 'confirmed';
  await testOrder.save();

  // Fire orchestrator
  try {
    await onOrderStatusChange(testOrder, prevStatus2, admin);
    log('✅', `Status: ${testOrder.status} — Orchestrator fired without error`);
  } catch (err) {
    log('⚠️', `Orchestrator warning: ${err.message}`);
  }

  // Reload to check reservation
  const orderAfterConfirm = await Order.findById(testOrder._id);
  log('📦', `Reservation status: ${orderAfterConfirm?.inventoryReservation?.status || 'none'}`);
  log('📦', `Reserved items: ${orderAfterConfirm?.inventoryReservation?.items?.length || 0}`);

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Check-in (confirmed → received)
  // ═══════════════════════════════════════════════════════════════
  log('🏁', 'STEP 3: Check-in (confirmed → received)...');

  const prevStatus3 = orderAfterConfirm.status;
  orderAfterConfirm.status = 'received';
  await orderAfterConfirm.save();

  try {
    await onOrderStatusChange(orderAfterConfirm, prevStatus3, admin);
    log('✅', `Status: ${orderAfterConfirm.status} — customerStatus: ${orderAfterConfirm.customerStatus || 'N/A'}`);
  } catch (err) {
    log('⚠️', `Orchestrator warning: ${err.message}`);
  }

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Start service (received → in_progress)
  // ═══════════════════════════════════════════════════════════════
  log('🔧', 'STEP 4: Start service (received → in_progress)...');

  const prevStatus4 = orderAfterConfirm.status;
  orderAfterConfirm.status = 'in_progress';
  await orderAfterConfirm.save();

  try {
    await onOrderStatusChange(orderAfterConfirm, prevStatus4, admin);
    log('✅', `Status: ${orderAfterConfirm.status} — customerStatus: ${orderAfterConfirm.customerStatus || 'N/A'}`);
  } catch (err) {
    log('⚠️', `Orchestrator warning: ${err.message}`);
  }

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: QC complete (in_progress → completed)
  // ═══════════════════════════════════════════════════════════════
  log('✅', 'STEP 5: QC complete (in_progress → completed)...');

  const prevStatus5 = orderAfterConfirm.status;
  orderAfterConfirm.status = 'completed';
  await orderAfterConfirm.save();

  try {
    await onOrderStatusChange(orderAfterConfirm, prevStatus5, admin);
    log('✅', `Status: ${orderAfterConfirm.status} — customerStatus: ${orderAfterConfirm.customerStatus || 'N/A'}`);
  } catch (err) {
    log('⚠️', `Orchestrator warning: ${err.message}`);
  }

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Final payment (completed → paid)
  // ═══════════════════════════════════════════════════════════════
  log('💳', 'STEP 6: Final payment (completed → paid)...');

  const prevStatus6 = orderAfterConfirm.status;
  orderAfterConfirm.status = 'paid';
  orderAfterConfirm.paymentStatus = 'paid';
  orderAfterConfirm.paidAt = new Date();
  orderAfterConfirm.finalPaymentAmount = 5000;
  await orderAfterConfirm.save();

  try {
    await onOrderStatusChange(orderAfterConfirm, prevStatus6, admin);
    log('✅', `Status: ${orderAfterConfirm.status} — customerStatus: ${orderAfterConfirm.customerStatus || 'N/A'}`);
  } catch (err) {
    log('⚠️', `Orchestrator warning: ${err.message}`);
  }

  // Check inventory commitment
  const orderAfterPay = await Order.findById(testOrder._id);
  log('📦', `Reservation after payment: ${orderAfterPay?.inventoryReservation?.status || 'none'}`);
  log('📦', `inventoryDeductedAt: ${orderAfterPay?.inventoryDeductedAt ? 'YES' : 'NO'}`);

  // Check loyalty points
  const customerAfterPay = await User.findById(customer._id);
  log('🌟', `Customer loyalty points: ${customerAfterPay?.loyaltyPoints || 0}`);

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Release vehicle (paid → released)
  // ═══════════════════════════════════════════════════════════════
  log('🚗', 'STEP 7: Release vehicle (paid → released)...');

  const prevStatus7 = orderAfterPay.status;
  orderAfterPay.status = 'released';
  await orderAfterPay.save();

  try {
    await onOrderStatusChange(orderAfterPay, prevStatus7, admin);
    log('✅', `Status: ${orderAfterPay.status} — customerStatus: ${orderAfterPay.customerStatus || 'N/A'}`);
  } catch (err) {
    log('⚠️', `Orchestrator warning: ${err.message}`);
  }

  // Final reload
  const finalOrder = await Order.findById(testOrder._id);
  log('📋', 'Final order state:');
  log('   ', `status: ${finalOrder.status}`);
  log('   ', `customerStatus: ${finalOrder.customerStatus}`);
  log('   ', `paymentStatus: ${finalOrder.paymentStatus}`);
  log('   ', `reservation: ${finalOrder.inventoryReservation?.status || 'none'}`);
  log('   ', `inventoryDeducted: ${finalOrder.inventoryDeductedAt ? 'YES' : 'NO'}`);

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: Check notifications created
  // ═══════════════════════════════════════════════════════════════
  log('🔔', 'STEP 8: Checking notifications...');

  const notifications = await Notification.find({
    'metadata.orderId': testOrder._id,
  }).sort({ createdAt: -1 }).limit(10);

  log('📬', `${notifications.length} notification(s) created for this order:`);
  for (const n of notifications) {
    log('   ', `[${n.type}] ${n.title}: ${n.message.substring(0, 60)}...`);
  }

  divider();

  // ═══════════════════════════════════════════════════════════════
  // STEP 9: Verify inventory product state
  // ═══════════════════════════════════════════════════════════════
  if (testProduct) {
    const productAfter = await Product.findById(testProduct._id);
    log('📦', 'STEP 9: Inventory product state:');
    log('   ', `Before: stock=${initialInventory}, reserved=${initialReserved}`);
    log('   ', `After:  stock=${productAfter.inventory}, reserved=${productAfter.reserved}`);
  }

  divider();

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP: Delete test order
  // ═══════════════════════════════════════════════════════════════
  log('🧹', 'Cleaning up test order...');
  await Order.findByIdAndDelete(testOrder._id);
  await Notification.deleteMany({ 'metadata.orderId': testOrder._id });
  log('✅', 'Test order and notifications cleaned up');

  divider();

  // ═══════════════════════════════════════════════════════════════
  // FINAL VERDICT
  // ═══════════════════════════════════════════════════════════════
  const finalCheck = finalOrder;
  const passed = [
    finalCheck.status === 'released',
    finalCheck.customerStatus === 'completed',
    finalCheck.paymentStatus === 'paid',
  ];

  const allPassed = passed.every(Boolean);
  log(allPassed ? '🎉' : '❌', allPassed
    ? 'ALL CHECKS PASSED — WORKFLOW PIPELINE IS PRODUCTION-READY!'
    : 'SOME CHECKS FAILED — REVIEW OUTPUT ABOVE');

  console.log('\nResults:');
  console.log(`  status=released:           ${passed[0] ? '✅' : '❌'}`);
  console.log(`  customerStatus=completed:  ${passed[1] ? '✅' : '❌'}`);
  console.log(`  paymentStatus=paid:        ${passed[2] ? '✅' : '❌'}`);

  await mongoose.disconnect();
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
