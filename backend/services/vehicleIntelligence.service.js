import { randomUUID } from 'node:crypto';
import VehicleDefinition from '../models/vehicleDefinition.model.js';
import {
  VEHICLE_PRICING_CATEGORY_CODES, normalizeVehiclePricingCategory, getVehicleTypeLabelForPricingCategory,
} from '../constants/pricingCategories.js';
import { brandModels, vehicleClassificationMap, canonicalVehicleIdentity, normalizeVehicleIdentity } from '../constants/vehicleDatabase.js';
import { ServicePricingError } from './servicePricing.service.js';
import { findGlobalVehicleClassification } from './globalVehicleCatalog.service.js';

export const identityKey = (value) => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const fault = (message, code = 'VEHICLE_DEFINITION_INVALID', statusCode = 422, details = {}) =>
  new ServicePricingError(code, message, statusCode, details);

const classificationOptions = (categories) => [...new Set(categories.map(normalizeVehiclePricingCategory).filter(Boolean))]
  .map((code) => ({ code, label: getVehicleTypeLabelForPricingCategory(code) }));

const withClassificationContract = (result, categories = [], overrides = {}) => {
  const options = classificationOptions(categories);
  return {
    ...result,
    classification: result.status === 'classified' ? getVehicleTypeLabelForPricingCategory(result.pricingCategory) : null,
    validClassifications: options.map((option) => option.label),
    validPricingCategories: options.map((option) => option.code),
    classificationOptions: options,
    verified: result.status === 'classified' && !result.selectionValidated,
    requiresSelection: false,
    requiresReview: result.status !== 'classified',
    ...overrides,
  };
};

export function submittedVehicleClassification(body = {}) {
  const supplied = ['vehicleClassification', 'pricingCategory', 'vehicleType']
    .filter((field) => body[field] !== undefined && body[field] !== null && String(body[field]).trim())
    .map((field) => ({ field, value: String(body[field]).trim(), category: normalizeVehiclePricingCategory(body[field]) }));
  if (!supplied.length) return null;
  const invalid = supplied.find((entry) => !entry.category);
  const categories = [...new Set(supplied.map((entry) => entry.category).filter(Boolean))];
  return {
    category: !invalid && categories.length === 1 ? categories[0] : null,
    value: invalid?.value || supplied[0].value,
    invalid: Boolean(invalid) || categories.length > 1,
  };
}

const classificationMismatch = (identity, expected, valid = []) => {
  const { brand, model } = canonicalVehicleIdentity(identity.brand || identity.make, identity.model);
  const suffix = expected
    ? `${brand} ${model} is classified as ${getVehicleTypeLabelForPricingCategory(expected)}.`
    : `Valid classifications are ${valid.map(getVehicleTypeLabelForPricingCategory).join(' or ')}.`;
  return fault(`The selected vehicle classification does not match this vehicle. ${suffix}`,
    'VEHICLE_CLASSIFICATION_MISMATCH', 422, {
      expectedPricingCategory: expected || null,
      expectedClassification: expected ? getVehicleTypeLabelForPricingCategory(expected) : null,
      validPricingCategories: valid,
      validClassifications: valid.map(getVehicleTypeLabelForPricingCategory),
    });
};

// Business mappings explicitly supplied by AutoSPF+. Unknown technical facts stay blank.
// These are bounded bootstrap records, not an assertion about future generations.
export const BOOTSTRAP_DEFINITIONS = [
  ['Bentley', 'Bentayga', 'SUV', 'SUV'],
  ['Alfa Romeo', 'Giulietta', 'Hatchback', 'HATCHBACK_SMALL_CAR'],
  ['BMW', '7 Series', 'Sedan', 'HIGH_END_SEDAN'],
].map(([brand, model, bodyType, pricingCategory]) => ({
  definitionKey: `bootstrap:${identityKey(brand)}:${identityKey(model)}`, revision: 1,
  brand, model, brandKey: identityKey(brand), modelKey: identityKey(model),
  generation: '', facelift: '', yearFrom: null, yearTo: 2026,
  bodyType, vehicleCategory: getVehicleTypeLabelForPricingCategory(pricingCategory), pricingCategory,
  fuelType: '', drivetrain: '', sizeSegment: '', confidenceLevel: 'high', status: 'approved',
  sources: ['AutoSPF+ owner classification instructions, 2026-09-06'],
  reviewExpiresAt: new Date('2027-09-06T00:00:00Z'),
}));

// Extend the reviewed bootstrap with established, exact AutoSPF+ price mappings.
// Do not copy the old regex heuristics or infer technical body type from a price tier.
for (const [brand, models] of Object.entries(vehicleClassificationMap)) {
  for (const [model, pricingCategory] of Object.entries(models)) {
    if (!pricingCategory || BOOTSTRAP_DEFINITIONS.some((r) => r.brand === brand && r.model === model)) continue;
    BOOTSTRAP_DEFINITIONS.push({
      definitionKey: `catalog:${identityKey(brand)}:${identityKey(model)}`, revision: 1,
      brand, model, brandKey: identityKey(brand), modelKey: identityKey(model),
      generation: '', facelift: '', yearFrom: null, yearTo: 2026,
      bodyType: '', vehicleCategory: getVehicleTypeLabelForPricingCategory(pricingCategory), pricingCategory,
      fuelType: '', drivetrain: '', sizeSegment: '', confidenceLevel: 'high', status: 'approved',
      sources: ['AutoSPF+ existing explicit service-pricing catalog, consolidated 2026-09-07'],
      reviewExpiresAt: new Date('2027-09-06T00:00:00Z'),
    });
  }
}

const textField = (input, field, required = false) => {
  const value = input[field] ?? '';
  if (typeof value !== 'string' || value.length > 200 || (required && !value.trim())) {
    throw fault(`${field} must be ${required ? 'a nonempty' : 'a'} string of at most 200 characters.`);
  }
  return value.trim();
};

export function validateDefinition(input, now = new Date()) {
  const data = {};
  for (const key of ['brand', 'model', 'bodyType', 'vehicleCategory', 'reason']) data[key] = textField(input, key, true);
  for (const key of ['generation', 'facelift', 'fuelType', 'drivetrain', 'sizeSegment']) data[key] = textField(input, key);
  for (const key of ['yearFrom', 'yearTo']) {
    const value = input[key] ?? null;
    if (value !== null && (!Number.isInteger(value) || value < 1886)) throw fault(`${key} must be an integer year or null.`);
    data[key] = value;
  }
  if (data.yearFrom !== null && data.yearTo !== null && data.yearFrom > data.yearTo) throw fault('The year range is reversed.');
  data.pricingCategory = identityKey(input.pricingCategory) === 'other' ? 'OTHER' : normalizeVehiclePricingCategory(input.pricingCategory);
  if (!data.pricingCategory) throw fault('Select an existing pricing category or Other.');
  for (const [key, allowed] of Object.entries({ status: ['draft', 'approved', 'retired'], confidenceLevel: ['low', 'medium', 'high'] })) {
    if (!allowed.includes(input[key])) throw fault(`Invalid ${key}.`);
    data[key] = input[key];
  }
  if (!Array.isArray(input.sources) || input.sources.length > 20 || input.sources.some((s) => typeof s !== 'string' || !s.trim() || s.length > 1000)) {
    throw fault('sources must contain at most 20 nonempty references.');
  }
  data.sources = input.sources.map((s) => s.trim());
  data.reviewExpiresAt = input.reviewExpiresAt ? new Date(input.reviewExpiresAt) : null;
  if (data.reviewExpiresAt && !Number.isFinite(data.reviewExpiresAt.getTime())) throw fault('Invalid review expiry.');
  if (data.status === 'approved' && (
    data.confidenceLevel !== 'high' || !data.sources.length || data.yearTo === null
    || !data.reviewExpiresAt || data.reviewExpiresAt <= now
  )) throw fault('Approval requires high confidence, sources, a bounded year range and a future review expiry.');
  return { ...data, brandKey: identityKey(data.brand), modelKey: identityKey(data.model) };
}

export async function publishDefinition(input, actorId, definitionKey = randomUUID(), expectedRevision = 0) {
  const data = validateDefinition(input);
  await VehicleDefinition.init();
  const latest = await VehicleDefinition.findOne({ definitionKey }).sort({ revision: -1 }).lean();
  if ((latest?.revision || 0) !== expectedRevision) throw fault('This definition changed. Reload before saving.', 'VEHICLE_REVISION_CONFLICT', 409);
  if (latest && (latest.brandKey !== data.brandKey || latest.modelKey !== data.modelKey)) {
    throw fault('Brand/model identity is immutable. Retire this definition and create a new one.');
  }
  try {
    return await VehicleDefinition.create({ ...data, definitionKey, revision: expectedRevision + 1, authoredBy: actorId });
  } catch (error) {
    if (error.code === 11000) throw fault('This definition changed. Reload before saving.', 'VEHICLE_REVISION_CONFLICT', 409);
    throw error;
  }
}

export async function latestDefinitions(match = {}) {
  return VehicleDefinition.aggregate([
    { $match: match }, { $sort: { definitionKey: 1, revision: -1 } },
    { $group: { _id: '$definitionKey', record: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$record' } },
  ]);
}

export function classifyDefinitions(identity, records, now = new Date()) {
  const unknown = (reason, candidates = []) => withClassificationContract({
    status: 'review_required', reason, confidenceLevel: 'low', bodyType: '',
    vehicleCategory: null, pricingCategory: null, vehicleType: null,
    candidates: candidates.map((r) => ({ definitionKey: r.definitionKey, revision: r.revision, generation: r.generation, yearFrom: r.yearFrom, yearTo: r.yearTo })),
  }, VEHICLE_PRICING_CATEGORY_CODES, {
    requiresSelection: true,
    requiresReview: false,
  });
  const { brand, model } = canonicalVehicleIdentity(identity.brand || identity.make, identity.model);
  if (!brand || !identity.model) return unknown('IDENTITY_REQUIRED');
  const year = identity.year === '' || identity.year == null ? null : Number(identity.year);
  if (year !== null && (!Number.isInteger(year) || year < 1886)) return unknown('INVALID_YEAR');
  const candidates = records.filter((r) => normalizeVehicleIdentity(canonicalVehicleIdentity(r.brand, r.model).brand) === normalizeVehicleIdentity(brand) && normalizeVehicleIdentity(r.model) === normalizeVehicleIdentity(model))
    .filter((r) => year === null || ((r.yearFrom === null || year >= r.yearFrom) && (r.yearTo === null || year <= r.yearTo)))
    .filter((r) => ['generation', 'facelift', 'fuelType', 'drivetrain', 'bodyType'].every((key) =>
      !identity[key] || ((!r[key] && ['fuelType', 'drivetrain'].includes(key)) || identityKey(identity[key]) === identityKey(r[key]))));
  if (!candidates.length) return unknown('UNKNOWN_VEHICLE');
  // An overlapping draft/retirement is a review signal, never a license to use an older price.
  if (candidates.some((r) => r.status !== 'approved' || r.confidenceLevel !== 'high'
    || !r.reviewExpiresAt || new Date(r.reviewExpiresAt) <= now || r.yearTo === null)) {
    return unknown('REVIEW_REQUIRED', candidates);
  }
  const validCategories = [...new Set(candidates.map((r) => normalizeVehiclePricingCategory(r.pricingCategory)).filter(Boolean))];
  if (validCategories.length > 1) return unknown('AMBIGUOUS_VEHICLE', candidates);
  const record = candidates[0];
  if (!normalizeVehiclePricingCategory(record.pricingCategory)) return unknown('PRICING_REVIEW_REQUIRED', candidates);
  const unanimous = (key) => candidates.every((r) => r[key] === record[key]) ? record[key] : '';
  return withClassificationContract({
    status: 'classified', reason: null, confidenceLevel: 'high',
    brand: record.brand, model: record.model, year,
    bodyType: unanimous('bodyType'), vehicleCategory: getVehicleTypeLabelForPricingCategory(record.pricingCategory), pricingCategory: normalizeVehiclePricingCategory(record.pricingCategory),
    vehicleType: getVehicleTypeLabelForPricingCategory(record.pricingCategory),
    generation: unanimous('generation'), facelift: unanimous('facelift'), fuelType: unanimous('fuelType'),
    drivetrain: unanimous('drivetrain'), sizeSegment: unanimous('sizeSegment'),
    definitions: candidates.map((r) => ({ definitionKey: r.definitionKey, revision: r.revision })),
    reviewedUntil: new Date(Math.min(...candidates.map((r) => new Date(r.reviewExpiresAt).getTime()))),
  }, validCategories);
}

export async function classifyVehicle(identity, loadedDefinitions) {
  const { brand, model } = canonicalVehicleIdentity(identity.brand || identity.make, identity.model);
  // Compare actual names after normalization so historical definition keys keep working.
  // Include every revision family for this identity, including retired/draft families.
  const records = (loadedDefinitions || await latestDefinitions()).filter((r) =>
    normalizeVehicleIdentity(canonicalVehicleIdentity(r.brand, r.model).brand) === normalizeVehicleIdentity(brand)
    && normalizeVehicleIdentity(r.model) === normalizeVehicleIdentity(model));
  const definitions = records.length ? records : BOOTSTRAP_DEFINITIONS.filter((r) => r.brand === brand && r.model === model);
  const pricing = classifyDefinitions(identity, definitions);
  const physical = await findGlobalVehicleClassification(identity);
  const physicalBodyType = identityKey(physical?.bodyType) === 'other' ? '' : physical?.bodyType || '';
  const physicalVehicleClass = identityKey(physical?.vehicleClass) === 'other' ? '' : physical?.vehicleClass || '';
  return { ...pricing,
    bodyType: physicalBodyType || pricing.bodyType,
    vehicleClass: physicalVehicleClass,
    segment: physical?.segment || pricing.sizeSegment || '',
    physicalClassificationStatus: physical?.catalogStatus || 'unavailable',
    catalogSources: physical?.catalogSources || [],
    catalogRecordIds: physical?.catalogRecordIds || [],
    recommendedServiceCategory: pricing.pricingCategory
      ? getVehicleTypeLabelForPricingCategory(pricing.pricingCategory)
      : null,
    generations: [...new Set([
      ...definitions.filter((r) => r.status !== 'retired').map((r) => r.generation).filter(Boolean),
      ...(physical?.generations || []),
    ])].sort(),
  };
}

export async function vehicleCatalog() {
  const definitions = await latestDefinitions();
  const catalog = Object.fromEntries(Object.entries(brandModels).map(([brand, models]) => [brand, [...models]]));
  for (const record of definitions.filter((r) => r.status !== 'retired')) {
    const { brand, model } = canonicalVehicleIdentity(record.brand, record.model);
    if (!Object.hasOwn(catalog, brand)) Object.defineProperty(catalog, brand, { value: ['Other'], enumerable: true });
    if (!catalog[brand].some(entry => normalizeVehicleIdentity(entry) === normalizeVehicleIdentity(model))) catalog[brand].unshift(model);
  }
  return catalog;
}

export async function vehicleClassificationFields(identity, existing = null, loadedDefinitions, submittedClassification = null) {
  const sameIdentity = existing && ['make', 'model', 'year', 'generation', 'facelift', 'fuelType', 'drivetrain'].every((key) =>
    identityKey(identity[key]) === identityKey(existing[key]));
  if (sameIdentity && normalizeVehiclePricingCategory(existing.pricingCategory) && existing.pricingCategorySource === 'admin_assigned' && existing.pricingCategoryReviewedBy && !existing.pricingCategoryNeedsReview) {
    if (submittedClassification && submittedClassification.category !== normalizeVehiclePricingCategory(existing.pricingCategory)) {
      throw classificationMismatch(identity, existing.pricingCategory);
    }
    return { pricingCategory: normalizeVehiclePricingCategory(existing.pricingCategory), vehicleType: getVehicleTypeLabelForPricingCategory(existing.pricingCategory), classification: existing.classification };
  }
  // User-provided fuel metadata is retained but only matching catalog metadata can narrow variants.
  let classification = await classifyVehicle(identity, loadedDefinitions);
  if (classification.status === 'classified' && submittedClassification
    && submittedClassification.category !== classification.pricingCategory) {
    throw classificationMismatch(identity, classification.pricingCategory);
  }
  const persistedManualClassification = sameIdentity
    && existing?.pricingCategorySource === 'customer_selected'
    && existing?.pricingCategoryNeedsReview === false
    && normalizeVehiclePricingCategory(existing.pricingCategory)
      ? {
          category: normalizeVehiclePricingCategory(existing.pricingCategory),
          value: existing.pricingCategory,
          invalid: false,
        }
      : null;
  const manualClassification = submittedClassification || persistedManualClassification;
  if (classification.status !== 'classified' && manualClassification) {
    if (manualClassification.invalid || !manualClassification.category
      || !VEHICLE_PRICING_CATEGORY_CODES.includes(manualClassification.category)) {
      throw classificationMismatch(identity, null, VEHICLE_PRICING_CATEGORY_CODES);
    }
    const selectedCategory = manualClassification.category;
    classification = withClassificationContract({
      ...classification, status: 'classified', reason: 'MANUAL_CLASSIFICATION_SELECTED', confidenceLevel: 'low',
      pricingCategory: selectedCategory,
      vehicleType: getVehicleTypeLabelForPricingCategory(selectedCategory),
      vehicleCategory: getVehicleTypeLabelForPricingCategory(selectedCategory),
      selectionValidated: true,
    }, VEHICLE_PRICING_CATEGORY_CODES, {
      classification: getVehicleTypeLabelForPricingCategory(selectedCategory),
      verified: false,
      requiresSelection: false,
      requiresReview: false,
    });
  }
  return {
    classification, vehicleType: classification.status === 'classified' ? classification.vehicleType : 'Other',
    pricingCategory: classification.pricingCategory || undefined,
    pricingCategorySource: classification.status === 'classified'
      ? (classification.selectionValidated ? 'customer_selected' : 'vehicle_database')
      : 'customer_selected',
    pricingCategoryNeedsReview: classification.status !== 'classified',
    pricingCategoryReviewedAt: classification.status === 'classified' ? new Date() : null,
    pricingCategoryReviewedBy: null,
  };
}

export async function requireVehiclePricing(vehicle) {
  if (!vehicle) throw fault('Select a saved vehicle before requesting pricing.', 'VEHICLE_REQUIRED');
  const fields = await vehicleClassificationFields(vehicle, vehicle);
  if (!fields.pricingCategory) throw new ServicePricingError('PRICE_CATEGORY_REQUIRED', 'Select a supported vehicle classification before booking.', 422);
  return { ...vehicle, ...fields };
}
