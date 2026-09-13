import type { QCJob } from "../hooks/useQCData";

export type QCQueueFilter =
  | "active"
  | "all"
  | "attention"
  | "needs-evidence"
  | "ready-qc"
  | "issues"
  | "overdue"
  | "ready-pickup"
  | "completed-today";
export type QCQueueQuery = {
  filter: QCQueueFilter;
  stage: string;
  status: string;
  aiFlagged: boolean;
  sort: string;
  page: number;
};
export const DEFAULT_QC_QUERY: QCQueueQuery = {
  filter: "active",
  stage: "",
  status: "",
  aiFlagged: false,
  sort: "priority",
  page: 1,
};
export const QC_STAGE_LABELS: Record<string, string> = {
  confirmed: "Appointment Confirmed",
  received: "Arrived",
  in_progress: "In Service",
  quality_check: "QC",
  ready_pickup: "Ready",
  completed: "Completed",
  released: "Released",
};
export const QC_FILTER_LABELS: Record<QCQueueFilter, string> = {
  active: "Active jobs",
  all: "All jobs",
  attention: "Needs attention",
  "needs-evidence": "Needs evidence",
  "ready-qc": "Ready for QC",
  issues: "QC issues",
  overdue: "Overdue",
  "ready-pickup": "Ready for pickup",
  "completed-today": "Completed today",
};
export type QCEvidenceGate = {
  stage: string;
  uploaded: number;
  required: number;
  missing: number;
  missingSlots?: string[];
};
export type QCOperationalState = {
  terminal: boolean;
  currentGate: string;
  completedIndex: number;
  progress: number;
  evidence: QCEvidenceGate[];
  uploaded: number;
  required: number;
  missingNow: number;
  needsEvidence: boolean;
  readyQc: boolean;
  readyPickup: boolean;
  issues: boolean;
  overdue: boolean;
  elapsedMinutes: number;
  overdueMinutes: number;
  approvalBlockers: string[];
  completionAt: string | null;
  attention: boolean;
  priority: number;
};
export type QCWorkspaceSummary = {
  total: number;
  active: number;
  pending: number;
  needEvidence: number;
  readyQc: number;
  issues: number;
  readyPickup: number;
  overdue: number;
  aiFlagged: number;
  completedToday: number;
  completionDateUnavailable: number;
  stages: Record<string, number>;
  evidence: QCEvidenceGate[];
};
export type QCWorkspaceResponse = {
  success: boolean;
  jobs: QCJob[];
  summary: QCWorkspaceSummary;
  generatedAt: string;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
export function qcVehicle(job: QCJob) {
  return (
    [job.vehicleYear, job.vehicleMake || job.make, job.vehicleModel]
      .filter(Boolean)
      .join(" ") ||
    job.vehicle ||
    "Vehicle details unavailable"
  );
}
export function qcDuration(minutes: number) {
  const value = Math.max(0, Math.floor(minutes || 0));
  return value >= 60
    ? `${Math.floor(value / 60)}h ${value % 60}m`
    : `${value}m`;
}
export function qcPrimaryState(job: QCJob): {
  label: string;
  tone: "critical" | "attention" | "success" | "neutral";
} {
  const op = job.operational;
  if (op?.terminal) return { label: "Completed", tone: "success" };
  if (op?.issues) return { label: "Rework required", tone: "critical" };
  if (op?.overdue) return { label: "Overdue", tone: "critical" };
  if (job.aiFlag) return { label: "AI flagged", tone: "attention" };
  if (op?.needsEvidence)
    return { label: "Missing evidence", tone: "attention" };
  if (op?.readyQc) return { label: "Ready for QC", tone: "success" };
  if (job.status === "approved")
    return { label: "QC approved", tone: "success" };
  if (op?.readyPickup) return { label: "Pickup preparation", tone: "neutral" };
  return { label: "In progress", tone: "neutral" };
}

/** Retain the target while it is in the result; never silently choose another after removal. */
export function reconcileQCSelection(selected: string | null, jobs: QCJob[]) {
  return selected && jobs.some((job) => job.id === selected) ? selected : null;
}

export function qcDisplayDate(value?: string) {
  if (!value || !Number.isFinite(new Date(value).getTime()))
    return "Not recorded";
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
