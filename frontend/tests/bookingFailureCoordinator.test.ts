import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOOKING_TIME_CONFLICT_MESSAGE,
  buildBookingConflictEventId,
  buildBookingTransportEventId,
  createBookingFailureNotificationGuard,
  type BookingFailureEvent,
} from '../src/lib/booking-failure.ts';

const conflictEvent = (overrides: Partial<BookingFailureEvent> = {}): BookingFailureEvent => ({
  eventId: buildBookingConflictEventId({
    bookingRequestId: 'web-booking:request-1',
    selectionRevision: 7,
    date: '2026-09-14',
    time: '09:00',
  }),
  bookingRequestId: 'web-booking:request-1',
  selectionRevision: 7,
  date: '2026-09-14',
  time: '09:00',
  errorCode: 'SLOT_FULL',
  source: 'submit',
  title: 'Booking not submitted',
  message: BOOKING_TIME_CONFLICT_MESSAGE,
  ...overrides,
});

test('one booking conflict notification survives duplicate emitters, rerenders, and time', async () => {
  const delivered: BookingFailureEvent[] = [];
  const guard = createBookingFailureNotificationGuard((event) => delivered.push(event));
  const event = conflictEvent();

  for (const source of ['submit', 'realtime', 'retry', 'availability'] as const) {
    guard.notifyOnce({ ...event, source });
  }
  assert.equal(delivered.length, 1);

  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(guard.notifyOnce({ ...event, source: 'realtime' }), false);
  assert.equal(delivered.length, 1);
});

test('a changed selection can emit one new conflict after the guard resets', () => {
  const delivered: BookingFailureEvent[] = [];
  const guard = createBookingFailureNotificationGuard((event) => delivered.push(event));
  assert.equal(guard.notifyOnce(conflictEvent()), true);
  guard.reset();

  const nextEvent = conflictEvent({
    eventId: buildBookingConflictEventId({
      bookingRequestId: null,
      selectionRevision: 8,
      date: '2026-09-14',
      time: '10:00',
    }),
    bookingRequestId: null,
    selectionRevision: 8,
    time: '10:00',
  });
  assert.equal(nextEvent.eventId, 'booking-conflict:8:2026-09-14:10:00');
  assert.equal(guard.notifyOnce(nextEvent), true);
  assert.equal(delivered.length, 2);
});

test('transport failures are scoped to the actual POST invocation', () => {
  assert.notEqual(
    buildBookingTransportEventId('post-attempt-1'),
    buildBookingTransportEventId('post-attempt-2'),
  );
});
