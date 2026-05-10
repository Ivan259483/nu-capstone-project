/**
 * Live customer job tracker — filterable table, job slide-over.
 * Shared between Admin Hub (embedded) and any future fullscreen shells.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Activity, CheckCircle2, Clock3, Radio, RefreshCw, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useOpsData } from './hooks/useOpsData';
import type { OpsJob } from './ops-types';
import type { JobStatus } from './ui/OpsUIKit';
import { OrderService } from '@/lib/order-service';
import OpsJobSlideOver from './staff-dashboard/OpsJobSlideOver';
import OpsCustomerJobTable from './customer-tracker/OpsCustomerJobTable';
import './ops-manager.css';

export type CustomerTrackerPanelProps = {
  embedded?: boolean;
};

type CommandMetricProps = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone: string;
};

function SummaryChip({ label, value, icon: Icon, tone }: CommandMetricProps) {
  return (
    <div className="ct-summary-chip">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <p className="mt-0.5 text-[20px] font-semibold leading-none tracking-tight text-slate-950 tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function LiveMonitorHeader({
  summary,
  lastUpdatedStr,
  refreshing,
  onRefresh,
}: {
  summary: { queued: number; active: number; completed: number; delayed: number };
  lastUpdatedStr: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="ct-live-monitor">
      <div className="flex flex-col gap-5 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="ct-live-pill">
            <Radio size={13} />
            Live customer monitor
          </div>
          <h2 className="mt-3 text-[24px] font-semibold tracking-tight text-slate-950 sm:text-[28px]">
            Live Customer Tracking
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-6 text-slate-600">
            Customer-visible job status, technician updates, and SLA signals across active bookings.
          </p>
        </div>

        <div className="ct-summary-grid">
          <SummaryChip label="Queued" value={summary.queued} icon={Users} tone="bg-slate-100 text-slate-600 shadow-[0_4px_14px_-4px_rgba(15,23,42,0.1)]" />
          <SummaryChip label="Active" value={summary.active} icon={Activity} tone="bg-blue-50 text-blue-700 shadow-[0_4px_14px_-4px_rgba(37,99,235,0.2)]" />
          <SummaryChip label="Completed" value={summary.completed} icon={CheckCircle2} tone="bg-emerald-50 text-emerald-700 shadow-[0_4px_14px_-4px_rgba(5,150,105,0.22)]" />
          <SummaryChip label="Delayed" value={summary.delayed} icon={Clock3} tone="bg-amber-50 text-amber-800 shadow-[0_4px_14px_-4px_rgba(217,119,6,0.22)]" />
        </div>
      </div>

      <div className="ct-live-monitor-footer">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-slate-600">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="font-semibold text-slate-800">Live sync</span>
          </div>
          <span className="hidden h-4 w-px bg-slate-200/40 sm:inline-block" />
          <span>
            Updated <span className="font-medium tabular-nums text-slate-800">{lastUpdatedStr}</span>
          </span>
          <span className="hidden h-4 w-px bg-slate-200/40 sm:inline-block" />
          <span>
            Auto-refresh <span className="font-medium text-slate-800">30s</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border-0 bg-white px-3 py-2 text-[12px] font-medium text-slate-700 shadow-[0_8px_28px_-8px_rgba(15,23,42,0.12),0_2px_8px_rgba(15,23,42,0.05)] transition hover:bg-slate-50/90 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin text-slate-500' : 'text-slate-500'} />
          Refresh
        </button>
      </div>
    </section>
  );
}

export default function CustomerTrackerPanel({ embedded = false }: CustomerTrackerPanelProps) {
  const { jobs, technicians, loading, error, refresh, lastRefreshed } = useOpsData();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedJob, setSelectedJob] = useState<OpsJob | null>(null);
  const [slideOverOpen, setSlideOverOpen] = useState(false);
  const trackerSummary = useMemo(
    () => ({
      queued: jobs.filter(job => job.status === 'Queued').length,
      active: jobs.filter(job => ['Assigned', 'En Route', 'Ongoing'].includes(job.status)).length,
      completed: jobs.filter(job => job.status === 'Completed').length,
      delayed: jobs.filter(job => job.status === 'Delayed').length,
    }),
    [jobs],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  const handleJobClick = useCallback((job: OpsJob) => {
    setSelectedJob(job);
    setSlideOverOpen(true);
  }, []);

  const handleAssign = useCallback(
    async (jobId: string, techId: string) => {
      try {
        await OrderService.assignDetailer(jobId, techId);
        await refresh();
      } catch (err: unknown) {
        console.error('Failed to assign:', err);
      }
    },
    [refresh],
  );

  const handleStatusChange = useCallback(
    async (jobId: string, status: JobStatus) => {
      try {
        const statusMap: Record<string, string> = {
          Queued: 'pending',
          Assigned: 'assigned',
          'En Route': 'received',
          Ongoing: 'in_progress',
          Completed: 'completed',
          Delayed: 'pending',
          Cancelled: 'cancelled',
        };
        await OrderService.updateCustomerStatus(jobId, statusMap[status] || 'pending');
        await refresh();
      } catch (err: unknown) {
        console.error('Failed to update status:', err);
      }
      setSlideOverOpen(false);
    },
    [refresh],
  );

  const lastUpdatedStr = lastRefreshed
    ? lastRefreshed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : 'Just now';

  const shellClass = embedded
    ? 'customer-tracker-panel-embedded space-y-6'
    : 'max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-12 py-6 space-y-6';

  const showLoadingBlank = loading && jobs.length === 0 && technicians.length === 0;

  return (
    <>
      <div className={shellClass}>
        {showLoadingBlank && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-[13px] text-gray-500">Loading operations data…</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[13px] text-red-700 font-medium">{error}</p>
              <p className="text-[12px] text-red-500 mt-1">
                Make sure the backend server is running and your account has the correct permissions.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              className="text-[12px] text-red-600 hover:text-red-700 font-medium px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg transition-colors flex-shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        {!showLoadingBlank && (
          <div className="space-y-5">
            <LiveMonitorHeader
              summary={trackerSummary}
              lastUpdatedStr={lastUpdatedStr}
              refreshing={refreshing}
              onRefresh={handleRefresh}
            />

            <OpsCustomerJobTable
              jobs={jobs}
              technicians={technicians}
              onJobClick={handleJobClick}
              onStatusChange={handleStatusChange}
            />
          </div>
        )}
      </div>

      <OpsJobSlideOver
        job={selectedJob}
        open={slideOverOpen}
        onClose={() => setSlideOverOpen(false)}
        technicians={technicians}
        onAssign={handleAssign}
        onStatusChange={handleStatusChange}
      />
    </>
  );
}
