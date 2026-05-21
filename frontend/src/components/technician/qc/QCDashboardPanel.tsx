import React, { useState, useCallback, useEffect } from 'react';
import { ImageIcon, MessageSquare, Zap, CheckCircle2, AlertTriangle, Loader2, TrendingUp, DollarSign, Eye, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { BOOKING_NOTE_UNAVAILABLE, formatBookingNoteForDisplay } from '@/lib/pii-display';
import QCSidebar from './QCSidebar';
import QCTopbar from './QCTopbar';
import QCDashboardView from './QCDashboardView';
import QCReportsView from './QCReportsView';
import QCJobsTable from './QCJobsTable';
import QCJobDetailView from './QCJobDetailView';
import QCChecklistPanel from './QCChecklistPanel';
import QCAIDetectionCard from './QCAIDetectionCard';
import QCImageComparisonSlider from './QCImageComparisonSlider';
import QCLiveTrackerView from './QCLiveTrackerView';
import {
  getQCJobWorkflowAction,
  stashLiveTrackerDeepLinkJobId,
} from '@/lib/qc-job-workflow';
import { useQCData } from '@/hooks/useQCData';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'before-after' | 'ai-detection' | 'customer-notes' | 'reports' | 'live-tracker';

// ─── Customer Notes View ──────────────────────────────────────────────────────
function CustomerNotesView({
  jobs,
}: {
  jobs: { id: string; customer: string; jobId: string; vehicle: string; customerNotes?: string; notes?: string; submittedAt: string }[];
}) {
  useEffect(() => {
    console.log('QC jobs with notes:', jobs.filter((j) => j.customerNotes || j.notes));
  }, [jobs]);

  const notesByJob = jobs.map((job) => {
    const rawNote = job.customerNotes || job.notes || '';
    const displayNote = formatBookingNoteForDisplay(rawNote);
    return {
      ...job,
      rawNote,
      displayNote,
      noteUnavailable: Boolean(rawNote.trim()) && !displayNote,
    };
  });
  const withNotes = notesByJob.filter((j) => j.displayNote || j.noteUnavailable);

  return (
    <div className="flex min-h-[calc(100vh-10.5rem)] flex-col">
      <div className="shrink-0">
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Customer Notes</h1>
        <p className="mt-0.5 text-sm text-slate-400">
          {withNotes.length} note{withNotes.length !== 1 ? 's' : ''} from active jobs
        </p>
      </div>

      {withNotes.length > 0 ? (
        <div className="mt-6 flex flex-1 flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {withNotes.map((j) => (
              <div
                key={j.id}
                className="qc-dash-surface rounded-2xl bg-white p-5 shadow-sm shadow-slate-200/50 transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold tracking-tight text-slate-800">{j.customer}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {j.jobId} · {j.vehicle}
                    </p>
                  </div>
                  <span className="ml-2 shrink-0 text-xs tabular-nums text-slate-400">
                    {j.submittedAt ? new Date(j.submittedAt).toLocaleDateString() : '—'}
                  </span>
                </div>
                <div
                  className={`rounded-xl border p-4 ${
                    j.noteUnavailable
                      ? 'border-amber-100/80 bg-amber-50/60'
                      : 'border-blue-100/80 bg-blue-50/70'
                  }`}
                >
                  <p
                    className={`text-sm leading-relaxed ${
                      j.noteUnavailable ? 'italic text-amber-800' : 'text-slate-700'
                    }`}
                  >
                    {j.noteUnavailable ? BOOKING_NOTE_UNAVAILABLE : j.displayNote}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl bg-slate-50/40 px-6 py-14 text-center shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12)]">
            <MessageSquare size={22} className="mb-3 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">More notes appear here as new jobs are assigned.</p>
          </div>
        </div>
      ) : (
        <div
          className="qc-dash-surface mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl bg-white px-6 py-20 text-center"
          style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%)' }}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 ring-4 ring-green-50">
            <MessageSquare size={20} className="text-green-500" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No customer notes yet</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            Customer booking notes will appear here when jobs include special instructions.
          </p>
          <p className="mt-8 text-sm font-medium text-slate-500">
            More notes appear here as new jobs are assigned.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Before & After View ────────────────────────────────────────────────────
function BeforeAfterView({ jobs }: { jobs: { id: string; jobId: string; vehicle: string; photos?: { before: string[]; after: string[] } }[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const withPhotos = jobs.filter((j) => j.photos?.before?.length || j.photos?.after?.length);
  const selected = withPhotos[selectedIdx];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Before & After</h1>
        <p className="text-sm text-slate-400 mt-0.5">Photo comparison for jobs in review</p>
      </div>
      {withPhotos.length > 0 && selected ? (
        <>
          <div className="flex gap-2.5 flex-wrap">
            {withPhotos.map((j, i) => (
              <button key={j.id} onClick={() => setSelectedIdx(i)}
                className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                  i === selectedIdx ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50'}`}>
                {j.jobId} — {j.vehicle}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 overflow-hidden">
            <QCImageComparisonSlider
              beforeSrc={selected.photos?.before?.[0] || ''}
              beforeAlt={`${selected.vehicle} before`}
              afterSrc={selected.photos?.after?.[0] || ''}
              afterAlt={`${selected.vehicle} after`}
            />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-20 text-center" style={{ background: 'linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%)' }}>
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center mb-3 ring-4 ring-blue-50">
            <ImageIcon size={20} className="text-blue-500" />
          </div>
          <p className="text-sm font-semibold text-slate-600">No photos yet</p>
          <p className="text-xs text-slate-400 mt-1">Photos appear when technicians upload completed work</p>
        </div>
      )}
    </div>
  );
}

// ─── AI Detection View — types ────────────────────────────────────────────────
interface ScanDmg {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  confidence: number;   // 0–1
  affectedArea: string;
  coordinates: { x: number; y: number; width: number; height: number };
  description: string;
  urgency: string;
}
interface ScanLineItem {
  serviceName: string;
  damageType: string;
  subtotalMin: number;
  subtotalMax: number;
}
interface AiScanDoc {
  _id: string;
  customer?: { _id?: string; name?: string; firstName?: string; lastName?: string; email?: string };
  imageUrls: string[];
  overallCondition: string;
  summary: string;
  damages: ScanDmg[];
  estimate: { totalEstimate: number; formattedTotal: string; lineItems: ScanLineItem[] };
  modelStatus: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  modelUrl?: string;
  createdAt: string;
}

// ─── Car top-view SVG ─────────────────────────────────────────────────────────
function CarTopViewSvg({ damages }: { damages: ScanDmg[] }) {
  return (
    <svg viewBox="0 0 80 182" width={80} height={182} className="block">
      <rect x={16} y={10} width={48} height={162} rx={12} fill="#F8FAFC" stroke="#CBD5E1" strokeWidth={1.2} />
      <ellipse cx={40} cy={25} rx={18} ry={16} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth={0.9} />
      <rect x={22} y={45} width={36} height={16} rx={4} fill="#DBEAFE" stroke="#BFDBFE" strokeWidth={0.6} />
      <rect x={18} y={64} width={44} height={52} rx={3} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth={0.8} />
      <rect x={22} y={119} width={36} height={16} rx={4} fill="#DBEAFE" stroke="#BFDBFE" strokeWidth={0.6} />
      <ellipse cx={40} cy={157} rx={18} ry={16} fill="#F1F5F9" stroke="#CBD5E1" strokeWidth={0.9} />
      {([[9,46],[61,46],[9,120],[61,120]] as [number,number][]).map(([wx,wy],i) => (
        <rect key={i} x={wx} y={wy} width={10} height={17} rx={3} fill="#94A3B8" stroke="#64748B" strokeWidth={0.6} />
      ))}
      {damages.map((d, i) => {
        const cx = Math.max(4, Math.min(76, ((d.coordinates?.x ?? 0.5) + (d.coordinates?.width ?? 0.2) / 2) * 80));
        const cy = Math.max(4, Math.min(178, ((d.coordinates?.y ?? 0.5) + (d.coordinates?.height ?? 0.2) / 2) * 182));
        const [dot, ring] =
          d.severity === 'high'   ? ['#EF4444','#FEE2E2'] :
          d.severity === 'medium' ? ['#F59E0B','#FEF3C7'] :
                                    ['#10B981','#D1FAE5'];
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r={8.5} fill={ring} stroke={dot} strokeWidth={1.5} opacity={0.92} />
            <circle cx={cx} cy={cy} r={3.5} fill={dot} />
          </g>
        );
      })}
    </svg>
  );
}

// ─── Confidence bar ────────────────────────────────────────────────────────────
function ConfBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const fill = pct >= 80 ? 'bg-emerald-400' : pct >= 65 ? 'bg-amber-400' : 'bg-rose-400';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${fill} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-500 tabular-nums w-7 text-right">{pct}%</span>
    </div>
  );
}

// ─── Single scan card ─────────────────────────────────────────────────────────
function ScanCard({
  scan, decision, onDecide,
}: {
  scan: AiScanDoc;
  decision?: 'confirmed' | 'rejected';
  onDecide: (id: string, d: 'confirmed' | 'rejected') => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  const customerName =
    scan.customer
      ? [scan.customer.name, scan.customer.firstName, scan.customer.lastName]
          .filter(Boolean).join(' ').trim() || scan.customer.email || 'Anonymous'
      : 'Anonymous';
  const shortId   = scan._id.slice(-6).toUpperCase();
  const scanDate  = new Date(scan.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
  const totalEst  = scan.estimate?.totalEstimate || 0;
  const hasAr     = scan.modelStatus === 'ready' && !!scan.modelUrl;

  const borderCls = decision === 'confirmed' ? 'border-rose-200/80'    : decision === 'rejected' ? 'border-emerald-200/80' : 'border-slate-200/80';
  const headerBg  = decision === 'confirmed' ? 'bg-rose-50/50'         : decision === 'rejected' ? 'bg-emerald-50/50'       : 'bg-orange-50/40';

  const sevBadge = (s: string) =>
    s === 'high'   ? 'bg-rose-50 text-rose-700 border-rose-200/70' :
    s === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200/70' :
                     'bg-emerald-50 text-emerald-700 border-emerald-200/70';

  const handleDecide = async (d: 'confirmed' | 'rejected') => {
    setSubmitting(true);
    await new Promise(r => setTimeout(r, 600));
    setSubmitting(false);
    onDecide(scan._id, d);
    if (d === 'confirmed') toast.warning('Damage confirmed — flagged for service', { duration: 4000 });
    else toast.success('Marked as false positive', { duration: 3000 });
  };

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${borderCls}`}>
      {/* Card header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${borderCls} ${headerBg}`}>
        <div>
          <p className="text-sm font-semibold text-slate-800 tracking-tight">{customerName}</p>
          <p className="text-xs text-slate-400 mt-0.5">Scan #{shortId} · {scanDate}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasAr && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70">AR Ready</span>
          )}
          {!decision && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-200/70">Pending Review</span>
          )}
          {decision === 'confirmed' && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/70">Damage Confirmed</span>
          )}
          {decision === 'rejected' && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">False Positive</span>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Diagram + damage list */}
        <div className="grid grid-cols-[108px_1fr] gap-5 items-start">
          {/* Left: SVG map */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">AI Damage Map</p>
            <div className="bg-slate-50 rounded-xl p-2 flex justify-center">
              <CarTopViewSvg damages={scan.damages} />
            </div>
            <div className="space-y-1 pt-0.5">
              {(['high','medium','low'] as const).filter(s => scan.damages.some(d => d.severity === s)).map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s==='high'?'bg-rose-400':s==='medium'?'bg-amber-400':'bg-emerald-400'}`} />
                  <span className="text-[10px] text-slate-400 capitalize">{s} severity</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: damage entries + recommendation */}
          <div className="space-y-4 min-w-0">
            <div className="space-y-2.5">
              <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Detected Damage Areas</p>
              {scan.damages.map((d, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-700 flex-1 min-w-0 truncate">{d.affectedArea}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${sevBadge(d.severity)}`}>{d.type}</span>
                  </div>
                  <ConfBar value={d.confidence} />
                </div>
              ))}
            </div>
            {scan.summary && (
              <div className="border-t border-slate-100 pt-4 space-y-1.5">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">AI Recommendations</p>
                <p className="text-xs text-slate-600 leading-relaxed">{scan.summary}</p>
              </div>
            )}
          </div>
        </div>

        {/* Cost + AR status */}
        <div className="border-t border-slate-100 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-3">
            <div>
              <p className="text-xl font-bold text-slate-900 tabular-nums">₱{totalEst.toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-0.5">Estimated Repair Cost</p>
            </div>
            {(scan.estimate?.lineItems?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Cost Breakdown</p>
                {scan.estimate.lineItems.slice(0, 4).map((li, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 truncate flex-1">{li.serviceName || li.damageType}</span>
                    <span className="text-xs font-medium text-slate-700 tabular-nums flex-shrink-0">
                      ₱{li.subtotalMin.toLocaleString()}–{li.subtotalMax.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {hasAr ? (
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700">AR Visualization Ready</p>
                <p className="text-[11px] text-blue-600 mt-1 leading-relaxed">3D model generated · Before &amp; After preview available</p>
              </div>
            ) : (
              <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-600">
                  {scan.modelStatus === 'processing' ? 'Generating 3D Model…' : 'AR Not Generated'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {scan.modelStatus === 'processing'
                    ? 'Meshy AI is reconstructing the vehicle geometry'
                    : 'Customer can generate AR from the mobile app'}
                </p>
              </div>
            )}
            {decision === 'confirmed' && (
              <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-rose-700">Confirmed &amp; Flagged</p>
                <p className="text-[11px] text-rose-600 mt-0.5">Queued for service review</p>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {hasAr && (
              <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors">
                <Eye size={13} /> View AR Preview
              </button>
            )}
            <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 text-xs font-medium hover:bg-slate-100 transition-colors">
              Before &amp; After
            </button>
            {!decision && (
              <button
                onClick={() => handleDecide('rejected')}
                disabled={submitting}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 text-slate-500 text-xs font-medium hover:bg-slate-50 hover:text-slate-700 transition-colors disabled:opacity-50"
              >
                Reject
              </button>
            )}
          </div>
          {!decision && (
            <button
              onClick={() => handleDecide('confirmed')}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors active:scale-95 disabled:opacity-50 shadow-sm"
            >
              {submitting
                ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <CheckCircle2 size={13} />}
              Confirm &amp; Send to Customer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI Detection View ────────────────────────────────────────────────────────
function AIDetectionView({ jobs: _jobs }: { jobs: unknown[] }) {
  const [scans, setScans]       = useState<AiScanDoc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<'all'|'pending'|'high'|'low'|'ar'>('all');
  const [decisions, setDecisions] = useState<Record<string, 'confirmed'|'rejected'>>({});

  const loadScans = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/ai/scans').then((r) => {
      setScans(r.data.data || []);
    }).catch(() => {
      setError('Failed to load AI scan detections. Check the backend is running.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadScans(); }, [loadScans]);

  const handleDecide = useCallback((id: string, d: 'confirmed' | 'rejected') => {
    setDecisions(prev => ({ ...prev, [id]: d }));
  }, []);

  const pendingCount   = scans.filter(s => !decisions[s._id]).length;
  const confirmedCount = Object.values(decisions).filter(d => d === 'confirmed').length;
  const allDmg         = scans.flatMap(s => s.damages);
  const avgConf        = allDmg.length
    ? Math.round(allDmg.reduce((a, d) => a + (d.confidence || 0), 0) / allDmg.length * 100) : 0;
  const totalRepair    = scans.reduce((a, s) => a + (s.estimate?.totalEstimate || 0), 0);

  const visible = scans.filter(s => {
    if (filter === 'pending') return !decisions[s._id];
    if (filter === 'high')    return s.damages.some(d => (d.confidence || 0) >= 0.8);
    if (filter === 'low')     return s.damages.some(d => (d.confidence || 0) < 0.65);
    if (filter === 'ar')      return s.modelStatus === 'ready';
    return true;
  });

  const FILTERS: [typeof filter, string][] = [
    ['all','All'], ['pending','Pending'], ['high','High Confidence'], ['low','Low Confidence'], ['ar','AR Ready'],
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">AI Detection Review</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${pendingCount} active detection${pendingCount !== 1 ? 's' : ''} awaiting your decision`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadScans}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-white border border-slate-200/80 text-slate-500 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
            pendingCount > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${pendingCount > 0 ? 'bg-orange-400 animate-pulse' : 'bg-slate-300'}`} />
            {pendingCount} Pending
          </span>
        </div>
      </div>

      {/* Stats strip */}
      {!loading && scans.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { icon: <AlertTriangle size={16} className="text-orange-500" />, label: 'Pending Review',     value: pendingCount,                          bg: 'bg-orange-50',   border: 'border-orange-100',  text: 'text-orange-700' },
            { icon: <CheckCircle2  size={16} className="text-emerald-500" />, label: 'Confirmed Today',    value: confirmedCount,                        bg: 'bg-emerald-50',  border: 'border-emerald-100', text: 'text-emerald-700' },
            { icon: <TrendingUp    size={16} className="text-blue-500" />,    label: 'Avg AI Confidence',  value: `${avgConf}%`,                         bg: 'bg-blue-50',     border: 'border-blue-100',    text: 'text-blue-700' },
            { icon: <DollarSign    size={16} className="text-slate-500" />,   label: 'Total Est. Repair',  value: `₱${totalRepair.toLocaleString()}`,    bg: 'bg-slate-50',    border: 'border-slate-100',   text: 'text-slate-700' },
          ].map(stat => (
            <div key={stat.label} className={`${stat.bg} ${stat.border} border rounded-2xl p-4 space-y-2`}>
              <div className="flex items-center gap-2">
                {stat.icon}
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
              <p className={`text-xl font-bold tabular-nums ${stat.text}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {!loading && scans.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium border transition-all ${
                filter === key ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200/80 hover:bg-slate-50'
              }`}>
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-slate-400">Sort: Newest first</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 size={28} className="text-orange-400 animate-spin" />
          <p className="text-sm text-slate-400">Loading AI scan detections…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-6 text-center space-y-2">
          <p className="text-sm font-semibold text-rose-700">{error}</p>
          <button onClick={loadScans} className="text-xs text-rose-600 underline">Try again</button>
        </div>
      ) : visible.length > 0 ? (
        <div className="space-y-4">
          {visible.map(scan => (
            <ScanCard key={scan._id} scan={scan} decision={decisions[scan._id]} onDecide={handleDecide} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-100 flex flex-col items-center justify-center py-20 text-center" style={{ background: 'linear-gradient(135deg,#fff7ed 0%,#ffedd5 100%)' }}>
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center mb-3 ring-4 ring-orange-50">
            <Zap size={20} className="text-orange-500" />
          </div>
          <p className="text-sm font-semibold text-slate-600">
            {filter !== 'all' ? 'No detections match this filter' : 'No AI detections pending'}
          </p>
          <p className="text-xs text-slate-400 mt-1">AI damage detections appear automatically when vehicles are scanned via the mobile app</p>
        </div>
      )}
    </div>
  );
}

// ─── Main QCDashboardPanel ────────────────────────────────────────────────────
const QC_VIEW_KEY = 'autospf_qc_active_view';
const VALID_QC_VIEWS: QCView[] = ['dashboard', 'jobs', 'job-detail', 'before-after', 'ai-detection', 'customer-notes', 'reports', 'live-tracker'];

export default function QCDashboardPanel() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<QCView>(() => {
    try {
      const saved = sessionStorage.getItem(QC_VIEW_KEY) as QCView | null;
      // Don't restore job-detail without knowing which job is selected
      if (saved && VALID_QC_VIEWS.includes(saved) && saved !== 'job-detail') return saved;
    } catch { /* sessionStorage unavailable */ }
    return 'dashboard';
  });
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const loadQcSummary = activeView !== 'live-tracker';

  // Persist active view so remounts don't reset to dashboard
  const navigateTo = useCallback((view: QCView) => {
    try { sessionStorage.setItem(QC_VIEW_KEY, view); } catch { /* ignore */ }
    setActiveView(view);
  }, []);

  const {
    jobs,
    jobsLoading,
    stats,
    statsLoading,
    activity,
    activityLoading,
    technicianData,
    techLoading,
    approveJob,
    returnJob,
    updateChecklist,
    updateServiceStatus,
    uploadTrackerStagePhoto,
    deleteTrackerStagePhoto,
    assignServiceStaff,
    saveQCHandoffSheet,
    addStaffNote,
    refetchAll,
  } = useQCData({ loadSummary: loadQcSummary });

  // Pending count for sidebar badge — only jobs not yet approved
  const pendingCount = jobs.filter((j) => j.status === 'pending-review' || j.status === 'in-review').length;
  const aiPendingCount = jobs.filter((j) => j.aiFlag).length;

  const handleSelectJob = (jobId: string) => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;

    setSelectedJobId(jobId);

    if (getQCJobWorkflowAction(job) === 'live-tracker') {
      stashLiveTrackerDeepLinkJobId(jobId);
      navigateTo('live-tracker');
      return;
    }

    navigateTo('job-detail');
  };

  const handleOpenJobInLiveTracker = (jobId: string) => {
    setSelectedJobId(jobId);
    stashLiveTrackerDeepLinkJobId(jobId);
    navigateTo('live-tracker');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <QCDashboardView onNavigate={navigateTo} stats={stats} statsLoading={statsLoading} jobs={jobs} activity={activity} activityLoading={activityLoading} onSelectJob={handleSelectJob} />;

      case 'jobs':
        return (
          <div className="space-y-5">
            <div className="qc-review-header qc-dash-surface flex flex-col gap-4 rounded-2xl bg-white px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.16)]">
                  Quality Control
                </span>
                <h1 className="mt-3 text-2xl font-bold text-slate-950">QC Review Desk</h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  Final QC decision desk for prioritizing evidence, AI risks, and approval work. Use{' '}
                  <span className="font-semibold text-slate-700">Live Tracker</span> to move customer-facing stages and upload
                  gate photos, then <span className="font-semibold text-slate-700">Sign off</span> here when the vehicle is
                  ready for approve or return ({pendingCount} pending).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-50 px-3 text-sm font-semibold text-orange-700 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.2)]">
                  <span className={`h-2 w-2 rounded-full ${pendingCount > 0 ? 'bg-orange-400' : 'bg-slate-300'}`} />
                  <span className="tabular-nums">{pendingCount}</span> Pending Review
                </span>
                <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-50 px-3 text-sm font-semibold text-rose-700 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.2)]">
                  <AlertTriangle size={14} />
                  <span className="tabular-nums">{aiPendingCount}</span> AI Flagged
                </span>
                <span className="inline-flex h-10 items-center rounded-xl bg-slate-50 px-3 text-sm font-semibold text-slate-600 shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
                  <span className="tabular-nums">{jobs.length}</span>&nbsp;Total Jobs
                </span>
              </div>
            </div>
            <QCJobsTable
              jobs={jobs}
              loading={jobsLoading}
              onSelectJob={handleSelectJob}
            />
          </div>
        );

      case 'job-detail':
        return (
          <QCJobDetailView
            jobId={selectedJobId}
            jobs={jobs}
            onBack={() => navigateTo('jobs')}
            onApprove={approveJob}
            onReturn={returnJob}
            onOpenLiveTracker={() => selectedJobId && handleOpenJobInLiveTracker(selectedJobId)}
          />
        );

      case 'before-after':
        return <BeforeAfterView jobs={jobs as any} />;

      case 'ai-detection':
        return <AIDetectionView jobs={jobs as any} />;

      case 'customer-notes':
        return <CustomerNotesView jobs={jobs as any} />;

      case 'reports':
        return <QCReportsView stats={stats} statsLoading={statsLoading} technicianData={technicianData} techLoading={techLoading} />;

      case 'live-tracker':
        return (
          <QCLiveTrackerView
            jobs={jobs}
            // Only block the whole view before the first /qc/jobs payload — refetches stay silent (no pulse skeleton).
            loading={jobsLoading && jobs.length === 0}
            onAdvance={updateServiceStatus}
            onUploadStagePhoto={uploadTrackerStagePhoto}
            onDeleteTrackerStagePhoto={deleteTrackerStagePhoto}
            onAddStaffNote={addStaffNote}
            onSaveQCHandoffSheet={saveQCHandoffSheet}
            onPersistQcChecklist={(orderId, items) => updateChecklist(orderId, items, { quiet: true })}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div
      className="qc-dashboard-root flex h-screen min-h-screen overflow-hidden"
      style={{ background: '#FAFAFA', colorScheme: 'light' }}
    >
      <QCSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeView={activeView}
        onNavigate={navigateTo}
        pendingCount={pendingCount}
        aiPendingCount={aiPendingCount}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <QCTopbar sidebarCollapsed={sidebarCollapsed} />
        <main className="flex-1 overflow-y-auto px-7 py-6" style={{ background: '#FAFAFA' }}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
