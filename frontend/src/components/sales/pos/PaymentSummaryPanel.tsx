import React from 'react';
import { Loader2, Banknote, Smartphone, Tag, ChevronRight, Landmark } from 'lucide-react';
import { CartItem, formatPeso } from '@/lib/salesData';

interface Props {
  cartItems: CartItem[];
  subtotal: number;
  discount: number;
  vatAmount: number;
  total: number;
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
  paymentMethod, processing,
  onDiscountChange, onVatChange, onPaymentMethodChange, onProcessPayment,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="px-4 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-900">Payment Summary</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-5">
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
          <div className="py-6 text-center">
            <p className="text-xs text-slate-400">No services added yet</p>
          </div>
        )}

        <hr className="border-slate-100" />

        {/* Subtotal + Discount */}
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
                value={discount || ''}
                onChange={(e) => onDiscountChange(Math.min(Number(e.target.value), subtotal))}
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
                value={vatAmount || ''}
                onChange={(e) => onVatChange(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0.00"
                className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Total Amount</span>
            <span className="text-2xl font-bold text-blue-700">{formatPeso(total)}</span>
          </div>
          {discount > 0 && (
            <p className="text-xs text-emerald-600 mt-1 font-medium">
              You saved {formatPeso(discount)} on this transaction
            </p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2.5">Payment Method</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENT_METHODS.map((pm) => {
              const Icon = pm.icon;
              const isActive = paymentMethod === pm.value;
              return (
                <button
                  key={pm.id}
                  onClick={() => onPaymentMethodChange(pm.value)}
                  className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border text-center transition-all duration-150 ${
                    isActive
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={16} className={isActive ? 'text-blue-700' : pm.color} />
                  <span className={`text-[10px] font-semibold ${isActive ? 'text-blue-700' : 'text-slate-600'}`}>
                    {pm.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-slate-700 block mb-1.5">Transaction Notes (optional)</label>
          <textarea
            rows={2}
            placeholder="Special instructions, remarks…"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all resize-none"
          />
        </div>
      </div>

      {/* Process Payment Button */}
      <div className="px-4 py-4 border-t border-slate-100">
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
              Process Payment — {formatPeso(total)}
              <ChevronRight size={16} />
            </>
          )}
        </button>
        <p className="text-[10px] text-slate-400 text-center mt-2">
          A digital receipt will be generated automatically
        </p>
      </div>
    </div>
  );
}
