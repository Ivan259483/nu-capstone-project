export const VEHICLE_PRICE_FIELDS = [
  { apiKey: 'hatchback', legacyKey: 'hatchback', label: 'Hatchback' },
  { apiKey: 'sedan', legacyKey: 'sedan', label: 'Sedan' },
  { apiKey: 'midsized', legacyKey: 'midsized', label: 'Midsized' },
  { apiKey: 'suv', legacyKey: 'suv', label: 'SUV' },
  { apiKey: 'pickup', legacyKey: 'pickup', label: 'Pick Up' },
  { apiKey: 'largeSuv', legacyKey: 'largesuv', label: 'Large SUV / Van' },
  { apiKey: 'highend', legacyKey: 'highend', label: 'High-end Sedan' },
];

export const SPF_PACKAGE_PRICING = {
  spf80: {
    name: 'SPF 80 — Essential',
    category: 'Exterior',
    description: '3 Layers of Graphene Ceramic Coating (Made in Canada) with Graphene Sealant. 3 years protection.',
    duration: '2-3 hours',
    displayOrder: 1,
    catalogCard: {
      badge: 'SPECIAL OFFER',
      warrantyLabel: '3 Years Protection',
      tagline: 'Perfect entry-level protection',
      tierLabel: 'Essential',
      features: [
        '3 Layers of Graphene Ceramic Coating (Made in Canada)',
        'Graphene Sealant',
        '1 Signature AutoSPF Carwash',
      ],
      fullInclusions: [
        { group: 'Ceramic Protection', title: '3 Layers of Graphene Ceramic Coating', detail: 'Made in Canada' },
        { group: 'Ceramic Protection', title: 'Graphene Sealant' },
        { group: 'Maintenance', title: '1 Signature AutoSPF Carwash', detail: 'Included' },
      ],
      highlighted: [],
      addonLabel: 'Nano Ceramic Window Tint',
      iconKey: 'sparkles',
      popular: false,
      flagship: false,
    },
    base: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largeSuv: 12999, highend: null },
    original: { hatchback: 14000, sedan: 16000, midsized: 18000, suv: 18000, pickup: 17000, largeSuv: 26000, highend: null },
    addon: { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largeSuv: 20999, highend: null },
  },
  spf89: {
    name: 'SPF 89 — Advanced',
    category: 'Exterior',
    description: '4 Layers of Graphene Ceramic Coating (Made in Canada) with free maintenance visit. 5 years protection.',
    duration: '3-4 hours',
    displayOrder: 2,
    catalogCard: {
      badge: 'RECOMMENDED',
      warrantyLabel: '5 Years Protection',
      tagline: 'Our most chosen package',
      tierLabel: 'Advanced',
      features: [
        '4 Layers of Graphene Ceramic Coating (Made in Canada)',
        'Graphene Sealant',
        '1 Reboost / Maintenance Visit (Save ₱1,500)',
      ],
      fullInclusions: [
        { group: 'Ceramic Protection', title: '4 Layers of Graphene Ceramic Coating', detail: 'Made in Canada' },
        { group: 'Ceramic Protection', title: 'Graphene Sealant' },
        { group: 'Maintenance', title: '1 Reboost / Maintenance Visit', detail: 'Included', savingsLabel: 'Save ₱1,500' },
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
    name: 'SPF 99 — Premium',
    category: 'Premium',
    description: '4 Layers of SONAX Profiline CC EVO (Made in Germany) with free recoat and maintenance. 10 years protection.',
    duration: '4-6 hours',
    displayOrder: 3,
    catalogCard: {
      badge: 'PREMIUM',
      warrantyLabel: '10 Years Protection',
      tagline: 'Maximum protection, best price-to-value',
      tierLabel: 'Premium',
      features: [
        '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
        'Full Recoat After 5 Years',
        '2 Reboost / Maintenance Visits (Save ₱3,000)',
      ],
      fullInclusions: [
        { group: 'Ceramic Protection', title: '4 Layers of SONAX Profiline CC EVO', detail: 'Made in Germany' },
        { group: 'Ceramic Protection', title: 'Full Recoat After 5 Years', detail: 'Included' },
        { group: 'Maintenance', title: '2 Reboost / Maintenance Visits', detail: 'Included', savingsLabel: 'Save ₱3,000' },
      ],
      highlighted: ['SONAX Profiline CC EVO', 'Full Recoat'],
      addonLabel: 'Nano Ceramic Window Tint',
      iconKey: 'star',
      popular: false,
      flagship: false,
    },
    base: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largeSuv: 19999, highend: 22999 },
    original: { hatchback: 28000, sedan: 28000, midsized: 32000, suv: 34000, pickup: 32000, largeSuv: 40000, highend: 46000 },
    addon: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largeSuv: 27999, highend: 28999 },
  },
  spf101: {
    name: 'SPF 101 — Flagship',
    category: 'Premium',
    description: 'PPF + SONAX CC EVO + Nano Ceramic Tint + Undercoating — the ultimate 10-year package.',
    duration: '6-8 hours',
    displayOrder: 4,
    catalogCard: {
      badge: 'ALL-IN PACKAGE',
      warrantyLabel: '10 Years Protection',
      tagline: 'The complete transformation experience',
      tierLabel: 'Flagship',
      features: [
        'Paint Protection Film (PPF) Installation',
        '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
        'Full Recoat After 5 Years',
        '5 Reboost / Maintenance Visits (Save ₱7,500)',
        'Nano Ceramic Window Tint (Full Wrap — Any Shades)',
        'Undercoating / Rust Proofing (Save ₱14,000)',
      ],
      fullInclusions: [
        { group: 'Paint Protection Film', title: 'Paint Protection Film (PPF) Installation', detail: 'High-impact exterior areas' },
        { group: 'Ceramic Protection', title: '4 Layers of SONAX Profiline CC EVO', detail: 'Made in Germany' },
        { group: 'Ceramic Protection', title: 'Full Recoat After 5 Years', detail: 'Included' },
        { group: 'Maintenance', title: '5 Reboost / Maintenance Visits', detail: 'Included', savingsLabel: 'Save ₱7,500' },
        { group: 'Window Protection', title: 'Nano Ceramic Window Tint', detail: 'Full Wrap · Any Shades' },
        { group: 'Underbody Protection', title: 'Undercoating / Rust Proofing', detail: 'Included', savingsLabel: 'Save ₱14,000' },
      ],
      highlighted: ['PPF', 'SONAX', 'Nano Ceramic Window Tint', 'Undercoating'],
      ppfCoverage: ['Hood', 'Front Bumper', 'Stepsills', 'Door Bowls', 'Side Mirrors', 'Headlights', 'Taillights'],
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
