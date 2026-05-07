import InvoiceRecord from '../models/invoiceRecord.model.js';
import { buildInvoicePdfBuffer } from '../utils/pdf.utils.js';

/**
 * GET /api/invoices/:invoiceNumber
 */
export const getInvoiceByNumber = async (req, res, next) => {
  try {
    const { invoiceNumber } = req.params;
    const inv = await InvoiceRecord.findOne({ invoiceNumber })
      .populate('order', 'orderNumber bookingReference customerName customerPhone vehicleYear vehicleMake vehicleModel vehiclePlate')
      .populate('payment', 'invoiceId amount method status createdAt')
      .lean();

    if (!inv) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    return res.json({ success: true, data: inv });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/invoices/:invoiceNumber/pdf
 */
export const getInvoicePdf = async (req, res, next) => {
  try {
    const { invoiceNumber } = req.params;
    const inv = await InvoiceRecord.findOne({ invoiceNumber }).lean();
    if (!inv?.snapshot) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const buf = buildInvoicePdfBuffer(inv.snapshot);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(invoiceNumber)}.pdf"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
};
