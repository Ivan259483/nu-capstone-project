import React from 'react';
import { Users } from 'lucide-react';
import SalesSmartCalendar from '@/components/sales/calendar/SalesSmartCalendar';

interface Props {
  onNavigate: (page: string) => void;
}

/**
 * Full calendar — same Smart Calendar as Sales: month/week views, day panel,
 * drag-reschedule with server-side slot validation (no double booking).
 */
export default function AdminAppointmentsPage({ onNavigate }: Props) {
  return (
    <div className="ah-page-enter flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold tracking-wide text-blue-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Appointments & scheduling</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Full shop calendar with live slot counts. Open any day for booking detail; drag cards to reschedule when the API allows —
            conflicts are blocked automatically.
          </p>
        </div>
        <button
          type="button"
          className="ah-btn-secondary inline-flex shrink-0 items-center gap-2 font-semibold"
          onClick={() => onNavigate('users')}
        >
          <Users size={16} aria-hidden />
          User management
        </button>
      </div>

      <div className="admin-appointments-shell min-h-[560px] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_90px_-28px_rgba(15,23,42,0.14),0_12px_40px_-18px_rgba(15,23,42,0.08)]">
        <div className="bg-gradient-to-b from-slate-50/90 via-white to-slate-50/40 p-5 sm:p-6">
          <SalesSmartCalendar />
        </div>
      </div>
    </div>
  );
}
