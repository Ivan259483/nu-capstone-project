const fs = require('fs');
const filepath = '/Users/ivan/Documents/AutoSPF+/backend/utils/pdf.utils.js';
let content = fs.readFileSync(filepath, 'utf8');

// Replace the combined Warranty PDF with split functions
const combinedWarrantyPathStart = "export const generateWarrantyPDF = async (order) => {";

const splitFunctions = `export const generateQCPDF = async (order) => {
  try {
    const doc = new jsPDF();
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('AutoSPF+ Quality Control Report', 105, 30, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    
    let yPos = 50;
    doc.text(\`Order Reference: \${order._id}\`, 20, yPos);
    yPos += 10;
    doc.text(\`Customer: \${order.customer?.name || 'N/A'}\`, 20, yPos);
    yPos += 10;
    doc.text(\`Vehicle: \${order.vehicleMake || ''} \${order.vehicleModel || ''} (\${order.vehiclePlate || 'N/A'})\`, 20, yPos);
    yPos += 10;
    doc.text(\`Service: \${order.items?.[0]?.product?.name || order.serviceType || 'AutoSPF+ Premium Detail'}\`, 20, yPos);
    yPos += 10;
    doc.text(\`Inspected On: \${new Date().toLocaleDateString()}\`, 20, yPos);
    
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
      filename: \`qc_report_\${order._id}.pdf\`,
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
    doc.text(\`Order Reference: \${order._id}\`, 20, yPos);
    yPos += 10;
    doc.text(\`Customer: \${order.customer?.name || 'N/A'}\`, 20, yPos);
    yPos += 10;
    doc.text(\`Vehicle: \${order.vehicleMake || ''} \${order.vehicleModel || ''} (\${order.vehiclePlate || 'N/A'})\`, 20, yPos);
    yPos += 10;
    doc.text(\`Service: \${order.items?.[0]?.product?.name || order.serviceType || 'AutoSPF+ Premium Detail'}\`, 20, yPos);
    yPos += 10;
    doc.text(\`Completed On: \${new Date().toLocaleDateString()}\`, 20, yPos);
    
    yPos += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Warranty Coverage', 20, yPos);
    yPos += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const warrantyText = \`Your service includes a 5-year active warranty against bubbling, peeling, or severe yellowing of the PPF. Physical damage, rock chips penetrating the film, and chemical abuse are strictly not covered. Please bring your vehicle back for a 2-week follow-up wash and spot check to maintain your warranty validity.\`;
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
      filename: \`warranty_\${order._id}.pdf\`,
      contentType: 'application/pdf',
      folder: 'waivers'
    });
    return uploadedUrl;
  } catch (err) {
    console.error('Failed to generate Warranty PDF', err);
    return null;
  }
};
`;

const startIndex = content.indexOf(combinedWarrantyPathStart);
if (startIndex !== -1) {
    content = content.substring(0, startIndex) + splitFunctions;
    fs.writeFileSync(filepath, content, 'utf8');
    console.log("Replaced generateWarrantyPDF safely");
} else {
    console.log("Not found generateWarrantyPDF");
}
