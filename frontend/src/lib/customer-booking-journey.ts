export const CUSTOMER_SERVICE_JOURNEY_STEPS = [
  'Confirmed',
  'Arrived',
  'In service',
  'QC review',
  'Pickup',
] as const;

export type CustomerBookingJourneyInput = {
  status?: unknown;
  paymentStatus?: unknown;
  serviceTrackingStage?: unknown;
  hasPaymentProof?: boolean;
  reservationPayment?: {
    status?: unknown;
    submittedAt?: unknown;
    amountSubmitted?: unknown;
  } | null;
};

export type CustomerBookingJourneyPresentation = {
  statusLabel: string;
  paymentLabel: string;
  journeyStarted: boolean;
  progressIndex: number | null;
  stageSummaryLabel: string;
  nextStepLabel: string;
  journeyTitle: string;
  journeyDescription: string;
  canTrackService: boolean;
};

const PRE_CONFIRMATION_STATUSES = new Set(['pending', 'pending_confirmation']);
const CLOSED_BEFORE_SERVICE_STATUSES = new Set([
  'cancelled',
  'rejected',
  'not_approved',
  'failed',
]);

function normalizeState(value: unknown, fallback = ''): string {
  return String(value ?? fallback).trim().toLowerCase().replace(/-/g, '_');
}

function humanizeState(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function bookingStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Awaiting confirmation',
    pending_confirmation: 'Awaiting confirmation',
    approved: 'Confirmed',
    confirmed: 'Confirmed',
    assigned: 'Team assigned',
    queued: 'Confirmed',
    received: 'Arrived',
    checked_in: 'Arrived',
    active: 'In service',
    in_service: 'In service',
    in_progress: 'In service',
    processing: 'In service',
    quality_check: 'QC review',
    ready_for_payment: 'Ready for pickup',
    ready_pickup: 'Ready for pickup',
    completed: 'Released',
    released: 'Released',
    done: 'Released',
    delivered: 'Released',
    paid: 'Released',
    rejected: 'Not approved',
    not_approved: 'Not approved',
    failed: 'Not approved',
    cancelled: 'Cancelled',
  };
  return labels[status] || humanizeState(status || 'pending');
}

function paymentStateLabel(
  booking: CustomerBookingJourneyInput,
  bookingStatus: string,
): string {
  const paymentStatus = normalizeState(booking.paymentStatus);
  const reservationStatus = normalizeState(booking.reservationPayment?.status);
  const hasSubmittedReservation = Boolean(
    booking.hasPaymentProof
    || booking.reservationPayment?.submittedAt
    || Number(booking.reservationPayment?.amountSubmitted || 0) > 0,
  );

  if (paymentStatus === 'paid') return 'Paid';
  if (paymentStatus === 'refunded') return 'Refunded';
  if (reservationStatus === 'rejected') return 'Reservation payment not approved';
  if (paymentStatus === 'failed' || reservationStatus === 'failed') return 'Payment failed';
  if (reservationStatus === 'succeeded') {
    return paymentStatus === 'partially_paid'
      ? 'Reservation paid · balance due'
      : 'Reservation payment approved';
  }
  if (PRE_CONFIRMATION_STATUSES.has(bookingStatus)) {
    return reservationStatus === 'pending' || hasSubmittedReservation || bookingStatus === 'pending_confirmation'
      ? 'Reservation payment under review'
      : 'Payment verification pending';
  }
  if (paymentStatus === 'partially_paid') return 'Partially paid';
  return 'Payment pending';
}

function journeyProgressIndex(booking: CustomerBookingJourneyInput, bookingStatus: string): number {
  const stage = normalizeState(booking.serviceTrackingStage || bookingStatus);
  const indexes: Record<string, number> = {
    approved: 0,
    confirmed: 0,
    assigned: 0,
    queued: 0,
    received: 1,
    checked_in: 1,
    active: 2,
    in_service: 2,
    in_progress: 2,
    processing: 2,
    quality_check: 3,
    ready_for_payment: 4,
    ready_pickup: 4,
    completed: 4,
    released: 4,
    done: 4,
    delivered: 4,
    paid: 4,
  };
  return Math.max(0, Math.min(CUSTOMER_SERVICE_JOURNEY_STEPS.length - 1, indexes[stage] ?? 0));
}

/**
 * Customer-facing booking truth shared across customer service status surfaces.
 *
 * A booking awaiting Sales review never enters the service journey. Booking
 * status is intentionally checked before tracker-stage fallbacks so uploaded
 * proof, a schedule, or a stale tracker field cannot present confirmation.
 */
export function getCustomerBookingJourneyPresentation(
  booking: CustomerBookingJourneyInput,
): CustomerBookingJourneyPresentation {
  const bookingStatus = normalizeState(booking.status, 'pending');
  const awaitingConfirmation = PRE_CONFIRMATION_STATUSES.has(bookingStatus);
  const closedBeforeService = CLOSED_BEFORE_SERVICE_STATUSES.has(bookingStatus);

  if (awaitingConfirmation) {
    return {
      statusLabel: 'Awaiting confirmation',
      paymentLabel: paymentStateLabel(booking, bookingStatus),
      journeyStarted: false,
      progressIndex: null,
      stageSummaryLabel: 'Pending confirmation',
      nextStepLabel: 'Booking confirmation',
      journeyTitle: 'Waiting for booking confirmation',
      journeyDescription: 'Your service journey will begin once your reservation payment is approved.',
      canTrackService: false,
    };
  }

  const progressIndex = journeyProgressIndex(booking, bookingStatus);
  const atPickup = progressIndex === CUSTOMER_SERVICE_JOURNEY_STEPS.length - 1;
  const nextStep = CUSTOMER_SERVICE_JOURNEY_STEPS[
    Math.min(progressIndex + 1, CUSTOMER_SERVICE_JOURNEY_STEPS.length - 1)
  ];

  return {
    statusLabel: bookingStatusLabel(bookingStatus),
    paymentLabel: paymentStateLabel(booking, bookingStatus),
    journeyStarted: !closedBeforeService,
    progressIndex: closedBeforeService ? null : progressIndex,
    stageSummaryLabel: closedBeforeService
      ? 'Journey not active'
      : `Stage ${progressIndex + 1} of ${CUSTOMER_SERVICE_JOURNEY_STEPS.length}`,
    nextStepLabel: closedBeforeService
      ? 'No service step scheduled'
      : atPickup
        ? 'Vehicle ready for pickup'
        : nextStep,
    journeyTitle: closedBeforeService ? 'Service journey not active' : 'Live journey console',
    journeyDescription: closedBeforeService
      ? 'This booking is not in the active service journey.'
      : 'Your vehicle’s current studio progression',
    canTrackService: !closedBeforeService,
  };
}
