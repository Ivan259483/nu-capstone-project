import AsyncStorage from '@react-native-async-storage/async-storage';

export const BOOKING_DRAFT_STORAGE_KEY = '@autospf_booking_draft_v1';

const BOOKING_DRAFT_VERSION = 1 as const;
const BOOKING_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type BookingDraftV1 = {
  version: typeof BOOKING_DRAFT_VERSION;
  ownerId: string;
  updatedAt: number;
  intendedStep: number;
  selectedVehicleId: string | null;
  selectedServiceId: string | null;
  packageKey: string | null;
  phone: string;
  notes: string;
  selectedDate: string | null;
  selectedTime: string | null;
};

const optionalString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const parseDraft = (raw: string | null): BookingDraftV1 | null => {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<BookingDraftV1>;
    if (
      value.version !== BOOKING_DRAFT_VERSION
      || typeof value.ownerId !== 'string'
      || !value.ownerId.trim()
      || typeof value.updatedAt !== 'number'
      || !Number.isFinite(value.updatedAt)
      || typeof value.intendedStep !== 'number'
      || !Number.isFinite(value.intendedStep)
      || typeof value.phone !== 'string'
      || typeof value.notes !== 'string'
    ) {
      return null;
    }

    return {
      version: BOOKING_DRAFT_VERSION,
      ownerId: value.ownerId,
      updatedAt: value.updatedAt,
      intendedStep: Math.min(5, Math.max(0, Math.trunc(value.intendedStep))),
      selectedVehicleId: optionalString(value.selectedVehicleId),
      selectedServiceId: optionalString(value.selectedServiceId),
      packageKey: optionalString(value.packageKey)?.toLowerCase() ?? null,
      phone: value.phone,
      notes: value.notes,
      selectedDate: optionalString(value.selectedDate),
      selectedTime: optionalString(value.selectedTime),
    };
  } catch {
    return null;
  }
};

export const bookingDraftStorage = {
  async load(ownerId: string): Promise<BookingDraftV1 | null> {
    const raw = await AsyncStorage.getItem(BOOKING_DRAFT_STORAGE_KEY);
    const draft = parseDraft(raw);
    const expired = draft ? Date.now() - draft.updatedAt > BOOKING_DRAFT_TTL_MS : false;
    const wrongOwner = draft ? draft.ownerId !== ownerId : false;

    if (!draft || expired || wrongOwner) {
      if (raw) await AsyncStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
      return null;
    }

    return draft;
  },

  async save(draft: Omit<BookingDraftV1, 'version' | 'updatedAt'>): Promise<void> {
    await AsyncStorage.setItem(
      BOOKING_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, version: BOOKING_DRAFT_VERSION, updatedAt: Date.now() }),
    );
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(BOOKING_DRAFT_STORAGE_KEY);
  },
};
