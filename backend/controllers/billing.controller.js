import crypto from 'crypto';
import mongoose from 'mongoose';
import Order from '../models/order.model.js';
import Billing from '../models/billing.model.js';
import InvoiceRecord from '../models/invoiceRecord.model.js';
import { computeBillingTotals, normalizeMoney } from '../utils/billingTotals.js';
import { runPosCheckoutCore } from './payment.controller.js';
import { logActivity } from '../utils/logActivity.utils.js';

function mapLineItem(raw) {
  let serviceId = null;
  if (raw.serviceId && mongoose.isValidObjectId(String(raw.serviceId))) {
    serviceId = new mongoose.Types.ObjectId(String(raw.serviceId));
  }
  const bg = raw.billingGroup;
  const billingGroup = ['ceramic_spf', 'ppf', 'other', 'uncategorized'].includes(bg) ? bg : 'uncategorized';
  return {
    serviceId,
    name: String(raw.name || 'Service').slice(0, 200),
    billingGroup,
    unitPrice: normalizeMoney(raw.unitPrice),
    quantity: Math.max(1, Math.floor(Number(raw.quantity)) || 1),
    vehicleTier: String(raw.vehicleTier || '').slice(0, 80),
  };
}

function dedupeLineItems(rawItems, dedupe) {
  const items = (rawItems || []).map(mapLineItem);
  if (!dedupe) return items;
  const m = new Map();
  for (const li of items) {
    const key = li.serviceId ? li.serviceId.toString() : `name:${li.name.toLowerCase()}`;
    if (m.has(key)) {
      const ex = m.get(key);
      ex.quantity += li.quantity;
    } else {
      m.set(key, { ...li });
    }
  }
  return [...m.values()];
}

function applyComputed(billing) {
  const discount = billing.discount || { discountType: 'fixed', value: 0 };
  const computed = computeBillingTotals({
    lineItems: billing.lineItems,
    discount,
    taxVatAmount: billing.taxVatAmount,
    additionalFees: billing.additionalFees,
    downpayment: billing.downpayment,
  });
  billing.computed = computed;
  return computed;
}

function pushBillingEvent(billing, req, action, summary, payload = null) {
  billing.events.push({
    at: new Date(),
    userId: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null,
    action,
    summary,
    payload,
  });
}

async function syncOrderItemsFromBilling(order, billing) {
  order.items = billing.lineItems.map((li) => ({
    product: li.serviceId || undefined,
    quantity: li.quantity,
    price: li.unitPrice,
  }));
  if (billing.lineItems.length) {
    order.serviceType = billing.lineItems.map((l) => l.name).join(', ');
  }
  await order.save();
}

async function generateUniqueInvoiceNumber() {
  for (let i = 0; i < 12; i += 1) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    const invoiceNumber = `INV-A4-${date}-${rand}`;
    const exists = await InvoiceRecord.exists({ invoiceNumber });
    if (!exists) return invoiceNumber;
  }
  const err = new Error('Could not allocate invoice number');
  err.statusCode = 500;
  throw err;
}

function buildInvoiceSnapshot({ invoiceNumber, order, billing, computed }) {
  return {
    invoiceNumber,
    billingVersion: billing.version,
    issuedAt: new Date().toISOString(),
    orderNumber: order.orderNumber,
    bookingReference: order.bookingReference,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    vehicle: {
      year: order.vehicleYear,
      make: order.vehicleMake,
      model: order.vehicleModel,
      plate: order.vehiclePlate,
    },
    lineItems: billing.lineItems.map((li) => ({
      name: li.name,
      billingGroup: li.billingGroup,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      lineTotal: normalizeMoney(li.unitPrice * li.quantity),
    })),
    discount: billing.discount,
    taxVatAmount: billing.taxVatAmount,
    additionalFees: billing.additionalFees,
    downpayment: billing.downpayment,
    computed,
    paymentStatus: 'paid',
  };
}

/**
 * GET /api/orders/:orderId/billing
 */
export const getBilling = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    let billing = await Billing.findOne({ order: orderId });
    if (!billing) {
      billing = await Billing.create({
        order: orderId,
        lineItems: [],
        status: 'pending',
      });
    }
    applyComputed(billing);
    await billing.save();

    return res.json({ success: true, data: billing });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/orders/:orderId/billing
 */
export const putBilling = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Cannot edit billing on a paid order' });
    }

    let billing = await Billing.findOne({ order: orderId });
    if (!billing) {
      billing = new Billing({ order: orderId });
    }
    if (billing.status === 'checked_out') {
      return res.status(400).json({ success: false, message: 'Billing already checked out' });
    }

    const body = req.body || {};
    const dedupe = body.dedupeByServiceId !== undefined ? !!body.dedupeByServiceId : billing.dedupeByServiceId;

    if (Array.isArray(body.lineItems)) {
      billing.lineItems = dedupeLineItems(body.lineItems, dedupe);
    }
    if (body.discount) {
      billing.discount = {
        discountType: body.discount.discountType === 'percent' ? 'percent' : 'fixed',
        value: normalizeMoney(body.discount.value),
        reason: String(body.discount.reason || '').slice(0, 500),
      };
    }
    if (body.taxVatAmount !== undefined) billing.taxVatAmount = normalizeMoney(body.taxVatAmount);
    if (body.additionalFees !== undefined) billing.additionalFees = normalizeMoney(body.additionalFees);
    if (body.downpayment !== undefined) billing.downpayment = normalizeMoney(body.downpayment);
    if (body.dedupeByServiceId !== undefined) billing.dedupeByServiceId = !!body.dedupeByServiceId;

    billing.version = (billing.version || 1) + 1;
    billing.status = billing.lineItems.length ? 'updated' : 'pending';
    billing.lastEditedBy = req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null;

    applyComputed(billing);

    pushBillingEvent(billing, req, 'billing_updated', `v${billing.version} — ${billing.lineItems.length} line(s)`, {
      computed: billing.computed,
    });

    await billing.save();

    logActivity({
      req,
      type: 'billing_update',
      module: 'Sales',
      action: 'Billing updated',
      description: `Order ${order.orderNumber || orderId} billing v${billing.version} (${billing.lineItems.length} lines).`,
      status: 'info',
      referenceId: String(order._id),
      metadata: { orderId: order._id, billingVersion: billing.version },
    });

    return res.json({ success: true, data: billing });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/orders/:orderId/billing/checkout
 */
export const checkoutBilling = async (req, res, next) => {
  let invoiceRecord = null;
  try {
    const { orderId } = req.params;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }

    const {
      paymentMethod = 'cash',
      staffId,
      cashReceived,
      splitPayments = [],
    } = req.body || {};

    const order = await Order.findById(orderId).populate('customer', 'name email phone');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    const billing = await Billing.findOne({ order: orderId });
    if (!billing) {
      return res.status(404).json({ success: false, message: 'Billing not found' });
    }
    if (billing.status === 'checked_out') {
      return res.status(400).json({ success: false, message: 'Billing already checked out' });
    }
    if (!billing.lineItems?.length) {
      return res.status(400).json({ success: false, message: 'Add at least one line item before checkout' });
    }

    applyComputed(billing);

    const discountForCalc =
      billing.discount && Number(billing.discount.value) > 0
        ? billing.discount
        : { discountType: 'fixed', value: 0 };
    const discountObj =
      billing.discount && Number(billing.discount.value) > 0 ? billing.discount : null;

    const lineItemsForTotals = billing.lineItems.map((li) => ({
      unitPrice: li.unitPrice,
      quantity: li.quantity,
    }));
    const totals = computeBillingTotals({
      lineItems: lineItemsForTotals,
      discount: discountForCalc,
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: billing.downpayment,
    });

    if (!Number.isFinite(totals.grandTotal) || totals.grandTotal < 0) {
      return res.status(400).json({ success: false, message: 'Invalid billing totals' });
    }

    await syncOrderItemsFromBilling(order, billing);

    const invoiceNumber = await generateUniqueInvoiceNumber();
    const snapshot = buildInvoiceSnapshot({ invoiceNumber, order, billing, computed: totals });

    invoiceRecord = await InvoiceRecord.create({
      invoiceNumber,
      order: order._id,
      billingVersion: billing.version,
      snapshot,
      createdBy: req.user?.id ? new mongoose.Types.ObjectId(req.user.id) : null,
    });

    const allItems = billing.lineItems.map((li) => ({
      name: li.name,
      price: li.unitPrice,
      quantity: li.quantity,
      isAddon: false,
    }));

    const { payment, receiptData, inventoryWarnings, invoiceId } = await runPosCheckoutCore({
      req,
      order,
      allItems,
      subtotal: totals.subtotal,
      discountAmount: totals.discountTotal,
      discount: discountObj,
      taxVatAmount: billing.taxVatAmount,
      additionalFees: billing.additionalFees,
      downpayment: billing.downpayment,
      grandTotal: totals.grandTotal,
      balanceDue: totals.balanceDue,
      paymentMethod,
      staffId,
      cashReceived,
      splitPayments,
      invoiceRecordId: invoiceRecord._id,
      billingVersion: billing.version,
      metadataExtra: { invoiceRecordNumber: invoiceNumber, billingCheckout: true },
    });

    invoiceRecord.payment = payment._id;
    await invoiceRecord.save();

    billing.status = 'checked_out';
    pushBillingEvent(billing, req, 'billing_checked_out', `Invoice ${invoiceNumber}`, {
      paymentId: payment._id,
      invoiceNumber,
    });
    await billing.save();

    logActivity({
      req,
      type: 'billing_checkout',
      module: 'Sales',
      action: 'Billing checkout',
      description: `Order ${order.orderNumber} checked out — ${invoiceNumber} (₱${totals.balanceDue}).`,
      status: 'success',
      referenceId: invoiceNumber,
      metadata: { orderId: order._id, paymentId: payment._id, invoiceNumber },
    });

    return res.json({
      success: true,
      message: 'Checkout completed',
      data: {
        invoiceNumber,
        invoiceRecordId: invoiceRecord._id,
        paymentId: payment._id,
        posInvoiceId: invoiceId,
        receipt: receiptData,
        inventoryWarnings,
        pdfUrl: `/api/invoices/${encodeURIComponent(invoiceNumber)}/pdf`,
      },
    });
  } catch (err) {
    if (invoiceRecord?._id) {
      await InvoiceRecord.deleteOne({ _id: invoiceRecord._id }).catch(() => {});
    }
    if (err.statusCode === 400) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
};
