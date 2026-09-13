import React from "react";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import type { QCJob } from "@/hooks/useQCData";
import { qcDisplayDate } from "@/lib/qc-workspace";
import {
  BOOKING_NOTE_UNAVAILABLE,
  formatBookingNoteForDisplay,
} from "@/lib/pii-display";
import { QCEmpty } from "./QCWorkspacePrimitives";
export default function QCSavedInspectionPanels({
  job,
  raw,
  hydrated,
  onOpenLiveTracker,
}: {
  job: QCJob;
  raw: any;
  hydrated: boolean;
  onOpenLiveTracker?: () => void;
}) {
  const checklist = hydrated ? raw?.qcChecklist || [] : job.qcChecklist || [];
  const handoff = hydrated
    ? raw?.qcHandoffSheet || {}
    : job.qcHandoffSheet || {};
  const handoffFields = [
    ["clientName", "Client name"],
    ["serviceDate", "Service date"],
    ["makeModel", "Make / model"],
    ["plateNo", "Plate"],
    ["tintShadeInstalled", "Tint shade installed"],
    ["installer", "Installer"],
  ];
  const requiredHandoff = ["clientName", "serviceDate", "makeModel"];
  const handoffComplete = requiredHandoff.filter((key) =>
    String(handoff[key] || "").trim(),
  ).length;
  const savedNote = String(raw?.notes ?? job.customerNotes ?? job.notes ?? "");
  const customerNote = formatBookingNoteForDisplay(savedNote);
  const notes = hydrated ? raw?.staffNotes || [] : job.staffNotes || [];
  const findings = Array.isArray(raw?.damageAnnotations)
    ? raw.damageAnnotations
    : [];
  const aiFindings = findings.filter(
    (finding: any) =>
      finding.source === "ai" ||
      finding.detectedBy === "ai" ||
      finding.aiGenerated === true,
  );
  return (
    <>
      {" "}
      <section className="qcw-detail-section">
        <div className="qcw-section-heading">
          <h3>AI-assisted Review</h3>
          <span className="qcw-badge is-neutral">
            {aiFindings.length ? "Findings available" : "Analysis unavailable"}
          </span>
        </div>
        <p className="qcw-section-helper">
          AI-assisted analysis — final decision requires Quality Checker review.
        </p>
        {aiFindings.length ? (
          aiFindings.map((finding: any, i: number) => (
            <div className="qcw-finding" key={i}>
              <strong>{finding.type || "Recorded finding"}</strong>
              {finding.location || finding.panel ? (
                <span>{finding.location || finding.panel}</span>
              ) : null}
              {typeof finding.confidence === "number" &&
                Number.isFinite(finding.confidence) && (
                  <span>Recorded confidence: {finding.confidence}</span>
                )}
              {finding.note && <p>{finding.note}</p>}
            </div>
          ))
        ) : (
          <p className="qcw-quiet-copy">
            No linked AI analysis is provided for this job. This does not
            indicate an AI clear result.
          </p>
        )}
        {findings.length > aiFindings.length && (
          <details className="qcw-evidence-requirements">
            <summary>
              {findings.length - aiFindings.length} other recorded damage
              annotation(s)
            </summary>
            <p className="qcw-quiet-copy">
              These records have no confirmed AI source.
            </p>
            {findings
              .filter((finding: any) => !aiFindings.includes(finding))
              .map((finding: any, i: number) => (
                <div className="qcw-finding" key={i}>
                  <strong>{finding.type || "Recorded finding"}</strong>
                  {(finding.location || finding.panel) && (
                    <span>{finding.location || finding.panel}</span>
                  )}
                  {finding.note && <p>{finding.note}</p>}
                </div>
              ))}
          </details>
        )}
      </section>
      <section className="qcw-detail-section">
        <div className="qcw-section-heading">
          <h3>QC Checklist</h3>
          {onOpenLiveTracker && (
            <button
              type="button"
              className="qcw-link"
              onClick={onOpenLiveTracker}
            >
              Edit in Tracker
              <ArrowRight size={13} />
            </button>
          )}
        </div>
        {checklist.length ? (
          <>
            <p className="qcw-section-helper">
              {checklist.filter((item: any) => item.passed === true).length} /{" "}
              {checklist.length} marked passed
            </p>
            <ul className="qcw-checklist">
              {checklist.map((item: any, i: number) => (
                <li key={`${item.item}-${i}`}>
                  {item.passed === true ? (
                    <CheckCircle2 size={16} className="qcw-success-text" />
                  ) : (
                    <Circle size={16} />
                  )}
                  <div>
                    <span>{item.item}</span>
                    {item.note && <small>{item.note}</small>}
                  </div>
                  <strong>
                    {item.passed === true ? "Pass" : "Not marked passed"}
                  </strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <QCEmpty title="No saved checklist">
            Saved checklist results will appear after inspection in Live
            Tracker.
          </QCEmpty>
        )}
      </section>
      <section className="qcw-detail-section">
        <div className="qcw-section-heading">
          <h3>Handoff Information</h3>
          <span>{handoffComplete} / 3 core fields complete</span>
        </div>
        <dl className="qcw-handoff">
          {handoffFields.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd
                className={
                  !handoff[key] && requiredHandoff.includes(key)
                    ? "qcw-attention-text"
                    : ""
                }
              >
                {handoff[key] ||
                  (requiredHandoff.includes(key) ? "Missing" : "Not recorded")}
              </dd>
            </div>
          ))}
        </dl>
        {onOpenLiveTracker && (
          <button
            type="button"
            className="qcw-link"
            onClick={onOpenLiveTracker}
          >
            Complete handoff in Live Tracker
            <ArrowRight size={13} />
          </button>
        )}
      </section>
      {(savedNote || notes.length || raw?.serviceProper?.technicianNotes) && (
        <section className="qcw-detail-section">
          <h3>Job Notes</h3>
          {savedNote && (
            <div className="qcw-note">
              <strong>Customer instructions</strong>
              <p>{customerNote || BOOKING_NOTE_UNAVAILABLE}</p>
            </div>
          )}
          {raw?.serviceProper?.technicianNotes && (
            <div className="qcw-note">
              <strong>Technician</strong>
              <p>{raw.serviceProper.technicianNotes}</p>
            </div>
          )}
          {notes.map((note: any, i: number) => (
            <div className="qcw-note" key={note._id || i}>
              <strong>{note.detailerName || "Staff note"}</strong>
              <p>{note.content}</p>
              {note.createdAt && <small>{qcDisplayDate(note.createdAt)}</small>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}
