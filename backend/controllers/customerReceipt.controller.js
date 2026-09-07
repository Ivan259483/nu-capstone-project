import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import InvoiceRecord from "../models/invoiceRecord.model.js";
import { COMPANY_BRANDING } from "../constants/companyBranding.js";
import {
  getPaymentEffectiveAt,
  getVerifiedAmount,
} from "../services/financialLedger.service.js";
import { hydrateReceiptSnapshot } from "../utils/receiptSnapshot.utils.js";
import { USER_PHONE_SELECT_FIELDS } from "../utils/phone-client.utils.js";
import { resolvePlainVehiclePlate } from "../utils/vehiclePlate.utils.js";
import {
  resolveCustomerReceiptCoverage,
  resolveReceiptReservationFee,
  resolveReceiptPriorPayments,
} from "../utils/customerReceiptDetails.utils.js";

// Never substitute the latest order invoice: a reservation and its final balance
// are separate transactions, even when they belong to the same order.
export const customerReceiptEligible = (payment) =>
  payment?.status === "succeeded" && payment?.transactionType !== "refund";

// An acknowledgement is generated from the verified ledger entry, independently
// of any later service invoice. Reads never create invoices or alter payments.
export const reservationReceiptNumber = (payment) =>
  customerReceiptEligible(payment) &&
  payment.transactionType === "reservation_fee" &&
  getVerifiedAmount(payment) > 0
    ? `RPR-${payment.invoiceId}`
    : null;

export async function findCustomerPaymentInvoices(payments) {
  const eligible = payments.filter((payment) =>
    customerReceiptEligible(payment) && payment.transactionType !== "reservation_fee",
  );
  if (!eligible.length) return new Map();
  const invoices = await InvoiceRecord.find({
    $or: [
      { payment: { $in: eligible.map((payment) => payment._id) } },
      {
        _id: {
          $in: eligible.map((payment) => payment.invoiceRecord).filter(Boolean),
        },
      },
    ],
  })
    .select(
      "invoiceNumber order payment snapshot createdAt createdBy signatures",
    )
    .populate("createdBy", "name")
    .lean();
  const result = new Map();
  for (const payment of eligible) {
    const invoice = invoices.find((candidate) => {
      const sameOrder =
        String(candidate.order) === String(payment.order?._id || payment.order);
      const samePayment = candidate.payment
        ? String(candidate.payment) === String(payment._id)
        : String(candidate._id) === String(payment.invoiceRecord);
      return (
        sameOrder &&
        samePayment &&
        candidate.snapshot?.lineItems?.length &&
        candidate.snapshot?.computed
      );
    });
    if (invoice) result.set(String(payment._id), invoice);
  }
  return result;
}

/** Read only, customer-owned receipt for one specific payment. */
export const getMyPaymentReceipt = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.paymentId)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment reference" });
    }
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      customer: req.user.id,
    })
      .populate("customer", `name email ${USER_PHONE_SELECT_FIELDS}`)
      .populate("staffAssigned", "name")
      .populate("reviewedBy", "name")
      .populate({
        path: "order",
        populate: {
          path: "vehicle",
          select: "year make model color plateNumber vehicleType",
        },
      });
    if (!payment)
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    const acknowledgementNumber = reservationReceiptNumber(payment);
    if (acknowledgementNumber) {
      const snapshot = hydrateReceiptSnapshot({}, {
        ...(payment.order?.toObject?.() || {}),
        customer: payment.customer,
      });
      const vehicle = snapshot.vehicle;
      const amount = getVerifiedAmount(payment);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ success: true, data: {
        receiptKind: "reservation_payment",
        receiptNumber: acknowledgementNumber,
        transactionNumber: payment.invoiceId,
        transactionType: payment.transactionType,
        bookingReference: payment.order?.bookingReference || "",
        orderNumber: payment.order?.orderNumber || "",
        issuedAt: getPaymentEffectiveAt(payment),
        paymentDate: getPaymentEffectiveAt(payment),
        staffName: payment.reviewedBy?.name || payment.staffAssigned?.name || "",
        paymentMethod: payment.method,
        paymentStatus: payment.status,
        splitPayments: payment.splitPayments || [],
        customer: {
          name: payment.customer?.name || payment.order?.customerName || "",
          email: payment.customer?.email || "",
          phone: snapshot.customerPhone || "",
        },
        vehicle: {
          description: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
          plate: resolvePlainVehiclePlate(vehicle.plate || ""),
          color: vehicle.color || "",
          classification: vehicle.type || "",
        },
        servicePackage: payment.order?.serviceType || "",
        company: {
          name: COMPANY_BRANDING.brandName,
          address: COMPANY_BRANDING.address,
          phone: COMPANY_BRANDING.phone,
          email: COMPANY_BRANDING.email,
        },
        lineItems: [{ name: "Reservation Fee", quantity: 1, unitPrice: amount, amount }],
        subtotal: amount,
        discount: 0,
        tax: 0,
        additionalFees: 0,
        serviceTotal: amount,
        priorPayments: 0,
        reservationFee: amount,
        totalPaid: amount,
        totalReceived: amount,
        balanceDue: 0,
        notes: [payment.order?.serviceType ? `Service: ${payment.order.serviceType}.` : "",
          "Acknowledgement of your initial booking payment. This reservation fee is credited toward your service bill."].filter(Boolean).join(" "),
      } });
    }
    const invoices = await findCustomerPaymentInvoices([payment]);
    const invoice = invoices.get(String(payment._id));
    if (!invoice)
      return res.status(404).json({
        success: false,
        message:
          "An official receipt is not available for this transaction yet.",
      });

    const snapshot = hydrateReceiptSnapshot(invoice.snapshot, {
      ...(payment.order?.toObject?.() || {}),
      customer: payment.customer,
    });
    const computed = snapshot.computed;
    const vehicle = snapshot.vehicle || {};
    const number = (value) =>
      Number.isFinite(Number(value)) ? Number(value) : 0;
    const orderPayments = await Payment.find({
      order: payment.order._id,
      customer: req.user.id,
    })
      .select(
        "transactionType status amount amountVerified amountPaid effectiveAt reviewedAt createdAt relatedPayment",
      )
      .lean();
    const priorPayments = resolveReceiptPriorPayments(snapshot, payment, orderPayments);
    const reservationFee = resolveReceiptReservationFee(
      { ...snapshot, downpayment: priorPayments },
      payment,
      orderPayments,
    );
    const amountPaid = getVerifiedAmount(payment);
    const balanceDue = Math.max(
      0,
      number(
        payment.balanceRemaining ??
          computed.grandTotal - priorPayments - amountPaid,
      ),
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      success: true,
      data: {
        receiptKind: "official_service",
        receiptNumber: invoice.invoiceNumber,
        transactionNumber: payment.invoiceId,
        transactionType: payment.transactionType,
        bookingReference:
          snapshot.bookingReference || payment.order?.bookingReference || "",
        orderNumber: snapshot.orderNumber || payment.order?.orderNumber || "",
        issuedAt:
          snapshot.issuedAt ||
          invoice.createdAt ||
          getPaymentEffectiveAt(payment),
        staffName:
          snapshot.payment?.staff?.name ||
          payment.staffAssigned?.name ||
          payment.reviewedBy?.name ||
          invoice.signatures?.salesName ||
          invoice.createdBy?.name ||
          "",
        paymentDate: getPaymentEffectiveAt(payment),
        paymentMethod: payment.method,
        paymentStatus: payment.status,
        splitPayments: payment.splitPayments || [],
        customer: {
          name:
            snapshot.customerName ||
            payment.customer?.name ||
            payment.order?.customerName ||
            "",
          email: snapshot.customerEmail || payment.customer?.email || "",
          phone: snapshot.customerPhone || "",
        },
        vehicle: {
          description: [vehicle.year, vehicle.make, vehicle.model]
            .filter(Boolean)
            .join(" "),
          plate: resolvePlainVehiclePlate(vehicle.plate || ""),
          color: vehicle.color || "",
          classification: vehicle.type || "",
        },
        servicePackage: snapshot.lineItems
          .map((line) => line.name)
          .filter(Boolean)
          .join(", "),
        coverage: resolveCustomerReceiptCoverage(
          snapshot,
          payment.order.pricingSnapshot,
        ),
        company: {
          name: COMPANY_BRANDING.brandName,
          address: COMPANY_BRANDING.address,
          phone: COMPANY_BRANDING.phone,
          email: COMPANY_BRANDING.email,
        },
        lineItems: snapshot.lineItems.map((line) => ({
          name: line.name,
          quantity: number(line.quantity ?? 1),
          unitPrice: number(line.unitPrice),
          amount: number(
            line.lineTotal ?? line.unitPrice * (line.quantity ?? 1),
          ),
        })),
        subtotal: number(computed.subtotal),
        discount: number(computed.discountTotal),
        tax: number(computed.taxVatTotal),
        additionalFees: number(computed.additionalFeesTotal),
        serviceTotal: number(computed.grandTotal),
        priorPayments,
        reservationFee,
        totalPaid: amountPaid,
        totalReceived: Math.round((priorPayments + amountPaid) * 100) / 100,
        balanceDue,
      },
    });
  } catch (error) {
    next(error);
  }
};
