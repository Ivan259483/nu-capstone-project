import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildQCWorkspace,
  buildQCActivity,
  describeQCJob,
  QC_GATES,
  manilaDay,
} from "../utils/qcWorkspace.utils.js";
import {
  countGatePhotos,
  requiredGatePhotosForValidation,
} from "../utils/trackerGatePhotos.utils.js";
const now = Date.parse("2026-09-05T04:00:00Z");
test("activity only shows recorded outcomes, all saved returns, and available actors within the date range", () => {
  const records = [
    {
      _id: "inferred",
      status: "completed",
      serviceTrackingStage: "ready_pickup",
      updatedAt: new Date(now),
    },
    {
      _id: "recorded",
      qcCompletedAt: new Date(now - 1000),
      staffNotes: [
        {
          content: "[QC_RETURN] Missing evidence",
          detailerName: "Saved Actor",
          createdAt: new Date(now - 2000),
        },
        {
          content: "[QC_RETURN] Another return",
          createdAt: new Date(now - 3000),
        },
        { content: "[QC_RETURN] No date" },
        { content: "Ordinary note", createdAt: new Date(now) },
      ],
    },
    { _id: "old", qcCompletedAt: "2026-09-04T15:59:59Z" },
  ];
  const events = buildQCActivity(records, { rangeDays: 1 }, now);
  assert.equal(events.length, 3);
  assert.equal(events[0].actor, "");
  assert.equal(events[1].actor, "Saved Actor");
  assert.equal(events[1].note, "Missing evidence");
  assert.equal(new Set(events.map((e) => e.id)).size, 3);
  assert.equal(
    buildQCActivity(records, { rangeDays: 7, limit: 2 }, now).length,
    2,
  );
});
const job = (id = "job-1", extra = {}) => ({
  id,
  jobId: `ORDER-${id}`,
  customer: "Test Customer",
  vehicle: "Test Vehicle",
  plate: "TEST001",
  service: "Test Service",
  technician: "Test Technician",
  status: "pending-review",
  orderStatus: "confirmed",
  serviceTrackingStage: "confirmed",
  submittedAt: new Date(now - 600000).toISOString(),
  updatedAt: new Date(now).toISOString(),
  elapsedMinutes: 10,
  trackerStageMedia: [],
  ...extra,
});
const photos = (stage, slots) =>
  slots.map((slot) => ({
    stage,
    slot,
    hasPhoto: true,
    photoUrl: `https://example.test/${stage}/${slot}.jpg`,
  }));
const full = () => [
  ...photos("received", [
    "front",
    "rear",
    "left",
    "right",
    "close_up",
    "preassessment_form",
  ]),
  ...photos("in_progress", ["front", "rear", "left", "right", "close_up"]),
  ...photos("quality_check", ["qc_form"]),
  ...photos("ready_pickup", ["front", "rear", "left", "right", "close_up"]),
];

test("workspace searches and counts beyond the legacy 20-row page", () => {
  const jobs = Array.from({ length: 47 }, (_, i) =>
    job(String(i), { customer: `Customer ${String(i).padStart(2, "0")}` }),
  );
  const result = buildQCWorkspace(jobs, { sort: "customer", page: 2 }, now);
  assert.equal(result.summary.active, 47);
  assert.equal(result.total, 47);
  assert.equal(result.jobs.length, 20);
  assert.equal(result.totalPages, 3);
  assert.equal(result.jobs[0].customer, "Customer 20");
  const found = buildQCWorkspace(jobs, { search: "ORDER-46" }, now);
  assert.equal(found.total, 1);
  assert.equal(found.jobs[0].id, "46");
  assert.equal(found.summary.active, 47);
});
test("search supports customer, plate, service, vehicle and technician; literal special characters", () => {
  for (const search of [
    "test customer",
    "test001",
    "test service",
    "test vehicle",
    "test technician",
  ])
    assert.equal(buildQCWorkspace([job()], { search }, now).total, 1);
  assert.equal(buildQCWorkspace([job()], { search: ".*" }, now).total, 0);
});
test("gate evidence matches mutation validation, including aliases, duplicates and missing URLs", () => {
  const media = [
    ...full(),
    ...photos("received", ["front", "checklist"]),
    { stage: "received", slot: "rear", hasPhoto: false },
    ...photos("ready_pickup", [undefined, "pickup"]),
  ];
  const op = describeQCJob(job("1", { trackerStageMedia: media }));
  for (const gate of op.evidence) {
    assert.equal(
      gate.required,
      requiredGatePhotosForValidation(gate.stage, "staff_quality_checker"),
    );
    assert.equal(
      gate.uploaded,
      Math.min(
        gate.required,
        countGatePhotos({ trackerStageMedia: media }, gate.stage),
      ),
    );
  }
  assert.equal(op.required, 17);
  assert.equal(op.uploaded, 17);
  assert.equal(
    describeQCJob(
      job("2", {
        trackerStageMedia: [
          { stage: "received", slot: "front", hasPhoto: false },
        ],
      }),
    ).uploaded,
    0,
  );
});
test("legacy evidence counts once where permitted but never satisfies final angle requirements", () => {
  const op = describeQCJob(
    job("1", {
      trackerStageMedia: [
        ...photos("received", [undefined, undefined]),
        ...photos("ready_pickup", [undefined, undefined]),
      ],
    }),
  );
  assert.equal(op.evidence[0].uploaded, 1);
  assert.deepEqual(op.evidence[0].missingSlots, []);
  assert.equal(op.evidence[3].uploaded, 0);
});
test("last completed gate and current work gate stay distinct", () => {
  for (const [stage, current, progress] of [
    ["confirmed", "received", 0],
    ["received", "in_progress", 25],
    ["in_progress", "quality_check", 50],
    ["quality_check", "ready_pickup", 75],
    ["ready_pickup", "ready_pickup", 100],
  ]) {
    const op = describeQCJob(job("1", { serviceTrackingStage: stage }));
    assert.equal(op.currentGate, current);
    assert.equal(op.progress, progress);
  }
  const op = describeQCJob(
    job("1", {
      serviceTrackingStage: "in_progress",
      trackerStageMedia: photos("quality_check", ["qc_form"]),
    }),
  );
  assert.equal(op.missingNow, 0);
  assert.equal(op.uploaded, 1);
  assert.equal(op.required, 17);
  assert.equal(op.readyQc, true);
});
test("four-hour waiting threshold is stable and terminal jobs are never overdue", () => {
  assert.equal(describeQCJob(job("1", { elapsedMinutes: 239 })).overdue, false);
  assert.equal(describeQCJob(job("1", { elapsedMinutes: 240 })).overdue, true);
  assert.equal(
    describeQCJob(job("1", { elapsedMinutes: 301 })).overdueMinutes,
    61,
  );
  assert.equal(
    describeQCJob(job("1", { elapsedMinutes: 999, orderStatus: "completed" }))
      .overdue,
    false,
  );
});
test("approval blockers mirror photos and payment/status restrictions; handoff is informational", () => {
  const ready = job("1", {
    orderStatus: "in_progress",
    serviceTrackingStage: "ready_pickup",
    trackerStageMedia: full(),
    qcChecklist: [],
    qcHandoffSheet: {},
  });
  assert.deepEqual(describeQCJob(ready).approvalBlockers, []);
  assert.match(
    describeQCJob({
      ...ready,
      orderStatus: "ready_for_payment",
    }).approvalBlockers.join(" "),
    /POS/,
  );
  assert.match(
    describeQCJob({ ...ready, trackerStageMedia: [] }).approvalBlockers.join(
      " ",
    ),
    /QC form photo/,
  );
  assert.match(
    describeQCJob({ ...ready, status: "approved" }).approvalBlockers.join(" "),
    /already recorded/,
  );
});
test("today uses Manila recorded release/completion, never last update or QC approval", () => {
  assert.equal(manilaDay("2026-09-04T16:00:00Z"), "2026-09-05");
  const result = buildQCWorkspace(
    [
      job("today", {
        orderStatus: "released",
        releaseTimestamp: "2026-09-04T16:00:00Z",
      }),
      job("yesterday", {
        orderStatus: "completed",
        egressCompletedAt: "2026-09-04T15:59:59Z",
      }),
      job("unknown", {
        orderStatus: "completed",
        qcCompletedAt: new Date(now).toISOString(),
      }),
      job("active", { qcCompletedAt: new Date(now).toISOString() }),
    ],
    { filter: "completed-today" },
    now,
  );
  assert.equal(result.summary.completedToday, 1);
  assert.equal(result.summary.completionDateUnavailable, 1);
  assert.deepEqual(
    result.jobs.map((j) => j.id),
    ["today"],
  );
});
test("incomplete date and media metadata cannot create completion or photo coverage", () => {
  const incomplete = describeQCJob(
    job("incomplete", {
      orderStatus: "completed",
      releaseTimestamp: "invalid",
      egressCompletedAt: new Date(now).toISOString(),
      trackerStageMedia: [
        { stage: "received", slot: "front", photoUrl: "   " },
      ],
    }),
  );
  assert.equal(incomplete.completionAt, new Date(now).toISOString());
  assert.equal(incomplete.uploaded, 0);
  assert.equal(
    describeQCJob(job("unknown", { releaseTimestamp: "invalid" })).completionAt,
    null,
  );
});
test("filters combine consistently and summary remains scope-wide", () => {
  const rows = [
    job("late", { elapsedMinutes: 400 }),
    job("issue", { status: "needs-fix" }),
    job("ai", { aiFlag: true }),
    job("done", { orderStatus: "completed" }),
  ];
  assert.equal(buildQCWorkspace(rows, { filter: "overdue" }, now).total, 1);
  assert.equal(
    buildQCWorkspace(rows, { filter: "issues" }, now).jobs[0].id,
    "issue",
  );
  assert.equal(
    buildQCWorkspace(rows, { filter: "all", aiFlagged: "true" }, now).jobs[0]
      .id,
    "ai",
  );
  assert.equal(
    buildQCWorkspace(rows, { status: "needs-fix", stage: "received" }, now)
      .total,
    1,
  );
  assert.equal(
    buildQCWorkspace(rows, { filter: "all", page: 999 }, now).page,
    1,
  );
  assert.equal(buildQCWorkspace(rows, {}, now).jobs[0].id, "late");
});
test("period changes evidence history without hiding old active blockers", () => {
  const old = job("old", {
    updatedAt: "2026-08-31T00:00:00Z",
    elapsedMinutes: 500,
  });
  const today = buildQCWorkspace([old], { rangeDays: 1 }, now);
  const week = buildQCWorkspace([old], { rangeDays: 7 }, now);
  assert.equal(today.summary.overdue, 1);
  assert.equal(
    today.summary.evidence.reduce((n, e) => n + e.required, 0),
    0,
  );
  assert.equal(
    week.summary.evidence.reduce((n, e) => n + e.required, 0),
    17,
  );
});
test("empty input has precise zero counts without synthetic evidence or activity", () => {
  const result = buildQCWorkspace([], {}, now);
  assert.equal(result.total, 0);
  assert.equal(result.summary.active, 0);
  assert.equal(result.summary.aiFlagged, 0);
  assert.equal(result.summary.evidence.length, QC_GATES.length);
});
