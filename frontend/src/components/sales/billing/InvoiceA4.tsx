import React, { useMemo } from 'react';
import { COMPANY_BRANDING, companyContactLine } from '@/lib/company-branding';
import { formatPeso } from '@/lib/salesData';

export type InvoiceA4Snapshot = {
  invoiceNumber?: string;
  issuedAt?: string;
  orderNumber?: string;
  bookingReference?: string;
  customerName?: string;
  customerPhone?: string;
  vehicle?: { year?: string; make?: string; model?: string; plate?: string };
  lineItems?: Array<{
    name: string;
    quantity?: number;
    unitPrice: number;
    lineTotal?: number;
    billingGroup?: string;
  }>;
  discount?: { discountType?: string; value?: number; reason?: string };
  taxVatAmount?: number;
  additionalFees?: number;
  downpayment?: number;
  computed?: {
    subtotal: number;
    discountTotal: number;
    taxVatTotal: number;
    additionalFeesTotal: number;
    grandTotal: number;
    balanceDue: number;
  };
  paymentStatus?: string;
};

/**
 * A4 invoice preview + print. Use with @media print in parent or this component.
 */
export default function InvoiceA4({
  snapshot,
  title = 'Invoice',
  /** Narrow sidebar / POS panel — no full A4 min-height, readable totals */
  embedded = false,
}: {
  snapshot: InvoiceA4Snapshot | null;
  title?: string;
  embedded?: boolean;
}) {
  const lines = snapshot?.lineItems || [];
  const c = snapshot?.computed;
  const v = snapshot?.vehicle || {};

  const printCss = useMemo(
    () => `
    @media print {
      @page { size: A4; margin: 14mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-a4-root { box-shadow: none !important; border: none !important; }
      .no-print { display: none !important; }
    }
  `,
    []
  );

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
        No invoice snapshot loaded.
      </div>
    );
  }

  const totalsLabelClass = embedded
    ? 'text-slate-600 shrink-0 whitespace-nowrap text-left'
    : 'text-slate-600 shrink-0 whitespace-nowrap text-left';

  return (
    <div
      className={`invoice-a4-root bg-white text-slate-900 rounded-xl border border-slate-200 shadow-sm ${
        embedded ? 'overflow-visible' : 'overflow-hidden'
      }`}
    >
      <style dangerouslySetInnerHTML={{ __html: printCss }} />
      <div
        className={`max-w-[210mm] mx-auto w-full ${embedded ? 'p-4' : 'p-8'}`}
        style={embedded ? { boxSizing: 'border-box' } : { minHeight: '297mm', boxSizing: 'border-box' }}
      >
        <div className="flex justify-between items-start gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-blue-800">{COMPANY_BRANDING.brandName}</h1>
            <p className="text-xs text-slate-600 mt-1">{COMPANY_BRANDING.tagline}</p>
            <p className="text-xs text-slate-500 mt-0.5">{COMPANY_BRANDING.address}</p>
            <p className="text-xs text-slate-500">{companyContactLine()}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{COMPANY_BRANDING.facebook}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">{title}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-mono font-bold text-slate-800">{snapshot.invoiceNumber}</p>
            <p className="text-xs text-slate-500 mt-1">
              {snapshot.issuedAt ? new Date(snapshot.issuedAt).toLocaleString() : ''}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mt-6 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bill to</p>
            <p className="font-semibold">{snapshot.customerName || '—'}</p>
            {snapshot.customerPhone && <p className="text-slate-600">{snapshot.customerPhone}</p>}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order</p>
            <p className="font-semibold">{snapshot.orderNumber || '—'}</p>
            {snapshot.bookingReference && (
              <p className="text-slate-600 text-xs">Ref: {snapshot.bookingReference}</p>
            )}
          </div>
        </div>

        <div className="mt-6 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vehicle</p>
          <p>
            {[v.year, v.make, v.model].filter(Boolean).join(' ') || '—'}
            {v.plate ? ` · ${v.plate}` : ''}
          </p>
        </div>

        <table className="w-full mt-8 text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-300 text-left text-slate-500">
              <th className="py-2 pr-2">Description</th>
              <th className="py-2 text-right w-12">Qty</th>
              <th className="py-2 text-right w-24">Unit</th>
              <th className="py-2 text-right w-28">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((li, i) => (
              <tr key={`${i}-${li.name}`} className="border-b border-slate-100">
                <td className="py-2 pr-2">{li.name}</td>
                <td className="py-2 text-right">{li.quantity ?? 1}</td>
                <td className="py-2 text-right">{formatPeso(li.unitPrice)}</td>
                <td className="py-2 text-right font-medium">
                  {formatPeso(li.lineTotal ?? li.unitPrice * (li.quantity ?? 1))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          className={`mt-6 space-y-1.5 text-sm w-full ${embedded ? '' : 'ml-auto max-w-[18rem]'}`}
        >
          <div className="flex justify-between gap-3 items-center min-w-0">
            <span className={totalsLabelClass}>Subtotal</span>
            <span className="tabular-nums shrink-0 text-right whitespace-nowrap">{formatPeso(c?.subtotal ?? 0)}</span>
          </div>
          {(c?.discountTotal ?? 0) > 0 && (
            <div className="flex justify-between gap-3 items-center min-w-0">
              <span className={totalsLabelClass}>Discount</span>
              <span className="tabular-nums shrink-0 text-right whitespace-nowrap">−{formatPeso(c?.discountTotal ?? 0)}</span>
            </div>
          )}
          {(c?.taxVatTotal ?? 0) !== 0 && (
            <div className="flex justify-between gap-3 items-center min-w-0">
              <span className={totalsLabelClass}>VAT / tax</span>
              <span className="tabular-nums shrink-0 text-right whitespace-nowrap">{formatPeso(c?.taxVatTotal ?? 0)}</span>
            </div>
          )}
          {(c?.additionalFeesTotal ?? 0) !== 0 && (
            <div className="flex justify-between gap-3 items-center min-w-0">
              <span className={totalsLabelClass}>Fees</span>
              <span className="tabular-nums shrink-0 text-right whitespace-nowrap">{formatPeso(c?.additionalFeesTotal ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 items-center min-w-0 font-bold border-t border-slate-200 pt-2">
            <span className={totalsLabelClass}>Service total</span>
            <span className="tabular-nums shrink-0 text-right whitespace-nowrap">{formatPeso(c?.grandTotal ?? 0)}</span>
          </div>
          {(snapshot.downpayment ?? 0) > 0 && (
            <div className="flex justify-between gap-3 items-start text-amber-800 font-semibold min-w-0">
              <span className={`${totalsLabelClass} leading-snug max-w-[55%]`}>
                Less reservation / downpayment (paid earlier)
              </span>
              <span className="tabular-nums shrink-0 text-right whitespace-nowrap">−{formatPeso(snapshot.downpayment ?? 0)}</span>
            </div>
          )}
          <div className="flex justify-between gap-3 items-center min-w-0 text-amber-900 font-bold">
            <span className={totalsLabelClass}>Balance due</span>
            <span className="tabular-nums shrink-0 text-right whitespace-nowrap">{formatPeso(c?.balanceDue ?? 0)}</span>
          </div>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-8 text-xs">
          <div>
            <p className="font-bold text-slate-700 mb-16">Client signature</p>
            <div className="border-t border-slate-400 pt-1">Name & date</div>
          </div>
          <div>
            <p className="font-bold text-slate-700 mb-16">Sales signature</p>
            <div className="border-t border-slate-400 pt-1">Name & date</div>
          </div>
        </div>

        <p className="mt-8 text-[10px] text-slate-400 text-center no-print">
          Payment status: {snapshot.paymentStatus || '—'}
        </p>
      </div>

      <div className="no-print flex justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50">
        <button
          type="button"
          className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
          onClick={() => window.print()}
        >
          Print
        </button>
      </div>
    </div>
  );
}
