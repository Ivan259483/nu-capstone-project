import type { PaymentReceipt } from '@/services/api/paymentService';
import {
  formatPeso,
  formatReceiptDateTime,
  isPaidReceiptStatus,
  receiptPaymentMethodLabel,
  receiptPaymentStatusLabel,
  receiptPresentation,
} from './receipt-presentation';

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

/**
 * Builds the same printable receipt document as the web app
 * (frontend/src/lib/receipt-document.ts#buildDetailedReceiptHtml) so the PDF a customer
 * downloads or prints from the app looks identical to the one issued from the web dashboard.
 */
export const buildMobileReceiptHtml = (receipt: PaymentReceipt) => {
  const presentation = receiptPresentation(receipt);
  const issued = formatReceiptDateTime(receipt.issuedAt || receipt.paymentDate);
  const paid = receipt.paymentDate ? formatReceiptDateTime(receipt.paymentDate) : null;
  const paymentStatus = receiptPaymentStatusLabel(receipt.paymentStatus);
  const paidStatus = isPaidReceiptStatus(receipt.paymentStatus);
  const bookingReference = receipt.bookingReference || receipt.orderNumber || '—';
  const company = receipt.company || { name: 'AutoSPF+', address: '', phone: '', email: '' };

  const lineRows = receipt.lineItems
    .map((item) => `
      <tr>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${item.quantity}</td>
        <td>${escapeHtml(formatPeso(item.unitPrice))}</td>
        <td>${escapeHtml(formatPeso(item.amount))}</td>
      </tr>
    `)
    .join('');

  const moneyValue = (value: number, negative = false) => `${negative && value ? '−' : ''}${formatPeso(value)}`;
  const summaryRow = (label: string, value: number, negative = false, className = '') =>
    `<div class="summary-row ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(moneyValue(value, negative))}</strong></div>`;

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Receipt ${escapeHtml(receipt.receiptNumber)}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #f3f6fa; color: #172033; font-family: -apple-system, "Segoe UI", Arial, sans-serif; font-variant-numeric: tabular-nums; }
      .page { display: flex; width: 794px; min-height: 1123px; margin: 24px auto; padding: 38px 42px 30px; flex-direction: column; background: #fff; }
      .top { display: grid; grid-template-columns: minmax(0, 1.38fr) minmax(238px, .82fr); gap: 30px; align-items: start; padding-bottom: 25px; border-bottom: 1px solid #d9e0e8; }
      .brand-lockup { display: flex; align-items: center; gap: 18px; min-width: 0; }
      .logo-plate { display: flex; width: 126px; height: 76px; flex: 0 0 126px; align-items: center; justify-content: center; padding: 8px 10px; border: 1px solid #243c5c; border-radius: 10px; background: #13243d; }
      .logo-plate span { color: #fff; font-size: 19px; font-weight: 800; letter-spacing: .04em; }
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
      @page { size: A4; margin: 12mm; }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="top">
        <div class="brand-lockup">
          <div class="logo-plate"><span>SPF+</span></div>
          <div class="brand">
            <h1>${escapeHtml(company.name || 'AutoSPF+')}</h1>
            <p class="service-type">Automotive Service</p>
            <p>${escapeHtml(company.address || '')}</p>
            <p>${escapeHtml(company.phone || '')}${company.phone && company.email ? ' · ' : ''}${escapeHtml(company.email || '')}</p>
          </div>
        </div>
        <div class="receipt-heading">
          <p class="eyebrow">${escapeHtml(presentation.eyebrow)}</p>
          <h2>${escapeHtml(presentation.title)}</h2>
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
            <div class="line"><span>Served By</span><strong>${escapeHtml(receipt.staffName || company.name || 'AutoSPF+')}</strong></div>
          </div>
        </div>
        <div class="box">
          <p class="box-header">Customer & Vehicle</p>
          <div class="box-body">
            <div class="line"><span>Customer</span><strong>${escapeHtml(receipt.customer?.name)}</strong></div>
            ${receipt.customer?.phone ? `<div class="line"><span>Phone</span><strong>${escapeHtml(receipt.customer.phone)}</strong></div>` : ''}
            ${receipt.vehicle?.plate ? `<div class="line"><span>Plate Number</span><strong>${escapeHtml(receipt.vehicle.plate)}</strong></div>` : ''}
            ${receipt.vehicle?.description ? `<div class="line"><span>Vehicle</span><strong>${escapeHtml(receipt.vehicle.description)}</strong></div>` : ''}
            ${receipt.vehicle?.color ? `<div class="line"><span>Color</span><strong>${escapeHtml(receipt.vehicle.color)}</strong></div>` : ''}
            ${receipt.vehicle?.classification ? `<div class="line"><span>Class</span><strong>${escapeHtml(receipt.vehicle.classification)}</strong></div>` : ''}
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
                <strong>${escapeHtml(receiptPaymentMethodLabel(receipt.paymentMethod))}</strong>
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
          ${presentation.rows.map((row) => summaryRow(row.label, row.value, row.negative, row.label === 'Service Total' ? 'service-total' : '')).join('')}
          ${summaryRow(presentation.collectedLabel, presentation.collectedAmount, false, 'collected')}
          ${receipt.balanceDue ? summaryRow('Remaining Balance', receipt.balanceDue) : ''}
        </section>
      </section>

      <section class="footer">
        <strong>Thank you for trusting ${escapeHtml(company.name || 'AutoSPF+')} with your vehicle.</strong>
        This digital receipt confirms your payment record. Please keep this copy for your records.
        <span class="system-note">Generated by AutoSPF+ Management System</span>
      </section>
    </main>
  </body>
</html>`;
};

export const mobileReceiptFileName = (receiptNumber: string) =>
  `AutoSPF-Receipt-${String(receiptNumber || 'receipt').replace(/[^a-z0-9_-]/gi, '-')}.pdf`;
