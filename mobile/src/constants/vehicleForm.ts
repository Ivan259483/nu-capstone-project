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
export const VEHICLE_YEAR_OPTIONS: string[] = Array.from({ length: 36 }, (_, i) =>
  String(currentYear - i)
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
] as const;

export const TRANSMISSION_OPTIONS = ['Automatic', 'Manual', 'CVT'] as const;

export const FUEL_TYPE_OPTIONS = ['Gasoline', 'Diesel', 'Electric', 'Hybrid'] as const;
