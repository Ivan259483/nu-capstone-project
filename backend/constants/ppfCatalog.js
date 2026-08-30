export const PPF_VEHICLE_GROUPS = Object.freeze([
  { code: 'SEDAN_HATCH', label: 'Sedan / Hatch' },
  { code: 'CROSSOVER', label: 'Crossover' },
  { code: 'SUV_PICKUP', label: 'SUV / Pickup' },
  { code: 'FULL_SIZE_SUV', label: 'Full Size SUV' },
]);

export const PPF_BRANDS = Object.freeze([
  {
    code: 'POSTER_BRAND_1',
    name: null,
    nameVerification: 'UNRESOLVED_POSTER_LOGO',
  },
  { code: 'XPEL', name: 'XPEL', nameVerification: 'VERIFIED_TEXT_BRIEF' },
  { code: 'VINYL_FROG', name: 'Vinyl Frog', nameVerification: 'VERIFIED_TEXT_BRIEF' },
  { code: 'ZIVENT', name: 'Zivent', nameVerification: 'VERIFIED_TEXT_BRIEF' },
]);

export const PPF_FULL_WRAP_PRICING = Object.freeze({
  SEDAN_HATCH: Object.freeze({ POSTER_BRAND_1: 75000, XPEL: 80000, VINYL_FROG: 90000, ZIVENT: 120000 }),
  CROSSOVER: Object.freeze({ POSTER_BRAND_1: 80000, XPEL: 85000, VINYL_FROG: 95000, ZIVENT: 135000 }),
  SUV_PICKUP: Object.freeze({ POSTER_BRAND_1: 85000, XPEL: 90000, VINYL_FROG: 100000, ZIVENT: 140000 }),
  FULL_SIZE_SUV: Object.freeze({ POSTER_BRAND_1: 100000, XPEL: 110000, VINYL_FROG: 120000, ZIVENT: 150000 }),
});

export const PPF_SPECIFICATIONS = Object.freeze({
  thickness: Object.freeze({ POSTER_BRAND_1: '7.0 mils', XPEL: '7.5 mils', VINYL_FROG: '7.5 mils', ZIVENT: '8.0 mils' }),
  warranty: Object.freeze({ POSTER_BRAND_1: '5 Years', XPEL: '6 Years', VINYL_FROG: '8 Years', ZIVENT: '10 Years' }),
  freePanelReplacement: Object.freeze({ POSTER_BRAND_1: '2 panels', XPEL: '2 panels', VINYL_FROG: '2 panels', ZIVENT: 'None' }),
  selfHealing: null,
  hydrophobicity: null,
  glossFinish: null,
  stainResistance: null,
  punctureResistance: null,
});

export const PPF_CATALOG_VERIFICATION = Object.freeze({
  fullWrapPricing: 'VERIFIED_TEXT_BRIEF',
  numericSpecifications: 'VERIFIED_TEXT_BRIEF',
  firstBrandName: 'UNRESOLVED_MISSING_IMAGE',
  starRatings: 'UNRESOLVED_MISSING_IMAGE',
});

export const PPF_FULL_WRAP_CATALOG = Object.freeze({
  scope: 'FULL_VEHICLE_WRAP',
  separateFromPackageCode: 'SPF101',
  vehicleGroups: PPF_VEHICLE_GROUPS,
  brands: PPF_BRANDS,
  pricing: PPF_FULL_WRAP_PRICING,
  specifications: PPF_SPECIFICATIONS,
  verification: PPF_CATALOG_VERIFICATION,
});
