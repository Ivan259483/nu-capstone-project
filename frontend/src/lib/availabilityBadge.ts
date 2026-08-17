export type AvailabilityBadgeTone = 'high' | 'medium' | 'low' | 'full' | 'closed' | 'emergency' | 'unavailable';

type AvailabilityBadgeInput = {
  remaining: number | null | undefined;
  capacity: number | null | undefined;
  isClosed?: boolean;
  isEmergencyClosed?: boolean;
  unit?: 'slot' | 'appointment';
};

export type AvailabilityBadge = {
  tone: AvailabilityBadgeTone;
  label: string;
  ratio: number | null;
};

/**
 * Maps the existing backend daily-capacity totals to a presentation tone.
 * This does not calculate or persist availability; it only styles the
 * authoritative remaining/capacity values returned by the availability API.
 */
export function getAvailabilityBadge({
  remaining,
  capacity,
  isClosed = false,
  isEmergencyClosed = false,
  unit = 'slot',
}: AvailabilityBadgeInput): AvailabilityBadge {
  if (isEmergencyClosed) return { tone: 'emergency', label: 'Emergency Closed', ratio: null };
  if (isClosed) return { tone: 'closed', label: 'Closed', ratio: null };

  if (remaining == null || capacity == null) {
    return { tone: 'unavailable', label: 'Availability unavailable', ratio: null };
  }

  const normalizedRemaining = Number(remaining);
  const normalizedCapacity = Number(capacity);
  if (
    !Number.isFinite(normalizedRemaining)
    || normalizedRemaining < 0
    || !Number.isFinite(normalizedCapacity)
    || normalizedCapacity < 0
  ) {
    return { tone: 'unavailable', label: 'Availability unavailable', ratio: null };
  }

  if (normalizedRemaining <= 0 || normalizedCapacity <= 0) {
    return { tone: 'full', label: 'Fully booked', ratio: 0 };
  }

  const ratio = normalizedRemaining / normalizedCapacity;
  const tone: AvailabilityBadgeTone = normalizedRemaining <= 2
    ? 'low'
    : ratio >= 0.7
      ? 'high'
      : ratio >= 0.3
        ? 'medium'
        : 'low';
  const noun = normalizedRemaining === 1 ? unit : `${unit}s`;
  const suffix = tone === 'low' ? 'left' : 'available';

  return {
    tone,
    label: `${normalizedRemaining} ${noun} ${suffix}`,
    ratio,
  };
}
