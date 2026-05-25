import React from 'react';
import { Loader2, Banknote, Smartphone, Tag, ChevronRight, Landmark } from 'lucide-react';
import { CartItem, formatPeso } from '@/lib/salesData';

interface Props {
  cartItems: CartItem[];
  subtotal: number;
  discount: number;
  vatAmount: number;
  total: number;
  /** When collecting balance on a booked order (reservation already paid) */
  balanceCheckout?: {
    grandTotal: number;
    reservationApplied: number;
    balanceDue: number;
    discountTotal?: number;
    taxVatTotal?: number;
    additionalFeesTotal?: number;
  } | null;
  /** Tighter layout when embedded above billing (queue / balance due) */
  compact?: boolean;
  paymentMethod: string;
  processing: boolean;
  onDiscountChange: (v: number) => void;
  onVatChange: (v: number) => void;
  onPaymentMethodChange: (v: string) => void;
  onProcessPayment: () => void;
}

const PAYMENT_METHODS = [
  { id: 'pm-cash', value: 'cash', label: 'Cash', icon: Banknote, color: 'text-emerald-600' },
  { id: 'pm-gcash', value: 'gcash', label: 'GCash', icon: Smartphone, color: 'text-blue-500' },
];

export default function PaymentSummaryPanel({
  cartItems, subtotal, discount, vatAmount, total,
  balanceCheckout = null,
  compact = false,
  paymentMethod, processing,
  onDiscountChange, onVatChange, onPaymentMethodChange, onProcessPayment,
}: Props) {
  const payAmount = balanceCheckout?.balanceDue ?? total;
  const payLabel = balanceCheckout ? 'Collect balance' : 'Process Payment';
  const isCompact = compact || Boolean(balanceCheckout);

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden ${
        isCompact ? 'shrink-0' : 'h-full min-h-0 flex-1'
      }`}
    >
      <div className={`border-b border-slate-100 ${isCompact ? 'px-3 py-2.5' : 'px-4 py-4'}`}>
        <h3 className="text-sm font-semibold text-slate-900">Payment Summary</h3>
      </div>

      <div
        className={
          isCompact
            ? 'px-3 py-3 space-y-3'
            : 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5'
        }
      >
        {/* Line items */}
        {cartItems.length > 0 ? (
          <div className="space-y-2">
            {cartItems.map((item) => (
              <div key={`summary-line-${item.id}`} className="flex items-center justify-between text-xs">
                <span className="text-slate-600 flex-1 truncate pr-2">
                  {item.name} {item.quantity > 1 && <span className="text-slate-400">×{item.quantity}</span>}
                </span>
                <span className="font-semibold text-slate-900 shrink-0">
                  {formatPeso(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className={`text-center ${isCompact ? 'py-2' : 'py-6'}`}>
            <p className="text-xs text-slate-400">No services added yet</p>
          </div>
        )}

        {!isCompact && <hr className="border-slate-100" />}

        {/* Subtotal + Discount — walk-in only; balance edits live in Billing workspace */}
        {!isCompact && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Subtotal</span>
              <span className="font-semibold text-slate-900">{formatPeso(subtotal)}</span>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Tag size={13} className="text-amber-500" />
                <span className="text-sm text-slate-600">Discount</span>
              </div>
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">₱</span>
                <input
                  type="number"
                  min={0}
                  max={subtotal}
                  value={discount === 0 ? '' : discount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      onDiscountChange(0);
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isFinite(n)) onDiscountChange(Math.min(Math.max(0, n), subtotal));
                  }}
                  placeholder="0.00"
                  className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Landmark size={13} className="text-blue-500" />
                <span className="text-sm text-slate-600">VAT</span>
              </div>
              <div className="relative w-28">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">₱</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={vatAmount === 0 ? '' : vatAmount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      onVatChange(0);
                      return;
                    }
                    const n = Number(raw);
                    if (Number.isFinite(n)) onVatChange(Math.max(0, n));
                  }}
                  placeholder="0.00"
                  className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {/* Total */}
        <div
          className={`bg-slate-50 rounded-xl border border-slate-200 space-y-2 ${
            isCompact ? 'p-3' : 'p-4'
          }`}
        >
          {balanceCheckout ? (
            <>
              {(balanceCheckout.discountTotal ?? 0) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Discount</span>
                  <span className="font-semibold text-emerald-700">
                    −{formatPeso(balanceCheckout.discountTotal ?? 0)}
                  </span>
                </div>
              )}
              {(balanceCheckout.taxVatTotal ?? 0) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">VAT / tax</span>
                  <span className="font-semibold text-slate-800">
                    +{formatPeso(balanceCheckout.taxVatTotal ?? 0)}
                  </span>
                </div>
              )}
              {(balanceCheckout.additionalFeesTotal ?? 0) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Fees</span>
                  <span className="font-semibold text-slate-800">
                    +{formatPeso(balanceCheckout.additionalFeesTotal ?? 0)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Grand total</span>
                <span className="font-semibold text-slate-800">{formatPeso(balanceCheckout.grandTotal)}</span>
              </div>
              {balanceCheckout.reservationApplied > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Reservation paid (GCash)</span>
                  <span className="font-semibold text-emerald-700">
                    −{formatPeso(balanceCheckout.reservationApplied)}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-200">
                <span className="text-xs font-semibold text-slate-800">Balance due today</span>
                <span className={`font-bold text-amber-700 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
                  {formatPeso(balanceCheckout.balanceDue)}
                </span>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">Total Amount</span>
              <span className="text-2xl font-bold text-blue-700">{formatPeso(total)}</span>
            </div>
          )}
          {discount > 0 && (
            <p className="text-xs text-emerald-600 font-medium">
              You saved {formatPeso(discount)} on this transaction
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <p className={`text-xs font-semibold text-slate-700 ${isCompact ? 'mb-1.5' : 'mb-2.5'}`}>
            Payment Method
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENT_METHODS.map((pm) => {
              const Icon = pm.icon;
              const isActive = paymentMethod === pm.value;
              return (
                <button
                  key={pm.id}
                  onClick={() => onPaymentMethodChange(pm.value)}
                  className={`flex flex-col items-center gap-0.5 rounded-xl border text-center transition-all duration-150 ${
                    isCompact ? 'py-2 px-1' : 'py-2.5 px-1 gap-1'
                  } ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={isCompact ? 15 : 16} className={isActive ? 'text-blue-700' : pm.color} />
                  <span className={`text-[10px] font-semibold ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>
                    {pm.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {!isCompact && (
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">Transaction Notes (optional)</label>
            <textarea
              rows={2}
              placeholder="Special instructions, remarks…"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-none"
            />
          </div>
        )}
      </div>

      {/* Process Payment Button */}
      <div className={`border-t border-slate-100 shrink-0 ${isCompact ? 'px-3 py-3' : 'px-4 py-4'}`}>
        <button
          onClick={onProcessPayment}
          disabled={processing || cartItems.length === 0}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-sm transition-all duration-150 ${
            cartItems.length === 0
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-blue-700 hover:bg-blue-800 active:scale-[0.99] text-white shadow-sm'
          }`}
        >
          {processing ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Processing Payment…
            </>
          ) : (
            <>
              {payLabel} — {formatPeso(payAmount)}
              <ChevronRight size={16} />
            </>
          )}
        </button>
        {isCompact ? (
          <p className="text-[10px] text-slate-500 text-center mt-2 leading-relaxed">
            Edit discount &amp; VAT in Billing workspace below. Invoice generates on collect.
          </p>
        ) : (
          <p className="text-[10px] text-slate-400 text-center mt-2">
            A digital receipt will be generated automatically
          </p>
        )}
      </div>
    </div>
  );
}
