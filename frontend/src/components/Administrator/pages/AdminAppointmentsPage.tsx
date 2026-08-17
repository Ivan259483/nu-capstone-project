import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ensureAvailabilityRealtimeSync } from '@/lib/availabilitySync';
import { CalendarDays, SlidersHorizontal } from 'lucide-react';
import SalesSmartCalendar from '@/components/sales/calendar/SalesSmartCalendar';
import AvailabilityControls from './AvailabilityControls';
import { getSafeUserRole, SETTINGS_MANAGER_ROLES } from '@/lib/roles';
import { useLocation } from 'react-router-dom';

interface Props {
  currentUserRole?: string;
}

/**
 * Full calendar — same Smart Calendar as Sales: month/week views, day panel,
 * drag-reschedule with server-side slot validation (no double booking).
 */
type SchedulingTab = 'calendar' | 'availability';

export default function AdminAppointmentsPage({ currentUserRole }: Props) {
  const location = useLocation();
  // Availability Controls are shown to any full-admin role (administrator + office_admin).
  // Sales can see the Calendar tab via APPOINTMENT_VIEW_ROLES but NOT Availability Controls.
  const isAdministrator = useMemo(
    () => SETTINGS_MANAGER_ROLES.includes(getSafeUserRole(currentUserRole) as any),
    [currentUserRole],
  );
  const notificationContext = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      panel: params.get('panel'),
      orderId: params.get('orderId') || undefined,
      isSchedulingActive: params.get('tab') === 'scheduling',
    };
  }, [location.search]);
  const initialTab: SchedulingTab = isAdministrator && notificationContext.panel === 'availability'
    ? 'availability'
    : 'calendar';
  const [activeTab, setActiveTab] = useState<SchedulingTab>(initialTab);
  const [visitedTabs, setVisitedTabs] = useState<Set<SchedulingTab>>(() => new Set([initialTab]));

  const selectSchedulingTab = useCallback((tab: SchedulingTab) => {
    setActiveTab(tab);
    setVisitedTabs((current) => {
      if (current.has(tab)) return current;
      const next = new Set(current);
      next.add(tab);
      return next;
    });
  }, []);

  useEffect(() => {
    ensureAvailabilityRealtimeSync();
  }, []);

  useEffect(() => {
    if (!notificationContext.isSchedulingActive) return;
    if (isAdministrator && notificationContext.panel === 'availability') {
      selectSchedulingTab('availability');
      return;
    }
    if (notificationContext.orderId) selectSchedulingTab('calendar');
  }, [isAdministrator, notificationContext.isSchedulingActive, notificationContext.orderId, notificationContext.panel, selectSchedulingTab]);

  return (
    <div className="ah-page-enter admin-appointments-page flex min-h-0 flex-1 flex-col gap-2">
      <div className="admin-appointments-tabs inline-flex w-fit shrink-0 items-center gap-0.5 rounded-xl bg-white p-0.5">
        <button
          type="button"
          className={`admin-appointments-tab inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold transition ${
            activeTab === 'calendar'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
          onClick={() => selectSchedulingTab('calendar')}
          aria-pressed={activeTab === 'calendar'}
        >
          <CalendarDays size={14} />
          Calendar
        </button>
        {isAdministrator && (
          <button
            type="button"
            className={`admin-appointments-tab inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold transition ${
              activeTab === 'availability'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            onClick={() => selectSchedulingTab('availability')}
            aria-pressed={activeTab === 'availability'}
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
            <SalesSmartCalendar
              variant="premiumAdmin"
              initialOrderId={notificationContext.orderId}
              deepLinkActive={notificationContext.isSchedulingActive}
            />
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
