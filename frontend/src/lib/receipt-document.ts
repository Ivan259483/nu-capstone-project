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
  serviceTotal?: number;
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

const firstFiniteNumber = (...values: unknown[]): number | undefined => {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return undefined;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};

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

const isPaidReceiptStatus = (status?: string) =>
  ['paid', 'completed', 'succeeded', 'success'].includes(
    String(status || '').trim().toLowerCase()
  );

const formatReceiptPaymentStatus = (status?: string) => {
  if (isPaidReceiptStatus(status)) return 'Paid';
  const value = String(status || 'pending').trim();
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const bookingReceiptSources = (booking: Booking) => {
  const raw = booking as Booking & Record<string, any>;
  const invoiceRecord = asRecord(raw.invoiceRecord);
  const snapshot = asRecord(
    invoiceRecord.snapshot ??
    raw.invoiceSnapshot ??
    raw.receiptSnapshot
  );
  const billing = asRecord(raw.billing ?? snapshot.billing);
  const computed = asRecord(snapshot.computed ?? billing.computed);
  const payment = asRecord(snapshot.payment ?? raw.payment ?? raw.latestPayment);

  return { raw, snapshot, billing, computed, payment };
};

const bookingLineItems = (
  booking: Booking,
  sources = bookingReceiptSources(booking)
): DetailedReceiptLine[] => {
  const sourceItems =
    (Array.isArray(sources.snapshot.lineItems) && sources.snapshot.lineItems) ||
    (Array.isArray(sources.billing.lineItems) && sources.billing.lineItems) ||
    booking.items ||
    [];
  const items = Array.isArray(sourceItems) ? sourceItems : [];
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
        qty: Math.max(1, safeNumber(item?.quantity ?? item?.qty) || 1),
        unitPrice: safeNumber(
          item?.unitPrice ??
          item?.price ??
          product?.basePrice ??
          booking.totalPrice ??
          booking.totalAmount
        ),
      };
    });
  }

  return [{
    name: booking.serviceName || booking.serviceType || 'Service',
    qty: 1,
    unitPrice: safeNumber(booking.totalPrice || booking.totalAmount),
  }];
};

const resolveBookingFinancials = (
  booking: Booking,
  lineSubtotal: number,
  sources = bookingReceiptSources(booking)
) => {
  const { raw, snapshot, billing, computed, payment } = sources;
  const discount = Math.max(0, firstFiniteNumber(
    computed.discountTotal,
    payment.discountAmount,
    snapshot.discountAmount,
    billing.discountTotal,
    raw.discountAmount
  ) ?? 0);
  const tax = Math.max(0, firstFiniteNumber(
    computed.taxVatTotal,
    payment.taxVatAmount,
    snapshot.taxVatAmount,
    billing.taxVatAmount,
    raw.taxVatAmount
  ) ?? 0);
  const additionalFees = Math.max(0, firstFiniteNumber(
    computed.additionalFeesTotal,
    payment.additionalFees,
    snapshot.additionalFees,
    billing.additionalFees,
    raw.additionalFees
  ) ?? 0);
  const detailedSubtotal = firstFiniteNumber(
    computed.subtotal,
    payment.subtotal,
    snapshot.subtotal,
    raw.subtotal
  );
  const detailedServiceTotal = firstFiniteNumber(
    computed.grandTotal,
    payment.grandTotal,
    snapshot.grandTotal,
    raw.grandTotal
  );
  const bookingTotal = Math.max(0, firstFiniteNumber(
    raw.totalPrice,
    raw.totalAmount
  ) ?? lineSubtotal);
  const hasDetailedBreakdown =
    detailedSubtotal !== undefined ||
    detailedServiceTotal !== undefined ||
    discount > 0 ||
    tax > 0 ||
    additionalFees > 0;

  let subtotal = Math.max(
    0,
    hasDetailedBreakdown ? detailedSubtotal ?? lineSubtotal : bookingTotal
  );
  const serviceTotal = Math.max(
    0,
    detailedServiceTotal ??
      (hasDetailedBreakdown
        ? subtotal - discount + tax + additionalFees
        : bookingTotal)
  );
  const calculatedServiceTotal = Math.max(
    0,
    subtotal - discount + tax + additionalFees
  );

  if (Math.abs(calculatedServiceTotal - serviceTotal) > 0.01) {
    subtotal = Math.max(0, serviceTotal + discount - tax - additionalFees);
  }

  const downpayment = Math.min(
    serviceTotal,
    Math.max(0, firstFiniteNumber(
      snapshot.downpayment,
      billing.downpayment,
      payment.downpayment,
      raw.downPaymentAmount
    ) ?? 0)
  );
  const amountDueAfterDownpayment = Math.max(0, serviceTotal - downpayment);
  const paymentStatus = String(
    payment.status ??
    raw.paymentStatus ??
    (
      raw.status === 'completed' ||
      raw.status === 'released' ||
      raw.status === 'paid'
        ? 'paid'
        : 'pending'
    )
  );
  const recordedAmountCollected = Math.max(0, firstFiniteNumber(
    payment.amountCollected,
    payment.amountPaid,
    raw.finalPaymentAmount
  ) ?? 0);
  const total = recordedAmountCollected > 0
    ? Math.min(recordedAmountCollected, amountDueAfterDownpayment)
    : isPaidReceiptStatus(paymentStatus)
      ? amountDueAfterDownpayment
      : 0;

  return {
    subtotal,
    discount,
    tax,
    additionalFees,
    downpayment,
    serviceTotal,
    total,
    balanceDue: Math.max(0, amountDueAfterDownpayment - total),
    paymentStatus,
    hasDetailedBreakdown,
  };
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
    serviceTotal: safeNumber(txn.total),
    total: safeNumber(txn.total),
    balanceDue: txn.status === 'completed' ? 0 : safeNumber(txn.total),
    paymentMethod: normalizePaymentMethod(txn.paymentMethod),
    paymentStatus,
    notes: txn.notes,
  };
};

export const receiptFromBooking = (booking: Booking): DetailedReceipt => {
  const sources = bookingReceiptSources(booking);
  let lineItems = bookingLineItems(booking, sources);
  const lineSubtotal = lineItems.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const financials = resolveBookingFinancials(booking, lineSubtotal, sources);
  if (
    !financials.hasDetailedBreakdown &&
    lineItems.length === 1 &&
    Math.abs(lineSubtotal - financials.subtotal) > 0.01
  ) {
    lineItems = [{
      ...lineItems[0],
      unitPrice: financials.subtotal / lineItems[0].qty,
    }];
  }
  const snapshotCustomer = asRecord(sources.snapshot.customer);
  const snapshotVehicle = asRecord(sources.snapshot.vehicle);
  const vehicleInfo =
    snapshotVehicle.description ||
    snapshotVehicle.vehicleInfo ||
    booking.vehicleInfo ||
    [
      snapshotVehicle.year ?? booking.vehicleYear,
      snapshotVehicle.make ?? booking.vehicleMake,
      snapshotVehicle.model ?? booking.vehicleModel,
    ].filter(Boolean).join(' ');
  const paymentStaff = asRecord(sources.payment.staff);

  return {
    receiptNumber:
      sources.snapshot.invoiceNumber ||
      booking.invoiceId ||
      booking.bookingReference ||
      booking.orderNumber ||
      booking.id,
    invoiceNumber: sources.snapshot.invoiceNumber || booking.invoiceId,
    orderNumber: sources.snapshot.orderNumber || booking.orderNumber,
    bookingReference: sources.snapshot.bookingReference || booking.bookingReference,
    issuedAt:
      sources.snapshot.issuedAt ||
      sources.snapshot.paidAt ||
      booking.paidAt ||
      booking.updatedAt ||
      booking.createdAt ||
      booking.date ||
      new Date().toISOString(),
    paidAt: sources.snapshot.paidAt || booking.paidAt,
    staffName:
      paymentStaff.name ||
      sources.snapshot.staffName ||
      (typeof booking.assignedDetailer === 'object' ? booking.assignedDetailer?.name : undefined),
    customerName:
      snapshotCustomer.name ||
      booking.customerName ||
      booking.customer?.name ||
      'Customer',
    customerPhone:
      snapshotCustomer.phone ||
      booking.customerPhone ||
      booking.customer?.phone,
    customerEmail: snapshotCustomer.email || booking.customer?.email,
    vehiclePlate: sanitizeVehiclePlate(
      snapshotVehicle.plate ||
      snapshotVehicle.plateNumber ||
      booking.vehiclePlate ||
      ''
    ),
    vehicleInfo,
    lineItems,
    subtotal: financials.subtotal,
    discount: financials.discount,
    tax: financials.tax,
    additionalFees: financials.additionalFees,
    downpayment: financials.downpayment,
    serviceTotal: financials.serviceTotal,
    total: financials.total,
    balanceDue: financials.balanceDue,
    paymentMethod: normalizePaymentMethod(
      sources.payment.method ||
      booking.paymentMethod ||
      booking.warrantyAndReceipt?.paymentMethod
    ),
    paymentStatus: financials.paymentStatus,
    notes: booking.notes,
  };
};

export const buildDetailedReceiptHtml = (receipt: DetailedReceipt) => {
  const issued = formatDateTime(receipt.issuedAt);
  const paid = receipt.paidAt ? formatDateTime(receipt.paidAt) : null;
  const paymentStatus = formatReceiptPaymentStatus(receipt.paymentStatus);
  const paidStatus = isPaidReceiptStatus(receipt.paymentStatus);
  const serviceTotal = Math.max(
    0,
    receipt.serviceTotal ??
      (receipt.subtotal - receipt.discount + receipt.tax + receipt.additionalFees)
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
      body { margin: 0; background: #f3f6fa; color: #172033; font-family: Inter, "Segoe UI", Arial, sans-serif; font-variant-numeric: tabular-nums; }
      .page { display: flex; width: 794px; min-height: 1123px; margin: 24px auto; padding: 38px 42px 30px; flex-direction: column; background: #fff; box-shadow: 0 24px 70px -42px rgba(15, 23, 42, .35); }
      .top { display: grid; grid-template-columns: minmax(0, 1.38fr) minmax(238px, .82fr); gap: 30px; align-items: start; padding-bottom: 25px; border-bottom: 1px solid #d9e0e8; }
      .brand-lockup { display: flex; align-items: center; gap: 18px; min-width: 0; }
      .logo-plate { display: flex; width: 126px; height: 76px; flex: 0 0 126px; align-items: center; justify-content: center; padding: 8px 10px; border: 1px solid #243c5c; border-radius: 10px; background: #13243d; }
      .logo-plate img { display: block; width: 100%; height: 100%; object-fit: contain; }
      .brand { min-width: 0; }
      .brand h1 { margin: 0; color: #13243d; font-size: 21px; font-weight: 800; letter-spacing: -.025em; }
      .brand .service-type { margin: 3px 0 8px; color: #3569b8; font-size: 9.5px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
      .brand p { margin: 2px 0 0; color: #667085; font-size: 10px; line-height: 1.48; }
      .receipt-heading { position: relative; padding-left: 18px; text-align: right; }
      .receipt-heading::before { position: absolute; inset: 1px auto 1px 0; width: 3px; border-radius: 99px; background: #f97316; content: ""; }
      .receipt-heading .eyebrow { margin: 0; color: #3569b8; font-size: 9px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
      .receipt-heading h2 { margin: 4px 0 2px; color: #13243d; font-size: 24px; letter-spacing: -.03em; }
      .receipt-heading .digital-copy { margin: 0 0 14px; color: #7b8797; font-size: 8.5px; font-weight: 800; letter-spacing: .15em; text-transform: uppercase; }
      .receipt-meta { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 14px; align-items: baseline; font-size: 10px; }
      .receipt-meta span { color: #7b8797; }
      .receipt-meta strong { overflow-wrap: anywhere; color: #25334a; text-align: right; font-weight: 750; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 22px; }
      .box { border: 1px solid #dce3eb; border-radius: 9px; background: #fbfcfe; overflow: hidden; }
      .box-header { margin: 0; padding: 9px 13px; border-bottom: 1px solid #dfe6ee; background: #eef3f8; color: #2c5f9f; font-size: 9px; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
      .box-body { padding: 10px 13px 11px; }
      .line { display: grid; grid-template-columns: minmax(92px, .72fr) minmax(0, 1.28fr); gap: 14px; align-items: baseline; min-height: 23px; padding: 4px 0; font-size: 10.5px; }
      .line span:first-child { color: #7a8696; }
      .line strong { overflow-wrap: anywhere; color: #25334a; text-align: right; font-weight: 700; }
      .section-title { margin: 25px 0 9px; color: #344054; font-size: 9.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
      table { width: 100%; border: 1px solid #d8e0e9; border-collapse: separate; border-spacing: 0; border-radius: 9px; overflow: hidden; font-size: 11px; font-variant-numeric: tabular-nums; }
      th { background: #eaf0f6; text-align: right; padding: 11px 12px; color: #475467; border-bottom: 1px solid #d8e0e9; font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .075em; }
      th:first-child, td:first-child { text-align: left; }
      th:first-child { width: 55%; }
      th:nth-child(2) { width: 9%; }
      th:nth-child(3), th:nth-child(4) { width: 18%; }
      td { text-align: right; padding: 13px 12px; border-bottom: 1px solid #e9edf2; color: #344054; vertical-align: top; }
      tbody tr:last-child td { border-bottom: 0; }
      td strong { color: #25334a; font-weight: 750; line-height: 1.4; }
      .lower-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; margin-top: 22px; }
      .payment { border: 1px solid #dce3eb; border-radius: 9px; background: #fbfcfe; overflow: hidden; }
      .payment-grid { display: grid; grid-template-columns: 1fr 1fr; }
      .payment-item { min-height: 70px; padding: 13px 14px; }
      .payment-item + .payment-item { border-left: 1px solid #dfe6ee; }
      .payment-item span { display: block; margin-bottom: 6px; color: #7b8797; font-size: 8.5px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
      .payment-item strong { color: #25334a; font-size: 12px; font-weight: 750; }
      .status { display: inline-flex; align-items: center; padding: 4px 9px; border: 1px solid #bfd3ef; border-radius: 999px; background: #edf5ff; color: #285eaa !important; font-size: 9.5px !important; font-weight: 800 !important; letter-spacing: .06em; text-transform: uppercase; }
      .status.paid { border-color: #a7e3c5; background: #ecfdf3; color: #087a55 !important; }
      .summary { border: 1px solid #d8e0e9; border-radius: 9px; padding: 12px 14px 14px; background: #fff; }
      .summary .section-title { margin: 0 0 9px; }
      .summary-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 5.5px 0; color: #526074; font-size: 10.5px; }
      .summary-row > span:first-child { flex: 1; min-width: 0; padding-right: 8px; line-height: 1.4; word-break: break-word; }
      .summary-row > strong { flex-shrink: 0; white-space: nowrap; text-align: right; font-weight: 700; }
      .summary-row.service-total { margin-top: 4px; padding-top: 9px; border-top: 1px solid #d8e0e9; color: #25334a; font-weight: 750; }
      .summary-row.collected { margin: 9px -6px -6px; padding: 12px 9px; border-left: 3px solid #f97316; border-radius: 7px; background: #edf5ff; color: #214f8f; font-size: 12.5px; font-weight: 800; }
      .notes { margin-top: 14px; padding: 11px 13px; border-left: 3px solid #9bbbe5; background: #f7f9fc; color: #526074; font-size: 10.5px; line-height: 1.5; }
      .footer { margin-top: 24px; padding-top: 18px; border-top: 1px solid #d8e0e9; text-align: center; color: #667085; font-size: 9.8px; line-height: 1.6; }
      .footer strong { display: block; margin-bottom: 3px; color: #25334a; font-size: 11px; }
      .footer .system-note { display: block; margin-top: 5px; color: #98a2b3; font-size: 8.5px; letter-spacing: .04em; }
      @media print {
        @page { size: A4; margin: 12mm; }
        body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .page { width: auto; min-height: 273mm; margin: 0; padding: 0; box-shadow: none; }
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
          <p class="digital-copy">Digital Copy</p>
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
                <strong class="status${paidStatus ? ' paid' : ''}">${escapeHtml(paymentStatus)}</strong>
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
          ${receipt.downpayment ? summaryRow('Less Reservation Fee / Downpayment', receipt.downpayment, true) : ''}
          ${summaryRow('Amount Collected Today', receipt.total, false, 'collected')}
          ${receipt.balanceDue > 0 ? summaryRow('Remaining Balance', receipt.balanceDue) : ''}
        </section>
      </section>

      <section class="footer">
        <strong>Thank you for trusting AutoSPF+ with your vehicle.</strong>
        This digital receipt confirms your payment record. Please keep this copy for your records.
        <span class="system-note">Generated by AutoSPF+ Management System</span>
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

export const createDetailedReceiptPdfBlob = async (receipt: DetailedReceipt): Promise<Blob> => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;
  let y = 42;
  const logo = await loadReceiptLogo();
  const issued = formatDateTime(receipt.issuedAt);
  const paid = receipt.paidAt ? formatDateTime(receipt.paidAt) : null;
  const paymentStatus = formatReceiptPaymentStatus(receipt.paymentStatus);
  const paidStatus = isPaidReceiptStatus(receipt.paymentStatus);
  const serviceTotal = Math.max(
    0,
    receipt.serviceTotal ??
      (receipt.subtotal - receipt.discount + receipt.tax + receipt.additionalFees)
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
  doc.setDrawColor(36, 60, 92);
  doc.roundedRect(margin, y, 122, 74, 8, 8, 'FD');
  if (logo) {
    doc.addImage(logo, 'PNG', margin + 9, y + 6.5, 104, 61);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(COMPANY_BRANDING.brandName, margin + 61, y + 42, { align: 'center' });
  }

  const brandX = margin + 136;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(19, 36, 61);
  doc.text(COMPANY_BRANDING.brandName, brandX, y + 15);
  doc.setFontSize(7.8);
  doc.setTextColor(53, 105, 184);
  doc.text(COMPANY_BRANDING.category.toUpperCase(), brandX, y + 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(102, 112, 133);
  doc.text(COMPANY_BRANDING.tagline, brandX, y + 44);
  doc.text(COMPANY_BRANDING.address, brandX, y + 56);
  doc.text(`${COMPANY_BRANDING.phone}  |  ${COMPANY_BRANDING.email}`, brandX, y + 68);

  const metaRight = pageW - margin;
  doc.setDrawColor(249, 115, 22);
  doc.setLineWidth(2);
  doc.line(metaRight - 38, y, metaRight, y);
  doc.setLineWidth(0.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(53, 105, 184);
  rightText('PAYMENT RECORD', metaRight, y + 12);
  doc.setFontSize(18);
  doc.setTextColor(19, 36, 61);
  rightText('Official Receipt', metaRight, y + 30);
  doc.setFontSize(6.8);
  doc.setTextColor(123, 135, 151);
  rightText('DIGITAL COPY', metaRight, y + 42);
  rightText('RECEIPT NUMBER', metaRight, y + 55);
  doc.setFontSize(8.5);
  doc.setTextColor(37, 51, 74);
  rightText(doc.splitTextToSize(receipt.receiptNumber, 126)[0] || '-', metaRight, y + 65);
  doc.setFontSize(6.8);
  doc.setTextColor(123, 135, 151);
  rightText('BOOKING REFERENCE', metaRight, y + 77);
  doc.setFontSize(8.5);
  doc.setTextColor(37, 51, 74);
  rightText(doc.splitTextToSize(bookingReference, 126)[0] || '-', metaRight, y + 87);
  doc.setFontSize(6.8);
  doc.setTextColor(123, 135, 151);
  rightText('DATE ISSUED', metaRight, y + 99);
  doc.setFontSize(8.5);
  doc.setTextColor(37, 51, 74);
  rightText(issued.date || '-', metaRight, y + 109);

  y += 122;
  divider();
  y += 18;

  const boxW = (contentW - 14) / 2;
  const drawBox = (x: number, title: string, rows: Array<[string, string]>) => {
    const startY = y;
    const h = 31 + rows.length * 16;
    doc.setFillColor(250, 252, 254);
    doc.setDrawColor(220, 227, 235);
    doc.roundedRect(x, startY, boxW, h, 7, 7, 'FD');
    doc.setFillColor(238, 243, 248);
    doc.roundedRect(x, startY, boxW, 27, 7, 7, 'F');
    doc.rect(x, startY + 14, boxW, 13, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.7);
    doc.setTextColor(44, 95, 159);
    doc.text(title.toUpperCase(), x + 12, startY + 18);
    rows.forEach(([label, value], index) => {
      const rowY = startY + 41 + index * 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.1);
      doc.setTextColor(123, 135, 151);
      doc.text(label, x + 12, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.3);
      doc.setTextColor(37, 51, 74);
      const split = doc.splitTextToSize(String(value || '-'), boxW - 110);
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
  doc.setFillColor(234, 240, 246);
  doc.setDrawColor(216, 224, 233);
  doc.roundedRect(margin, tableHeaderY, contentW, 30, 7, 7, 'FD');
  doc.setFillColor(234, 240, 246);
  doc.rect(margin, tableHeaderY + 15, contentW, 15, 'F');
  doc.setFontSize(7.6);
  doc.setTextColor(71, 84, 103);
  doc.text('SERVICE DESCRIPTION', margin + 12, tableHeaderY + 19);
  rightText('QTY', pageW - margin - 202, tableHeaderY + 19);
  rightText('UNIT PRICE', pageW - margin - 100, tableHeaderY + 19);
  rightText('AMOUNT', pageW - margin - 12, tableHeaderY + 19);
  y += 42;

  doc.setFontSize(9.2);
  receipt.lineItems.forEach((item) => {
    const nameLines = doc.splitTextToSize(item.name, contentW - 245);
    const rowH = Math.max(24, nameLines.length * 11 + 8);
    ensureSpace(rowH + 8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(37, 51, 74);
    doc.text(nameLines, margin + 11, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(52, 64, 84);
    rightText(String(item.qty), pageW - margin - 202, y);
    rightText(formatPdfMoney(item.unitPrice), pageW - margin - 100, y);
    doc.setFont('helvetica', 'bold');
    rightText(formatPdfMoney(item.unitPrice * item.qty), pageW - margin - 12, y);
    y += rowH + 8;
    doc.setDrawColor(233, 237, 242);
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
    ...(receipt.downpayment > 0
      ? [['Less Reservation Fee / Downpayment', receipt.downpayment, true] as [string, number, boolean?]]
      : []),
  ];
  const summaryW = 284;
  const summaryX = pageW - margin - summaryW;
  const paymentW = contentW - summaryW - 18;
  const summaryH = 47 + summaryRows.length * 15 + 40 + (receipt.balanceDue > 0 ? 16 : 0);
  const paymentH = 92;
  const lowerH = Math.max(summaryH, paymentH);
  ensureSpace(lowerH + 28);
  const lowerY = y + 4;

  doc.setFillColor(250, 252, 254);
  doc.setDrawColor(220, 227, 235);
  doc.roundedRect(margin, lowerY, paymentW, paymentH, 7, 7, 'FD');
  doc.setFillColor(238, 243, 248);
  doc.roundedRect(margin, lowerY, paymentW, 27, 7, 7, 'F');
  doc.rect(margin, lowerY + 14, paymentW, 13, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(53, 105, 184);
  doc.text('PAYMENT DETAILS', margin + 12, lowerY + 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(123, 135, 151);
  doc.text('PAYMENT METHOD', margin + 12, lowerY + 46);
  doc.text('PAYMENT STATUS', margin + paymentW / 2 + 5, lowerY + 46);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(37, 51, 74);
  doc.text(receipt.paymentMethod, margin + 12, lowerY + 67);
  const statusX = margin + paymentW / 2 + 5;
  const statusLabel = paymentStatus.toUpperCase();
  const statusWidth = Math.max(39, doc.getTextWidth(statusLabel) + 17);
  if (paidStatus) {
    doc.setFillColor(236, 253, 243);
    doc.setDrawColor(167, 227, 197);
    doc.setTextColor(8, 122, 85);
  } else {
    doc.setFillColor(237, 245, 255);
    doc.setDrawColor(191, 211, 239);
    doc.setTextColor(40, 94, 170);
  }
  doc.roundedRect(statusX, lowerY + 55, statusWidth, 18, 9, 9, 'FD');
  doc.setFontSize(7.6);
  doc.text(statusLabel, statusX + statusWidth / 2, lowerY + 67, { align: 'center' });

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
  doc.setFillColor(249, 115, 22);
  doc.roundedRect(summaryX + 7, summaryY - 3, 3, 31, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(33, 79, 143);
  doc.text('Amount Collected Today', summaryX + 17, summaryY + 16);
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

  ensureSpace(58);
  divider();
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(37, 51, 74);
  doc.text('Thank you for trusting AutoSPF+ with your vehicle.', pageW / 2, y, { align: 'center' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(102, 112, 133);
  doc.text(
    'This digital receipt confirms your payment record. Please keep this copy for your records.',
    pageW / 2,
    y,
    { align: 'center' }
  );
  y += 13;
  doc.setFontSize(7.2);
  doc.setTextColor(152, 162, 179);
  doc.text('Generated by AutoSPF+ Management System', pageW / 2, y, { align: 'center' });

  return doc.output('blob');
};

export const downloadDetailedReceiptPdf = async (receipt: DetailedReceipt) => {
  const blob = await createDetailedReceiptPdfBlob(receipt);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `AutoSPF-Receipt-${fileSafe(receipt.receiptNumber || 'receipt')}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
