type HandoffOrder = {
  orderStatus?: string;
  status?: string;
  serviceTrackingStage?: string | null;
  paymentStatus?: string;
  posQueueStatus?: string | null;
  readyForPickupEvidenceComplete?: boolean;
};

/** Keep service readiness separate from the team responsible for payment. */
export function serviceHandoffState(order: HandoffOrder) {
  const status = order.orderStatus || order.status;
  if (['released', 'completed'].includes(status || '') || ['released', 'completed'].includes(order.serviceTrackingStage || '')) return 'completed';
  if (order.serviceTrackingStage === 'ready_pickup' && order.paymentStatus === 'paid' && order.readyForPickupEvidenceComplete) return 'handover';
  if (order.paymentStatus !== 'paid' && order.posQueueStatus === 'balance_pickup_queue' && order.readyForPickupEvidenceComplete) return 'payment';
  return null;
}

export function formatHandoffTime(value?: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded';
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
