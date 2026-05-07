import { jsPDF } from 'jspdf';
import { uploadBufferToCloudinary } from './cloudinaryStorage.utils.js';

export const generateTermsAndConditionsPDF = async (order, signatureBase64) => {
  try {
    const doc = new jsPDF();

    // Default font and styling
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    // Header
    doc.text('#7380 Marcos Alvarez Ave', 10, 20);
    doc.text('Talon V Las Piñas City', 10, 25);
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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210;
  let y = 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('AutoSPF+', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  y += 6;
  doc.text('Sales invoice (A4)', 14, y);
  y += 8;

  doc.setFontSize(10);
  doc.text(`Invoice #: ${snapshot.invoiceNumber || ''}`, 14, y);
  doc.text(`Date: ${snapshot.issuedAt ? new Date(snapshot.issuedAt).toLocaleString() : ''}`, pageW - 14, y, { align: 'right' });
  y += 7;
  doc.text(`Order: ${snapshot.orderNumber || ''}`, 14, y);
  if (snapshot.bookingReference) {
    doc.text(`Booking ref: ${snapshot.bookingReference}`, pageW - 14, y, { align: 'right' });
  }
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Bill to', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(String(snapshot.customerName || ''), 14, y);
  y += 5;
  if (snapshot.customerPhone) doc.text(String(snapshot.customerPhone), 14, y);
  y += 8;

  const v = snapshot.vehicle || {};
  doc.setFont('helvetica', 'bold');
  doc.text('Vehicle', 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(`${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || '—', 14, y);
  y += 5;
  if (v.plate) doc.text(`Plate: ${v.plate}`, 14, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Description', 14, y);
  doc.text('Qty', 120, y);
  doc.text('Unit', 140, y);
  doc.text('Line', pageW - 14, y, { align: 'right' });
  y += 2;
  doc.line(14, y, pageW - 14, y);
  y += 5;
  doc.setFont('helvetica', 'normal');

  const lines = snapshot.lineItems || [];
  for (const li of lines) {
    if (y > 250) {
      doc.addPage();
      y = 14;
    }
    const name = String(li.name || '');
    const split = doc.splitTextToSize(name, 100);
    doc.text(split, 14, y);
    doc.text(String(li.quantity ?? 1), 120, y);
    doc.text(`₱${Number(li.unitPrice || 0).toLocaleString()}`, 140, y);
    const lineTotal = li.lineTotal ?? Number(li.unitPrice || 0) * Number(li.quantity || 1);
    doc.text(`₱${Number(lineTotal).toLocaleString()}`, pageW - 14, y, {
      align: 'right',
    });
    y += Math.max(6, split.length * 5);
  }

  y += 6;
  doc.line(14, y, pageW - 14, y);
  y += 8;

  const c = snapshot.computed || {};
  const row = (label, val) => {
    doc.text(label, pageW - 70, y);
    doc.text(`₱${Number(val || 0).toLocaleString()}`, pageW - 14, y, { align: 'right' });
    y += 6;
  };
  row('Subtotal', c.subtotal);
  row('Discount', c.discountTotal);
  row('VAT / tax', c.taxVatTotal);
  row('Additional fees', c.additionalFeesTotal);
  row('Grand total', c.grandTotal);
  row('Downpayment', snapshot.downpayment);
  row('Balance due (this payment)', c.balanceDue);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('Signatures', 14, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.rect(14, y, 80, 22);
  doc.rect(pageW - 94, y, 80, 22);
  doc.text('Client', 16, y + 6);
  doc.text('Sales', pageW - 92, y + 6);

  return Buffer.from(doc.output('arraybuffer'));
};
