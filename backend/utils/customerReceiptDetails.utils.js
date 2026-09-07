import {
  SPF_CATALOG_VERSION,
  SPF_PACKAGE_PRICING,
} from "../constants/spfPricing.js";
import {
  getPaymentEffectiveAt,
  getSignedAmount,
  getVerifiedAmount,
  roundMoney,
} from "../services/financialLedger.service.js";

const textList = (value) =>
  (Array.isArray(value) ? value : [value])
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());

export function resolveCustomerReceiptCoverage(snapshot, pricingSnapshot) {
  const saved = textList(snapshot.coverage);
  if (saved.length) return saved;
  const lineCoverage = (snapshot.lineItems || []).flatMap((line) =>
    textList(line.coverage),
  );
  if (lineCoverage.length) return [...new Set(lineCoverage)];
  // Only an immutable booking snapshot for this exact catalog edition can
  // identify historical protection. Never apply today's offer to older sales.
  if (pricingSnapshot?.catalogVersion !== SPF_CATALOG_VERSION) return [];
  const pkg = Object.values(SPF_PACKAGE_PRICING).find(
    (entry) => entry.packageCode === pricingSnapshot.packageCode,
  );
  if (!pkg) return [];
  const card = pkg.catalogCard;
  return [
    ...textList(card.warrantyLabel),
    ...(card.ppfCoverage?.length
      ? [`PPF: ${card.ppfCoverage.join(", ")}`]
      : []),
    ...(card.tintIncluded && card.tintDetails
      ? [`Window tint: ${card.tintDetails}`]
      : []),
    ...(card.undercoatingIncluded ? textList(card.undercoatingDetails) : []),
  ];
}

function priorReceiptPayments(payment, payments) {
  const cutoff = new Date(getPaymentEffectiveAt(payment)).getTime();
  return payments.filter((row) => {
    const date = getPaymentEffectiveAt(row);
    return (
      String(row._id) !== String(payment._id) &&
      date &&
      new Date(date).getTime() <= cutoff
    );
  });
}

export function resolveReceiptPriorPayments(snapshot, payment, payments) {
  const saved = Math.max(0, Number(snapshot.downpayment) || 0);
  if (saved || payment.transactionType !== "service_balance") return saved;
  const prior = roundMoney(priorReceiptPayments(payment, payments)
    .reduce((sum, row) => sum + getSignedAmount(row), 0));
  const serviceTotal = Number(snapshot.computed?.grandTotal) || 0;
  // Some historical invoices omitted the credit. Recover it only when the
  // verified ledger proves that the prior payments plus this balance settle
  // the saved service total exactly. Never infer a hardcoded reservation fee.
  return prior > 0 && Math.abs(prior + getVerifiedAmount(payment) - serviceTotal) < 0.009
    ? prior
    : 0;
}

export function resolveReceiptReservationFee(snapshot, payment, payments) {
  const credit = Math.max(0, Number(snapshot.downpayment) || 0);
  if (!credit) return 0;
  const prior = priorReceiptPayments(payment, payments);
  const priorTotal = roundMoney(
    prior.reduce((sum, row) => sum + getSignedAmount(row), 0),
  );
  if (Math.abs(priorTotal - credit) > 0.009) return null;
  const reservations = new Set(
    prior
      .filter((row) => row.transactionType === "reservation_fee")
      .map((row) => String(row._id)),
  );
  const reservationTotal = roundMoney(
    prior.reduce((sum, row) => {
      const isReservation = row.transactionType === "reservation_fee";
      const reservationRefund =
        row.transactionType === "refund" &&
        reservations.has(String(row.relatedPayment));
      return (
        sum + (isReservation || reservationRefund ? getSignedAmount(row) : 0)
      );
    }, 0),
  );
  return Math.min(credit, Math.max(0, reservationTotal));
}
