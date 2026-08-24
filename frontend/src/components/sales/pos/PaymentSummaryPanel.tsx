import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Check,
  ChevronRight,
  FileText,
  Landmark,
  Loader2,
  Plus,
  Smartphone,
  Tag,
} from 'lucide-react';
import { CartItem, formatPeso } from '@/lib/salesData';
import type { BillingDiscount } from '@/lib/billing-service';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  cartItems: CartItem[];
  subtotal: number;
  discount: number;
  discountConfig: BillingDiscount;
  vatAmount: number;
  total: number;
  balanceCheckout?: {
    originalTotal?: number;
    grandTotal: number;
    reservationApplied: number;
    amountPaid?: number;
    balanceDue: number;
    remainingBalance?: number;
    totalDue?: number;
    discountTotal?: number;
    taxVatTotal?: number;
    additionalFeesTotal?: number;
    queued?: boolean;
  } | null;
  compact?: boolean;
  paymentMethod: string;
  processing: boolean;
  paymentDisabled?: boolean;
  queuedOrderLabel?: string | null;
  transactionNotes?: string;
  cashReceived: string;
  gcashAmountReceived: string;
  gcashReference: string;
  validationAttempted?: boolean;
  validationMessage?: string;
  onDiscountChange: (discount: BillingDiscount) => void;
  onVatChange: (v: number) => void;
  onPaymentMethodChange: (v: string) => void;
  onTransactionNotesChange?: (v: string) => void;
  onCashReceivedChange: (v: string) => void;
  onGcashAmountReceivedChange: (v: string) => void;
  onGcashReferenceChange: (v: string) => void;
  onClearQueuedOrder?: () => void;
  onProcessPayment: () => void;
}

const PAYMENT_METHODS = [
  { id: 'pm-cash', value: 'cash', label: 'Cash', icon: Banknote, color: 'text-emerald-600' },
  { id: 'pm-gcash', value: 'gcash', label: 'GCash', icon: Smartphone, color: 'text-blue-600' },
];

function parseCurrencyInput(value: string): number {
  const parsed = Number(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function smartCashValues(total: number): number[] {
  if (total <= 0) return [];
  const candidates = [100, 500, 1_000, 5_000, 10_000]
    .map((step) => Math.ceil(total / step) * step)
    .filter((value) => value > total);
  return [...new Set(candidates)].slice(0, 3);
}

export default function PaymentSummaryPanel({
  cartItems,
  subtotal,
  discount,
  discountConfig,
  vatAmount,
  total,
  balanceCheckout = null,
  compact = false,
  paymentMethod,
  processing,
  paymentDisabled = false,
  queuedOrderLabel = null,
  transactionNotes = '',
  cashReceived,
  gcashAmountReceived,
  gcashReference,
  validationAttempted = false,
  validationMessage = '',
  onDiscountChange,
  onVatChange,
  onPaymentMethodChange,
  onTransactionNotesChange,
  onCashReceivedChange,
  onGcashAmountReceivedChange,
  onGcashReferenceChange,
  onClearQueuedOrder,
  onProcessPayment,
}: Props) {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(Boolean(transactionNotes));
  const [vatOpen, setVatOpen] = useState(false);
  const [draftDiscountType, setDraftDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [draftDiscountValue, setDraftDiscountValue] = useState('');
  const [draftDiscountReason, setDraftDiscountReason] = useState('');
  const [discountError, setDiscountError] = useState('');

  const payAmount = balanceCheckout?.remainingBalance ?? balanceCheckout?.balanceDue ?? total;
  const isCompact = compact || Boolean(balanceCheckout);
  const receivedCash = parseCurrencyInput(cashReceived);
  const cashShort = Math.max(0, payAmount - receivedCash);
  const cashChange = Math.max(0, receivedCash - payAmount);
  const gcashReceived = parseCurrencyInput(gcashAmountReceived);
  const gcashMismatch = Math.abs(gcashReceived - payAmount) > 0.009;
  const quickCash = useMemo(() => smartCashValues(payAmount), [payAmount]);
  const payLabel = paymentMethod === 'gcash'
    ? 'Verify & Complete GCash Payment'
    : `Complete Cash Payment — ${formatPeso(payAmount)}`;

  useEffect(() => {
    if (!transactionNotes) setNotesOpen(false);
  }, [transactionNotes]);

  const openDiscountEditor = () => {
    setDraftDiscountType(discountConfig.discountType || 'fixed');
    setDraftDiscountValue(discountConfig.value > 0 ? String(discountConfig.value) : '');
    setDraftDiscountReason(discountConfig.reason || '');
    setDiscountError('');
    setDiscountOpen(true);
  };

  const applyDiscount = () => {
    const value = Number(draftDiscountValue);
    if (!Number.isFinite(value) || value <= 0) {
      setDiscountError('Enter a discount greater than zero.');
      return;
    }
    if (draftDiscountType === 'percent' && value > 100) {
      setDiscountError('Percentage discounts cannot exceed 100%.');
      return;
    }
    if (draftDiscountType === 'fixed' && value > subtotal) {
      setDiscountError('Fixed discount cannot exceed the subtotal.');
      return;
    }
    onDiscountChange({
      discountType: draftDiscountType,
      value,
      reason: draftDiscountReason.trim() || undefined,
    });
    setDiscountOpen(false);
  };

  return (
    <>
      <section
        aria-labelledby="payment-summary-heading"
        className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${
          isCompact ? 'shrink-0' : 'min-h-0 flex-1'
        }`}
      >
        <div className={`border-b border-slate-100 ${isCompact ? 'px-3 py-2.5' : 'px-4 py-3.5'}`}>
          <div className="flex items-center justify-between gap-2">
            <h3 id="payment-summary-heading" className="text-sm font-bold text-slate-950">Payment Summary</h3>
            {queuedOrderLabel ? (
              <span className="max-w-[12rem] truncate rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-700">
                Queue · {queuedOrderLabel}
              </span>
            ) : null}
          </div>
          {queuedOrderLabel && onClearQueuedOrder ? (
            <button
              type="button"
              onClick={onClearQueuedOrder}
              className="mt-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              Clear queued order
            </button>
          ) : null}
        </div>

        <div className={isCompact ? 'max-h-[min(62vh,680px)] space-y-3 overflow-y-auto overscroll-contain px-3 py-3' : 'min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4'}>
          {cartItems.length > 0 ? (
            <div className="space-y-2" aria-label="Transaction line items">
              {cartItems.map((item) => (
                <div key={`summary-line-${item.id}`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    {item.name} {item.quantity > 1 ? <span className="text-slate-400">×{item.quantity}</span> : null}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                    {formatPeso(item.price * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={`rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center ${isCompact ? 'px-3 py-3' : 'px-4 py-5'}`}>
              <p className="text-xs font-semibold text-slate-600">Your service cart is empty</p>
              <p className="mt-1 text-[11px] text-slate-400">Choose a service to begin this transaction.</p>
            </div>
          )}

          {!isCompact ? (
            <div className="space-y-2.5 border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Subtotal</span>
                <span className="font-semibold tabular-nums text-slate-900">{formatPeso(subtotal)}</span>
              </div>

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-slate-600"><Tag size={13} /> Discount</span>
                {discount > 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums text-emerald-700">−{formatPeso(discount)}</span>
                    <button type="button" onClick={openDiscountEditor} className="text-[11px] font-bold text-blue-700 hover:text-blue-800">Edit</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={openDiscountEditor}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 hover:text-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  >
                    <Plus size={12} /> Add discount
                  </button>
                )}
              </div>
              {discount > 0 && discountConfig.reason ? (
                <p className="text-right text-[10px] text-slate-400">{discountConfig.reason}</p>
              ) : null}

              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 text-slate-600"><Landmark size={13} /> VAT / tax</span>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums text-slate-900">{formatPeso(vatAmount)}</span>
                  <button type="button" onClick={() => setVatOpen((open) => !open)} className="text-[11px] font-bold text-slate-500 hover:text-blue-700">
                    {vatOpen ? 'Done' : 'Adjust'}
                  </button>
                </div>
              </div>
              {vatOpen ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <label htmlFor="pos-vat-adjustment" className="mb-1.5 block text-[11px] font-semibold text-slate-700">VAT / tax amount</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">₱</span>
                    <input
                      id="pos-vat-adjustment"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={vatAmount || ''}
                      onChange={(event) => onVatChange(Math.max(0, Number(event.target.value) || 0))}
                      className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-right text-xs tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">Uses the existing billing tax calculation; no automatic tax rate is assumed.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className={`space-y-2 rounded-xl border border-slate-200 bg-slate-50 ${isCompact ? 'p-3' : 'p-4'}`}>
            {balanceCheckout ? (
              <>
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Original total</span>
                  <span className="font-semibold text-slate-800">{formatPeso(balanceCheckout.originalTotal ?? balanceCheckout.grandTotal)}</span>
                </div>
                {(balanceCheckout.discountTotal ?? 0) > 0 ? (
                  <div className="flex items-center justify-between text-xs text-emerald-700"><span>Discount</span><span>−{formatPeso(balanceCheckout.discountTotal ?? 0)}</span></div>
                ) : null}
                {(balanceCheckout.taxVatTotal ?? 0) > 0 ? (
                  <div className="flex items-center justify-between text-xs text-slate-600"><span>VAT / tax</span><span>+{formatPeso(balanceCheckout.taxVatTotal ?? 0)}</span></div>
                ) : null}
                {(balanceCheckout.additionalFeesTotal ?? 0) > 0 ? (
                  <div className="flex items-center justify-between text-xs text-slate-600"><span>Fees</span><span>+{formatPeso(balanceCheckout.additionalFeesTotal ?? 0)}</span></div>
                ) : null}
                {(balanceCheckout.amountPaid ?? balanceCheckout.reservationApplied) > 0 ? (
                  <div className="flex items-center justify-between text-xs text-emerald-700">
                    <span>Paid / downpayment applied</span>
                    <span>−{formatPeso(balanceCheckout.amountPaid ?? balanceCheckout.reservationApplied)}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-slate-500"><span>Discount</span><span>−{formatPeso(discount)}</span></div>
                <div className="flex items-center justify-between text-xs text-slate-500"><span>VAT / tax</span><span>{formatPeso(vatAmount)}</span></div>
              </>
            )}
            <div className="flex items-end justify-between gap-3 border-t border-slate-200 pt-2">
              <span className="text-sm font-bold text-slate-800">Total Due</span>
              <span className={`${isCompact ? 'text-xl' : 'text-2xl'} font-black tabular-nums tracking-tight text-blue-700`}>{formatPeso(payAmount)}</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700">Payment Method</p>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((method) => {
                const Icon = method.icon;
                const active = paymentMethod === method.value;
                return (
                  <button
                    key={method.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onPaymentMethodChange(method.value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                      active ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={16} className={active ? 'text-blue-700' : method.color} /> {method.label}
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethod === 'cash' ? (
            <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/45 p-3.5">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">Total due</span><span className="text-sm font-bold tabular-nums text-slate-900">{formatPeso(payAmount)}</span></div>
              <div>
                <label htmlFor="cash-received" className="mb-1.5 block text-xs font-semibold text-slate-700">Cash Received</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₱</span>
                  <input
                    id="cash-received"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={cashReceived}
                    onChange={(event) => onCashReceivedChange(event.target.value)}
                    placeholder="0.00"
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-right text-sm font-bold tabular-nums text-slate-950 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick cash amounts">
                  <button type="button" onClick={() => onCashReceivedChange(payAmount.toFixed(2))} className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50">Exact</button>
                  {quickCash.map((value) => (
                    <button key={value} type="button" onClick={() => onCashReceivedChange(value.toFixed(2))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:border-emerald-200 hover:text-emerald-700">
                      {formatPeso(value)}
                    </button>
                  ))}
                </div>
              </div>
              {receivedCash >= payAmount && payAmount > 0 ? (
                <div className="flex items-center justify-between border-t border-emerald-100 pt-2.5"><span className="text-xs font-bold text-emerald-800">Change</span><span className="text-lg font-black tabular-nums text-emerald-700">{formatPeso(cashChange)}</span></div>
              ) : cashReceived ? (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600" role="alert"><AlertCircle size={13} className="mt-0.5 shrink-0" /> Cash received is {formatPeso(cashShort)} short.</p>
              ) : validationAttempted ? (
                <p className="flex items-start gap-1.5 text-[11px] font-semibold text-red-600" role="alert"><AlertCircle size={13} className="mt-0.5 shrink-0" /> Enter the cash received.</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/45 p-3.5">
              <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-600">Amount due</span><span className="text-sm font-bold tabular-nums text-slate-900">{formatPeso(payAmount)}</span></div>
              <div>
                <label htmlFor="gcash-amount-received" className="mb-1.5 block text-xs font-semibold text-slate-700">Amount Received</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-500">₱</span>
                  <input
                    id="gcash-amount-received"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={gcashAmountReceived}
                    onChange={(event) => onGcashAmountReceivedChange(event.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-right text-sm font-bold tabular-nums text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                {gcashAmountReceived && gcashMismatch ? <p className="mt-1.5 text-[11px] font-semibold text-red-600" role="alert">Amount received must match {formatPeso(payAmount)}.</p> : null}
              </div>
              <div>
                <label htmlFor="gcash-reference" className="mb-1.5 block text-xs font-semibold text-slate-700">GCash Reference Number</label>
                <input
                  id="gcash-reference"
                  type="text"
                  autoComplete="off"
                  maxLength={64}
                  value={gcashReference}
                  onChange={(event) => onGcashReferenceChange(event.target.value)}
                  placeholder="Enter payment reference"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-950 placeholder:font-normal placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {validationAttempted && gcashReference.trim().length < 6 ? <p className="mt-1.5 text-[11px] font-semibold text-red-600" role="alert">Enter a valid GCash reference number.</p> : null}
              </div>
              <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500"><Check size={12} className="mt-0.5 shrink-0 text-blue-600" /> Verify the amount and reference against the customer’s GCash confirmation before completing.</p>
            </div>
          )}

          {!isCompact ? (
            <div>
              {!notesOpen ? (
                <button type="button" onClick={() => setNotesOpen(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700"><FileText size={13} /> Add transaction note</button>
              ) : (
                <div>
                  <div className="mb-1.5 flex items-center justify-between"><label htmlFor="transaction-notes" className="text-xs font-semibold text-slate-700">Transaction Note</label><button type="button" onClick={() => { setNotesOpen(false); onTransactionNotesChange?.(''); }} className="text-[11px] font-bold text-slate-400 hover:text-red-600">Remove</button></div>
                  <textarea id="transaction-notes" rows={2} placeholder="Special instructions or remarks…" value={transactionNotes} onChange={(event) => onTransactionNotesChange?.(event.target.value)} className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              )}
            </div>
          ) : null}

          {validationMessage ? (
            <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700" role="alert"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {validationMessage}</p>
          ) : null}
        </div>

        <div className={`shrink-0 border-t border-slate-100 ${isCompact ? 'px-3 py-3' : 'px-4 py-4'}`}>
          <button
            type="button"
            onClick={onProcessPayment}
            disabled={processing || paymentDisabled || cartItems.length === 0}
            className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3.5 text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
              processing || paymentDisabled || cartItems.length === 0
                ? 'cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-blue-700 text-white shadow-sm hover:bg-blue-800 active:scale-[0.99]'
            }`}
          >
            {processing ? <><Loader2 size={16} className="animate-spin" /> Processing payment…</> : <>{payLabel}<ChevronRight size={16} /></>}
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">Review and confirmation are required before submission.</p>
        </div>
      </section>

      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent
          aria-describedby={undefined}
          overlayClassName="bg-slate-950/55 backdrop-blur-sm"
          className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-sm gap-0 overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl sm:rounded-2xl [&>button]:right-4 [&>button]:top-4 [&>button]:rounded-lg [&>button]:p-1.5 [&>button]:text-slate-400 [&>button]:opacity-100 [&>button:hover]:bg-slate-100 [&>button:hover]:text-slate-700"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Transaction adjustment</p>
                <DialogTitle className="mt-0.5 text-base font-bold leading-normal text-slate-950">Add discount</DialogTitle>
              </div>
          </div>
          <div className="space-y-4 px-5 py-5">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold text-slate-700">Discount Type</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['percent', 'fixed'] as const).map((type) => (
                    <button key={type} type="button" onClick={() => { setDraftDiscountType(type); setDiscountError(''); }} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${draftDiscountType === type ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{type === 'percent' ? 'Percentage' : 'Fixed amount'}</button>
                  ))}
                </div>
              </fieldset>
              <div>
                <label htmlFor="discount-value" className="mb-1.5 block text-xs font-semibold text-slate-700">Discount Value</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{draftDiscountType === 'percent' ? '%' : '₱'}</span>
                  <input id="discount-value" autoFocus type="number" inputMode="decimal" min={0} max={draftDiscountType === 'percent' ? 100 : subtotal} step="0.01" value={draftDiscountValue} onChange={(event) => { setDraftDiscountValue(event.target.value); setDiscountError(''); }} className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-right text-sm font-bold text-slate-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              </div>
              <div>
                <label htmlFor="discount-reason" className="mb-1.5 block text-xs font-semibold text-slate-700">Reason <span className="font-normal text-slate-400">(optional)</span></label>
                <select id="discount-reason" value={draftDiscountReason} onChange={(event) => setDraftDiscountReason(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                  <option value="">Select a reason</option><option>Promo</option><option>Senior / PWD</option><option>Loyalty</option><option>Manager adjustment</option><option>Other</option>
                </select>
              </div>
              {discountError ? <p className="text-[11px] font-semibold text-red-600" role="alert">{discountError}</p> : null}
          </div>
          <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              {discount > 0 ? <button type="button" onClick={() => { onDiscountChange({ discountType: 'fixed', value: 0 }); setDiscountOpen(false); }} className="mr-auto rounded-xl px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50">Remove</button> : null}
              <button type="button" onClick={() => setDiscountOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={applyDiscount} className="rounded-xl bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800">Apply discount</button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
