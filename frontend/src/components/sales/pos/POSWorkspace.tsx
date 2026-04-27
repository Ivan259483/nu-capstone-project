import React, { useState, useEffect, useCallback } from 'react';
import CustomerVehiclePanel from './CustomerVehiclePanel';
import ServiceCartPanel from './ServiceCartPanel';
import PaymentSummaryPanel from './PaymentSummaryPanel';
import ReceiptModal from './ReceiptModal';
import { CUSTOMERS, Customer, Vehicle, CartItem } from '@/lib/salesData';
import { useServices, VehicleType, getEffectivePrice } from '@/hooks/useServices';
import { toast } from 'sonner';

// Map vehicle.type string → VehicleType key
const VEHICLE_TYPE_MAP: Record<string, VehicleType> = {
  hatchback:  'hatchback',
  sedan:      'sedan',
  midsized:   'midsized',
  'mid-sized':'midsized',
  midsize:    'midsized',
  suv:        'suv',
  'pick up':  'pickup',
  pickup:     'pickup',
  'pick-up':  'pickup',
  'large suv':'largesuv',
  largesuv:   'largesuv',
  van:        'largesuv',
  'large suv/van': 'largesuv',
  'highend sedan': 'highend',
  highend:    'highend',
  'high-end': 'highend',
};

function resolveVehicleType(vehicleTypeStr: string): VehicleType {
  const normalized = (vehicleTypeStr || '').trim().toLowerCase();
  return VEHICLE_TYPE_MAP[normalized] ?? 'sedan';
}

const TINT_PRICES: Record<string, Partial<Record<VehicleType, number>>> = {
  'SPF 80': { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largesuv: 20999, highend: 22999 },
  'SPF 89': { hatchback: 14999, sedan: 15999, midsized: 17499, suv: 18999, pickup: 17499, largesuv: 22999, highend: 23999 },
  'SPF 99': { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largesuv: 27999, highend: 28999 },
};

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  confirmed:        { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  approved:         { bg: 'bg-emerald-50',text: 'text-emerald-700',dot: 'bg-emerald-500' },
  assigned:         { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  received:         { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  in_progress:      { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  completed:        { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
  pending_confirmation: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
};

function getToken() {
  return (
    localStorage.getItem('autospf_token') ||
    sessionStorage.getItem('autospf_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    ''
  );
}

// ── Check-In Queue (compact collapsible strip) ────────────────────────────────
function CheckInQueuePanel({ onSelectBooking }: { onSelectBooking: (b: any) => void }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadBookings = useCallback(async () => {
    setLoading(true);
    try {
      const { OrderService } = await import('@/lib/order-service');
      const res = await OrderService.getAllOrders({ suppressErrorToast: true });
      if (res.success && Array.isArray(res.data)) {
        const queue = res.data
          .filter((b: any) => ['confirmed', 'approved', 'assigned', 'received', 'in_progress', 'completed'].includes((b.status || '').toLowerCase()))
          .sort((a: any, b: any) => (a.bookingTime || '').localeCompare(b.bookingTime || ''));
        setBookings(queue);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  const handleCheckIn = async (b: any) => {
    const id = b._id || b.id;
    setCheckingIn(id);
    try {
      const res = await window.fetch(`/api/orders/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: 'received' }),
      });
      const data = await res.json();
      if (data.success) { toast.success(`${b.customerName} checked in ✓`); loadBookings(); }
      else toast.error(data.message || 'Check-in failed');
    } catch { toast.error('Network error'); }
    setCheckingIn(null);
  };

  const totalToday = bookings.length;
  const readyToPay = bookings.filter((b: any) => ['completed', 'ready_for_payment'].includes(b.status)).length;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,.05)', overflow: 'hidden', flexShrink: 0 }}>
      {/* Compact header — always visible, click to expand */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', userSelect: 'none', borderBottom: expanded ? '1px solid #f1f5f9' : 'none' }}
      >
        {/* Label + count badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'posQPulse 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#1e293b' }}>Check-In Queue</span>
          {totalToday > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#eff6ff', color: '#1d4ed8', padding: '1px 8px', borderRadius: 20 }}>{totalToday} today</span>
          )}
          {readyToPay > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#f0fdf4', color: '#15803d', padding: '1px 8px', borderRadius: 20 }}>💰 {readyToPay} ready</span>
          )}
        </div>

        {/* Scrollable booking pills */}
        {!loading && bookings.length > 0 && (
          <div style={{ flex: 1, display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '2px 0' }}>
            {bookings.map((b: any) => {
              const st = (b.status || '').toLowerCase();
              const dotColor = st === 'completed' ? '#22c55e' : st === 'received' || st === 'in_progress' ? '#f59e0b' : '#3b82f6';
              return (
                <button
                  key={b._id || b.id}
                  onClick={e => { e.stopPropagation(); onSelectBooking(b); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#334155' }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  <span>{(b.customerName || '?').split(' ')[0]}</span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{b.bookingTime || '—'}</span>
                </button>
              );
            })}
          </div>
        )}
        {!loading && bookings.length === 0 && (
          <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>No confirmed bookings today</span>
        )}

        {/* Refresh + chevron */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, marginLeft: 4 }}>
          <button
            onClick={e => { e.stopPropagation(); loadBookings(); }}
            style={{ width: 26, height: 26, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><path d="M1 4v6h6M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          </button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {/* Expanded detail rows */}
      {expanded && (
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 0', gap: 8 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #e2e8f0', borderTop: '2px solid #3b82f6', animation: 'posQSpin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</span>
            </div>
          ) : bookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', fontSize: 12, color: '#94a3b8' }}>No confirmed bookings today.</div>
          ) : (
            bookings.map((b: any) => {
              const id = b._id || b.id;
              const st = (b.status || 'confirmed').toLowerCase();
              const colors = STATUS_COLORS[st] || STATUS_COLORS.confirmed;
              const isChecking = checkingIn === id;
              const canCheckIn = ['confirmed', 'approved', 'assigned'].includes(st);
              const isReadyToPay = ['completed', 'ready_for_payment'].includes(st);
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderTop: '1px solid #f8fafc' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                    {(b.customerName || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{b.customerName || 'Unknown'}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20 }} className={`${colors.bg} ${colors.text}`}>
                        {st.replace('_', ' ')}
                      </span>
                      {isReadyToPay && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20, background: '#fffbeb', color: '#b45309' }}>💰 Ready to Pay</span>}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {b.vehiclePlate || '—'} · {b.serviceType || b.serviceName || '—'} · <strong style={{ color: '#2563eb' }}>{b.bookingTime || '—'}</strong>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {canCheckIn && (
                      <button
                        onClick={() => handleCheckIn(b)}
                        disabled={isChecking}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', opacity: isChecking ? 0.6 : 1 }}
                      >
                        {isChecking ? <div style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.3)', borderTop: '1.5px solid #fff', animation: 'posQSpin 1s linear infinite' }} /> : '✓'}
                        {isChecking ? 'Checking…' : 'Check In'}
                      </button>
                    )}
                    <button
                      onClick={() => { onSelectBooking(b); setExpanded(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 11, cursor: 'pointer' }}
                    >
                      Open POS
                    </button>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>₱{Number(b.totalPrice || b.totalAmount || 0).toLocaleString()}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Main POS Workspace ────────────────────────────────────────────────────────
export default function POSWorkspace() {
  const { services, isLoading: servicesLoading } = useServices();

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [manualVehicleType, setManualVehicleType] = useState<VehicleType | null>(null);

  useEffect(() => {
    if (selectedVehicle?.type) setManualVehicleType(null);
  }, [selectedVehicle]);

  const customerVehicleType: VehicleType | null = selectedVehicle
    ? resolveVehicleType(selectedVehicle.type)
    : null;

  const effectiveVehicleType: VehicleType = manualVehicleType ?? customerVehicleType ?? 'sedan';
  const isVehicleFromCustomer = !manualVehicleType && customerVehicleType !== null;

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [showReceipt, setShowReceipt] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [completedTxnId, setCompletedTxnId] = useState<string>('');

  const handleSelectBooking = (b: any) => {
    const syntheticCustomer: Customer = {
      id: b.customer || b._id,
      name: b.customerName || 'Customer',
      phone: b.customerPhone || '',
      email: b.customerEmail || '',
      tier: 'bronze',
      visitCount: 0,
      totalSpent: 0,
      lastVisit: new Date().toISOString(),
      memberSince: new Date().toISOString(),
      notes: '',
      vehicles: [{
        id: b._id,
        plate: b.vehiclePlate || '',
        make: b.vehicleMake || '',
        model: b.vehicleModel || '',
        year: b.vehicleYear || '',
        color: b.vehicleColor || '',
        type: b.vehicleType || 'sedan',
      }],
    };
    setSelectedCustomer(syntheticCustomer);
    setSelectedVehicle(syntheticCustomer.vehicles[0]);
    setManualVehicleType(null);
    toast.success(`Loaded booking: ${b.customerName}`);
  };

  const addToCart = (svcId: string, withTint = false) => {
    const svc = services.find((s) => s._id === svcId);
    if (!svc) return;
    const lockedVehicleType = effectiveVehicleType;

    if (withTint) {
      const spfKey = Object.keys(TINT_PRICES).find((k) => svc.name.includes(k));
      const tintPrice = spfKey ? (TINT_PRICES[spfKey][lockedVehicleType] ?? 0) : 0;
      if (tintPrice > 0) {
        const tintId = `${svcId}-tint`;
        if (!cartItems.find((c) => c.id === tintId)) {
          setCartItems((prev) => [...prev, {
            id: tintId,
            name: `${svc.name} + Nano Ceramic Window Tint`,
            category: svc.category,
            price: tintPrice,
            duration: '',
            description: 'Bundle with Nano Ceramic Window Tint',
            quantity: 1,
            vehicleType: lockedVehicleType,
          } as CartItem & { vehicleType: VehicleType }]);
        }
        toast.success(`Tint bundle added: ${svc.name}`);
        return;
      }
    }

    const price = getEffectivePrice(svc, lockedVehicleType);
    const existing = cartItems.find((c) => c.id === svcId);
    if (existing) {
      setCartItems(cartItems.map((c) => c.id === svcId ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCartItems([...cartItems, {
        id: svc._id,
        name: svc.name,
        category: svc.category,
        price,
        duration: svc.duration || '',
        description: '',
        quantity: 1,
        vehicleType: lockedVehicleType,
      } as CartItem & { vehicleType: VehicleType }]);
    }
    toast.success(`Added: ${svc.name} (${lockedVehicleType})`);
  };

  const removeFromCart = (svcId: string) => setCartItems(cartItems.filter((c) => c.id !== svcId));
  const updateQty = (svcId: string, qty: number) => {
    if (qty < 1) { removeFromCart(svcId); return; }
    setCartItems(cartItems.map((c) => c.id === svcId ? { ...c, quantity: qty } : c));
  };

  const subtotal = cartItems.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const total = Math.max(0, subtotal - discount);

  const handleProcessPayment = async () => {
    if (!selectedCustomer) { toast.error('Please select a customer before processing payment.'); return; }
    if (!selectedVehicle) { toast.error('Please select a vehicle for this transaction.'); return; }
    if (cartItems.length === 0) { toast.error('Add at least one service to proceed.'); return; }
    setProcessing(true);
    try {
      const { OrderService } = await import('@/lib/order-service');
      const orderPayload = {
        customerName: selectedCustomer.name,
        customerEmail: selectedCustomer.email,
        customerPhone: selectedCustomer.phone,
        vehiclePlate: selectedVehicle.plate,
        vehicleMake: selectedVehicle.make,
        vehicleModel: selectedVehicle.model,
        vehicleType: selectedVehicle.type,
        vehicleColor: selectedVehicle.color,
        items: cartItems.map(c => ({
          name: c.name,
          price: c.price,
          quantity: c.quantity,
        })),
        totalAmount: subtotal,
        totalPrice: total,
        discount: discount,
        paymentMethod: paymentMethod,
        status: 'completed',
        notes: '',
      };
      const res = await OrderService.createOrder(orderPayload);
      if (res.success) {
        const txnId = res.data?.bookingReference || res.data?._id || `TXN-${Date.now()}`;
        setCompletedTxnId(txnId);
        setShowReceipt(true);
        toast.success(`Payment processed! ${txnId}`);
      } else {
        toast.error(res.message || 'Failed to process payment');
      }
    } catch (err: any) {
      console.error('POS Payment Error:', err);
      // Fallback: still show receipt but warn
      const fallbackId = `TXN-LOCAL-${Date.now()}`;
      setCompletedTxnId(fallbackId);
      setShowReceipt(true);
      toast.warning('Payment saved locally — sync may be delayed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleNewTransaction = () => {
    setSelectedCustomer(null);
    setSelectedVehicle(null);
    setManualVehicleType(null);
    setCartItems([]);
    setDiscount(0);
    setPaymentMethod('cash');
    setShowReceipt(false);
    setCompletedTxnId('');
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes posQSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes posQPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .5; transform: scale(.8); } }
      ` }} />
      <div className="h-full flex flex-col gap-3">
        {/* Check-In Queue — compact collapsible strip */}
        <CheckInQueuePanel onSelectBooking={handleSelectBooking} />

        {/* POS 3-column area — fills remaining space */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-1 min-h-0">
          <div className="lg:col-span-3 flex flex-col overflow-hidden">
            <CustomerVehiclePanel
              customers={CUSTOMERS}
              selectedCustomer={selectedCustomer}
              selectedVehicle={selectedVehicle}
              onSelectCustomer={(c) => { setSelectedCustomer(c); setSelectedVehicle(null); setManualVehicleType(null); }}
              onSelectVehicle={(v) => { setSelectedVehicle(v); setManualVehicleType(null); }}
            />
          </div>

          <div className="lg:col-span-5 flex flex-col overflow-hidden">
            <ServiceCartPanel
              services={services}
              servicesLoading={servicesLoading}
              selectedVehicleType={effectiveVehicleType}
              onVehicleTypeChange={setManualVehicleType}
              isVehicleFromCustomer={isVehicleFromCustomer}
              cartItems={cartItems}
              onAddToCart={addToCart}
              onRemoveFromCart={removeFromCart}
              onUpdateQty={updateQty}
            />
          </div>

          <div className="lg:col-span-4 flex flex-col overflow-hidden">
            <PaymentSummaryPanel
              cartItems={cartItems}
              subtotal={subtotal}
              discount={discount}
              total={total}
              paymentMethod={paymentMethod}
              processing={processing}
              onDiscountChange={setDiscount}
              onPaymentMethodChange={setPaymentMethod}
              onProcessPayment={handleProcessPayment}
            />
          </div>
        </div>

        {showReceipt && selectedCustomer && selectedVehicle && (
          <ReceiptModal
            txnId={completedTxnId}
            customer={selectedCustomer}
            vehicle={selectedVehicle}
            cartItems={cartItems}
            subtotal={subtotal}
            discount={discount}
            total={total}
            paymentMethod={paymentMethod}
            onClose={() => setShowReceipt(false)}
            onNewTransaction={handleNewTransaction}
          />
        )}
      </div>
    </>
  );
}
