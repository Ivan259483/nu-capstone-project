import { useState } from 'react';
import { Car, ChevronDown, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { Booking } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { getCustomerBookingJourneyPresentation } from '@/lib/customer-booking-journey';
import { getCustomerBookingTone } from '@/lib/customer-booking-presentation';
import { getCustomerPaymentPresentation } from '@/lib/customer-payment-presentation';
import { CustomerBookingDetails } from './CustomerBookingDetails';
import { CustomerButton, CustomerState, CustomerStatusBadge } from './CustomerUI';

type HistoryVehicle = { year?: string | number; make?: string; brand?: string; model?: string; plate?: string; plateNumber?: string };

function HistoryRecord({ order }: { order: Partial<Booking> }) {
  const [expanded, setExpanded] = useState(false);
  const payment = getCustomerPaymentPresentation(order);
  const date = new Date(order.bookingDate || order.date || order.createdAt || '');
  return <article className="customer-history-record">
    <div><h3>{order.serviceName || order.serviceType || 'Service'}</h3>
      <p>{Number.isFinite(date.getTime()) ? date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Schedule unavailable'}</p>
    </div>
    <CustomerStatusBadge label={getCustomerBookingJourneyPresentation(order).statusLabel} tone={getCustomerBookingTone(order)} />
    <span className="customer-history-record__amount">{payment.total === null ? 'Amount unavailable' : formatCurrency(payment.total)}</span>
    <CustomerButton tone="ghost" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
      {expanded ? 'Hide details' : 'View details'}<ChevronDown aria-hidden="true" />
    </CustomerButton>
    {expanded && <CustomerBookingDetails booking={order} />}
  </article>;
}

export function VehicleHistoryModal({ open, vehicle, orders, loading, error, onOpenChange, onRetry, onBookAgain }: {
  open: boolean; vehicle: HistoryVehicle | null; orders: Partial<Booking>[]; loading: boolean; error?: string;
  onOpenChange: (open: boolean) => void; onRetry: () => void; onBookAgain: () => void;
}) {
  const name = vehicle ? [vehicle.year, vehicle.make || vehicle.brand, vehicle.model].filter(Boolean).join(' ') : '';
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="customer-portal-theme customer-history-dialog" overlayClassName="customer-portal-theme customer-dialog-backdrop">
      <header className="customer-history-heading"><Car size={24} aria-hidden="true" />
        <div><DialogTitle>{name || 'Vehicle history'}</DialogTitle><DialogDescription>{vehicle?.plate || vehicle?.plateNumber || 'Service history for this vehicle'}</DialogDescription></div>
      </header>
      <div className="customer-history-body">
        {loading ? <div className="customer-history-loading" role="status" aria-busy="true"><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading service history…</div>
          : error ? <CustomerState error title="Could not load service history" description={error}><CustomerButton onClick={onRetry}>Try again</CustomerButton></CustomerState>
            : orders.length === 0 ? <CustomerState title="No service history yet" description="Completed and upcoming bookings for this vehicle will appear here." />
              : <div className="customer-history-records">{orders.map((order, index) => <HistoryRecord key={order._id || order.id || index} order={order} />)}</div>}
      </div>
      <footer className="customer-history-footer"><CustomerButton tone="primary" onClick={onBookAgain} disabled={!vehicle}>Book again</CustomerButton></footer>
    </DialogContent>
  </Dialog>;
}
