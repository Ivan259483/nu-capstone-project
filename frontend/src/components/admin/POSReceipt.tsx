import { useRef } from 'react';
import { jsPDF } from 'jspdf';
import { X, Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        plate?: string;
    };
    items: { name: string; price: number; quantity: number; isAddon?: boolean }[];
    subtotal: number;
    discount?: { type: string; value: number; amount: number; reason?: string } | null;
    total: number;
    paymentMethod: string;
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

export function POSReceipt({ receipt, businessName = 'AutoSPF+', businessAddress, businessPhone, onClose }: POSReceiptProps) {
    const receiptRef = useRef<HTMLDivElement>(null);

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
                ${receipt.vehicle?.make ? `<div class="row"><span>Vehicle:</span><span>${[receipt.vehicle.year, receipt.vehicle.make, receipt.vehicle.model].filter(Boolean).join(' ')}</span></div>` : ''}
                ${receipt.vehicle?.plate ? `<div class="row"><span>Plate:</span><span>${receipt.vehicle.plate}</span></div>` : ''}
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
                ${receipt.discount ? `<div class="row" style="color:#e44;"><span>Discount${receipt.discount.reason ? ' (' + receipt.discount.reason + ')' : ''}</span><span>-${formatCurrency(receipt.discount.amount)}</span></div>` : ''}
                <div class="divider"></div>
                <div class="row total-row"><span>TOTAL</span><span>${formatCurrency(receipt.total)}</span></div>
            </div>
            <div class="divider"></div>
            <div class="section">
                <div class="row"><span>Payment:</span><span>${receipt.paymentMethod.toUpperCase()}</span></div>
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
        if (receipt.vehicle?.make) meta.push(['Vehicle', [receipt.vehicle.year, receipt.vehicle.make, receipt.vehicle.model].filter(Boolean).join(' ')]);
        if (receipt.vehicle?.plate) meta.push(['Plate', receipt.vehicle.plate]);
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

        if (receipt.discount) {
            doc.setTextColor(220, 50, 50);
            doc.text(`Discount${receipt.discount.reason ? ` (${receipt.discount.reason})` : ''}`, x, y);
            doc.text(`-${formatCurrency(receipt.discount.amount)}`, x + w, y, { align: 'right' });
            y += 12;
            doc.setTextColor(0);
        }

        y += 2;
        doc.line(x, y, x + w, y);
        y += 12;
        doc.setFont('courier', 'bold');
        doc.setFontSize(11);
        doc.text('TOTAL', x, y);
        doc.text(formatCurrency(receipt.total), x + w, y, { align: 'right' });
        y += 14;

        doc.setLineDashPattern([2, 2], 0);
        doc.line(x, y, x + w, y);
        y += 10;

        doc.setFont('courier', 'normal');
        doc.setFontSize(8);
        doc.text('Payment:', x, y);
        doc.text(receipt.paymentMethod.toUpperCase(), x + w, y, { align: 'right' });
        y += 12;
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative w-full max-w-[420px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white text-gray-900 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                <div ref={receiptRef} className="p-6">
                    {/* Header */}
                    <div className="text-center mb-4 pb-4 border-b-2 border-dashed border-gray-300">
                        <h2 className="text-xl font-black tracking-[3px] text-gray-900">{businessName}</h2>
                        {businessAddress && <p className="text-[10px] text-gray-500 mt-1">{businessAddress}</p>}
                        {businessPhone && <p className="text-[10px] text-gray-500">Tel: {businessPhone}</p>}
                        <p className="text-[10px] text-gray-400 mt-2 font-mono">{receipt.transactionId}</p>
                    </div>

                    {/* Meta Info */}
                    <div className="space-y-1.5 text-[12px] mb-4">
                        <div className="flex justify-between"><span className="text-gray-500">Date</span><span className="font-medium">{new Date(receipt.date).toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-medium">{receipt.customerName}</span></div>
                        {vehicleStr && <div className="flex justify-between"><span className="text-gray-500">Vehicle</span><span className="font-medium">{vehicleStr}</span></div>}
                        {receipt.vehicle?.plate && <div className="flex justify-between"><span className="text-gray-500">Plate</span><span className="font-mono font-medium">{receipt.vehicle.plate}</span></div>}
                        {receipt.bookingRef && <div className="flex justify-between"><span className="text-gray-500">Booking</span><span className="font-mono text-orange-600 font-semibold">#{receipt.bookingRef}</span></div>}
                        {receipt.staff?.name && <div className="flex justify-between"><span className="text-gray-500">Technician</span><span className="font-medium">{receipt.staff.name}</span></div>}
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-gray-300 my-3" />

                    {/* Items */}
                    <div className="mb-1">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[1.5px] mb-2">Services</p>
                        {receipt.items.filter(i => !i.isAddon).map((item, idx) => (
                            <div key={idx} className="flex justify-between text-[12px] py-1">
                                <span>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}</span>
                                <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>

                    {receipt.items.some(i => i.isAddon) && (
                        <div className="mb-1 mt-2">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[1.5px] mb-2">Add-ons</p>
                            {receipt.items.filter(i => i.isAddon).map((item, idx) => (
                                <div key={idx} className="flex justify-between text-[12px] py-1">
                                    <span>{item.quantity > 1 ? `${item.quantity}× ` : ''}{item.name}</span>
                                    <span className="font-semibold">{formatCurrency(item.price * item.quantity)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Totals */}
                    <div className="border-t border-dashed border-gray-300 my-3" />
                    <div className="space-y-1.5 text-[12px]">
                        <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(receipt.subtotal)}</span></div>
                        {receipt.discount && (
                            <div className="flex justify-between text-red-500">
                                <span>Discount{receipt.discount.reason ? ` (${receipt.discount.reason})` : ''}</span>
                                <span>−{formatCurrency(receipt.discount.amount)}</span>
                            </div>
                        )}
                        <div className="border-t border-dashed border-gray-300 my-2" />
                        <div className="flex justify-between text-[16px] font-black">
                            <span>TOTAL</span>
                            <span>{formatCurrency(receipt.total)}</span>
                        </div>
                    </div>

                    {/* Payment Info */}
                    <div className="border-t border-dashed border-gray-300 my-3" />
                    <div className="space-y-1.5 text-[12px]">
                        <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="font-bold uppercase">{receipt.paymentMethod}</span></div>
                        {receipt.cashReceived != null && receipt.cashReceived > 0 && (
                            <div className="flex justify-between"><span className="text-gray-500">Received</span><span>{formatCurrency(receipt.cashReceived)}</span></div>
                        )}
                        {receipt.changeGiven != null && receipt.changeGiven > 0 && (
                            <div className="flex justify-between text-emerald-600 font-semibold"><span>Change</span><span>{formatCurrency(receipt.changeGiven)}</span></div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="border-t-2 border-dashed border-gray-300 mt-4 pt-4 text-center">
                        <p className="text-[11px] text-gray-600 font-medium">Thank you for choosing {businessName}!</p>
                        <p className="text-[10px] text-gray-400 mt-1">Drive clean, drive proud. 🚗✨</p>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 p-4 pt-0">
                    <Button
                        onClick={handlePrint}
                        className="flex-1 bg-gray-900 hover:bg-gray-800 text-white gap-2"
                    >
                        <Printer className="w-4 h-4" /> Print
                    </Button>
                    <Button
                        onClick={handleExportPDF}
                        variant="outline"
                        className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
                    >
                        <Download className="w-4 h-4" /> PDF
                    </Button>
                </div>
            </div>
        </div>
    );
}
