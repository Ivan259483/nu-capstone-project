import VehicleManufacturer from '../models/vehicleManufacturer.model.js';
import VehicleCatalogModel from '../models/vehicleCatalogModel.model.js';
import VehicleVariant from '../models/vehicleVariant.model.js';
import VehicleClassification from '../models/vehicleClassification.model.js';
import { canonicalVehicleIdentity, normalizeVehicleIdentity } from '../constants/vehicleDatabase.js';

export const GLOBAL_VEHICLE_CLASSES = Object.freeze([
  ['HATCHBACK_SMALL_CAR', 'Hatchback / Small Car', 'Hatchback', 'Small passenger car with a rear liftgate.'],
  ['SEDAN', 'Sedan', 'Sedan', 'Passenger car with a separate passenger cabin and trunk.'],
  ['LIFTBACK_FASTBACK', 'Liftback / Fastback', 'Liftback / Fastback', 'Passenger car with a sloped rear profile and liftgate.'],
  ['COUPE', 'Coupe', 'Coupe', 'Fixed-roof passenger car commonly configured with two doors.'],
  ['CONVERTIBLE_ROADSTER', 'Convertible / Roadster', 'Convertible / Roadster', 'Open-roof passenger car.'],
  ['SMALL_SUV', 'Small SUV / Subcompact SUV', 'Crossover SUV', 'Small crossover or sport utility vehicle.'],
  ['COMPACT_SUV', 'Compact SUV', 'Crossover SUV', 'Compact crossover or sport utility vehicle.'],
  ['MIDSIZE_SUV', 'Midsize SUV', 'SUV', 'Medium-size sport utility vehicle.'],
  ['LARGE_SUV', 'Large SUV', 'SUV', 'Large sport utility vehicle.'],
  ['PICKUP_TRUCK', 'Pickup Truck', 'Pickup', 'Light truck with an open cargo bed.'],
  ['HEAVY_DUTY_PICKUP', 'Heavy Duty Pickup', 'Pickup', 'Heavy-duty pickup truck.'],
  ['MPV_MINIVAN', 'MPV / Minivan', 'MPV / Minivan', 'Multi-purpose passenger vehicle or minivan.'],
  ['PASSENGER_VAN', 'Passenger Van', 'Passenger Van', 'Van configured primarily to carry passengers.'],
  ['COMMERCIAL_VAN', 'Commercial Van', 'Commercial Van', 'Van configured primarily for cargo or commercial use.'],
  ['SPORTS_CAR', 'Sports Car', 'Sports Car', 'Performance-focused road car.'],
  ['SUPERCAR', 'Supercar', 'Supercar', 'Very high performance limited-production road car.'],
  ['HYPERCAR', 'Hypercar', 'Hypercar', 'Extreme-performance flagship road car.'],
  ['LUXURY_SEDAN', 'Luxury Sedan', 'Sedan', 'Premium or ultra-luxury sedan.'],
]);
const globalVehicleClassByKey = new Map(GLOBAL_VEHICLE_CLASSES.map(([, vehicleClass]) => [normalizeVehicleIdentity(vehicleClass), vehicleClass]));
for (const [alias, canonical] of Object.entries({
  hatchback: 'Hatchback / Small Car', 'small car': 'Hatchback / Small Car',
  liftback: 'Liftback / Fastback', fastback: 'Liftback / Fastback', convertible: 'Convertible / Roadster', roadster: 'Convertible / Roadster',
  'subcompact suv': 'Small SUV / Subcompact SUV', 'small suv': 'Small SUV / Subcompact SUV',
  minivan: 'MPV / Minivan', mpv: 'MPV / Minivan', 'luxury sedan': 'Luxury Sedan',
})) globalVehicleClassByKey.set(normalizeVehicleIdentity(alias), canonical);

const allowedStatus = new Set(['active', 'discontinued', 'inactive']);
const text = (value, name, required = false, max = 300) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw Object.assign(new Error(`${name} must be ${required ? 'a nonempty ' : ''}string of at most ${max} characters.`), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  }
  return value.trim();
};

function newSet(values) {
  return [...new Set((Array.isArray(values) ? values : values ? [values] : []).map((value) => text(value, 'array value')).filter(Boolean))];
}

function year(value, name) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1886 || parsed > 2200) {
    throw Object.assign(new Error(`${name} must be a valid model year.`), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  }
  return parsed;
}

const key = (value) => normalizeVehicleIdentity(value);
export const normalizeGlobalVehicleClass = (value) => {
  if (!value) return '';
  const canonical = globalVehicleClassByKey.get(key(value));
  if (!canonical) throw Object.assign(new Error(`vehicleClass must use an AutoSPF+ physical class; received "${value}".`), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  return canonical;
};
const logoUrl = (value) => {
  const logo = text(value || '', 'logo', false, 1000);
  if (!logo || logo.startsWith('/')) return logo;
  try {
    const parsed = new URL(logo);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.href;
  } catch {
    throw Object.assign(new Error('logo must be an HTTP(S) URL or an application-relative path.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  }
};
const sourceStamp = (record, importedAt) => ({
  provider: text(record.provider, 'provider', true, 100),
  sourceId: text(record.sourceId || record.providerModelId || '', 'sourceId', false, 200),
  importedAt,
  sourceUpdatedAt: record.sourceUpdatedAt ? new Date(record.sourceUpdatedAt) : null,
  license: text(record.license || '', 'license', false, 300),
});

export function normalizeCatalogRecord(input, importedAt = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Each vehicle catalog record must be an object.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  }
  const canonical = canonicalVehicleIdentity(text(input.brandName || input.brand || input.make, 'brandName', true), text(input.modelName || input.model, 'modelName', true));
  const productionStart = year(input.productionStart ?? input.production_start ?? input.yearFrom ?? input.year, 'productionStart');
  const productionEnd = year(input.productionEnd ?? input.production_end ?? input.yearTo ?? input.year, 'productionEnd');
  if (productionStart && productionEnd && productionStart > productionEnd) {
    throw Object.assign(new Error('productionStart cannot be after productionEnd.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  }
  const provider = text(input.provider, 'provider', true, 100).toLowerCase();
  const status = text(input.status || 'active', 'status', true, 30).toLowerCase();
  if (!allowedStatus.has(status)) throw Object.assign(new Error('Invalid catalog status.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  const manufacturerStatus = text(input.manufacturerStatus || status, 'manufacturerStatus', true, 30).toLowerCase();
  if (!allowedStatus.has(manufacturerStatus)) throw Object.assign(new Error('Invalid manufacturer status.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  const generation = text(input.generation || '', 'generation');
  const aliases = newSet(input.aliases);
  const bodyType = text(input.bodyType || input.body_type || '', 'bodyType');
  const vehicleClass = normalizeGlobalVehicleClass(text(input.vehicleClass || input.vehicle_class || '', 'vehicleClass'));
  const segment = text(input.segment || '', 'segment');
  return {
    brandName: canonical.brand,
    brandKey: key(canonical.brand),
    country: text(input.country || '', 'country', false, 120),
    logo: logoUrl(input.logo),
    manufacturerStatus,
    manufacturerAliases: newSet(input.manufacturerAliases),
    providerManufacturerId: text(input.providerManufacturerId || input.makeId || '', 'providerManufacturerId', false, 200),
    modelName: canonical.model,
    modelKey: key(canonical.model),
    generation,
    generationKey: key(generation),
    productionStart,
    productionEnd,
    bodyType,
    vehicleClass,
    segment,
    classificationKey: key(input.classificationKey || [bodyType, vehicleClass, segment].filter(Boolean).join('|')),
    fuelTypes: newSet(input.fuelTypes || input.fuel_type),
    driveTypes: newSet(input.driveTypes || input.drive_type),
    transmissions: newSet(input.transmissions || input.transmission),
    regions: newSet(input.regions),
    aliases,
    aliasKeys: aliases.map(key),
    status,
    provider,
    providerModelId: text(input.providerModelId || input.modelId || '', 'providerModelId', false, 200),
    classificationConfidence: ['unknown', 'partial', 'verified'].includes(input.classificationConfidence)
      ? input.classificationConfidence
      : input.vehicleClass ? 'verified' : input.bodyType ? 'partial' : 'unknown',
    variants: Array.isArray(input.variants) ? input.variants : [],
    source: sourceStamp({ ...input, provider }, importedAt),
  };
}

export async function seedVehicleClassifications() {
  if (!GLOBAL_VEHICLE_CLASSES.length) return;
  await VehicleClassification.bulkWrite(GLOBAL_VEHICLE_CLASSES.map(([code, vehicleClass, bodyType, description]) => ({
    updateOne: {
      filter: { code },
      update: { $set: { code, vehicleClass, bodyType, description, status: 'active', source: 'AutoSPF+ vehicle taxonomy 2026-09-07' }},
      upsert: true,
    },
  })), { ordered: false });
}

function normalizedVariant(variant, record) {
  const variantName = text(variant.variantName || variant.variant_name || variant.trim || 'Base', 'variantName', true);
  const variantYear = year(variant.year, 'variant year');
  const productionStart = year(variant.productionStart ?? variant.production_start ?? variantYear, 'variant productionStart');
  const productionEnd = year(variant.productionEnd ?? variant.production_end ?? variantYear, 'variant productionEnd');
  if (productionStart && productionEnd && productionStart > productionEnd) {
    throw Object.assign(new Error('Variant productionStart cannot be after productionEnd.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  }
  return {
    variantName,
    variantKey: key(variantName),
    engine: text(variant.engine || '', 'engine'),
    year: variantYear,
    productionStart,
    productionEnd,
    hybrid: Boolean(variant.hybrid),
    electric: Boolean(variant.electric),
    fuelType: text(variant.fuelType || variant.fuel_type || '', 'fuelType'),
    driveType: text(variant.driveType || variant.drive_type || '', 'driveType'),
    transmission: text(variant.transmission || '', 'transmission'),
    bodyType: text(variant.bodyType || variant.body_type || '', 'bodyType'),
    vehicleClass: normalizeGlobalVehicleClass(text(variant.vehicleClass || variant.vehicle_class || '', 'vehicleClass')),
    segment: text(variant.segment || '', 'segment'),
    provider: record.provider,
    providerVariantId: text(variant.providerVariantId || variant.variantId || '', 'providerVariantId', false, 200),
    status: allowedStatus.has(variant.status) ? variant.status : record.status,
    source: sourceStamp({ ...variant, provider: record.provider, license: variant.license || record.source.license }, record.source.importedAt),
  };
}

export async function upsertVehicleCatalogBatch(inputs, options = {}) {
  if (!Array.isArray(inputs) || !inputs.length) return { received: 0, manufacturers: 0, models: 0, variants: 0 };
  if (inputs.length > (options.maxBatchSize || 1000)) {
    throw Object.assign(new Error(`Catalog imports are limited to ${options.maxBatchSize || 1000} records per batch.`), { code: 'VEHICLE_CATALOG_BATCH_TOO_LARGE', statusCode: 413 });
  }
  const importedAt = options.importedAt || new Date();
  const records = inputs.map((input) => normalizeCatalogRecord(input, importedAt));
  await seedVehicleClassifications();

  const manufacturerGroups = new Map();
  for (const record of records) {
    const group = manufacturerGroups.get(record.brandKey) || {
      record, aliases: new Set(), providerKeys: new Map(), sources: [],
    };
    record.manufacturerAliases.forEach((alias) => group.aliases.add(alias));
    if (record.providerManufacturerId) group.providerKeys.set(`${record.provider}:${record.providerManufacturerId}`,
      { provider: record.provider, id: record.providerManufacturerId });
    group.sources.push({ ...record.source, sourceId: record.providerManufacturerId || record.source.sourceId });
    if (record.country || record.logo) group.record = record;
    manufacturerGroups.set(record.brandKey, group);
  }
  await VehicleManufacturer.bulkWrite([...manufacturerGroups.entries()].map(([brandKey, group]) => {
    const set = { brandName: group.record.brandName, status: group.record.manufacturerStatus };
    if (group.record.country) set.country = group.record.country;
    if (group.record.logo) set.logo = group.record.logo;
    return { updateOne: {
      filter: { normalizedName: brandKey },
      update: { $set: set, $setOnInsert: { normalizedName: brandKey }, $addToSet: {
        aliases: { $each: [...group.aliases] }, aliasKeys: { $each: [...group.aliases].map(key) },
        providerKeys: { $each: [...group.providerKeys.values()] }, sources: { $each: group.sources },
      } },
      upsert: true,
    } };
  }), { ordered: false });
  const manufacturerDocs = await VehicleManufacturer.find({ normalizedName: { $in: [...manufacturerGroups.keys()] } }).lean();
  const manufacturers = new Map(manufacturerDocs.map((doc) => [doc.normalizedName, doc]));

  const modelIdentity = (record, manufacturerId) => ({
    manufacturerId, modelKey: record.modelKey, generationKey: record.generationKey,
    classificationKey: record.classificationKey, provider: record.provider,
  });
  const modelIdentityKey = (record, manufacturerId) => [manufacturerId, record.modelKey, record.generationKey,
    record.classificationKey, record.provider].join('|');
  const modelOperations = records.map((record) => {
    const manufacturer = manufacturers.get(record.brandKey);
    const set = {
      manufacturerId: manufacturer._id, brandName: record.brandName, brandKey: record.brandKey,
      modelName: record.modelName, modelKey: record.modelKey, generation: record.generation,
      generationKey: record.generationKey, classificationKey: record.classificationKey,
      bodyType: record.bodyType, vehicleClass: record.vehicleClass,
      segment: record.segment, status: record.status, provider: record.provider,
      providerModelId: record.providerModelId, classificationConfidence: record.classificationConfidence,
    };
    const update = {
      $set: set,
      $addToSet: {
        fuelTypes: { $each: record.fuelTypes }, driveTypes: { $each: record.driveTypes },
        transmissions: { $each: record.transmissions }, regions: { $each: record.regions },
        aliases: { $each: record.aliases }, aliasKeys: { $each: record.aliasKeys }, sources: record.source,
      },
    };
    if (record.productionStart) update.$min = { productionStart: record.productionStart };
    if (record.productionEnd) update.$max = { productionEnd: record.productionEnd };
    return { updateOne: { filter: modelIdentity(record, manufacturer._id), update, upsert: true } };
  });
  await VehicleCatalogModel.bulkWrite(modelOperations, { ordered: false });

  const recordsWithVariants = records.filter((record) => record.variants.length);
  let variants = 0;
  if (recordsWithVariants.length) {
    const filters = recordsWithVariants.map((record) => modelIdentity(record, manufacturers.get(record.brandKey)._id));
    const modelDocs = await VehicleCatalogModel.find({ $or: filters }).lean();
    const models = new Map(modelDocs.map((doc) => [[doc.manufacturerId, doc.modelKey, doc.generationKey,
      doc.classificationKey, doc.provider].join('|'), doc]));
    const variantOperations = [];
    for (const record of recordsWithVariants) {
      const manufacturer = manufacturers.get(record.brandKey);
      const model = models.get(modelIdentityKey(record, manufacturer._id));
      if (!model) throw new Error(`Imported model was not found for ${record.brandName} ${record.modelName}.`);
    for (const rawVariant of record.variants) {
      const variant = normalizedVariant(rawVariant, record);
      const { source, ...variantFields } = variant;
        variantOperations.push({ updateOne: {
          filter: { modelId: model._id, variantKey: variant.variantKey, year: variant.year, provider: variant.provider },
          update: { $set: { ...variantFields, modelId: model._id }, $addToSet: { sources: source } },
          upsert: true,
        } });
      variants += 1;
    }
    }
    await VehicleVariant.bulkWrite(variantOperations, { ordered: false });
  }
  return { received: records.length, manufacturers: manufacturers.size, models: records.length, variants };
}

const yearFilter = (modelYear) => modelYear == null ? {} : {
  $and: [
    { $or: [{ productionStart: null }, { productionStart: { $lte: modelYear } }] },
    { $or: [{ productionEnd: null }, { productionEnd: { $gte: modelYear } }] },
  ],
};

export async function findGlobalVehicleClassification(identity) {
  const { brand, model } = canonicalVehicleIdentity(identity.brand || identity.make, identity.model);
  if (!brand || !model) return null;
  const modelYear = year(identity.year, 'year');
  const generationKey = key(identity.generation || '');
  const query = {
    brandKey: key(brand),
    $or: [{ modelKey: key(model) }, { aliasKeys: key(model) }],
    status: { $ne: 'inactive' },
    ...yearFilter(modelYear),
  };
  if (generationKey) query.generationKey = generationKey;
  const models = await VehicleCatalogModel.find(query).limit(100).lean();
  if (!models.length) return null;
  const signatures = new Map();
  for (const item of models) {
    const signature = JSON.stringify([item.bodyType || '', item.vehicleClass || '', item.segment || '']);
    if (!signatures.has(signature)) signatures.set(signature, item);
  }
  const detailed = [...signatures.values()].filter((item) => item.bodyType || item.vehicleClass || item.segment);
  const exact = detailed.length === 1 ? detailed[0] : null;
  const partial = exact || detailed[0] || models[0];
  return {
    catalogStatus: exact?.vehicleClass ? 'classified' : detailed.length > 1 ? 'ambiguous' : 'partial',
    bodyType: exact?.bodyType || (detailed.length === 1 ? partial.bodyType : ''),
    vehicleClass: exact?.vehicleClass || '',
    segment: exact?.segment || (detailed.length === 1 ? partial.segment : ''),
    generation: exact?.generation || '',
    fuelTypes: exact?.fuelTypes || [],
    driveTypes: exact?.driveTypes || [],
    transmissions: exact?.transmissions || [],
    catalogSources: [...new Set(models.flatMap((item) => item.sources || []).map((source) => source.provider))],
    catalogRecordIds: models.map((item) => String(item._id)),
    generations: [...new Set(models.map((item) => item.generation).filter(Boolean))].sort(),
  };
}

export async function listVehicleManufacturers({ search = '', after = '', limit = 500 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const query = { status: { $ne: 'inactive' } };
  if (search) query.$or = [
    { brandName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    { aliasKeys: key(search) },
  ];
  if (after) query.normalizedName = { $gt: key(after) };
  const docs = await VehicleManufacturer.find(query).sort({ normalizedName: 1 }).limit(capped + 1).lean();
  const page = docs.slice(0, capped);
  return { data: page.map((doc) => ({ id: String(doc._id), brandName: doc.brandName, country: doc.country, logo: doc.logo, status: doc.status })),
    nextCursor: docs.length > capped ? page.at(-1).normalizedName : null };
}

export async function listVehicleModels({ manufacturerId, brand, year: selectedYear, search = '', after = '', limit = 1000 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 1000, 1), 2000);
  const modelYear = year(selectedYear, 'year');
  const query = { status: { $ne: 'inactive' }, ...yearFilter(modelYear) };
  if (manufacturerId) query.manufacturerId = manufacturerId;
  else if (brand) query.brandKey = key(canonicalVehicleIdentity(brand, '').brand);
  else throw Object.assign(new Error('manufacturerId or brand is required.'), { code: 'VEHICLE_CATALOG_INVALID', statusCode: 422 });
  if (search) query.$or = [
    { modelName: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
    { aliasKeys: key(search) },
  ];
  if (after) query.modelKey = { $gt: key(after) };
  const docs = await VehicleCatalogModel.find(query).sort({ modelKey: 1, productionStart: 1 }).limit(capped + 1).lean();
  const page = docs.slice(0, capped);
  return { data: page.map((doc) => ({ id: String(doc._id), modelName: doc.modelName, generation: doc.generation,
    productionStart: doc.productionStart, productionEnd: doc.productionEnd, bodyType: doc.bodyType,
    vehicleClass: doc.vehicleClass, segment: doc.segment, status: doc.status })),
    nextCursor: docs.length > capped ? page.at(-1).modelKey : null };
}

export async function listVehicleVariants({ modelId, year: selectedYear, after = '', limit = 500 } = {}) {
  const capped = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const modelYear = year(selectedYear, 'year');
  const query = { modelId, status: { $ne: 'inactive' } };
  if (modelYear) query.$and = [
    { $or: [{ year: modelYear }, { year: null }] },
    { $or: [{ productionStart: null }, { productionStart: { $lte: modelYear } }] },
    { $or: [{ productionEnd: null }, { productionEnd: { $gte: modelYear } }] },
  ];
  if (after) query.variantKey = { $gt: key(after) };
  const docs = await VehicleVariant.find(query).sort({ variantKey: 1, year: 1 }).limit(capped + 1).lean();
  const page = docs.slice(0, capped);
  return { data: page.map((doc) => ({ id: String(doc._id), variantName: doc.variantName, engine: doc.engine, year: doc.year,
    hybrid: doc.hybrid, electric: doc.electric, fuelType: doc.fuelType, driveType: doc.driveType,
    transmission: doc.transmission, bodyType: doc.bodyType, vehicleClass: doc.vehicleClass, segment: doc.segment })),
    nextCursor: docs.length > capped ? page.at(-1).variantKey : null };
}

export async function vehicleCatalogCoverage() {
  const [manufacturers, models, variants, classifiedModels, partialModels, classifications] = await Promise.all([
    VehicleManufacturer.countDocuments({ status: { $ne: 'inactive' } }),
    VehicleCatalogModel.countDocuments({ status: { $ne: 'inactive' } }),
    VehicleVariant.countDocuments({ status: { $ne: 'inactive' } }),
    VehicleCatalogModel.countDocuments({ status: { $ne: 'inactive' }, vehicleClass: { $ne: '' } }),
    VehicleCatalogModel.countDocuments({ status: { $ne: 'inactive' }, vehicleClass: '', bodyType: { $ne: '' } }),
    VehicleClassification.countDocuments({ status: 'active' }),
  ]);
  return { manufacturers, models, variants, classifiedModels, partialModels,
    unclassifiedModels: Math.max(0, models - classifiedModels), classifications };
}
