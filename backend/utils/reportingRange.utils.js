const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
export const REPORT_TIME_ZONE = 'Asia/Manila';

const ymdPattern = /^\d{4}-\d{2}-\d{2}$/;

export const formatManilaYmd = (value = new Date()) => {
  const shifted = new Date(new Date(value).getTime() + MANILA_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
};

export const addYmdDays = (ymd, days) => {
  const [year, month, day] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};

export const manilaDayStart = (ymd) => {
  if (!ymdPattern.test(String(ymd))) throw new Error('Dates must use YYYY-MM-DD.');
  const [year, month, day] = String(ymd).split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
  ) {
    throw new Error('Invalid calendar date.');
  }
  return new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
};

export const manilaDayEnd = (ymd) => new Date(manilaDayStart(addYmdDays(ymd, 1)).getTime() - 1);

export const parseReportingRange = (query = {}, now = new Date()) => {
  const requested = String(query.range || query.period || '30d').toLowerCase();
  const range = ['7d', '30d', '90d', 'all', 'custom'].includes(requested) ? requested : null;
  if (!range) {
    const error = new Error('range must be one of 7d, 30d, 90d, all, or custom.');
    error.statusCode = 400;
    throw error;
  }

  if (range === 'all') {
    return {
      key: range,
      from: null,
      to: null,
      start: null,
      end: null,
      previousStart: null,
      previousEnd: null,
      comparison: null,
      timeZone: REPORT_TIME_ZONE,
    };
  }

  const today = formatManilaYmd(now);
  let from;
  let to;
  if (range === 'custom') {
    from = String(query.from || query.startDate || '');
    to = String(query.to || query.endDate || '');
    if (!from || !to) {
      const error = new Error('Custom reports require both from and to dates.');
      error.statusCode = 400;
      throw error;
    }
  } else {
    const dayCount = Number(range.slice(0, -1));
    to = today;
    from = addYmdDays(today, -(dayCount - 1));
  }

  const start = manilaDayStart(from);
  const end = manilaDayEnd(to);
  if (start > end) {
    const error = new Error('The from date must be on or before the to date.');
    error.statusCode = 400;
    throw error;
  }
  const maxSpanMs = 10 * 366 * 24 * 60 * 60 * 1000;
  if (end.getTime() - start.getTime() > maxSpanMs) {
    const error = new Error('Custom date ranges cannot exceed ten years.');
    error.statusCode = 400;
    throw error;
  }

  const durationMs = end.getTime() - start.getTime() + 1;
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs + 1);

  return {
    key: range,
    from,
    to,
    start,
    end,
    previousStart,
    previousEnd,
    comparison: { start: previousStart, end: previousEnd },
    timeZone: REPORT_TIME_ZONE,
  };
};

export const isWithinRange = (value, start, end) => {
  if (!start || !end) return Boolean(value);
  const timestamp = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(timestamp) && timestamp >= start.getTime() && timestamp <= end.getTime();
};

