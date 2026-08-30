import {
  VEHICLE_PRICING_CATEGORIES,
  VEHICLE_PRICING_CATEGORY,
  getVehiclePricingApiKey,
} from './pricingCategories.js';

export const SPF_CATALOG_VERSION = '2026-08-30-official-posters-v1';

export const VEHICLE_PRICE_FIELDS = VEHICLE_PRICING_CATEGORIES.map((category) => ({
  code: category.code,
  apiKey: category.apiKey,
  legacyKey: category.legacyKey,
  label: category.label,
}));

export const UNDERCOATING_PRICING = Object.freeze({
  [VEHICLE_PRICING_CATEGORY.HATCHBACK_SMALL_CAR]: 6000,
  [VEHICLE_PRICING_CATEGORY.SEDAN]: 6500,
  [VEHICLE_PRICING_CATEGORY.MIDSIZED]: 7000,
  [VEHICLE_PRICING_CATEGORY.SUV]: 7500,
  [VEHICLE_PRICING_CATEGORY.PICKUP]: 7500,
  [VEHICLE_PRICING_CATEGORY.LARGE_SUV_VAN]: 9000,
  [VEHICLE_PRICING_CATEGORY.HIGH_END_SEDAN]: 8000,
});

export const SPF_PACKAGE_PRICING = {
  spf80: {
    packageCode: 'SPF80',
    tier: 'Essential',
    protectionYears: 3,
    name: 'SPF 80 — Essential',
    category: 'Exterior',
    description: '3 Layers of Graphene Ceramic Coating (Made in Canada) with Graphene Sealant. 3 years protection.',
    duration: '2-3 hours',
    durationNeedsClientVerification: true,
    displayOrder: 1,
    catalogCard: {
      badge: 'SPECIAL OFFER',
      warrantyLabel: '3 Years Protection',
      tagline: 'Perfect entry-level protection',
      tierLabel: 'Essential',
      features: [
        '3 Layers of Graphene Ceramic Coating (Made in Canada)',
        'Graphene Sealant',
        'FREE 1 visit Signature AutoSPF Carwash',
      ],
      fullInclusions: [
        { group: 'Ceramic Protection', title: '3 Layers of Graphene Ceramic Coating', detail: 'Made in Canada' },
        { group: 'Ceramic Protection', title: 'Graphene Sealant' },
        { group: 'Maintenance', title: 'FREE 1 visit Signature AutoSPF Carwash', detail: 'Included' },
      ],
      highlighted: [],
      addonLabel: 'Nano Ceramic Window Tint',
      iconKey: 'sparkles',
      popular: false,
      flagship: false,
    },
    base: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largeSuv: 12999, highend: null },
    original: { hatchback: 14000, sedan: 16000, midsized: 18000, suv: 16000, pickup: 17000, largeSuv: 26000, highend: null },
    addon: { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largeSuv: 20999, highend: null },
  },
  spf89: {
    packageCode: 'SPF89',
    tier: 'Advanced',
    protectionYears: 5,
    name: 'SPF 89 — Advanced',
    category: 'Exterior',
    description: '4 Layers of Graphene Ceramic Coating (Made in Canada) with free maintenance visit. 5 years protection.',
    duration: '3-4 hours',
    durationNeedsClientVerification: true,
    displayOrder: 2,
    catalogCard: {
      badge: 'RECOMMENDED',
      warrantyLabel: '5 Years Protection',
      tagline: 'Our most chosen package',
      tierLabel: 'Advanced',
      features: [
        '4 Layers of Graphene Ceramic Coating (Made in Canada)',
        'Graphene Sealant',
        'FREE 1 visit Reboost / Maintenance (Save ₱1,500)',
      ],
      fullInclusions: [
        { group: 'Ceramic Protection', title: '4 Layers of Graphene Ceramic Coating', detail: 'Made in Canada' },
        { group: 'Ceramic Protection', title: 'Graphene Sealant' },
        { group: 'Maintenance', title: 'FREE 1 visit Reboost / Maintenance', detail: 'Included', savingsLabel: 'Save ₱1,500' },
      ],
      highlighted: ['4 Layers'],
      addonLabel: 'Nano Ceramic Window Tint',
      iconKey: 'shield',
      popular: true,
      flagship: false,
    },
    base: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largeSuv: 14999, highend: 17999 },
    original: { hatchback: 18000, sedan: 20000, midsized: 22000, suv: 24000, pickup: 22000, largeSuv: 30000, highend: 36000 },
    addon: { hatchback: 14999, sedan: 15999, midsized: 17499, suv: 18999, pickup: 17499, largeSuv: 22999, highend: 23999 },
  },
  spf99: {
    packageCode: 'SPF99',
    tier: 'Premium',
    protectionYears: 10,
    name: 'SPF 99 — Premium',
    category: 'Premium',
    description: '4 Layers of SONAX Profiline CC EVO (Made in Germany) with free recoat and maintenance. 10 years protection.',
    duration: '4-6 hours',
    durationNeedsClientVerification: true,
    displayOrder: 3,
    catalogCard: {
      badge: 'PREMIUM',
      warrantyLabel: '10 Years Protection',
      tagline: 'Maximum protection, best price-to-value',
      tierLabel: 'Premium',
      features: [
        '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
        'FREE Full Recoat After 5 Years',
        'FREE 2 visits Reboost / Maintenance (Save ₱3,000)',
      ],
      fullInclusions: [
        { group: 'Ceramic Protection', title: '4 Layers of SONAX Profiline CC EVO', detail: 'Made in Germany' },
        { group: 'Ceramic Protection', title: 'FREE Full Recoat After 5 Years', detail: 'Included' },
        { group: 'Maintenance', title: 'FREE 2 visits Reboost / Maintenance', detail: 'Included', savingsLabel: 'Save ₱3,000' },
      ],
      highlighted: ['SONAX Profiline CC EVO', 'Full Recoat'],
      addonLabel: 'Nano Ceramic Window Tint',
      iconKey: 'star',
      popular: false,
      flagship: false,
    },
    base: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largeSuv: 19999, highend: 22999 },
    original: { hatchback: 28000, sedan: 28000, midsized: 32000, suv: 34000, pickup: 32000, largeSuv: 40000, highend: 40000 },
    addon: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largeSuv: 27999, highend: 28999 },
  },
  spf101: {
    packageCode: 'SPF101',
    tier: 'Flagship',
    protectionYears: 10,
    name: 'SPF 101 — Flagship ALL-IN',
    category: 'Premium',
    description: 'PPF + SONAX CC EVO + Nano Ceramic Tint + Undercoating — the ultimate 10-year package.',
    duration: '6-8 hours',
    durationNeedsClientVerification: true,
    displayOrder: 4,
    catalogCard: {
      badge: 'ALL-IN PACKAGE',
      warrantyLabel: '10 Years Protection',
      tagline: 'The complete transformation experience',
      tierLabel: 'Flagship',
      features: [
        'PPF installation on specified front-facing areas',
        '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
        'FREE Full Recoat After 5 Years',
        'FREE 5 visits Reboost / Maintenance (Save ₱7,500)',
        'Nano Ceramic Window Tint (Full Wrap — Any Shades)',
        'FREE Undercoating / Rust Proofing (Save ₱14,000)',
      ],
      fullInclusions: [
        { group: 'Paint Protection Film', title: 'PPF installation on specified areas', detail: 'Front-facing areas listed below; not a full-vehicle wrap' },
        { group: 'Ceramic Protection', title: '4 Layers of SONAX Profiline CC EVO', detail: 'Made in Germany' },
        { group: 'Ceramic Protection', title: 'FREE Full Recoat After 5 Years', detail: 'Included' },
        { group: 'Maintenance', title: 'FREE 5 visits Reboost / Maintenance', detail: 'Included', savingsLabel: 'Save ₱7,500' },
        { group: 'Window Protection', title: 'Nano Ceramic Window Tint', detail: 'Full Wrap · Any Shades' },
        { group: 'Underbody Protection', title: 'FREE Undercoating / Rust Proofing', detail: 'Included', savingsLabel: 'Save ₱14,000' },
      ],
      highlighted: ['PPF', 'SONAX', 'Nano Ceramic Window Tint', 'Undercoating'],
      ppfCoverage: ['Hood', 'Front Bumper', 'Stepsills', 'Door Bowls', 'Side Mirrors', 'Headlight & Taillight'],
      tintIncluded: true,
      tintDetails: 'Full Wrap · Any Shades',
      undercoatingIncluded: true,
      undercoatingDetails: 'Undercoating / Rust Proofing',
      undercoatingSavingsLabel: 'Save ₱14,000',
      iconKey: 'crown',
      popular: false,
      flagship: true,
    },
    base: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largeSuv: 49999, highend: 49999 },
    original: { hatchback: 80000, sedan: 80000, midsized: 94000, suv: 94000, pickup: 94000, largeSuv: 100000, highend: 100000 },
    addon: { hatchback: null, sedan: null, midsized: null, suv: null, pickup: null, largeSuv: null, highend: null },
  },
};

export const buildLegacyPrices = (pkg) =>
  VEHICLE_PRICE_FIELDS.reduce((prices, field) => {
    prices[field.legacyKey] = pkg.base[field.apiKey] ?? null;
    return prices;
  }, {});

export const buildRichPricing = (pkg) =>
  VEHICLE_PRICE_FIELDS.reduce((pricing, field) => {
    pricing[field.apiKey] = {
      base: pkg.base[field.apiKey] ?? null,
      original: pkg.original[field.apiKey] ?? null,
      addon: pkg.addon[field.apiKey] ?? null,
    };
    return pricing;
  }, {});

export const getMinimumPackageBasePrice = (pkg) => {
  const values = Object.values(pkg.base).filter((value) => Number.isFinite(value));
  return values.length ? Math.min(...values) : 0;
};

export const getPackageKeyFromName = (name = '') => {
  const match = String(name).toLowerCase().match(/spf\s*[-_]*(80|89|99|101)/i);
  return match ? `spf${match[1]}` : null;
};

export const getPackageKeyFromCode = (packageCode = '') => {
  const match = String(packageCode).trim().toLowerCase().match(/^spf\s*[-_]*(80|89|99|101)$/i);
  return match ? `spf${match[1]}` : getPackageKeyFromName(packageCode);
};

export const getUndercoatingPrice = (vehiclePricingCategory) => {
  const category = String(vehiclePricingCategory || '').trim();
  const value = UNDERCOATING_PRICING[category];
  return Number.isFinite(value) ? value : null;
};

export const getCanonicalPricingEntry = (packageCode, vehiclePricingCategory) => {
  const packageKey = getPackageKeyFromCode(packageCode);
  const packageConfig = packageKey ? SPF_PACKAGE_PRICING[packageKey] : null;
  const apiKey = getVehiclePricingApiKey(vehiclePricingCategory);
  if (!packageConfig || !apiKey) return null;

  const promoPrice = packageConfig.base[apiKey] ?? null;
  const srp = packageConfig.original[apiKey] ?? null;
  const tintBundlePrice = packageConfig.addon[apiKey] ?? null;
  return {
    packageKey,
    packageCode: packageConfig.packageCode,
    vehiclePricingCategory: String(vehiclePricingCategory),
    available: Number.isFinite(promoPrice) && promoPrice > 0,
    promoPrice,
    srp,
    savings: Number.isFinite(promoPrice) && Number.isFinite(srp) ? srp - promoPrice : null,
    tintBundlePrice,
  };
};
