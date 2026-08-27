import dotenv from 'dotenv';
import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifyLegacyPaidOrder,
  firstPositiveEvidenceAmount,
  inferReconciledTransactionType,
} from '../services/ledgerReconciliation.service.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, '..', '.env'), override: false });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const backupConfirmed = args.has('--backup-confirmed');
if (apply && !backupConfirmed) {
  throw new Error('Apply mode requires --backup-confirmed after a verified database backup.');
}
if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY is not configured.');

const [{ default: Payment }, { default: Order }, { default: InvoiceRecord }, { default: ActivityLog }] = await Promise.all([
  import('../models/payment.model.js'),
  import('../models/order.model.js'),
  import('../models/invoiceRecord.model.js'),
  import('../models/activityLog.model.js'),
]);

const firstPositive = firstPositiveEvidenceAmount;

const report = {
  mode: apply ? 'apply' : 'dry-run',
  generatedAt: new Date().toISOString(),
  rules: {
    orderPaymentFlagsAreEvidence: false,
    requiredBackfillEvidence: ['amount', 'method', 'date'],
    refundsInvented: false,
  },
  summary: {
    succeededPaymentsReviewed: 0,
    succeededPaymentsEnriched: 0,
    provablePaymentsBackfilled: 0,
    ambiguousOrdersExcluded: 0,
    cancelledOrRejectedPaymentsFlagged: 0,
  },
  enrichments: [],
  backfills: [],
  exceptions: [],
  reviewFlags: [],
};

await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  const succeeded = await Payment.find({ status: 'succeeded' }).populate('order', 'status orderNumber bookingReference');
  report.summary.succeededPaymentsReviewed = succeeded.length;
  for (const payment of succeeded) {
    const amountVerified = firstPositive(payment.amountVerified, payment.amountPaid, payment.amount);
    const effectiveAt = payment.effectiveAt || payment.reviewedAt || payment.createdAt;
    const transactionType = inferReconciledTransactionType(payment);
    const changes = {};
    if (payment.amountVerified == null && amountVerified > 0) changes.amountVerified = amountVerified;
    if (!payment.amountSubmitted && amountVerified > 0) changes.amountSubmitted = amountVerified;
    if (!payment.effectiveAt && effectiveAt) changes.effectiveAt = effectiveAt;
    if (!payment.submittedAt) changes.submittedAt = payment.createdAt;
    if (!payment.transactionType) changes.transactionType = transactionType;
    if (Object.keys(changes).length) {
      report.summary.succeededPaymentsEnriched += 1;
      report.enrichments.push({ paymentId: String(payment._id), invoiceId: payment.invoiceId, changes });
      if (apply) await Payment.updateOne({ _id: payment._id }, { $set: changes });
    }
    const bookingStatus = String(payment.order?.status || '');
    if (['cancelled', 'rejected'].includes(bookingStatus)) {
      report.summary.cancelledOrRejectedPaymentsFlagged += 1;
      report.reviewFlags.push({
        paymentId: String(payment._id),
        invoiceId: payment.invoiceId,
        orderId: String(payment.order?._id || payment.order),
        bookingStatus,
        amountVerified,
        note: 'Financial history retained; review whether an explicit refund is required.',
      });
    }
  }

  const paidFlagOrders = await Order.find({
    $or: [
      { paymentStatus: 'paid' },
      { status: { $in: ['paid', 'released'] } },
    ],
  });
  const orderIds = paidFlagOrders.map((order) => order._id);
  const [existingPayments, invoices, activities] = await Promise.all([
    Payment.find({
      order: { $in: orderIds },
      status: 'succeeded',
      transactionType: { $ne: 'refund' },
    }).select('order'),
    InvoiceRecord.find({ order: { $in: orderIds } }).sort({ createdAt: -1 }),
    ActivityLog.find({
      'metadata.orderId': { $in: orderIds },
      type: { $in: ['payment_success', 'payment_completed', 'pos_transaction'] },
    }).sort({ createdAt: -1 }),
  ]);
  const hasPayment = new Set(existingPayments.map((row) => String(row.order)));
  const invoiceByOrder = new Map();
  invoices.forEach((invoice) => {
    const key = String(invoice.order);
    if (!invoiceByOrder.has(key)) invoiceByOrder.set(key, invoice);
  });
  const activityByOrder = new Map();
  activities.forEach((activity) => {
    const key = String(activity.metadata?.orderId || '');
    if (key && !activityByOrder.has(key)) activityByOrder.set(key, activity);
  });

  for (const order of paidFlagOrders) {
    const orderId = String(order._id);
    if (hasPayment.has(orderId)) continue;
    const classification = classifyLegacyPaidOrder({
      hasPostedPayment: false,
      invoice: invoiceByOrder.get(orderId),
      activity: activityByOrder.get(orderId),
    });
    if (classification.classification === 'ambiguous') {
      report.summary.ambiguousOrdersExcluded += 1;
      report.exceptions.push({
        orderId,
        orderNumber: order.orderNumber,
        bookingReference: order.bookingReference,
        status: order.status,
        paymentStatus: order.paymentStatus,
        serviceTotal: firstPositive(order.serviceTotal, order.totalPrice, order.totalAmount),
        missingEvidence: classification.missingEvidence,
        note: 'Excluded from collected revenue. An Order paid flag alone is not financial evidence.',
      });
      continue;
    }
    const evidence = classification.evidence;

    const invoiceId = `REC-${orderId}`;
    const payload = {
      invoiceId,
      order: order._id,
      customer: order.customer,
      vehicle: order.vehicle || null,
      service: order.serviceId || null,
      amount: evidence.amount,
      amountSubmitted: evidence.amount,
      amountVerified: evidence.amount,
      status: 'succeeded',
      transactionType: evidence.amount + 0.009 >= firstPositive(order.serviceTotal, order.totalPrice, order.totalAmount)
        ? 'full_service_payment'
        : 'service_balance',
      method: evidence.method,
      provider: 'reconciliation',
      providerReference: evidence.source,
      submittedAt: evidence.date,
      reviewedAt: evidence.date,
      effectiveAt: evidence.date,
      metadata: {
        reconciled: true,
        evidenceSource: evidence.source,
        evidenceInvoiceNumber: evidence.invoiceNumber || null,
      },
    };
    report.summary.provablePaymentsBackfilled += 1;
    report.backfills.push({ orderId, invoiceId, amount: evidence.amount, method: evidence.method, effectiveAt: evidence.date, evidence: evidence.source });
    if (apply) await Payment.updateOne({ invoiceId }, { $setOnInsert: payload }, { upsert: true });
  }

  if (apply) await Promise.all([Payment.syncIndexes(), Order.syncIndexes()]);

  const outputDir = path.resolve(scriptDir, '..', 'audit_artifacts');
  await fs.mkdir(outputDir, { recursive: true });
  const stamp = report.generatedAt.replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `financial-ledger-reconciliation-${stamp}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ...report.summary, mode: report.mode, report: outputPath }, null, 2));
} finally {
  await mongoose.disconnect();
}
