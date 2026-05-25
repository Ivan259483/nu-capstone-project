import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Save, Banknote, Smartphone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BillingService,
  type BillingDoc,
  type BillingDiscount,
  type BillingLineItem,
} from '@/lib/billing-service';
import { formatPeso } from '@/lib/salesData';
import { computeBillingTotals, type BillingComputed } from '@/lib/billingTotals';
import type { InvoiceA4Snapshot } from '@/components/sales/billing/InvoiceA4';

export type BillingChargesPayload = {
  discount: BillingDiscount;
  taxVatAmount: number;
  additionalFees: number;
  downpayment: number;
  computed?: BillingComputed;
};

type MoneyField = number | '';

function parseMoneyInput(raw: string): MoneyField {
  const t = raw.trim();
  if (t === '') return '';
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return '';
  return n;
}

function moneyFieldStr(v: MoneyField): string {
  return v === '' ? '' : String(v);
}

function moneyFieldNum(v: MoneyField): number {
  return v === '' ? 0 : v;
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Draft' },
    updated: { bg: 'bg-amber-50', text: 'text-amber-800', label: 'Updated' },
    checked_out: { bg: 'bg-emerald-50', text: 'text-emerald-800', label: 'Checked out' },
  };
  const s = map[status] || map.pending;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
  );
}

export default function BillingWorkspace({
  orderId,
  syncNonce = 0,
  onCheckoutSuccess,
  onChargesChange,
  compact = false,
  /** When true (e.g. embedded in POS), checkout is handled by Payment Summary above */
  hideCheckout = false,
  /** Debounced auto-save when discount/VAT/fees change (POS embed) */
  autoSaveCharges = false,
}: {
  orderId: string | null;
  syncNonce?: number;
  onCheckoutSuccess?: (payload: {
    invoiceNumber: string;
    pdfUrl: string;
    snapshot?: InvoiceA4Snapshot;
  }) => void;
  onChargesChange?: (payload: BillingChargesPayload) => void;
  compact?: boolean;
  hideCheckout?: boolean;
  autoSaveCharges?: boolean;
}) {
  const [billing, setBilling] = useState<BillingDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const [taxVat, setTaxVat] = useState<MoneyField>(0);
  const [fees, setFees] = useState<MoneyField>(0);
  const [downpayment, setDownpayment] = useState<MoneyField>(0);
  const [discType, setDiscType] = useState<'fixed' | 'percent'>('fixed');
  const [discVal, setDiscVal] = useState<MoneyField>(0);
  const [discReason, setDiscReason] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'gcash'>('cash');
  const [cashReceived, setCashReceived] = useState<number | ''>('');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const buildChargesPayload = useCallback(
    (computed?: BillingComputed): BillingChargesPayload => ({
      discount: { discountType: discType, value: moneyFieldNum(discVal), reason: discReason },
      taxVatAmount: moneyFieldNum(taxVat),
      additionalFees: moneyFieldNum(fees),
      downpayment: moneyFieldNum(downpayment),
      computed,
    }),
    [discType, discVal, discReason, taxVat, fees, downpayment]
  );

  const load = useCallback(async () => {
    if (!orderId) {
      setBilling(null);
      return;
    }
    setLoading(true);
    const res = await BillingService.getBilling(orderId);
    setLoading(false);
    if (res.success && 'data' in res && res.data) {
      const b = res.data;
      setBilling(b);
      setTaxVat(b.taxVatAmount ?? 0);
      setFees(b.additionalFees ?? 0);
      setDownpayment(b.downpayment ?? 0);
      setDiscType(b.discount?.discountType === 'percent' ? 'percent' : 'fixed');
      setDiscVal(b.discount?.value ?? 0);
      setDiscReason(b.discount?.reason ?? '');
    } else {
      toast.error((res as { message?: string }).message || 'Failed to load billing');
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load, syncNonce]);

  const comp = useMemo(() => {
    if (!billing?.lineItems?.length) return billing?.computed ?? undefined;
    return computeBillingTotals({
      lineItems: billing.lineItems.map((li) => ({
        unitPrice: li.unitPrice,
        quantity: li.quantity,
      })),
      discount: { discountType: discType, value: moneyFieldNum(discVal), reason: discReason },
      taxVatAmount: moneyFieldNum(taxVat),
      additionalFees: moneyFieldNum(fees),
      downpayment: moneyFieldNum(downpayment),
    });
  }, [billing, discType, discVal, discReason, taxVat, fees, downpayment]);

  const chargeFieldEditing =
    taxVat === '' || fees === '' || downpayment === '' || discVal === '';

  const readOnly = billing?.status === 'checked_out' || !orderId;

  useEffect(() => {
    if (!onChargesChange) return;
    onChargesChange(buildChargesPayload(comp));
  }, [onChargesChange, buildChargesPayload, comp]);

  const persistCharges = async (
    nextLines?: BillingLineItem[],
    options?: { silent?: boolean }
  ) => {
    if (!orderId || readOnly) return false;
    if (autoSaveCharges) setAutoSaveStatus('saving');
    else setSaving(true);
    const payload: Parameters<typeof BillingService.putBilling>[1] = {
      discount: { discountType: discType, value: moneyFieldNum(discVal), reason: discReason },
      taxVatAmount: moneyFieldNum(taxVat),
      additionalFees: moneyFieldNum(fees),
      downpayment: moneyFieldNum(downpayment),
    };
    if (nextLines !== undefined) {
      payload.lineItems = nextLines;
    } else if (!autoSaveCharges && billing?.lineItems?.length) {
      payload.lineItems = billing.lineItems as BillingLineItem[];
    }

    const res = await BillingService.putBilling(orderId, payload);
    if (autoSaveCharges) setAutoSaveStatus('saved');
    else setSaving(false);
    if (res.success && 'data' in res && res.data) {
      setBilling(res.data);
      const serverComp = res.data.computed;
      onChargesChange?.(buildChargesPayload(serverComp));
      if (!options?.silent) toast.success('Billing saved');
      return true;
    }
    if (autoSaveCharges) {
      setAutoSaveStatus('idle');
      toast.error((res as { message?: string }).message || 'Could not save billing charges');
    } else {
      toast.error((res as { message?: string }).message || 'Save failed');
    }
    return false;
  };

  useEffect(() => {
    if (
      !autoSaveCharges ||
      !orderId ||
      readOnly ||
      !billing?.lineItems?.length ||
      chargeFieldEditing
    ) {
      return undefined;
    }
    const t = window.setTimeout(() => {
      void persistCharges(undefined, { silent: true });
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    autoSaveCharges,
    orderId,
    readOnly,
    chargeFieldEditing,
    taxVat,
    fees,
    downpayment,
    discType,
    discVal,
    discReason,
    billing?.lineItems?.length,
  ]);

  const removeLine = async (idx: number) => {
    if (!billing?.lineItems || readOnly) return;
    const next = billing.lineItems.filter((_, i) => i !== idx).map((li) => ({
      serviceId: li.serviceId,
      name: li.name,
      billingGroup: li.billingGroup,
      unitPrice: li.unitPrice,
      quantity: li.quantity,
      vehicleTier: li.vehicleTier,
    }));
    await persistCharges(next);
  };

  const handleCheckout = async () => {
    if (!orderId || !billing || readOnly) return;
    const due = comp?.balanceDue ?? 0;
    if (paymentMethod === 'cash' && due > 0) {
      const recv = cashReceived === '' ? 0 : Number(cashReceived);
      if (!Number.isFinite(recv) || recv < due) {
        toast.error(`Cash received must be at least ${formatPeso(due)}`);
        return;
      }
    }
    const saveFirst = await BillingService.putBilling(orderId, {
      lineItems: (billing.lineItems as BillingLineItem[]) ?? [],
      discount: { discountType: discType, value: moneyFieldNum(discVal), reason: discReason },
      taxVatAmount: moneyFieldNum(taxVat),
      additionalFees: moneyFieldNum(fees),
      downpayment: moneyFieldNum(downpayment),
    });
    if (!saveFirst.success || !('data' in saveFirst) || !saveFirst.data) {
      toast.error((saveFirst as { message?: string }).message || 'Save billing before checkout failed');
      return;
    }
    setBilling(saveFirst.data);

    setCheckoutLoading(true);
    const res = await BillingService.checkout(orderId, {
      paymentMethod,
      cashReceived: paymentMethod === 'cash' ? Number(cashReceived === '' ? due : cashReceived) : undefined,
    });
    setCheckoutLoading(false);
    if (res.success && res.data) {
      toast.success(`Invoiced: ${res.data.invoiceNumber}`);
      onCheckoutSuccess?.({
        invoiceNumber: res.data.invoiceNumber,
        pdfUrl: res.data.pdfUrl,
        snapshot: res.data.snapshot,
      });
      await load();
    } else {
      toast.error(res.message || 'Checkout failed');
    }
  };

  if (!orderId) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-8 text-center text-sm text-slate-500">
        Select an order to edit billing.
      </div>
    );
  }

  if (loading && !billing) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading billing…
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full ${
        compact ? 'min-h-0' : 'min-h-[320px]'
      }`}
    >
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Billing workspace</h3>
          {billing && statusBadge(billing.status)}
          {autoSaveCharges && autoSaveStatus === 'saving' && (
            <span className="text-[10px] font-semibold text-amber-700">Saving…</span>
          )}
          {autoSaveCharges && autoSaveStatus === 'saved' && (
            <span className="text-[10px] font-semibold text-emerald-700">Saved</span>
          )}
        </div>
        <button
          type="button"
          disabled={readOnly || saving}
          onClick={() => persistCharges()}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save charges
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto ${compact ? 'p-3 space-y-3' : 'p-4 space-y-4'}`}>
        <div className="rounded-lg border border-slate-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500 font-semibold">
              <tr>
                <th className="text-left px-3 py-2">Service</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-right px-3 py-2">Unit</th>
                <th className="text-right px-3 py-2">Line</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {(billing?.lineItems || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    No lines yet — add services from the catalog.
                  </td>
                </tr>
              ) : (
                (billing?.lineItems || []).map((li, idx) => (
                  <tr key={li._id || `${idx}-${li.name}`} className="border-t border-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{li.name}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{li.quantity}</td>
                    <td className="px-3 py-2 text-right">{formatPeso(li.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatPeso(li.unitPrice * (li.quantity || 1))}
                    </td>
                    <td className="px-1 py-1">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => removeLine(idx)}
                        className="p-1.5 rounded-md text-red-500 hover:bg-red-50 disabled:opacity-30"
                        aria-label="Remove line"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[11px] font-semibold text-slate-600">
            VAT / tax (amount)
            <input
              type="text"
              inputMode="decimal"
              disabled={readOnly}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={moneyFieldStr(taxVat)}
              onChange={(e) => setTaxVat(parseMoneyInput(e.target.value))}
            />
          </label>
          <label className="block text-[11px] font-semibold text-slate-600">
            Additional fees
            <input
              type="text"
              inputMode="decimal"
              disabled={readOnly}
              placeholder="0"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={moneyFieldStr(fees)}
              onChange={(e) => setFees(parseMoneyInput(e.target.value))}
            />
          </label>
          <label className="block text-[11px] font-semibold text-slate-600">
            Downpayment (reservation / GCash already collected)
            <input
              type="text"
              inputMode="decimal"
              disabled={readOnly}
              placeholder="500"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              value={moneyFieldStr(downpayment)}
              onChange={(e) => setDownpayment(parseMoneyInput(e.target.value))}
            />
          </label>
          <div className="block text-[11px] font-semibold text-slate-600">
            Discount
            <div className="mt-1 flex gap-2">
              <select
                disabled={readOnly}
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm shrink-0"
                value={discType}
                onChange={(e) => setDiscType(e.target.value as 'fixed' | 'percent')}
              >
                <option value="fixed">Fixed ₱</option>
                <option value="percent">Percent %</option>
              </select>
              <input
                type="text"
                inputMode="decimal"
                disabled={readOnly}
                placeholder="0"
                className="flex-1 min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                value={moneyFieldStr(discVal)}
                onChange={(e) => setDiscVal(parseMoneyInput(e.target.value))}
              />
            </div>
            <input
              type="text"
              disabled={readOnly}
              placeholder="Reason (optional)"
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
              value={discReason}
              onChange={(e) => setDiscReason(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-semibold">{formatPeso(comp?.subtotal ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Discount</span>
            <span className="font-semibold">−{formatPeso(comp?.discountTotal ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">VAT / tax</span>
            <span className="font-semibold">{formatPeso(comp?.taxVatTotal ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Fees</span>
            <span className="font-semibold">{formatPeso(comp?.additionalFeesTotal ?? 0)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-slate-200">
            <span className="font-bold text-slate-800">Grand total</span>
            <span className="font-bold text-blue-700">{formatPeso(comp?.grandTotal ?? 0)}</span>
          </div>
          <div className="flex justify-between text-amber-800 font-semibold">
            <span>Balance due (this payment)</span>
            <span>{formatPeso(comp?.balanceDue ?? 0)}</span>
          </div>
        </div>

        {!readOnly && !hideCheckout && (
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-700">Checkout</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'cash', label: 'Cash', icon: Banknote },
                  { id: 'gcash', label: 'GCash', icon: Smartphone },
                ] as const
              ).map((pm) => {
                const Icon = pm.icon;
                const active = paymentMethod === pm.id;
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold ${
                      active ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {pm.label}
                  </button>
                );
              })}
            </div>
            {paymentMethod === 'cash' && (comp?.balanceDue ?? 0) > 0 && (
              <label className="block text-[11px] font-semibold text-slate-600">
                Cash received
                <input
                  type="number"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  value={cashReceived}
                  placeholder={String(comp?.balanceDue ?? 0)}
                  onChange={(e) => setCashReceived(e.target.value === '' ? '' : Number(e.target.value))}
                />
              </label>
            )}
            <button
              type="button"
              disabled={checkoutLoading || !billing?.lineItems?.length}
              onClick={handleCheckout}
              className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-bold disabled:opacity-40"
            >
              {checkoutLoading ? 'Processing…' : 'Confirm checkout & invoice'}
            </button>
          </div>
        )}
        {!readOnly && hideCheckout && (
          <p className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 leading-relaxed">
            Edit discount and VAT here — totals update in Payment Summary above. Charges save automatically.
          </p>
        )}
      </div>
    </div>
  );
}
