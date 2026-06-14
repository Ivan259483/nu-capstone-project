import { useRef } from 'react';
import { jsPDF } from 'jspdf';
import { X, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveReceiptPhone } from '@/lib/receipt-phone';

export interface ReceiptData {
    transactionId: string;
    paymentId?: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    vehicle: {
        year?: string;
        make?: string;
        model?: string;
        color?: string;
        colorName?: string;
        paintColor?: string;
        details?: { color?: string };
        type?: string;
        class?: string;
        vehicleType?: string;
        category?: string;
        plate?: string;
    };
    items: { name: string; price: number; quantity: number; isAddon?: boolean }[];
    subtotal: number;
    discountAmount?: number;
    discount?: { type: string; value: number; amount: number; reason?: string } | null;
    taxVatAmount?: number;
    taxAmount?: number;
    additionalFees?: number;
    downpayment?: number;
    grandTotal?: number;
    serviceTotal?: number;
    totalAmount?: number;
    amountCollected?: number;
    total: number;
    paymentMethod: string;
    splitPayments?: { method: string; amount: number }[];
    cashReceived?: number | null;
    changeGiven?: number | null;
    staff?: { id?: string; name: string } | null;
    bookingRef?: string;
    date: string;
    inventoryWarnings?: any[];
}

interface POSReceiptProps {
    receipt: ReceiptData;
    businessName?: string;
    businessAddress?: string;
    businessPhone?: string;
    onClose: () => void;
}

const formatCurrency = (val: number) => `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const firstDisplayValue = (...values: unknown[]) => {
    for (const value of values) {
        if (typeof value !== 'string') continue;
        const trimmed = value.trim();
        if (trimmed && !['null', 'undefined'].includes(trimmed.toLowerCase())) return trimmed;
    }
    return '';
};

export function POSReceipt({ receipt, businessName = 'AutoSPF+', businessAddress, businessPhone, onClose }: POSReceiptProps) {
    const receiptRef = useRef<HTMLDivElement>(null);
    const customerPhone = resolveReceiptPhone(receipt);
    const discountAmount = receipt.discount?.amount ?? receipt.discountAmount ?? 0;
    const taxAmount = receipt.taxVatAmount ?? receipt.taxAmount ?? 0;
    const additionalFees = receipt.additionalFees ?? 0;
    const serviceTotal =
        receipt.serviceTotal
        ?? receipt.grandTotal
        ?? receipt.totalAmount
        ?? receipt.subtotal - discountAmount + taxAmount + additionalFees;
    const amountCollected = receipt.amountCollected ?? receipt.total;
    const vehicleColor = firstDisplayValue(
        receipt.vehicle?.color,
        receipt.vehicle?.colorName,
        receipt.vehicle?.paintColor,
        receipt.vehicle?.details?.color
    );
    const vehicleClass = firstDisplayValue(
        receipt.vehicle?.type,
        receipt.vehicle?.class,
        receipt.vehicle?.vehicleType,
        receipt.vehicle?.category
    );

    const handlePrint = () => {
        const printContent = receiptRef.current;
        if (!printContent) return;
        const win = window.open('', '_blank', 'width=400,height=700');
        if (!win) return;
        win.document.write(`
            <!DOCTYPE html>
            <html><head><title>Receipt - ${receipt.transactionId}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 16px 8px; font-size: 12px; color: #111; }
                .header { text-align: center; margin-bottom: 12px; border-bottom: 2px dashed #333; padding-bottom: 12px; }
                .header h1 { font-size: 18px; font-weight: 800; letter-spacing: 2px; }
                .header p { font-size: 10px; color: #555; margin-top: 2px; }
                .section { margin: 8px 0; }
                .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 4px; }
                .row { display: flex; justify-content: space-between; padding: 2px 0; }
                .row.item { margin-left: 4px; }
                .divider { border-top: 1px dashed #aaa; margin: 8px 0; }
                .total-row { font-weight: 700; font-size: 14px; }
                .footer { text-align: center; margin-top: 16px; border-top: 2px dashed #333; padding-top: 12px; font-size: 10px; color: #888; }
                @media print { body { width: 72mm; } }
            </style></head><body>
            <div class="header">
                <h1>${businessName}</h1>
                ${businessAddress ? `<p>${businessAddress}</p>` : ''}
                ${businessPhone ? `<p>Tel: ${businessPhone}</p>` : ''}
                <p style="margin-top:6px;font-size:9px;color:#aaa;">${receipt.transactionId}</p>
            </div>
            <div class="section">
                <div class="row"><span>Date:</span><span>${new Date(receipt.date).toLocaleString()}</span></div>
                <div class="row"><span>Customer:</span><span>${receipt.customerName}</span></div>
                ${customerPhone ? `<div class="row"><span>Phone:</span><span>${customerPhone}</span></div>` : ''}
                ${receipt.vehicle?.make ? `<div class="row"><span>Vehicle:</span><span>${[receipt.vehicle.year, receipt.vehicle.make, receipt.vehicle.model].filter(Boolean).join(' ')}</span></div>` : ''}
                ${receipt.vehicle?.plate ? `<div class="row"><span>Plate:</span><span>${receipt.vehicle.plate}</span></div>` : ''}
                ${vehicleColor ? `<div class="row"><span>Color:</span><span>${vehicleColor}</span></div>` : ''}
                ${vehicleClass ? `<div class="row"><span>Class:</span><span>${vehicleClass}</span></div>` : ''}
                ${receipt.bookingRef ? `<div class="row"><span>Booking:</span><span>#${receipt.bookingRef}</span></div>` : ''}
                ${receipt.staff?.name ? `<div class="row"><span>Staff:</span><span>${receipt.staff.name}</span></div>` : ''}
            </div>
            <div class="divider"></div>
            <div class="section">
                <div class="section-title">Items</div>
                ${receipt.items.filter(i => !i.isAddon).map(i => `<div class="row item"><span>${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.name}</span><span>${formatCurrency(i.price * i.quantity)}</span></div>`).join('')}
                ${receipt.items.some(i => i.isAddon) ? `
                    <div class="section-title" style="margin-top:6px;">Add-ons</div>
                    ${receipt.items.filter(i => i.isAddon).map(i => `<div class="row item"><span>${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.name}</span><span>${formatCurrency(i.price * i.quantity)}</span></div>`).join('')}
                ` : ''}
            </div>
            <div class="divider"></div>
            <div class="section">
                <div class="row"><span>Subtotal</span><span>${formatCurrency(receipt.subtotal)}</span></div>
                ${discountAmount > 0 ? `<div class="row" style="color:#e44;"><span>Discount${receipt.discount?.reason ? ' (' + receipt.discount.reason + ')' : ''}</span><span>-${formatCurrency(discountAmount)}</span></div>` : ''}
                <div class="row"><span>VAT / Tax</span><span>${formatCurrency(taxAmount)}</span></div>
                ${additionalFees > 0 ? `<div class="row"><span>Additional Fees</span><span>${formatCurrency(additionalFees)}</span></div>` : ''}
                <div class="divider"></div>
                <div class="row"><span>Service Total</span><span>${formatCurrency(serviceTotal)}</span></div>
                <div class="row total-row"><span>AMOUNT COLLECTED</span><span>${formatCurrency(amountCollected)}</span></div>
            </div>
            <div class="divider"></div>
            <div class="section">
                ${receipt.paymentMethod === 'split' && receipt.splitPayments ? `
                    <div class="section-title">Split Payment</div>
                    ${receipt.splitPayments.map(sp => `<div class="row"><span>${sp.method.toUpperCase()}</span><span>${formatCurrency(sp.amount)}</span></div>`).join('')}
                ` : `<div class="row"><span>Payment:</span><span>${receipt.paymentMethod.toUpperCase()}</span></div>`}
                ${receipt.cashReceived ? `<div class="row"><span>Received:</span><span>${formatCurrency(receipt.cashReceived)}</span></div>` : ''}
                ${receipt.changeGiven != null && receipt.changeGiven > 0 ? `<div class="row"><span>Change:</span><span>${formatCurrency(receipt.changeGiven)}</span></div>` : ''}
            </div>
            <div class="footer">
                <p>Thank you for choosing ${businessName}!</p>
                <p style="margin-top:4px;">Drive clean, drive proud.</p>
            </div>
            </body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => { win.print(); win.close(); }, 400);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF({ unit: 'pt', format: [226, 600] });
        let y = 20;
        const x = 16;
        const w = 194;

        doc.setFont('courier', 'bold');
        doc.setFontSize(14);
        doc.text(businessName, 113, y, { align: 'center' });
        y += 14;
        if (businessAddress) {
            doc.setFontSize(7);
            doc.setFont('courier', 'normal');
            doc.text(businessAddress, 113, y, { align: 'center' });
            y += 10;
        }
        doc.setFontSize(7);
        doc.text(receipt.transactionId, 113, y, { align: 'center' });
        y += 14;

        doc.setDrawColor(150);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(x, y, x + w, y);
        y += 10;

        doc.setFontSize(8);
        doc.setFont('courier', 'normal');
        const meta = [
            ['Date', new Date(receipt.date).toLocaleString()],
            ['Customer', receipt.customerName],
        ];
        if (customerPhone) meta.push(['Phone', customerPhone]);
        if (receipt.vehicle?.make) meta.push(['Vehicle', [receipt.vehicle.year, receipt.vehicle.make, receipt.vehicle.model].filter(Boolean).join(' ')]);
        if (receipt.vehicle?.plate) meta.push(['Plate', receipt.vehicle.plate]);
        if (vehicleColor) meta.push(['Color', vehicleColor]);
        if (vehicleClass) meta.push(['Class', vehicleClass]);
        if (receipt.bookingRef) meta.push(['Booking', `#${receipt.bookingRef}`]);
        if (receipt.staff?.name) meta.push(['Staff', receipt.staff.name]);

        for (const [label, value] of meta) {
            doc.text(`${label}:`, x, y);
            doc.text(String(value), x + w, y, { align: 'right' });
            y += 12;
        }
        y += 4;
        doc.line(x, y, x + w, y);
        y += 10;

        doc.setFont('courier', 'bold');
        doc.setFontSize(7);
        doc.text('ITEMS', x, y);
        y += 10;
        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        for (const item of receipt.items.filter(i => !i.isAddon)) {
            const label = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
            doc.text(label, x, y);
            doc.text(formatCurrency(item.price * item.quantity), x + w, y, { align: 'right' });
            y += 12;
        }

        const addons = receipt.items.filter(i => i.isAddon);
        if (addons.length) {
            y += 4;
            doc.setFont('courier', 'bold');
            doc.setFontSize(7);
            doc.text('ADD-ONS', x, y);
            y += 10;
            doc.setFont('courier', 'normal');
            doc.setFontSize(8);
            for (const item of addons) {
                const label = item.quantity > 1 ? `${item.quantity}x ${item.name}` : item.name;
                doc.text(label, x, y);
                doc.text(formatCurrency(item.price * item.quantity), x + w, y, { align: 'right' });
                y += 12;
            }
        }

        y += 4;
        doc.line(x, y, x + w, y);
        y += 10;

        doc.text('Subtotal', x, y);
        doc.text(formatCurrency(receipt.subtotal), x + w, y, { align: 'right' });
        y += 12;

        if (discountAmount > 0) {
            doc.setTextColor(220, 50, 50);
            doc.text(`Discount${receipt.discount?.reason ? ` (${receipt.discount.reason})` : ''}`, x, y);
            doc.text(`-${formatCurrency(discountAmount)}`, x + w, y, { align: 'right' });
            y += 12;
            doc.setTextColor(0);
        }

        doc.text('VAT / Tax', x, y);
        doc.text(formatCurrency(taxAmount), x + w, y, { align: 'right' });
        y += 12;

        if (additionalFees > 0) {
            doc.text('Additional Fees', x, y);
            doc.text(formatCurrency(additionalFees), x + w, y, { align: 'right' });
            y += 12;
        }

        y += 2;
        doc.line(x, y, x + w, y);
        y += 12;
        doc.setFont('courier', 'bold');
        doc.setFontSize(9);
        doc.text('SERVICE TOTAL', x, y);
        doc.text(formatCurrency(serviceTotal), x + w, y, { align: 'right' });
        y += 12;
        doc.setFontSize(11);
        doc.text('AMOUNT COLLECTED', x, y);
        doc.text(formatCurrency(amountCollected), x + w, y, { align: 'right' });
        y += 14;

        doc.setLineDashPattern([2, 2], 0);
        doc.line(x, y, x + w, y);
        y += 10;

        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        if (receipt.paymentMethod === 'split' && receipt.splitPayments) {
            doc.text('Split Payment:', x, y);
            y += 12;
            for (const sp of receipt.splitPayments) {
                doc.text(`- ${sp.method.toUpperCase()}`, x + 8, y);
                doc.text(formatCurrency(sp.amount), x + w, y, { align: 'right' });
                y += 12;
            }
        } else {
            doc.text('Payment:', x, y);
            doc.text(receipt.paymentMethod.toUpperCase(), x + w, y, { align: 'right' });
            y += 12;
        }
        if (receipt.cashReceived) {
            doc.text('Received:', x, y);
            doc.text(formatCurrency(receipt.cashReceived), x + w, y, { align: 'right' });
            y += 12;
        }
        if (receipt.changeGiven != null && receipt.changeGiven > 0) {
            doc.text('Change:', x, y);
            doc.text(formatCurrency(receipt.changeGiven), x + w, y, { align: 'right' });
            y += 12;
        }

        y += 10;
        doc.line(x, y, x + w, y);
        y += 14;
        doc.setFontSize(8);
        doc.text(`Thank you for choosing ${businessName}!`, 113, y, { align: 'center' });
        y += 10;
        doc.setFontSize(7);
        doc.text('Drive clean, drive proud.', 113, y, { align: 'center' });

        doc.save(`Receipt-${receipt.transactionId}.pdf`);
    };

    const vehicleStr = [receipt.vehicle?.year, receipt.vehicle?.make, receipt.vehicle?.model].filter(Boolean).join(' ');

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md" onClick={onClose}>
            <div
                className="relative w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-3xl bg-[#0a0a0a] border border-white/10 text-zinc-300 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Glow Effect */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-orange-500/10 blur-[60px] pointer-events-none" />

                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all"
                >
                    <X className="w-4 h-4" />
                </button>

                <div ref={receiptRef} className="p-8 relative z-10 bg-transparent">
                    {/* Header */}
                    <div className="text-center mb-6 pb-6 border-b border-dashed border-white/10">
                        <h2 className="text-2xl font-black tracking-[4px] text-white font-serif">{businessName}</h2>
                        {businessAddress && <p className="text-[11px] text-zinc-500 mt-2">{businessAddress}</p>}
                        {businessPhone && <p className="text-[11px] text-zinc-500">Tel: {businessPhone}</p>}
                        <p className="text-[11px] text-zinc-600 mt-3 font-mono tracking-wider">{receipt.transactionId}</p>
                    </div>

                    {/* Meta Info */}
                    <div className="space-y-2.5 text-[12px] mb-6 bg-white/[0.02] p-4 rounded-xl border border-white/5">
                        <div className="flex justify-between"><span className="text-zinc-500">Date</span><span className="font-semibold text-zinc-200">{new Date(receipt.date).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500">Customer</span><span className="font-semibold text-zinc-200">{receipt.customerName}</span></div>
                        {customerPhone && <div className="flex justify-between"><span className="text-zinc-500">Phone</span><span className="font-semibold text-zinc-200">{customerPhone}</span></div>}
                        {vehicleStr && <div className="flex justify-between"><span className="text-zinc-500">Vehicle</span><span className="font-semibold text-zinc-200">{vehicleStr}</span></div>}
                        {receipt.vehicle?.plate && <div className="flex justify-between"><span className="text-zinc-500">Plate</span><span className="font-mono font-semibold text-orange-400 bg-orange-500/10 px-1.5 rounded">{receipt.vehicle.plate}</span></div>}
                        {vehicleColor && <div className="flex justify-between"><span className="text-zinc-500">Color</span><span className="font-semibold text-zinc-200">{vehicleColor}</span></div>}
                        {vehicleClass && <div className="flex justify-between"><span className="text-zinc-500">Class</span><span className="font-semibold text-zinc-200">{vehicleClass}</span></div>}
                        {receipt.bookingRef && <div className="flex justify-between"><span className="text-zinc-500">Booking</span><span className="font-mono text-orange-500 font-semibold">#{receipt.bookingRef}</span></div>}
                        {receipt.staff?.name && <div className="flex justify-between"><span className="text-zinc-500">Technician</span><span className="font-semibold text-zinc-200">{receipt.staff.name}</span></div>}
                    </div>

                    {/* Items */}
                    <div className="mb-2">
                        <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[2px] mb-3">Services</p>
                        {receipt.items.filter(i => !i.isAddon).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[13px] py-1.5">
                                <span className="text-zinc-200">{item.quantity > 1 ? <span className="text-orange-400 font-bold">{item.quantity}× </span> : ''}{item.name}</span>
                                <span className="font-bold text-white">{formatCurrency(item.price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>

                    {receipt.items.some(i => i.isAddon) && (
                        <div className="mb-2 mt-4">
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-[2px] mb-3">Add-ons</p>
                            {receipt.items.filter(i => i.isAddon).map((item, idx) => (
                                <div key={idx} className="flex justify-between text-[13px] py-1.5">
                                    <span className="text-zinc-400">{item.quantity > 1 ? <span className="text-orange-400 font-bold">{item.quantity}× </span> : ''}{item.name}</span>
                                    <span className="font-bold text-zinc-300">{formatCurrency(item.price * item.quantity)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Totals */}
                    <div className="border-t border-dashed border-white/10 my-5" />
                    <div className="space-y-2 text-[13px]">
                        <div className="flex justify-between"><span className="text-zinc-400">Subtotal</span><span className="font-semibold">{formatCurrency(receipt.subtotal)}</span></div>
                        {discountAmount > 0 && (
                            <div className="flex justify-between text-orange-400">
                                <span>Discount{receipt.discount?.reason ? ` (${receipt.discount.reason})` : ''}</span>
                                <span className="font-semibold">−{formatCurrency(discountAmount)}</span>
                            </div>
                        )}
                        <div className="flex justify-between"><span className="text-zinc-400">VAT / Tax</span><span className="font-semibold">{formatCurrency(taxAmount)}</span></div>
                        {additionalFees > 0 && (
                            <div className="flex justify-between"><span className="text-zinc-400">Additional Fees</span><span className="font-semibold">{formatCurrency(additionalFees)}</span></div>
                        )}
                        <div className="border-t border-dashed border-white/10 my-3" />
                        <div className="flex justify-between">
                            <span className="text-zinc-400">Service Total</span>
                            <span className="font-bold text-white">{formatCurrency(serviceTotal)}</span>
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-[14px] font-black tracking-widest text-zinc-500">COLLECTED</span>
                            <span className="text-2xl font-black text-orange-500 drop-shadow-[0_0_15px_rgba(249,115,22,0.3)]">{formatCurrency(amountCollected)}</span>
                        </div>
                    </div>

                    {/* Payment Info */}
                    <div className="border-t border-dashed border-white/10 my-5" />
                    <div className="space-y-2 text-[12px] bg-white/[0.02] p-4 rounded-xl border border-white/5">
                        {receipt.paymentMethod === 'split' && receipt.splitPayments ? (
                            <>
                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-[2px] mb-2">Split Payment Breakdown</div>
                                {receipt.splitPayments.map((sp, idx) => (
                                    <div key={idx} className="flex justify-between">
                                        <span className="text-zinc-400 capitalize">{sp.method}</span>
                                        <span className="font-semibold text-white">{formatCurrency(sp.amount)}</span>
                                    </div>
                                ))}
                            </>
                        ) : (
                            <div className="flex justify-between"><span className="text-zinc-500">Payment</span><span className="font-bold text-white uppercase tracking-wider">{receipt.paymentMethod}</span></div>
                        )}
                        {receipt.cashReceived != null && receipt.cashReceived > 0 && (
                            <div className="flex justify-between"><span className="text-zinc-500">Received</span><span className="font-semibold text-zinc-300">{formatCurrency(receipt.cashReceived)}</span></div>
                        )}
                        {receipt.changeGiven != null && receipt.changeGiven > 0 && (
                            <div className="flex justify-between text-emerald-400 font-semibold mt-1 pt-1 border-t border-emerald-500/10">
                                <span>Change</span>
                                <span>{formatCurrency(receipt.changeGiven)}</span>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="mt-8 text-center bg-orange-500/5 py-4 rounded-xl border border-orange-500/10">
                        <p className="text-[12px] text-zinc-300 font-bold tracking-wide">Thank you for choosing {businessName}!</p>
                        <p className="text-[10px] text-orange-400/80 mt-1.5 uppercase tracking-widest">Drive clean, drive proud.</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 p-6 pt-0 relative z-10 bg-[#0a0a0a]">
                    <Button
                        onClick={handlePrint}
                        className="flex-1 bg-orange-500 hover:bg-orange-400 text-black font-bold h-12 shadow-[0_0_20px_rgba(249,115,22,0.2)] hover:shadow-[0_0_25px_rgba(249,115,22,0.4)] transition-all gap-2"
                    >
                        <Printer className="w-4 h-4" /> Print Receipt
                    </Button>
                    <Button
                        onClick={handleExportPDF}
                        variant="outline"
                        className="flex-1 bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white font-bold h-12 gap-2"
                    >
                        <Download className="w-4 h-4" /> Save PDF
                    </Button>
                </div>
            </div>
        </div>
    );
}
