export const CUSTOMER_REGIONAL_OPTIONS = Object.freeze({
  language: Object.freeze(['English', 'Filipino', 'Japanese', 'Korean']),
  region: Object.freeze(['Philippines', 'Singapore', 'United States', 'United Arab Emirates']),
  timezone: Object.freeze(['Asia/Manila', 'Asia/Singapore', 'UTC', 'America/Los_Angeles', 'Europe/London']),
  dateFormat: Object.freeze(['DD MMM YYYY', 'MMM DD, YYYY', 'YYYY-MM-DD']),
});

export function normalizeCustomerRegionalPreferences(preferences = {}) {
  return Object.fromEntries(Object.entries(CUSTOMER_REGIONAL_OPTIONS).map(([key, options]) => [
    key, options.includes(preferences?.[key]) ? preferences[key] : null,
  ]));
}

export function validateCustomerRegionalPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
    return 'Provide at least one regional preference.';
  }
  for (const [key, value] of Object.entries(body)) {
    if (!Object.prototype.hasOwnProperty.call(CUSTOMER_REGIONAL_OPTIONS, key)
      || typeof value !== 'string' || !CUSTOMER_REGIONAL_OPTIONS[key].includes(value)) {
      return `Invalid regional preference: ${key}`;
    }
  }
  return null;
}
