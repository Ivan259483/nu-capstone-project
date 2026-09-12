import type { LucideIcon } from 'lucide-react';
import { Crown, Shield, Sparkles, Star, Zap } from 'lucide-react';
import {
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
    features: string[];
    highlighted: string[];
    popular: boolean;
    flagship: boolean;
    icon: LucideIcon;
    tagline: string;
    addonLabel?: string;
    discountBadge?: string;
}

const emptyPriceMap = (): PriceMap => ({
    hatchback: null,
    sedan: null,
    midsized: null,
    suv: null,
    pickup: null,
    largesuv: null,
    highend: null,
});

export const spfPackages: SPFPackage[] = [
    {
        key: 'spf80',
        label: 'SPF 80',
        years: '3 Years',
        yearsNum: 3,
        badge: 'SPECIAL OFFER',
        tier: 'Essential',
        accentFrom: '#A69F93',
        accentTo: '#746F67',
        accentMid: '#8A8378',
        tagline: 'Perfect entry-level protection',
        prices: emptyPriceMap(),
        tintPrices: emptyPriceMap(),
        originalPrices: emptyPriceMap(),
        features: [
            '3 Layers of Graphene Ceramic Coating (Made in Canada)',
            'Graphene Sealant',
            'FREE 1 visit Signature AutoSPF Carwash',
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
        accentFrom: '#F4B63D',
        accentTo: '#D58A12',
        accentMid: '#E6A321',
        tagline: 'Our most chosen package',
        prices: emptyPriceMap(),
        tintPrices: emptyPriceMap(),
        originalPrices: emptyPriceMap(),
        features: [
            '4 Layers of Graphene Ceramic Coating (Made in Canada)',
            'Graphene Sealant',
            'FREE 1 visit Reboost / Maintenance (Save ₱1,500)',
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
        badge: 'PREMIUM',
        tier: 'Premium',
        accentFrom: '#A69F93',
        accentTo: '#746F67',
        accentMid: '#8A8378',
        tagline: 'Maximum protection, best price-to-value',
        prices: emptyPriceMap(),
        tintPrices: emptyPriceMap(),
        originalPrices: emptyPriceMap(),
        features: [
            '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
            'FREE Full Recoat After 5 Years',
            'FREE 2 visits Reboost / Maintenance (Save ₱3,000)',
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
        tier: 'Flagship',
        accentFrom: '#A69F93',
        accentTo: '#746F67',
        accentMid: '#8A8378',
        tagline: 'The complete transformation experience',
        prices: emptyPriceMap(),
        tintPrices: emptyPriceMap(),
        originalPrices: emptyPriceMap(),
        features: [
            'PPF installation on specified areas: Hood, Front Bumper, Stepsills, Door Bowls, Side Mirrors, Headlight & Taillight',
            '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
            'FREE 5 visits Reboost / Maintenance (Save ₱7,500)',
            'FREE Full Recoat After 5 Years',
            'Nano Ceramic Window Tint (Full Wrap — Any Shades)',
            'FREE Undercoating / Rust Proofing (Save ₱14,000)',
        ],
        highlighted: ['PPF', 'SONAX', 'Nano Ceramic Window Tint', 'Undercoating'],
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
    return next;
}

export function mergePublishedPricingIntoPackages(
    packages: SPFPackage[],
    services: PublishedServicePricingSource[],
): SPFPackage[] {
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
            prices[publicKey] = entry.base;
            tintPrices[publicKey] = entry.addon;
            originalPrices[publicKey] = entry.original;
        });

        const withPricing = { ...pkg, prices, tintPrices, originalPrices };
        return applyCatalogCardToPackage(withPricing, service.catalogCard);
    });
}
