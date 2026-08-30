export const CUSTOMER_BOOKING_FUNNEL_STORAGE_KEY = 'customer_booking_funnel_v1';

export type CustomerBookingFunnelDraft = {
  selectedVehicleId: string | null;
  selectedPackageId: string | null;
  wizardStarted: boolean;
};

export type FunnelVehicleRecord = {
  _id?: string | null;
  id?: string | null;
};

export type CustomerGarageLoadState =
  | 'idle'
  | 'loading'
  | 'loaded_empty'
  | 'loaded_one'
  | 'loaded_many'
  | 'error';

type FunnelStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const EMPTY_DRAFT: CustomerBookingFunnelDraft = {
  selectedVehicleId: null,
  selectedPackageId: null,
  wizardStarted: false,
};

export function getFunnelVehicleId(vehicle: FunnelVehicleRecord | null | undefined): string {
  return String(vehicle?._id || vehicle?.id || '').trim();
}

export function resolveFunnelVehicleId(
  vehicles: FunnelVehicleRecord[],
  requestedVehicleId: string | null | undefined,
): string {
  const requested = String(requestedVehicleId || '').trim();
  if (requested && vehicles.some((vehicle) => getFunnelVehicleId(vehicle) === requested)) {
    return requested;
  }
  return vehicles.length === 1 ? getFunnelVehicleId(vehicles[0]) : '';
}

export function getLoadedCustomerGarageState(vehicleCount: number): CustomerGarageLoadState {
  if (vehicleCount <= 0) return 'loaded_empty';
  return vehicleCount === 1 ? 'loaded_one' : 'loaded_many';
}

export function isCustomerGarageLoaded(state: CustomerGarageLoadState): boolean {
  return state === 'loaded_empty' || state === 'loaded_one' || state === 'loaded_many';
}

export function shouldPromptForVehicleRegistration(state: CustomerGarageLoadState): boolean {
  return state === 'loaded_empty';
}

export type CatalogBookingVehicleAction =
  | 'wait_for_garage'
  | 'add_vehicle'
  | 'auto_select_vehicle'
  | 'choose_vehicle'
  | 'garage_error';

export function getCatalogBookingVehicleAction(
  state: CustomerGarageLoadState,
): CatalogBookingVehicleAction {
  if (state === 'loaded_empty') return 'add_vehicle';
  if (state === 'loaded_one') return 'auto_select_vehicle';
  if (state === 'loaded_many') return 'choose_vehicle';
  if (state === 'error') return 'garage_error';
  return 'wait_for_garage';
}

export function readCustomerBookingFunnelDraft(
  storage: FunnelStorage | null | undefined,
): CustomerBookingFunnelDraft {
  if (!storage) return { ...EMPTY_DRAFT };
  try {
    const parsed = JSON.parse(storage.getItem(CUSTOMER_BOOKING_FUNNEL_STORAGE_KEY) || '{}');
    return {
      selectedVehicleId: typeof parsed.selectedVehicleId === 'string' && parsed.selectedVehicleId.trim()
        ? parsed.selectedVehicleId.trim()
        : null,
      selectedPackageId: typeof parsed.selectedPackageId === 'string' && parsed.selectedPackageId.trim()
        ? parsed.selectedPackageId.trim()
        : null,
      wizardStarted: parsed.wizardStarted === true,
    };
  } catch {
    storage.removeItem(CUSTOMER_BOOKING_FUNNEL_STORAGE_KEY);
    return { ...EMPTY_DRAFT };
  }
}

export function writeCustomerBookingFunnelDraft(
  storage: FunnelStorage | null | undefined,
  draft: CustomerBookingFunnelDraft,
): CustomerBookingFunnelDraft {
  const normalized = {
    selectedVehicleId: draft.selectedVehicleId || null,
    selectedPackageId: draft.selectedPackageId || null,
    wizardStarted: draft.wizardStarted === true,
  };
  storage?.setItem(CUSTOMER_BOOKING_FUNNEL_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function updateCustomerBookingFunnelDraft(
  storage: FunnelStorage | null | undefined,
  patch: Partial<CustomerBookingFunnelDraft>,
): CustomerBookingFunnelDraft {
  return writeCustomerBookingFunnelDraft(storage, {
    ...readCustomerBookingFunnelDraft(storage),
    ...patch,
  });
}

export function resetCustomerBookingPackageIntent(
  storage: FunnelStorage | null | undefined,
  selectedVehicleId: string | null,
): CustomerBookingFunnelDraft {
  return writeCustomerBookingFunnelDraft(storage, {
    selectedVehicleId,
    selectedPackageId: null,
    wizardStarted: false,
  });
}
