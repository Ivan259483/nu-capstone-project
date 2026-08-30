export const CUSTOMER_NOTIFICATION_PREFERENCE_FIELDS = Object.freeze([
  'pushEnabled',
  'emailEnabled',
  'bookingConfirmation',
  'jobStatusUpdates',
  'paymentReminders',
  'vehicleReminders',
]);

export const DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES = Object.freeze({
  pushEnabled: true,
  emailEnabled: true,
  bookingConfirmation: true,
  jobStatusUpdates: true,
  paymentReminders: true,
  vehicleReminders: true,
});

const BOOKING_EVENTS = new Set([
  'appointment_reminder',
  'booking_cancelled',
  'booking_confirmed',
  'booking_rejected',
  'booking_rescheduled',
  'confirmed',
]);

const JOB_STATUS_EVENTS = new Set([
  'damage_report_ready',
  'in_progress',
  'quality_check',
  'ready_pickup',
  'received',
  'released',
  'service_completed',
  'service_progress',
  'service_started',
  'stage_media',
  'technician_assigned',
  'vehicle_received',
]);

const PAYMENT_EVENTS = new Set([
  'balance_due',
  'payment_confirmed',
  'payment_due',
  'payment_pending_review',
  'payment_required',
  'payment_review_result',
  'receipt_available',
  'receipt_ready',
  'reservation_payment_review',
]);

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase().replace(/-/g, '_');
}

export function normalizeCustomerNotificationPreferences(preferences = {}) {
  return Object.fromEntries(
    CUSTOMER_NOTIFICATION_PREFERENCE_FIELDS.map((field) => [
      field,
      typeof preferences?.[field] === 'boolean'
        ? preferences[field]
        : DEFAULT_CUSTOMER_NOTIFICATION_PREFERENCES[field],
    ])
  );
}

/**
 * Resolve an external-delivery category from the persisted notification payload.
 * Unknown and removed optional categories intentionally return null: the in-app
 * row remains available, but Push and Email have no active preference category.
 */
export function resolveCustomerNotificationPreferenceField(notification = {}) {
  const metadata = notification?.metadata || {};
  const explicit = String(
    notification?.notificationPreferenceField
      || metadata.notificationPreferenceField
      || ''
  ).trim();
  if (
    explicit
    && CUSTOMER_NOTIFICATION_PREFERENCE_FIELDS.includes(explicit)
    && !['pushEnabled', 'emailEnabled'].includes(explicit)
  ) {
    return explicit;
  }

  const candidates = [
    metadata.kind,
    notification?.event,
    notification?.type,
  ].map(normalizeKey).filter(Boolean);

  if (candidates.some((key) => BOOKING_EVENTS.has(key) || key.startsWith('booking_'))) {
    return 'bookingConfirmation';
  }
  if (
    candidates.some((key) =>
      PAYMENT_EVENTS.has(key)
      || key.includes('payment')
      || key.includes('receipt')
      || key.includes('balance_due')
    )
  ) {
    return 'paymentReminders';
  }
  if (
    candidates.some((key) =>
      JOB_STATUS_EVENTS.has(key)
      || key.startsWith('service_')
      || key.startsWith('tracker_')
    )
  ) {
    return 'jobStatusUpdates';
  }

  return null;
}

export function customerNotificationAllowsExternalDelivery(
  preferences,
  notification,
  channel
) {
  const normalized = normalizeCustomerNotificationPreferences(preferences);
  const channelField = channel === 'push'
    ? 'pushEnabled'
    : channel === 'email'
      ? 'emailEnabled'
      : null;
  if (!channelField || normalized[channelField] !== true) return false;

  const categoryField = resolveCustomerNotificationPreferenceField(notification);
  return Boolean(categoryField && normalized[categoryField] === true);
}
