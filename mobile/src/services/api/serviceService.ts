import { cachedGet, TTL } from '@/services/api/client';
import type { ApiEnvelope, ServiceOption } from '@/services/api/types';

const CATEGORY_ICON_MAP: Record<string, string> = {
  Exterior: 'car-sport-outline',
  Interior: 'sparkles-outline',
  Complete: 'layers-outline',
  Engine: 'construct-outline',
  Premium: 'diamond-outline',
};

const CATALOG_ICON_MAP: Record<string, string> = {
  sparkles: 'sparkles-outline',
  shield: 'shield-checkmark-outline',
  star: 'star-outline',
  crown: 'diamond-outline',
  zap: 'flash-outline',
};

export type ServiceVehiclePriceKey =
  | 'hatchback'
  | 'sedan'
  | 'midsized'
  | 'suv'
  | 'pickup'
  | 'largeSuv'
  | 'highend';

const VEHICLE_PRICE_KEYS: ServiceVehiclePriceKey[] = [
  'hatchback', 'sedan', 'midsized', 'suv', 'pickup', 'largeSuv', 'highend',
];

const toFinitePrice = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
};

export const getServiceVehiclePriceKey = (vehicleType?: string | null): ServiceVehiclePriceKey | null => {
  const normalized = String(vehicleType || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  const keys: Record<string, ServiceVehiclePriceKey> = {
    hatchback: 'hatchback',
    sedan: 'sedan',
    midsized: 'midsized',
    midsize: 'midsized',
    suv: 'suv',
    pickup: 'pickup',
    pickuptruck: 'pickup',
    largesuv: 'largeSuv',
    largesuvvan: 'largeSuv',
    largevan: 'largeSuv',
    van: 'largeSuv',
    highend: 'highend',
    highendsedan: 'highend',
  };
  return keys[normalized] || null;
};

export const getServicePriceForVehicle = (
  service: ServiceOption,
  vehicleType?: string | null,
): number | null => {
  const key = getServiceVehiclePriceKey(vehicleType);
  if (!key) return null;
  const legacyKey = key === 'largeSuv' ? 'largesuv' : key;
  const richPrice = service.pricing?.[key]?.base;
  const legacyPrice = service.prices?.[key] ?? service.prices?.[legacyKey as keyof typeof service.prices];
  return toFinitePrice(richPrice ?? legacyPrice ?? (key === 'hatchback' ? service.basePrice : null));
};

export const getServiceStartingPrice = (service: ServiceOption): number | null => {
  const prices = VEHICLE_PRICE_KEYS
    .map((key) => getServicePriceForVehicle(service, key))
    .filter((price): price is number => price !== null);
  const basePrice = toFinitePrice(service.basePrice);
  if (basePrice !== null) prices.push(basePrice);
  return prices.length ? Math.min(...prices) : null;
};

export const getPackageKeyFromServiceName = (name?: string | null): string | null => {
  const match = String(name || '').match(/spf\s*[-_]*(80|89|99|101)/i);
  return match ? `spf${match[1]}` : null;
};

const toServiceOption = (raw: any): ServiceOption => {
  const id = raw?._id || raw?.id || '';
  const category = typeof raw?.category === 'string' ? raw.category.trim() : '';
  const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
  const basePrice = toFinitePrice(raw?.basePrice ?? raw?.price);
  const catalogCard = raw?.catalogCard && typeof raw.catalogCard === 'object'
    ? raw.catalogCard
    : null;

  const icon = CATALOG_ICON_MAP[catalogCard?.iconKey]
    || CATEGORY_ICON_MAP[category]
    || 'pricetag-outline';

  return {
    id,
    name,
    description: typeof raw?.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : undefined,
    duration: typeof raw?.duration === 'string' && raw.duration.trim()
      ? raw.duration.trim()
      : undefined,
    price: basePrice ?? 0,
    basePrice,
    prices: raw?.prices,
    pricing: raw?.pricing,
    displayOrder: Number.isFinite(Number(raw?.displayOrder)) ? Number(raw.displayOrder) : null,
    catalogCard,
    tag: category,
    icon,
  };
};

export const serviceService = {
  async getPublishedServices(): Promise<ServiceOption[]> {
    const data = await cachedGet<ApiEnvelope<any[]>>('/services/published', undefined, TTL.MEDIUM);
    const items = Array.isArray(data.data) ? data.data : [];
    return items
      .map(toServiceOption)
      .filter((service) => Boolean(service.id && service.name));
  },
};
