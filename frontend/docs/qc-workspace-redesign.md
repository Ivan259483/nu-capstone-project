# QC command center and Review Desk implementation

Implemented September 5, 2026. Changes are local and are not deployed.

## Product changes

- Dashboard uses a compact command header, observable connection/read freshness, scope and history range controls, five operational metrics, a filterable tracker rail, a dominant Attention Queue, real gate coverage, and recorded QC activity.
- Review Desk uses a 38% queue / 62% detail layout on desktop, a narrower tablet queue, and explicit full-width mobile selection with Back. Search, sort, status, AI and additional filters run through the server read model. Query, pagination and selection remain in the parent; queue scroll survives navigation to Tracker and back.
- Selection stays on the same job ID after refresh. Confirmed removal clears the decision target with an explanation. Detail requests are abortable and guarded against stale responses. Existing snapshots remain visible during refresh; decisions are disabled while their detail requirements cannot be verified.
- The reusable job workspace contains overview, tracker progression, gallery, saved checklist, handoff, notes and available AI findings. False checklist booleans say “Not marked passed.” Missing analysis says “Analysis unavailable.” These informational panels add no approval requirements.
- The real-media lightbox supports arrows, Escape and focus restoration. The return dialog now traps and restores focus. Sticky approval/return controls reuse existing handlers. Mobile navigation retains all four destinations; transitions use 200ms and respect reduced motion.

## Modified and added files

Paths below are relative to the repository root.

| Files | Responsibility |
| --- | --- |
| `backend/controllers/qc.controller.js` | Optional workspace read modes for jobs and activity; accurate saved-media presence and recorded completion timestamps. Existing mutation handlers are unchanged. |
| `backend/utils/qcWorkspace.utils.js` | Read-only gate summaries, scoped totals, queue filtering/sorting/pagination, Manila date boundaries, recorded QC activity. Reuses backend gate photo helpers. |
| `frontend/src/lib/qc-workspace.ts` | Typed workspace metadata and shared presentation/selection selectors. |
| `frontend/src/hooks/useQCWorkspace.ts` | Abortable server reads, scoped cached display, freshness, socket debouncing and polling. |
| `frontend/src/hooks/useQCData.ts` | Additive metadata, truthful photo presence, guarded scoped activity reads and approval success copy. Existing Live Tracker upload protections remain. |
| `frontend/src/components/technician/qc/QCDashboardPanel.tsx` | Integrates workspace state, destinations, selected-job actions and existing notifications/deep links. |
| `frontend/src/components/technician/qc/QCDashboardView.tsx` | Command center, metrics, attention queue, workflow filters, coverage and activity. |
| `frontend/src/components/technician/qc/QCJobsTable.tsx` | Review Desk toolbar and responsive master-detail selection. |
| `frontend/src/components/technician/qc/QCJobDetailView.tsx` | Authorized reusable detail fetch, overview/progression, action blockers and sticky footer; also serves legacy job-detail links. |
| `frontend/src/components/technician/qc/QCJobEvidencePanel.tsx` | Real media gallery, gate/slot requirements and accessible lightbox. |
| `frontend/src/components/technician/qc/QCSavedInspectionPanels.tsx` | Saved checklist, handoff, notes and explicitly identified AI findings. |
| `frontend/src/components/technician/qc/QCWorkspacePrimitives.tsx` | Shared queue rows, badges, coverage, loading/error/freshness components. |
| `frontend/src/components/technician/qc/QCWorkspace.css` | Scoped workstation styling and responsive/reduced-motion behavior. |
| `frontend/src/components/technician/qc/QCSidebar.tsx`, `QCTopbar.tsx` | Compact navigation/status and server-backed global QC search; existing notification/profile controls retained. |
| `frontend/src/components/technician/qc/QCReturnModal.tsx` | Existing return-reason form with accessible dialog/focus behavior and failed-submit retention. |
| `frontend/src/components/technician/qc/QCLiveTrackerView.tsx` | One saved-photo predicate now respects explicit `hasPhoto: false`; no Tracker redesign. |
| `backend/tests/qcWorkspace.test.js`, `backend/tests/qcWorkspaceRead.test.js`, `frontend/tests/qcWorkspace.test.ts` | Focused read, selector and existing mutation/authorization regression checks. |
| `frontend/tests/fixtures/qc-workspace.html`, `frontend/tests/fixtures/qc-workspace.tsx` | Explicitly labeled isolated visual fixtures for real QC components. Fixture requests and decisions do not reach production APIs. Not imported by the app entry point. |

## Preserved contracts and data boundaries

- Routes, role middleware, approve/return payloads, payment restrictions, evidence uploads, stage mutations, checklist/handoff editing, notifications and Live Tracker deep-link parameters remain in their existing flows. No migrations or mobile changes were made for this task.
- `/qc/jobs?workspace=true` adds exact scope-wide summaries and server filtering/sorting/pagination. Legacy callers retain their bounded default response. The workspace currently loads projected scoped records before filtering, allowing decrypted plate search and gate-helper consistency. Its database read is coalesced for three seconds. Production-scale database performance has not been measured.
- `/qc/activity?workspace=true` uses saved `qcCompletedAt` and dated `[QC_RETURN]` notes, applies All/My scope and date range, and sorts events before limiting. It does not manufacture upload, scan or stage-change events from current status. The legacy activity mode remains available.
- Active metrics stay current across history ranges. Completed Today uses recorded release/egress completion dates in Asia/Manila. Terminal records without a usable date are counted separately. QC approval and generic update timestamps are not substituted.
- The existing four-hour QC waiting threshold and submitted-time origin are preserved. It is not a customer deadline.
- Missing waiting-time origins are explicitly marked unavailable; they do not fabricate a submission date or display a zero-minute wait.
- Existing QC-facing status mapping and My Jobs assignment semantics are retained. The job-list model currently supplies no linked AI analysis; empty/unknown analysis is never described as AI Clear. Confidence is shown only when recorded. Approval actors are omitted when not stored.
- Gate coverage deduplicates slots according to the same backend validation helpers, including legacy aliases and the stricter final-output slots. Required-now coverage is distinct from full pipeline coverage. An identical image URL is displayed once in the gallery, using its first recorded stage/slot label.

## Validation results

| Check | Result |
| --- | --- |
| New backend read/operational tests | **22 passed**. Covers >20 jobs, search/filter/sort/page, All/My scope, recorded activity, date boundaries, terminal/missing metadata, gate parity and deduplication, existing role enforcement and approval/return blockers. |
| Frontend selector tests | **4 passed**. Covers stable/removed selection, identity, elapsed display, status priority and unavailable AI. |
| Existing quality notification suite | **14 passed**. Existing socket-not-initialized messages are expected in isolated tests. |
| Production build | **Passed**, latest run 12.23s. Existing duplicate translation-key and large-chunk warnings remain. An intermediate run failed on concurrent missing customer imports; the final run passed after those files became available. |
| Frontend typecheck | **Blocked by the same 58 pre-existing diagnostics** as the captured baseline; no new diagnostic categories and no diagnostics in the QC changes. Errors include shared calendar/chart/resizable types, auth/admin/sales files, translations and nested Redesign copies. |
| Lint | **Not run: the frontend has no lint script.** |
| `git diff --check` | **Passed** across the shared checkout. |

Commands run from their respective package directories:

```sh
# backend
node --test --test-concurrency=1 tests/qcWorkspace.test.js tests/qcWorkspaceRead.test.js
node --test --test-concurrency=1 tests/qualityNotificationService.test.js
# frontend
node --experimental-strip-types --test tests/qcWorkspace.test.ts
npx tsc --noEmit --incremental false
npm run build
# repository
git diff --check
```

Browser inspection used actual components in the isolated fixture at 1440, 1024, 768 and 390px. Zero, one and 27-job scenarios were exercised, including pagination/search beyond page one, empty queues, read retry, disconnected/stale snapshots, detail read failure, delayed selection, selected-job evidence refresh, confirmed removal, lightbox arrows/Escape/focus, return validation/callback, sticky actions and mobile Back/focus. Measured horizontal page overflow was zero at all four widths. The mobile label issue and return focus issue discovered during inspection were fixed and rechecked.

## Outstanding authenticated/manual acceptance

The actual app opened at login; no signed-in QC session was available. Fixture checks do **not** constitute authenticated acceptance. Still verify with real QC accounts and records:

- The complete 0/1/many-job matrix at all four widths, actual profile/notification overlays, production image URLs and expired-media behavior.
- Real socket disconnect/reconnect and database changes while reviewing a selected job; repeated rapid selections under variable network latency.
- Successful and rejected approve/return operations, POS restrictions, return notifications and legacy deep-link navigation end to end.
- Physical-device scrolling/safe areas, screen-reader announcements, full keyboard/contrast audit and reduced-motion behavior.

Concurrent customer/mobile changes elsewhere in the shared checkout were left intact.
