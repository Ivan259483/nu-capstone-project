export const reconciliationMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export const firstPositiveEvidenceAmount = (...values) => {
  for (const value of values) {
    const amount = reconciliationMoney(value);
    if (amount > 0) return amount;
  }
  return 0;
};

export const normalizeEvidenceMethod = (value) => {
  const method = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['card', 'gcash', 'maya', 'cash', 'other', 'split'].includes(method) ? method : null;
};

export const inferReconciledTransactionType = (payment) => {
  if (payment?.transactionType) return payment.transactionType;
  const amount = firstPositiveEvidenceAmount(payment?.amountVerified, payment?.amountPaid, payment?.amount);
  const grandTotal = firstPositiveEvidenceAmount(payment?.grandTotal, payment?.subtotal);
  if (reconciliationMoney(payment?.downpayment) > 0 || (grandTotal > 0 && amount < grandTotal)) {
    return 'service_balance';
  }
  return 'full_service_payment';
};

export const invoicePaymentEvidence = (invoice) => {
  const snapshot = invoice?.snapshot || {};
  const payment = snapshot.payment || {};
  return {
    // An invoice's quoted balance is intentionally excluded: only an immutable
    // collection/payment snapshot establishes that money changed hands.
    amount: firstPositiveEvidenceAmount(
      payment.amountCollected,
      payment.amountPaid,
      snapshot.amountCollected,
      snapshot.amountPaid,
    ),
    method: normalizeEvidenceMethod(payment.method || payment.paymentMethod || snapshot.paymentMethod),
    date: invoice?.createdAt || null,
    source: invoice ? `InvoiceRecord:${invoice._id}` : null,
    invoiceNumber: invoice?.invoiceNumber || null,
  };
};

export const immutableActivityPaymentEvidence = (activity) => ({
  amount: firstPositiveEvidenceAmount(activity?.metadata?.amount, activity?.metadata?.amountCollected),
  method: normalizeEvidenceMethod(activity?.metadata?.method || activity?.metadata?.paymentMethod),
  date: activity?.createdAt || null,
  source: activity ? `ActivityLog:${activity._id}` : null,
  invoiceNumber: activity?.metadata?.invoiceId || activity?.referenceId || null,
});

export const hasCompletePaymentEvidence = (evidence) => Boolean(
  evidence?.amount > 0 && evidence?.method && evidence?.date
);

export const classifyLegacyPaidOrder = ({ hasPostedPayment, invoice = null, activity = null }) => {
  if (hasPostedPayment) return { classification: 'already_recorded', evidence: null, missingEvidence: [] };
  const invoiceEvidence = invoicePaymentEvidence(invoice);
  const activityEvidence = immutableActivityPaymentEvidence(activity);
  const evidence = hasCompletePaymentEvidence(invoiceEvidence)
    ? invoiceEvidence
    : hasCompletePaymentEvidence(activityEvidence)
      ? activityEvidence
      : null;
  if (evidence) return { classification: 'provable', evidence, missingEvidence: [] };
  return {
    classification: 'ambiguous',
    evidence: null,
    missingEvidence: [
      !(invoiceEvidence.amount || activityEvidence.amount) ? 'amount' : null,
      !(invoiceEvidence.method || activityEvidence.method) ? 'method' : null,
      !(invoiceEvidence.date || activityEvidence.date) ? 'date' : null,
    ].filter(Boolean),
  };
};
