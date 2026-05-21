import React, { useState, useMemo } from 'react';
import { ArrowLeft, AlertTriangle, CheckCircle2, RotateCcw, User, Wrench, Camera, Clock, Car, Radio, ShieldCheck } from 'lucide-react';
import QCStatusBadge from './QCStatusBadge';
import QCImageComparisonSlider from './QCImageComparisonSlider';
import QCAIDetectionCard from './QCAIDetectionCard';
import QCReturnModal from './QCReturnModal';
import type { QCJob } from '@/hooks/useQCData';
import { BOOKING_NOTE_UNAVAILABLE, formatBookingNoteForDisplay } from '@/lib/pii-display';

interface Props {
  jobId: string | null;
  jobs: QCJob[];
  onBack: () => void;
  onApprove: (id: string) => Promise<boolean>;
  onReturn: (id: string, reason: string) => Promise<boolean>;
  onOpenLiveTracker?: () => void;
}

export default function QCJobDetailView({ jobId, jobs, onBack, onApprove, onReturn, onOpenLiveTracker }: Props) {
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  // Find the job from the live jobs list
  const job = useMemo(() => jobs.find((j) => j.id === jobId), [jobs, jobId]);
  const rawCustomerNote = job?.customerNotes || job?.notes || '';
  const customerNoteText = formatBookingNoteForDisplay(rawCustomerNote);
  const customerNoteUnavailable = Boolean(rawCustomerNote.trim()) && !customerNoteText;

  // Fallback: job not found
  if (!job) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-gray-100 ring-4 ring-slate-100 flex items-center justify-center mb-4">
          <Car size={24} className="text-slate-400" />
        </div>
        <p className="text-[15px] font-semibold text-slate-600">Job not found</p>
        <p className="text-sm text-slate-400 mt-1.5 mb-6">This job may have been updated or removed.</p>
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors">
          <ArrowLeft size={14} /> Back to Jobs
        </button>
      </div>
    );
  }

  const handleApprove = async () => {
    setApproving(true);
    const ok = await onApprove(job.id);
    setApproving(false);
    if (ok) onBack();
  };

  const handleReturn = async (reason: string) => {
    const ok = await onReturn(job.id, reason);
    if (ok) {
      setReturnModalOpen(false);
      onBack();
    }
  };

  // Format submitted date
  const submittedDisplay = job.submittedAt
    ? new Date(job.submittedAt).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  // Damage annotations shaped for QCAIDetectionCard
  const damageAnnotations = (job as any).damageAnnotations as any[] | undefined;
  const firstAnnotation = Array.isArray(damageAnnotations) && damageAnnotations.length > 0 ? damageAnnotations[0] : null;
  const aiDetection = firstAnnotation
    ? {
        id: `${job.id}-det`,
        status: 'pending' as const,
        confidence: firstAnnotation.confidence || 85,
        damageType: firstAnnotation.type || 'Damage Detected',
        location: firstAnnotation.panel || firstAnnotation.location || 'Unknown',
        description: firstAnnotation.note || 'AI-detected damage requiring review before approval.',
        recommendation: 'Re-examine the flagged area before approving this job.',
        severity: firstAnnotation.severity || 'moderate',
        imageUrl: firstAnnotation.images?.[0] || '',
        imageAlt: `Damage on ${job.vehicle}`,
      }
    : null;

  // Photos
  const beforeSrc = (job as any).photos?.before?.[0] || '';
  const afterSrc = (job as any).photos?.after?.[0] || '';

  const checklist = Array.isArray((job as any).qcChecklist) ? ((job as any).qcChecklist as { item: string; passed: boolean }[]) : [];
  const checklistPassed = checklist.filter((row) => row.passed).length;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/90 to-slate-50/80 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Radio size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Shop-floor QC lives in Live Tracker</p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              Gate photos, plate check, and checklist scoring stay in Live Tracker. This page is for final sign-off only.
            </p>
          </div>
        </div>
        {onOpenLiveTracker ? (
          <button
            type="button"
            onClick={onOpenLiveTracker}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 py-2 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
          >
            <Radio size={14} />
            Open in Live Tracker
          </button>
        ) : null}
      </div>

      {/* Breadcrumb + Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
          <button onClick={onBack} className="hover:text-slate-600 transition-colors flex items-center gap-1.5">
            <ArrowLeft size={14} /> Jobs for Review
          </button>
          <span>/</span>
          <span className="text-slate-600 font-medium">{job.jobId}</span>
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Sign off · {job.jobId}</h1>
              <QCStatusBadge status={job.status} />
              {job.aiFlag && (
                <span className="flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
                  <AlertTriangle size={10} /> AI Flagged
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5"><Car size={13} /> {job.vehicleYear} {job.vehicleMake} {job.vehicleModel}</span>
              <span className="flex items-center gap-1.5"><User size={13} /> {job.customer}</span>
              <span className="flex items-center gap-1.5"><Wrench size={13} /> {job.technician}</span>
              <span className="flex items-center gap-1.5"><Clock size={13} /> Submitted {submittedDisplay}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setReturnModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 text-sm font-medium transition-all duration-150 active:scale-95">
              <RotateCcw size={15} /> Return to Technician
            </button>
            <button onClick={handleApprove} disabled={approving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed min-w-[130px] justify-center">
              {approving
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Approving...</>
                : <><CheckCircle2 size={15} />Approve Job</>}
            </button>
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* LEFT: Photo Comparison (3/5) */}
        <div className="xl:col-span-3 space-y-5">
          {/* Before & After */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Camera size={15} className="text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-800">Before & After Photo Comparison</h3>
              </div>
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-xs">Drag slider to compare</span>
            </div>
            {beforeSrc || afterSrc ? (
              <QCImageComparisonSlider
                beforeSrc={beforeSrc}
                beforeAlt={`${job.vehicle} before`}
                afterSrc={afterSrc}
                afterAlt={`${job.vehicle} after`}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-14 text-center text-slate-400 bg-slate-50">
                <Camera size={32} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">No photos uploaded yet</p>
                <p className="text-xs mt-1 opacity-70">Before & after photos will appear here when uploaded by the technician</p>
              </div>
            )}
          </div>

          {/* Vehicle Info Card */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Car size={14} className="text-slate-400" /> Vehicle & Service Details
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { label: 'Make / Model', value: `${job.vehicleYear} ${job.vehicleMake} ${job.vehicleModel}`.trim() || '—' },
                { label: 'Color', value: job.vehicleColor || '—' },
                { label: 'License Plate', value: job.plate || '—' },
                { label: 'Service Ordered', value: job.service || '—' },
                { label: 'Elapsed Time', value: job.elapsed || '—' },
                { label: 'Technician', value: job.technician || '—' },
              ].map((item) => (
                <div key={`vinfo-${item.label}`} className="space-y-0.5">
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{item.label}</p>
                  <p className="text-sm text-slate-700 font-medium">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* AI Detection */}
          {aiDetection && <QCAIDetectionCard detection={aiDetection} />}
        </div>

        {/* RIGHT: Review Panel (2/5) */}
        <div className="xl:col-span-2 space-y-5">
          {/* Customer Notes */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <User size={14} className="text-slate-400" /> Customer Notes
            </h3>
            <div
              className={`rounded-lg border p-4 ${
                customerNoteUnavailable ? 'border-amber-100 bg-amber-50' : 'border-blue-100 bg-blue-50'
              }`}
            >
              <p
                className={`text-sm leading-relaxed ${
                  customerNoteUnavailable ? 'italic text-amber-800' : 'text-slate-700'
                }`}
              >
                {customerNoteUnavailable ? (
                  BOOKING_NOTE_UNAVAILABLE
                ) : customerNoteText ? (
                  customerNoteText
                ) : (
                  <span className="text-slate-400 italic">No special instructions from the customer.</span>
                )}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Phone</p><p className="text-sm text-slate-700 font-medium mt-0.5">{job.customerPhone || '—'}</p></div>
              <div><p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">Email</p><p className="text-sm text-slate-700 font-medium mt-0.5 truncate">{job.customerEmail || '—'}</p></div>
            </div>
          </div>

          {/* Technician Notes */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Wrench size={14} className="text-slate-400" /> Technician Notes
              <span className="text-[11px] text-slate-400 ml-auto">{job.technician}</span>
            </h3>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-sm text-slate-700 leading-relaxed">
                {job.technicianNotes?.trim() || <span className="text-slate-400 italic">No notes from the technician.</span>}
              </p>
            </div>
          </div>

          {/* QC checklist summary (editable in Live Tracker) */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <ShieldCheck size={14} className="text-slate-400" />
                Checklist status
              </h3>
              {onOpenLiveTracker ? (
                <button
                  type="button"
                  onClick={onOpenLiveTracker}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Edit in Live Tracker
                </button>
              ) : null}
            </div>
            <p className="text-2xl font-bold tabular-nums text-slate-900">
              {checklist.length > 0 ? `${checklistPassed}/${checklist.length}` : '—'}
              <span className="ml-2 text-sm font-medium text-slate-500">items passed</span>
            </p>
            {checklist.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {checklist.slice(0, 5).map((row) => (
                  <li key={row.item} className="flex items-center gap-2 text-xs text-slate-600">
                    <span className={row.passed ? 'text-emerald-600' : 'text-slate-300'}>
                      {row.passed ? '✓' : '○'}
                    </span>
                    <span className="truncate">{row.item}</span>
                  </li>
                ))}
                {checklist.length > 5 ? (
                  <li className="text-xs text-slate-400">+{checklist.length - 5} more in Live Tracker</li>
                ) : null}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No checklist saved yet — complete gates in Live Tracker.</p>
            )}
          </div>

          {/* Quality Decision */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Quality Decision</h3>
            <div className="space-y-3">
              <button onClick={handleApprove} disabled={approving}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed">
                {approving
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Approving...</>
                  : <><CheckCircle2 size={16} />Approve Job — {job.jobId}</>}
              </button>
              <button onClick={() => setReturnModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-semibold transition-all duration-150 active:scale-95">
                <RotateCcw size={16} /> Return to Technician
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-3 text-center leading-relaxed">
              Approving marks this job as complete and notifies the customer. Returning sends it back to {job.technician} with your comments.
            </p>
          </div>
        </div>
      </div>

      <QCReturnModal
        open={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        jobId={job.jobId}
        technician={job.technician || 'Unassigned'}
        onConfirm={handleReturn}
      />
    </>
  );
}
