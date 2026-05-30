export const VEHICLE_PRICE_FIELDS = [
  { apiKey: 'hatchback', legacyKey: 'hatchback', label: 'Hatchback' },
  { apiKey: 'sedan', legacyKey: 'sedan', label: 'Sedan' },
  { apiKey: 'midsized', legacyKey: 'midsized', label: 'Midsized' },
  { apiKey: 'suv', legacyKey: 'suv', label: 'SUV' },
  { apiKey: 'pickup', legacyKey: 'pickup', label: 'Pick Up' },
  { apiKey: 'largeSuv', legacyKey: 'largesuv', label: 'Large SUV / Van' },
  { apiKey: 'highend', legacyKey: 'highend', label: 'Highend Sedan' },
];

export const SPF_PACKAGE_PRICING = {
  spf80: {
    name: 'SPF 80 — Essential',
    category: 'Exterior',
    description: '3 Layers of Graphene Ceramic Coating (Made in Canada) with Graphene Sealant. 3 years protection.',
    duration: '2-3 hours',
    displayOrder: 1,
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
    base: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largeSuv: 19999, highend: 22999 },
    original: { hatchback: 28000, sedan: 28000, midsized: 32000, suv: 34000, pickup: 32000, largeSuv: 40000, highend: 46000 },
    addon: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largeSuv: 27999, highend: 28999 },
  },
  spf101: {
    name: 'SPF 101 — Flagship ALL-IN',
    category: 'Premium',
    description: 'PPF + SONAX CC EVO + Nano Ceramic Tint + Undercoating — the ultimate 10-year package.',
    duration: '6-8 hours',
    displayOrder: 4,
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
