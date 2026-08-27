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
import { reserveInventory, commitReservation, releaseReservation } from './inventory.utils.js';
import User from '../models/user.model.js';
import { logActivity } from './logActivity.utils.js';
import {
  createCustomerBookingCancelledNotification,
  createCustomerPaymentConfirmedNotification,
  createCustomerStageNotification,
} from './customerStageNotifications.utils.js';
import { notifyCustomerReceiptReady } from './customerReceiptNotification.utils.js';
import { createCustomerNotification } from '../services/customerNotification.service.js';
import {
  buildAdminDeepLink,
  buildAdminGroupingKey,
  createAdminNotification,
} from '../services/adminNotification.service.js';
import { handleQualityStageTransition } from '../services/qualityNotification.service.js';
import { runTrackedSystemMutation } from '../middleware/systemLifecycle.middleware.js';

// ─── Helpers ─────────────────────────────────────────────────────────

const safeEmit = (event, payload, rooms = []) => {
  try {
    const io = getIO();
    for (const room of rooms) {
      io.to(room).emit(event, payload);
    }
    // Staff dashboards receive the broad workflow event only after an
    // authenticated staff + 2FA socket handshake. Customer rooms above remain
    // targeted to the owning customer.
    io.to('realtime:staff').emit(event, payload);
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
const performOrderStatusChange = async (order, prevStatus, actor = null) => {
  const newStatus = order.status;
  const customerId = getCustomerId(order);
  const rooms = ['admin:chat'];
  if (customerId) rooms.push(`user:${customerId}`);

  const orderRef = order.bookingReference || order.orderNumber || order._id?.toString();

  console.log(`[WORKFLOW] ${orderRef}: ${prevStatus} → ${newStatus}`);

  // Keep the internal Quality inbox consistent for every canonical order path
  // (including POS/legacy endpoints that do not use the QC controller).
  try {
    await handleQualityStageTransition(order, prevStatus, newStatus);
  } catch (err) {
    console.warn('[WORKFLOW] Quality notification synchronization failed:', err.message);
  }

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

export const onOrderStatusChange = (order, prevStatus, actor = null) => (
  runTrackedSystemMutation(
    () => performOrderStatusChange(order, prevStatus, actor),
  )
);

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
  try {
    await createAdminNotification({
      title: 'New job in queue',
      message: `Booking ${orderRef} was confirmed — ${order.serviceType || 'Service'} for ${order.customerName || 'Customer'}.`,
      category: 'live_tracking',
      event: 'job_queued',
      severity: 'info',
      source: 'Live Tracking',
      actionRequired: false,
      groupingKey: buildAdminGroupingKey('live_tracking', 'job_queued', order._id),
      groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('live_tracking', { orderId: String(order._id) }),
      action: { label: 'Open job' },
      metadata: { orderId: order._id, bookingRef: orderRef, actor },
    });
  } catch (err) {
    console.error('[WORKFLOW] Admin queue notification failed:', err.message);
  }

  // 6. Customer database/socket/push/email notification (idempotent).
  if (customerId) {
    await createCustomerStageNotification(order, 'confirmed');
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

  if (customerId) {
    await createCustomerStageNotification(order, 'received');
  }

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

  const hasAssignedTechnician = Boolean(
    order.assignedDetailer
      || (Array.isArray(order.serviceStaffAssignments) && order.serviceStaffAssignments.length > 0),
  );
  try {
    await createAdminNotification({
      title: hasAssignedTechnician ? 'Job in progress' : 'Job started without a technician',
      message: hasAssignedTechnician
        ? `${orderRef} was moved to In Progress.`
        : `${orderRef} is In Progress but has no technician assignment.`,
      category: 'live_tracking',
      event: hasAssignedTechnician ? 'job_in_progress' : 'unassigned_technician',
      severity: hasAssignedTechnician ? 'info' : 'warning',
      source: 'Live Tracking',
      actionRequired: !hasAssignedTechnician,
      groupingKey: buildAdminGroupingKey(
        'live_tracking',
        hasAssignedTechnician ? 'job_in_progress' : 'unassigned_technician',
        order._id,
      ),
      groupingWindowMs: 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('live_tracking', { orderId: String(order._id) }),
      action: { label: hasAssignedTechnician ? 'View job' : 'Assign technician' },
      metadata: {
        orderId: order._id,
        bookingRef: orderRef,
        assignedDetailerId: order.assignedDetailer?._id || order.assignedDetailer || null,
        serviceStaffAssignments: order.serviceStaffAssignments || [],
      },
    });
  } catch (err) {
    console.error('[WORKFLOW] Service-start notification failed:', err.message);
  }

  if (customerId) {
    await createCustomerStageNotification(order, 'in_progress');
  }

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

  try {
    await createAdminNotification({
      title: order.serviceTrackingStage === 'ready_pickup'
        ? 'Service ready for pickup'
        : 'Service completed',
      message: `${orderRef} completed service and is ready for the next operational step.`,
      category: 'live_tracking',
      event: order.serviceTrackingStage === 'ready_pickup' ? 'ready_for_pickup' : 'service_completed',
      severity: 'success',
      source: 'Live Tracking',
      actionRequired: false,
      groupingKey: buildAdminGroupingKey('live_tracking', 'service_completed', order._id),
      groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('live_tracking', { orderId: String(order._id) }),
      action: { label: 'View job' },
      metadata: { orderId: order._id, bookingRef: orderRef, stage: order.serviceTrackingStage },
    });
  } catch (err) {
    console.error('[WORKFLOW] Completion notification failed:', err.message);
  }

  if (customerId) {
    await createCustomerStageNotification(
      order,
      order.serviceTrackingStage === 'ready_pickup' ? 'ready_pickup' : 'quality_check'
    );
  }

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

  if (customerId) {
    await createCustomerPaymentConfirmedNotification(order, {
      invoiceId: order.invoiceId,
      amount: order.totalPrice || order.totalAmount,
    });
  }

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

  // Customer notification, idempotent with controller-created records
  if (customerId) {
    await createCustomerStageNotification(order, 'released');
  }

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

  try {
    await createAdminNotification({
      title: 'Booking cancelled',
      message: `${orderRef} was cancelled${order.customerName ? ` for ${order.customerName}` : ''}.`,
      category: 'appointments',
      event: 'booking_cancelled',
      severity: 'warning',
      source: 'Appointments',
      actionRequired: false,
      groupingKey: buildAdminGroupingKey('appointments', 'booking_cancelled', order._id),
      groupingWindowMs: 30 * 24 * 60 * 60 * 1000,
      link: buildAdminDeepLink('appointments', { orderId: String(order._id) }),
      action: { label: 'View appointment' },
      metadata: { orderId: order._id, bookingRef: orderRef, status: order.status },
    });
  } catch (err) {
    console.error('[WORKFLOW] Cancellation notification failed:', err.message);
  }

  if (customerId) {
    await createCustomerBookingCancelledNotification(order);
  }

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
    await createCustomerNotification({
      userId: customerId,
      title: `+${pointsEarned} Loyalty Points`,
      message: `You earned ${pointsEarned} loyalty points from your booking!${previousTier !== newTier ? ` You've been upgraded to ${newTier} tier! 🎉` : ''}`,
      type: 'system',
      event: 'loyalty_points_earned',
      category: 'system',
      link: '/customer/dashboard?tab=loyalty',
      actionType: 'profile',
      actionLabel: 'View profile',
      eventKey: `customer:${customerId}:order:${order._id}:event:loyalty_points_earned`,
      metadata: { orderId: order._id, pointsEarned, totalPoints: currentPoints, tier: newTier },
    });
  } catch (_) { /* non-fatal */ }
}

// ═══════════════════════════════════════════════════════════════════════
//  AUTO RECEIPT EMAIL — sent after POS settlement
// ═══════════════════════════════════════════════════════════════════════

async function sendReceiptEmail(order, orderRef) {
  const customerId = getCustomerId(order);
  if (!customerId) return;
  if (!order.invoiceId) return;

  const notification = await notifyCustomerReceiptReady({
    customerId,
    orderId: order._id,
    orderNumber: order.orderNumber,
    bookingReference: order.bookingReference || orderRef,
    invoiceNumber: order.invoiceId,
    paymentId: null,
    amountCollected: order.finalPaymentAmount || order.amountCollected || order.totalAmount || order.totalPrice || 0,
  });
  if (notification) {
    console.log(`[WORKFLOW] 🧾 Receipt notification synced for ${orderRef}`);
  }
}
