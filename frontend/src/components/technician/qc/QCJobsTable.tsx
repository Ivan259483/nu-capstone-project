import React, { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { QCQueueQuery, QCWorkspaceResponse } from "@/lib/qc-workspace";
import {
  DEFAULT_QC_QUERY,
  QC_FILTER_LABELS,
  QC_STAGE_LABELS,
  reconcileQCSelection,
} from "@/lib/qc-workspace";
import {
  QCEmpty,
  QCError,
  QCQueueItem,
  QCReadStatus,
  QCSkeleton,
} from "./QCWorkspacePrimitives";
import QCJobDetailView from "./QCJobDetailView";

type Props = {
  data: QCWorkspaceResponse | null;
  loading: boolean;
  settled: boolean;
  error: string | null;
  connected: boolean;
  query: QCQueueQuery;
  onQueryChange: (query: QCQueueQuery) => void;
  selectedJobId: string | null;
  onSelectJob: (id: string | null) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onRetry: () => void;
  onApprove: (id: string) => Promise<boolean>;
  onReturn: (id: string, reason: string) => Promise<boolean>;
  onOpenLiveTracker: (id: string) => void;
  scope: "all" | "mine";
};
export default function QCJobsTable(p: Props) {
  const queueRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const previousSelection = useRef(p.selectedJobId);
  const firstSelection = useRef(Boolean(p.selectedJobId));
  const [notice, setNotice] = useState("");
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  const jobs = p.data?.jobs || [];
  const summary = p.data?.summary;
  const filterCount = [
    p.query.filter !== "active",
    Boolean(p.query.stage),
    Boolean(p.query.status),
    p.query.aiFlagged,
  ].filter(Boolean).length;
  const update = (patch: Partial<QCQueueQuery>) => {
    p.onQueryChange({ ...p.query, ...patch, page: 1 });
  };
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const change = () => setMobile(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!p.settled) return;
    if (p.selectedJobId && !reconcileQCSelection(p.selectedJobId, jobs)) {
      firstSelection.current = true;
      p.onSelectJob(null);
      setNotice(
        "The selected job is no longer in these results. Choose a job to continue.",
      );
    } else if (!firstSelection.current && !mobile && jobs.length) {
      firstSelection.current = true;
      p.onSelectJob(jobs[0].id);
    }
  }, [p.settled, p.data, p.selectedJobId, mobile]);
  useEffect(() => {
    if (mobile && p.selectedJobId) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({
        block: "start",
        behavior: "instant",
      });
    } else if (mobile && previousSelection.current) {
      queueRef.current?.focus({ preventScroll: true });
      queueRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
    previousSelection.current = p.selectedJobId;
  }, [p.selectedJobId, mobile]);
  useEffect(() => {
    const el = queueRef.current;
    try {
      if (el)
        el.scrollTop = Number(
          sessionStorage.getItem("qc-review-queue-scroll") || 0,
        );
    } catch {
      /* optional */
    }
    return () => {
      try {
        if (el)
          sessionStorage.setItem(
            "qc-review-queue-scroll",
            String(el.scrollTop),
          );
      } catch {
        /* optional */
      }
    };
  }, []);
  const select = (id: string) => {
    firstSelection.current = true;
    setNotice("");
    p.onSelectJob(id);
  };
  return (
    <div className="qcw qcw-review-desk">
      <header className="qcw-command-header">
        <div>
          <p className="qcw-eyebrow">Quality control</p>
          <h1>QC Review Desk</h1>
          <p>Review evidence, saved inspections, and sign-off requirements.</p>
        </div>
        <QCReadStatus
          connected={p.connected}
          loading={p.loading}
          error={p.error}
          updatedAt={p.data?.generatedAt}
          onRetry={p.onRetry}
        />
      </header>
      <div className="qcw-review-summary">
        <span className="qcw-badge is-attention">
          {summary?.needEvidence ?? "—"} need evidence
        </span>
        <span>{summary?.overdue ?? "—"} overdue</span>
        <span>{summary?.issues ?? "—"} QC issues</span>
        <span>{summary?.aiFlagged ?? "—"} AI flagged</span>
        <span>
          {summary?.total ?? "—"} total jobs ·{" "}
          {p.scope === "mine" ? "My Jobs" : "All Jobs"}
        </span>
      </div>
      <div className="qcw-toolbar">
        <label className="qcw-search">
          <Search size={16} />
          <input
            type="search"
            value={p.searchQuery}
            onChange={(e) => {
              p.onSearchQueryChange(e.target.value);
              update({});
            }}
            placeholder="Search order, customer, plate, vehicle..."
            aria-label="Search QC jobs"
          />
        </label>
        <label className="qcw-select">
          <span>Sort</span>
          <select
            aria-label="Sort QC jobs"
            value={p.query.sort}
            onChange={(e) => update({ sort: e.target.value })}
          >
            <option value="priority">Priority</option>
            <option value="elapsed">Longest waiting</option>
            <option value="submitted">Newest submitted</option>
            <option value="customer">Customer A–Z</option>
          </select>
        </label>
        <label className="qcw-select">
          <span>Status</span>
          <select
            aria-label="QC job status"
            value={p.query.status}
            onChange={(e) => update({ status: e.target.value })}
          >
            <option value="">All statuses</option>
            {[
              "pending-review",
              "in-review",
              "approved",
              "needs-fix",
              "resubmitted",
            ].map((status) => (
              <option key={status} value={status}>
                {status.replace(/-/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="qcw-button"
          aria-pressed={p.query.aiFlagged}
          onClick={() => update({ aiFlagged: !p.query.aiFlagged })}
        >
          AI flagged
        </button>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className="qcw-button">
              <SlidersHorizontal size={15} />
              Filters
              {filterCount > 0 && (
                <span className="qcw-count">{filterCount}</span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="qcw qcw-filter-popover" align="end">
            <h3>Filter review queue</h3>
            <label>
              Work state
              <select
                value={p.query.filter}
                onChange={(e) =>
                  update({ filter: e.target.value as QCQueueQuery["filter"] })
                }
              >
                {Object.entries(QC_FILTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Current work stage
              <select
                value={p.query.stage}
                onChange={(e) => update({ stage: e.target.value })}
              >
                <option value="">All stages</option>
                {Object.entries(QC_STAGE_LABELS)
                  .filter(
                    ([value]) => !["confirmed", "released"].includes(value),
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className="qcw-button"
              onClick={() => {
                p.onQueryChange(DEFAULT_QC_QUERY);
                p.onSearchQueryChange("");
              }}
            >
              Reset filters
            </button>
          </PopoverContent>
        </Popover>
      </div>
      {!!filterCount && (
        <div className="qcw-active-filters">
          <span>
            {QC_FILTER_LABELS[p.query.filter]}
            {p.query.stage ? ` · ${QC_STAGE_LABELS[p.query.stage]}` : ""}
            {p.query.status ? ` · ${p.query.status}` : ""}
            {p.query.aiFlagged ? " · AI flagged" : ""}
          </span>
          <button
            type="button"
            className="qcw-link"
            onClick={() => p.onQueryChange(DEFAULT_QC_QUERY)}
          >
            <X size={13} />
            Clear filters
          </button>
        </div>
      )}
      {p.error && (
        <QCError
          message={`${p.error}${p.data ? " Showing the last successful snapshot." : ""}`}
          onRetry={p.onRetry}
        />
      )}
      {notice && (
        <p className="qcw-selection-notice" role="status">
          {notice}
        </p>
      )}
      <div
        className={`qcw-master-detail ${p.selectedJobId ? "has-selection" : ""}`}
      >
        <section
          className="qcw-panel qcw-review-queue"
          aria-label="Review queue"
        >
          <div className="qcw-section-heading">
            <h2>Review Queue</h2>
            <span>
              {p.data?.total ?? "—"} results{p.loading ? " · Updating" : ""}
            </span>
          </div>
          <div
            className="qcw-review-queue-scroll"
            ref={queueRef}
            tabIndex={-1}
            aria-busy={p.loading}
          >
            {!p.data ? (
              p.loading ? (
                <QCSkeleton />
              ) : (
                <QCEmpty title="Queue unavailable">Retry to load jobs.</QCEmpty>
              )
            ) : jobs.length ? (
              jobs.map((job) => (
                <QCQueueItem
                  key={job.id}
                  job={job}
                  selected={p.selectedJobId === job.id}
                  onSelect={() => select(job.id)}
                />
              ))
            ) : (
              <QCEmpty title="No matching jobs">
                Adjust the filters or search to see other jobs.
              </QCEmpty>
            )}
          </div>
          <div className="qcw-pagination">
            <span>
              Page {p.data?.page || 1} of {p.data?.totalPages || 1}
            </span>
            <button
              type="button"
              className="qcw-icon"
              aria-label="Previous page"
              disabled={!p.data || p.data.page <= 1 || p.loading}
              onClick={() =>
                p.onQueryChange({ ...p.query, page: p.data!.page - 1 })
              }
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="qcw-icon"
              aria-label="Next page"
              disabled={
                !p.data || p.data.page >= p.data.totalPages || p.loading
              }
              onClick={() =>
                p.onQueryChange({ ...p.query, page: p.data!.page + 1 })
              }
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </section>
        <section
          ref={detailRef}
          tabIndex={-1}
          className="qcw-panel qcw-detail-container"
          aria-label="QC job workspace"
        >
          {p.selectedJobId ? (
            <QCJobDetailView
              key={p.selectedJobId}
              jobId={p.selectedJobId}
              jobs={jobs}
              onBack={() => {
                firstSelection.current = true;
                p.onSelectJob(null);
              }}
              onApprove={p.onApprove}
              onReturn={p.onReturn}
              onOpenLiveTracker={() => p.onOpenLiveTracker(p.selectedJobId!)}
              refreshToken={p.data?.generatedAt}
              scope={p.scope}
            />
          ) : (
            <QCEmpty title="Select a job to review">
              Inspect evidence and saved QC results, then make the final
              decision.
            </QCEmpty>
          )}
        </section>
      </div>
    </div>
  );
}
