# QC API Performance and Encryption Audit

Audit date: 2026-08-20 (Asia/Manila)

## Root cause

- `backend/.env` contains a valid 32-byte `ENCRYPTION_KEY`, but no `LEGACY_ENCRYPTION_KEY`.
- The current local key identifier (first 12 SHA-256 characters, never the key) is `25905387fef3`.
- Repository history contains an older hardcoded fallback key in commit `7e3910bf`; its identifier is `2bf2983443a5`.
- One encrypted order plate and one waiver signature decrypt with that historical fallback. Another 43 encrypted fields decrypt with neither the current key nor that fallback, which indicates additional deployment key changes or unavailable/corrupted ciphertext.
- The model post-init hooks previously assigned suppressed `null` values through normal Mongoose setters. That marked encrypted fields as modified, so an unrelated `save()` could overwrite the original ciphertext with `null`.

The application now suppresses unreadable values for clients without marking those paths modified. The stored ciphertext remains intact for future key recovery.

## Query findings

### `GET /api/qc/activity`

The query loaded complete order documents, including embedded photos and tracker media, then populated the customer. A 15-row sample transferred 4,009,459 bytes from Atlas before producing a small activity response. The endpoint now selects only activity fields, removes the customer join, uses stable `updatedAt`/`_id` cursor pagination, and returns `pagination.nextCursor`.

### `GET /api/qc/dashboard/stats`

The endpoint issued 16 database operations per request (15 parallel operations plus a final AI-pending count). It now uses one projected `$facet` aggregation for counters, trends, service distribution, return reasons, and review time. The optimized result was compared against the previous implementation on the same 71-order dataset; all core KPI fields were equal.

### `GET /api/qc/reports/technicians`

The endpoint ran two full aggregation pipelines and repeated the user lookup for approved and returned sets. It now computes both outcomes in one pass, groups before joining, performs one lookup per technician group, and caches the result. The frontend did not consume this response but fetched it every minute; that call is disabled by default.

### `GET /api/ai/scans`

The global recent-scan sort had no supporting index and returned 50 broad documents by default. It now has `createdAt` and `modelStatus + createdAt` indexes, defaults to 25 rows, lets the QC frontend request 20 rows without a total count, projects only displayed fields, and performs the customer lookup in the same aggregation.

## Caching and frontend behavior

- Server-side caches coalesce concurrent requests and use 10-second activity, 20-second AI scan, 30-second stats, and 60-second technician TTLs.
- QC mutations invalidate QC read caches; AI scan writes invalidate AI scan caches.
- Cached responses expose `X-Response-Cache: MISS`, `HIT`, or `COALESCED` while retaining the API-wide private `no-store` browser policy.
- The QC hook coalesces duplicate requests, uses endpoint-specific freshness windows, scopes cache keys correctly, and polls only stats/activity while the dashboard is visible.
- The unused technician report no longer polls. AI scan Strict Mode remounts share one in-flight request, and manual refresh explicitly bypasses the short cache.

## Atlas benchmark

Measured from the same development machine and Atlas database. Cold figures are medians unless noted; network variance still applies.

| Endpoint | Before | After cold | Cache hit | Response size change |
| --- | ---: | ---: | ---: | ---: |
| QC activity (15) | 16,703 ms; 4,009,459-byte DB result | 334 ms | about 0.1 ms | API response 3,803 bytes; oversized DB transfer removed |
| QC dashboard stats | 4,490 ms; 16 DB operations | 276 ms; 1 DB operation | about 0.1 ms | 1,036 bytes both versions |
| QC technicians | 226 ms (single sample; two pipelines) | 249 ms (one pipeline) | about 0.0 ms | 205 bytes; recurring frontend call removed |
| AI scans | 1,872 ms; 50 rows; 187,259 bytes | 407 ms; 20 rows; 31,041 bytes | about 0.0 ms | 83% smaller response |

Atlas explain verification after index creation:

- AI recent scans: `createdAt_-1`, 20 keys examined, 20 documents examined, 20 returned.
- QC recent activity: `archived_1_updatedAt_-1__id_-1`, 32 keys examined, 32 documents examined, 16 returned.

## Deployment steps

1. Deploy the code and run `npm run indexes:performance` once from `backend/`.
2. Run `npm run audit:encryption`. Exit code `2` means unreadable ciphertext remains; no data is changed.
3. Retrieve previous production encryption keys from the hosting secret history or a secured backup. Never paste keys into source control or logs.
4. Configure one verified old key as `LEGACY_ENCRYPTION_KEY`, restart, and run `npm run migrate:encryption-key` for a dry run.
5. After a verified database backup, run `npm run migrate:encryption-key -- --apply`, then rerun the audit.
6. If more than one historical key exists, repeat the verified migration one old key at a time. Records whose keys cannot be recovered remain suppressed and preserved; they require controlled user re-entry rather than destructive clearing.
