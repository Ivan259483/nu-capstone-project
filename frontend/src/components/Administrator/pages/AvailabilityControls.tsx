import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

type ClosureReason = 'Holiday' | 'Renovation' | 'Emergency' | 'Staff Leave' | 'Custom';

interface DaySchedule {
  dow: number;
  open: boolean;
  from: string;
  to: string;
  slots: number;
}

interface ClosureDoc {
  _id: string;
  fromDate: string;
  toDate: string;
  reason?: ClosureReason;
  note?: string;
  createdAt?: string;
}

interface HolidayRow {
  id: string;
  name: string;
  date: string;
  classification: 'Regular' | 'Special Non-Working' | 'Additional Special Non-Working';
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const HOURS_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const CLOSURE_REASONS: ClosureReason[] = ['Holiday', 'Renovation', 'Emergency', 'Staff Leave', 'Custom'];

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { dow: 0, open: false, from: '08:00', to: '17:00', slots: 10 },
  { dow: 1, open: true, from: '08:00', to: '17:00', slots: 10 },
  { dow: 2, open: true, from: '08:00', to: '17:00', slots: 10 },
  { dow: 3, open: true, from: '08:00', to: '17:00', slots: 10 },
  { dow: 4, open: true, from: '08:00', to: '17:00', slots: 10 },
  { dow: 5, open: true, from: '08:00', to: '17:00', slots: 10 },
  { dow: 6, open: true, from: '08:00', to: '17:00', slots: 7 },
];

// Official nationwide 2026 holidays from Proclamation No. 1006 (fixed dates only).
const HOLIDAYS_2026: HolidayRow[] = [
  { id: '2026-01-01', name: "New Year's Day", date: '2026-01-01', classification: 'Regular' },
  { id: '2026-02-17', name: 'Chinese New Year', date: '2026-02-17', classification: 'Additional Special Non-Working' },
  { id: '2026-04-02', name: 'Maundy Thursday', date: '2026-04-02', classification: 'Regular' },
  { id: '2026-04-03', name: 'Good Friday', date: '2026-04-03', classification: 'Regular' },
  { id: '2026-04-04', name: 'Black Saturday', date: '2026-04-04', classification: 'Additional Special Non-Working' },
  { id: '2026-04-09', name: 'Araw ng Kagitingan', date: '2026-04-09', classification: 'Regular' },
  { id: '2026-05-01', name: 'Labor Day', date: '2026-05-01', classification: 'Regular' },
  { id: '2026-06-12', name: 'Independence Day', date: '2026-06-12', classification: 'Regular' },
  { id: '2026-08-21', name: 'Ninoy Aquino Day', date: '2026-08-21', classification: 'Special Non-Working' },
  { id: '2026-08-31', name: 'National Heroes Day', date: '2026-08-31', classification: 'Regular' },
  { id: '2026-11-01', name: "All Saints' Day", date: '2026-11-01', classification: 'Special Non-Working' },
  { id: '2026-11-02', name: "All Souls' Day", date: '2026-11-02', classification: 'Additional Special Non-Working' },
  { id: '2026-11-30', name: 'Bonifacio Day', date: '2026-11-30', classification: 'Regular' },
  { id: '2026-12-08', name: 'Feast of the Immaculate Conception of Mary', date: '2026-12-08', classification: 'Special Non-Working' },
  { id: '2026-12-24', name: 'Christmas Eve', date: '2026-12-24', classification: 'Additional Special Non-Working' },
  { id: '2026-12-25', name: 'Christmas Day', date: '2026-12-25', classification: 'Regular' },
  { id: '2026-12-30', name: 'Rizal Day', date: '2026-12-30', classification: 'Regular' },
  { id: '2026-12-31', name: 'Last Day of the Year', date: '2026-12-31', classification: 'Special Non-Working' },
];

const silentRequestConfig = { meta: { suppressErrorToast: true } } as any;

function getApiErrorMessage(error: any, fallback: string) {
  return error?.response?.data?.error
    || error?.response?.data?.message
    || error?.message
    || fallback;
}

function toDateKey(input: string | Date) {
  const date = new Date(input);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateLabel(input: string) {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function normalizeSchedule(payload: any): DaySchedule[] {
  const defaultsByDow = new Map(DEFAULT_SCHEDULE.map((row) => [row.dow, row]));
  const source = Array.isArray(payload) ? payload : [];

  const byDow = new Map<number, DaySchedule>();
  for (const row of source) {
    const dow = Number(row?.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;

    const base = defaultsByDow.get(dow) as DaySchedule;
    byDow.set(dow, {
      dow,
      open: typeof row?.open === 'boolean' ? row.open : base.open,
      from: typeof row?.from === 'string' ? row.from : base.from,
      to: typeof row?.to === 'string' ? row.to : base.to,
      slots: Number.isFinite(Number(row?.slots)) ? Math.max(0, Number(row.slots)) : base.slots,
    });
  }

  return Array.from({ length: 7 }, (_, dow) => byDow.get(dow) || (defaultsByDow.get(dow) as DaySchedule));
}

export default function AvailabilityControls() {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [emergencyClosed, setEmergencyClosed] = useState(false);
  const [isSavingEmergency, setIsSavingEmergency] = useState(false);

  const [closures, setClosures] = useState<ClosureDoc[]>([]);
  const [isLoadingClosures, setIsLoadingClosures] = useState(false);
  const [isAddingClosure, setIsAddingClosure] = useState(false);
  const [closureForm, setClosureForm] = useState({
    fromDate: '',
    toDate: '',
    reason: 'Holiday' as ClosureReason,
    note: '',
  });

  const [recurringSchedule, setRecurringSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [isSavingRecurring, setIsSavingRecurring] = useState(false);

  const [hoursSchedule, setHoursSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [isSavingHours, setIsSavingHours] = useState(false);

  const [selectedHolidayIds, setSelectedHolidayIds] = useState<Record<string, boolean>>({});
  const [isApplyingHolidays, setIsApplyingHolidays] = useState(false);

  const closuresSorted = useMemo(
    () => [...closures].sort((a, b) => new Date(a.fromDate).getTime() - new Date(b.fromDate).getTime()),
    [closures],
  );

  const hoursRows = useMemo(() => {
    const byDow = new Map(hoursSchedule.map((row) => [row.dow, row]));
    return HOURS_DISPLAY_ORDER.map((dow) => byDow.get(dow) || DEFAULT_SCHEDULE[dow]);
  }, [hoursSchedule]);

  const selectedHolidayCount = useMemo(
    () => HOLIDAYS_2026.filter((h) => selectedHolidayIds[h.id]).length,
    [selectedHolidayIds],
  );

  const fetchEmergencyStatus = async () => {
    const res = await api.get('/admin/availability/emergency', silentRequestConfig);
    setEmergencyClosed(!!res?.data?.emergencyClosed);
  };

  const fetchClosures = async () => {
    setIsLoadingClosures(true);
    try {
      const res = await api.get('/admin/availability/closures', silentRequestConfig);
      const rows = Array.isArray(res?.data) ? res.data : [];
      setClosures(rows);
    } finally {
      setIsLoadingClosures(false);
    }
  };

  const fetchRecurring = async () => {
    const res = await api.get('/admin/availability/recurring', silentRequestConfig);
    setRecurringSchedule(normalizeSchedule(res?.data));
  };

  const fetchHours = async () => {
    const res = await api.get('/admin/availability/hours', silentRequestConfig);
    setHoursSchedule(normalizeSchedule(res?.data));
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setIsBootstrapping(true);
      try {
        await Promise.all([fetchEmergencyStatus(), fetchClosures(), fetchRecurring(), fetchHours()]);
      } catch (error) {
        const msg = getApiErrorMessage(error, 'Failed to load availability controls.');
        toast.error(msg);
      } finally {
        if (active) setIsBootstrapping(false);
      }
    };

    load();
    return () => { active = false; };
  }, []);

  const toggleEmergency = async (closed: boolean) => {
    setIsSavingEmergency(true);
    try {
      const res = await api.patch('/admin/availability/emergency', { closed }, silentRequestConfig);
      const nextValue = !!res?.data?.emergencyClosed;
      setEmergencyClosed(nextValue);
      toast.success(nextValue ? 'Emergency closure enabled for today.' : 'Emergency closure disabled.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to update emergency closure.'));
    } finally {
      setIsSavingEmergency(false);
    }
  };

  const addClosure = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!closureForm.fromDate || !closureForm.toDate) {
      toast.error('Please choose both from and to dates.');
      return;
    }
    if (closureForm.fromDate > closureForm.toDate) {
      toast.error('From date must be on or before To date.');
      return;
    }

    setIsAddingClosure(true);
    try {
      const payload = {
        fromDate: closureForm.fromDate,
        toDate: closureForm.toDate,
        reason: closureForm.reason,
        note: closureForm.note.trim() || undefined,
      };
      await api.post('/admin/availability/closures', payload, silentRequestConfig);
      toast.success('Closure added.');
      setClosureForm((prev) => ({ ...prev, note: '' }));
      await fetchClosures();
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to add closure.'));
    } finally {
      setIsAddingClosure(false);
    }
  };

  const deleteClosure = async (id: string) => {
    try {
      await api.delete(`/admin/availability/closures/${id}`, silentRequestConfig);
      setClosures((prev) => prev.filter((row) => row._id !== id));
      toast.success('Closure deleted.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to delete closure.'));
    }
  };

  const toggleRecurringDay = (dow: number) => {
    setRecurringSchedule((prev) => prev.map((row) => (row.dow === dow ? { ...row, open: !row.open } : row)));
  };

  const saveRecurring = async () => {
    setIsSavingRecurring(true);
    try {
      const payload = [...recurringSchedule].sort((a, b) => a.dow - b.dow);
      const res = await api.put('/admin/availability/recurring', { schedule: payload }, silentRequestConfig);
      const normalized = normalizeSchedule(res?.data);
      setRecurringSchedule(normalized);
      setHoursSchedule(normalized);
      toast.success('Recurring day settings saved.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save recurring schedule.'));
    } finally {
      setIsSavingRecurring(false);
    }
  };

  const updateHoursRow = (dow: number, patch: Partial<DaySchedule>) => {
    setHoursSchedule((prev) => prev.map((row) => (row.dow === dow ? { ...row, ...patch } : row)));
  };

  const applyMondayToOpenDays = () => {
    const monday = hoursSchedule.find((row) => row.dow === 1);
    if (!monday) return;
    setHoursSchedule((prev) => prev.map((row) => (
      row.open
        ? { ...row, from: monday.from, to: monday.to, slots: monday.slots }
        : row
    )));
    toast.success('Applied Monday hours to all open days.');
  };

  const saveHours = async () => {
    setIsSavingHours(true);
    try {
      const payload = [...hoursSchedule].sort((a, b) => a.dow - b.dow).map((row) => ({
        dow: row.dow,
        open: !!row.open,
        from: row.from,
        to: row.to,
        slots: Number.isFinite(Number(row.slots)) ? Math.max(0, Number(row.slots)) : 0,
      }));
      const res = await api.put('/admin/availability/hours', { hours: payload }, silentRequestConfig);
      const normalized = normalizeSchedule(res?.data);
      setHoursSchedule(normalized);
      setRecurringSchedule(normalized);
      toast.success('Operating hours and per-time slot capacity saved.');
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to save operating hours.'));
    } finally {
      setIsSavingHours(false);
    }
  };

  const toggleHoliday = (holidayId: string) => {
    setSelectedHolidayIds((prev) => ({ ...prev, [holidayId]: !prev[holidayId] }));
  };

  const applyHolidaySchedule = async () => {
    const selected = HOLIDAYS_2026.filter((row) => selectedHolidayIds[row.id]);
    if (selected.length === 0) {
      toast.warning('Select at least one holiday first.');
      return;
    }

    const existingHolidayClosures = closures.filter((row) => (row.reason || 'Custom') === 'Holiday');
    const toCreate = selected.filter((holiday) => {
      const holidayDate = new Date(`${holiday.date}T12:00:00`);
      return !existingHolidayClosures.some((closure) => {
        const from = new Date(closure.fromDate);
        const to = new Date(closure.toDate);
        return holidayDate >= from && holidayDate <= to;
      });
    });

    const skippedCount = selected.length - toCreate.length;
    if (toCreate.length === 0) {
      toast.info(`No new closures created. ${skippedCount} already exist.`);
      return;
    }

    setIsApplyingHolidays(true);
    try {
      const payload = toCreate.map((holiday) => ({
        fromDate: holiday.date,
        toDate: holiday.date,
        reason: 'Holiday',
        note: holiday.name,
      }));
      await api.post('/admin/availability/closures', payload, silentRequestConfig);
      await fetchClosures();
      setSelectedHolidayIds((prev) => {
        const next = { ...prev };
        for (const holiday of toCreate) next[holiday.id] = false;
        return next;
      });
      toast.success(`Added ${toCreate.length} holiday closure${toCreate.length > 1 ? 's' : ''}${skippedCount ? `, skipped ${skippedCount} existing.` : '.'}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Failed to apply holiday closures.'));
    } finally {
      setIsApplyingHolidays(false);
    }
  };

  if (isBootstrapping) {
    return (
      <div className="ah-card-section p-6">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <Loader2 size={16} className="animate-spin" />
          Loading availability controls...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="ah-card-section p-5">
        <h3 className="text-sm font-semibold text-slate-900">Emergency Closure</h3>
        <p className="mt-1 text-xs text-slate-600">Immediately close or re-open shop bookings for today.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={emergencyClosed ? 'ah-btn-danger' : 'ah-btn-primary'}
            disabled={isSavingEmergency}
            onClick={() => toggleEmergency(!emergencyClosed)}
          >
            {isSavingEmergency ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : emergencyClosed ? 'Disable emergency closure' : 'Enable emergency closure'}
          </button>
          <span className={`ah-badge ${emergencyClosed ? 'ah-badge-failed' : 'ah-badge-success'}`}>
            {emergencyClosed ? 'Shop closed' : 'Shop open'}
          </span>
        </div>
      </section>

      <section className="ah-card-section p-5">
        <h3 className="text-sm font-semibold text-slate-900">Schedule a Closure</h3>
        <p className="mt-1 text-xs text-slate-600">Create one-off date range closures for holidays, renovation, or staffing constraints.</p>

        <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={addClosure}>
          <label className="text-xs font-medium text-slate-700">
            From date
            <input
              type="date"
              className="ah-input mt-1"
              value={closureForm.fromDate}
              onChange={(event) => setClosureForm((prev) => ({ ...prev, fromDate: event.target.value }))}
              required
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            To date
            <input
              type="date"
              className="ah-input mt-1"
              value={closureForm.toDate}
              onChange={(event) => setClosureForm((prev) => ({ ...prev, toDate: event.target.value }))}
              required
            />
          </label>
          <label className="text-xs font-medium text-slate-700">
            Reason
            <select
              className="ah-input mt-1"
              value={closureForm.reason}
              onChange={(event) => setClosureForm((prev) => ({ ...prev, reason: event.target.value as ClosureReason }))}
            >
              {CLOSURE_REASONS.map((reason) => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-700">
            Note (optional)
            <input
              type="text"
              className="ah-input mt-1"
              placeholder="Optional details"
              value={closureForm.note}
              onChange={(event) => setClosureForm((prev) => ({ ...prev, note: event.target.value }))}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className="ah-btn-primary" disabled={isAddingClosure}>
              {isAddingClosure ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Adding...
                </>
              ) : 'Add closure'}
            </button>
          </div>
        </form>

        <div
          className="mt-5 overflow-hidden rounded-2xl bg-white shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08),0_0_0_1px_rgba(226,232,240,0.55)]"
        >
          <div className="bg-slate-50/90 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Existing closures
          </div>
          {isLoadingClosures ? (
            <div className="p-4 text-sm text-slate-500">Loading closures...</div>
          ) : closuresSorted.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">No scheduled closures yet.</div>
          ) : (
            <div className="max-h-72 divide-y divide-slate-100 overflow-auto bg-white">
              {closuresSorted.map((row) => {
                const fromKey = toDateKey(row.fromDate);
                const toKey = toDateKey(row.toDate);
                return (
                  <div key={row._id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <div className="min-w-[210px] flex-1">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatDateLabel(row.fromDate)}{fromKey !== toKey ? ` to ${formatDateLabel(row.toDate)}` : ''}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {(row.reason || 'Custom')}{row.note ? ` • ${row.note}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="ah-btn-secondary !px-3 !py-1.5 !text-xs !font-semibold !text-red-600"
                      onClick={() => deleteClosure(row._id)}
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="ah-card-section p-5">
        <h3 className="text-sm font-semibold text-slate-900">Recurring Day Off</h3>
        <p className="mt-1 text-xs text-slate-600">Set each day of the week as open or closed.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((dow) => {
            const row = recurringSchedule.find((entry) => entry.dow === dow) || DEFAULT_SCHEDULE[dow];
            return (
              <button
                key={dow}
                type="button"
                onClick={() => toggleRecurringDay(dow)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  row.open
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
                }`}
              >
                {DOW_LABELS[dow]} • {row.open ? 'Open' : 'Closed'}
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          <button type="button" className="ah-btn-primary" onClick={saveRecurring} disabled={isSavingRecurring}>
            {isSavingRecurring ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : 'Save recurring schedule'}
          </button>
        </div>
      </section>

      <section className="ah-card-section p-5">
        <h3 className="text-sm font-semibold text-slate-900">Operating Hours & Slots</h3>
        <p className="mt-1 text-xs text-slate-600">Configure day-level hours and capacity for each generated time slot.</p>
        <div className="mt-4 overflow-x-auto rounded-2xl bg-white shadow-[0_2px_12px_-4px_rgba(15,23,42,0.08),0_0_0_1px_rgba(226,232,240,0.55)]">
          <table className="ah-table min-w-[760px]">
            <thead>
              <tr>
                <th>Day</th>
                <th>Open</th>
                <th>From</th>
                <th>To</th>
                <th>Capacity per time slot</th>
              </tr>
            </thead>
            <tbody>
              {hoursRows.map((row) => (
                <tr key={row.dow}>
                  <td className="font-semibold">{DOW_LABELS[row.dow]}</td>
                  <td>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={row.open}
                        onChange={(event) => updateHoursRow(row.dow, { open: event.target.checked })}
                      />
                      {row.open ? 'Open' : 'Closed'}
                    </label>
                  </td>
                  <td>
                    <input
                      type="time"
                      className="ah-input !max-w-[140px]"
                      value={row.from}
                      disabled={!row.open}
                      onChange={(event) => updateHoursRow(row.dow, { from: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="ah-input !max-w-[140px]"
                      value={row.to}
                      disabled={!row.open}
                      onChange={(event) => updateHoursRow(row.dow, { to: event.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      className="ah-input !max-w-[120px]"
                      value={row.slots}
                      disabled={!row.open}
                      onChange={(event) => updateHoursRow(row.dow, { slots: Math.max(0, Number(event.target.value) || 0) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="ah-btn-secondary" onClick={applyMondayToOpenDays}>
            Apply Monday hours to all open days
          </button>
          <button type="button" className="ah-btn-primary" onClick={saveHours} disabled={isSavingHours}>
            {isSavingHours ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving...
              </>
            ) : 'Save hours'}
          </button>
        </div>
      </section>

      <section className="ah-card-section p-5">
        <h3 className="text-sm font-semibold text-slate-900">Philippine Holidays 2026</h3>
        <p className="mt-1 text-xs text-slate-600">Select official nationwide holidays, then apply them as closure entries in one batch.</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {HOLIDAYS_2026.map((holiday) => (
            <label
              key={holiday.id}
              className="flex cursor-pointer items-start gap-2 rounded-xl bg-white px-3 py-2 shadow-[0_1px_4px_-2px_rgba(15,23,42,0.06),0_0_0_1px_rgba(226,232,240,0.45)] transition hover:shadow-[0_4px_14px_-6px_rgba(37,99,235,0.15),0_0_0_1px_rgba(147,197,253,0.45)] hover:bg-blue-50/50"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={!!selectedHolidayIds[holiday.id]}
                onChange={() => toggleHoliday(holiday.id)}
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{holiday.name}</span>
                <span className="block text-xs text-slate-500">
                  {formatDateLabel(`${holiday.date}T00:00:00`)} • {holiday.classification}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="ah-btn-primary" onClick={applyHolidaySchedule} disabled={isApplyingHolidays}>
            {isApplyingHolidays ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Applying...
              </>
            ) : 'Apply holiday schedule'}
          </button>
          <span className="text-xs text-slate-600">{selectedHolidayCount} selected</span>
        </div>
      </section>
    </div>
  );
}
