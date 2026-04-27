import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { DayStatus } from './calendarTypes';

interface DroppableSlotProps {
  id: string; // e.g. "date:2026-04-26" or "slot:2026-04-26:09:00"
  targetDate: string;
  targetTime?: string;
  status: DayStatus | 'AVAILABLE' | 'ALMOST_FULL' | 'FULL' | 'CLOSED';
  children: React.ReactNode;
  className?: string;
}

export default function DroppableSlot({ id, targetDate, targetTime, status, children, className = '' }: DroppableSlotProps) {
  const isFullOrClosed = status.toLowerCase() === 'full' || status.toLowerCase() === 'closed';

  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      targetDate,
      targetTime,
      status,
      isFullOrClosed
    },
    disabled: isFullOrClosed,
  });

  // Highlight valid drop zones (green), invalid (red) during drag hover
  let hoverClass = '';
  if (isOver) {
    hoverClass = isFullOrClosed ? 'ring-2 ring-red-500 bg-red-50' : 'ring-2 ring-green-500 bg-green-50';
  }

  return (
    <div ref={setNodeRef} className={`relative transition-all ${hoverClass} ${className}`}>
      {children}
      {isOver && isFullOrClosed && (
        <div className="absolute inset-0 bg-red-100/50 flex items-center justify-center z-10 rounded-xl pointer-events-none">
          <span className="text-red-700 font-bold text-xs bg-white px-2 py-1 rounded shadow-sm">
            Unavailable
          </span>
        </div>
      )}
      {isOver && !isFullOrClosed && (
        <div className="absolute inset-0 bg-green-100/30 z-10 rounded-xl pointer-events-none" />
      )}
    </div>
  );
}
