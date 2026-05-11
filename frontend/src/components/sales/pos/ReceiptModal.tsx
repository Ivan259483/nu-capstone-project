import React, { useRef } from 'react';
import { X, Printer, Download, RotateCcw, CheckCircle2, Car, Phone, Mail } from 'lucide-react';
import { Customer, Vehicle, CartItem, formatPeso, getPaymentMethodLabel, PaymentMethod } from '@/lib/salesData';
import AppLogo from '@/components/sales/ui/AppLogo';

interface Props {
  txnId: string;
  customer: Customer;
  vehicle: Vehicle;
  cartItems: CartItem[];
  subtotal: number;
  discount: number;
  /** Manual VAT in peso (same as POS payment summary). */
  vatAmount: number;
  total: number;
  paymentMethod: string;
  onClose: () => void;
  onNewTransaction: () => void;
}

export default function ReceiptModal({
  txnId, customer, vehicle, cartItems,
  subtotal, discount, vatAmount, total, paymentMethod,
  onClose, onNewTransaction,
}: Props) {
  const receiptRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const handlePrint = () => {
    if (!receiptRef.current) return;
    const printContents = receiptRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=400,height=700');
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt ${txnId}</title>
      <style>
        body { font-family: sans-serif; padding: 20px; font-size: 12px; color: #0f172a; }
        .flex { display: flex; } .justify-between { justify-content: space-between; }
        .font-bold { font-weight: 700; } .text-center { text-align: center; }
        .py-4 { padding: 16px 0; } .border-b { border-bottom: 1px dashed #e2e8f0; }
        .text-blue-700 { color: #1d4ed8; } .text-emerald-600 { color: #059669; }
        .text-slate-500 { color: #64748b; } .text-slate-400 { color: #94a3b8; }
        .text-slate-900 { color: #0f172a; } .mt-1 { margin-top: 4px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 0; }
        .text-right { text-align: right; }
      </style></head>
      <body>${printContents}</body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4 animate-slide-up max-h-[90vh] flex flex-col">

        {/* Success Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-t-2xl px-6 py-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                <CheckCircle2 size={22} className="text-white" />
              </div>
              <div>
                <p className="font-bold text-lg">Payment Successful!</p>
                <p className="text-emerald-100 text-xs">{txnId}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors duration-150"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Receipt Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div ref={receiptRef} className="px-6 py-5">

            {/* Shop Header */}
            <div className="flex items-center gap-3 pb-5 border-b border-dashed border-slate-200">
              <AppLogo size={36} />
              <div>
                <p className="font-bold text-slate-900 text-base">AutoSPF<span className="text-blue-700">+</span></p>
                <p className="text-[11px] text-slate-500">Automotive Detailing &amp; Protection Center</p>
                <p className="text-[10px] text-slate-400">Unit 12, Autozone Bldg., Quezon Ave., Quezon City</p>
              </div>
            </div>

            {/* Transaction Info */}
            <div className="py-4 border-b border-dashed border-slate-200">
              <div className="grid grid-cols-2 gap-y-1.5">
                {[
                  { key: 'ri-date', label: 'Date', value: dateStr },
                  { key: 'ri-time', label: 'Time', value: timeStr },
                  { key: 'ri-txn', label: 'Transaction #', value: txnId },
                  { key: 'ri-staff', label: 'Served by', value: 'Sales Staff' },
                ].map((row) => (
                  <React.Fragment key={row.key}>
                    <span className="text-[11px] text-slate-500">{row.label}</span>
                    <span className="text-[11px] font-semibold text-slate-900 text-right">{row.value}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Customer Info */}
            <div className="py-4 border-b border-dashed border-slate-200">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Customer</p>
              <p className="text-sm font-bold text-slate-900">{customer.name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Phone size={10} className="text-slate-400" />
                <span className="text-xs text-slate-600">{customer.phone}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Mail size={10} className="text-slate-400" />
                <span className="text-xs text-slate-600">{customer.email}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                <Car size={10} className="text-slate-400" />
                <span className="text-xs text-slate-600">
                  {vehicle.plate} — {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.color})
                </span>
              </div>
            </div>

            {/* Services */}
            <div className="py-4 border-b border-dashed border-slate-200">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Services Rendered</p>
              <div className="space-y-2">
                {cartItems.map((item) => (
                  <div key={`receipt-line-${item.id}`} className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-900">{item.name}</p>
                      {item.quantity > 1 && (
                        <p className="text-[10px] text-slate-500">
                          {formatPeso(item.price)} × {item.quantity}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-900 font-tabular shrink-0">
                      {formatPeso(item.price * item.quantity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="py-4 border-b border-dashed border-slate-200 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Subtotal</span>
                <span className="font-tabular">{formatPeso(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-xs text-emerald-600">
                  <span>Discount</span>
                  <span className="font-tabular">−{formatPeso(discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-600">
                <span>VAT</span>
                <span className="font-tabular">{formatPeso(vatAmount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-slate-900 pt-1 border-t border-slate-200">
                <span>Total Paid</span>
                <span className="font-tabular text-blue-700">{formatPeso(total)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Payment Method</span>
                <span className="font-semibold">{getPaymentMethodLabel(paymentMethod as PaymentMethod)}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 text-center">
              <p className="text-[11px] text-slate-500">Thank you for choosing AutoSPF+!</p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                For concerns, call us at (02) 8888-AUTOSPF or email care@autospf.ph
              </p>
              <div className="mt-3 flex items-center justify-center gap-1">
                <div className="w-16 h-0.5 bg-slate-200 rounded-full" />
                <p className="text-[9px] text-slate-400 px-2 uppercase tracking-wider">Official Receipt</p>
                <div className="w-16 h-0.5 bg-slate-200 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button
            onClick={onNewTransaction}
            className="flex-1 flex items-center justify-center gap-2 btn-secondary"
          >
            <RotateCcw size={14} />
            New Transaction
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 btn-primary px-4"
          >
            <Printer size={14} />
            Print
          </button>
          <button className="flex items-center justify-center gap-2 btn-secondary px-4">
            <Download size={14} />
            PDF
          </button>
        </div>
      </div>
    </div>
  );
}
