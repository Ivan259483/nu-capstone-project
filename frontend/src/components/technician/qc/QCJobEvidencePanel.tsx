import React, { useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { QCJob } from "@/hooks/useQCData";
import {
  qcVehicle,
  QC_STAGE_LABELS,
  type QCOperationalState,
} from "@/lib/qc-workspace";
import { QCEmpty, QCEvidenceMeter, QCSkeleton } from "./QCWorkspacePrimitives";
const slotNames: Record<string, string> = {
  front: "Front",
  rear: "Rear",
  left: "Left side",
  right: "Right side",
  close_up: "Close-up",
  preassessment_form: "Pre-assessment form",
  qc_form: "QC form",
};
function safeImage(value: unknown) {
  const url = String(value || "").trim();
  return /^(https?:\/\/|\/)/i.test(url) && !url.startsWith("//") ? url : "";
}

export default function QCJobEvidencePanel({
  job,
  raw,
  op,
  loading,
}: {
  job: QCJob;
  raw: any;
  op?: QCOperationalState;
  loading: boolean;
}) {
  const [viewer, setViewer] = useState<string | null>(null);
  const imageTrigger = useRef<HTMLButtonElement | null>(null);
  const media: { url: string; label: string }[] = [];
  for (const item of raw?.trackerStageMedia || []) {
    const url = safeImage(item.photoUrl);
    if (url && !media.some((m) => m.url === url))
      media.push({
        url,
        label: `${QC_STAGE_LABELS[item.stage] || item.stage} · ${slotNames[item.slot] || "Evidence"}`,
      });
  }
  for (const kind of ["before", "after"])
    for (const photo of raw?.photos?.[kind] || []) {
      const url = safeImage(photo);
      if (url && !media.some((m) => m.url === url))
        media.push({
          url,
          label: kind === "before" ? "Before service" : "After service",
        });
    }

  const viewerIndex = media.findIndex((photo) => photo.url === viewer);
  const image = media[viewerIndex];
  const step = (delta: number) =>
    setViewer(
      media[(viewerIndex + delta + media.length) % media.length]?.url || null,
    );
  return (
    <>
      {" "}
      <section className="qcw-detail-section">
        <div className="qcw-section-heading">
          <h3>Evidence Gallery</h3>
          <Camera size={17} />
        </div>
        {op && (
          <QCEvidenceMeter
            uploaded={op.uploaded}
            required={op.required}
            label="Tracker evidence uploaded"
          />
        )}
        <p className="qcw-section-helper">
          {op?.missingNow
            ? `${op.missingNow} required now at the ${QC_STAGE_LABELS[op.currentGate]} gate.`
            : "No outstanding evidence at the current gate."}
        </p>
        {loading && !raw ? (
          <QCSkeleton rows={2} />
        ) : !raw ? (
          <QCEmpty title="Evidence unavailable">
            Retry to load the saved images.
          </QCEmpty>
        ) : media.length ? (
          <div className="qcw-gallery">
            {media.map((photo, i) => (
              <button
                type="button"
                key={photo.url}
                onClick={(e) => {
                  imageTrigger.current = e.currentTarget;
                  setViewer(photo.url);
                }}
              >
                <img src={photo.url} alt={photo.label} loading="lazy" />
                <span>{photo.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <QCEmpty title="No evidence uploaded yet">
            Upload gate evidence in Live Tracker.
          </QCEmpty>
        )}
        {op && (
          <details className="qcw-missing-requirements">
            <summary>Evidence requirements by gate</summary>
            {op.evidence.map((gate) => (
              <div key={gate.stage}>
                <strong>
                  {QC_STAGE_LABELS[gate.stage]} · {gate.uploaded} /{" "}
                  {gate.required}
                </strong>
                <p>
                  {!gate.missing
                    ? "Complete"
                    : gate.missingSlots?.length
                      ? `Missing: ${gate.missingSlots.map((slot) => slotNames[slot] || slot).join(", ")}`
                      : `${gate.missing} missing; legacy evidence has no angle labels.`}
                </p>
              </div>
            ))}
          </details>
        )}
      </section>
      <Dialog
        open={!!image}
        onOpenChange={(open) => {
          if (!open) setViewer(null);
        }}
      >
        <DialogContent
          className="qcw qcw-lightbox"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            imageTrigger.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              step(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
        >
          <DialogTitle>{image?.label || "Evidence viewer"}</DialogTitle>
          <DialogDescription>
            {qcVehicle(job)} · {viewerIndex + 1} of {media.length}
          </DialogDescription>
          {image && <img src={image.url} alt={image.label} />}
          <div className="qcw-lightbox-controls">
            <button
              type="button"
              className="qcw-button"
              disabled={media.length < 2}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={16} />
              Previous
            </button>
            <button
              type="button"
              className="qcw-button"
              disabled={media.length < 2}
              onClick={() => step(1)}
            >
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
