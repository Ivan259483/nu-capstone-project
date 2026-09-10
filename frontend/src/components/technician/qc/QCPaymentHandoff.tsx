import React from 'react';
import type { QCJob } from '@/hooks/useQCData';
import { serviceHandoffState } from '@/lib/service-handoff';

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
