import React, { useEffect, useMemo, useState } from 'react';
import { ensureAvailabilityRealtimeSync } from '@/lib/availabilitySync';
import { CalendarDays, SlidersHorizontal } from 'lucide-react';
import SalesSmartCalendar from '@/components/sales/calendar/SalesSmartCalendar';
import AvailabilityControls from './AvailabilityControls';
import { getSafeUserRole, SETTINGS_MANAGER_ROLES } from '@/lib/roles';

interface Props {
  currentUserRole?: string;
}

/**
 * Full calendar — same Smart Calendar as Sales: month/week views, day panel,
 * drag-reschedule with server-side slot validation (no double booking).
 */
type SchedulingTab = 'calendar' | 'availability';

export default function AdminAppointmentsPage({ currentUserRole }: Props) {
  // Availability Controls are shown to any full-admin role (administrator + office_admin).
  // Sales can see the Calendar tab via APPOINTMENT_VIEW_ROLES but NOT Availability Controls.
  const isAdministrator = useMemo(
    () => SETTINGS_MANAGER_ROLES.includes(getSafeUserRole(currentUserRole) as any),
    [currentUserRole],
  );
  const [activeTab, setActiveTab] = useState<SchedulingTab>('calendar');
  const [visitedTabs, setVisitedTabs] = useState<Set<SchedulingTab>>(() => new Set(['calendar']));

  useEffect(() => {
    ensureAvailabilityRealtimeSync();
  }, []);

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
    <div className="ah-page-enter admin-appointments-page flex min-h-0 flex-1 flex-col gap-2">
      <div className="inline-flex w-fit shrink-0 items-center gap-0.5 rounded-xl bg-white p-0.5 shadow-[0_1px_8px_-3px_rgba(15,23,42,0.08),0_0_0_1px_rgba(226,232,240,0.55)]">
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            activeTab === 'calendar'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => selectSchedulingTab('calendar')}
        >
          <CalendarDays size={14} />
          Calendar
        </button>
        {isAdministrator && (
          <button
            type="button"
            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
              activeTab === 'availability'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => selectSchedulingTab('availability')}
          >
            <SlidersHorizontal size={14} />
            Availability Controls
          </button>
        )}
      </div>

      <div className="admin-appointments-shell flex min-h-0 flex-1 flex-col">
        <div className="ah-inner-tab-stack ah-inner-tab-stack--appointments flex min-h-0 flex-1 flex-col">
          <div
            className={`ah-inner-tab-panel ah-inner-tab-panel--calendar ${activeTab === 'calendar' ? 'is-active' : 'is-hidden'}`}
            aria-hidden={activeTab !== 'calendar'}
          >
            <SalesSmartCalendar variant="premiumAdmin" />
          </div>
          {isAdministrator && (activeTab === 'availability' || visitedTabs.has('availability')) && (
            <div
              className={`ah-inner-tab-panel ah-inner-tab-panel--availability ${activeTab === 'availability' ? 'is-active' : 'is-hidden'}`}
              aria-hidden={activeTab !== 'availability'}
            >
              <AvailabilityControls />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
