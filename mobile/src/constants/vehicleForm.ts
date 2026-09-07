/** Shared with CustomerDashboard web · keep labels/values aligned for API */

export const VEHICLE_BODY_TYPES = [
  'Hatchback',
  'Sedan',
  'Midsized',
  'SUV',
  'Pick UP',
  'Large SUV / Van',
  'Highend Sedan',
] as const;

export type VehiclePricingCategory =
  | 'HATCHBACK_SMALL_CAR'
  | 'SEDAN'
  | 'MIDSIZED'
  | 'SUV'
  | 'PICKUP'
  | 'LARGE_SUV_VAN'
  | 'HIGH_END_SEDAN';

const VEHICLE_PRICING_CATEGORY_BY_LABEL: Record<string, VehiclePricingCategory> = {
  hatchback: 'HATCHBACK_SMALL_CAR',
  'small car': 'HATCHBACK_SMALL_CAR',
  sedan: 'SEDAN',
  midsized: 'MIDSIZED',
  suv: 'SUV',
  'pick up': 'PICKUP',
  pickup: 'PICKUP',
  'large suv / van': 'LARGE_SUV_VAN',
  'large suv': 'LARGE_SUV_VAN',
  van: 'LARGE_SUV_VAN',
  'highend sedan': 'HIGH_END_SEDAN',
  'high-end sedan': 'HIGH_END_SEDAN',
};

export const getVehiclePricingCategory = (vehicleType?: string | null): VehiclePricingCategory | null =>
  VEHICLE_PRICING_CATEGORY_BY_LABEL[String(vehicleType || '').trim().toLowerCase()] || null;

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
] as const;

const currentYear = new Date().getFullYear();
export const VEHICLE_YEAR_OPTIONS: string[] = Array.from({ length: currentYear + 2 - 1886 + 1 }, (_, i) =>
  String(currentYear + 2 - i)
);

export const VEHICLE_COLOR_SWATCHES = [
  { name: 'White', hex: '#f1f5f9' },
  { name: 'Black', hex: '#1e293b' },
  { name: 'Silver', hex: '#94a3b8' },
  { name: 'Gray', hex: '#64748b' },
  { name: 'Blue', hex: '#3b82f6' },
  { name: 'Red', hex: '#ef4444' },
  { name: 'Green', hex: '#22c55e' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Orange', hex: '#f97316' },
  { name: 'Brown', hex: '#92400e' },
  { name: 'Gold', hex: '#d4a017' },
  { name: 'Purple', hex: '#7e22ce' },
  { name: 'Pink', hex: '#ec4899' },
  { name: 'Beige', hex: '#d6c6a8' },
  { name: 'Bronze', hex: '#a97142' },
  { name: 'Two-Tone', hex: '#64748b' },
] as const;

export const TRANSMISSION_OPTIONS = ['Automatic', 'Manual', 'CVT'] as const;

export const FUEL_TYPE_OPTIONS = ['Gasoline', 'Diesel', 'Electric', 'Hybrid'] as const;
