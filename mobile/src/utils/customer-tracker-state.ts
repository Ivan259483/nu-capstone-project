import type { BookingRecord } from '@/services/api/types';

export const CUSTOMER_TRACKER_STAGE_COUNT = 5;
export const CUSTOMER_TRACKER_UPCOMING_OPACITY = 0.78;

export const CUSTOMER_TRACKER_STAGES = [
  {
    id: 'confirmed',
    label: 'Appointment Confirmed',
    sub: 'Booking secured',
    detail: 'Your reservation is verified and your appointment is secured.',
  },
  {
    id: 'received',
    label: 'Vehicle Arrived',
    sub: 'Shop intake complete',
    detail: 'Your vehicle has arrived and shop intake is complete.',
  },
  {
    id: 'in_progress',
    label: 'Service In Progress',
    sub: 'Service underway',
    detail: 'Your vehicle service is now in progress.',
  },
  {
    id: 'quality_check',
    label: 'Quality Check',
    sub: 'Final inspection',
    detail: 'Your vehicle is undergoing its final quality inspection.',
  },
  {
    id: 'ready_pickup',
    label: 'Ready for Pickup',
    sub: 'Handover ready',
    detail: 'Your vehicle is ready for customer pickup.',
  },
] as const;

const TRACKING_STAGE_TO_INDEX: Record<string, number> = {
  confirmed: 0,
  received: 1,
  in_progress: 2,
  quality_check: 3,
  ready_pickup: 4,
  completed: 4,
  released: 4,
};

const ORDER_STATUS_TO_INDEX: Record<string, number> = {
  pending: 0,
  pending_confirmation: 0,
  approved: 0,
  confirmed: 0,
  assigned: 0,
  queued: 0,
  received: 1,
  in_progress: 2,
  ready_for_payment: 4,
  completed: 4,
  paid: 4,
  released: 4,
  done: 4,
};

const CUSTOMER_TRACKER_NEXT_STAGE_LABELS = [
  'Vehicle Arrival',
  'Service In Progress',
  'Quality Check',
  'Ready for Pickup',
  'Pickup handover',
] as const;

function normalizeTrackerValue(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/-/g, '_');
}

function formatClockTime(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatEstimate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function resolveCustomerTrackerStageIndex(
  booking: BookingRecord | null | undefined,
): number {
  if (!booking) return -1;
  const status = normalizeTrackerValue(booking.status);
  if (['cancelled', 'failed', 'rejected'].includes(status)) return -1;

  const trackingStage = normalizeTrackerValue(booking.serviceTrackingStage);
  if (TRACKING_STAGE_TO_INDEX[trackingStage] !== undefined) {
    return TRACKING_STAGE_TO_INDEX[trackingStage];
  }

  if (ORDER_STATUS_TO_INDEX[status] !== undefined) {
    return ORDER_STATUS_TO_INDEX[status];
  }

  const customerStatus = normalizeTrackerValue(booking.customerStatus);
  if (customerStatus === 'ready') return 4;
  if (['washing', 'detailing', 'finishing', 'in_progress'].includes(customerStatus)) return 2;
  return 0;
}

export function customerTrackerHasOperationallyStarted(
  booking: BookingRecord | null | undefined,
): boolean {
  return resolveCustomerTrackerStageIndex(booking) >= 1;
}

export function customerBookingIsReadyForPickup(
  booking: BookingRecord | null | undefined,
): boolean {
  return resolveCustomerTrackerStageIndex(booking) === CUSTOMER_TRACKER_STAGE_COUNT - 1;
}

export function getCustomerBookingReference(
  booking: BookingRecord | null | undefined,
): string | null {
  if (!booking) return null;
  const reference = String(booking.bookingReference || booking.orderNumber || '').trim();
  return reference || null;
}

export function getCustomerTrackerTimePill(
  booking: BookingRecord,
  stageIndex = resolveCustomerTrackerStageIndex(booking),
): { label: 'Appointment' | 'Estimated'; value: string } | null {
  if (stageIndex <= 0) {
    const appointmentTime = formatClockTime(booking.bookingTime || booking.time);
    return appointmentTime ? { label: 'Appointment', value: appointmentTime } : null;
  }

  const estimate = formatEstimate(
    booking.estimatedCompletion || booking.jobOrder?.targetReleaseDate,
  );
  if (estimate) return { label: 'Estimated', value: estimate };

  const appointmentTime = formatClockTime(booking.bookingTime || booking.time);
  return appointmentTime ? { label: 'Appointment', value: appointmentTime } : null;
}

export function getCustomerTrackerSummary(booking: BookingRecord) {
  const rawStageIndex = resolveCustomerTrackerStageIndex(booking);
  const stageIndex = Math.min(Math.max(rawStageIndex, 0), CUSTOMER_TRACKER_STAGE_COUNT - 1);
  const stage = CUSTOMER_TRACKER_STAGES[stageIndex];
  const isLive = stageIndex >= 1;

  return {
    rawStageIndex,
    stageIndex,
    stageNumber: stageIndex + 1,
    stageCount: CUSTOMER_TRACKER_STAGE_COUNT,
    stageLabel: stage.label,
    stageDescription: stage.detail,
    nextStageLabel: CUSTOMER_TRACKER_NEXT_STAGE_LABELS[stageIndex],
    headerLabel: isLive ? 'LIVE TRACKING' : 'BOOKING TRACKING',
    isLive,
    timePill: getCustomerTrackerTimePill(booking, stageIndex),
  } as const;
}
