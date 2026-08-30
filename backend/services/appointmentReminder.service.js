import Order from '../models/order.model.js';
import { createCustomerOrderEventNotification } from '../utils/customerStageNotifications.utils.js';
import { runTrackedSystemMutation } from '../middleware/systemLifecycle.middleware.js';

const REMINDER_INTERVAL_MS = 15 * 60 * 1000;

function idOf(value) {
  return value?._id?.toString?.() || value?.toString?.() || String(value || '');
}

function manilaDateString(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatTime(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/i);
  if (!match) return text;
  if (match[3]) return `${Number(match[1])}:${match[2]} ${match[3].toUpperCase()}`;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

function serviceLabel(order) {
  return String(order?.serviceType || order?.serviceName || 'AutoSPF+ service').trim();
}

export async function runAppointmentReminderSweep(now = new Date()) {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const bookingDate = manilaDateString(tomorrow);
  const orders = await Order.find({
    bookingDate,
    archived: { $ne: true },
    status: { $in: ['approved', 'confirmed', 'assigned'] },
    customer: { $ne: null },
  })
    .select('_id customer bookingDate bookingTime bookingReference orderNumber serviceType serviceName')
    .lean();

  let created = 0;
  for (const order of orders) {
    const orderId = idOf(order._id);
    const before = await createCustomerOrderEventNotification(orderId, {
      event: 'appointment_reminder',
      category: 'important',
      title: 'Appointment Reminder',
      message: `Your ${serviceLabel(order)} appointment starts tomorrow${order.bookingTime ? ` at ${formatTime(order.bookingTime)}` : ''}. Please arrive 10 minutes early.`,
      actionType: 'booking',
      actionLabel: 'View booking',
      link: `/customer/dashboard?section=appointments&bookingId=${encodeURIComponent(orderId)}`,
      eventSuffix: `appointment_reminder:${bookingDate}:${order.bookingTime || ''}`,
      metadata: {
        bookingDate,
        bookingTime: order.bookingTime || null,
        bookingReference: order.bookingReference || order.orderNumber || null,
      },
    });
    if (before) created += 1;
  }
  return { scanned: orders.length, processed: created, bookingDate };
}

export function startAppointmentReminderScheduler() {
  const run = () => {
    runTrackedSystemMutation(() => runAppointmentReminderSweep()).catch((error) => {
      console.error('[SCHEDULER] Appointment reminder sweep failed:', error.message);
    });
  };
  run();
  const timer = setInterval(run, REMINDER_INTERVAL_MS);
  timer.unref?.();
  return timer;
}
