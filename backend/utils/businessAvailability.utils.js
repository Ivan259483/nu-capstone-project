import Setting from '../models/setting.model.js';

export const DEFAULT_BUSINESS_TIME_ZONE = 'Asia/Manila';

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

const environmentTimeZone = String(process.env.SHOP_TIME_ZONE || '').trim();
export const SHOP_TIME_ZONE = isValidIanaTimeZone(environmentTimeZone)
  ? environmentTimeZone
  : DEFAULT_BUSINESS_TIME_ZONE;

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

/**
 * Resolve the administrator-configured business timezone on every authoritative
 * availability read. An absent/invalid setting falls back to SHOP_TIME_ZONE,
 * then Asia/Manila, so a malformed preference cannot break booking validation.
 */
export async function getBusinessClock(now = new Date()) {
  let configuredTimeZone = null;
  try {
    const settings = await Setting.findOne().select('timezone').lean();
    if (isValidIanaTimeZone(settings?.timezone)) {
      configuredTimeZone = settings.timezone.trim();
    }
  } catch {
    // Availability remains fail-safe and deterministic if settings cannot be read.
  }

  return getClockInTimeZone(now, configuredTimeZone || SHOP_TIME_ZONE);
}

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
