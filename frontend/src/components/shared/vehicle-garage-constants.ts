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

export function getVehiclePriceKey(type: string): string {
  return VEHICLE_TYPE_MAP[type?.toLowerCase()] || 'hatchback';
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
  if (!type) errors.type = 'Please select a vehicle type.';

  return errors;
}
