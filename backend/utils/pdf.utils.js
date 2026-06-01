import { jsPDF } from 'jspdf';
import { uploadBufferToCloudinary } from './cloudinaryStorage.utils.js';
import { normalizeMoney } from './billingTotals.js';
import { resolvePlainVehiclePlate } from './vehiclePlate.utils.js';
import { COMPANY_BRANDING, companyContactLine } from '../constants/companyBranding.js';

export const generateTermsAndConditionsPDF = async (order, signatureBase64) => {
  try {
    const doc = new jsPDF();

    // Default font and styling
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    // Header
    doc.text('Marcos Alvarez Ave.', 10, 20);
    doc.text('Las Piñas City', 10, 25);
    doc.text('AUTOSPF AUTOMOTIVE CAR CARE SERVICE', 10, 30);
    doc.text('+639176303116', 10, 35);
    
    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Paint Protection Film General Terms and Conditions', 10, 50);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const bodyText = `
Paint protection film is a complicated installation procedure. This document serves to set expectations on your installation,
and can serve as a reference point in the future.

      ABOUT PAINT PROTECTION FILM
Paint protection film is a film designed to protect your vehicle's paint from future paint chip, scratches and swirl mark. It is
applied to the exterior of your vehicle paint. The customer understands that PPF is a sacrificial layer of your vehicle, not a
completely invisible or matte layer.

      DRYING TIME
Your new paint protection film will take 3-4 weeks to fully cure depending on weather conditions. Do not wash the vehicle
for the first 7 days. You may notice some telltale signs of water under the film. If you see some water spots under the film,
avoid touching them. They will evaporate. Any air left behind we can easily remove once the film is fully dried.

      WARRANTY
PPF installed on your vehicle carries a 5 year warranty against yellowing, cracking, and fading. All PPF will turn
yellow eventually, it's the rate at which it turns to yellow is what the warranty covers. Warranty does NOT cover abuse (such
as getting too close with a pressure washer, too much sun exposure, improper maintenance, negligence and cutting/lifting
the film, accidents, or from debris. Yes, this film will protect from most rock chips. However, there is a chance that a
sharp/large enough object traveling at a high rate of speed could "chip" or cut the paint protection film (this goes for any
type of PPF, even the thickest types). This is not covered under warranty. The film is designed to sacrifice itself to save your
paint.

      EXISTING ROCK CHIPS
Please note that existing paint chips will appear as PPF imperfections if we install PPF over them. This is especially true on
dark or black vehicles, as the "dots" show as a light gray/white spec. We have installed PPF on 5-7-year-old vehicles without
issue, and we have installed it on cars with less than 1000 kms that have had a ton of rock chip imperfections, or even some
that have come straight from the dealership that already have chips.

      BADGE AND TRIM REMOVAL
On certain installations we may have to remove badging or other parts of the car to provide the best experience for you,
should you request it. For example, doing a full vehicle wrap or a wrap on the hood usually requires us to remove the hood
emblem. All attempts will be made to retain all OEM badges and lettering unless the customer wishes otherwise.
We make every attempt to NOT remove badging unless absolutely necessary or requested.

      IMPERFECTIONS
We strive for perfection in our installations, but due to the nature of covering an entire vehicle in an adhesive film, it is likely
that you will see some degree of dust, contamination, or other debris under the film after installing. We attempt to take every
precaution possible to make a near-perfect install, with the understanding that no installation will actually be perfect. Please
note that used vehicles, the more likely it is to have dirt hidden in hard-to-access areas without a complete disassembly of
the vehicle (which we do not do). This increases the odds of having slightly more specs of dirt under the film.
However, if the goal is to find an imperfection in the film, you will find something. We urge clients to consider that this is a
protective film and not a completely invisible film with no imperfections.`;

    const splitText = doc.splitTextToSize(bodyText, 180);
    doc.text(splitText, 10, 60);
    
    // Page 2
    doc.addPage();
    const bodyText2 = `      PAINT
Paint may lift on repainted or Factory paint if improperly prepped and painted. This includes dealership touchups prior
to delivery, that are not always as evident. AUTOSPF will not be liable in the event that damage does occur during the
installation process.

      UNSUITABLE SURFACES
On our full body PPF jobs we strive to cover almost every surface. There are some surfaces that may not be suitable for
PPF (any textured surface - be it plastic or otherwise, some trivial accent pieces such as grilles or chrome pieces.

      LIFTING
It is possible, and normal within the industry, to notice some minor lifting that needs to be trimmed at the two-week mark post
installation. We make every attempt to avoid this situation but it is normal to have to trim some areas. Don't hesitate to
contact us to have us trim these areas.

      EXPOSED EDGES AND SEAM
Although we strive to wrap all edges, some cannot be wrapped as some cars or motorcycles have complicated body lines
that require multiple pieces seamed together. You may notice some seams in certain areas. Unfortunately, PPF has difficulty
bending/stretching over certain areas due to the thickness of the film. Debris build up over time on exposed edges/seams
will be more visible on white/light colored vehicles. There is no warranty or reapplication of film due to debris build up.

      PHOTO RELEASE
Unless otherwise discussed, bringing your vehicle authorizes AUTOSPF to use photos and videos for YouTube, social
media, and advertisements.

      PRE-EXISTING DAMAGE / LOST
AUTOSPF shall not be held liable for any mechanical condition or pre-existing conditions such as dents, scratches & any
other pre-existing damages to the vehicle's interior & exterior nor for the loss or damage of personal belongings.

      TERMS AND CONDITIONS OF SERVICE
This Agreement for service is entered into between (client) and AUTOSPF AUTOMOTIVE CARE SERVICE.
The above-mentioned parties hereby agree to this terms and conditions and (client) fully understand it.`;

    const splitText2 = doc.splitTextToSize(bodyText2, 180);
    doc.text(splitText2, 10, 20);

    // Footer signature
    doc.text('DATE: _________________', 10, 160);
    doc.text('CLIENT NAME/SIGNATURE: _________________', 10, 180);

    if (signatureBase64 && isDataUrl(signatureBase64)) {
       doc.addImage(signatureBase64, 'PNG', 60, 165, 50, 25);
    }

    const pdfBuffer = doc.output('arraybuffer');
    // Use existing upload mechanism
    const uploadedUrl = await uploadBufferToCloudinary(Buffer.from(pdfBuffer), {
      filename: 'waiver.pdf',
      contentType: 'application/pdf',
      folder: 'waivers'
    });
    return uploadedUrl;
  } catch (err) {
    console.error('Failed to generate PDF Waiver', err);
    return null;
  }
};

const isDataUrl = (str) => typeof str === 'string' && str.startsWith('data:');

export const generateQCPDF = async (order) => {
  try {
    const doc = new jsPDF();
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('AutoSPF+ Quality Control Report', 105, 30, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    
    let yPos = 50;
    doc.text(`Order Reference: ${order._id}`, 20, yPos);
    yPos += 10;
    doc.text(`Customer: ${order.customer?.name || 'N/A'}`, 20, yPos);
    yPos += 10;
    doc.text(`Vehicle: ${order.vehicleMake || ''} ${order.vehicleModel || ''} (${order.vehiclePlate || 'N/A'})`, 20, yPos);
    yPos += 10;
    doc.text(`Service: ${order.items?.[0]?.product?.name || order.serviceType || 'AutoSPF+ Premium Detail'}`, 20, yPos);
    yPos += 10;
    doc.text(`Inspected On: ${new Date().toLocaleDateString()}`, 20, yPos);
    
    yPos += 20;
    doc.setFont('helvetica', 'bold');
    doc.text('Quality Control Validation', 20, yPos);
    yPos += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const qcLines = [
      '- Exterior Paint Protection Film (PPF) application verified seamless.',
      '- No visible bubbles, creases, or liftings on edges.',
      '- Final surface decontamination and high-gloss finish verified.',
      '- Interior panels and glass surfaces wiped down and inspected.'
    ];
    qcLines.forEach(line => {
      doc.text(line, 20, yPos);
      yPos += 7;
    });
    
    yPos += 40;
    doc.setFont('helvetica', 'bold');
    doc.text('AutoSPF+ Lead Detailer', 150, yPos);
    doc.line(140, yPos + 2, 200, yPos + 2);
    doc.setFont('helvetica', 'normal');
    doc.text('Authorized Signature', 152, yPos + 8);
    
    const pdfBuffer = doc.output('arraybuffer');
    const uploadedUrl = await uploadBufferToCloudinary(Buffer.from(pdfBuffer), {
      filename: `qc_report_${order._id}.pdf`,
      contentType: 'application/pdf',
      folder: 'waivers'
    });
    return uploadedUrl;
  } catch (err) {
    console.error('Failed to generate QC PDF', err);
    return null;
  }
};

export const generateWarrantyPDF = async (order) => {
  try {
    const doc = new jsPDF();
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('AutoSPF+ Warranty & Receipt', 105, 30, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    
    let yPos = 50;
    doc.text(`Order Reference: ${order._id}`, 20, yPos);
    yPos += 10;
    doc.text(`Customer: ${order.customer?.name || 'N/A'}`, 20, yPos);
    yPos += 10;
    doc.text(`Vehicle: ${order.vehicleMake || ''} ${order.vehicleModel || ''} (${order.vehiclePlate || 'N/A'})`, 20, yPos);
    yPos += 10;
    doc.text(`Service: ${order.items?.[0]?.product?.name || order.serviceType || 'AutoSPF+ Premium Detail'}`, 20, yPos);
    yPos += 10;
    doc.text(`Completed On: ${new Date().toLocaleDateString()}`, 20, yPos);
    
    yPos += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Warranty Coverage', 20, yPos);
    yPos += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const warrantyText = `Your service includes a 5-year active warranty against bubbling, peeling, or severe yellowing of the PPF. Physical damage, rock chips penetrating the film, and chemical abuse are strictly not covered. Please bring your vehicle back for a 2-week follow-up wash and spot check to maintain your warranty validity.`;
    const splitWarranty = doc.splitTextToSize(warrantyText, 170);
    doc.text(splitWarranty, 20, yPos);
    
    yPos += 40;
    doc.setFont('helvetica', 'bold');
    doc.text('AutoSPF+ Management', 150, yPos);
    doc.line(140, yPos + 2, 200, yPos + 2);
    doc.setFont('helvetica', 'normal');
    doc.text('Authorized Signature', 152, yPos + 8);
    
    const pdfBuffer = doc.output('arraybuffer');
    const uploadedUrl = await uploadBufferToCloudinary(Buffer.from(pdfBuffer), {
      filename: `warranty_${order._id}.pdf`,
      contentType: 'application/pdf',
      folder: 'waivers'
    });
    return uploadedUrl;
  } catch (err) {
    console.error('Failed to generate Warranty PDF', err);
    return null;
  }
};

/**
 * A4 sales invoice from InvoiceRecord.snapshot (see billing.controller buildInvoiceSnapshot).
 * @returns {Buffer}
 */
export const buildInvoicePdfBuffer = (snapshot) => {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentW = pageW - margin * 2;
  let y = 44;

  const money = (value) =>
    `PHP ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const ensure = (height) => {
    if (y + height <= pageH - margin) return;
    doc.addPage();
    y = margin;
  };
  const rule = () => {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
  };
  const right = (text, x = pageW - margin, yy = y) => doc.text(String(text || ''), x, yy, { align: 'right' });

  const issuedAt = snapshot.issuedAt ? new Date(snapshot.issuedAt) : new Date();
  const paidAt = snapshot.paidAt || snapshot.payment?.paidAt ? new Date(snapshot.paidAt || snapshot.payment?.paidAt) : null;
  const vehicle = snapshot.vehicle || {};
  /** Re-resolve at render time so old snapshots with internal hex in `plate` still print cleanly. */
  const plateForPdf = resolvePlainVehiclePlate(
    typeof vehicle.plate === 'string' ? vehicle.plate : String(vehicle.plate || '')
  );
  const payment = snapshot.payment || {};
  const computed = snapshot.computed || {};

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(29, 78, 216);
  doc.text(COMPANY_BRANDING.brandName, margin, y);
  doc.setTextColor(15, 23, 42);
  right('Official Digital Receipt');
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(COMPANY_BRANDING.tagline, margin, y);
  right(snapshot.invoiceNumber || payment.posInvoiceId || '');
  y += 13;
  doc.text(COMPANY_BRANDING.address, margin, y);
  if (snapshot.bookingReference) right(`Booking ${snapshot.bookingReference}`);
  y += 13;
  doc.text(companyContactLine(), margin, y);
  y += 11;
  doc.text(COMPANY_BRANDING.facebook, margin, y);
  y += 22;
  rule();
  y += 18;

  const boxW = (contentW - 18) / 2;
  const drawInfoBox = (x, title, rows) => {
    const startY = y;
    const height = 30 + rows.length * 16;
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, startY, boxW, height, 8, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(title.toUpperCase(), x + 12, startY + 18);

    rows.forEach(([label, value], index) => {
      const rowY = startY + 36 + index * 16;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(label, x + 12, rowY);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      const split = doc.splitTextToSize(String(value || '-'), boxW - 96);
      right(split[0] || '-', x + boxW - 12, rowY);
    });
    return height;
  };

  const detailsRows = [
    ['Date', issuedAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })],
    ['Time', issuedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })],
    ['Order no.', snapshot.orderNumber || '-'],
  ];
  if (paidAt && Number.isFinite(paidAt.getTime())) {
    detailsRows.push(['Paid', paidAt.toLocaleString('en-PH')]);
  }
  if (payment.staff?.name) detailsRows.push(['Served by', payment.staff.name]);

  const customerRows = [
    ['Customer', snapshot.customerName || 'Customer'],
    ['Phone', snapshot.customerPhone || '-'],
  ];
  if (plateForPdf) customerRows.push(['Plate', plateForPdf]);
  customerRows.push([
    'Vehicle',
    [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || '-',
  ]);

  const detailsH = drawInfoBox(margin, 'Transaction Details', detailsRows);
  const customerH = drawInfoBox(margin + boxW + 18, 'Customer & Vehicle', customerRows);
  y += Math.max(detailsH, customerH) + 28;

  ensure(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('SERVICES RENDERED', margin, y);
  right('QTY', pageW - margin - 178, y);
  right('UNIT', pageW - margin - 78, y);
  right('AMOUNT');
  y += 8;
  rule();
  y += 18;

  const lines = snapshot.lineItems || [];
  doc.setFontSize(10);
  for (const li of lines) {
    const qty = Number(li.quantity || 1);
    const unit = Number(li.unitPrice || 0);
    const total = li.lineTotal ?? unit * qty;
    const nameLines = doc.splitTextToSize(String(li.name || 'Service'), contentW - 250);
    const rowH = Math.max(18, nameLines.length * 12 + 4);
    ensure(rowH + 10);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(nameLines, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`${qty} x ${money(unit)}`, margin, y + rowH - 4);
    doc.setTextColor(15, 23, 42);
    right(String(qty), pageW - margin - 178, y);
    right(money(unit), pageW - margin - 78, y);
    right(money(total));
    y += rowH + 8;
    rule();
    y += 10;
  }

  ensure(160);
  const summaryX = pageW - margin - 250;
  const dp = normalizeMoney(snapshot.downpayment || 0);
  const collected = normalizeMoney(
    payment.amountCollected ??
      payment.amountPaid ??
      computed.balanceDue ??
      computed.grandTotal ??
      0
  );
  const grandTotal = normalizeMoney(computed.grandTotal ?? computed.subtotal ?? 0);
  const disc = Number(computed.discountTotal || 0);
  const tax = Number(computed.taxVatTotal || 0);
  const fees = Number(computed.additionalFeesTotal || 0);

  /** Readable breakdown: parts → service total → prior reservation credit → amount taken at POS. */
  const summaryRows = [];
  const sub = Number(computed.subtotal || 0);
  summaryRows.push(['Subtotal', sub]);
  if (disc > 0) summaryRows.push(['Discount', -disc]);
  if (tax !== 0) summaryRows.push(['VAT / Tax', tax]);
  if (fees !== 0) summaryRows.push(['Additional fees', fees]);

  const showServiceTotal =
    dp > 0 || disc > 0 || tax !== 0 || fees !== 0 || Math.abs(grandTotal - sub) > 0.01;
  if (showServiceTotal) {
    summaryRows.push(['Service total (after discount & fees)', grandTotal]);
  }
  if (dp > 0) summaryRows.push(['Less reservation / downpayment (paid earlier)', -dp]);

  const summaryRowsFiltered = summaryRows.filter(([label, value]) => {
    if (String(label).includes('Service total')) return showServiceTotal;
    return Number(value || 0) !== 0;
  });

  const amountColumnW = 200;
  const labelMaxW = pageW - margin - summaryX - amountColumnW - 8;

  const drawSummaryLabelValue = (label, valueText, opts = {}) => {
    const fs = opts.fontSize ?? 10;
    const labelRgb = opts.labelColor || [71, 85, 105];
    const valueRgb = opts.valueColor || [15, 23, 42];
    doc.setFontSize(fs);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...labelRgb);
    const labelLines = doc.splitTextToSize(String(label), Math.max(80, labelMaxW));
    doc.text(labelLines, summaryX, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...valueRgb);
    right(valueText, pageW - margin, y);
    const lineGap = fs >= 14 ? 17 : 13;
    y += Math.max(lineGap, labelLines.length * lineGap);
  };

  for (const [label, value] of summaryRowsFiltered) {
    const valueStr = Number(value) < 0 ? `-${money(Math.abs(Number(value)))}` : money(value);
    drawSummaryLabelValue(label, valueStr);
  }

  y += 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(summaryX, y, pageW - margin, y);
  y += 22;
  drawSummaryLabelValue('Balance collected (this visit)', money(collected), {
    fontSize: 15,
    labelColor: [29, 78, 216],
    valueColor: [29, 78, 216],
  });
  if (dp > 0 && grandTotal > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    const settled = normalizeMoney(collected + dp);
    const note = `Online reservation ${money(dp)} + amount above = ${money(settled)} service total.`;
    doc.text(note, summaryX, y, { maxWidth: pageW - margin - summaryX });
    y += 22;
  } else {
    y += 4;
  }

  const balanceRemaining = Number(payment.balanceRemaining ?? 0);
  if (balanceRemaining > 0) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text('Balance Remaining', summaryX, y);
    right(money(balanceRemaining));
    y += 18;
  }

  y += 12;
  rule();
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Payment Method', margin, y);
  doc.text('Payment Status', margin + 190, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(String(payment.method || 'cash').replace(/_/g, ' ').toUpperCase(), margin, y + 16);
  doc.text(String(payment.status || snapshot.paymentStatus || 'paid').toUpperCase(), margin + 190, y + 16);
  y += 48;

  ensure(42);
  rule();
  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Thank you for choosing AutoSPF+.', pageW / 2, y, { align: 'center' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('This serves as your official digital receipt. Keep this copy for your records.', pageW / 2, y, { align: 'center' });

  return Buffer.from(doc.output('arraybuffer'));
};
