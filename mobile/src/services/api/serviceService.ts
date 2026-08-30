import { cachedGet, TTL } from '@/services/api/client';
import type {
  ApiEnvelope,
  ServiceCatalog,
  ServiceOption,
  ServicePricingCategory,
  Vehicle,
} from '@/services/api/types';

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

export const getServiceVehiclePriceKey = (pricingCategory?: string | null): ServiceVehiclePriceKey | null => {
  const normalized = String(pricingCategory || '').trim().toLowerCase().replace(/[\s_-]/g, '');
  const keys: Record<string, ServiceVehiclePriceKey> = {
    hatchbacksmallcar: 'hatchback',
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
  pricingCategory?: string | null,
): number | null => {
  const key = getServiceVehiclePriceKey(pricingCategory);
  if (!key) return null;
  const legacyKey = key === 'largeSuv' ? 'largesuv' : key;
  const richPrice = service.pricing?.[key]?.base;
  const legacyPrice = service.prices?.[key] ?? service.prices?.[legacyKey as keyof typeof service.prices];
  return toFinitePrice(richPrice ?? legacyPrice);
};

export const getServiceStartingPrice = (service: ServiceOption): number | null => {
  const prices = VEHICLE_PRICE_KEYS
    .map((key) => getServicePriceForVehicle(service, key))
    .filter((price): price is number => price !== null);
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
    packageCode: raw?.packageCode,
    tier: raw?.tier,
    protectionYears: toFinitePrice(raw?.protectionYears),
    durationNeedsClientVerification: Boolean(raw?.durationNeedsClientVerification),
    catalogVersion: raw?.catalogVersion,
    available: raw?.available,
    promoPrice: toFinitePrice(raw?.promoPrice),
    srp: toFinitePrice(raw?.srp),
    savings: toFinitePrice(raw?.savings),
    tintBundlePrice: toFinitePrice(raw?.tintBundlePrice),
    vehiclePricingCategory: raw?.vehiclePricingCategory,
    catalogCard,
    tag: category,
    icon,
  };
};

export const serviceService = {
  async getCatalog(): Promise<ServiceCatalog> {
    const data = await cachedGet<ApiEnvelope<any>>('/services/catalog', undefined, TTL.MEDIUM);
    const rawCategories = Array.isArray(data.data?.pricingCategories)
      ? data.data.pricingCategories
      : [];
    const rawPackages = Array.isArray(data.data?.packages) ? data.data.packages : [];

    const pricingCategories = rawCategories
      .map((category: any) => ({
        code: String(category?.code || '').trim(),
        apiKey: String(category?.apiKey || '').trim(),
        legacyKey: String(category?.legacyKey || '').trim(),
        label: String(category?.label || '').trim(),
      }))
      .filter((category: any) => (
        category.code && category.label && VEHICLE_PRICE_KEYS.includes(category.apiKey)
      )) as ServicePricingCategory[];

    return {
      catalogVersion: String(data.data?.catalogVersion || ''),
      pricingCategories,
      packages: rawPackages
        .map(toServiceOption)
        .filter((service: ServiceOption) => Boolean(service.id && service.name)),
    };
  },

  async getPublishedServices(): Promise<ServiceOption[]> {
    const data = await cachedGet<ApiEnvelope<any[]>>('/services/published', undefined, TTL.MEDIUM);
    const items = Array.isArray(data.data) ? data.data : [];
    return items
      .map(toServiceOption)
      .filter((service) => Boolean(service.id && service.name));
  },

  async getBookingOptions(vehicleId: string): Promise<ServiceOption[]> {
    const data = await cachedGet<ApiEnvelope<{ packages?: any[] }>>(
      '/services/booking-options',
      { params: { vehicleId } },
      TTL.SHORT,
    );
    const items = Array.isArray(data.data?.packages) ? data.data.packages : [];
    return items
      .map(toServiceOption)
      .filter((service) => Boolean(service.id && service.name));
  },

  async getBookingCatalog(vehicleId: string): Promise<{ vehicle: Vehicle | null; packages: ServiceOption[] }> {
    const data = await cachedGet<ApiEnvelope<{ vehicle?: any; packages?: any[] }>>(
      '/services/booking-options',
      { params: { vehicleId } },
      TTL.SHORT,
    );
    const rawVehicle = data.data?.vehicle;
    const packages = Array.isArray(data.data?.packages) ? data.data.packages : [];
    return {
      vehicle: rawVehicle ? {
        id: rawVehicle.id || rawVehicle._id || vehicleId,
        _id: rawVehicle._id,
        year: rawVehicle.year ?? '',
        make: rawVehicle.make || '',
        model: rawVehicle.model || '',
        plateNumber: rawVehicle.plateNumber || '',
        vehicleType: rawVehicle.vehicleType,
        pricingCategory: rawVehicle.pricingCategory ?? null,
        pricingCategoryNeedsReview: Boolean(rawVehicle.pricingCategoryNeedsReview),
      } : null,
      packages: packages
        .map(toServiceOption)
        .filter((service) => Boolean(service.id && service.name)),
    };
  },
};
