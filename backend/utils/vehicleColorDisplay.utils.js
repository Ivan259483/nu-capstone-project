const ABSENT_COLOR_KEYS = new Set([
  '',
  'unknown',
  'unknowncolor',
  'n/a',
  'na',
  'none',
  'notspecified',
  'notset',
]);

const normalizeVehicleColorKey = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '');

export const normalizeVehicleColorDisplay = (value, fallback = 'Not specified') => {
  const normalized = normalizeVehicleColorKey(value);
  if (ABSENT_COLOR_KEYS.has(normalized)) return fallback;

  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw;
};

export const normalizeVehicleColorSource = normalizeVehicleColorDisplay;
