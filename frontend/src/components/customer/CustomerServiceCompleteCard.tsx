import React from 'react';

/**
 * Shown instead of the live tracker once the backend closes the customer's tracking session
 * (balance settled + receipt issued, or vehicle released). It never renders stage progress or
 * photo evidence; that history stays on the order and is reachable through records.
 */
type CustomerServiceCompleteCardProps = {
  booking: any;
  completedAtLabel: string;
  onViewReceipt: () => void;
  onPaymentHistory: () => void;
  onServiceHistory: () => void;
};

export function CustomerServiceCompleteCard({
  booking,
  completedAtLabel,
  onViewReceipt,
  onPaymentHistory,
  onServiceHistory,
}: CustomerServiceCompleteCardProps) {
  const released = String(booking?.status || '').toLowerCase() === 'released';
  const vehicle = [booking?.vehicleYear, booking?.vehicleMake, booking?.vehicleModel].filter(Boolean).join(' ')
    || booking?.vehicleInfo
    || 'Your vehicle';
  const service = booking?.serviceName || booking?.serviceType || booking?.packageName || 'AutoSPF+ service';
  const receipt = booking?.customerReceiptInvoiceId || booking?.invoiceId || null;

  return (
    <section
      className="w-full min-w-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
      aria-label="Service complete"
      data-testid="customer-service-complete-card"
    >
      <div className="px-6 py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <iconify-icon icon="solar:check-circle-bold" width="22" style={{ color: '#059669' }}></iconify-icon>
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">
              Service {released ? 'Released' : 'Complete'} ✓
            </p>
            <p className="text-xs text-slate-500 truncate">{service} · {vehicle}</p>
          </div>
        </div>
        <span className="self-start sm:self-auto text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
          Payment confirmed
        </span>
      </div>

      <dl className="px-6 py-4 grid grid-cols-1 gap-3 sm:grid-cols-3 border-b border-slate-50">
        <div>
          <dt className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Completed</dt>
          <dd className="text-sm font-semibold text-slate-900">{completedAtLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Receipt</dt>
          <dd className="text-sm font-semibold text-slate-900">{receipt ? `${receipt} · Available` : 'Available'}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Reference</dt>
          <dd className="text-sm font-semibold text-slate-900">{booking?.bookingReference || booking?.orderNumber || '—'}</dd>
        </div>
      </dl>

      <div className="px-6 py-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onViewReceipt}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <iconify-icon icon="solar:bill-list-linear" width="14"></iconify-icon>
          View Receipt
        </button>
        <button
          type="button"
          onClick={onPaymentHistory}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <iconify-icon icon="solar:wallet-money-linear" width="14"></iconify-icon>
          Payment History
        </button>
        <button
          type="button"
          onClick={onServiceHistory}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <iconify-icon icon="solar:history-linear" width="14"></iconify-icon>
          Service History
        </button>
      </div>
    </section>
  );
}
