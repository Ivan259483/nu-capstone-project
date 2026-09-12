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
    { apiKey: 'midsized', publicKey: 'midsized', label: 'Midsize', compactLabel: 'Midsize' },
    { apiKey: 'suv', publicKey: 'suv', label: 'SUV', compactLabel: 'SUV' },
    { apiKey: 'pickup', publicKey: 'pickup', label: 'Pickup', compactLabel: 'Pickup' },
    { apiKey: 'largeSuv', publicKey: 'largesuv', label: 'Large SUV / Van', compactLabel: 'Large SUV / Van' },
    { apiKey: 'highend', publicKey: 'highend', label: 'High-end Sedan', compactLabel: 'High-end Sedan' },
];

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
    const publicKey = toPublicVehicleKey(vehicleKey);
    const apiKey = toApiVehicleKey(vehicleKey);
    if (!publicKey || !apiKey) return { base: null, original: null, addon: null };
    const richPricing = service?.pricing?.[apiKey] || service?.pricing?.[publicKey];
    const legacyPrice = service?.prices?.[publicKey] ?? service?.prices?.[apiKey as keyof typeof service.prices];
    const basePrice = richPricing?.base ?? legacyPrice;

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

export function mergeBookingPackagesWithPublishedServices<
    T extends { id: string; name: string; prices: Record<PublicVehiclePriceKey, number | null> },
>(packages: T[], services: PublishedServicePricingSource[]): T[] {
    return packages.map((pkg) => {
        const service = findPublishedServiceForPackage(services, pkg.id, pkg.name);
        if (!service) {
            return {
                ...pkg,
                prices: Object.fromEntries(
                    VEHICLE_PRICE_FIELDS.map(({ publicKey }) => [publicKey, null]),
                ) as Record<PublicVehiclePriceKey, number | null>,
            };
        }

        const prices = { ...pkg.prices };
        VEHICLE_PRICE_FIELDS.forEach(({ publicKey }) => {
            const entry = getServicePricingEntry(service, publicKey);
            prices[publicKey] = entry.base;
        });

        return { ...pkg, prices };
    });
}
