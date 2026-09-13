import React from "react";
import {
  AlertCircle,
  ArrowRight,
  Camera,
  Clock3,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { QCJob } from "@/hooks/useQCData";
import {
  qcDuration,
  qcPrimaryState,
  qcVehicle,
  QC_STAGE_LABELS,
} from "@/lib/qc-workspace";

export function QCEmpty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="qcw-empty">
      <Camera size={21} aria-hidden />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function QCSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="qcw-skeleton" role="status" aria-label="Loading QC data">
      <span className="sr-only">Loading QC data</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
export function QCReadStatus({
  connected,
  loading,
  error,
  updatedAt,
  onRetry,
}: {
  connected: boolean;
  loading: boolean;
  error?: string | null;
  updatedAt?: string;
  onRetry: () => void;
}) {
  const Icon = connected ? Wifi : WifiOff;
  return (
    <div className="qcw-read-status" role="status">
      <span
        className={`qcw-badge ${error ? "is-critical" : connected ? "is-success" : "is-attention"}`}
      >
        <Icon size={13} />
        {error
          ? "Refresh failed"
          : loading
            ? "Updating"
            : connected
              ? "Live connection"
              : "Reconnecting"}
      </span>
      <span>
        {updatedAt
          ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`
          : "Awaiting data"}
      </span>
      <button
        type="button"
        className="qcw-icon"
        aria-label="Refresh QC workspace"
        onClick={onRetry}
      >
        <RefreshCw size={15} />
      </button>
    </div>
  );
}
export function QCError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="qcw-error" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
      <button type="button" className="qcw-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
export function QCStateBadge({ job }: { job: QCJob }) {
  const state = qcPrimaryState(job);
  return (
    <span className={`qcw-badge is-${state.tone}`}>
      {state.tone === "critical" && <AlertCircle size={12} />}
      {state.label}
    </span>
  );
}
export function QCEvidenceMeter({
  uploaded,
  required,
  label = "Evidence",
}: {
  uploaded: number;
  required: number;
  label?: string;
}) {
  const percent = required
    ? Math.min(100, Math.round((uploaded / required) * 100))
    : 0;
  return (
    <div className="qcw-evidence-meter">
      <div>
        <span>{label}</span>
        <strong>
          {uploaded} / {required}
        </strong>
      </div>
      <progress
        value={uploaded}
        max={required || 1}
        aria-label={`${label}: ${uploaded} of ${required} uploaded`}
      />
      <span className="sr-only">{percent}%</span>
    </div>
  );
}
export function QCQueueItem({
  job,
  selected,
  onSelect,
  action,
}: {
  job: QCJob;
  selected?: boolean;
  onSelect: () => void;
  action?: string;
}) {
  const op = job.operational;
  return (
    <button
      type="button"
      className={`qcw-queue-item ${selected ? "is-selected" : ""}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="qcw-job-heading">
        <div>
          <strong>{qcVehicle(job)}</strong>
          <span>
            {job.customerName || job.customer}
            {job.plate ? ` · ${job.plate}` : ""}
          </span>
        </div>
        <QCStateBadge job={job} />
      </div>
      <p className="qcw-service">{job.service}</p>
      <div className="qcw-job-facts">
        <span>
          <small>Current work</small>
          <b>{QC_STAGE_LABELS[op?.currentGate || "confirmed"]}</b>
        </span>
        <span>
          <small>Required now</small>
          <b>
            {op?.missingNow
              ? `${op.missingNow} evidence missing`
              : op?.terminal
                ? "Complete"
                : "Evidence complete"}
          </b>
        </span>
      </div>
      {op && <QCEvidenceMeter uploaded={op.uploaded} required={op.required} />}
      <div className="qcw-queue-footer">
        <span className={op?.overdue ? "qcw-critical-text" : ""}>
          <Clock3 size={12} />
          {job.waitingTimeAvailable === false
            ? "Waiting time unavailable"
            : op?.overdue
              ? `Overdue ${qcDuration(op.overdueMinutes)}`
              : `Waiting ${qcDuration(job.elapsedMinutes)}`}
        </span>
        {job.aiFlag && (
          <span className="qcw-badge is-attention">AI flagged</span>
        )}
        <span>
          {action || "Review job"}
          <ArrowRight size={13} />
        </span>
      </div>
      {action && (
        <div className="qcw-row-meta">
          <span>{job.technician || "Unassigned"}</span>
          <span title={job.jobId}>Order {job.jobId}</span>
        </div>
      )}
    </button>
  );
}
