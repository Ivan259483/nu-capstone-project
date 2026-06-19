import Notification from '../models/notification.model.js';
import Order from '../models/order.model.js';
import User from '../models/user.model.js';
import Customer from '../models/customer.model.js';
import { getIO } from './socket.utils.js';
import { countGatePhotos, REQUIRED_GATE_PHOTOS } from './trackerGatePhotos.utils.js';
import { computeOrderBalanceDue } from './readyPickupPaymentFlow.utils.js';
import { sendCustomerNotificationEmail } from './mail.utils.js';

const EMAIL_STATUSES = {
  PENDING: 'pending',
  SENDING: 'sending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

const EMAIL_WORTHY_KINDS = new Set([
  'confirmed',
  'received',
  'in_progress',
  'quality_check',
  'payment_due',
  'receipt_ready',
  'ready_pickup',
]);

const MEDIA_EMAIL_STAGES = new Set(['received', 'in_progress', 'quality_check', 'ready_pickup']);

export const CUSTOMER_STAGE_MESSAGES = {
  confirmed: {
    title: 'Appointment Confirmed',
    subject: 'Your AutoSPF+ appointment is confirmed',
    stageLabel: 'Appointment confirmed',
  },
  received: {
    title: 'Vehicle Arrived',
    subject: 'Your vehicle has arrived at the shop',
    stageLabel: 'Vehicle arrived',
  },
  in_progress: {
    title: 'Service In Progress',
    subject: 'Service has started on your vehicle',
    stageLabel: 'Service in progress',
  },
  quality_check: {
    title: 'Quality Check Underway',
    subject: 'Your vehicle is now in quality check',
    stageLabel: 'Quality check underway',
  },
  ready_pickup: {
    title: 'Ready for Pickup',
    subject: 'Your vehicle is ready for pickup',
    stageLabel: 'Ready for pickup',
  },
  released: {
    title: 'Vehicle Released',
    subject: 'Your vehicle has been released',
    stageLabel: 'Vehicle released',
  },
};

let customerNotificationEmailSender = sendCustomerNotificationEmail;

export function setCustomerNotificationEmailSenderForTests(sender) {
  customerNotificationEmailSender = sender || sendCustomerNotificationEmail;
}

export function getOrderCustomerId(order) {
  if (!order?.customer) return null;
  return typeof order.customer === 'object'
    ? order.customer?._id || order.customer
    : order.customer;
}

function idOf(value) {
  return value?._id?.toString?.() || value?.toString?.() || String(value || '');
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `₱${n.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

function vehicleLabel(order) {
  const linked = order?.vehicle && typeof order.vehicle === 'object' ? order.vehicle : {};
  return [
    order?.vehicleYear || linked.year,
    order?.vehicleMake || linked.make,
    order?.vehicleModel || linked.model,
  ]
    .filter(Boolean)
    .join(' ')
    || 'your vehicle';
}

function serviceLabel(order) {
  if (order?.serviceType) return order.serviceType;
  const itemName = Array.isArray(order?.items) ? order.items.map((i) => i?.name).find(Boolean) : '';
  return itemName || 'AutoSPF+ service';
}

function bookingRef(order) {
  return order?.bookingReference || order?.orderNumber || idOf(order?._id).slice(-8);
}

function trackerLink(orderId, stage) {
  const oid = encodeURIComponent(idOf(orderId));
  const st = encodeURIComponent(stage || '');
  return `/customer/dashboard?section=tracker&bookingId=${oid}${st ? `&stage=${st}` : ''}`;
}

function paymentLink(orderId) {
  return `/customer/dashboard?section=payments&bookingId=${encodeURIComponent(idOf(orderId))}`;
}

function receiptLink(orderId) {
  return `/customer/dashboard?section=payments&receiptOrderId=${encodeURIComponent(idOf(orderId))}`;
}

function buildIdempotencyKey({ customerId, orderId, kind, stage }) {
  return `customer:${idOf(customerId)}:order:${idOf(orderId)}:kind:${kind}:stage:${stage || 'none'}`;
}

function stageMediaCount(order, stage) {
  if (!stage) return 0;
  if (['received', 'in_progress', 'quality_check', 'ready_pickup'].includes(stage)) {
    return countGatePhotos(order, stage);
  }
  const rows = Array.isArray(order?.trackerStageMedia) ? order.trackerStageMedia : [];
  return rows.filter((entry) => entry?.stage === stage && String(entry?.photoUrl || '').trim()).length;
}

async function getLatestOrder(orderOrId) {
  const id = idOf(orderOrId?._id || orderOrId);
  if (!id) return null;
  return Order.findById(id)
    .populate('customer', 'name email')
    .populate('vehicle', 'year make model color plateNumber vehicleType');
}

async function resolveCustomerContact(order, spec) {
  const customerId = idOf(spec.customerId);
  const populated = order?.customer && typeof order.customer === 'object' ? order.customer : null;
  let user = populated;
  if (!user?.email && customerId) {
    user = await User.findById(customerId).select('name email');
  }

  const customerProfile = customerId
    ? await Customer.findOne({ user: customerId }).select('notificationPreferences')
    : null;
  const prefs = customerProfile?.notificationPreferences;

  let disabled = false;
  if (prefs?.emailEnabled === false) disabled = true;
  if (spec.kind === 'confirmed' && prefs?.bookingConfirmation === false) disabled = true;
  if (
    ['received', 'in_progress', 'quality_check', 'ready_pickup', 'stage_media'].includes(spec.kind)
    && prefs?.jobStatusUpdates === false
  ) {
    disabled = true;
  }
  if (['payment_due', 'receipt_ready'].includes(spec.kind) && prefs?.paymentReminders === false) {
    disabled = true;
  }

  return {
    email: String(user?.email || '').trim(),
    disabled,
  };
}

function emitCustomerNotification(customerId, notification) {
  try {
    if (!customerId || !notification) return;
    const io = getIO();
    io.to(`user:${idOf(customerId)}`).emit('notification:customer', {
      id: notification._id,
      title: notification.title,
      message: notification.message,
      type: notification.type,
      priority: notification.priority,
      isRead: notification.isRead === false ? false : Boolean(notification.isRead),
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
      link: notification.link,
      metadata: notification.metadata,
    });
  } catch (_) {
    /* socket optional */
  }
}

async function markEmailSkipped(notificationId, reason, subject) {
  return Notification.findOneAndUpdate(
    {
      _id: notificationId,
      $or: [
        { 'metadata.emailStatus': { $exists: false } },
        { 'metadata.emailStatus': { $nin: [EMAIL_STATUSES.SENDING, EMAIL_STATUSES.SENT] } },
      ],
    },
    {
      $set: {
        'metadata.emailSent': false,
        'metadata.emailStatus': EMAIL_STATUSES.SKIPPED,
        'metadata.emailSkippedReason': reason,
        ...(subject ? { 'metadata.emailSubject': subject } : {}),
      },
    },
    { new: true }
  );
}

async function maybeSendEmail({ notification, order, spec }) {
  const subject = spec.emailSubject || spec.title;
  if (!spec.emailWorthy) {
    return markEmailSkipped(notification._id, spec.emailSkippedReason || 'not_email_worthy', subject);
  }

  const contact = await resolveCustomerContact(order, spec);
  if (!contact.email) {
    return markEmailSkipped(notification._id, 'missing_customer_email', subject);
  }
  if (contact.disabled) {
    return markEmailSkipped(notification._id, 'customer_email_disabled', subject);
  }
  if (!process.env.RESEND_API_KEY) {
    return markEmailSkipped(notification._id, 'missing_resend_config', subject);
  }

  const claimed = await Notification.findOneAndUpdate(
    {
      _id: notification._id,
      $or: [
        { 'metadata.emailStatus': { $exists: false } },
        { 'metadata.emailStatus': { $nin: [EMAIL_STATUSES.SENDING, EMAIL_STATUSES.SENT] } },
      ],
    },
    {
      $set: {
        'metadata.emailSent': false,
        'metadata.emailStatus': EMAIL_STATUSES.SENDING,
        'metadata.emailSubject': subject,
        'metadata.emailSkippedReason': null,
      },
    },
    { new: true }
  );

  if (!claimed) return notification;

  const result = await customerNotificationEmailSender({
    to: contact.email,
    spec: {
      ...spec,
      subject,
      emailSubject: subject,
      link: spec.link,
    },
    idempotencyKey: spec.idempotencyKey,
  });

  if (result?.success) {
    return Notification.findByIdAndUpdate(
      notification._id,
      {
        $set: {
          'metadata.emailSent': true,
          'metadata.emailSentAt': new Date(),
          'metadata.emailStatus': EMAIL_STATUSES.SENT,
          'metadata.resendEmailId': result.messageId || result.id || null,
          'metadata.emailSubject': result.subject || subject,
          'metadata.emailError': null,
        },
      },
      { new: true }
    );
  }

  console.warn('[customerNotifications] Resend email failed:', result?.error || 'unknown error');
  return Notification.findByIdAndUpdate(
    notification._id,
    {
      $set: {
        'metadata.emailSent': false,
        'metadata.emailStatus': EMAIL_STATUSES.FAILED,
        'metadata.emailSubject': result?.subject || subject,
        'metadata.emailError': result?.error || 'Email send failed',
      },
    },
    { new: true }
  );
}

async function upsertNotificationFromSpec(spec, { reactivateUnread = false } = {}) {
  const now = new Date();
  const update = {
    $setOnInsert: {
      title: spec.title,
      message: spec.message,
      type: spec.type || 'booking',
      priority: spec.priority || 'normal',
      recipientRole: 'customer',
      recipientUserId: spec.customerId,
      link: spec.link,
      'metadata.customerId': idOf(spec.customerId),
      'metadata.orderId': idOf(spec.orderId),
      'metadata.kind': spec.kind,
      'metadata.stage': spec.stage || null,
      'metadata.idempotencyKey': spec.idempotencyKey,
      'metadata.serviceName': spec.serviceName,
      'metadata.vehicle': spec.vehicle,
      'metadata.bookingReference': spec.bookingReference,
      'metadata.orderNumber': spec.orderNumber || null,
      'metadata.amount': spec.amount || null,
      'metadata.emailStatus': spec.emailWorthy ? EMAIL_STATUSES.PENDING : EMAIL_STATUSES.SKIPPED,
      'metadata.emailSent': false,
      'metadata.emailSubject': spec.emailSubject || null,
      'metadata.emailSkippedReason': spec.emailWorthy ? null : (spec.emailSkippedReason || 'not_email_worthy'),
    },
    $set: {
      updatedAt: now,
      'metadata.mediaCount': spec.mediaCount || 0,
      'metadata.latestStatus': spec.status || null,
      'metadata.latestStage': spec.stage || null,
      'metadata.paymentStatus': spec.paymentStatus || null,
      'metadata.balanceDue': spec.balanceDue ?? null,
      'metadata.emailCategory': spec.emailCategory,
      'metadata.emailWorthy': Boolean(spec.emailWorthy),
      ...Object.fromEntries(
        Object.entries(spec.metadata || {}).map(([key, value]) => [`metadata.${key}`, value])
      ),
    },
  };

  if (reactivateUnread) {
    update.$set.isRead = false;
  } else {
    update.$setOnInsert.isRead = false;
  }

  try {
    return await Notification.findOneAndUpdate(
      {
        recipientUserId: spec.customerId,
        'metadata.idempotencyKey': spec.idempotencyKey,
      },
      update,
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    );
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return Notification.findOneAndUpdate(
      {
        recipientUserId: spec.customerId,
        'metadata.idempotencyKey': spec.idempotencyKey,
      },
      { $set: update.$set },
      { new: true }
    );
  }
}

async function persistAndNotify(order, spec, options = {}) {
  const notification = await upsertNotificationFromSpec(spec, options);
  const withEmailMetadata = await maybeSendEmail({ notification, order, spec });
  const finalNotification = withEmailMetadata || notification;
  emitCustomerNotification(spec.customerId, finalNotification);
  return finalNotification;
}

async function readyPickupEligibility(order, explicitBalanceDue) {
  const status = normalizeKey(order?.status);
  const stage = normalizeKey(order?.serviceTrackingStage);
  const paymentStatus = normalizeKey(order?.paymentStatus);
  const pickupEvidenceComplete = countGatePhotos(order, 'ready_pickup') >= REQUIRED_GATE_PHOTOS;
  const qcPassed = Boolean(order?.qcCompletedAt)
    || ['ready_pickup', 'completed', 'released'].includes(stage)
    || ['completed', 'paid', 'released'].includes(status);
  const statusAllowsPickup = ['ready_pickup', 'completed', 'released'].includes(stage)
    || ['ready_for_payment', 'completed', 'paid', 'released'].includes(status);
  const balanceDue = Number.isFinite(Number(explicitBalanceDue))
    ? Number(explicitBalanceDue)
    : await computeOrderBalanceDue(order);

  return {
    ok:
      statusAllowsPickup
      && qcPassed
      && pickupEvidenceComplete
      && paymentStatus === 'paid'
      && balanceDue <= 0,
    balanceDue,
  };
}

function stageMessage(order, stage, mediaCount) {
  const service = serviceLabel(order);
  const vehicle = vehicleLabel(order);
  const ref = bookingRef(order);
  if (stage === 'confirmed') {
    return `Your ${service} appointment for ${vehicle} is confirmed. Reference ${ref}. View your booking details.`;
  }
  if (stage === 'received') {
    return mediaCount > 0
      ? `Your vehicle has arrived at the shop. Intake has started and evidence photos are available.`
      : `Your vehicle has arrived at the shop. Our team is starting the intake check.`;
  }
  if (stage === 'in_progress') {
    return mediaCount > 0
      ? `Our technicians have started working on your vehicle. New progress updates are available.`
      : `Our technicians have started working on your vehicle.`;
  }
  if (stage === 'quality_check') {
    return mediaCount > 0
      ? `Your vehicle is undergoing final quality inspection. QC evidence is available in your live tracker.`
      : `Your vehicle is undergoing final quality inspection before release.`;
  }
  if (stage === 'ready_pickup') {
    return `Your vehicle passed final inspection and is ready for collection.`;
  }
  if (stage === 'released') {
    return `Your vehicle has been released/completed. Thank you for choosing AutoSPF+.`;
  }
  return `There is a new update for your ${service} booking.`;
}

function buildStageSpec(order, stage, { emailWorthy = EMAIL_WORTHY_KINDS.has(stage), balanceDue = null } = {}) {
  const customerId = getOrderCustomerId(order);
  const orderId = order?._id;
  const def = CUSTOMER_STAGE_MESSAGES[stage];
  if (!customerId || !orderId || !def) return null;

  const mediaCount = stageMediaCount(order, stage);
  const kind = stage;
  const idempotencyKey = buildIdempotencyKey({ customerId, orderId, kind, stage });

  return {
    customerId,
    orderId,
    kind,
    stage,
    idempotencyKey,
    title: def.title,
    message: stageMessage(order, stage, mediaCount),
    type: stage === 'released' ? 'success' : 'booking',
    priority: stage === 'ready_pickup' ? 'high' : 'normal',
    link: trackerLink(orderId, stage),
    ctaPath: trackerLink(orderId, stage),
    ctaLabel: stage === 'confirmed' ? 'View booking' : 'Open live tracker',
    emailSubject: def.subject,
    emailCategory: kind,
    emailWorthy,
    emailSkippedReason: emailWorthy ? null : 'not_email_worthy',
    bookingReference: bookingRef(order),
    orderNumber: order.orderNumber || null,
    vehicle: vehicleLabel(order),
    serviceName: serviceLabel(order),
    stageLabel: def.stageLabel,
    status: order.status || null,
    paymentStatus: order.paymentStatus || null,
    mediaCount,
    balanceDue,
  };
}

async function buildPaymentDueSpec(order, { balanceDue, emailWorthy = true, emailSkippedReason = null } = {}) {
  const customerId = getOrderCustomerId(order);
  const orderId = order?._id;
  if (!customerId || !orderId) return null;

  const due = Number.isFinite(Number(balanceDue)) ? Number(balanceDue) : await computeOrderBalanceDue(order);
  const amountLabel = formatCurrency(due);
  const kind = 'payment_due';
  const stage = 'payment_due';
  return {
    customerId,
    orderId,
    kind,
    stage,
    idempotencyKey: buildIdempotencyKey({ customerId, orderId, kind, stage }),
    title: 'Payment Update',
    message: amountLabel
      ? `Your vehicle passed inspection and is ready for final payment/pickup. Remaining balance: ${amountLabel}.`
      : `Your vehicle passed inspection and is ready for final payment/pickup.`,
    type: 'warning',
    priority: 'high',
    link: paymentLink(orderId),
    ctaPath: paymentLink(orderId),
    ctaLabel: 'View payment update',
    emailSubject: 'Payment update for your AutoSPF+ booking',
    emailCategory: kind,
    emailWorthy,
    emailSkippedReason: emailWorthy ? null : (emailSkippedReason || 'not_email_worthy'),
    bookingReference: bookingRef(order),
    orderNumber: order.orderNumber || null,
    vehicle: vehicleLabel(order),
    serviceName: serviceLabel(order),
    stageLabel: 'Payment due',
    status: order.status || null,
    paymentStatus: order.paymentStatus || null,
    mediaCount: stageMediaCount(order, 'ready_pickup'),
    balanceDue: due,
    amount: due,
  };
}

function buildReceiptSpec(order, data = {}) {
  const customerId = data.customerId || getOrderCustomerId(order);
  const orderId = data.orderId || order?._id;
  if (!customerId || !orderId) return null;

  const ref = data.bookingReference || order?.bookingReference || data.orderNumber || order?.orderNumber || idOf(orderId).slice(-8);
  const amount = Number(data.amountCollected ?? data.amount ?? order?.amountCollected ?? order?.totalPrice ?? order?.totalAmount ?? 0);
  const amountLabel = formatCurrency(amount);
  const kind = 'receipt_ready';
  const stage = 'receipt_ready';
  const invoiceLabel = data.invoiceNumber ? ` Invoice ${data.invoiceNumber}.` : '';

  return {
    customerId,
    orderId,
    kind,
    stage,
    idempotencyKey: buildIdempotencyKey({ customerId, orderId, kind, stage }),
    title: 'Your receipt is ready',
    message: amountLabel
      ? `Payment recorded. Your receipt is ready for ${ref} (${amountLabel}).${invoiceLabel}`
      : `Payment recorded. Your receipt is ready for ${ref}.${invoiceLabel}`,
    type: 'success',
    priority: 'normal',
    link: receiptLink(orderId),
    ctaPath: receiptLink(orderId),
    ctaLabel: 'View receipt',
    emailSubject: 'Your AutoSPF+ receipt is ready',
    emailCategory: kind,
    emailWorthy: data.emailWorthy !== false,
    emailSkippedReason: data.emailWorthy === false ? (data.emailSkippedReason || 'not_email_worthy') : null,
    bookingReference: ref,
    orderNumber: data.orderNumber || order?.orderNumber || null,
    vehicle: vehicleLabel(order),
    serviceName: serviceLabel(order),
    stageLabel: 'Receipt ready',
    status: order?.status || null,
    paymentStatus: order?.paymentStatus || 'paid',
    mediaCount: 0,
    amount,
    metadata: {
      invoiceNumber: data.invoiceNumber || null,
      paymentId: idOf(data.paymentId) || null,
    },
  };
}

async function buildMediaSpec(order, stage) {
  const customerId = getOrderCustomerId(order);
  const orderId = order?._id;
  if (!customerId || !orderId || !MEDIA_EMAIL_STAGES.has(stage)) return null;

  const mediaCount = stageMediaCount(order, stage);
  if (mediaCount <= 0) return null;

  const stageSpec = buildStageSpec(order, stage, { emailWorthy: false });
  const existingStageNotification = stageSpec
    ? await Notification.findOne({
        recipientUserId: customerId,
        'metadata.idempotencyKey': stageSpec.idempotencyKey,
      }).select('metadata.mediaCount metadata.emailSent')
    : null;
  const transitionAlreadyMentionedEvidence =
    Number(existingStageNotification?.metadata?.mediaCount || 0) > 0
    && existingStageNotification?.metadata?.emailSent === true;

  const kind = 'stage_media';
  const idempotencyKey = buildIdempotencyKey({ customerId, orderId, kind, stage });
  const def = CUSTOMER_STAGE_MESSAGES[stage];
  const evidenceCopy = {
    received: 'Intake evidence is now available in your live tracker.',
    in_progress: 'New service progress evidence is available in your live tracker.',
    quality_check: 'QC evidence is now available in your live tracker.',
    ready_pickup: 'Pickup evidence and final photos are available in your live tracker.',
  };

  return {
    customerId,
    orderId,
    kind,
    stage,
    idempotencyKey,
    title: `${def?.title || 'Tracker'} Evidence Available`,
    message: evidenceCopy[stage],
    type: 'booking',
    priority: stage === 'ready_pickup' ? 'high' : 'normal',
    link: trackerLink(orderId, stage),
    ctaPath: trackerLink(orderId, stage),
    ctaLabel: 'View evidence',
    emailSubject: def?.subject || 'New AutoSPF+ tracker evidence is available',
    emailCategory: kind,
    emailWorthy: !transitionAlreadyMentionedEvidence,
    emailSkippedReason: transitionAlreadyMentionedEvidence ? 'already_sent' : null,
    bookingReference: bookingRef(order),
    orderNumber: order.orderNumber || null,
    vehicle: vehicleLabel(order),
    serviceName: serviceLabel(order),
    stageLabel: `${def?.stageLabel || stage} evidence`,
    status: order.status || null,
    paymentStatus: order.paymentStatus || null,
    mediaCount,
  };
}

export async function createCustomerPaymentDueNotification(orderOrId, options = {}) {
  const order = await getLatestOrder(orderOrId);
  if (!order) return null;
  const spec = await buildPaymentDueSpec(order, options);
  if (!spec) return null;
  return persistAndNotify(order, spec);
}

export async function createCustomerReceiptNotification(data) {
  const order = await getLatestOrder(data?.orderId);
  if (!order) return null;
  const spec = buildReceiptSpec(order, data);
  if (!spec) return null;
  return persistAndNotify(order, spec);
}

export async function createCustomerStageMediaNotification(orderOrId, stage) {
  const order = await getLatestOrder(orderOrId);
  if (!order) return null;
  const normalizedStage = normalizeKey(stage);
  const spec = await buildMediaSpec(order, normalizedStage);
  if (!spec) return null;
  return persistAndNotify(order, spec, { reactivateUnread: true });
}

/**
 * One canonical notification per customer/order/kind/stage. Sends Resend email once when eligible.
 */
export async function createCustomerStageNotification(orderOrId, stage, options = {}) {
  const order = await getLatestOrder(orderOrId);
  if (!order) return null;
  const normalizedStage = normalizeKey(stage);

  if (normalizedStage === 'ready_pickup') {
    const eligibility = await readyPickupEligibility(order, options.balanceDue);
    if (!eligibility.ok) {
      return createCustomerPaymentDueNotification(order, {
        balanceDue: eligibility.balanceDue,
        emailWorthy: options.emailWorthy !== false,
        emailSkippedReason: options.emailSkippedReason,
      });
    }
  }

  const spec = buildStageSpec(order, normalizedStage, options);
  if (!spec) return null;
  return persistAndNotify(order, spec);
}

/** Notify when pickup gate photos are complete and strict pickup/payment rules allow it. */
export async function notifyReadyForPickupIfGateComplete(orderOrId) {
  const order = await getLatestOrder(orderOrId);
  if (!order) return null;
  if (countGatePhotos(order, 'ready_pickup') < REQUIRED_GATE_PHOTOS) return null;
  return createCustomerStageNotification(order, 'ready_pickup');
}

/**
 * Backfill missing stage notifications for active customer orders (e.g. tracker advanced via photos only).
 */
export async function syncMissingCustomerStageNotifications(customerId) {
  if (!customerId) return;

  const orders = await Order.find({
    customer: customerId,
    archived: { $ne: true },
    $or: [
      { serviceTrackingStage: { $in: ['confirmed', 'received', 'in_progress', 'quality_check', 'ready_pickup', 'completed', 'released'] } },
      { status: { $in: ['confirmed', 'received', 'in_progress', 'ready_for_payment', 'completed', 'paid', 'released'] } },
    ],
  })
    .select('_id customer serviceTrackingStage status paymentStatus trackerStageMedia qcCompletedAt orderNumber bookingReference serviceType vehicleYear vehicleMake vehicleModel')
    .sort({ updatedAt: -1 })
    .limit(30);

  for (const order of orders) {
    const stage = normalizeKey(order.serviceTrackingStage);
    if (stage && CUSTOMER_STAGE_MESSAGES[stage]) {
      const exists = await Notification.exists({
        recipientUserId: customerId,
        'metadata.orderId': idOf(order._id),
        'metadata.kind': stage,
        'metadata.stage': stage,
      });
      if (!exists) {
        await createCustomerStageNotification(order, stage, {
          emailWorthy: false,
          emailSkippedReason: 'not_email_worthy',
        });
      }
    }
    if (order.status === 'ready_for_payment') {
      const exists = await Notification.exists({
        recipientUserId: customerId,
        'metadata.orderId': idOf(order._id),
        'metadata.kind': 'payment_due',
        'metadata.stage': 'payment_due',
      });
      if (!exists) {
        await createCustomerPaymentDueNotification(order, {
          emailWorthy: false,
          emailSkippedReason: 'not_email_worthy',
        });
      }
    }
    if (countGatePhotos(order, 'ready_pickup') >= REQUIRED_GATE_PHOTOS) {
      const exists = await Notification.exists({
        recipientUserId: customerId,
        'metadata.orderId': idOf(order._id),
        'metadata.kind': 'ready_pickup',
        'metadata.stage': 'ready_pickup',
      });
      if (!exists) {
        await createCustomerStageNotification(order, 'ready_pickup', {
          emailWorthy: false,
          emailSkippedReason: 'not_email_worthy',
        });
      }
    }
  }
}
