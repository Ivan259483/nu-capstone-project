Customer mobile demo media

The ten JPEGs are synthetic inspection views of a green Alfa Romeo Tonale
(active order) and a purple Acura ILX (completed orders). Each is labeled DEMO.
The two PNGs are blank, labeled sample documents for the intake and QC slots.
They are not evidence of an actual vehicle inspection.

Run `node scripts/reseed-customer-mobile-demo.js` from backend to preview the
three reviewed demo-order repairs, or append `--apply` to apply them. The script
requires demo/development system mode and `dataEnvironment: demo` on each order.
It snapshots the original records under ~/.codex/backups/customer-mobile-demo
before applying the selected fields. It preserves payment amounts, payment dates,
and the explicit release state. No accounts or orders are deleted or recreated.

The dates are an intentional fixed September 12, 2026 demonstration snapshot:
completed bookings September 9/10 and the active pickup September 12.
