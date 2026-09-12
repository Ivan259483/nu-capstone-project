import type { BookingRecord } from '@/services/api/types';

const validTime = (value: unknown): string => {
  if (typeof value !== 'string' || !value || !Number.isFinite(Date.parse(value))) return '';
  return value;
};

/** Evidence dates describe uploads; they never determine the current gate. */
export function getCustomerTrackerTimestamps(booking: BookingRecord): string[] {
  const mediaAt = (stage: string) => (booking.trackerStageMedia || [])
    .filter((entry) => entry.stage === stage)
    .map((entry) => validTime(entry.uploadedAt))
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || '';
  return [
    validTime(booking.approvedAt),
    validTime(booking.jobOrder?.ingressDateTime) || mediaAt('received'),
    mediaAt('in_progress'),
    validTime(booking.qcCompletedAt) || mediaAt('quality_check'),
    validTime(booking.readyForPaymentAt) || mediaAt('ready_pickup'),
  ];
}

/** Sales owns the persisted balance/pickup queue; old technicians are not its assignees. */
export function getCustomerTrackerTeam(booking: BookingRecord | null, stage: string): string {
  if (!booking) return 'Assignment pending';
  const salesOwned = booking.status.replaceAll('-', '_') === 'ready_for_payment'
    || booking.posQueueStatus === 'balance_pickup_queue';
  const role = salesOwned ? 'sales' : stage === 'quality_check' ? 'quality' : null;
  const assignments = (booking.serviceStaffAssignments || []).filter((person) => {
    if (!person.name?.trim()) return false;
    if (!role) return stage !== 'ready_pickup' || /sales|pickup/i.test(person.role || '');
    return role === 'sales' ? /sales/i.test(person.role || '') : /quality|qc/i.test(person.role || '');
  });
  const names = assignments.map((person) => person.name!.trim()).join(' & ');
  if (salesOwned) return names ? `Sales · ${names}` : 'Sales';
  if (names) return names;
  if (stage === 'quality_check') return 'Quality Check';
  if (stage === 'ready_pickup') return 'Pickup team';
  return booking.assignedDetailer?.name?.trim() || 'Assignment pending';
}
