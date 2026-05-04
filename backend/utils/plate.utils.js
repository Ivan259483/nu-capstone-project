import Vehicle from '../models/vehicle.model.js';

/** Uppercase A–Z / 0–9 only (spaces and punctuation stripped). */
export function normalizePlateNumber(input) {
  if (input == null || typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Regex that matches legacy plates stored with spaces/dashes between characters,
 * e.g. normalized "ABC123" matches DB value "ABC 123".
 */
export function plateEquivalenceRegex(normalizedPlate) {
  if (!normalizedPlate || normalizedPlate.length < 4 || normalizedPlate.length > 9) return null;
  const parts = [...normalizedPlate].map((c) => {
    if (/^[A-Z0-9]$/.test(c)) return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return null;
  });
  if (parts.some((x) => x === null)) return null;
  return new RegExp(`^${parts.join('[^A-Za-z0-9]*')}$`, 'i');
}

/** Exact normalized match first, then equivalence (legacy formatting). */
export async function findVehicleByNormalizedPlate(normalizedPlate) {
  if (!normalizedPlate) return null;
  let v = await Vehicle.findOne({ plateNumber: normalizedPlate });
  if (v) return v;
  const rx = plateEquivalenceRegex(normalizedPlate);
  if (!rx) return null;
  return Vehicle.findOne({ plateNumber: { $regex: rx } });
}
