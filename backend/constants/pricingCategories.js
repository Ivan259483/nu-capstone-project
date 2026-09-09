import { resolveVehicleClassification } from './vehicleDatabase.js';

export const VEHICLE_PRICING_CATEGORY = Object.freeze({
  HATCHBACK_SMALL_CAR: 'HATCHBACK_SMALL_CAR',
  SEDAN: 'SEDAN',
  MIDSIZED: 'MIDSIZED',
  SUV: 'SUV',
  PICKUP: 'PICKUP',
  LARGE_SUV_VAN: 'LARGE_SUV_VAN',
  HIGH_END_SEDAN: 'HIGH_END_SEDAN',
});

export const VEHICLE_PRICING_CATEGORIES = Object.freeze([
  {
    code: VEHICLE_PRICING_CATEGORY.HATCHBACK_SMALL_CAR,
    apiKey: 'hatchback',
    legacyKey: 'hatchback',
    label: 'Hatchback / Small Car',
    legacyLabels: ['hatchback', 'small car', 'hatchback / small car'],
  },
  {
    code: VEHICLE_PRICING_CATEGORY.SEDAN,
    apiKey: 'sedan',
    legacyKey: 'sedan',
    label: 'Sedan',
    legacyLabels: ['sedan'],
  },
  {
    code: VEHICLE_PRICING_CATEGORY.MIDSIZED,
    apiKey: 'midsized',
    legacyKey: 'midsized',
    label: 'Midsized',
    legacyLabels: ['midsized', 'midsize', 'mid-sized'],
  },
  {
    code: VEHICLE_PRICING_CATEGORY.SUV,
    apiKey: 'suv',
    legacyKey: 'suv',
    label: 'SUV',
    legacyLabels: ['suv'],
  },
  {
    code: VEHICLE_PRICING_CATEGORY.PICKUP,
    apiKey: 'pickup',
    legacyKey: 'pickup',
    label: 'Pickup',
    legacyLabels: ['pickup', 'pick up', 'pick-up', 'pickup truck'],
  },
  {
    code: VEHICLE_PRICING_CATEGORY.LARGE_SUV_VAN,
    apiKey: 'largeSuv',
    legacyKey: 'largesuv',
    label: 'Large SUV / Van',
    legacyLabels: ['large suv / van', 'large suv', 'large van', 'van', 'largesuv'],
  },
  {
    code: VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN,
    apiKey: 'highend',
    legacyKey: 'highend',
    label: 'High-End Sedan',
    legacyLabels: ['high-end sedan', 'highend sedan', 'high end sedan', 'highend', 'high-end'],
  },
]);

export const VEHICLE_PRICING_CATEGORY_CODES = Object.freeze(
  VEHICLE_PRICING_CATEGORIES.map((category) => category.code)
);

const normalizeAlias = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
export const getVehiclePricingCategory = (value) => {
  const normalized = normalizeAlias(value);
  if (!normalized) return null;

  return VEHICLE_PRICING_CATEGORIES.find((category) => (
    normalizeAlias(category.code) === normalized
    || normalizeAlias(category.apiKey) === normalized
    || normalizeAlias(category.legacyKey) === normalized
    || category.legacyLabels.some((alias) => normalizeAlias(alias) === normalized)
  )) || null;
};

export const normalizeVehiclePricingCategory = (value) =>
  getVehiclePricingCategory(value)?.code || null;

export const resolveVehicleDatabasePricingCategory = (vehicle) => {
  if (!vehicle || typeof vehicle !== 'object') return null;
  return resolveVehicleClassification(vehicle.make || vehicle.brand, vehicle.model);
};

export const resolveVehiclePricingCategory = (vehicle) => {
  if (!vehicle || typeof vehicle !== 'object') return null;

  const explicitCategory = normalizeVehiclePricingCategory(vehicle.pricingCategory);
  if (explicitCategory) return explicitCategory;

  const legacyVehicleType = normalizeVehiclePricingCategory(vehicle.vehicleType || vehicle.type);
  if (legacyVehicleType) return legacyVehicleType;

  return resolveVehicleDatabasePricingCategory(vehicle);
};

export const getVehicleTypeLabelForPricingCategory = (value) => {
  const category = normalizeVehiclePricingCategory(value);
  return {
    [VEHICLE_PRICING_CATEGORY.HATCHBACK_SMALL_CAR]: 'Hatchback',
    [VEHICLE_PRICING_CATEGORY.SEDAN]: 'Sedan',
    [VEHICLE_PRICING_CATEGORY.MIDSIZED]: 'Midsized',
    [VEHICLE_PRICING_CATEGORY.SUV]: 'SUV',
    [VEHICLE_PRICING_CATEGORY.PICKUP]: 'Pickup',
    [VEHICLE_PRICING_CATEGORY.LARGE_SUV_VAN]: 'Large SUV / Van',
    [VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN]: 'High-End Sedan',
  }[category] || null;
};

export const getVehiclePricingApiKey = (value) =>
  getVehiclePricingCategory(value)?.apiKey || null;

export const getVehiclePricingLegacyKey = (value) =>
  getVehiclePricingCategory(value)?.legacyKey || null;

export const getVehiclePricingLabel = (value) =>
  getVehiclePricingCategory(value)?.label || null;
