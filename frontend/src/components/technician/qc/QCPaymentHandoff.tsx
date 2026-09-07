import React from 'react';
import type { QCJob } from '@/hooks/useQCData';
import { formatHandoffTime, serviceHandoffState } from '@/lib/service-handoff';

export function QCPaymentHandoff({ job }: { job: QCJob }) {
  const state = serviceHandoffState(job);
  if (!state || state === 'completed') return null;
  const paid = state === 'handover';
  return (
    <div className={`rounded-xl p-4 ${paid ? 'bg-emerald-50 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.2)]' : 'bg-orange-50/60 shadow-[inset_0_0_0_1px_rgba(249,115,22,0.2)]'}`}>
      <p className={`mb-3 text-xs font-bold ${paid ? 'text-emerald-800' : 'text-orange-800'}`}>
        {paid ? 'Payment Confirmed' : 'Awaiting POS Payment'}
      </p>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        {[
          ['Current status', 'Ready for Pickup'],
          ['Workflow handoff', paid ? 'Ready for Customer Handover' : 'Transferred to Sales/POS'],
          ['Next action', paid ? 'Complete Customer Handover' : 'Collect Remaining Balance'],
          ['Assigned team', paid ? 'Quality Control · Customer Handover' : 'Sales Department'],
        ].map(([label, value]) => <div key={label}><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 font-semibold text-slate-900">{value}</dd></div>)}
      </dl>
    </div>
  );
}

export default function QCPOSQueueView({ jobs, onOpenJob, onBack }: {
  jobs: QCJob[];
  onOpenJob: (id: string) => void;
  onBack: () => void;
}) {
  const queued = jobs.filter((job) => ['payment', 'handover'].includes(serviceHandoffState(job) || ''))
    .sort((a, b) => (a.readyForPaymentAt || '').localeCompare(b.readyForPaymentAt || ''));
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <button type="button" onClick={onBack} className="text-sm font-semibold text-blue-700 hover:underline">← Quality Checker Dashboard</button>
      <div className="qc-command-panel rounded-2xl bg-white p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-700">Quality Control → Sales/POS</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">POS Payment Queue</h1>
        <p className="mt-2 text-sm text-slate-600">Sales Department collects the remaining balance in POS. Follow payment and customer handover for jobs in your current QC scope here.</p>
        <ol className="mt-5 flex flex-wrap gap-2 text-xs font-semibold text-slate-600" aria-label="Pickup workflow">
          {['Quality Check Completed', 'Ready for Pickup', 'Awaiting POS Payment', 'Payment Completed', 'Customer Handover', 'Completed'].map((step, i) => <li key={step} className="rounded-lg bg-slate-100 px-3 py-2">{i + 1}. {step}</li>)}
        </ol>
      </div>
      {queued.length ? <div className="grid gap-4 lg:grid-cols-2">{queued.map((job) => (
        <article key={job.id} className="space-y-4 qc-command-panel rounded-2xl bg-white p-5">
          <div><h2 className="text-base font-semibold text-slate-950">{job.customerName || job.customer}</h2><p className="mt-1 text-sm text-slate-600">{job.vehicle} · {job.plate}</p><p className="mt-1 text-sm text-slate-600">{job.serviceType || job.service}</p></div>
          <QCPaymentHandoff job={job} />
          <p className="text-xs text-slate-500">Assigned to Sales: {formatHandoffTime(job.readyForPaymentAt)} · {job.jobId}</p>
          <button type="button" onClick={() => onOpenJob(job.id)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus:ring-4 focus:ring-slate-200">{serviceHandoffState(job) === 'handover' ? 'Open Customer Handover' : 'View Service Record'}</button>
        </article>
      ))}</div> : <p className="qc-command-panel rounded-2xl bg-white p-8 text-center text-sm text-slate-600">No payment or handover tasks in your current QC scope.</p>}
    </div>
  );
}
