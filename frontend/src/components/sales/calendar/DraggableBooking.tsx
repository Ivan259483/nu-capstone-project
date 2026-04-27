import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import type { CalendarBooking } from './calendarTypes';

interface DraggableBookingProps {
  booking: CalendarBooking;
  children: React.ReactNode;
  disabled?: boolean;
}

export default function DraggableBooking({ booking, children, disabled }: DraggableBookingProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `booking-${booking._id || booking.id}`,
    data: {
      bookingId: booking._id || booking.id,
      currentDate: booking.bookingDate,
      currentTime: booking.bookingTime,
      booking,
    },
    disabled,
  });

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 999 : undefined,
        opacity: isDragging ? 0.8 : 1,
        cursor: 'grabbing',
        boxShadow: isDragging ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`touch-none ${isDragging ? 'z-50 relative' : ''}`}
    >
      {children}
    </div>
  );
}
