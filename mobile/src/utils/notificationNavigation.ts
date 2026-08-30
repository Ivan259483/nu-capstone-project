import type { NotificationRecord } from '@/services/api/types';

export type NotificationRoute =
  | string
  | { pathname: string; params?: Record<string, string> };

type Payload = Partial<NotificationRecord> & { orderId?: unknown };

function metadataOf(payload: Payload): Record<string, unknown> {
  const data = payload.data || payload.metadata;
  return data && typeof data === 'object' ? data : {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function getNotificationEntityId(payload: Payload): string {
  const metadata = metadataOf(payload);
  return stringValue(
    payload.actionId ||
      payload.orderId ||
      metadata.orderId ||
      metadata.bookingId ||
      metadata.actionId
  );
}

export function getNotificationRoute(payload: Payload): NotificationRoute {
  const metadata = metadataOf(payload);
  const event = stringValue(payload.event || payload.type || metadata.kind).toLowerCase();
  const actionType = stringValue(payload.actionType || metadata.actionType).toLowerCase();
  const entityId = getNotificationEntityId(payload);
  const link = stringValue(payload.link || payload.action?.link).toLowerCase();

  if (
    actionType === 'tracking'
    || actionType === 'damage_report'
    || ['vehicle_received', 'service_started', 'service_progress', 'service_completed', 'damage_report_ready'].includes(event)
    || link.includes('tracker')
    || link.includes('tracking')
  ) {
    return entityId
      ? { pathname: '/(customer)/track', params: { id: entityId } }
      : '/(customer)/track';
  }

  if (
    actionType === 'payment'
    || actionType === 'receipt'
    || event.includes('payment')
    || event.includes('receipt')
    || link.includes('payment')
  ) {
    const shouldOpenReceipt = actionType === 'receipt'
      || event === 'payment_confirmed'
      || event.includes('receipt');
    return entityId
      ? {
          pathname: '/(screens)/payments',
          params: {
            orderId: entityId,
            ...(shouldOpenReceipt ? { openReceipt: '1' } : {}),
          },
        }
      : '/(screens)/payments';
  }

  if (
    actionType === 'booking'
    || event.startsWith('booking_')
    || event === 'appointment_reminder'
    || link.includes('appointment')
    || link.includes('booking')
  ) {
    return entityId
      ? { pathname: '/(screens)/booking-details', params: { id: entityId } }
      : '/(screens)/appointments';
  }

  if (actionType === 'profile' || event.includes('loyalty')) {
    return '/(customer)/settings';
  }

  if (event === 'promotion' || payload.category === 'promotion') {
    return '/(customer)/book';
  }

  return '/(screens)/notifications';
}

export function hasNotificationAction(payload: Payload): boolean {
  return getNotificationRoute(payload) !== '/(screens)/notifications';
}
