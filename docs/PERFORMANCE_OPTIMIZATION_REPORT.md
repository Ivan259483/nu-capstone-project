# AutoSPF performance optimization report

Date: 2026-08-20

## Bottlenecks found

- Staff login performed four OTP-related steps serially after password comparison: read the old challenge, delete it, insert the replacement, then call the email provider.
- Login OTP verification read the OTP and user serially, consumed the OTP, then waited for a full user save solely to update `lastSeenAt`.
- Every notification GET synchronously ran legacy order/receipt backfills before its paginated aggregation. Those backfills include multiple order, invoice, existence, and notification queries.
- Every dashboard request independently queried the live authenticated user. Concurrent requests were not coalesced.
- Activity heartbeats waited for the presence write and competed with initial dashboard requests.
- The Roboflow scan route waited for all Cloudinary uploads before creating/responding with the scan.
- Admin Hub mounted the live tracker even when it was not visible and eagerly imported every dashboard module.
- Several frontend services bypassed the existing request-deduplication cache.

## Changes

- Added structured per-operation `[PERF]` logs and `Server-Timing` entries for the affected database, bcrypt, Roboflow, email, Cloudinary, and scan persistence operations.
- Coalesced concurrent live-user authentication reads without adding a stale authentication cache.
- Replaced login OTP delete + insert with one indexed upsert.
- Loaded OTP and user concurrently during verification; presence updates are now best-effort background writes.
- Moved notification repair/backfill work off the GET response path and changed the default page size from 50 to 20.
- Made activity presence writes asynchronous and server-debounced.
- Kept Roboflow detection unchanged while moving Cloudinary archival after the scan response; archive state changes from `pending` to `succeeded`, `partial`, or `failed` in MongoDB.
- Added auth-scoped frontend GET caching/in-flight deduplication for notifications, users, settings, suppliers, orders, services, activity, and tracker media.
- Delayed the first activity heartbeat until browser idle time.
- Lazy-loaded Admin Hub modules and stopped mounting the tracker until its tab is opened.
- Added and applied compound indexes for notification feeds/backfills, customer receipt/stage lookups, sales pickup queues, AI scan lists, authentication, activity, and invoice reads.

## Before and after timings

The “before” column is the supplied production log. The “after” values are warm measurements from the configured MongoDB plus automated local controller tests. They are not presented as post-deployment production measurements; production `[PERF]` logs should be collected after deployment for a like-for-like p50/p95 comparison.

| Path | Before production log | After measured/critical path |
| --- | ---: | ---: |
| `POST /api/auth/login` | 11,223 ms | ~145–205 ms in local auth tests with mocked email; configured DB warm reads are ~65–67 ms each. Real email-provider time is now separately logged. |
| `POST /api/auth/verify-login-otp` | 7,653–9,784 ms | ~180–260 ms projected from configured DB warm reads + bcrypt; local controller critical path was commonly ~65–90 ms. |
| `PATCH /api/users/me/activity` | 12,111 ms | ~64 ms configured warm auth read + immediate acknowledgement; background write does not extend response time. Handler-only regression test completed in <2 ms. |
| `GET /api/notifications` | 5,774 ms | Core aggregation measured 2–14 ms in MongoDB-memory integration tests; historical backfills contribute 0 ms to the response path. |
| `GET /api/bookings/:id/tracker-media` | 4,795 ms | Configured warm DB: 63.9 ms median tracker query + 64.8 ms median auth query (~129 ms DB critical path). |
| `POST /api/ai/scan` | 3–10 s plus archive | Roboflow remains the 3–10 s detection step; Cloudinary archive contribution to response is now 0 ms by construction and is timed in background. |

Configured-database warm read sample (five measured runs after one warm-up):

- User by email: 67.4 ms median, 81.2 ms average.
- Live auth user by id: 64.8 ms median, 77.5 ms average.
- Tracker media order by id: 63.9 ms median, 76.4 ms average.

## Verification

- Focused auth/notification suite: 19/19 passed.
- Performance regression tests: 3/3 passed.
- Production frontend build: passed; dashboard modules are emitted as separate chunks.
- Full backend suite: 205 passed, 2 unrelated existing failures remain:
  - a date/time-sensitive ready-pickup slot fixture falls outside current operating hours;
  - a CSP test expects a Report-Only header that is absent from the current frontend configuration.
- Frontend type-check still reports existing errors in profile, UI-library compatibility, translation, billing, and redesign files; no errors reference the performance-touched frontend files.
- Performance index command completed successfully for orders, AI scans, users, OTPs, notifications, notification user state, activity logs, and invoice records.

