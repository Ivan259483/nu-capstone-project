import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import InvoiceRecord from "../models/invoiceRecord.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Vehicle from "../models/vehicle.model.js";
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

/** Lightweight receipt availability lookup for payment-history lists. */
export async function findCustomerPaymentInvoiceMetadata(payments) {
  const eligible = payments.filter((payment) =>
    customerReceiptEligible(payment) && payment.transactionType !== "reservation_fee",
  );
  if (!eligible.length) return new Map();

  const paymentIds = eligible.map((payment) => payment._id);
  const invoiceIds = eligible.map((payment) => payment.invoiceRecord).filter(Boolean);
  const invoices = await InvoiceRecord.aggregate([
    {
      $match: {
        $or: [
          { payment: { $in: paymentIds } },
          { _id: { $in: invoiceIds } },
        ],
      },
    },
    {
      $project: {
        invoiceNumber: 1,
        order: 1,
        payment: 1,
        hasLineItems: {
          $gt: [{ $size: { $ifNull: ["$snapshot.lineItems", []] } }, 0],
        },
        hasComputed: { $ne: [{ $ifNull: ["$snapshot.computed", null] }, null] },
      },
    },
  ]);

  const result = new Map();
  for (const payment of eligible) {
    const invoice = invoices.find((candidate) => {
      const sameOrder = String(candidate.order) === String(payment.order?._id || payment.order);
      const samePayment = candidate.payment
        ? String(candidate.payment) === String(payment._id)
        : String(candidate._id) === String(payment.invoiceRecord);
      return sameOrder && samePayment && candidate.hasLineItems && candidate.hasComputed;
    });
    if (invoice) result.set(String(payment._id), invoice);
  }
  return result;
}

const RECEIPT_PAYMENT_FIELDS = [
  "_id",
  "invoiceId",
  "invoiceRecord",
  "order",
  "customer",
  "vehicle",
  "service",
  "amount",
  "amountSubmitted",
  "amountVerified",
  "amountPaid",
  "balanceRemaining",
  "status",
  "transactionType",
  "method",
  "splitPayments",
  "submittedAt",
  "effectiveAt",
  "reviewedAt",
  "reviewedBy",
  "staffAssigned",
  "createdAt",
].join(" ");

const RECEIPT_ORDER_FIELDS = [
  "_id",
  "orderNumber",
  "bookingReference",
  "customer",
  "customerName",
  "customerPhone",
  "serviceType",
  "vehicle",
  "vehicleYear",
  "vehicleMake",
  "vehicleModel",
  "vehicleColor",
  "vehiclePlate",
  "pricingSnapshot",
].join(" ");

const RECEIPT_VEHICLE_FIELDS =
  "_id year make model color plateNumber vehicleType";

const receiptError = (res, status, code, message) =>
  res.status(status).json({ success: false, code, message });

/** Read only, customer-owned receipt for one specific payment. */
export const getMyPaymentReceipt = async (req, res, next) => {
  const receiptStartedAt = performance.now();
  const receiptStartedIso = new Date().toISOString();
  const receiptTimings = {
    transactionLookup: 0,
    paymentLookup: 0,
    orderLookup: 0,
    customerLookup: 0,
    vehicleLookup: 0,
    serviceLookup: 0,
    invoiceLookup: 0,
    populateRelations: 0,
    receiptPayload: 0,
    htmlGeneration: 0,
    pdfGeneration: 0,
    externalAssets: 0,
  };
  let receiptContext = {
    paymentId: String(req.params.paymentId || ""),
    transactionId: "unknown",
    orderId: "unknown",
  };
  let receiptLogged = false;
  const endpointUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const logReceiptComplete = (outcome) => {
    if (receiptLogged) return;
    receiptLogged = true;
    const responseStatus = outcome === "connection_closed" && !res.headersSent
      ? "no response"
      : String(res.statusCode);
    console.info(
      `[RECEIPT] complete outcome=${outcome}\n` +
      `receipt/payment id: ${receiptContext.paymentId}\n` +
      `transaction id: ${receiptContext.transactionId}\n` +
      `booking/order id: ${receiptContext.orderId}\n` +
      `endpoint URL: ${endpointUrl}\n` +
      `start time: ${receiptStartedIso}\n` +
      `response time: ${(performance.now() - receiptStartedAt).toFixed(1)} ms\n` +
      `HTTP status: ${responseStatus}\n` +
      `find transaction: ${receiptTimings.transactionLookup.toFixed(1)} ms\n` +
      `find payment: ${receiptTimings.paymentLookup.toFixed(1)} ms\n` +
      `find order/booking: ${receiptTimings.orderLookup.toFixed(1)} ms\n` +
      `find customer: ${receiptTimings.customerLookup.toFixed(1)} ms\n` +
      `find vehicle: ${receiptTimings.vehicleLookup.toFixed(1)} ms\n` +
      `find service: ${receiptTimings.serviceLookup.toFixed(1)} ms\n` +
      `find receipt/invoice: ${receiptTimings.invoiceLookup.toFixed(1)} ms\n` +
      `populate relations: ${receiptTimings.populateRelations.toFixed(1)} ms\n` +
      `generate receipt payload: ${receiptTimings.receiptPayload.toFixed(1)} ms\n` +
      `generate HTML: ${receiptTimings.htmlGeneration.toFixed(1)} ms\n` +
      `generate PDF: ${receiptTimings.pdfGeneration.toFixed(1)} ms\n` +
      `external asset/image fetches: ${receiptTimings.externalAssets.toFixed(1)} ms\n` +
      `total endpoint duration: ${(performance.now() - receiptStartedAt).toFixed(1)} ms`,
    );
  };
  console.info(
    `[RECEIPT] start receipt/payment id=${receiptContext.paymentId} endpoint=${endpointUrl} start=${receiptStartedIso}`,
  );
  res.once("finish", () => logReceiptComplete("finished"));
  res.once("close", () => logReceiptComplete("connection_closed"));
  try {
    if (!mongoose.isValidObjectId(req.params.paymentId)) {
      return receiptError(
        res,
        400,
        "RECEIPT_INVALID_REFERENCE",
        "Invalid receipt reference.",
      );
    }

    const paymentStartedAt = performance.now();
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      customer: req.user.id,
    })
      .select(RECEIPT_PAYMENT_FIELDS)
      .lean();
    receiptTimings.paymentLookup = performance.now() - paymentStartedAt;
    if (!payment)
      return receiptError(
        res,
        404,
        "RECEIPT_NOT_FOUND",
        "Receipt could not be found.",
      );

    receiptContext = {
      paymentId: String(payment._id),
      transactionId: String(payment.invoiceId || payment._id),
      orderId: String(payment.order || "unknown"),
    };
    if (!customerReceiptEligible(payment))
      return receiptError(
        res,
        404,
        "RECEIPT_NOT_FOUND",
        "Receipt could not be found.",
      );

    const orderPromise = (async () => {
      const startedAt = performance.now();
      const result = await Order.findOne({
        _id: payment.order,
        customer: req.user.id,
      }).select(RECEIPT_ORDER_FIELDS);
      receiptTimings.orderLookup = performance.now() - startedAt;
      return result;
    })();
    const customerPromise = (async () => {
      const startedAt = performance.now();
      const result = await User.findById(payment.customer)
        .select(`name email ${USER_PHONE_SELECT_FIELDS}`);
      receiptTimings.customerLookup = performance.now() - startedAt;
      return result;
    })();
    const staffPromise = payment.staffAssigned
      ? User.findById(payment.staffAssigned).select("name").lean()
      : null;
    const reviewerPromise = payment.reviewedBy
      ? User.findById(payment.reviewedBy).select("name").lean()
      : null;
    const relationsPromise = (async () => {
      const startedAt = performance.now();
      const result = await Promise.all([staffPromise, reviewerPromise]);
      receiptTimings.populateRelations += performance.now() - startedAt;
      return result;
    })();
    const [orderDocument, customerDocument, [staff, reviewer]] =
      await Promise.all([
        orderPromise,
        customerPromise,
        relationsPromise,
      ]);

    if (!orderDocument)
      return receiptError(
        res,
        404,
        "RECEIPT_ORDER_MISSING",
        "Order for this receipt could not be found.",
      );
    if (!customerDocument)
      return receiptError(
        res,
        404,
        "RECEIPT_CUSTOMER_MISSING",
        "Customer for this receipt could not be found.",
      );

    const order = orderDocument.toObject();
    const customer = customerDocument.toObject();
    const vehicleStartedAt = performance.now();
    const vehicleId = payment.vehicle || order.vehicle;
    const vehicleDocument = vehicleId
      ? await Vehicle.findById(vehicleId).select(RECEIPT_VEHICLE_FIELDS).lean()
      : null;
    receiptTimings.vehicleLookup = performance.now() - vehicleStartedAt;
    if (vehicleDocument) order.vehicle = vehicleDocument;

    const acknowledgementNumber = reservationReceiptNumber(payment);
    if (acknowledgementNumber) {
      const snapshot = hydrateReceiptSnapshot({}, {
        ...order,
        customer,
      });
      const vehicle = snapshot.vehicle;
      if (![vehicle.year, vehicle.make, vehicle.model, vehicle.plate].some(Boolean))
        return receiptError(
          res,
          422,
          "RECEIPT_VEHICLE_MISSING",
          "Vehicle snapshot missing for this receipt.",
        );
      if (!order.serviceType)
        return receiptError(
          res,
          422,
          "RECEIPT_SERVICE_MISSING",
          "Service snapshot missing for this receipt.",
        );
      const amount = getVerifiedAmount(payment);
      const payloadStartedAt = performance.now();
      const payload = {
        receiptKind: "reservation_payment",
        receiptNumber: acknowledgementNumber,
        transactionNumber: payment.invoiceId,
        transactionType: payment.transactionType,
        bookingReference: order.bookingReference || "",
        orderNumber: order.orderNumber || "",
        issuedAt: getPaymentEffectiveAt(payment),
        paymentDate: getPaymentEffectiveAt(payment),
        staffName: reviewer?.name || staff?.name || "",
        paymentMethod: payment.method,
        paymentStatus: payment.status,
        splitPayments: payment.splitPayments || [],
        customer: {
          name: customer.name || order.customerName || "",
          email: customer.email || "",
          phone: snapshot.customerPhone || "",
        },
        vehicle: {
          description: [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" "),
          plate: resolvePlainVehiclePlate(vehicle.plate || ""),
          color: vehicle.color || "",
          classification: vehicle.type || "",
        },
        servicePackage: order.serviceType,
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
        notes: [
          `Service: ${order.serviceType}.`,
          "Acknowledgement of your initial booking payment. This reservation fee is credited toward your service bill.",
        ].join(" "),
      };
      receiptTimings.receiptPayload = performance.now() - payloadStartedAt;
      res.setHeader("Cache-Control", "private, no-store");
      return res.json({ success: true, data: payload });
    }

    const invoiceStartedAt = performance.now();
    const invoiceReferenceMatch = payment.invoiceRecord
      ? {
          _id: payment.invoiceRecord,
          $or: [
            { payment: payment._id },
            { payment: null },
            { payment: { $exists: false } },
          ],
        }
      : null;
    const invoice = await InvoiceRecord.findOne({
      order: payment.order,
      $or: [
        { payment: payment._id },
        ...(invoiceReferenceMatch ? [invoiceReferenceMatch] : []),
      ],
    })
      .select("invoiceNumber order payment snapshot createdAt createdBy signatures.salesName")
      .lean();
    receiptTimings.invoiceLookup = performance.now() - invoiceStartedAt;
    if (
      !invoice ||
      !invoice.snapshot?.lineItems?.length ||
      !invoice.snapshot?.computed
    )
      return receiptError(
        res,
        404,
        "RECEIPT_NOT_FOUND",
        "Receipt could not be found.",
      );

    const invoiceCreatorStartedAt = performance.now();
    const invoiceCreator = invoice.createdBy
      ? await User.findById(invoice.createdBy).select("name").lean()
      : null;
    receiptTimings.populateRelations +=
      performance.now() - invoiceCreatorStartedAt;

    const payloadStartedAt = performance.now();
    const snapshot = hydrateReceiptSnapshot(invoice.snapshot, {
      ...order,
      customer,
    });
    const computed = snapshot.computed;
    const vehicle = snapshot.vehicle || {};
    const number = (value) =>
      Number.isFinite(Number(value)) ? Number(value) : 0;
    const transactionStartedAt = performance.now();
    const orderPayments = await Payment.find({
      order: payment.order,
      customer: req.user.id,
    })
      .select(
        "transactionType status amount amountVerified amountPaid effectiveAt reviewedAt createdAt relatedPayment",
      )
      .lean();
    receiptTimings.transactionLookup = performance.now() - transactionStartedAt;
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
    receiptTimings.receiptPayload = performance.now() - payloadStartedAt;
    res.setHeader("Cache-Control", "private, no-store");
    return res.json({
      success: true,
      data: {
        receiptKind: "official_service",
        receiptNumber: invoice.invoiceNumber,
        transactionNumber: payment.invoiceId,
        transactionType: payment.transactionType,
        bookingReference:
          snapshot.bookingReference || order.bookingReference || "",
        orderNumber: snapshot.orderNumber || order.orderNumber || "",
        issuedAt:
          snapshot.issuedAt ||
          invoice.createdAt ||
          getPaymentEffectiveAt(payment),
        staffName:
          snapshot.payment?.staff?.name ||
          staff?.name ||
          reviewer?.name ||
          invoice.signatures?.salesName ||
          invoiceCreator?.name ||
          "",
        paymentDate: getPaymentEffectiveAt(payment),
        paymentMethod: payment.method,
        paymentStatus: payment.status,
        splitPayments: payment.splitPayments || [],
        customer: {
          name:
            snapshot.customerName ||
            customer.name ||
            order.customerName ||
            "",
          email: snapshot.customerEmail || customer.email || "",
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
          order.pricingSnapshot,
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
    console.error("[RECEIPT] details failed", {
      paymentId: receiptContext.paymentId,
      transactionId: receiptContext.transactionId,
      orderId: receiptContext.orderId,
      message: error?.message || String(error),
    });
    if (res.headersSent) return next(error);
    return receiptError(
      res,
      500,
      "RECEIPT_DETAILS_FAILED",
      "Receipt details could not be loaded.",
    );
  }
};
