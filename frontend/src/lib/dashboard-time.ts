/**
 * Sales dashboard KPIs use a fixed business TZ so "today" / hourly buckets
 * match Philippine operations regardless of the device locale.
 */
import type { Transaction } from './salesData';

export const DASHBOARD_TIMEZONE = 'Asia/Manila';

/** YYYY-MM-DD in the given IANA time zone for this instant. */
export function formatYmdInTz(date: Date | string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Add signed calendar days to a YYYY-MM-DD string (Gregorian, UTC math). */
export function addCalendarDaysYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const next = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Wall-clock hour 0–23 in `timeZone` for this instant. */
export function getHourInTz(date: Date | string, timeZone: string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 0;
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: 'numeric',
    hour12: false,
  })
    .formatToParts(d)
    .find((p) => p.type === 'hour')?.value;
  return Number.parseInt(h ?? '0', 10);
}

/** Millis for KPI bucketing (payment / activity / created). */
export function kpiInstantMs(t: Transaction): number {
  return new Date(t.analyticsDateTime || t.dateTime).getTime();
}

export type PrimaryKpiDayResult = {
  useLast24hFallback: boolean;
  kpiDayTxns: Transaction[];
  comparePrevTxns: Transaction[];
  calendarTodayTxns: Transaction[];
  yesterdayTxns: Transaction[];
  rolling24hTxns: Transaction[];
  prev24hTxns: Transaction[];
  todayYmd: string;
};

/**
 * When Manila calendar "today" has no orders, fall back to rolling last-24h window
 * so the dashboard still reflects recent POS activity (evidence: orders can sit on prior calendar date).
 */
export function getPrimaryKpiDayTransactions(
  transactions: Transaction[],
  nowMs: number = Date.now()
): PrimaryKpiDayResult {
  const tz = DASHBOARD_TIMEZONE;
  const todayYmd = formatYmdInTz(new Date(nowMs), tz);
  const yesterdayYmd = addCalendarDaysYmd(todayYmd, -1);
  const bucketYmd = (t: Transaction) => formatYmdInTz(t.analyticsDateTime || t.dateTime, tz);

  const calendarTodayTxns = transactions.filter((t) => {
    const y = bucketYmd(t);
    return y && y === todayYmd;
  });
  const yesterdayTxns = transactions.filter((t) => {
    const y = bucketYmd(t);
    return y && y === yesterdayYmd;
  });

  const rollStart = nowMs - 86400000;
  const roll48Start = nowMs - 86400000 * 2;

  const rolling24hTxns = transactions.filter((t) => {
    const ms = kpiInstantMs(t);
    return ms >= rollStart && ms <= nowMs;
  });
  const prev24hTxns = transactions.filter((t) => {
    const ms = kpiInstantMs(t);
    return ms >= roll48Start && ms < rollStart;
  });

  const useLast24hFallback = calendarTodayTxns.length === 0 && rolling24hTxns.length > 0;
  const kpiDayTxns = useLast24hFallback ? rolling24hTxns : calendarTodayTxns;
  const comparePrevTxns = useLast24hFallback ? prev24hTxns : yesterdayTxns;

  return {
    useLast24hFallback,
    kpiDayTxns,
    comparePrevTxns,
    calendarTodayTxns,
    yesterdayTxns,
    rolling24hTxns,
    prev24hTxns,
    todayYmd,
  };
}
