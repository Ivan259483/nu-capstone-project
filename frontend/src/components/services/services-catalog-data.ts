import type { LucideIcon } from 'lucide-react';
import { Crown, Shield, Sparkles, Star, Zap } from 'lucide-react';
import {
    DEFAULT_SPF_ADDON_PRICES,
    DEFAULT_SPF_BASE_PRICES,
    DEFAULT_SPF_ORIGINAL_PRICES,
    VEHICLE_PRICE_FIELDS,
    findPublishedServiceForPackage,
    getServicePricingEntry,
    type PublishedServicePricingSource,
    type ServiceCatalogCard,
} from '@/lib/service-pricing';

export type VehicleType = 'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largesuv' | 'highend';

type PriceMap = Record<VehicleType, number | null>;

export interface SPFPackage {
    key: string;
    label: string;
    years: string;
    yearsNum: number;
    badge: string;
    tier: string;
    accentFrom: string;
    accentTo: string;
    accentMid: string;
    prices: PriceMap;
    tintPrices: PriceMap;
    originalPrices?: PriceMap;
    originalPriceMultiplier: number;
    features: string[];
    highlighted: string[];
    popular: boolean;
    flagship: boolean;
    icon: LucideIcon;
    tagline: string;
    addonLabel?: string;
    discountBadge?: string;
}

const getBasePrices = (packageKey: string): PriceMap => ({ ...DEFAULT_SPF_BASE_PRICES[packageKey] } as PriceMap);
const getTintPrices = (packageKey: string): PriceMap => ({ ...DEFAULT_SPF_ADDON_PRICES[packageKey] } as PriceMap);
const getOriginalPrices = (packageKey: string): PriceMap => ({ ...DEFAULT_SPF_ORIGINAL_PRICES[packageKey] } as PriceMap);

export const spfPackages: SPFPackage[] = [
    {
        key: 'spf80',
        label: 'SPF 80',
        years: '3 Years',
        yearsNum: 3,
        badge: 'SPECIAL OFFER',
        tier: 'Essential',
        accentFrom: '#38bdf8',
        accentTo: '#0284c7',
        accentMid: '#0ea5e9',
        tagline: 'Perfect entry-level protection',
        prices: getBasePrices('spf80'),
        tintPrices: getTintPrices('spf80'),
        originalPrices: getOriginalPrices('spf80'),
        originalPriceMultiplier: 2,
        features: [
            '3 Layers of Graphene Ceramic Coating (Made in Canada)',
            'Graphene Sealant',
            'FREE 1 visit Signature AUTOSPF Carwash',
        ],
        highlighted: [],
        popular: false,
        flagship: false,
        icon: Sparkles,
    },
    {
        key: 'spf89',
        label: 'SPF 89',
        years: '5 Years',
        yearsNum: 5,
        badge: 'RECOMMENDED',
        tier: 'Advanced',
        accentFrom: '#34d399',
        accentTo: '#059669',
        accentMid: '#10b981',
        tagline: 'Our most chosen package',
        prices: getBasePrices('spf89'),
        tintPrices: getTintPrices('spf89'),
        originalPrices: getOriginalPrices('spf89'),
        originalPriceMultiplier: 2,
        features: [
            '4 Layers of Graphene Ceramic Coating (Made in Canada)',
            'Graphene Sealant',
            'FREE 1 visit Reboost/Maintenance (save ₱1,500)',
        ],
        highlighted: ['4 Layers'],
        popular: true,
        flagship: false,
        icon: Shield,
    },
    {
        key: 'spf99',
        label: 'SPF 99',
        years: '10 Years',
        yearsNum: 10,
        badge: '50% OFF PROMO',
        tier: 'Premium',
        accentFrom: '#fbbf24',
        accentTo: '#d97706',
        accentMid: '#f59e0b',
        tagline: 'Maximum protection, best price-to-value',
        prices: getBasePrices('spf99'),
        tintPrices: getTintPrices('spf99'),
        originalPrices: getOriginalPrices('spf99'),
        originalPriceMultiplier: 2,
        features: [
            '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
            'FREE Full Recoat After 5 Years',
            'FREE 2 visits Reboost/Maintenance (save ₱3,000)',
        ],
        highlighted: ['SONAX Profiline CC EVO', 'Full Recoat'],
        popular: false,
        flagship: false,
        icon: Star,
    },
    {
        key: 'spf101',
        label: 'SPF 101',
        years: '10 Years',
        yearsNum: 10,
        badge: 'ALL-IN PACKAGE',
        tier: 'Ultimate',
        accentFrom: '#c084fc',
        accentTo: '#7c3aed',
        accentMid: '#a78bfa',
        tagline: 'The complete transformation experience',
        prices: getBasePrices('spf101'),
        tintPrices: getTintPrices('spf101'),
        originalPrices: getOriginalPrices('spf101'),
        originalPriceMultiplier: 2,
        features: [
            'Paint Protection Film PPF Install on: Hood, Front Bumper, Stepsils, Door Bowls, Side Mirrors, Headlight & Taillight',
            '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
            'FREE 5 visits Reboost/Maintenance (save ₱7,500)',
            'FREE Full Recoat After 5 Years',
            'Nano Ceramic Window Tint (Full Wrap — Any Shades)',
            'FREE UnderCoating (Rust Proofing) (save ₱14,000)',
        ],
        highlighted: ['PPF', 'SONAX', 'Nano Ceramic Window Tint', 'UnderCoating'],
        popular: false,
        flagship: true,
        icon: Crown,
    },
];

export const CATALOG_ICON_KEYS = {
    sparkles: Sparkles,
    shield: Shield,
    star: Star,
    crown: Crown,
    zap: Zap,
} as const;

export function applyCatalogCardToPackage(pkg: SPFPackage, card: ServiceCatalogCard | null | undefined): SPFPackage {
    if (!card || typeof card !== 'object') return pkg;

    const iconKey =
        card.iconKey && card.iconKey in CATALOG_ICON_KEYS ? (card.iconKey as keyof typeof CATALOG_ICON_KEYS) : null;
    const NextIcon = iconKey ? CATALOG_ICON_KEYS[iconKey] : pkg.icon;

    const next: SPFPackage = {
        ...pkg,
        icon: NextIcon,
    };

    if (card.badge != null && String(card.badge).trim() !== '') next.badge = String(card.badge).trim();
    if (card.warrantyLabel != null && String(card.warrantyLabel).trim() !== '') next.years = String(card.warrantyLabel).trim();
    if (card.tagline != null && String(card.tagline).trim() !== '') next.tagline = String(card.tagline).trim();
    if (card.tierLabel != null && String(card.tierLabel).trim() !== '') next.tier = String(card.tierLabel).trim();
    if (Array.isArray(card.features) && card.features.length > 0) {
        next.features = card.features.map((f) => String(f).trim()).filter(Boolean);
    }
    if (Array.isArray(card.highlighted) && card.highlighted.length > 0) {
        next.highlighted = card.highlighted.map((f) => String(f).trim()).filter(Boolean);
    }
    if (card.addonLabel != null && String(card.addonLabel).trim() !== '') {
        next.addonLabel = String(card.addonLabel).trim();
    }
    if (card.discountBadge != null && String(card.discountBadge).trim() !== '') {
        next.discountBadge = String(card.discountBadge).trim();
    }
    if (card.accentFrom != null && String(card.accentFrom).trim() !== '') next.accentFrom = String(card.accentFrom).trim();
    if (card.accentTo != null && String(card.accentTo).trim() !== '') next.accentTo = String(card.accentTo).trim();
    if (card.accentMid != null && String(card.accentMid).trim() !== '') next.accentMid = String(card.accentMid).trim();
    if (typeof card.popular === 'boolean') next.popular = card.popular;
    if (typeof card.flagship === 'boolean') next.flagship = card.flagship;
    if (card.originalPriceMultiplier != null && Number.isFinite(Number(card.originalPriceMultiplier))) {
        next.originalPriceMultiplier = Number(card.originalPriceMultiplier);
    }

    return next;
}

export function mergePublishedPricingIntoPackages(
    packages: SPFPackage[],
    services: PublishedServicePricingSource[],
): SPFPackage[] {
    if (!services.length) return packages;

    return packages.map((pkg) => {
        const service = findPublishedServiceForPackage(services, pkg.key, pkg.label);
        if (!service) return pkg;

        const prices = { ...pkg.prices };
        const tintPrices = { ...pkg.tintPrices };
        const originalPrices: PriceMap = {
            hatchback: null,
            sedan: null,
            midsized: null,
            suv: null,
            pickup: null,
            largesuv: null,
            highend: null,
            ...(pkg.originalPrices || {}),
        };

        VEHICLE_PRICE_FIELDS.forEach(({ publicKey }) => {
            const entry = getServicePricingEntry(service, publicKey);
            if (entry.base != null) prices[publicKey] = entry.base;
            if (entry.addon != null) tintPrices[publicKey] = entry.addon;
            if (entry.original != null) originalPrices[publicKey] = entry.original;
        });

        const withPricing = { ...pkg, prices, tintPrices, originalPrices };
        return applyCatalogCardToPackage(withPricing, service.catalogCard);
    });
}
