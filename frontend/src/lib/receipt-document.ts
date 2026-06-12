import { jsPDF } from 'jspdf';
import type { Booking } from '@/types';
import type { Transaction, PaymentMethod } from '@/lib/salesData';
import {
  formatPeso,
  formatTransactionStatusLabel,
  getPaymentMethodLabel,
} from '@/lib/salesData';
import { sanitizeVehiclePlate } from '@/lib/vehicle-display';
import { COMPANY_BRANDING } from '@/lib/company-branding';

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

const RECEIPT_LOGO_URL = '/images/autospf-logo-trimmed.png';

const loadReceiptLogo = () =>
  new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }

    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = RECEIPT_LOGO_URL;
  });

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
  const serviceTotal = Math.max(
    0,
    receipt.subtotal - receipt.discount + receipt.tax + receipt.additionalFees
  );
  const bookingReference = receipt.bookingReference || receipt.orderNumber || '—';
  const lineRows = receipt.lineItems.map((item) => {
    const lineTotal = item.unitPrice * item.qty;
    return `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${item.qty}</td>
        <td>${escapeHtml(formatPeso(item.unitPrice))}</td>
        <td>${escapeHtml(formatPeso(lineTotal))}</td>
      </tr>
    `;
  }).join('');

  const moneyValue = (value: number, negative = false) =>
    `${negative && value ? '−' : ''}${formatPeso(value)}`;
  const summaryRow = (label: string, value: number, negative = false, className = '') =>
    `<div class="summary-row ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(moneyValue(value, negative))}</strong></div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f7fb; color: #172033; font-family: Inter, Arial, sans-serif; }
      .page { width: 794px; min-height: 1123px; margin: 24px auto; padding: 40px 44px 32px; background: #fff; box-shadow: 0 24px 70px -42px rgba(15, 23, 42, .35); }
      .top { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(230px, .75fr); gap: 34px; align-items: start; padding-bottom: 24px; border-bottom: 1px solid #dfe5ec; }
      .brand-lockup { display: flex; align-items: flex-start; gap: 16px; min-width: 0; }
      .logo-plate { display: flex; width: 116px; height: 70px; flex: 0 0 116px; align-items: center; justify-content: center; padding: 9px 10px; border-radius: 12px; background: #13243d; }
      .logo-plate img { display: block; width: 100%; height: auto; }
      .brand h1 { margin: 0; color: #172033; font-size: 20px; font-weight: 800; letter-spacing: -.025em; }
      .brand .service-type { margin: 3px 0 8px; color: #3569b8; font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
      .brand p { margin: 2px 0 0; color: #667085; font-size: 10.5px; line-height: 1.45; }
      .receipt-heading { text-align: right; }
      .receipt-heading .eyebrow { margin: 0; color: #3569b8; font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
      .receipt-heading h2 { margin: 4px 0 14px; color: #172033; font-size: 23px; letter-spacing: -.025em; }
      .receipt-meta { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 5px 12px; align-items: baseline; font-size: 10.5px; }
      .receipt-meta span { color: #7b8797; }
      .receipt-meta strong { overflow-wrap: anywhere; color: #25334a; text-align: right; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 22px; }
      .box { border: 1px solid #e1e6ed; border-radius: 10px; background: #fcfdff; overflow: hidden; }
      .box-header { margin: 0; padding: 9px 13px; border-bottom: 1px solid #e7ebf0; background: #f5f8fc; color: #3569b8; font-size: 9px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
      .box-body { padding: 9px 13px 10px; }
      .line { display: grid; grid-template-columns: minmax(90px, .7fr) minmax(0, 1.3fr); gap: 14px; align-items: baseline; padding: 4px 0; font-size: 10.5px; }
      .line span:first-child { color: #7a8696; }
      .line strong { overflow-wrap: anywhere; color: #25334a; text-align: right; }
      .section-title { margin: 24px 0 8px; color: #344054; font-size: 10px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
      table { width: 100%; border: 1px solid #dfe5ec; border-collapse: separate; border-spacing: 0; border-radius: 10px; overflow: hidden; font-size: 11px; }
      th { background: #f3f6fa; text-align: right; padding: 10px 11px; color: #667085; border-bottom: 1px solid #dfe5ec; font-size: 9px; text-transform: uppercase; letter-spacing: .07em; }
      th:first-child, td:first-child { text-align: left; }
      th:first-child { width: 56%; }
      td { text-align: right; padding: 11px; border-bottom: 1px solid #edf0f4; color: #344054; vertical-align: top; }
      tbody tr:last-child td { border-bottom: 0; }
      td strong { color: #25334a; font-weight: 700; }
      .lower-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; margin-top: 22px; }
      .payment { border: 1px solid #e1e6ed; border-radius: 10px; background: #fcfdff; overflow: hidden; }
      .payment-grid { display: grid; grid-template-columns: 1fr 1fr; }
      .payment-item { padding: 12px 13px; }
      .payment-item + .payment-item { border-left: 1px solid #e7ebf0; }
      .payment-item span { display: block; margin-bottom: 4px; color: #7b8797; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      .payment-item strong { color: #25334a; font-size: 12px; }
      .status { display: inline-flex; padding: 4px 8px; border: 1px solid #bfd3ef; border-radius: 999px; background: #edf5ff; color: #285eaa !important; font-size: 10px !important; text-transform: capitalize; }
      .summary { border: 1px solid #dfe5ec; border-radius: 10px; padding: 11px 14px 13px; background: #fff; }
      .summary .section-title { margin: 0 0 7px; }
      .summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 5px 0; color: #526074; font-size: 10.5px; }
      .summary-row > span:first-child { flex: 1; min-width: 0; padding-right: 8px; line-height: 1.4; word-break: break-word; }
      .summary-row > strong { flex-shrink: 0; white-space: nowrap; text-align: right; font-weight: 700; }
      .summary-row.service-total { margin-top: 4px; padding-top: 8px; border-top: 1px solid #dfe5ec; color: #25334a; font-weight: 700; }
      .summary-row.collected { margin: 8px -6px -5px; padding: 11px 8px; border-radius: 8px; background: #edf5ff; color: #285eaa; font-size: 13px; font-weight: 800; }
      .notes { margin-top: 14px; padding: 11px 13px; border-left: 3px solid #9bbbe5; background: #f7f9fc; color: #526074; font-size: 10.5px; line-height: 1.5; }
      .footer { margin-top: 28px; padding-top: 17px; border-top: 1px solid #dfe5ec; text-align: center; color: #667085; font-size: 10px; line-height: 1.55; }
      .footer strong { display: block; margin-bottom: 2px; color: #25334a; font-size: 11px; }
      @media print {
        @page { size: A4; margin: 12mm; }
        body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="top">
        <div class="brand-lockup">
          <div class="logo-plate">
            <img data-receipt-logo src="${RECEIPT_LOGO_URL}" alt="${COMPANY_BRANDING.brandName} logo" />
          </div>
          <div class="brand">
            <h1>${COMPANY_BRANDING.brandName}</h1>
            <p class="service-type">${COMPANY_BRANDING.category}</p>
            <p>${COMPANY_BRANDING.tagline}</p>
            <p>${COMPANY_BRANDING.address}</p>
            <p>${COMPANY_BRANDING.phone} · ${COMPANY_BRANDING.email}</p>
          </div>
        </div>
        <div class="receipt-heading">
          <p class="eyebrow">Payment Record</p>
          <h2>Official Receipt</h2>
          <div class="receipt-meta">
            <span>Receipt Number</span><strong>${escapeHtml(receipt.receiptNumber)}</strong>
            <span>Booking Reference</span><strong>${escapeHtml(bookingReference)}</strong>
            <span>Date Issued</span><strong>${escapeHtml(issued.date)}</strong>
          </div>
        </div>
      </section>

      <section class="grid">
        <div class="box">
          <p class="box-header">Transaction Details</p>
          <div class="box-body">
            <div class="line"><span>Date Issued</span><strong>${escapeHtml(issued.date)}</strong></div>
            <div class="line"><span>Time Issued</span><strong>${escapeHtml(issued.time)}</strong></div>
            ${paid ? `<div class="line"><span>Payment Date</span><strong>${escapeHtml(`${paid.date} ${paid.time}`)}</strong></div>` : ''}
            ${receipt.orderNumber ? `<div class="line"><span>Order Number</span><strong>${escapeHtml(receipt.orderNumber)}</strong></div>` : ''}
            <div class="line"><span>Served By</span><strong>${escapeHtml(receipt.staffName || COMPANY_BRANDING.brandName)}</strong></div>
          </div>
        </div>
        <div class="box">
          <p class="box-header">Customer & Vehicle</p>
          <div class="box-body">
            <div class="line"><span>Customer</span><strong>${escapeHtml(receipt.customerName)}</strong></div>
            ${receipt.customerPhone ? `<div class="line"><span>Phone</span><strong>${escapeHtml(receipt.customerPhone)}</strong></div>` : ''}
            ${receipt.customerEmail ? `<div class="line"><span>Email</span><strong>${escapeHtml(receipt.customerEmail)}</strong></div>` : ''}
            ${receipt.vehiclePlate ? `<div class="line"><span>Plate Number</span><strong>${escapeHtml(receipt.vehiclePlate)}</strong></div>` : ''}
            ${receipt.vehicleInfo ? `<div class="line"><span>Vehicle</span><strong>${escapeHtml(receipt.vehicleInfo)}</strong></div>` : ''}
          </div>
        </div>
      </section>

      <p class="section-title">Services & Charges</p>
      <table>
        <thead>
          <tr><th>Service Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr>
        </thead>
        <tbody>${lineRows}</tbody>
      </table>

      <section class="lower-grid">
        <div>
          <section class="payment">
            <p class="box-header">Payment Details</p>
            <div class="payment-grid">
              <div class="payment-item">
                <span>Payment Method</span>
                <strong>${escapeHtml(receipt.paymentMethod)}</strong>
              </div>
              <div class="payment-item">
                <span>Payment Status</span>
                <strong class="status">${escapeHtml(receipt.paymentStatus)}</strong>
              </div>
            </div>
          </section>
          ${receipt.notes ? `<section class="notes"><strong>Notes:</strong> ${escapeHtml(receipt.notes)}</section>` : ''}
        </div>
        <section class="summary">
          <p class="section-title">Billing Summary</p>
          ${summaryRow('Subtotal', receipt.subtotal)}
          ${summaryRow('Discount', receipt.discount, true)}
          ${summaryRow('VAT / Tax', receipt.tax)}
          ${receipt.additionalFees ? summaryRow('Additional Fees', receipt.additionalFees) : ''}
          ${summaryRow('Service Total', serviceTotal, false, 'service-total')}
          ${summaryRow('Less Reservation / Downpayment', receipt.downpayment, true)}
          ${summaryRow('Amount Collected Today', receipt.total, false, 'collected')}
          ${receipt.balanceDue > 0 ? summaryRow('Remaining Balance', receipt.balanceDue) : ''}
        </section>
      </section>

      <section class="footer">
        <strong>Thank you for trusting AutoSPF+ with your vehicle.</strong>
        This document serves as an official digital receipt issued by ${COMPANY_BRANDING.brandName}. Please keep it for your records.
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
  const logo = win.document.querySelector<HTMLImageElement>('[data-receipt-logo]');
  let printQueued = false;
  const print = () => {
    if (printQueued) return;
    printQueued = true;
    setTimeout(() => win.print(), 120);
  };
  if (!logo || logo.complete) {
    print();
    return;
  }
  logo.addEventListener('load', print, { once: true });
  logo.addEventListener('error', print, { once: true });
  setTimeout(print, 800);
};

export const downloadDetailedReceiptPdf = async (receipt: DetailedReceipt) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;
  let y = 42;
  const logo = await loadReceiptLogo();
  const issued = formatDateTime(receipt.issuedAt);
  const paid = receipt.paidAt ? formatDateTime(receipt.paidAt) : null;
  const serviceTotal = Math.max(
    0,
    receipt.subtotal - receipt.discount + receipt.tax + receipt.additionalFees
  );
  const bookingReference = receipt.bookingReference || receipt.orderNumber || '-';
  const moneyValue = (value: number, negative = false) =>
    `${negative && value ? '-' : ''}${formatPdfMoney(value)}`;
  const rightText = (text: string, x: number, yy: number) =>
    doc.text(text, x, yy, { align: 'right' });

  const ensureSpace = (height: number) => {
    if (y + height <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };

  const divider = (x1 = margin, x2 = pageW - margin) => {
    doc.setDrawColor(223, 229, 236);
    doc.line(x1, y, x2, y);
  };

  doc.setFillColor(19, 36, 61);
  doc.roundedRect(margin, y, 112, 66, 8, 8, 'F');
  if (logo) {
    doc.addImage(logo, 'PNG', margin + 9, y + 8, 94, 51);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(COMPANY_BRANDING.brandName, margin + 56, y + 38, { align: 'center' });
  }

  const brandX = margin + 126;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(23, 32, 51);
  doc.text(COMPANY_BRANDING.brandName, brandX, y + 13);
  doc.setFontSize(8);
  doc.setTextColor(53, 105, 184);
  doc.text(COMPANY_BRANDING.category.toUpperCase(), brandX, y + 27);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(102, 112, 133);
  doc.text(COMPANY_BRANDING.tagline, brandX, y + 40);
  doc.text(COMPANY_BRANDING.address, brandX, y + 51);
  doc.text(`${COMPANY_BRANDING.phone}  |  ${COMPANY_BRANDING.email}`, brandX, y + 62);

  const metaRight = pageW - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(53, 105, 184);
  rightText('PAYMENT RECORD', metaRight, y + 8);
  doc.setFontSize(17);
  doc.setTextColor(23, 32, 51);
  rightText('Official Receipt', metaRight, y + 25);
  doc.setFontSize(7);
  doc.setTextColor(123, 135, 151);
  rightText('RECEIPT NUMBER', metaRight, y + 39);
  doc.setFontSize(8.5);
  doc.setTextColor(37, 51, 74);
  rightText(doc.splitTextToSize(receipt.receiptNumber, 126)[0] || '-', metaRight, y + 49);
  doc.setFontSize(7);
  doc.setTextColor(123, 135, 151);
  rightText('BOOKING REFERENCE', metaRight, y + 61);
  doc.setFontSize(8.5);
  doc.setTextColor(37, 51, 74);
  rightText(doc.splitTextToSize(bookingReference, 126)[0] || '-', metaRight, y + 71);
  doc.setFontSize(7);
  doc.setTextColor(123, 135, 151);
  rightText('DATE ISSUED', metaRight, y + 83);
  doc.setFontSize(8.5);
  doc.setTextColor(37, 51, 74);
  rightText(issued.date || '-', metaRight, y + 93);

  y += 106;
  divider();
  y += 18;

  const boxW = (contentW - 14) / 2;
  const drawBox = (x: number, title: string, rows: Array<[string, string]>) => {
    const startY = y;
    const h = 29 + rows.length * 15;
    doc.setFillColor(252, 253, 255);
    doc.setDrawColor(225, 230, 237);
    doc.roundedRect(x, startY, boxW, h, 7, 7, 'FD');
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(x, startY, boxW, 26, 7, 7, 'F');
    doc.rect(x, startY + 13, boxW, 13, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(53, 105, 184);
    doc.text(title.toUpperCase(), x + 12, startY + 17);
    rows.forEach(([label, value], index) => {
      const rowY = startY + 39 + index * 15;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(123, 135, 151);
      doc.text(label, x + 12, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 51, 74);
      const split = doc.splitTextToSize(String(value || '-'), boxW - 104);
      rightText(split[0] || '-', x + boxW - 12, rowY);
    });
    return h;
  };

  const detailsRows: Array<[string, string]> = [
    ['Date Issued', issued.date],
    ['Time Issued', issued.time],
    ['Served By', receipt.staffName || COMPANY_BRANDING.brandName],
  ];
  if (paid) detailsRows.splice(2, 0, ['Payment Date', `${paid.date} ${paid.time}`]);
  if (receipt.orderNumber) detailsRows.push(['Order Number', receipt.orderNumber]);

  const customerRows: Array<[string, string]> = [['Customer', receipt.customerName]];
  if (receipt.customerPhone) customerRows.push(['Phone', receipt.customerPhone]);
  if (receipt.customerEmail) customerRows.push(['Email', receipt.customerEmail]);
  if (receipt.vehiclePlate) customerRows.push(['Plate Number', receipt.vehiclePlate]);
  if (receipt.vehicleInfo) customerRows.push(['Vehicle', receipt.vehicleInfo]);

  const leftH = drawBox(margin, 'Transaction Details', detailsRows);
  const rightH = drawBox(margin + boxW + 14, 'Customer & Vehicle', customerRows);
  y += Math.max(leftH, rightH) + 24;

  ensureSpace(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(52, 64, 84);
  doc.text('SERVICES & CHARGES', margin, y);
  y += 11;

  const tableHeaderY = y;
  doc.setFillColor(243, 246, 250);
  doc.setDrawColor(223, 229, 236);
  doc.roundedRect(margin, tableHeaderY, contentW, 28, 7, 7, 'FD');
  doc.setFillColor(243, 246, 250);
  doc.rect(margin, tableHeaderY + 14, contentW, 14, 'F');
  doc.setFontSize(7.5);
  doc.setTextColor(102, 112, 133);
  doc.text('SERVICE DESCRIPTION', margin + 11, tableHeaderY + 18);
  rightText('QTY', pageW - margin - 178, tableHeaderY + 18);
  rightText('UNIT PRICE', pageW - margin - 78, tableHeaderY + 18);
  rightText('AMOUNT', pageW - margin - 11, tableHeaderY + 18);
  y += 38;

  doc.setFontSize(9);
  receipt.lineItems.forEach((item) => {
    const nameLines = doc.splitTextToSize(item.name, contentW - 245);
    const rowH = Math.max(20, nameLines.length * 11 + 6);
    ensureSpace(rowH + 8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 51, 74);
    doc.text(nameLines, margin + 11, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(52, 64, 84);
    rightText(String(item.qty), pageW - margin - 178, y);
    rightText(formatPdfMoney(item.unitPrice), pageW - margin - 78, y);
    doc.setFont('helvetica', 'bold');
    rightText(formatPdfMoney(item.unitPrice * item.qty), pageW - margin - 11, y);
    y += rowH + 8;
    doc.setDrawColor(237, 240, 244);
    doc.line(margin, y, pageW - margin, y);
    y += 10;
  });

  const summaryRows: Array<[string, number, boolean?]> = [
    ['Subtotal', receipt.subtotal],
    ['Discount', receipt.discount, true],
    ['VAT / Tax', receipt.tax],
    ...(receipt.additionalFees
      ? [['Additional Fees', receipt.additionalFees] as [string, number, boolean?]]
      : []),
    ['Service Total', serviceTotal],
    ['Less Reservation / Downpayment', receipt.downpayment, true],
  ];
  const summaryW = 284;
  const summaryX = pageW - margin - summaryW;
  const paymentW = contentW - summaryW - 18;
  const summaryH = 47 + summaryRows.length * 15 + 40 + (receipt.balanceDue > 0 ? 16 : 0);
  const paymentH = 82;
  const lowerH = Math.max(summaryH, paymentH);
  ensureSpace(lowerH + 28);
  const lowerY = y + 4;

  doc.setFillColor(252, 253, 255);
  doc.setDrawColor(225, 230, 237);
  doc.roundedRect(margin, lowerY, paymentW, paymentH, 7, 7, 'FD');
  doc.setFillColor(245, 248, 252);
  doc.roundedRect(margin, lowerY, paymentW, 26, 7, 7, 'F');
  doc.rect(margin, lowerY + 13, paymentW, 13, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(53, 105, 184);
  doc.text('PAYMENT DETAILS', margin + 12, lowerY + 17);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(123, 135, 151);
  doc.text('PAYMENT METHOD', margin + 12, lowerY + 43);
  doc.text('PAYMENT STATUS', margin + paymentW / 2 + 5, lowerY + 43);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(37, 51, 74);
  doc.text(receipt.paymentMethod, margin + 12, lowerY + 59);
  doc.setTextColor(40, 94, 170);
  doc.text(receipt.paymentStatus, margin + paymentW / 2 + 5, lowerY + 59);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(223, 229, 236);
  doc.roundedRect(summaryX, lowerY, summaryW, summaryH, 7, 7, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(52, 64, 84);
  doc.text('BILLING SUMMARY', summaryX + 12, lowerY + 18);
  let summaryY = lowerY + 38;
  summaryRows.forEach(([label, value, negative]) => {
    const isServiceTotal = label === 'Service Total';
    if (isServiceTotal) {
      doc.setDrawColor(223, 229, 236);
      doc.line(summaryX + 12, summaryY - 8, summaryX + summaryW - 12, summaryY - 8);
    }
    doc.setFont('helvetica', isServiceTotal ? 'bold' : 'normal');
    doc.setFontSize(8);
    doc.setTextColor(isServiceTotal ? 37 : 82, isServiceTotal ? 51 : 96, isServiceTotal ? 74 : 116);
    doc.text(label, summaryX + 12, summaryY);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 51, 74);
    rightText(moneyValue(value, negative), summaryX + summaryW - 12, summaryY);
    summaryY += 15;
  });

  doc.setFillColor(237, 245, 255);
  doc.roundedRect(summaryX + 7, summaryY - 3, summaryW - 14, 31, 6, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 94, 170);
  doc.text('Amount Collected Today', summaryX + 15, summaryY + 16);
  rightText(formatPdfMoney(receipt.total), summaryX + summaryW - 15, summaryY + 16);
  summaryY += 40;
  if (receipt.balanceDue > 0) {
    doc.setFontSize(8);
    doc.setTextColor(82, 96, 116);
    doc.text('Remaining Balance', summaryX + 12, summaryY);
    doc.setTextColor(37, 51, 74);
    rightText(formatPdfMoney(receipt.balanceDue), summaryX + summaryW - 12, summaryY);
  }
  y = lowerY + lowerH + 20;

  if (receipt.notes) {
    ensureSpace(50);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(52, 64, 84);
    doc.text('NOTES', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(82, 96, 116);
    const notes = doc.splitTextToSize(receipt.notes, contentW);
    doc.text(notes, margin, y);
    y += notes.length * 12 + 18;
  }

  ensureSpace(42);
  divider();
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(37, 51, 74);
  doc.text('Thank you for trusting AutoSPF+ with your vehicle.', pageW / 2, y, { align: 'center' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(102, 112, 133);
  doc.text(
    'This document serves as an official digital receipt issued by AutoSPF+. Please keep it for your records.',
    pageW / 2,
    y,
    { align: 'center' }
  );

  doc.save(`AutoSPF-Receipt-${fileSafe(receipt.receiptNumber || 'receipt')}.pdf`);
};
