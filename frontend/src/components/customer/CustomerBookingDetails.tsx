import type { Booking } from '@/types';

export function CustomerBookingDetails({ booking }: { booking: Partial<Booking> }) {
  const vehicle = [booking.vehicleYear, booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ');
  const rawDate = booking.bookingDate || booking.date;
  const date = rawDate ? new Date(rawDate) : null;
  const schedule = date && Number.isFinite(date.getTime())
    ? [date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }), booking.bookingTime || booking.time].filter(Boolean).join(' · ')
    : 'Awaiting schedule';
  return <dl className="customer-booking-details">
    <div><dt>Vehicle</dt><dd>{vehicle || booking.vehicleInfo || 'Vehicle details unavailable'}</dd></div>
    <div><dt>Plate number</dt><dd>{booking.vehiclePlate || 'Unavailable'}</dd></div>
    <div><dt>Schedule</dt><dd>{schedule}</dd></div>
    <div><dt>Reference</dt><dd>{booking.orderNumber || booking.bookingReference || booking._id || booking.id || 'Unavailable'}</dd></div>
    {booking.notes && <div className="customer-booking-details__notes"><dt>Notes</dt><dd>{booking.notes}</dd></div>}
    {booking.rejectionReason && <div className="customer-booking-details__notes"><dt>Reason</dt><dd>{booking.rejectionReason}</dd></div>}
  </dl>;
}
