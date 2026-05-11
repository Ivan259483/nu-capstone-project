import React, { useMemo, useState } from 'react';
import { CalendarDays, SlidersHorizontal, Users } from 'lucide-react';
import SalesSmartCalendar from '@/components/sales/calendar/SalesSmartCalendar';
import AvailabilityControls from './AvailabilityControls';
import { getSafeUserRole } from '@/lib/roles';

interface Props {
  onNavigate: (page: string) => void;
  currentUserRole?: string;
}

/**
 * Full calendar — same Smart Calendar as Sales: month/week views, day panel,
 * drag-reschedule with server-side slot validation (no double booking).
 */
type SchedulingTab = 'calendar' | 'availability';

export default function AdminAppointmentsPage({ onNavigate, currentUserRole }: Props) {
  const isAdministrator = useMemo(
    () => getSafeUserRole(currentUserRole) === 'administrator',
    [currentUserRole],
  );
  const [activeTab, setActiveTab] = useState<SchedulingTab>('calendar');
  const [visitedTabs, setVisitedTabs] = useState<Set<SchedulingTab>>(() => new Set(['calendar']));

  const selectSchedulingTab = (tab: SchedulingTab) => {
    setActiveTab(tab);
    setVisitedTabs((current) => {
      if (current.has(tab)) return current;
      const next = new Set(current);
      next.add(tab);
      return next;
    });
  };

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

      <div className="inline-flex w-fit items-center gap-1 rounded-2xl bg-white p-1 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08),0_0_0_1px_rgba(226,232,240,0.55)]">
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
            activeTab === 'calendar'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => selectSchedulingTab('calendar')}
        >
          <CalendarDays size={15} />
          Calendar
        </button>
        {isAdministrator && (
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              activeTab === 'availability'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => selectSchedulingTab('availability')}
          >
            <SlidersHorizontal size={15} />
            Availability Controls
          </button>
        )}
      </div>

      <div className="admin-appointments-shell min-h-[560px] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_90px_-28px_rgba(15,23,42,0.14),0_12px_40px_-18px_rgba(15,23,42,0.08)]">
        <div className="bg-white p-5 sm:p-6">
          <div className="ah-inner-tab-stack">
            <div className={`ah-inner-tab-panel ${activeTab === 'calendar' ? 'is-active' : 'is-hidden'}`} aria-hidden={activeTab !== 'calendar'}>
              <SalesSmartCalendar />
            </div>
            {isAdministrator && (activeTab === 'availability' || visitedTabs.has('availability')) && (
              <div className={`ah-inner-tab-panel ${activeTab === 'availability' ? 'is-active' : 'is-hidden'}`} aria-hidden={activeTab !== 'availability'}>
                <AvailabilityControls />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
