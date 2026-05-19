/**
 * Mirrors backend slot.service.js band generation so the calendar can derive
 * "capacity per time slot" display without relying on newer /api/slots/range fields.
 */

export const DEFAULT_SLOT_DURATION_MINUTES = 60;

export type RecurringScheduleRow = {
  dow: number;
  open: boolean;
  from: string;
  to: string;
  slots: number;
};

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(totalMins: number) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Same rules as backend `generateTimeSlots` (closed / invalid window → []). */
export function generateTimeBandsForDayRow(
  dayConfig: RecurringScheduleRow | undefined,
  slotDuration = DEFAULT_SLOT_DURATION_MINUTES
): string[] {
  if (!dayConfig?.open) return [];
  const openMin = toMinutes(dayConfig.from);
  const closeMin = toMinutes(dayConfig.to);
  if (!Number.isFinite(openMin) || !Number.isFinite(closeMin) || openMin >= closeMin) return [];
  const step = slotDuration > 0 ? slotDuration : DEFAULT_SLOT_DURATION_MINUTES;
  const out: string[] = [];
  for (let t = openMin; t < closeMin; t += step) {
    out.push(fromMinutes(t));
  }
  return out;
}

function ymdLocalDow(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d).getDay();
}

export function getScheduleRowForYmd(dateStr: string, schedule: RecurringScheduleRow[]): RecurringScheduleRow | undefined {
  const dow = ymdLocalDow(dateStr);
  return schedule.find((e) => e.dow === dow);
}

export function getBandCountForYmd(dateStr: string, schedule: RecurringScheduleRow[]): number {
  return generateTimeBandsForDayRow(getScheduleRowForYmd(dateStr, schedule)).length;
}

export function getPerSlotCapacityForYmd(dateStr: string, schedule: RecurringScheduleRow[]): number {
  const row = getScheduleRowForYmd(dateStr, schedule);
  return Math.max(0, Number(row?.slots || 0));
}
