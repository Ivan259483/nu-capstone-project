import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  Printer,
  Receipt,
  RefreshCw,
} from "lucide-react";
import { CustomerPaymentService } from "@/lib/customer-payment-service";
import {
  officialReceiptFromCustomerPayment,
  type CustomerPaymentReceipt,
} from "@/lib/customer-payment-history";
import {
  buildDetailedReceiptHtml,
  createDetailedReceiptPdfBlob,
  printDetailedReceipt,
} from "@/lib/receipt-document";

const receiptFileName = (receiptNumber: string) =>
  `AutoSPF-Receipt-${receiptNumber.replace(/[^a-z0-9_-]/gi, "-")}.pdf`;

export function CustomerReceiptDetails({
  paymentId,
  onBack,
}: {
  paymentId: string;
  onBack: () => void;
}) {
  const [receipt, setReceipt] = useState<CustomerPaymentReceipt | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [retry, setRetry] = useState(0);
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfRetry, setPdfRetry] = useState(0);
  const [pdfError, setPdfError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const officialReceipt = useMemo(
    () => (receipt ? officialReceiptFromCustomerPayment(receipt) : null),
    [receipt],
  );
  const officialReceiptHtml = useMemo(
    () => (officialReceipt ? buildDetailedReceiptHtml(officialReceipt) : ""),
    [officialReceipt],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [paymentId]);

  useEffect(() => {
    const controller = new AbortController();
    setReceipt(null);
    setError("");
    setActionError("");
    CustomerPaymentService.getReceipt(paymentId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReceipt(data);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted)
          setError(
            requestError.response?.data?.message ||
              requestError.message ||
              "Could not load this receipt.",
          );
      });
    return () => controller.abort();
  }, [paymentId, retry]);

  useEffect(() => {
    let cancelled = false;
    let url = "";
    setPdfUrl("");
    setPdfError("");
    if (officialReceipt) {
      createDetailedReceiptPdfBlob(officialReceipt)
        .then((blob) => {
          if (!cancelled) {
            url = URL.createObjectURL(blob);
            setPdfUrl(url);
          }
        })
        .catch(() => {
          if (!cancelled)
            setPdfError(
              "The PDF could not be prepared. You can still print this receipt.",
            );
        });
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [officialReceipt, pdfRetry]);

  const print = () => {
    if (!officialReceipt) return;
    setActionError("");
    try {
      printDetailedReceipt(officialReceipt);
    } catch {
      setActionError("The receipt could not be opened for printing.");
    }
  };

  return (
    <section
      className="customer-payments customer-receipt-page"
      aria-labelledby="customer-receipt-title"
    >
      <button className="customer-payment-back" type="button" onClick={onBack}>
        <ArrowLeft size={16} />
        Back to Payment History
      </button>
      <header className="customer-payment-heading">
        <div>
          <p className="customer-payment-eyebrow">BILLING &amp; RECEIPTS</p>
          <h1 id="customer-receipt-title" tabIndex={-1} ref={headingRef}>
            Receipt Details
          </h1>
          <p>{receipt?.transactionType === "reservation_fee"
            ? "Your AutoSPF+ reservation payment acknowledgement."
            : "Your official AutoSPF+ service receipt."}</p>
        </div>
        <div className="customer-receipt-actions">
          {pdfUrl && receipt ? (
            <a
              className="customer-payment-button is-primary"
              href={pdfUrl}
              download={receiptFileName(receipt.receiptNumber)}
            >
              <Download size={15} />
              Download PDF
            </a>
          ) : (
            <button className="customer-payment-button is-primary" disabled>
              <Download size={15} />
              {receipt && !pdfError ? "Preparing PDF…" : "Download PDF"}
            </button>
          )}
          <button
            className="customer-payment-button"
            type="button"
            disabled={!officialReceipt}
            onClick={print}
          >
            <Printer size={15} />
            Print Receipt
          </button>
          {pdfUrl ? (
            <a
              className="customer-payment-button is-tertiary"
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={15} />
              Open Receipt
            </a>
          ) : (
            <button className="customer-payment-button" disabled>
              <ExternalLink size={15} />
              Open Receipt
            </button>
          )}
        </div>
      </header>
      {(actionError || pdfError) && (
        <div className="customer-payment-action-error" role="alert">
          {actionError || pdfError}
          {pdfError && (
            <button
              className="customer-payment-button"
              onClick={() => setPdfRetry((value) => value + 1)}
            >
              Retry PDF
            </button>
          )}
        </div>
      )}
      {error ? (
        <div
          className="customer-payment-panel customer-payment-empty"
          role="alert"
        >
          <Receipt size={30} />
          <h3>Receipt unavailable</h3>
          <p>{error}</p>
          <button
            className="customer-payment-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : !officialReceipt ? (
        <div
          className="customer-payment-panel customer-payment-empty"
          role="status"
        >
          <RefreshCw size={24} className="customer-payment-spinning" />
          <h3>Loading your receipt</h3>
        </div>
      ) : (
        <div className="customer-official-receipt-viewer">
          <iframe
            className="customer-official-receipt-frame"
            title={`${receipt?.transactionType === "reservation_fee" ? "Reservation payment receipt" : "Official service receipt"} ${officialReceipt.receiptNumber}`}
            srcDoc={officialReceiptHtml}
          />
        </div>
      )}
    </section>
  );
}
