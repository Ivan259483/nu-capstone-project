import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BOOKING_TIME_CONFLICT_MESSAGE,
  buildBookingConflictEventId,
  createBookingFailureNotificationGuard,
  type BookingFailureEvent,
} from '../src/utils/booking-failure.ts';

const event: BookingFailureEvent = {
  eventId: buildBookingConflictEventId({
    bookingRequestId: 'mobile-booking:request-1',
    selectionRevision: 3,
    date: '2026-09-14',
    time: '09:00',
  }),
  bookingRequestId: 'mobile-booking:request-1',
  selectionRevision: 3,
  date: '2026-09-14',
  time: '09:00',
  errorCode: 'SLOT_FULL',
  source: 'submit',
  title: 'Booking not submitted',
  message: BOOKING_TIME_CONFLICT_MESSAGE,
};

test('iOS and Android share a persistent booking conflict notification guard', async () => {
  const delivered: BookingFailureEvent[] = [];
  const guard = createBookingFailureNotificationGuard((failure) => delivered.push(failure));

  assert.equal(guard.notifyOnce(event), true);
  assert.equal(guard.notifyOnce({ ...event, source: 'realtime' }), false);
  assert.equal(guard.notifyOnce({ ...event, source: 'retry' }), false);
  await new Promise((resolve) => setTimeout(resolve, 650));
  assert.equal(guard.notifyOnce({ ...event, source: 'availability' }), false);
  assert.equal(delivered.length, 1);

  guard.reset();
  const next = {
    ...event,
    eventId: buildBookingConflictEventId({
      bookingRequestId: null,
      selectionRevision: 4,
      date: event.date,
      time: '10:00',
    }),
    bookingRequestId: null,
    selectionRevision: 4,
    time: '10:00',
  } satisfies BookingFailureEvent;
  assert.equal(next.eventId, 'booking-conflict:4:2026-09-14:10:00');
  assert.equal(guard.notifyOnce(next), true);
  assert.equal(delivered.length, 2);
});
