import { createDetailedReceiptPdfBlob } from "./receipt-document";
import {
  officialReceiptFromCustomerPayment,
  type CustomerPaymentReceipt,
} from "./customer-payment-history";

/**
 * Customer receipts delegate to the same official PDF renderer used by
 * Sales/Admin. This adapter remains for compatibility with existing imports.
 */
export function createCustomerReceiptPdf(
  receipt: CustomerPaymentReceipt,
): Promise<Blob> {
  return createDetailedReceiptPdfBlob(
    officialReceiptFromCustomerPayment(receipt),
  );
}
