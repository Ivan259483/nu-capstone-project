import {
  countGatePhotos,
  requiredGatePhotosForValidation,
  normalizePhotoSlot,
  TRACKER_GATE_STAGES,
  TRACKER_STANDARD_SLOTS,
} from "./trackerGatePhotos.utils.js";

export const QC_WAIT_MINUTES = 240;
export const QC_GATES = [...TRACKER_GATE_STAGES];
const normalize = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
const time = (v) => (v ? new Date(v).getTime() : NaN);
const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const manilaDay = (v) => manilaDateFormatter.format(new Date(v));

/** Only persisted QC outcomes are activity. Tracker status and updatedAt are not events. */
export function buildQCActivity(orders, query = {}, now = Date.now()) {
  const days = [1, 7, 14, 30].includes(Number(query.rangeDays))
    ? Number(query.rangeDays)
    : 7;
  const start = Date.parse(
    `${manilaDay(now - (days - 1) * 86400000)}T00:00:00+08:00`,
  );
  const events = [];
  for (const order of orders) {
    const base = {
      jobId: order.orderNumber || order.bookingReference || String(order._id),
      customer: order.customerName || "Unknown",
      vehicle:
        [order.vehicleYear, order.vehicleMake, order.vehicleModel]
          .filter(Boolean)
          .join(" ") || "Unknown Vehicle",
      service: order.serviceType || "Service",
    };
    const add = (type, timestamp, actor, note, suffix) => {
      const recorded = time(timestamp);
      if (!Number.isFinite(recorded) || recorded < start || recorded > now)
        return;
      events.push({
        ...base,
        id: `${order._id}:${suffix}`,
        type,
        timestamp: new Date(recorded).toISOString(),
        actor: actor || "",
        note,
      });
    };
    add("approved", order.qcCompletedAt, "", null, "qc-outcome");
    (order.staffNotes || []).forEach((note, index) => {
      if (/^\[QC_RETURN\]/i.test(note.content || "")) {
        add(
          "returned",
          note.createdAt,
          note.detailerName,
          note.content.replace(/^\[QC_RETURN\]\s*/i, ""),
          `return:${note._id || index}`,
        );
      }
    });
  }
  return events
    .sort(
      (a, b) =>
        time(b.timestamp) - time(a.timestamp) || a.id.localeCompare(b.id),
    )
    .slice(
      0,
      Math.min(50, Math.max(1, Number.parseInt(query.limit, 10) || 15)),
    );
}

/** A read-only projection of existing gate rules; never used to mutate an order. */
export function describeQCJob(job) {
  const status = normalize(job.orderStatus);
  const stage = normalize(job.serviceTrackingStage);
  const terminal =
    ["completed", "released"].includes(status) ||
    ["completed", "released"].includes(stage);
  let completedIndex = QC_GATES.indexOf(stage);
  if (!stage)
    completedIndex =
      status === "received"
        ? 0
        : status === "in_progress"
          ? 1
          : status === "ready_for_payment"
            ? 3
            : -1;
  if (terminal) completedIndex = 3;
  const currentGate = terminal
    ? "completed"
    : QC_GATES[Math.min(3, completedIndex + 1)];
  const media = (job.trackerStageMedia || []).map((entry) => ({
    ...entry,
    photoUrl:
      entry.hasPhoto === true || String(entry.photoUrl || "").trim()
        ? "saved"
        : "",
  }));
  const evidence = QC_GATES.map((gate) => {
    const required = requiredGatePhotosForValidation(
      gate,
      "staff_quality_checker",
    );
    const uploaded = Math.min(
      required,
      countGatePhotos({ trackerStageMedia: media }, gate),
    );
    const slots =
      gate === "quality_check"
        ? ["qc_form"]
        : [
            ...TRACKER_STANDARD_SLOTS,
            ...(gate === "received" ? ["preassessment_form"] : []),
          ];
    const saved = new Set(
      media
        .filter((m) => m.stage === gate && m.photoUrl)
        .map((m) => normalizePhotoSlot(m.slot, gate)),
    );
    // Legacy unslotted evidence counts where backend validation permits it, but cannot identify an exact missing angle.
    const legacy =
      gate !== "ready_pickup" &&
      media.some(
        (m) =>
          m.stage === gate && m.photoUrl && !normalizePhotoSlot(m.slot, gate),
      );
    return {
      stage: gate,
      required,
      uploaded,
      missing: required - uploaded,
      missingSlots:
        uploaded === required
          ? []
          : gate === "quality_check"
            ? ["qc_form"]
            : legacy
              ? []
              : slots.filter((s) => !saved.has(s)),
    };
  });
  const current = evidence.find((e) => e.stage === currentGate);
  const missingNow = terminal ? 0 : current?.missing || 0;
  const elapsedMinutes = Math.max(0, Number(job.elapsedMinutes) || 0);
  const overdue = !terminal && elapsedMinutes >= QC_WAIT_MINUTES;
  const issues = !terminal && ["needs-fix", "resubmitted"].includes(job.status);
  const needsEvidence = !terminal && missingNow > 0;
  const readyQc = !terminal && currentGate === "quality_check" && !missingNow;
  const readyPickup = !terminal && currentGate === "ready_pickup";
  const approvalBlockers = [];
  if (job.status === "approved" || terminal)
    approvalBlockers.push("QC approval already recorded.");
  if (status === "ready_for_payment")
    approvalBlockers.push(
      "Balance is due at POS. Process payment before QC completion.",
    );
  else if (
    !["in_progress", "completed", "received", "quality_check"].includes(status)
  )
    approvalBlockers.push("This job is not at an approvable service status.");
  if (evidence[2].missing)
    approvalBlockers.push("QC form photo is required before approval.");
  if (evidence[3].missing)
    approvalBlockers.push(
      `${evidence[3].missing} final output photo${evidence[3].missing === 1 ? "" : "s"} missing.`,
    );
  const completionAt =
    [job.releaseTimestamp, job.egressCompletedAt].find((value) =>
      Number.isFinite(time(value)),
    ) || null;
  return {
    terminal,
    currentGate,
    completedIndex,
    progress: (completedIndex + 1) * 25,
    evidence,
    uploaded: evidence.reduce((n, e) => n + e.uploaded, 0),
    required: evidence.reduce((n, e) => n + e.required, 0),
    missingNow,
    needsEvidence,
    readyQc,
    readyPickup,
    issues,
    overdue,
    elapsedMinutes,
    overdueMinutes: Math.max(0, elapsedMinutes - QC_WAIT_MINUTES),
    approvalBlockers,
    completionAt,
    attention:
      !terminal &&
      (overdue || needsEvidence || issues || job.aiFlag || readyQc),
    priority:
      (overdue ? 10000 : 0) +
      (issues ? 5000 : 0) +
      (job.aiFlag ? 3000 : 0) +
      (needsEvidence ? 1000 : 0) +
      (readyQc ? 500 : 0),
  };
}

export function buildQCWorkspace(jobs, query = {}, now = Date.now()) {
  const days = [1, 7, 30].includes(Number(query.rangeDays))
    ? Number(query.rangeDays)
    : 7;
  const today = manilaDay(now);
  const startDay = manilaDay(now - (days - 1) * 86400000);
  const rows = jobs.map((job) => ({ ...job, operational: describeQCJob(job) }));
  const active = rows.filter((j) => !j.operational.terminal);
  const completedToday = (j) =>
    j.operational.terminal &&
    Number.isFinite(time(j.operational.completionAt)) &&
    manilaDay(j.operational.completionAt) === today;
  const summary = {
    total: rows.length,
    active: active.length,
    pending: active.filter((j) =>
      ["pending-review", "in-review"].includes(j.status),
    ).length,
    needEvidence: active.filter((j) => j.operational.needsEvidence).length,
    readyQc: active.filter((j) => j.operational.readyQc).length,
    issues: active.filter((j) => j.operational.issues).length,
    readyPickup: active.filter((j) => j.operational.readyPickup).length,
    overdue: active.filter((j) => j.operational.overdue).length,
    aiFlagged: active.filter((j) => j.aiFlag).length,
    completedToday: rows.filter(completedToday).length,
    completionDateUnavailable: rows.filter(
      (j) =>
        j.operational.terminal &&
        !Number.isFinite(time(j.operational.completionAt)),
    ).length,
    stages: Object.fromEntries(
      [...QC_GATES, "completed"].map((stage) => [
        stage,
        stage === "completed"
          ? rows.filter(completedToday).length
          : active.filter((j) => j.operational.currentGate === stage).length,
      ]),
    ),
    evidence: QC_GATES.map((stage) => ({
      stage,
      uploaded: 0,
      required: 0,
      missing: 0,
    })),
  };
  for (const job of rows) {
    const updated =
      job.updatedAt || job.serviceTrackingUpdatedAt || job.submittedAt;
    if (
      !Number.isFinite(time(updated)) ||
      manilaDay(updated) < startDay ||
      manilaDay(updated) > today
    )
      continue;
    job.operational.evidence.forEach((e, i) => {
      summary.evidence[i].uploaded += e.uploaded;
      summary.evidence[i].required += e.required;
      summary.evidence[i].missing += e.missing;
    });
  }
  const search = String(query.search || "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
  const filter = String(query.filter || "active");
  const matches = (j) => {
    const op = j.operational;
    if (filter === "active" && op.terminal) return false;
    if (filter === "attention" && !op.attention) return false;
    if (filter === "needs-evidence" && !op.needsEvidence) return false;
    if (filter === "ready-qc" && !op.readyQc) return false;
    if (filter === "issues" && !op.issues) return false;
    if (filter === "overdue" && !op.overdue) return false;
    if (filter === "ready-pickup" && !op.readyPickup) return false;
    if (filter === "completed-today" && !completedToday(j)) return false;
    if (query.stage && op.currentGate !== query.stage) return false;
    if (query.status && j.status !== query.status) return false;
    if (query.aiFlagged === "true" && !j.aiFlag) return false;
    return (
      !search ||
      [
        j.id,
        j.jobId,
        j.customer,
        j.vehicle,
        j.plate,
        j.service,
        j.technician,
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(search),
      )
    );
  };
  const filtered = rows.filter(matches).sort((a, b) => {
    const mode = query.sort || "priority";
    if (mode === "customer")
      return a.customer.localeCompare(b.customer) || a.id.localeCompare(b.id);
    if (mode === "submitted")
      return (
        (time(b.submittedAt) || 0) - (time(a.submittedAt) || 0) ||
        a.id.localeCompare(b.id)
      );
    return (
      (mode === "priority"
        ? b.operational.priority - a.operational.priority
        : 0) ||
      b.operational.elapsedMinutes - a.operational.elapsedMinutes ||
      a.id.localeCompare(b.id)
    );
  });
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(query.limit, 10) || 20),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
  const page = Math.min(
    totalPages,
    Math.max(1, Number.parseInt(query.page, 10) || 1),
  );
  const data = filtered.slice((page - 1) * limit, page * limit);
  return {
    success: true,
    jobs: data,
    data,
    summary,
    generatedAt: new Date(now).toISOString(),
    total: filtered.length,
    page,
    limit,
    totalPages,
    count: data.length,
    pagination: {
      page,
      limit,
      total: filtered.length,
      totalPages,
      returned: data.length,
      hasNextPage: page < totalPages,
    },
  };
}
