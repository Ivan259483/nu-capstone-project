import React, { useState } from 'react';
import { X, Printer, Download, CheckCircle2, Clock, XCircle, Car, Phone, Image as ImageIcon } from 'lucide-react';
import { Transaction, formatPeso, getPaymentMethodLabel, PaymentMethod } from '@/lib/salesData';
import AppLogo from '@/components/sales/ui/AppLogo';
import { COMPANY_BRANDING, companyContactLine } from '@/lib/company-branding';
import {
  downloadDetailedReceiptPdf,
  printDetailedReceipt,
  receiptFromTransaction,
} from '@/lib/receipt-document';
import { resolveReceiptPhone } from '@/lib/receipt-phone';

interface Props {
  txn: Transaction;
  onClose: () => void;
}

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle2,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    label: 'Payment Completed',
  },
  pending: {
    icon: Clock,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    label: 'Payment Pending',
  },
  processing: {
    icon: Clock,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    label: 'Processing Payment',
  },
  voided: {
    icon: XCircle,
    color: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    label: 'Transaction Voided',
  },
};

export default function TransactionReceiptModal({ txn, onClose }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const statusCfg = STATUS_CONFIG[txn.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG['pending'];
  const StatusIcon = statusCfg.icon;
  const receipt = receiptFromTransaction(txn);
  const customerPhone = resolveReceiptPhone(txn);

  const handleConfirmPayment = () => {
    // integration logic goes here (e.g., update txn status to 'completed')
    console.info('Payment confirmed for txn:', txn.id);
    setShowConfirm(false);
    onClose();
  };

  const dateObj = new Date(txn.dateTime);
  const dateStr = dateObj.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = dateObj.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });

  const handlePrint = () => printDetailedReceipt(receipt);
  const handleDownloadPdf = () => downloadDetailedReceiptPdf(receipt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4 animate-slide-up max-h-[92vh] flex flex-col">

        {/* Status Header */}
        <div className={`${statusCfg.bg} ${statusCfg.border} border-b rounded-t-2xl px-6 py-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${statusCfg.bg} border ${statusCfg.border} flex items-center justify-center`}>
                <StatusIcon size={20} className={statusCfg.color} />
              </div>
              <div>
                <p className={`font-bold text-base ${statusCfg.color}`}>{statusCfg.label}</p>
                <p className="text-slate-500 text-xs font-mono">{txn.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/60 transition-colors duration-150 text-slate-500 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Receipt Scroll Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="px-6 py-5">

            {/* Shop Info */}
            <div className="flex items-center gap-3 pb-5 border-b border-dashed border-slate-200">
              <AppLogo size={36} />
              <div>
                <p className="font-bold text-slate-900 text-base text-blue-800">{COMPANY_BRANDING.brandName}</p>
                <p className="text-[11px] text-slate-500">{COMPANY_BRANDING.tagline}</p>
                <p className="text-[10px] text-slate-400">{COMPANY_BRANDING.address}</p>
                <p className="text-[10px] text-slate-400">{companyContactLine()}</p>
              </div>
            </div>

            {/* Transaction Metadata */}
            <div className="py-4 border-b border-dashed border-slate-200">
              <div className="grid grid-cols-2 gap-y-2">
                {[
                  { key: 'rm-txn', label: 'Transaction #', value: txn.id },
                  { key: 'rm-date', label: 'Date', value: dateStr },
                  { key: 'rm-time', label: 'Time', value: timeStr },
                  { key: 'rm-staff', label: 'Served by', value: txn.staffName },
                ].map((row) => (
                  <React.Fragment key={row.key}>
                    <span className="text-[11px] text-slate-500">{row.label}</span>
                    <span className="text-[11px] font-semibold text-slate-900 text-right truncate">{row.value}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Customer & Vehicle */}
            <div className="py-4 border-b border-dashed border-slate-200">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Customer & Vehicle</p>
              <p className="text-sm font-bold text-slate-900 mb-1">{txn.customerName}</p>
              <div className="space-y-1">
                {customerPhone && (
                  <div className="flex items-center gap-1.5">
                    <Phone size={10} className="text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">{customerPhone}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Car size={10} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-600">
                    <span className="font-bold font-mono">{txn.vehiclePlate}</span> — {txn.vehicleInfo}
                  </span>
                </div>
                {(txn.vehicleColor || txn.vehicleClass) && (
                  <div className="flex items-center gap-1.5 pl-4">
                    <span className="text-xs text-slate-500">
                      {[
                        txn.vehicleColor ? `Color: ${txn.vehicleColor}` : '',
                        txn.vehicleClass ? `Class: ${txn.vehicleClass}` : '',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Services */}
            <div className="py-4 border-b border-dashed border-slate-200">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Services Rendered</p>
              <div className="space-y-2.5">
                {txn.services.map((svc, si) => (
                  <div key={`modal-svc-${txn.id}-${si}`} className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-xs font-medium text-slate-900">{svc.name}</p>
                      <p className="text-[10px] text-slate-500">
                        Qty {svc.qty} x {formatPeso(svc.price)}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-900 font-tabular shrink-0">
                      {formatPeso(svc.price * svc.qty)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals Breakdown */}
            <div className="py-4 border-b border-dashed border-slate-200 space-y-2">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Subtotal</span>
                <span className="font-tabular">{formatPeso(txn.subtotal)}</span>
              </div>
              {txn.discount > 0 && (
                <div className="flex justify-between text-xs text-emerald-600 font-medium">
                  <span>Discount Applied</span>
                  <span className="font-tabular">−{formatPeso(txn.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-slate-500">
                <span>VAT / Tax</span>
                <span className="font-tabular">{formatPeso(txn.tax)}</span>
              </div>
              {(txn.additionalFees ?? 0) > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Additional Fees</span>
                  <span className="font-tabular">{formatPeso(txn.additionalFees ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                <span className="text-sm font-bold text-slate-900">Service Total</span>
                <span className={`text-xl font-bold font-tabular ${txn.status === 'voided' ? 'text-slate-400 line-through' : 'text-blue-700'}`}>
                  {formatPeso(txn.serviceTotal ?? txn.total)}
                </span>
              </div>
              {(txn.downpayment ?? 0) > 0 && (
                <div className="flex justify-between text-xs text-amber-700 font-medium">
                  <span>Less Reservation / Downpayment</span>
                  <span className="font-tabular">−{formatPeso(txn.downpayment ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-semibold text-blue-700">
                <span>Amount Collected Today</span>
                <span className="font-tabular">{formatPeso(txn.amountCollected ?? txn.total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Payment Method</span>
                <span className="font-semibold text-slate-700">{getPaymentMethodLabel(txn.paymentMethod as PaymentMethod)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Payment Status</span>
                <span className={`font-semibold capitalize ${statusCfg.color}`}>{txn.status}</span>
              </div>
            </div>

            {/* Notes */}
            {txn.notes && (
              <div className="py-4 border-b border-dashed border-slate-200">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Notes</p>
                <p className="text-xs text-slate-600 leading-relaxed">{txn.notes}</p>
              </div>
            )}

            {/* Proof of Payment (GCash Pending) */}
            {txn.status === 'pending' && txn.paymentMethod === 'gcash' && (
              <div className="py-4 border-b border-dashed border-slate-200">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Proof of Payment</p>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 bg-white rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 mb-1">
                    <ImageIcon size={20} />
                  </div>
                  <p className="text-xs font-medium text-slate-700">GCash Screenshot Attached</p>
                  <p className="text-[10px] text-slate-500 text-center">Please verify the amount ({formatPeso(txn.total)}) and reference number before confirming.</p>
                  <button className="text-xs font-semibold text-blue-700 hover:text-blue-800 mt-1">
                    View Full Image
                  </button>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="pt-4 pb-2 text-center">
              <p className="text-[11px] text-slate-500">Thank you for choosing AutoSPF+!</p>
              <p className="text-[10px] text-slate-400 mt-0.5">This serves as your official digital receipt.</p>
              <div className="mt-3 flex items-center justify-center gap-1">
                <div className="w-12 h-0.5 bg-slate-200 rounded-full" />
                <p className="text-[9px] text-slate-400 px-2 uppercase tracking-wider">End of Receipt</p>
                <div className="w-12 h-0.5 bg-slate-200 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="btn-secondary flex-none px-4">
            Close
          </button>
          
          {txn.status === 'pending' && txn.paymentMethod === 'gcash' ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="flex-1 flex items-center justify-center gap-2 btn-primary bg-emerald-600 hover:bg-emerald-700 hover:border-emerald-700 text-white"
            >
              <CheckCircle2 size={16} />
              Verify & Confirm
            </button>
          ) : (
            <button
              onClick={handlePrint}
              className="flex-1 flex items-center justify-center gap-2 btn-primary"
            >
              <Printer size={14} />
              Print Receipt
            </button>
          )}

          <button
            onClick={handleDownloadPdf}
            className="flex items-center justify-center gap-2 btn-secondary px-4 hidden sm:flex"
          >
            <Download size={14} />
            PDF
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fade-in px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-zoom-in">
            <div className="p-5 text-center">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={24} className="text-emerald-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Confirm Payment</h3>
              <p className="text-sm text-slate-500 mb-4">
                Are you sure you want to confirm this GCash payment of <span className="font-semibold text-slate-900">{formatPeso(txn.total)}</span>? This action will mark the transaction as completed.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 btn-secondary py-2.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPayment}
                  className="flex-1 btn-primary bg-emerald-600 hover:bg-emerald-700 border-emerald-600 py-2.5"
                >
                  Yes, Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
