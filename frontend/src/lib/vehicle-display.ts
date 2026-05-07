/**
 * Some booking/order payloads put a composite key or hash in `vehiclePlate`.
 * Treat those as non-plates so POS shows year/make/model instead.
 */
export function isLikelyInternalVehiclePlate(plate: string): boolean {
  const s = String(plate || '').trim();
  if (s.length < 12) return false;
  // e.g. "033afd38...fc4f58fd:b0aa7..."
  if (/^[0-9a-f]{8,}(:[0-9a-f]+)+$/i.test(s)) return true;
  // Mongo ObjectId or similar used as surrogate "plate"
  if (s.length === 24 && /^[0-9a-f]+$/i.test(s)) return true;
  // long hex-only blob
  if (s.length >= 32 && /^[0-9a-f]+$/i.test(s)) return true;
  return false;
}

/** Safe plate for APIs: empty if value looks like an internal id. */
export function sanitizeVehiclePlate(plate: string): string {
  const s = String(plate || '').trim();
  if (!s || isLikelyInternalVehiclePlate(s)) return '';
  return s;
}

export function vehicleHeadline(v: {
  plate: string;
  year: string | number;
  make: string;
  model: string;
}): string {
  const plate = String(v.plate || '').trim();
  if (plate && !isLikelyInternalVehiclePlate(plate)) return plate;
  const bits = [v.year, v.make, v.model].map((x) => String(x || '').trim()).filter(Boolean);
  if (bits.length) return bits.join(' ');
  return 'Vehicle';
}
