export const BOOKING_NOT_SUBMITTED_LABEL = 'Booking not submitted';
export const BOOKING_TIME_CONFLICT_MESSAGE =
  'This time slot is no longer available. Please choose another available schedule.';

export type BookingFailureSource =
  | 'availability'
  | 'realtime'
  | 'submit'
  | 'retry'
  | 'transport';

export type BookingFailureEvent = {
  eventId: string;
  notificationId?: string | number;
  bookingRequestId?: string | null;
  selectionRevision: number;
  date: string;
  time: string;
  errorCode?: string | null;
  source: BookingFailureSource;
  title: string;
  message: string;
};

export type BookingFailureNotificationGuard = {
  notifyOnce: (event: BookingFailureEvent) => boolean;
  reset: () => void;
};

const cleanEventPart = (value: unknown, fallback: string) => {
  const normalized = String(value ?? '').trim().replace(/[^A-Za-z0-9._:-]/g, '_');
  return normalized || fallback;
};

export function buildBookingConflictEventId({
  bookingRequestId,
  selectionRevision,
  date,
  time,
}: Pick<BookingFailureEvent, 'bookingRequestId' | 'selectionRevision' | 'date' | 'time'>): string {
  const scope = bookingRequestId
    ? cleanEventPart(bookingRequestId, 'request')
    : String(Math.max(0, Number(selectionRevision) || 0));
  return [
    'booking-conflict',
    scope,
    cleanEventPart(date, 'unknown-date'),
    cleanEventPart(time, 'unknown-time'),
  ].join(':');
}

export function buildBookingTransportEventId(attemptId: string): string {
  return `booking-transport:${cleanEventPart(attemptId, 'unknown-attempt')}`;
}

export function createBookingFailureNotificationGuard(
  notify: (event: BookingFailureEvent) => void,
): BookingFailureNotificationGuard {
  const handledEventIds = new Set<string>();

  return {
    notifyOnce(event) {
      const eventId = String(event?.eventId || '').trim();
      if (!eventId || handledEventIds.has(eventId)) return false;
      handledEventIds.add(eventId);
      notify(event);
      return true;
    },
    reset() {
      handledEventIds.clear();
    },
  };
}
