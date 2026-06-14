import InvoiceRecord from '../models/invoiceRecord.model.js';
import Order from '../models/order.model.js';
import { buildInvoicePdfBuffer } from '../utils/pdf.utils.js';
import { USER_PHONE_SELECT_FIELDS } from '../utils/phone-client.utils.js';
import { hydrateReceiptSnapshot } from '../utils/receiptSnapshot.utils.js';

const RECEIPT_CUSTOMER_SELECT = `name email ${USER_PHONE_SELECT_FIELDS}`;
const RECEIPT_VEHICLE_SELECT = 'year make model color plateNumber vehicleType';

const loadReceiptOrderContext = (orderRef) => {
  const orderId = orderRef?._id || orderRef;
  if (!orderId) return null;
  return Order.findById(orderId)
    .select(
      'customer customerPhone vehicle vehicleYear vehicleMake vehicleModel vehicleColor vehiclePlate ' +
      'vehicleType vehicleClass vehicleCategory'
    )
    .populate('customer', RECEIPT_CUSTOMER_SELECT)
    .populate('vehicle', RECEIPT_VEHICLE_SELECT)
    .lean();
};

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

    const order = await loadReceiptOrderContext(inv.order);
    return res.json({
      success: true,
      data: {
        ...inv,
        snapshot: hydrateReceiptSnapshot(inv.snapshot, order),
      },
    });
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

    const order = await loadReceiptOrderContext(inv.order);
    const snapshot = hydrateReceiptSnapshot(inv.snapshot, order);
    const buf = buildInvoicePdfBuffer(snapshot);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(invoiceNumber)}.pdf"`);
    return res.send(buf);
  } catch (err) {
    next(err);
  }
};
