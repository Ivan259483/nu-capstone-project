import { normalizePlateNumber } from '@/lib/plate';

/** Vehicle type labels — match CustomerDashboard / API `vehicleType` strings */
export const ADD_VEHICLE_TYPE_LABELS = [
  'Hatchback',
  'Sedan',
  'Midsized',
  'SUV',
  'Pick UP',
  'Large SUV / Van',
  'Highend Sedan',
] as const;

export const BOOKING_YEAR_OPTIONS = Array.from({ length: 36 }, (_, i) => String(2025 - i));

export const VEHICLE_COLOR_PRESETS = [
  'White',
  'Black',
  'Silver',
  'Gray',
  'Blue',
  'Red',
  'Green',
  'Yellow',
  'Orange',
  'Brown',
] as const;

export const CAR_BRANDS = [
  'Toyota',
  'Honda',
  'Mitsubishi',
  'Ford',
  'Hyundai',
  'Kia',
  'Nissan',
  'Suzuki',
  'Mazda',
  'Isuzu',
  'Chevrolet',
  'BMW',
  'Mercedes-Benz',
  'Audi',
  'Subaru',
  'Volkswagen',
  'Lexus',
  'Jeep',
  'RAM',
  'Other',
];

/** Map vehicle type labels → pricing keys (customer booking catalog) */
const VEHICLE_TYPE_MAP: Record<string, string> = {
  hatchback: 'hatchback',
  sedan: 'sedan',
  midsized: 'midsized',
  suv: 'suv',
  'pick up': 'pickup',
  pickup: 'pickup',
  'large suv / van': 'largesuv',
  'large suv': 'largesuv',
  van: 'largesuv',
  highend: 'highend',
  'highend sedan': 'highend',
  'high-end sedan': 'highend',
};

export type VehiclePricingCategory =
  | 'HATCHBACK_SMALL_CAR'
  | 'SEDAN'
  | 'MIDSIZED'
  | 'SUV'
  | 'PICKUP'
  | 'LARGE_SUV_VAN'
  | 'HIGH_END_SEDAN';

const VEHICLE_PRICING_CATEGORY_MAP: Record<string, VehiclePricingCategory> = {
  hatchback: 'HATCHBACK_SMALL_CAR',
  'small car': 'HATCHBACK_SMALL_CAR',
  sedan: 'SEDAN',
  midsized: 'MIDSIZED',
  suv: 'SUV',
  'pick up': 'PICKUP',
  pickup: 'PICKUP',
  'large suv / van': 'LARGE_SUV_VAN',
  'large suv': 'LARGE_SUV_VAN',
  largesuv: 'LARGE_SUV_VAN',
  'large suv/van': 'LARGE_SUV_VAN',
  van: 'LARGE_SUV_VAN',
  highend: 'HIGH_END_SEDAN',
  'highend sedan': 'HIGH_END_SEDAN',
  'high-end sedan': 'HIGH_END_SEDAN',
};

export function getVehiclePriceKey(type: string): string | null {
  return VEHICLE_TYPE_MAP[type?.toLowerCase()] || null;
}

export function getVehiclePricingCategory(type: string): VehiclePricingCategory | null {
  return VEHICLE_PRICING_CATEGORY_MAP[type?.trim().toLowerCase()] || null;
}

const PRICING_CATEGORY_DETAILS: Record<VehiclePricingCategory, { priceKey: string; label: string }> = {
  HATCHBACK_SMALL_CAR: { priceKey: 'hatchback', label: 'Hatchback / Small Car' },
  SEDAN: { priceKey: 'sedan', label: 'Sedan' },
  MIDSIZED: { priceKey: 'midsized', label: 'Midsized' },
  SUV: { priceKey: 'suv', label: 'SUV' },
  PICKUP: { priceKey: 'pickup', label: 'Pickup' },
  LARGE_SUV_VAN: { priceKey: 'largesuv', label: 'Large SUV / Van' },
  HIGH_END_SEDAN: { priceKey: 'highend', label: 'High-end Sedan' },
};

export function getVehiclePriceKeyForPricingCategory(category?: string | null): string | null {
  return PRICING_CATEGORY_DETAILS[category as VehiclePricingCategory]?.priceKey || null;
}

export function getVehiclePricingCategoryLabel(category?: string | null): string | null {
  return PRICING_CATEGORY_DETAILS[category as VehiclePricingCategory]?.label || null;
}

export type VehicleGarageFormValues = {
  plate: string;
  year: string;
  brand: string;
  model: string;
  color: string;
  type: string;
  transmission: string;
  fuelType: string;
};

export const emptyVehicleGarageForm = (): VehicleGarageFormValues => ({
  plate: '',
  year: '',
  brand: '',
  model: '',
  color: '',
  type: '',
  transmission: '',
  fuelType: '',
});

/** Field validation for add/edit garage — same rules as CustomerDashboard */
export function validateVehicleGarageForm(v: VehicleGarageFormValues): Record<string, string> {
  const errors: Record<string, string> = {};
  const plateRaw = v.plate.trim();
  const plateNorm = normalizePlateNumber(plateRaw);
  const brand = v.brand.trim();
  const model = v.model.trim();
  const type = v.type.trim();

  if (!plateRaw) errors.plate = 'Plate number is required.';
  else if (plateNorm.length < 4 || plateNorm.length > 9) {
    errors.plate = 'Use 4–9 letters and numbers (spaces are ignored).';
  }
  if (!brand) errors.brand = 'Select a brand.';
  if (!model) {
    errors.model = 'Model is required (e.g. Vios, Civic).';
  } else if (model.length < 2) {
    errors.model = 'Too short — enter the model name.';
  }
  if (!type) errors.type = 'We could not classify this model. Choose a listed model or contact AutoSPF+.';

  return errors;
}
