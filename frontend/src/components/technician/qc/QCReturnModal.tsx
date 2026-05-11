import React, { useEffect, useRef, useState } from 'react';
import { X, RotateCcw, AlertTriangle, ChevronDown } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface ReturnModalProps {
  open: boolean;
  onClose: () => void;
  jobId: string;
  technician: string;
  onConfirm?: (reason: string) => Promise<void>;
}

interface ReturnFormValues {
  reason: string;
  comment: string;
  priority: string;
}

const returnReasons = [
  'Missing before/after photos',
  'Service does not match job order',
  'Visible damage remaining on vehicle',
  'Unsatisfactory finish quality',
  'Customer concern not addressed',
  'AI damage detection requires correction',
  'Incorrect product/material used',
  'Other — see comment',
];

export default function QCReturnModal({ open, onClose, jobId, technician, onConfirm }: ReturnModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ReturnFormValues>({
    defaultValues: { reason: '', comment: '', priority: 'normal' },
  });

  const reason = watch('reason');

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const onSubmit = async (data: ReturnFormValues) => {
    setSubmitting(true);
    const fullReason = `${data.reason}${data.comment ? ': ' + data.comment : ''}`;
    if (onConfirm) {
      await onConfirm(fullReason);
    } else {
      await new Promise((r) => setTimeout(r, 1200));
      toast.info(`${jobId} returned to ${technician} — they will be notified with your comments`, { duration: 5000 });
    }
    setSubmitting(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="return-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
              <RotateCcw size={16} className="text-rose-600" />
            </div>
            <div>
              <h2 id="return-modal-title" className="text-base font-semibold text-slate-900">Return to Technician</h2>
              <p className="text-xs text-slate-400 mt-0.5">{jobId} → {technician}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5">
          {/* Reason */}
          <div className="space-y-1.5">
            <label htmlFor="return-reason" className="block text-sm font-medium text-slate-700">
              Reason for Return <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-slate-400">Select the primary issue that requires correction</p>
            <div className="relative">
              <select
                id="return-reason"
                {...register('reason', { required: 'Please select a reason for returning this job' })}
                className="w-full appearance-none px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-all pr-9"
              >
                <option value="">Select a reason...</option>
                {returnReasons.map((r) => (
                  <option key={`reason-${r}`} value={r}>{r}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {errors.reason && (
              <p className="text-xs text-rose-600 mt-1">{errors.reason.message}</p>
            )}
          </div>

          {/* Comment */}
          <div className="space-y-1.5">
            <label htmlFor="return-comment" className="block text-sm font-medium text-slate-700">
              Detailed Comments <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-slate-400">
              Be specific — {technician} will use this to correct the job
            </p>
            <textarea
              id="return-comment"
              {...register('comment', {
                required: 'Please describe what needs to be corrected',
                minLength: { value: 20, message: 'Please provide at least 20 characters of detail' },
              })}
              rows={4}
              placeholder={`e.g. "The rear quarter panel scratch flagged by AI is confirmed visible under direct light. Please perform spot paint correction and re-apply ceramic coating to that area before resubmitting. Also check the fuel cap area as requested by the customer."`}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-700 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none transition-all"
            />
            {errors.comment && (
              <p className="text-xs text-rose-600 mt-1">{errors.comment.message}</p>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">Correction Priority</label>
            <div className="flex items-center gap-3">
              {[
                { value: 'low', label: 'Low', color: 'border-slate-200 text-slate-600 hover:bg-slate-50' },
                { value: 'normal', label: 'Normal', color: 'border-blue-200 text-blue-700 hover:bg-blue-50' },
                { value: 'urgent', label: 'Urgent', color: 'border-rose-200 text-rose-700 hover:bg-rose-50' },
              ].map((opt) => (
                <label
                  key={`priority-${opt.value}`}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-all ${opt.color}`}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    {...register('priority')}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Warning notice */}
          <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-relaxed">
              Returning this job will notify {technician} immediately. The job status will change to <strong>Needs Fix</strong> and re-enter your review queue once resubmitted.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RotateCcw size={15} />
                  Return to Technician
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
