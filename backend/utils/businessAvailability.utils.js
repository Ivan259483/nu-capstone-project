export const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Manila';
const MANILA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;
const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Intl throws for unknown zones; keep that failure at the configuration edge. */
export function isValidIanaTimeZone(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

// Booking wall-clock authority is intentionally fixed. Regional display
// preferences and the Node host timezone must never change appointment dates.
export const SHOP_TIME_ZONE = DEFAULT_BUSINESS_TIME_ZONE;

const formatterCache = new Map();

function getClockFormatter(timeZone) {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** Pure wall-clock projection for tests and synchronous date/time comparisons. */
export function getClockInTimeZone(now = new Date(), timeZone = SHOP_TIME_ZONE) {
  const resolvedTimeZone = isValidIanaTimeZone(timeZone) ? timeZone.trim() : SHOP_TIME_ZONE;
  const parts = Object.fromEntries(
    getClockFormatter(resolvedTimeZone)
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
    timeZone: resolvedTimeZone,
  };
}

/** Resolve the one authoritative booking clock without reading regional preferences. */
export async function getBusinessClock(now = new Date()) {
  return getClockInTimeZone(now, SHOP_TIME_ZONE);
}

/** Convert a Manila calendar date to its exact UTC persistence/query boundary. */
export function getBusinessDateBoundary(dateStr, edge = 'start') {
  const normalized = typeof dateStr === 'string' ? dateStr.trim() : '';
  if (!BUSINESS_DATE_RE.test(normalized)) return null;
  const [year, month, day] = normalized.split('-').map(Number);
  const startMs = Date.UTC(year, month - 1, day) - MANILA_UTC_OFFSET_MS;
  const start = new Date(startMs);
  if (getClockInTimeZone(start, SHOP_TIME_ZONE).date !== normalized) return null;
  return edge === 'end' ? new Date(startMs + 24 * 60 * 60 * 1000 - 1) : start;
}

/** Format a stored instant using the booking timezone, not the server timezone. */
export function getBusinessDateKey(value) {
  if (typeof value === 'string' && BUSINESS_DATE_RE.test(value.trim())) return value.trim();
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return getClockInTimeZone(parsed, SHOP_TIME_ZONE).date;
}

/**
 * `emergencyClosureDate` is authoritative. The legacy boolean is intentionally
 * not consulted so yesterday's true value can never close a new business day.
 */
export function getEffectiveEmergencyClosureState(availability, businessClock) {
  const rawDate = typeof availability?.emergencyClosureDate === 'string'
    ? availability.emergencyClosureDate.trim()
    : '';
  const affectedBusinessDate = BUSINESS_DATE_RE.test(rawDate) ? rawDate : null;
  const businessDate = businessClock?.date || getClockInTimeZone().date;
  const businessTimeZone = businessClock?.timeZone || SHOP_TIME_ZONE;

  return {
    emergencyClosed: Boolean(affectedBusinessDate && affectedBusinessDate === businessDate),
    emergencyClosureDate: affectedBusinessDate,
    affectedBusinessDate,
    businessDate,
    businessTimeZone,
  };
}
