import React, { useState } from 'react';
import { ImageIcon, MessageSquare, Zap } from 'lucide-react';
import QCSidebar from './QCSidebar';
import QCTopbar from './QCTopbar';
import QCDashboardView from './QCDashboardView';
import QCReportsView from './QCReportsView';
import QCJobsTable from './QCJobsTable';
import QCJobDetailView from './QCJobDetailView';
import QCChecklistPanel from './QCChecklistPanel';
import QCAIDetectionCard from './QCAIDetectionCard';
import QCImageComparisonSlider from './QCImageComparisonSlider';
import { useQCData } from '@/hooks/useQCData';

type QCView = 'dashboard' | 'jobs' | 'job-detail' | 'before-after' | 'ai-detection' | 'customer-notes' | 'reports';

// ─── Customer Notes View ──────────────────────────────────────────────────────
function CustomerNotesView({ jobs }: { jobs: { id: string; customer: string; jobId: string; vehicle: string; customerNotes: string; submittedAt: string }[] }) {
  const withNotes = jobs.filter((j) => j.customerNotes?.trim());
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Customer Notes</h1>
        <p className="text-sm text-slate-400 mt-0.5">{withNotes.length} note{withNotes.length !== 1 ? 's' : ''} from active jobs</p>
      </div>
      {withNotes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {withNotes.map((j) => (
            <div key={j.id} className="bg-white rounded-2xl p-5 shadow-sm shadow-slate-200/50 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 tracking-tight">{j.customer}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{j.jobId} · {j.vehicle}</p>
                </div>
                <span className="text-xs text-slate-400 tabular-nums flex-shrink-0 ml-2">
                  {j.submittedAt ? new Date(j.submittedAt).toLocaleDateString() : '—'}
                </span>
              </div>
              <div className="bg-blue-50/70 border border-blue-100/80 rounded-xl p-4">
                <p className="text-sm text-slate-700 leading-relaxed">{j.customerNotes}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 flex flex-col items-center justify-center py-20 text-center">
          <MessageSquare size={20} className="text-slate-300 mb-2.5" />
          <p className="text-sm text-slate-400">No data yet</p>
          <p className="text-xs text-slate-300 mt-1">Customer notes will appear here from active jobs</p>
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
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 flex flex-col items-center justify-center py-20 text-center">
          <ImageIcon size={20} className="text-slate-300 mb-2.5" />
          <p className="text-sm text-slate-400">No data yet</p>
          <p className="text-xs text-slate-300 mt-1">Photos appear when technicians upload completed work</p>
        </div>
      )}
    </div>
  );
}

// ─── AI Detection View ────────────────────────────────────────────────────────
function AIDetectionView({ jobs }: { jobs: { id: string; aiFlag: boolean; damageAnnotations?: unknown[]; jobId: string; vehicle: string }[] }) {
  const withAI = jobs.filter((j) => j.aiFlag && Array.isArray((j as any).damageAnnotations) && (j as any).damageAnnotations.length > 0);
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">AI Detection Review</h1>
          <p className="text-sm text-slate-400 mt-0.5">{withAI.length} active detections awaiting your decision</p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${
          withAI.length > 0 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${withAI.length > 0 ? 'bg-orange-400 animate-pulse' : 'bg-slate-300'}`} />
          {withAI.length} Pending
        </span>
      </div>
      {withAI.length > 0 ? (
        <div className="space-y-4">
          {withAI.map((job) =>
            ((job as any).damageAnnotations as any[]).map((det: any, i: number) => (
              <QCAIDetectionCard key={`${job.id}-${i}`} detection={{
                id: `${job.id}-${i}`,
                status: 'pending',
                confidence: det.confidence || 85,
                damageType: det.type || 'Damage Detected',
                location: det.panel || det.location || 'Unknown',
                description: det.note || 'AI-detected damage requiring review',
                recommendation: 'Re-inspect area and confirm before approving',
                severity: det.severity || 'moderate',
                imageUrl: det.images?.[0] || '',
                imageAlt: `Damage on ${(job as any).vehicle}`,
              }} />
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm shadow-slate-200/50 flex flex-col items-center justify-center py-20 text-center">
          <Zap size={20} className="text-slate-300 mb-2.5" />
          <p className="text-sm text-slate-400">No data yet</p>
          <p className="text-xs text-slate-300 mt-1">AI damage detections appear automatically when vehicles are scanned</p>
        </div>
      )}
    </div>
  );
}

// ─── Main QCDashboardPanel ────────────────────────────────────────────────────
export default function QCDashboardPanel() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<QCView>('dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const {
    jobs,
    jobsLoading,
    stats,
    statsLoading,
    approveJob,
    returnJob,
    updateChecklist,
    refetchAll,
  } = useQCData();

  // Pending count for sidebar badge — only jobs not yet approved
  const pendingCount = jobs.filter((j) => j.status === 'pending-review' || j.status === 'in-review').length;
  const aiPendingCount = jobs.filter((j) => j.aiFlag).length;

  const handleSelectJob = (jobId: string) => {
    setSelectedJobId(jobId);
    setActiveView('job-detail');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <QCDashboardView onNavigate={setActiveView} stats={stats} statsLoading={statsLoading} jobs={jobs} />;

      case 'jobs':
        return (
          <div className="space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Jobs for Review</h1>
                <p className="text-sm text-slate-500 mt-1">Complete review queue — {pendingCount} job{pendingCount !== 1 ? 's' : ''} awaiting your validation</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                  <span className={`w-2 h-2 rounded-full ${pendingCount > 0 ? 'bg-orange-400' : 'bg-slate-300'}`} />
                  {pendingCount} Pending Review
                </span>
                <span className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                  <span className={`w-2 h-2 rounded-full ${aiPendingCount > 0 ? 'bg-orange-400' : 'bg-slate-300'}`} />
                  {aiPendingCount} AI Flagged
                </span>
              </div>
            </div>
            <QCJobsTable
              jobs={jobs}
              loading={jobsLoading}
              onSelectJob={handleSelectJob}
              onApproveJob={approveJob}
              onReturnJob={(id) => returnJob(id, 'Returned for correction')}
            />
          </div>
        );

      case 'job-detail':
        return (
          <QCJobDetailView
            jobId={selectedJobId}
            jobs={jobs}
            onBack={() => setActiveView('jobs')}
            onApprove={approveJob}
            onReturn={returnJob}
            onUpdateChecklist={updateChecklist}
          />
        );

      case 'before-after':
        return <BeforeAfterView jobs={jobs as any} />;

      case 'ai-detection':
        return <AIDetectionView jobs={jobs as any} />;

      case 'customer-notes':
        return <CustomerNotesView jobs={jobs as any} />;

      case 'reports':
        return <QCReportsView stats={stats} statsLoading={statsLoading} />;

      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen min-h-screen overflow-hidden" style={{ background: '#f8fafc' }}>
      <QCSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeView={activeView}
        onNavigate={setActiveView}
        pendingCount={pendingCount}
        aiPendingCount={aiPendingCount}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <QCTopbar sidebarCollapsed={sidebarCollapsed} />
        <main className="flex-1 overflow-y-auto px-7 py-6" style={{ background: '#f8fafc' }}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
