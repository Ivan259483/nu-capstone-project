import { jsPDF } from 'jspdf';
import type { Booking } from '@/types';
import type { Transaction, PaymentMethod } from '@/lib/salesData';
import {
  formatPeso,
  formatTransactionStatusLabel,
  getPaymentMethodLabel,
} from '@/lib/salesData';
import { sanitizeVehiclePlate } from '@/lib/vehicle-display';
import { COMPANY_BRANDING, companyContactLine } from '@/lib/company-branding';

export type DetailedReceiptLine = {
  name: string;
  qty: number;
  unitPrice: number;
};

export type DetailedReceipt = {
  receiptNumber: string;
  invoiceNumber?: string;
  orderNumber?: string;
  bookingReference?: string;
  issuedAt: string;
  paidAt?: string;
  staffName?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  vehiclePlate?: string;
  vehicleInfo?: string;
  lineItems: DetailedReceiptLine[];
  subtotal: number;
  discount: number;
  tax: number;
  additionalFees: number;
  downpayment: number;
  total: number;
  balanceDue: number;
  paymentMethod: string;
  paymentStatus: string;
  notes?: string;
};

const safeNumber = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const fileSafe = (value: string) => value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return { date: '', time: '' };
  return {
    date: d.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
  };
};

const formatPdfMoney = (amount: number) =>
  `PHP ${safeNumber(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const normalizePaymentMethod = (method?: string) => {
  const m = String(method || 'cash').toLowerCase().replace(/\s+/g, '_');
  const known = ['cash', 'card', 'gcash', 'maya', 'bank_transfer'] as const;
  if ((known as readonly string[]).includes(m)) return getPaymentMethodLabel(m as PaymentMethod);
  return m ? m.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Cash';
};

const bookingLineItems = (booking: Booking): DetailedReceiptLine[] => {
  const items = Array.isArray(booking.items) ? booking.items : [];
  if (items.length) {
    return items.map((item: any, index) => {
      const product = item?.product;
      const name =
        (product && typeof product === 'object' && ('name' in product ? product.name : '')) ||
        item?.name ||
        booking.serviceName ||
        booking.serviceType ||
        `Service ${index + 1}`;
      return {
        name: String(name || 'Service'),
        qty: Math.max(1, safeNumber(item?.quantity) || 1),
        unitPrice: safeNumber(item?.price || product?.basePrice || booking.totalPrice || booking.totalAmount),
      };
    });
  }

  return [{
    name: booking.serviceName || booking.serviceType || 'Service',
    qty: 1,
    unitPrice: safeNumber(booking.totalPrice || booking.totalAmount),
  }];
};

export const receiptFromTransaction = (txn: Transaction): DetailedReceipt => {
  const paymentStatus = formatTransactionStatusLabel(txn.status, txn.statusRaw);
  const receiptNumber = txn.invoiceId || txn.id;
  const lineItems = txn.services.length
    ? txn.services.map((svc) => ({
        name: svc.name,
        qty: Math.max(1, safeNumber(svc.qty) || 1),
        unitPrice: safeNumber(svc.price),
      }))
    : [{
        name: 'Service',
        qty: 1,
        unitPrice: safeNumber(txn.total),
      }];
  const computedSubtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  return {
    receiptNumber,
    invoiceNumber: txn.invoiceId,
    orderNumber: txn.orderNumber,
    bookingReference: txn.bookingReference || txn.id,
    issuedAt: txn.dateTime,
    paidAt: txn.paidAt || txn.analyticsDateTime,
    staffName: txn.staffName,
    customerName: txn.customerName,
    customerPhone: txn.customerPhone,
    customerEmail: txn.customerEmail,
    vehiclePlate: sanitizeVehiclePlate(txn.vehiclePlate || ''),
    vehicleInfo: txn.vehicleInfo,
    lineItems,
    subtotal: safeNumber(txn.subtotal || computedSubtotal),
    discount: safeNumber(txn.discount),
    tax: safeNumber(txn.tax),
    additionalFees: 0,
    downpayment: 0,
    total: safeNumber(txn.total),
    balanceDue: txn.status === 'completed' ? 0 : safeNumber(txn.total),
    paymentMethod: normalizePaymentMethod(txn.paymentMethod),
    paymentStatus,
    notes: txn.notes,
  };
};

export const receiptFromBooking = (booking: Booking): DetailedReceipt => {
  const lineItems = bookingLineItems(booking);
  const subtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const total = safeNumber(booking.totalPrice || booking.totalAmount || subtotal);
  const status = booking.paymentStatus || (booking.status === 'completed' || booking.status === 'released' || booking.status === 'paid' ? 'paid' : 'pending');
  const vehicleInfo =
    booking.vehicleInfo ||
    [booking.vehicleYear, booking.vehicleMake, booking.vehicleModel].filter(Boolean).join(' ');

  return {
    receiptNumber: booking.invoiceId || booking.bookingReference || booking.orderNumber || booking.id,
    invoiceNumber: booking.invoiceId,
    orderNumber: booking.orderNumber,
    bookingReference: booking.bookingReference,
    issuedAt: booking.paidAt || booking.updatedAt || booking.createdAt || booking.date || new Date().toISOString(),
    paidAt: booking.paidAt,
    staffName: typeof booking.assignedDetailer === 'object' ? booking.assignedDetailer?.name : undefined,
    customerName: booking.customerName || booking.customer?.name || 'Customer',
    customerPhone: booking.customerPhone || booking.customer?.phone,
    customerEmail: booking.customer?.email,
    vehiclePlate: sanitizeVehiclePlate(booking.vehiclePlate || ''),
    vehicleInfo,
    lineItems,
    subtotal,
    discount: 0,
    tax: 0,
    additionalFees: 0,
    downpayment: safeNumber(booking.downPaymentAmount),
    total,
    balanceDue: status === 'paid' ? 0 : total,
    paymentMethod: normalizePaymentMethod(booking.paymentMethod),
    paymentStatus: status,
    notes: booking.notes,
  };
};

export const buildDetailedReceiptHtml = (receipt: DetailedReceipt) => {
  const issued = formatDateTime(receipt.issuedAt);
  const paid = receipt.paidAt ? formatDateTime(receipt.paidAt) : null;
  const lineRows = receipt.lineItems.map((item) => {
    const lineTotal = item.unitPrice * item.qty;
    return `
      <tr>
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <span>${item.qty} x ${escapeHtml(formatPeso(item.unitPrice))}</span>
        </td>
        <td>${item.qty}</td>
        <td>${escapeHtml(formatPeso(item.unitPrice))}</td>
        <td>${escapeHtml(formatPeso(lineTotal))}</td>
      </tr>
    `;
  }).join('');

  const optionalRow = (label: string, value: number, negative = false) => {
    if (!value) return '';
    return `<div class="summary-row muted"><span>${escapeHtml(label)}</span><strong>${negative ? '-' : ''}${escapeHtml(formatPeso(value))}</strong></div>`;
  };

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f8fafc; color: #0f172a; font-family: Inter, Arial, sans-serif; }
      .page { width: 760px; margin: 0 auto; padding: 28px; background: #fff; }
      .top { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 1px solid #e2e8f0; }
      .brand h1 { margin: 0; font-size: 26px; color: #1d4ed8; letter-spacing: -0.02em; }
      .brand p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
      .title { text-align: right; }
      .title h2 { margin: 0; font-size: 18px; }
      .title p { margin: 4px 0 0; color: #64748b; font-size: 12px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px; }
      .box { border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }
      .label { margin: 0 0 8px; color: #94a3b8; font-size: 10px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; }
      .line { display: flex; justify-content: space-between; gap: 16px; margin: 6px 0; font-size: 12px; }
      .line span:first-child { color: #64748b; }
      .line strong { text-align: right; }
      table { width: 100%; border-collapse: collapse; margin-top: 22px; font-size: 12px; }
      th { text-align: right; padding: 10px 8px; color: #64748b; border-bottom: 1px solid #cbd5e1; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; }
      th:first-child, td:first-child { text-align: left; }
      td { text-align: right; padding: 12px 8px; border-bottom: 1px solid #edf2f7; vertical-align: top; }
      td:first-child span { display: block; margin-top: 3px; color: #64748b; font-size: 10px; }
      .summary { width: 320px; margin: 22px 0 0 auto; }
      .summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 7px 0; font-size: 12px; }
      .summary-row > span:first-child { flex: 1; min-width: 0; padding-right: 8px; line-height: 1.4; word-break: break-word; }
      .summary-row > strong { flex-shrink: 0; white-space: nowrap; text-align: right; font-weight: 700; }
      .summary-row.muted { color: #475569; }
      .total { border-top: 1px solid #cbd5e1; margin-top: 6px; padding-top: 12px; font-size: 20px; font-weight: 800; color: #1d4ed8; }
      .payment { margin-top: 20px; border-top: 1px dashed #cbd5e1; padding-top: 16px; }
      .notes { margin-top: 18px; color: #475569; font-size: 12px; line-height: 1.5; }
      .footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 11px; }
      @media print {
        @page { size: A4; margin: 14mm; }
        body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { width: auto; padding: 0; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="top">
        <div class="brand">
          <h1>${COMPANY_BRANDING.brandName}</h1>
          <p>${COMPANY_BRANDING.tagline}</p>
          <p>${COMPANY_BRANDING.address}</p>
          <p>${companyContactLine()}</p>
        </div>
        <div class="title">
          <h2>Official Digital Receipt</h2>
          <p>${escapeHtml(receipt.receiptNumber)}</p>
          ${receipt.invoiceNumber ? `<p>Invoice: ${escapeHtml(receipt.invoiceNumber)}</p>` : ''}
        </div>
      </section>

      <section class="grid">
        <div class="box">
          <p class="label">Transaction Details</p>
          <div class="line"><span>Date</span><strong>${escapeHtml(issued.date)}</strong></div>
          <div class="line"><span>Time</span><strong>${escapeHtml(issued.time)}</strong></div>
          ${paid ? `<div class="line"><span>Paid</span><strong>${escapeHtml(`${paid.date} ${paid.time}`)}</strong></div>` : ''}
          ${receipt.bookingReference ? `<div class="line"><span>Booking ref</span><strong>${escapeHtml(receipt.bookingReference)}</strong></div>` : ''}
          ${receipt.orderNumber ? `<div class="line"><span>Order no.</span><strong>${escapeHtml(receipt.orderNumber)}</strong></div>` : ''}
          <div class="line"><span>Served by</span><strong>${escapeHtml(receipt.staffName || 'AutoSPF+')}</strong></div>
        </div>
        <div class="box">
          <p class="label">Customer & Vehicle</p>
          <div class="line"><span>Customer</span><strong>${escapeHtml(receipt.customerName)}</strong></div>
          ${receipt.customerPhone ? `<div class="line"><span>Phone</span><strong>${escapeHtml(receipt.customerPhone)}</strong></div>` : ''}
          ${receipt.customerEmail ? `<div class="line"><span>Email</span><strong>${escapeHtml(receipt.customerEmail)}</strong></div>` : ''}
          ${receipt.vehiclePlate ? `<div class="line"><span>Plate</span><strong>${escapeHtml(receipt.vehiclePlate)}</strong></div>` : ''}
          ${receipt.vehicleInfo ? `<div class="line"><span>Vehicle</span><strong>${escapeHtml(receipt.vehicleInfo)}</strong></div>` : ''}
        </div>
      </section>

      <table>
        <thead>
          <tr><th>Services Rendered</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>

      <section class="summary">
        <div class="summary-row muted"><span>Subtotal</span><strong>${escapeHtml(formatPeso(receipt.subtotal))}</strong></div>
        ${optionalRow('Discount', receipt.discount, true)}
        <div class="summary-row muted"><span>VAT / Tax</span><strong>${escapeHtml(formatPeso(receipt.tax))}</strong></div>
        ${optionalRow('Additional fees', receipt.additionalFees)}
        ${optionalRow('Less reservation / downpayment (paid earlier)', receipt.downpayment, true)}
        <div class="summary-row total"><span>Balance collected</span><strong>${escapeHtml(formatPeso(receipt.total))}</strong></div>
        ${receipt.balanceDue > 0 ? `<div class="summary-row muted"><span>Balance Due</span><strong>${escapeHtml(formatPeso(receipt.balanceDue))}</strong></div>` : ''}
      </section>

      <section class="payment">
        <div class="line"><span>Payment Method</span><strong>${escapeHtml(receipt.paymentMethod)}</strong></div>
        <div class="line"><span>Payment Status</span><strong>${escapeHtml(receipt.paymentStatus)}</strong></div>
      </section>

      ${receipt.notes ? `<section class="notes"><strong>Notes:</strong> ${escapeHtml(receipt.notes)}</section>` : ''}

      <section class="footer">
        <strong>Thank you for choosing AutoSPF+.</strong><br />
        This serves as your official digital receipt. Keep this copy for your records.
      </section>
    </main>
  </body>
</html>`;
};

export const printDetailedReceipt = (receipt: DetailedReceipt) => {
  const win = window.open('', '_blank', 'width=860,height=900');
  if (!win) return;
  win.document.write(buildDetailedReceiptHtml(receipt));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 250);
};

export const downloadDetailedReceiptPdf = (receipt: DetailedReceipt) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentW = pageW - margin * 2;
  let y = 44;

  const ensureSpace = (height: number) => {
    if (y + height <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  const line = (x1 = margin, x2 = pageW - margin) => {
    doc.setDrawColor(226, 232, 240);
    doc.line(x1, y, x2, y);
  };

  const rightText = (text: string, x: number, yy: number) => doc.text(text, x, yy, { align: 'right' });
  const issued = formatDateTime(receipt.issuedAt);
  const paid = receipt.paidAt ? formatDateTime(receipt.paidAt) : null;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(29, 78, 216);
  doc.text(COMPANY_BRANDING.brandName, margin, y);
  doc.setTextColor(15, 23, 42);
  rightText('Official Digital Receipt', pageW - margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(COMPANY_BRANDING.tagline, margin, y);
  rightText(receipt.receiptNumber, pageW - margin, y);
  y += 13;
  doc.text(COMPANY_BRANDING.address, margin, y);
  if (receipt.invoiceNumber) rightText(`Invoice ${receipt.invoiceNumber}`, pageW - margin, y);
  y += 13;
  doc.text(companyContactLine(), margin, y);
  y += 22;
  line();
  y += 18;

  const boxW = (contentW - 18) / 2;
  const drawBox = (x: number, title: string, rows: Array<[string, string]>) => {
    const startY = y;
    const h = 30 + rows.length * 16;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, boxW, h, 8, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(title.toUpperCase(), x + 12, startY + 18);
    doc.setFontSize(9);
    rows.forEach(([label, value], idx) => {
      const rowY = startY + 36 + idx * 16;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(label, x + 12, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const split = doc.splitTextToSize(String(value || '-'), boxW - 92);
      rightText(split[0] || '-', x + boxW - 12, rowY);
    });
    return h;
  };

  const detailsRows: Array<[string, string]> = [
    ['Date', issued.date],
    ['Time', issued.time],
    ['Served by', receipt.staffName || 'AutoSPF+'],
  ];
  if (paid) detailsRows.splice(2, 0, ['Paid', `${paid.date} ${paid.time}`]);
  if (receipt.bookingReference) detailsRows.push(['Booking ref', receipt.bookingReference]);
  if (receipt.orderNumber) detailsRows.push(['Order no.', receipt.orderNumber]);

  const customerRows: Array<[string, string]> = [
    ['Customer', receipt.customerName],
  ];
  if (receipt.customerPhone) customerRows.push(['Phone', receipt.customerPhone]);
  if (receipt.customerEmail) customerRows.push(['Email', receipt.customerEmail]);
  if (receipt.vehiclePlate) customerRows.push(['Plate', receipt.vehiclePlate]);
  if (receipt.vehicleInfo) customerRows.push(['Vehicle', receipt.vehicleInfo]);

  const leftH = drawBox(margin, 'Transaction Details', detailsRows);
  const rightH = drawBox(margin + boxW + 18, 'Customer & Vehicle', customerRows);
  y += Math.max(leftH, rightH) + 28;

  ensureSpace(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('SERVICES RENDERED', margin, y);
  rightText('QTY', pageW - margin - 178, y);
  rightText('UNIT', pageW - margin - 78, y);
  rightText('AMOUNT', pageW - margin, y);
  y += 8;
  line();
  y += 18;

  doc.setFontSize(10);
  receipt.lineItems.forEach((item) => {
    const nameLines = doc.splitTextToSize(item.name, contentW - 250);
    const rowH = Math.max(18, nameLines.length * 12 + 4);
    ensureSpace(rowH + 8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(nameLines, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${item.qty} x ${formatPdfMoney(item.unitPrice)}`, margin, y + rowH - 4);
    doc.setTextColor(15, 23, 42);
    rightText(String(item.qty), pageW - margin - 178, y);
    rightText(formatPdfMoney(item.unitPrice), pageW - margin - 78, y);
    rightText(formatPdfMoney(item.unitPrice * item.qty), pageW - margin, y);
    y += rowH + 8;
    line();
    y += 10;
  });

  const summaryRows: Array<[string, number, boolean?]> = [
    ['Subtotal', receipt.subtotal],
    ['Discount', receipt.discount, true],
    ['VAT / Tax', receipt.tax],
    ['Additional fees', receipt.additionalFees],
    ['Less reservation / downpayment (paid earlier)', receipt.downpayment, true],
  ].filter(([, value]) => value !== 0) as Array<[string, number, boolean?]>;

  ensureSpace(150);
  const summaryX = pageW - margin - 250;
  const amountColumnW = 200;
  const labelMaxW = pageW - margin - summaryX - amountColumnW - 8;

  const drawSummaryLabelValue = (label: string, valueText: string, opts: { fontSize?: number; labelRgb?: [number, number, number]; valueRgb?: [number, number, number] } = {}) => {
    const fs = opts.fontSize ?? 10;
    const labelRgb = opts.labelRgb ?? [71, 85, 105];
    const valueRgb = opts.valueRgb ?? [15, 23, 42];
    doc.setFontSize(fs);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...labelRgb);
    const labelLines = doc.splitTextToSize(String(label), Math.max(80, labelMaxW));
    doc.text(labelLines, summaryX, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...valueRgb);
    rightText(valueText, pageW - margin, y);
    const lineGap = fs >= 14 ? 17 : 13;
    y += Math.max(lineGap, labelLines.length * lineGap);
  };

  for (const [label, value, neg] of summaryRows) {
    const valueStr = `${neg ? '-' : ''}${formatPdfMoney(value)}`;
    drawSummaryLabelValue(label, valueStr);
  }
  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(summaryX, y, pageW - margin, y);
  y += 22;
  drawSummaryLabelValue('Balance collected', formatPdfMoney(receipt.total), {
    fontSize: 15,
    labelRgb: [29, 78, 216],
    valueRgb: [29, 78, 216],
  });
  if (receipt.balanceDue > 0) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Balance Due', summaryX, y);
    rightText(formatPdfMoney(receipt.balanceDue), pageW - margin, y);
    y += 18;
  }

  y += 12;
  line();
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Payment Method', margin, y);
  doc.text('Payment Status', margin + 190, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(receipt.paymentMethod, margin, y + 16);
  doc.text(receipt.paymentStatus, margin + 190, y + 16);
  y += 44;

  if (receipt.notes) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    const notes = doc.splitTextToSize(receipt.notes, contentW);
    doc.text(notes, margin, y);
    y += notes.length * 12 + 18;
  }

  ensureSpace(42);
  line();
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Thank you for choosing AutoSPF+.', pageW / 2, y, { align: 'center' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('This serves as your official digital receipt. Keep this copy for your records.', pageW / 2, y, { align: 'center' });

  doc.save(`AutoSPF-Receipt-${fileSafe(receipt.receiptNumber || 'receipt')}.pdf`);
};
