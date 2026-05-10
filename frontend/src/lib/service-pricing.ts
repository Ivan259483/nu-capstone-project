export type PublicVehiclePriceKey =
    | 'hatchback'
    | 'sedan'
    | 'midsized'
    | 'suv'
    | 'pickup'
    | 'largesuv'
    | 'highend';

export type ApiVehiclePriceKey =
    | 'hatchback'
    | 'sedan'
    | 'midsized'
    | 'suv'
    | 'pickup'
    | 'largeSuv'
    | 'highend';

export type ServicePricingEntry = {
    base: number | null;
    original: number | null;
    addon: number | null;
};

/** Optional overrides for /services marketing cards (Mongo `catalogCard`) */
export type ServiceCatalogCard = {
    badge?: string;
    warrantyLabel?: string;
    tagline?: string;
    tierLabel?: string;
    features?: string[];
    highlighted?: string[];
    addonLabel?: string;
    discountBadge?: string;
    iconKey?: 'sparkles' | 'shield' | 'star' | 'crown' | 'zap';
    accentFrom?: string;
    accentTo?: string;
    accentMid?: string;
    popular?: boolean;
    flagship?: boolean;
    originalPriceMultiplier?: number | null;
};

export type PublishedServicePricingSource = {
    id?: string;
    _id?: string;
    name?: string;
    basePrice?: number | null;
    prices?: Partial<Record<PublicVehiclePriceKey, number | null>> & { largeSuv?: number | null };
    pricing?: Partial<Record<ApiVehiclePriceKey | PublicVehiclePriceKey, Partial<ServicePricingEntry> | undefined>>;
    catalogCard?: ServiceCatalogCard | null;
};

export const VEHICLE_PRICE_FIELDS: {
    apiKey: ApiVehiclePriceKey;
    publicKey: PublicVehiclePriceKey;
    label: string;
    compactLabel: string;
}[] = [
    { apiKey: 'hatchback', publicKey: 'hatchback', label: 'Hatchback', compactLabel: 'Hatchback' },
    { apiKey: 'sedan', publicKey: 'sedan', label: 'Sedan', compactLabel: 'Sedan' },
    { apiKey: 'midsized', publicKey: 'midsized', label: 'Midsized', compactLabel: 'Midsized' },
    { apiKey: 'suv', publicKey: 'suv', label: 'SUV', compactLabel: 'SUV' },
    { apiKey: 'pickup', publicKey: 'pickup', label: 'Pick Up', compactLabel: 'Pick Up' },
    { apiKey: 'largeSuv', publicKey: 'largesuv', label: 'Large SUV / Van', compactLabel: 'Large SUV' },
    { apiKey: 'highend', publicKey: 'highend', label: 'Highend Sedan', compactLabel: 'Highend' },
];

export const DEFAULT_SPF_ADDON_PRICES: Record<string, Partial<Record<PublicVehiclePriceKey, number | null>>> = {
    spf80: { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largesuv: 20999, highend: null },
    spf89: { hatchback: 14999, sedan: 15999, midsized: 17499, suv: 18999, pickup: 17499, largesuv: 22999, highend: 23999 },
    spf99: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largesuv: 27999, highend: 28999 },
    spf101: { hatchback: null, sedan: null, midsized: null, suv: null, pickup: null, largesuv: null, highend: null },
};

export const DEFAULT_SPF_BASE_PRICES: Record<string, Partial<Record<PublicVehiclePriceKey, number | null>>> = {
    spf80: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largesuv: 12999, highend: null },
    spf89: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largesuv: 14999, highend: 17999 },
    spf99: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largesuv: 19999, highend: 22999 },
    spf101: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largesuv: 49999, highend: 49999 },
};

export const DEFAULT_SPF_ORIGINAL_PRICES: Record<string, Partial<Record<PublicVehiclePriceKey, number | null>>> = {
    spf80: { hatchback: 14000, sedan: 16000, midsized: 18000, suv: 18000, pickup: 17000, largesuv: 26000, highend: null },
    spf89: { hatchback: 18000, sedan: 20000, midsized: 22000, suv: 24000, pickup: 22000, largesuv: 30000, highend: 36000 },
    spf99: { hatchback: 28000, sedan: 28000, midsized: 32000, suv: 34000, pickup: 32000, largesuv: 40000, highend: 46000 },
    spf101: { hatchback: 80000, sedan: 80000, midsized: 94000, suv: 94000, pickup: 94000, largesuv: 100000, highend: 100000 },
};

export const toApiVehicleKey = (key: string): ApiVehiclePriceKey | null => {
    const match = VEHICLE_PRICE_FIELDS.find((field) => field.apiKey === key || field.publicKey === key);
    return match?.apiKey || null;
};

export const toPublicVehicleKey = (key: string): PublicVehiclePriceKey | null => {
    const match = VEHICLE_PRICE_FIELDS.find((field) => field.apiKey === key || field.publicKey === key);
    return match?.publicKey || null;
};

export const getServiceId = (service: PublishedServicePricingSource) => service.id || service._id || '';

export const toFinitePrice = (value: unknown): number | null => {
    if (value === undefined || value === null || value === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
};

export const getServicePricingEntry = (
    service: PublishedServicePricingSource | undefined,
    vehicleKey: PublicVehiclePriceKey | ApiVehiclePriceKey,
): ServicePricingEntry => {
    const publicKey = toPublicVehicleKey(vehicleKey) || 'sedan';
    const apiKey = toApiVehicleKey(vehicleKey) || 'sedan';
    const richPricing = service?.pricing?.[apiKey] || service?.pricing?.[publicKey];
    const legacyPrice = service?.prices?.[publicKey] ?? service?.prices?.[apiKey as keyof typeof service.prices];
    const basePrice = richPricing?.base ?? legacyPrice ?? (publicKey === 'hatchback' ? service?.basePrice : null);

    return {
        base: toFinitePrice(basePrice),
        original: toFinitePrice(richPricing?.original),
        addon: toFinitePrice(richPricing?.addon),
    };
};

export const getPackageKeyFromName = (name?: string | null): string | null => {
    if (!name) return null;
    const match = name.toLowerCase().match(/spf\s*[-_]*(80|89|99|101)/i);
    return match ? `spf${match[1]}` : null;
};

export const findPublishedServiceForPackage = (
    services: PublishedServicePricingSource[],
    packageId: string,
    packageName?: string,
) => {
    const desiredKey = packageId || getPackageKeyFromName(packageName);
    return services.find((service) => getPackageKeyFromName(service.name) === desiredKey);
};

export const getDefaultOriginalPrice = (
    base: number | null | undefined,
    packageKey?: string | null,
    vehicleKey?: PublicVehiclePriceKey | null,
) => {
    if (packageKey && vehicleKey && packageKey in DEFAULT_SPF_ORIGINAL_PRICES) {
        return DEFAULT_SPF_ORIGINAL_PRICES[packageKey]?.[vehicleKey] ?? null;
    }
    return base != null ? base * 2 : null;
};

export const getDefaultBasePrice = (
    packageKey: string | null | undefined,
    vehicleKey: PublicVehiclePriceKey,
) => {
    if (!packageKey) return null;
    return DEFAULT_SPF_BASE_PRICES[packageKey]?.[vehicleKey] ?? null;
};

export const getDefaultAddonPrice = (
    packageKey: string | null | undefined,
    vehicleKey: PublicVehiclePriceKey,
) => {
    if (!packageKey) return null;
    return DEFAULT_SPF_ADDON_PRICES[packageKey]?.[vehicleKey] ?? null;
};

export function mergeBookingPackagesWithPublishedServices<
    T extends { id: string; name: string; prices: Record<PublicVehiclePriceKey, number | null> },
>(packages: T[], services: PublishedServicePricingSource[]): T[] {
    if (!services.length) return packages;

    return packages.map((pkg) => {
        const service = findPublishedServiceForPackage(services, pkg.id, pkg.name);
        if (!service) return pkg;

        const prices = { ...pkg.prices };
        VEHICLE_PRICE_FIELDS.forEach(({ publicKey }) => {
            const entry = getServicePricingEntry(service, publicKey);
            if (entry.base != null) {
                prices[publicKey] = entry.base;
            }
        });

        return { ...pkg, prices };
    });
}
