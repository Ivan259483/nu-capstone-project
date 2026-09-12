# Sales dashboard and POS sync validation

Implemented the approved projection and refresh-state changes on September 12, 2026. Financial formulas, response DTOs, eligibility rules, indexes, and request timeouts are unchanged. No migration or media deletion was performed.

The diagnosed bottleneck was transferring embedded tracker photos and payment proofs/history from MongoDB into financial reads. The original report replay took about 85.6 seconds, the ledger controller replay about 94.2 seconds, and the queue candidate read about 19.4 seconds. These are backend replay measurements, not browser request durations. The browser separately reported its existing 45-second Axios timeout. Coupled frontend promises discarded successful reports on ledger failure, and the completion label incorrectly implied success after errors.

## Implementation

- Report and CSV reads share explicit order/payment projections. Both supporting payment reads use the financial balance projection, including linked refunds.
- Queue candidates project stage, slot, and photo presence from persisted media. Presence uses the same whitespace rules as the full-media path. Metadata stays outside the hydrated Order document; eligibility saves retain real photos and encrypted fields.
- The queue computes financial state once per candidate and reuses it for eligibility and the response.
- Operations log durations and expose matching `Server-Timing` values.
- Report and ledger requests publish results independently. Each refresh retains the last successful snapshot, records errors explicitly, and coalesces overlapping requests. A failed ledger page never publishes a partial ledger.
- Dashboard, transaction, and pickup queue error states distinguish failure from genuine empty data. Retry and refresh retain loaded metrics and entries.

## Authenticated browser and server measurements

Chrome's existing Sales session at `http://localhost:5173/sales/dashboard`, with normal networking and the dev servers running. Captured September 12, 2026, 22:49–22:50 Asia/Manila. Eight GET responses all returned **200**, with nonempty valid payloads, no timeouts, and no stuck requests. HAR durations include browser scheduling/network overhead.

| Endpoint | Samples | HAR durations (ms) | Response body |
| --- | ---: | --- | ---: |
| `/api/sales-analytics/report?range=30d&serviceMetric=orders` | 3 | 615.4, 736.7, 499.8 | 1,889 bytes |
| `/api/payments?page=1&limit=100&sortBy=effectiveAt&sortOrder=desc` | 3 | 750.9, 1156.3, 574.3 | 12,968 bytes |
| `/api/bookings/queue/balance-pickup?limit=100` | 2 | 718.9, 656.8 | 3,754 bytes |

All 48 operation measurements in these response headers matched the captured backend terminal logs, with `outcome=ok`.

| Server operation | Duration range (ms) |
| --- | ---: |
| Report orders, including population | 242.9–498.2 |
| Report payments, including population | 224.4–361.8 |
| Report aggregation in JavaScript | 1.7–9.0 |
| Ledger page, including population | 305.9–785.0 |
| Pending-payment supporting read | 96.3–173.5 |
| Order-payment supporting read | 88.7–136.0 |
| Queue candidate/evidence projection | 133.4–139.3 |
| Queue Billing read | 228.6–265.4 |
| Queue Payment read | 84.6–174.1 |
| Queue Invoice read | 84.0–161.4 |
| Queue eligibility, including notification lookup | 81.8–85.5 |

These samples meet the under-3-second target on this dataset with the servers running. They are not a guarantee for server startup, other network conditions, or larger datasets. Report date selection continues to use the existing complete financial history for balance and comparison correctness; this change reduces fields transferred rather than changing record eligibility.

## Data and recovery checks

Authenticated report values remain: net collected **₱33,498**, booked sales **₱40,997**, confirmed orders **3**, average order value **₱13,665.67**, unique customers **1**, reservation fees **₱1,500**, outstanding balance **₱7,499**, and zero pending verification/refunds/cancellations. Revenue trend and Top Services render populated data.

The actual POS queue shows **1 due · kevin · Sales/POS · ₱7,499.00**, with five distinct ready-pickup slots.

A temporary browser Offline setting verified that refresh failures retain the loaded metrics and Kevin's entry, show explicit failure messages, and clear loading indicators. Restoring normal networking and retrying restored `Ledger synchronized`; POS again displayed Kevin's correct balance. Normal networking and the prior DevTools/editor settings were restored afterward.

## Automated validation and limits

- New backend projection suite: **3/3 passed** using 1 MiB embedded images, original full-document report/CSV references, signed refunds, refund caps, pending amounts, the ₱7,499 legacy-total fallback, distinct/aliased/missing photo slots, and empty queues. Captured database batches stayed below 64 KB. Queue eligibility saves preserved stored photos, proofs, and encrypted plate/notes byte for byte; financial reads executed once per candidate.
- Frontend Sales suite: **17/17 passed**, including five new tests for independent report/ledger completion, timeout/network errors, overlapping queue requests, retained data, pagination failure, retry, malformed 200 responses, and genuine empty responses.
- Existing focused backend suites: **24/25 passed both before and after implementation**. The unchanged failing refund test creates refunds at today's date but expects them in its hardcoded August reporting range (`salesAnalyticsRoutes.test.js:185`).
- Frontend production build passed. Full TypeScript checking reports 57 errors outside the changed files; no diagnostics reference the changed implementation files. The local ESLint executable is unavailable.
- `git diff --check` passed. No authenticated checkout, refund, or payment mutation was performed on the user's dataset.

Local evidence captured during this run: `/tmp/sales-sync-after.har` (sanitized export), `/tmp/sales-sync-after-timings.json` (selected timings and totals), and `/tmp/sales-sync-server.txt` (backend terminal capture). Raw captures are kept outside the repository.
