import React, { useState } from 'react';
import { ScanSearch, AlertTriangle, CheckCircle2, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface AIDetection {
  id: string;
  status: string;
  confidence: number;
  damageType: string;
  location: string;
  description: string;
  recommendation: string;
  severity: string;
  imageUrl: string;
  imageAlt: string;
}

export default function QCAIDetectionCard({ detection }: { detection: AIDetection }) {
  const [decision, setDecision] = useState<'confirmed' | 'rejected' | null>(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const handleDecision = async (type: 'confirmed' | 'rejected') => {
    if (type === decision && !showNote) { setShowNote(true); return; }
    setDecision(type);
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    setSubmitting(false);
    if (type === 'confirmed') {
      toast.warning('AI detection confirmed — job must be returned to technician', { duration: 4000 });
    } else {
      toast.success('Marked as false positive', { duration: 3000 });
    }
  };

  const severityConfig: Record<string, { label: string; cls: string }> = {
    critical: { label: 'Critical',  cls: 'bg-rose-50/80 text-rose-700 border border-rose-200/70' },
    moderate: { label: 'Moderate',  cls: 'bg-amber-50/80 text-amber-700 border border-amber-200/70' },
    low:      { label: 'Low',       cls: 'bg-slate-50/80 text-slate-500 border border-slate-200/70' },
  };
  const sev = severityConfig[detection.severity] ?? severityConfig.low;

  const headerBg   = decision === 'confirmed' ? 'bg-rose-50/60'    : decision === 'rejected' ? 'bg-emerald-50/60'    : 'bg-orange-50/50';
  const borderColor= decision === 'confirmed' ? 'border-rose-200/70' : decision === 'rejected' ? 'border-emerald-200/70' : 'border-orange-200/70';
  const iconColor  = decision === 'rejected' ? 'text-emerald-500' : 'text-orange-500';

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden ${borderColor}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${headerBg}`}
      >
        <div className="flex items-center gap-2.5">
          <ScanSearch size={14} className={iconColor} />
          <span className="text-sm font-semibold text-slate-800 tracking-tight">AI Damage Detection Result</span>
          {decision === null && (
            <span className="text-[11px] font-medium bg-orange-100/80 text-orange-700 border border-orange-200/70 px-2.5 py-0.5 rounded-full">Awaiting Decision</span>
          )}
          {decision === 'confirmed' && (
            <span className="text-[11px] font-medium bg-rose-100/80 text-rose-700 border border-rose-200/70 px-2.5 py-0.5 rounded-full">Confirmed</span>
          )}
          {decision === 'rejected' && (
            <span className="text-[11px] font-medium bg-emerald-100/80 text-emerald-700 border border-emerald-200/70 px-2.5 py-0.5 rounded-full">False Positive</span>
          )}
        </div>
        {expanded ? <ChevronUp size={15} className="text-slate-400" /> : <ChevronDown size={15} className="text-slate-400" />}
      </button>

      {expanded && (
        <div className="bg-white p-5 space-y-4">
          {/* Image + Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-100 ring-1 ring-slate-200/60">
              {detection.imageUrl ? (
                <img src={detection.imageUrl} alt={detection.imageAlt} className="w-full h-44 object-cover" />
              ) : (
                <div className="w-full h-44 flex items-center justify-center">
                  <ScanSearch size={28} className="text-slate-300" />
                </div>
              )}
              {/* Bounding box overlay */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute border-2 border-rose-400 rounded" style={{ top: '55%', left: '60%', width: '30%', height: '25%' }}>
                  <div className="absolute -top-5 left-0 bg-rose-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap">
                    {detection.damageType} — {detection.confidence}%
                  </div>
                </div>
              </div>
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded-lg backdrop-blur-sm tracking-wide">
                AI Detection Overlay
              </div>
            </div>

            <div className="space-y-3.5">
              {[
                { label: 'Damage Type', value: detection.damageType },
                { label: 'Location', value: detection.location },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">{item.label}</p>
                  <p className="text-sm font-medium text-slate-700 mt-0.5">{item.value}</p>
                </div>
              ))}
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Severity</p>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1 rounded-full mt-1 ${sev.cls}`}>
                  <AlertTriangle size={10} /> {sev.label}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-1.5">AI Confidence</p>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-700" style={{ width: `${detection.confidence}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-rose-500 tabular-nums">{detection.confidence}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest mb-2">AI Analysis</p>
            <p className="text-sm text-slate-600 leading-relaxed">{detection.description}</p>
          </div>

          {/* Recommendation */}
          <div className="bg-amber-50/70 border border-amber-100/80 rounded-xl p-4">
            <p className="text-[10px] font-medium text-amber-500 uppercase tracking-widest mb-2">Recommended Action</p>
            <p className="text-sm text-amber-800 leading-relaxed">{detection.recommendation}</p>
          </div>

          {/* Decision */}
          <div className="space-y-3 pt-1">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Your Decision</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleDecision('confirmed')} disabled={submitting}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 active:scale-95 disabled:opacity-60
                  ${decision === 'confirmed' ? 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-100' : 'bg-white text-rose-700 border-rose-200/80 hover:bg-rose-50'}`}>
                <AlertTriangle size={14} /> Confirm Damage
              </button>
              <button
                onClick={() => handleDecision('rejected')} disabled={submitting}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all duration-150 active:scale-95 disabled:opacity-60
                  ${decision === 'rejected' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm shadow-emerald-100' : 'bg-white text-emerald-700 border-emerald-200/80 hover:bg-emerald-50'}`}>
                <CheckCircle2 size={14} /> False Positive
              </button>
            </div>

            <button onClick={() => setShowNote(!showNote)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium">
              <MessageSquare size={12} />
              {showNote ? 'Hide note' : 'Add correction note'}
            </button>

            {showNote && (
              <div className="space-y-2">
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder="Describe what you observed during manual inspection..."
                  className="w-full text-sm px-3.5 py-3 border border-slate-200/80 rounded-xl bg-slate-50/50 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 resize-none transition-all" />
                <button
                  onClick={async () => {
                    if (!note.trim()) return;
                    setSubmitting(true);
                    await new Promise((r) => setTimeout(r, 600));
                    setSubmitting(false);
                    toast.success('Correction note saved');
                    setShowNote(false);
                  }}
                  disabled={submitting || !note.trim()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                  {submitting ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <MessageSquare size={11} />}
                  Save Note
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
