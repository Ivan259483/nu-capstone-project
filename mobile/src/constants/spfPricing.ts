export type VehicleTypeKey = 'hatchback' | 'sedan' | 'midsized' | 'suv' | 'pickup' | 'largesuv' | 'highend';

export type SPFPackageKey = 'spf80' | 'spf89' | 'spf99' | 'spf101';

export const SPF_BASE_PRICES: Record<SPFPackageKey, Record<VehicleTypeKey, number | null>> = {
  spf80: { hatchback: 7499, sedan: 7999, midsized: 7999, suv: 8999, pickup: 8499, largesuv: 12999, highend: null },
  spf89: { hatchback: 8999, sedan: 9999, midsized: 10999, suv: 11999, pickup: 10999, largesuv: 14999, highend: 17999 },
  spf99: { hatchback: 13999, sedan: 13999, midsized: 15999, suv: 16999, pickup: 15999, largesuv: 19999, highend: 22999 },
  spf101: { hatchback: 39999, sedan: 39999, midsized: 46999, suv: 46999, pickup: 46999, largesuv: 49999, highend: 49999 },
};

export const SPF_TINT_PRICES: Record<SPFPackageKey, Record<VehicleTypeKey, number | null>> = {
  spf80: { hatchback: 13499, sedan: 13499, midsized: 14499, suv: 15999, pickup: 14499, largesuv: 20999, highend: null },
  spf89: { hatchback: 14999, sedan: 15999, midsized: 17499, suv: 18999, pickup: 17499, largesuv: 22999, highend: 23999 },
  spf99: { hatchback: 19999, sedan: 19999, midsized: 22499, suv: 23999, pickup: 22499, largesuv: 27999, highend: 28999 },
  spf101: { hatchback: null, sedan: null, midsized: null, suv: null, pickup: null, largesuv: null, highend: null },
};

export const formatPesoOrNA = (price: number | null | undefined) =>
  price == null ? 'N/A' : `₱${price.toLocaleString('en-PH')}`;
