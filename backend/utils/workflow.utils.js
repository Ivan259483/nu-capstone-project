/**
 * ═══════════════════════════════════════════════════════════════════════
 *  WORKFLOW ORCHESTRATOR — AutoSPF+ System Pipeline Engine
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Central event-driven orchestrator that listens to order status
 *  transitions and triggers the next step automatically.
 *
 *  Status Flow:
 *    pending → confirmed → received → in_progress → completed → paid → released
 *
 *  Each transition triggers side-effects (notifications, inventory,
 *  loyalty, receipts) without requiring manual admin intervention.
 */

import { getIO } from './socket.utils.js';
import { sendExpoPushNotification } from './push.utils.js';
import { reserveInventory, commitReservation, releaseReservation } from './inventory.utils.js';
import User from '../models/user.model.js';
import Service from '../models/service.model.js';
import Notification from '../models/notification.model.js';
import { logActivity } from './logActivity.utils.js';
import emailService from './emailService.utils.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const safeEmit = (event, payload, rooms = []) => {
  try {
    const io = getIO();
    for (const room of rooms) {
      io.to(room).emit(event, payload);
    }
    // Also emit globally for dashboard listeners
    io.emit(event, payload);
  } catch (err) {
    console.warn(`[WORKFLOW] Socket emit failed for ${event}:`, err.message);
  }
};

const getCustomerId = (order) => {
  if (!order.customer) return null;
  return typeof order.customer === 'object'
    ? order.customer._id?.toString() || order.customer.toString()
    : order.customer.toString();
};

const pushToCustomer = async (order, title, body, data = {}) => {
  try {
    const customerId = getCustomerId(order);
    if (!customerId) return;

    const customer = await User.findById(customerId);
    if (customer?.expoPushTokens?.length) {
      await sendExpoPushNotification(customer.expoPushTokens, title, body, {
        orderId: order._id?.toString(),
        ...data,
      });
    }
  } catch (err) {
    console.warn('[WORKFLOW] Push notification failed:', err.message);
  }
};

const createNotification = async ({ title, message, type = 'booking', recipientRole = 'admin_family', recipientUserId = null, link, metadata }) => {
  try {
    const notification = await Notification.create({ title, message, type, recipientRole, recipientUserId, link, metadata });
    return notification;
  } catch (err) {
    console.error('[WORKFLOW] Notification creation failed:', err.message);
    return null;
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════

/**
 * Called after every order status change.
 * Determines which side-effects to trigger based on the transition.
 *
 * @param {Document} order        - The Mongoose order document (already saved with new status)
 * @param {string}   prevStatus   - The previous status value
 * @param {{ id, name, role }} actor - The user who triggered the change (optional)
 */
export const onOrderStatusChange = async (order, prevStatus, actor = null) => {
  const newStatus = order.status;
  const customerId = getCustomerId(order);
  const rooms = ['admin:chat'];
  if (customerId) rooms.push(`user:${customerId}`);

  const orderRef = order.bookingReference || order.orderNumber || order._id?.toString();

  console.log(`[WORKFLOW] ${orderRef}: ${prevStatus} → ${newStatus}`);

  // ── pending → confirmed / assigned ──────────────────────────────
  if (prevStatus === 'pending' && (newStatus === 'confirmed' || newStatus === 'assigned')) {
    await onConfirmed(order, orderRef, customerId, rooms, actor);
  }

  // ── confirmed/assigned → received (check-in) ───────────────────
  if (['pending', 'confirmed', 'assigned'].includes(prevStatus) && newStatus === 'received') {
    await onCheckedIn(order, orderRef, customerId, rooms);
  }

  // ── received → in_progress ───────────────────────────────────────
  if (prevStatus === 'received' && newStatus === 'in_progress') {
    await onServiceStarted(order, orderRef, customerId, rooms);
  }

  // ── in_progress → completed (QC done) ────────────────────────────
  if (prevStatus === 'in_progress' && newStatus === 'completed') {
    await onQCComplete(order, orderRef, customerId, rooms);
  }

  // ── completed → paid (POS settlement) ────────────────────────────
  if (['completed', 'in_progress', 'received'].includes(prevStatus) && newStatus === 'paid') {
    await onPaid(order, orderRef, customerId, rooms);
  }

  // ── paid → released ──────────────────────────────────────────────
  if (prevStatus === 'paid' && newStatus === 'released') {
    await onReleased(order, orderRef, customerId, rooms);
  }

  // ── any → cancelled ──────────────────────────────────────────────
  if (newStatus === 'cancelled' && prevStatus !== 'cancelled') {
    await onCancelled(order, orderRef, customerId, rooms);
  }
};

// ═══════════════════════════════════════════════════════════════════════
//  TRANSITION HANDLERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * pending → confirmed
 *  1. Auto-create job order sub-doc
 *  2. Reserve inventory
 *  3. Emit staff queue event
 *  4. Push notification to customer
 */
async function onConfirmed(order, orderRef, customerId, rooms, actor) {
  // 1. Auto-populate job order if empty
  if (!order.jobOrder?.ingressDateTime) {
    order.jobOrder = {
      contactNumber: order.customerPhone || '',
      ingressDateTime: order.bookingDate
        ? new Date(`${order.bookingDate}T${order.bookingTime || '09:00'}`)
        : new Date(),
      serviceCategory: order.serviceType || '',
      estimatedDays: 1,
      ...(order.jobOrder || {}),
    };
  }

  // 2. Reserve inventory materials
  try {
    const result = await reserveInventory(order);
    if (result.warnings?.length) {
      console.warn(`[WORKFLOW] Inventory warnings for ${orderRef}:`, result.warnings);
    }
  } catch (err) {
    console.error(`[WORKFLOW] Inventory reservation failed for ${orderRef}:`, err.message);
  }

  // 3. Save the updated order
  await order.save();

  // 4. Emit workflow event for staff queue dashboard
  safeEmit('workflow:job_queued', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    service: order.serviceType,
    date: order.bookingDate,
    time: order.bookingTime,
    customerName: order.customerName,
    vehicle: `${order.vehicleYear || ''} ${order.vehicleMake || ''} ${order.vehicleModel || ''}`.trim(),
    timestamp: new Date().toISOString(),
  }, rooms);

  // 5. Staff queue notification
  await createNotification({
    title: 'New Job in Queue',
    message: `Booking ${orderRef} confirmed — ${order.serviceType || 'Service'} for ${order.customerName || 'Customer'}`,
    type: 'booking',
    recipientRole: 'admin_family',
    link: '/admin/dashboard?tab=queue',
    metadata: { orderId: order._id, bookingRef: orderRef },
  });

  // 6. Customer push notification
  await pushToCustomer(order, 'Booking Confirmed ✓', `Your AutoSPF+ appointment (${orderRef}) is confirmed! We'll notify you when your vehicle check-in begins.`);

  // 7. Customer in-app notification
  if (customerId) {
    const notif = await createNotification({
      title: 'Booking Confirmed',
      message: `Your booking ${orderRef} is confirmed. Schedule: ${order.bookingDate || 'TBD'} at ${order.bookingTime || 'TBD'}.`,
      type: 'booking',
      recipientRole: 'customer',
      recipientUserId: customerId,
      link: '/customer/dashboard?tab=tracking',
      metadata: { orderId: order._id, customerId },
    });
    if (notif) {
      try {
        getIO().to(`user:${customerId}`).emit('notification:customer', {
          id: notif._id,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          isRead: false,
          createdAt: notif.createdAt,
          link: notif.link,
        });
      } catch (_) { /* socket may not be connected */ }
    }
  }

  console.log(`[WORKFLOW] ✅ ${orderRef}: Confirmed → Job queued, inventory reserved`);
}

/**
 * confirmed → received (check-in)
 */
async function onCheckedIn(order, orderRef, customerId, rooms) {
  // Auto-set customerStatus
  if (!order.customerStatus || !['queued', 'Queued'].includes(order.customerStatus)) {
    order.customerStatus = 'queued';
    order.customerStatusUpdatedAt = new Date();
    await order.save();
  }

  safeEmit('workflow:checked_in', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    customerName: order.customerName,
    timestamp: new Date().toISOString(),
  }, rooms);

  await pushToCustomer(order, 'Vehicle Received', `Your vehicle has been checked in at AutoSPF+. Our team is preparing your service.`);

  console.log(`[WORKFLOW] ✅ ${orderRef}: Checked in → customerStatus=queued`);
}

/**
 * received → in_progress
 */
async function onServiceStarted(order, orderRef, customerId, rooms) {
  if (order.customerStatus !== 'in-progress') {
    order.customerStatus = 'in-progress';
    order.customerStatusUpdatedAt = new Date();
    await order.save();
  }

  safeEmit('workflow:service_started', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    detailerName: order.assignedDetailer?.name || null,
    timestamp: new Date().toISOString(),
  }, rooms);

  await pushToCustomer(order, 'Service Started 🔧', `Our team has started working on your vehicle!`);

  console.log(`[WORKFLOW] ✅ ${orderRef}: Service started → customerStatus=in-progress`);
}

/**
 * in_progress → completed (QC done)
 */
async function onQCComplete(order, orderRef, customerId, rooms) {
  if (order.customerStatus !== 'finishing') {
    order.customerStatus = 'finishing';
    order.customerStatusUpdatedAt = new Date();
    await order.save();
  }

  safeEmit('workflow:qc_complete', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    timestamp: new Date().toISOString(),
  }, rooms);

  await pushToCustomer(order, 'Quality Check Complete ✅', `Your vehicle has passed our quality inspection! Final settlement is being prepared.`);

  console.log(`[WORKFLOW] ✅ ${orderRef}: QC complete → customerStatus=finishing`);
}

/**
 * completed → paid (POS settlement)
 *  1. Commit inventory reservation → final deduction
 *  2. Award loyalty points
 *  3. Update customerStatus → ready
 *  4. Send notifications
 */
async function onPaid(order, orderRef, customerId, rooms) {
  // 1. Commit inventory reservation
  try {
    await commitReservation(order);
  } catch (err) {
    console.error(`[WORKFLOW] Inventory commit failed for ${orderRef}:`, err.message);
  }

  // 2. Award loyalty points (5% back)
  try {
    await awardLoyaltyPoints(order);
  } catch (err) {
    console.error(`[WORKFLOW] Loyalty points failed for ${orderRef}:`, err.message);
  }

  // 3. Update customerStatus
  if (order.customerStatus !== 'ready') {
    order.customerStatus = 'ready';
    order.customerStatusUpdatedAt = new Date();
  }

  await order.save();

  // 4. Emit events
  safeEmit('workflow:payment_complete', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    invoiceId: order.invoiceId,
    amount: order.totalPrice || order.totalAmount,
    timestamp: new Date().toISOString(),
  }, rooms);

  await pushToCustomer(order, 'Payment Confirmed 💳', `Payment received for your booking ${orderRef}. Your vehicle is ready for release!`);

  // 5. Auto-send digital receipt email
  try {
    await sendReceiptEmail(order, orderRef);
  } catch (err) {
    console.error(`[WORKFLOW] Receipt email failed for ${orderRef}:`, err.message);
  }

  console.log(`[WORKFLOW] ✅ ${orderRef}: Paid → Inventory committed, loyalty credited, receipt sent, customerStatus=ready`);
}

/**
 * paid → released
 */
async function onReleased(order, orderRef, customerId, rooms) {
  // Update customer tracker status to completed
  if (order.customerStatus !== 'completed') {
    order.customerStatus = 'completed';
    order.customerStatusUpdatedAt = new Date();
    await order.save();
  }

  safeEmit('workflow:released', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    customerName: order.customerName,
    timestamp: new Date().toISOString(),
  }, rooms);

  // Customer notification
  if (customerId) {
    const notif = await createNotification({
      title: 'Vehicle Released',
      message: `Your vehicle has been released. Thank you for choosing AutoSPF+!`,
      type: 'success',
      recipientRole: 'customer',
      recipientUserId: customerId,
      link: '/customer/dashboard?tab=bookings',
      metadata: { orderId: order._id, customerId },
    });
    if (notif) {
      try {
        getIO().to(`user:${customerId}`).emit('notification:customer', {
          id: notif._id,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          isRead: false,
          createdAt: notif.createdAt,
          link: notif.link,
        });
      } catch (_) { /* socket may not be connected */ }
    }
  }

  await pushToCustomer(order, 'Vehicle Released! 🚗', `Your vehicle is ready for pickup. Thank you for choosing AutoSPF+!`);

  console.log(`[WORKFLOW] ✅ ${orderRef}: Released → customerStatus=completed, customer notified`);
}

/**
 * any → cancelled
 */
async function onCancelled(order, orderRef, customerId, rooms) {
  // Release inventory reservation
  try {
    await releaseReservation(order);
    await order.save();
  } catch (err) {
    console.error(`[WORKFLOW] Inventory release failed for ${orderRef}:`, err.message);
  }

  safeEmit('workflow:cancelled', {
    orderId: order._id?.toString(),
    bookingRef: orderRef,
    timestamp: new Date().toISOString(),
  }, rooms);

  await pushToCustomer(order, 'Booking Cancelled', `Your booking ${orderRef} has been cancelled. Contact us if you have questions.`);

  console.log(`[WORKFLOW] ✅ ${orderRef}: Cancelled → Inventory released`);
}

// ═══════════════════════════════════════════════════════════════════════
//  LOYALTY POINTS — 5% back + tier calculation
// ═══════════════════════════════════════════════════════════════════════

async function awardLoyaltyPoints(order) {
  const customerId = getCustomerId(order);
  if (!customerId) return;

  const totalAmount = order.totalAmount || order.totalPrice || 0;
  if (totalAmount <= 0) return;

  const customer = await User.findById(customerId);
  if (!customer) return;

  const pointsEarned = Math.floor(totalAmount * 0.05);
  customer.loyaltyPoints = (customer.loyaltyPoints || 0) + pointsEarned;

  // Tier calculation
  const currentPoints = customer.loyaltyPoints;
  let newTier = 'Bronze';
  if (currentPoints >= 10000) newTier = 'Platinum';
  else if (currentPoints >= 5000) newTier = 'Gold';
  else if (currentPoints >= 2000) newTier = 'Silver';

  const previousTier = customer.loyaltyTier;
  customer.loyaltyTier = newTier;
  await customer.save();

  console.log(`[LOYALTY] Awarded ${pointsEarned} points to user ${customerId}. Total: ${currentPoints}. Tier: ${newTier}`);

  // Notify customer about points
  try {
    const notif = await createNotification({
      title: `+${pointsEarned} Loyalty Points`,
      message: `You earned ${pointsEarned} loyalty points from your booking!${previousTier !== newTier ? ` You've been upgraded to ${newTier} tier! 🎉` : ''}`,
      type: 'success',
      recipientRole: 'customer',
      recipientUserId: customerId,
      link: '/customer/dashboard?tab=loyalty',
      metadata: { customerId, pointsEarned, totalPoints: currentPoints, tier: newTier },
    });
    if (notif) {
      try {
        getIO().to(`user:${customerId}`).emit('notification:customer', {
          id: notif._id,
          title: notif.title,
          message: notif.message,
          type: notif.type,
          isRead: false,
          createdAt: notif.createdAt,
        });
      } catch (_) { /* socket may not be connected */ }
    }
  } catch (_) { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════════════
//  AUTO RECEIPT EMAIL — sent after POS settlement
// ═══════════════════════════════════════════════════════════════════════

async function sendReceiptEmail(order, orderRef) {
  const customerId = getCustomerId(order);
  if (!customerId) return;

  const customer = await User.findById(customerId);
  if (!customer?.email) {
    console.warn(`[WORKFLOW] No email for customer ${customerId}, skipping receipt email`);
    return;
  }

  // Resolve service name
  let serviceName = order.serviceType || 'Premium Detailing';
  if (order.items?.length && order.items[0]?.product) {
    try {
      const svc = await Service.findById(order.items[0].product);
      if (svc?.name) serviceName = svc.name;
    } catch (_) { /* use fallback */ }
  }

  const totalAmount = order.totalAmount || order.totalPrice || 0;
  const pointsEarned = totalAmount > 0 ? Math.floor(totalAmount * 0.05) : 0;

  const receiptData = {
    bookingReference: order.bookingReference || orderRef,
    orderNumber: order.orderNumber,
    customerName: customer.name || order.customerName || 'Valued Customer',
    serviceName,
    vehicleInfo: `${order.vehicleYear || ''} ${order.vehicleMake || ''} ${order.vehicleModel || ''}`.trim() || 'N/A',
    plateNumber: order.vehiclePlate || 'N/A',
    detailerName: order.assignedDetailer?.name || null,
    downPayment: order.downPaymentAmount || null,
    finalPayment: order.finalPaymentAmount || null,
    totalAmount,
    paymentMethod: order.paymentMethod || order.paymentType || 'cash',
    pointsEarned: pointsEarned > 0 ? pointsEarned : null,
    totalPoints: customer.loyaltyPoints || 0,
    loyaltyTier: customer.loyaltyTier || 'Bronze',
  };

  const result = await emailService.sendDigitalReceiptEmail(customer.email, receiptData);
  if (result.success) {
    console.log(`[WORKFLOW] 🧾 Receipt email sent to ${customer.email} for ${orderRef}`);
  }
}

