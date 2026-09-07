import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowDownLeft,
  X,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Receipt,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { CustomerPaymentService } from "@/lib/customer-payment-service";
import {
  formatPaymentDate,
  matchesPaymentSearch,
  paymentRecordSummary,
  receiptAvailabilityMessage,
  paymentAmount,
  paymentDate,
  paymentMethodLabel,
  paymentMoney,
  paymentStatusDetails,
  paymentTypeLabel,
  type CustomerPaymentTransaction,
} from "@/lib/customer-payment-history";
import { sanitizeVehiclePlate } from "@/lib/vehicle-display";
import { CustomerReceiptDetails } from "./CustomerReceiptDetails";
import "./customer-payment-history.css";

const PAGE_SIZE = 10;

function Status({ transaction }: { transaction: CustomerPaymentTransaction }) {
  const status = paymentStatusDetails(transaction);
  return (
    <span className={`customer-payment-status is-${status.tone}`}>
      <span />
      {status.label}
    </span>
  );
}

const paymentMethodCopy = (method: string) => {
  const label = paymentMethodLabel(method);
  return label === "Not recorded" ? "Payment method not recorded" : `Paid via ${label}`;
};

const receiptActionLabel = (transaction: CustomerPaymentTransaction) =>
  transaction.transactionType === "reservation_fee"
    ? "View Reservation Receipt"
    : "View Receipt";

function PaymentHistoryLoadingRows() {
  return (
    <div
      className="customer-payment-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading payment history"
    >
      <span className="sr-only">Loading payment history</span>
      {Array.from({ length: 3 }, (_, row) => (
        <div className="customer-payment-skeleton-row" key={row} aria-hidden="true">
          {Array.from({ length: 6 }, (_, column) => (
            <span className={`customer-payment-skeleton-cell is-${column + 1}`} key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CustomerPaymentHistorySection() {
  const [params, setParams] = useSearchParams();
  const receiptId = params.get("paymentReceipt");
  const [data, setData] = useState<{
    transactions: CustomerPaymentTransaction[];
    totalPaid: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    CustomerPaymentService.getHistory(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Your payment history could not be loaded. Please try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  const filtered = useMemo(() => {
    const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    return (data?.transactions || [])
      .filter((transaction) => {
        return (
          matchesPaymentSearch(transaction, query) &&
          (status === "all" ||
            paymentStatusDetails(transaction).filter === status) &&
          (!cutoff || new Date(paymentDate(transaction)).getTime() >= cutoff)
        );
      })
      .sort(
        (a, b) =>
          new Date(paymentDate(b)).getTime() -
          new Date(paymentDate(a)).getTime(),
      );
  }, [data, query, status, range]);

  const summary = useMemo(
    () => paymentRecordSummary(data?.transactions || []),
    [data],
  );
  const filtersActive = Boolean(query || status !== "all" || range !== "all");
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setRange("all");
    setPage(1);
  };
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const receiptCount =
    data?.transactions.filter((transaction) => transaction.receiptAvailable)
      .length || 0;
  const receiptProcessing = Boolean(
    data?.transactions.some(
      (transaction) =>
        !transaction.receiptAvailable &&
        transaction.transactionType !== "refund" &&
        ["pending", "succeeded"].includes(transaction.paymentStatus),
    ),
  );
  const receiptSummary = !data?.transactions.length
    ? {
        primary: "Your payment records and official receipts.",
        secondary: "",
      }
    : receiptProcessing
      ? {
          primary: receiptCount
            ? `${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"} available`
            : "No receipts available yet",
          secondary: "Some payment records are still processing.",
        }
      : {
          primary: `${receiptCount} ${receiptCount === 1 ? "receipt" : "receipts"} ready to view and download`,
          secondary: "",
        };
  const openReceipt = (paymentId: string) => {
    const next = new URLSearchParams(params);
    next.set("section", "payments");
    next.set("paymentReceipt", paymentId);
    setParams(next);
  };
  const closeReceipt = () => {
    const next = new URLSearchParams(params);
    next.delete("paymentReceipt");
    setParams(next);
  };
  const action = (transaction: CustomerPaymentTransaction) => {
    const label = receiptActionLabel(transaction);
    return transaction.receiptAvailable ? (
      <button
        type="button"
        className="customer-payment-receipt-link"
        onClick={() => openReceipt(transaction.paymentId)}
        aria-label={`${label} for ${transaction.transactionId}`}
      >
        {label}
        <ArrowUpRight size={14} aria-hidden="true" />
      </button>
    ) : (
      <span className="customer-payment-unavailable">
        <span>{receiptAvailabilityMessage(transaction).title}</span>
        <small>{receiptAvailabilityMessage(transaction).detail}</small>
      </span>
    );
  };
  const description = (transaction: CustomerPaymentTransaction) =>
    (transaction.services || [])
      .filter((service) => service.name !== "Unassigned")
      .map((service) => service.name)
      .join(", ") || "Service payment";
  const amount = (transaction: CustomerPaymentTransaction) => (
    <>
      <strong
        className={
          transaction.transactionType === "refund"
            ? "customer-payment-refund-amount"
            : ""
        }
      >
        {paymentMoney(paymentAmount(transaction))}
      </strong>
      {!transaction.effectiveAt && <small>Submitted amount</small>}
    </>
  );

  if (receiptId)
    return (
      <CustomerReceiptDetails paymentId={receiptId} onBack={closeReceipt} />
    );

  return (
    <section
      className="customer-payments"
      aria-labelledby="customer-payment-title"
    >
      <header className="customer-payment-heading">
        <div>
          <p className="customer-payment-eyebrow">BILLING & RECEIPTS</p>
          <h1 id="customer-payment-title">Payment History</h1>
          <p>Review your payments, reservation receipts and official service receipts.</p>
        </div>
      </header>
      <div
        className="customer-payment-summary"
        aria-label="All-time payment summary"
      >
        <div className="customer-payment-summary-primary">
          <span>Total Paid</span>
          <strong>
            {loading || error ? "—" : paymentMoney(data?.totalPaid || 0)}
          </strong>
          <p>Payments received, less refunds</p>
        </div>
        <div>
          <span>Payments</span>
          <strong>
            {loading || error ? "—" : paymentMoney(summary.received)}
          </strong>
          <p>Verified payments · all time</p>
        </div>
        <div>
          <span>Refunds</span>
          <strong>
            {loading || error ? "—" : paymentMoney(summary.refunded)}
          </strong>
          <p>Returned payments · all time</p>
        </div>
      </div>
      <div className="customer-payment-panel">
        <div className="customer-payment-panel-heading">
          <div>
            <h2>
              Transactions
              {!loading && !error && (
                <span className="customer-payment-count">
                  {data?.transactions.length || 0}
                </span>
              )}
            </h2>
            <p className="customer-payment-receipt-summary">
              <span>{!loading && !error ? receiptSummary.primary : "Your payment records and official receipts."}</span>
              {!loading && !error && receiptSummary.secondary && (
                <small>{receiptSummary.secondary}</small>
              )}
            </p>
          </div>
          <button
            type="button"
            className="customer-payment-icon-button"
            aria-label="Refresh payment history"
            disabled={loading}
            onClick={() => setReload((value) => value + 1)}
          >
            <RefreshCw
              size={16}
              className={loading ? "customer-payment-spinning" : ""}
            />
          </button>
        </div>
        <div className="customer-payment-toolbar">
          <label className="customer-payment-search">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search transactions"
              placeholder="Search payments or receipts"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
            {query && (
              <button
                className="customer-payment-clear-search"
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setPage(1);
                }}
              >
                <X size={14} />
              </button>
            )}
          </label>
          <div className="customer-payment-filters">
            <label>
              <SlidersHorizontal size={15} aria-hidden="true" />
              <span className="sr-only">Payment status</span>
              <select
                aria-label="Payment status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All payments</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
                <option value="failed">Not completed</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Date range</span>
              <select
                aria-label="Date range"
                value={range}
                onChange={(event) => {
                  setRange(event.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All time</option>
                <option value="30">Last 30 days</option>
                <option value="365">Last 12 months</option>
              </select>
            </label>
          </div>
        </div>
        {filtersActive && !loading && !error && (
          <div className="customer-payment-filter-summary">
            <span role="status">
              {filtered.length} matching{" "}
              {filtered.length === 1 ? "transaction" : "transactions"}
            </span>
            <button type="button" onClick={clearFilters}>
              Clear filters
              <X size={12} />
            </button>
          </div>
        )}
        {loading ? (
          <PaymentHistoryLoadingRows />
        ) : error ? (
          <div className="customer-payment-empty" role="alert">
            <Receipt size={28} />
            <h3>Unable to load payments.</h3>
            <p>Please try again.</p>
            <button
              className="customer-payment-button"
              onClick={() => setReload((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : !filtered.length ? (
          <div className="customer-payment-empty">
            <Receipt size={30} />
            <h3>
              {data?.transactions.length
                ? "No matching transactions"
                : "No payment records yet"}
            </h3>
            <p>
              {data?.transactions.length
                ? "Try a different search or clear your filters."
                : "Your completed payments and receipts will appear here."}
            </p>
            {data?.transactions.length ? (
              <button
                className="customer-payment-button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="customer-payment-table-wrap">
              <table className="customer-payment-table">
                <caption className="sr-only">
                  Customer payment transactions
                </caption>
                <colgroup>
                  <col className="customer-payment-col-date" />
                  <col className="customer-payment-col-service" />
                  <col className="customer-payment-col-info" />
                  <col className="customer-payment-col-amount" />
                  <col className="customer-payment-col-status" />
                  <col className="customer-payment-col-receipt" />
                </colgroup>
                <thead>
                  <tr>
                    <th aria-sort="descending">
                      <span className="customer-payment-date-label">
                        Date
                        <ArrowDown size={12} aria-hidden="true" />
                      </span>
                    </th>
                    <th className="is-service">Service &amp; Vehicle</th>
                    <th className="is-payment-info">Payment Info</th>
                    <th className="is-amount">Amount</th>
                    <th className="is-status">Status</th>
                    <th className="is-receipt">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((transaction) => (
                    <tr key={transaction.paymentId}>
                      <td className="customer-payment-date">
                        {formatPaymentDate(paymentDate(transaction))}
                        <small>
                          {transaction.effectiveAt
                            ? "Payment date"
                            : "Submitted"}
                        </small>
                      </td>
                      <td className="is-service">
                        <strong className="customer-payment-cell-primary">
                          {description(transaction)}
                        </strong>
                        <span className="customer-payment-cell-secondary">
                          {transaction.vehicleInfo || "Not recorded"}
                        </span>
                        {sanitizeVehiclePlate(transaction.vehiclePlate) && (
                          <small className="customer-payment-reference">
                            {sanitizeVehiclePlate(transaction.vehiclePlate)}
                          </small>
                        )}
                      </td>
                      <td className="is-payment-info">
                        <span className="customer-payment-cell-primary">
                          {paymentTypeLabel(transaction.transactionType)}
                        </span>
                        <small className="customer-payment-cell-secondary">
                          {paymentMethodCopy(transaction.method)}
                        </small>
                      </td>
                      <td className="is-amount">{amount(transaction)}</td>
                      <td className="is-status">
                        <Status transaction={transaction} />
                      </td>
                      <td className="is-receipt">{action(transaction)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="customer-payment-cards">
              {visible.map((transaction) => (
                <article
                  className="customer-payment-card"
                  key={transaction.paymentId}
                >
                  <div className="customer-payment-card-top">
                    <span>{formatPaymentDate(paymentDate(transaction))}</span>
                    <Status transaction={transaction} />
                  </div>
                  <div className="customer-payment-card-title">
                    <div>
                      <h3>{description(transaction)}</h3>
                      <p>
                        {transaction.vehicleInfo || "Vehicle not recorded"}
                        {sanitizeVehiclePlate(transaction.vehiclePlate)
                          ? ` · ${sanitizeVehiclePlate(transaction.vehiclePlate)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>Transaction Type</dt>
                      <dd>{paymentTypeLabel(transaction.transactionType)}</dd>
                    </div>
                    <div>
                      <dt>Payment Method</dt>
                      <dd>{paymentMethodCopy(transaction.method)}</dd>
                    </div>
                    {transaction.receiptNumber && (
                      <div>
                        <dt>Receipt Number</dt>
                        <dd className="customer-payment-reference">
                          {transaction.receiptNumber}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Transaction Number</dt>
                      <dd className="customer-payment-reference">
                        {transaction.transactionId}
                      </dd>
                    </div>
                  </dl>
                  <div className="customer-payment-card-footer">
                    <div className="customer-payment-card-amount">
                      {transaction.transactionType === "refund" && (
                        <ArrowDownLeft size={15} />
                      )}
                      {amount(transaction)}
                    </div>
                    {action(transaction)}
                  </div>
                </article>
              ))}
            </div>
            <footer className="customer-payment-pagination">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} transactions
              </span>
              <div>
                <button
                  className="customer-payment-icon-button"
                  aria-label="Previous page"
                  disabled={currentPage === 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span>
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  className="customer-payment-icon-button"
                  aria-label="Next page"
                  disabled={currentPage === pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
      <p className="customer-payment-footnote">
        <Receipt size={14} aria-hidden="true" />
        Only verified payments count toward your totals. Official receipts
        appear once issued.
      </p>
    </section>
  );
}
