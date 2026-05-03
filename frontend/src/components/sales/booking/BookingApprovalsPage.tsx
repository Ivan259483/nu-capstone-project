import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { createPortal } from 'react-dom';
import { X, Search, CheckCircle2, XCircle, Clock, Calendar, Car, Image as ImageIcon, TrendingUp, ShieldCheck, RefreshCw } from 'lucide-react';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import { normalizeBooking } from '@/lib/order-service';

const DOWNPAYMENT = 500;

function getToken() {
  return (
    localStorage.getItem('autospf_token') ||
    sessionStorage.getItem('autospf_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    ''
  );
}

async function apiPatch(url: string, body?: object) {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
}

// ─── Status badge ───────────────────────────────────────────────────────────
function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 rounded-full px-2.5 py-1 shadow-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
      </span>
      <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-widest">Pending Confirmation</span>
    </span>
  );
}

// ─── Payment breakdown ───────────────────────────────────────────────────────
function PayBreakdown({ total }: { total: number }) {
  const balance = Math.max(0, total - DOWNPAYMENT);
  return (
    <div className="bg-slate-50/50 rounded-xl p-3.5 text-xs ring-1 ring-slate-900/5 shadow-inner">
      <div className="flex justify-between mb-2">
        <span className="text-slate-500 font-medium">Service Total</span>
        <span className="font-bold text-slate-800">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="flex justify-between mb-2">
        <span className="text-emerald-600 font-medium">Downpayment (GCash)</span>
        <span className="font-bold text-emerald-600">− ₱{DOWNPAYMENT.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="h-px bg-slate-200/60 my-2.5" />
      <div className="flex justify-between items-center">
        <span className="text-red-600 font-bold">Balance on Arrival</span>
        <span className="font-extrabold text-red-600 text-sm">₱{balance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

// ─── GCash Proof Modal ───────────────────────────────────────────────────────
function ProofModal({ booking, onClose, onApprove, onReject, acting }: {
  booking: any; onClose: () => void;
  onApprove: () => void; onReject: () => void; acting: boolean;
}) {
  const total = Number(booking.totalPrice || booking.totalAmount || 0);
  const balance = Math.max(0, total - DOWNPAYMENT);
  const proofUrl = booking.paymentProofUrl || booking.downpaymentProof;
  
  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md transition-opacity" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.2)] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* header */}
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2 text-white">
            <ShieldCheck size={20} className="opacity-80" />
            <span className="font-extrabold text-base tracking-tight">GCash Payment Proof</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white transition-colors"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
        
        {/* image */}
        <div className="p-6 pb-2">
          {proofUrl ? (
            <div className="relative rounded-2xl overflow-hidden ring-1 ring-slate-900/10 shadow-sm group">
              <img src={proofUrl} alt="GCash proof" className="w-full max-h-[280px] object-contain bg-slate-50" />
            </div>
          ) : (
            <div className="h-32 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2 bg-slate-50/50">
              <ImageIcon size={24} className="opacity-50" />
              <span className="text-sm font-medium">No proof uploaded</span>
            </div>
          )}
        </div>
        
        {/* details */}
        <div className="p-6 pt-4">
          <div className="grid grid-cols-2 gap-3 text-xs mb-5">
            {[
              { label:'Customer', value: booking.customerName },
              { label:'Vehicle', value: [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ') || booking.vehiclePlate || '—' },
              { label:'Service', value: booking.serviceType || booking.serviceName || '—' },
              { label:'Schedule', value: `${booking.bookingDate || '—'} ${booking.bookingTime || ''}`.trim() },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-50/80 rounded-xl p-2.5 ring-1 ring-slate-900/5">
                <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">{label}</div>
                <div className="font-bold text-slate-800 truncate">{value}</div>
              </div>
            ))}
          </div>
          
          <PayBreakdown total={total} />
          
          {/* warning */}
          <div className="mt-5 bg-amber-50/50 border border-amber-200/60 rounded-xl p-3.5 text-xs text-amber-800 font-medium flex gap-3 items-start leading-relaxed">
            <span className="text-lg leading-none shrink-0">⚠️</span>
            <div>
              Approving will enable <strong className="font-extrabold text-amber-900">live tracking</strong> for the customer. 
              Balance of <strong className="font-extrabold text-amber-900">₱{balance.toLocaleString('en-PH')}</strong> to be collected on arrival.
            </div>
          </div>
          
          {/* actions */}
          <div className="flex gap-3 mt-6">
            <button 
              onClick={onReject} 
              disabled={acting}
              className="flex-1 py-3 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 hover:border-red-300 disabled:opacity-50 transition-all active:scale-95"
            >
              Reject
            </button>
            <button 
              onClick={onApprove} 
              disabled={acting}
              className="flex-[2] py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 disabled:opacity-70 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              {acting ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Processing…</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={18} strokeWidth={2.5} />
                  <span>Approve Reservation</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Single booking card ─────────────────────────────────────────────────────
function BookingCard({ booking, onApprove, onReject, idx }: {
  booking: any; idx: number;
  onApprove: (id: string, name: string) => Promise<void>;
  onReject: (id: string, name: string, reason: string) => Promise<void>;
}) {
  const [leaving, setLeaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState('');
  const id = booking._id || booking.id;
  const total = Number(booking.totalPrice || booking.totalAmount || 0);
  const proofUrl = booking.paymentProofUrl || booking.downpaymentProof;
  const ref = booking.bookingReference || booking.orderNumber || id?.slice(-6) || '—';

  const doApprove = async () => {
    setActing(true);
    await onApprove(id, booking.customerName || 'Customer');
    setLeaving(true);
    setActing(false);
    setShowModal(false);
  };

  const doReject = async () => {
    setActing(true);
    await onReject(id, booking.customerName || 'Customer', reason || 'Payment proof could not be verified.');
    setLeaving(true);
    setActing(false);
    setShowModal(false);
  };

  return (
    <>
      {showModal && (
        <ProofModal booking={booking} onClose={() => setShowModal(false)}
          onApprove={doApprove} onReject={() => { setShowModal(false); setRejectMode(true); }} acting={acting} />
      )}
      <div 
        className={`bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_-4px_rgba(0,0,0,0.06)] overflow-hidden transition-all duration-300 relative group
          ${leaving ? 'opacity-0 translate-x-12 scale-95 pointer-events-none' : 'opacity-100 translate-x-0 scale-100'}
        `}
        style={{ animationDelay: `${idx * 0.05}s` }}
      >
        {/* Amber accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-300" />
        
        <div className="p-5 sm:p-6">
          {/* Top row */}
          <div className="flex items-start sm:items-center justify-between mb-5 flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm ring-2 ring-white">
                <span className="text-white font-black text-lg">{(booking.customerName || 'C').charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <div className="font-extrabold text-base text-slate-900 tracking-tight">{booking.customerName || '—'}</div>
                <div className="text-[11px] font-medium text-slate-500 mt-0.5 flex items-center gap-1.5">
                  <Clock size={12} className="opacity-70" />
                  {booking.createdAt ? new Date(booking.createdAt).toLocaleString('en-PH', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'}
                  <span className="text-slate-300">•</span>
                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">#{ref}</span>
                </div>
              </div>
            </div>
            <PendingBadge />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-6 items-start">
            <div className="flex flex-col gap-5">
              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label:'Plate', value: booking.vehiclePlate || '—', icon: Car },
                  { label:'Vehicle', value: [booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ') || '—', icon: null },
                  { label:'Service', value: booking.serviceType || booking.serviceName || '—', icon: null },
                  { label:'Date', value: booking.bookingDate || '—', icon: Calendar },
                  { label:'Time', value: booking.bookingTime || '—', icon: Clock },
                  { label:'Phone', value: booking.customerPhone || '—', icon: null },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-slate-50/80 rounded-xl p-2.5 ring-1 ring-slate-900/5 group-hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-1 mb-1">
                      {Icon && <Icon size={10} className="text-slate-400" />}
                      <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">{label}</div>
                    </div>
                    <div className="text-xs font-bold text-slate-700 truncate">{value}</div>
                  </div>
                ))}
              </div>

              <div className="max-w-sm">
                <PayBreakdown total={total} />
              </div>

              {/* Actions */}
              {!rejectMode ? (
                <div className="flex gap-3 max-w-sm">
                  <button onClick={() => setShowModal(true)}
                    className="flex-[2] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold text-sm shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 active:scale-95">
                    <CheckCircle2 size={18} strokeWidth={2.5} />
                    Approve Reservation
                  </button>
                  <button onClick={() => setRejectMode(true)}
                    className="flex-1 py-2.5 px-4 rounded-xl border border-red-200 bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 hover:border-red-300 transition-all active:scale-95">
                    Reject
                  </button>
                </div>
              ) : (
                <div className="bg-red-50/50 ring-1 ring-red-200 rounded-2xl p-4 max-w-sm animate-in fade-in zoom-in-95 duration-200">
                  <div className="text-xs font-extrabold text-red-700 mb-2 uppercase tracking-wide">Reason for rejection (optional)</div>
                  <input value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="e.g. Screenshot unclear, wrong reference…"
                    className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all mb-3 bg-white shadow-sm" />
                  <div className="flex gap-2">
                    <button onClick={doReject} disabled={acting}
                      className="flex-1 py-2 rounded-xl bg-red-600 text-white font-bold text-sm shadow-sm hover:bg-red-700 disabled:opacity-70 transition-all flex items-center justify-center gap-2 active:scale-95">
                      {acting ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <XCircle size={16} strokeWidth={2.5} />
                      )}
                      {acting ? 'Rejecting…' : 'Confirm Reject'}
                    </button>
                    <button onClick={() => setRejectMode(false)}
                      className="px-4 py-2 rounded-xl ring-1 ring-slate-200 bg-white text-slate-600 font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* GCash proof thumbnail */}
            <div className="w-full md:w-[160px] shrink-0">
              <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.15em] mb-2 px-1">GCash Proof</div>
              {proofUrl ? (
                <div onClick={() => setShowModal(true)}
                  className="cursor-zoom-in rounded-2xl overflow-hidden ring-2 ring-slate-200/80 hover:ring-amber-400 hover:shadow-lg hover:shadow-amber-500/20 relative transition-all duration-300 group/proof bg-slate-50">
                  <img src={proofUrl} alt="GCash proof" className="w-full h-[180px] object-cover transition-transform duration-500 group-hover/proof:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent opacity-0 group-hover/proof:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-3">
                    <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full">
                      <Search size={12} /> Click to review
                    </span>
                  </div>
                </div>
              ) : (
                <div className="w-full h-[180px] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center bg-slate-50/50 gap-2 text-slate-400">
                  <ImageIcon size={28} className="opacity-40" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">No proof uploaded</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Approved / Rejected history row ────────────────────────────────────────
function HistoryRow({ b, type }: { b: any; type: 'approved' | 'rejected' }) {
  const total = Number(b.totalPrice || b.totalAmount || 0);
  const isApproved = type === 'approved';
  
  return (
    <div className="bg-white rounded-2xl ring-1 ring-slate-900/[0.06] p-4 flex items-center gap-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.04),0_6px_16px_-4px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200 group">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-inset ${
        isApproved 
          ? 'bg-emerald-50 text-emerald-600 ring-emerald-600/20' 
          : 'bg-red-50 text-red-600 ring-red-600/20'
      }`}>
        {isApproved ? <CheckCircle2 size={20} strokeWidth={2.5} /> : <XCircle size={20} strokeWidth={2.5} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-slate-900 truncate mb-0.5">{b.customerName || '—'}</div>
        <div className="text-[11px] font-medium text-slate-500 truncate flex items-center gap-1.5">
          <span>{b.serviceType || b.serviceName || '—'}</span>
          <span className="text-slate-300">•</span>
          <span className="font-mono bg-slate-100 px-1 rounded">{b.vehiclePlate || '—'}</span>
          <span className="text-slate-300">•</span>
          <span>{b.bookingDate || '—'}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`font-black text-xs uppercase tracking-wider ${isApproved ? 'text-emerald-600' : 'text-red-600'}`}>
          {isApproved ? 'Approved' : 'Rejected'}
        </div>
        <div className="text-[11px] font-bold text-slate-500 mt-0.5">₱{total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function BookingApprovalsPage() {
  const [tab, setTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { OrderService } = await import('@/lib/order-service');
      const res = await OrderService.getAllOrders({ suppressErrorToast: true });
      if (res.success && Array.isArray(res.data)) {
        setAllBookings(res.data.filter((o: any) =>
          ['pending_confirmation', 'approved', 'rejected'].includes(o.status)
        ));
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  const APPROVAL_STATUSES = ['pending_confirmation', 'approved', 'rejected'];

  useEffect(() => {
    fetchAll();

    // ── 60s backup polling — true last-resort if socket is silent ────────
    const interval = setInterval(() => {
      import('@/lib/order-service').then(({ OrderService }) =>
        OrderService.getAllOrders({ suppressErrorToast: true }).then(res => {
          if (res.success && Array.isArray(res.data)) {
            setAllBookings(res.data.filter((o: any) =>
              APPROVAL_STATUSES.includes(o.status)
            ));
          }
        })
      ).catch(() => {});
    }, 60_000);

    // ── Shared socket: instant state patch from fullDocument ──────────────
    // No HTTP call — we use the document already embedded in the socket event.
    const socket = getSharedSocket();
    const handleDbChange = (payload: any) => {
      if (payload.collection !== 'orders') return;

      const { operationType, documentKey, fullDocument } = payload;

      // Fallback to HTTP only if fullDocument is absent
      if (!fullDocument && operationType !== 'delete') {
        console.warn('[BookingApprovals] db_change missing fullDocument — fallback HTTP fetch');
        import('@/lib/order-service').then(({ OrderService }) =>
          OrderService.getAllOrders({ suppressErrorToast: true }).then(res => {
            if (res.success && Array.isArray(res.data)) {
              setAllBookings(res.data.filter((o: any) => APPROVAL_STATUSES.includes(o.status)));
            }
          })
        ).catch(() => {});
        return;
      }

      const docId = String(fullDocument?._id || documentKey?._id || '');

      if (operationType === 'delete') {
        setAllBookings(prev => prev.filter(b => String(b._id || b.id) !== docId));
        console.log('[BookingApprovals] db_change delete → removed', docId);
        return;
      }

      const normalized = normalizeBooking(fullDocument);
      const inScope = APPROVAL_STATUSES.includes(normalized.status ?? '');

      setAllBookings(prev => {
        const existsAt = prev.findIndex(b => String(b._id || b.id) === docId);
        if (!inScope) {
          // Status moved out of approval scope (e.g. confirmed) — remove it
          return existsAt >= 0 ? prev.filter((_, i) => i !== existsAt) : prev;
        }
        if (existsAt >= 0) {
          // Update existing
          const next = [...prev];
          next[existsAt] = { ...normalized, _id: fullDocument._id };
          return next;
        }
        // New document in scope — prepend
        return [{ ...normalized, _id: fullDocument._id }, ...prev];
      });
      console.log('[BookingApprovals] db_change', operationType, '→ patched', docId);
    };
    socket.on('db_change', handleDbChange);

    // ── Tab visibility / focus refresh ───────────────────────────────────
    let visTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (visTimer) clearTimeout(visTimer);
        visTimer = setTimeout(() => {
          console.log('[BookingApprovals] Tab visible → silent refetch');
          import('@/lib/order-service').then(({ OrderService }) =>
            OrderService.getAllOrders({ suppressErrorToast: true }).then(res => {
              if (res.success && Array.isArray(res.data)) {
                setAllBookings(res.data.filter((o: any) =>
                  ['pending_confirmation', 'approved', 'rejected'].includes(o.status)
                ));
              }
            })
          ).catch(() => {});
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      socket.off('db_change', handleDbChange);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      if (visTimer) clearTimeout(visTimer);
    };
  }, [fetchAll]);

  const pending = allBookings.filter(b => b.status === 'pending_confirmation');
  const approved = allBookings.filter(b => b.status === 'approved');
  const rejected = allBookings.filter(b => b.status === 'rejected');

  const handleApprove = async (id: string, name: string) => {
    const data = await apiPatch(`/api/orders/${id}/approve`);
    if (data.success) {
      toast.success(`${name} — reservation APPROVED. Live tracking enabled.`);
      await fetchAll();
    } else {
      toast.error('Approval failed', { description: data.message });
    }
  };

  const handleReject = async (id: string, name: string, reason: string) => {
    const data = await apiPatch(`/api/orders/${id}/reject`, { reason });
    if (data.success) {
      toast.error(`${name} — booking REJECTED.`);
      await fetchAll();
    } else {
      toast.error('Rejection failed', { description: data.message });
    }
  };

  const TABS = [
    { key: 'pending', label: 'Pending', count: pending.length, pulse: true },
    { key: 'approved', label: 'Approved', count: approved.length },
    { key: 'rejected', label: 'Rejected', count: rejected.length },
  ] as const;

  return (
    <div className="h-full flex flex-col space-y-6 page-enter pb-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Booking Approvals</h1>
          <p className="text-sm text-slate-500 mt-1">Review GCash payment proofs — approve or reject pending reservations</p>
        </div>
        <div className="flex items-center gap-3">
          {pending.length > 0 && (
            <span className="bg-amber-50/80 backdrop-blur-sm border border-amber-200/50 rounded-full px-3.5 py-1.5 text-xs font-bold text-amber-700 shadow-sm flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              {pending.length} Pending
            </span>
          )}
          <button 
            onClick={fetchAll}
            className="bg-white ring-1 ring-slate-900/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)] rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-all flex items-center gap-2 active:scale-95"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200/60 shrink-0">
        {TABS.map(t => {
          const active = tab === t.key;
          return (
            <button 
              key={t.key} 
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-3 border-b-2 transition-all duration-200 ${
                active 
                  ? 'border-amber-500 text-slate-900 font-bold' 
                  : 'border-transparent text-slate-500 font-medium hover:text-slate-700 hover:bg-slate-50/50'
              }`}
            >
              {t.label}
              <span className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[10px] font-black text-center relative ${
                active 
                  ? (t.key === 'pending' ? 'bg-amber-500 text-white shadow-sm' : t.key === 'approved' ? 'bg-emerald-500 text-white shadow-sm' : 'bg-red-500 text-white shadow-sm')
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {t.count}
                {(t as any).pulse && t.count > 0 && active && (
                  <span className="absolute inset-0 rounded-full bg-amber-500 opacity-40 animate-ping" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="w-10 h-10 border-4 border-amber-100 border-t-amber-500 rounded-full animate-spin" />
            <p className="text-sm font-medium text-slate-400">Loading bookings…</p>
          </div>
        ) : tab === 'pending' ? (
          pending.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-6xl mb-4 animate-bounce">🎉</div>
              <p className="text-xl font-extrabold text-slate-800 mb-1">All caught up!</p>
              <p className="text-sm text-slate-400">No bookings pending confirmation right now.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-5 pb-6">
              {pending.map((b, i) => (
                <BookingCard key={b._id || b.id} booking={b} idx={i}
                  onApprove={handleApprove} onReject={handleReject} />
              ))}
            </div>
          )
        ) : tab === 'approved' ? (
          approved.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-slate-900/5">
                <CheckCircle2 size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">No approved bookings yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
              {approved.map(b => <HistoryRow key={b._id || b.id} b={b} type="approved" />)}
            </div>
          )
        ) : (
          rejected.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 ring-1 ring-slate-900/5">
                <XCircle size={28} className="text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-500">No rejected bookings.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
              {rejected.map(b => <HistoryRow key={b._id || b.id} b={b} type="rejected" />)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
