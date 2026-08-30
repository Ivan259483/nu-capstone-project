import {
  SPF_CATALOG_VERSION,
  SPF_PACKAGE_PRICING,
  getPackageKeyFromCode,
  getPackageKeyFromName,
  getUndercoatingPrice,
} from '../constants/spfPricing.js';
import {
  getVehiclePricingApiKey,
  getVehiclePricingLabel,
  normalizeVehiclePricingCategory,
} from '../constants/pricingCategories.js';

export const BOOKING_ADD_ON_CODE = Object.freeze({
  NANO_CERAMIC_TINT_BUNDLE: 'NANO_CERAMIC_TINT_BUNDLE',
  UNDERCOATING: 'UNDERCOATING',
});

export class ServicePricingError extends Error {
  constructor(code, message, statusCode = 409, details = {}) {
    super(message);
    this.name = 'ServicePricingError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

const finiteMoneyOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) / 100 : null;
};

const toPlainObject = (value) => value?.toObject?.() || value || {};

const getStoredPricingEntry = (service, apiKey) => {
  const raw = toPlainObject(service);
  const legacyKey = apiKey === 'largeSuv' ? 'largesuv' : apiKey;
  const rich = raw.pricing?.[apiKey] || {};
  const hasRichBase = Object.prototype.hasOwnProperty.call(rich, 'base');
  const hasLegacyBase = raw.prices && Object.prototype.hasOwnProperty.call(raw.prices, legacyKey);

  return {
    base: finiteMoneyOrNull(hasRichBase ? rich.base : (hasLegacyBase ? raw.prices[legacyKey] : null)),
    original: finiteMoneyOrNull(rich.original),
    addon: finiteMoneyOrNull(rich.addon),
  };
};

const getPackageConfig = (service, packageCode) => {
  const raw = toPlainObject(service);
  const packageKey = getPackageKeyFromCode(packageCode)
    || getPackageKeyFromCode(raw.packageCode)
    || getPackageKeyFromName(raw.name);
  return packageKey ? { packageKey, packageConfig: SPF_PACKAGE_PRICING[packageKey] } : null;
};

export const resolveServicePricing = ({
  vehiclePricingCategory,
  packageCode,
  service,
}) => {
  const normalizedCategory = normalizeVehiclePricingCategory(vehiclePricingCategory);
  if (!normalizedCategory) {
    throw new ServicePricingError(
      'PRICE_CATEGORY_REQUIRED',
      'This vehicle needs a configured pricing category before a price can be quoted.',
      422,
      { vehiclePricingCategory: vehiclePricingCategory || null, packageCode: packageCode || null }
    );
  }

  const packageMatch = getPackageConfig(service, packageCode);
  if (!packageMatch?.packageConfig) {
    throw new ServicePricingError(
      'PRICE_PACKAGE_REQUIRED',
      'A valid SPF package is required before a price can be quoted.',
      422,
      { packageCode: packageCode || null, vehiclePricingCategory: normalizedCategory }
    );
  }

  const { packageKey, packageConfig } = packageMatch;
  const apiKey = getVehiclePricingApiKey(normalizedCategory);
  const stored = getStoredPricingEntry(service, apiKey);
  const available = stored.base !== null && stored.base > 0;
  const serviceId = service?._id?.toString?.() || service?.id || null;
  const packageIdentity = {
    catalogVersion: SPF_CATALOG_VERSION,
    serviceId,
    // Booking-option consumers use the same public identity fields as
    // /services/published. Keep serviceId as the explicit pricing reference,
    // while id/name preserve the established mobile service contract.
    id: serviceId,
    name: service?.name || packageConfig.name,
    category: service?.category || packageConfig.category,
    displayOrder: Number.isFinite(Number(service?.displayOrder))
      ? Number(service.displayOrder)
      : packageConfig.displayOrder,
    packageKey,
    packageCode: packageConfig.packageCode,
    tier: packageConfig.tier,
  };

  if (!available) {
    return {
      ...packageIdentity,
      available: false,
      promoPrice: null,
      srp: null,
      savings: null,
      tintBundlePrice: null,
      vehiclePricingCategory: normalizedCategory,
      vehiclePricingCategoryLabel: getVehiclePricingLabel(normalizedCategory),
      protectionYears: packageConfig.protectionYears,
      approvedDuration: packageConfig.durationNeedsClientVerification ? null : packageConfig.duration,
      duration: service?.duration || packageConfig.duration || null,
      durationNeedsClientVerification: Boolean(packageConfig.durationNeedsClientVerification),
      shortDescription: packageConfig.catalogCard.tagline,
      description: service?.description || packageConfig.description,
      inclusions: packageConfig.catalogCard.fullInclusions,
      ppfCoverage: packageConfig.catalogCard.ppfCoverage || [],
      badge: packageConfig.catalogCard.badge,
      catalogCard: packageConfig.catalogCard,
      includedAddOns: packageConfig.packageCode === 'SPF101'
        ? [BOOKING_ADD_ON_CODE.NANO_CERAMIC_TINT_BUNDLE, BOOKING_ADD_ON_CODE.UNDERCOATING]
        : [],
    };
  }

  if (stored.original === null || stored.original < stored.base) {
    throw new ServicePricingError(
      'PRICE_CONFIGURATION_ERROR',
      'The selected package is missing a valid SRP for this vehicle category.',
      409,
      {
        packageCode: packageConfig.packageCode,
        vehiclePricingCategory: normalizedCategory,
        promoPrice: stored.base,
        srp: stored.original,
      }
    );
  }

  return {
    ...packageIdentity,
    available: true,
    promoPrice: stored.base,
    srp: stored.original,
    savings: stored.original - stored.base,
    tintBundlePrice: stored.addon,
    vehiclePricingCategory: normalizedCategory,
    vehiclePricingCategoryLabel: getVehiclePricingLabel(normalizedCategory),
    protectionYears: packageConfig.protectionYears,
    approvedDuration: packageConfig.durationNeedsClientVerification ? null : packageConfig.duration,
    duration: service?.duration || packageConfig.duration || null,
    durationNeedsClientVerification: Boolean(packageConfig.durationNeedsClientVerification),
    shortDescription: packageConfig.catalogCard.tagline,
    description: service?.description || packageConfig.description,
    inclusions: packageConfig.catalogCard.fullInclusions,
    ppfCoverage: packageConfig.catalogCard.ppfCoverage || [],
    badge: packageConfig.catalogCard.badge,
    catalogCard: packageConfig.catalogCard,
    includedAddOns: packageConfig.packageCode === 'SPF101'
      ? [BOOKING_ADD_ON_CODE.NANO_CERAMIC_TINT_BUNDLE, BOOKING_ADD_ON_CODE.UNDERCOATING]
      : [],
  };
};

const normalizeSelectedAddOns = (selectedAddOns) => {
  if (!Array.isArray(selectedAddOns)) return [];
  const supported = new Set(Object.values(BOOKING_ADD_ON_CODE));
  return [...new Set(selectedAddOns.map((item) => (
    typeof item === 'string' ? item : item?.code
  )).map((code) => String(code || '').trim().toUpperCase()).filter((code) => supported.has(code)))];
};

export const resolveBookingQuote = ({
  vehiclePricingCategory,
  packageCode,
  service,
  selectedAddOns = [],
}) => {
  const resolved = resolveServicePricing({ vehiclePricingCategory, packageCode, service });
  if (!resolved.available) {
    throw new ServicePricingError(
      'PACKAGE_UNAVAILABLE',
      'This package is not available for the selected vehicle pricing category.',
      409,
      {
        packageCode: resolved.packageCode,
        vehiclePricingCategory: resolved.vehiclePricingCategory,
      }
    );
  }

  const normalizedAddOns = normalizeSelectedAddOns(selectedAddOns);
  let quotedPrice = resolved.promoPrice;
  const addOnPriceSnapshots = [];

  for (const addOnCode of normalizedAddOns) {
    if (addOnCode === BOOKING_ADD_ON_CODE.NANO_CERAMIC_TINT_BUNDLE) {
      if (resolved.packageCode === 'SPF101') {
        addOnPriceSnapshots.push({
          code: addOnCode,
          pricingMode: 'included',
          priceAtBooking: 0,
          incrementalPriceAtBooking: 0,
          included: true,
        });
        continue;
      }
      if (!Number.isFinite(resolved.tintBundlePrice) || resolved.tintBundlePrice <= 0) {
        throw new ServicePricingError('ADD_ON_UNAVAILABLE', 'The tint bundle is unavailable for this package and vehicle category.', 409, {
          addOnCode,
          packageCode: resolved.packageCode,
          vehiclePricingCategory: resolved.vehiclePricingCategory,
        });
      }
      const incrementalPrice = resolved.tintBundlePrice - resolved.promoPrice;
      quotedPrice = resolved.tintBundlePrice;
      addOnPriceSnapshots.push({
        code: addOnCode,
        pricingMode: 'bundle_total',
        priceAtBooking: resolved.tintBundlePrice,
        incrementalPriceAtBooking: incrementalPrice,
        included: false,
      });
      continue;
    }

    if (addOnCode === BOOKING_ADD_ON_CODE.UNDERCOATING) {
      if (resolved.packageCode === 'SPF101') {
        addOnPriceSnapshots.push({
          code: addOnCode,
          pricingMode: 'included',
          priceAtBooking: 0,
          incrementalPriceAtBooking: 0,
          included: true,
        });
        continue;
      }
      const undercoatingPrice = getUndercoatingPrice(resolved.vehiclePricingCategory);
      if (!Number.isFinite(undercoatingPrice) || undercoatingPrice <= 0) {
        throw new ServicePricingError('PRICE_CONFIGURATION_ERROR', 'Undercoating pricing is not configured for this vehicle category.', 409, {
          addOnCode,
          vehiclePricingCategory: resolved.vehiclePricingCategory,
        });
      }
      quotedPrice += undercoatingPrice;
      addOnPriceSnapshots.push({
        code: addOnCode,
        pricingMode: 'additive',
        priceAtBooking: undercoatingPrice,
        incrementalPriceAtBooking: undercoatingPrice,
        included: false,
      });
    }
  }

  return {
    ...resolved,
    quotedPrice,
    selectedAddOns: normalizedAddOns,
    addOnPriceSnapshots,
  };
};

export const buildPricingSnapshot = (quote) => ({
  catalogVersion: quote.catalogVersion,
  packageCode: quote.packageCode,
  vehiclePricingCategory: quote.vehiclePricingCategory,
  quotedPrice: quote.quotedPrice,
  srpAtBooking: quote.srp,
  savingsAtBooking: quote.savings,
  selectedAddOns: quote.selectedAddOns,
  addOnPriceSnapshots: quote.addOnPriceSnapshots,
  capturedAt: new Date(),
});
