# Billing system — schema migration notes

## New collections

- **Billings** — one active draft per `order` (latest by `version` / `updatedAt`). Created on first `GET /api/orders/:id/billing`.
- **InvoiceRecords** — one row per successful checkout snapshot; `invoiceNumber` unique.

## Extended fields

- **Payment**: `taxVatAmount`, `additionalFees`, `downpayment`, `grandTotal`, `amountPaid`, `balanceRemaining`, `billingVersion`, `invoiceRecord`.
- **Service**: `billingGroup` (`ceramic_spf` | `ppf` | `other` | `uncategorized`), `displayOrder`.

## Backfill (optional script or manual)

1. Set `billingGroup` on existing services by name rules (e.g. names containing "SPF" → `ceramic_spf`, "PPF"/"XPEL"/"Zivent" → `ppf`).
2. Existing orders without Billing: lazily created when Sales opens billing UI.

## Legacy behavior

- Bookings keep using `order.items` until checkout syncs from Billing line items.
