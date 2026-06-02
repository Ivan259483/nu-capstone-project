import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  ImageIcon,
  Lock,
  Receipt,
  Wallet,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const RESERVATION_FEE = 500;

const HIDDEN_STATUSES = new Set(['pending', 'cancelled', 'failed']);

const RESERVATION_PAID_STATUSES = new Set([
  'approved',
  'confirmed',
  'assigned',
  'received',
  'in_progress',
  'ready_for_payment',
  'completed',
  'released',
  'paid',
]);

function normStatus(raw: unknown) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

function formatBookingDate(raw?: string) {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

type PaymentFilter = 'all' | 'paid' | 'due';

type BookingPayment = {
  id: string;
  orderLabel: string;
  serviceName: string;
  vehicle: string;
  dateLabel: string;
  total: number;
  balanceDue: number;
  paidSoFar: number;
  reservationPaid: boolean;
  balancePaid: boolean;
  fullyPaid: boolean;
  proofUrl: string | null;
  sortTime: number;
};

function buildBookingPayment(row: any): BookingPayment {
  const id = String(row._id || row.id || '').trim();
  const st = normStatus(row?.status);
  const total = Number(row.totalPrice || row.totalAmount || 0);
  const balanceDue = Math.max(total - RESERVATION_FEE, 0);
  const proofUrl: string | null = row.paymentProofUrl || row.downpaymentProof || null;
  const reservationPaid = RESERVATION_PAID_STATUSES.has(st) || Boolean(proofUrl);
  const balancePaid =
    String(row.paymentStatus || '').toLowerCase() === 'paid' ||
    ['completed', 'released', 'paid'].includes(st);
  const paidSoFar = (reservationPaid ? RESERVATION_FEE : 0) + (balancePaid ? balanceDue : 0);
  const dateRaw = row.date || row.bookingDate || row.createdAt;
  const vehicle =
    [row.vehicleYear, row.vehicleMake, row.vehicleModel].filter(Boolean).join(' ') ||
    row.vehicleInfo ||
    '—';

  return {
    id,
    orderLabel: row.orderNumber || row.bookingReference || id.slice(-8),
    serviceName: row.serviceName || row.serviceType || 'Service',
    vehicle,
    dateLabel: formatBookingDate(dateRaw),
    total,
    balanceDue,
    paidSoFar: total > 0 ? Math.min(paidSoFar, total) : paidSoFar,
    reservationPaid,
    balancePaid,
    fullyPaid: reservationPaid && (balanceDue === 0 || balancePaid),
    proofUrl,
    sortTime: dateRaw ? new Date(dateRaw).getTime() : 0,
  };
}

function StatusPill({ paid, pendingLabel = 'Due at shop' }: { paid: boolean; pendingLabel?: string }) {
  if (paid) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800">
      <Clock className="h-3 w-3 shrink-0" />
      {pendingLabel}
    </span>
  );
}

function PaymentStepRow({
  icon,
  iconClass,
  title,
  subtitle,
  amount,
  paid,
  pendingLabel,
  actions,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  subtitle: string;
  amount: number | null;
  paid: boolean;
  pendingLabel?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p>
          {actions ? <div className="mt-2 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
        <StatusPill paid={paid} pendingLabel={pendingLabel} />
        <p className="text-base font-bold tabular-nums text-slate-900">
          {amount != null && amount > 0 ? formatCurrency(amount) : '—'}
        </p>
      </div>
    </div>
  );
}

export interface CustomerPaymentHistorySectionProps {
  bookings: any[];
  onViewPaymentProof: (url: string) => void;
  onViewReceipt: (orderId: string) => void;
}

export function CustomerPaymentHistorySection({
  bookings,
  onViewPaymentProof,
  onViewReceipt,
}: CustomerPaymentHistorySectionProps) {
  const [filter, setFilter] = useState<PaymentFilter>('all');

  const items = useMemo(() => {
    return bookings
      .filter((b) => !HIDDEN_STATUSES.has(normStatus(b?.status)))
      .map(buildBookingPayment)
      .sort((a, b) => b.sortTime - a.sortTime);
  }, [bookings]);

  const filtered = useMemo(() => {
    if (filter === 'paid') return items.filter((b) => b.fullyPaid);
    if (filter === 'due') return items.filter((b) => !b.fullyPaid);
    return items;
  }, [items, filter]);

  const stats = useMemo(() => {
    const reservationPaidCount = items.filter((b) => b.reservationPaid).length;
    const fullyPaidCount = items.filter((b) => b.fullyPaid).length;
    const balancePaidTotal = items.reduce((sum, b) => sum + (b.balancePaid ? b.balanceDue : 0), 0);
    const reservationPaidTotal = items.reduce((sum, b) => sum + (b.reservationPaid ? RESERVATION_FEE : 0), 0);
    const stillDueTotal = items.reduce((sum, b) => {
      if (b.fullyPaid) return sum;
      const owed = b.total > 0 ? b.total - b.paidSoFar : b.balanceDue + (b.reservationPaid ? 0 : RESERVATION_FEE);
      return sum + Math.max(owed, 0);
    }, 0);
    return {
      bookingCount: items.length,
      reservationPaidCount,
      fullyPaidCount,
      totalPaid: reservationPaidTotal + balancePaidTotal,
      stillDueTotal,
    };
  }, [items]);

  const filterOptions: { id: PaymentFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'paid', label: 'Fully paid', count: stats.fullyPaidCount },
    { id: 'due', label: 'Balance due', count: items.length - stats.fullyPaidCount },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <h2 className="text-[28px] font-bold tracking-tight text-slate-900">Payment History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every booking has two payments: a small reservation online, then the balance at the shop.
        </p>
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/90 via-white to-slate-50/80 p-4 shadow-sm sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">How payments work</p>
        <ol className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            {
              step: '1',
              title: 'Reservation fee',
              desc: `${formatCurrency(RESERVATION_FEE)} online (GCash) to confirm your slot.`,
              icon: <Lock className="h-4 w-4 text-blue-600" />,
            },
            {
              step: '2',
              title: 'Service balance',
              desc: 'Pay the rest when your vehicle is ready for pickup.',
              icon: <Wallet className="h-4 w-4 text-emerald-600" />,
            },
            {
              step: '3',
              title: 'Receipt',
              desc: 'Download your receipt after the balance is marked paid.',
              icon: <Receipt className="h-4 w-4 text-slate-600" />,
            },
          ].map((row) => (
            <li key={row.step} className="flex gap-3 rounded-xl border border-white/80 bg-white/70 px-3 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                {row.step}
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  {row.icon}
                  {row.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{row.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'Bookings',
            value: String(stats.bookingCount),
            sub: 'with payment activity',
            className: 'text-blue-700',
            border: '#2563EB',
            icon: <CircleDollarSign className="h-4 w-4 text-blue-600" />,
          },
          {
            label: 'Paid so far',
            value: formatCurrency(stats.totalPaid),
            sub: 'reservation + balance',
            className: 'text-emerald-700',
            border: '#10B981',
            icon: <Banknote className="h-4 w-4 text-emerald-600" />,
          },
          {
            label: 'Reservation fees',
            value: formatCurrency(stats.reservationPaidCount * RESERVATION_FEE),
            sub: `${stats.reservationPaidCount} paid online`,
            className: 'text-blue-700',
            border: '#2563EB',
            icon: <Lock className="h-4 w-4 text-blue-600" />,
          },
          {
            label: 'Still to pay',
            value: formatCurrency(stats.stillDueTotal),
            sub: stats.stillDueTotal > 0 ? 'balance at shop' : 'all caught up',
            className: stats.stillDueTotal > 0 ? 'text-orange-700' : 'text-emerald-700',
            border: stats.stillDueTotal > 0 ? '#F97316' : '#10B981',
            icon: <Clock className="h-4 w-4 text-orange-600" />,
          },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50" style={{ borderLeft: `4px solid ${card.border}` }}>
            <div className="mb-2 flex items-center gap-2 text-slate-500">{card.icon}</div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{card.label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${card.className}`}>{card.value}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {filterOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setFilter(opt.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
                filter === opt.id
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                  filter === opt.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {opt.count}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50">
            <Receipt className="h-7 w-7 text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-900">No payment records yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
            After you book a service and pay the reservation fee, your payments will show up here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center">
          <p className="text-sm font-medium text-slate-700">No bookings match this filter.</p>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            Show all bookings
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((booking) => {
            const progressPct = booking.total > 0 ? Math.round((booking.paidSoFar / booking.total) * 100) : booking.fullyPaid ? 100 : 0;

            return (
              <article
                key={booking.id}
                className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md"
              >
                <header className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                        {booking.orderLabel}
                      </p>
                      <h3 className="mt-0.5 text-base font-semibold text-slate-900">{booking.serviceName}</h3>
                      <p className="mt-1 text-sm text-slate-500">
                        {booking.vehicle} · {booking.dateLabel}
                      </p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-bold ${
                        booking.fullyPaid
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-orange-100 text-orange-800'
                      }`}
                    >
                      {booking.fullyPaid ? 'Fully paid' : 'Balance due'}
                    </span>
                  </div>

                  {booking.total > 0 ? (
                    <div className="mt-4">
                      <div className="mb-1.5 flex justify-between text-[11px] font-medium text-slate-500">
                        <span>
                          Paid {formatCurrency(booking.paidSoFar)} of {formatCurrency(booking.total)}
                        </span>
                        <span className="tabular-nums">{progressPct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className={`h-full rounded-full transition-all ${
                            booking.fullyPaid ? 'bg-emerald-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </header>

                <div className="divide-y divide-slate-100">
                  <PaymentStepRow
                    icon={<Lock className="h-4 w-4 text-blue-600" />}
                    iconClass="bg-blue-50"
                    title="Step 1 · Reservation fee"
                    subtitle="Paid online via GCash when you booked"
                    amount={RESERVATION_FEE}
                    paid={booking.reservationPaid}
                    pendingLabel="Not paid yet"
                    actions={
                      booking.proofUrl ? (
                        <button
                          type="button"
                          onClick={() => onViewPaymentProof(booking.proofUrl!)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          View GCash proof
                        </button>
                      ) : null
                    }
                  />

                  <PaymentStepRow
                    icon={<Wallet className="h-4 w-4 text-emerald-600" />}
                    iconClass="bg-emerald-50"
                    title="Step 2 · Service balance"
                    subtitle="Paid at the shop when your vehicle is ready for pickup"
                    amount={booking.balanceDue > 0 ? booking.balanceDue : null}
                    paid={booking.balancePaid}
                    pendingLabel="Due at pickup"
                    actions={
                      booking.balancePaid ? (
                        <button
                          type="button"
                          onClick={() => onViewReceipt(booking.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          <Receipt className="h-3.5 w-3.5" />
                          View receipt
                        </button>
                      ) : null
                    }
                  />
                </div>

                <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3.5 sm:px-5">
                  <p className="text-xs font-semibold text-slate-500">Booking total</p>
                  <p className="text-lg font-bold tabular-nums text-slate-900">
                    {booking.total > 0 ? formatCurrency(booking.total) : '—'}
                  </p>
                </footer>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
