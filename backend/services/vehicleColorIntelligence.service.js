import VehicleColor, {
  STANDARD_VEHICLE_COLORS,
  VEHICLE_COLOR_FINISHES,
} from '../models/vehicleColor.model.js';

export const VEHICLE_COLOR_NOT_SPECIFIED = 'Not specified';

const STANDARD_COLOR_HEX = Object.freeze({
  Black: '#1E293B', White: '#F1F5F9', Gray: '#64748B', Silver: '#94A3B8',
  Red: '#EF4444', Blue: '#3B82F6', Green: '#22C55E', Yellow: '#EAB308',
  Orange: '#F97316', Brown: '#92400E', Gold: '#D4A017', Purple: '#7E22CE',
  Pink: '#EC4899', Beige: '#D6C6A8', Bronze: '#A97142', 'Two-Tone': '#64748B',
  Custom: '#64748B',
});

const STANDARD_COLOR_BY_KEY = new Map(STANDARD_VEHICLE_COLORS.map((color) => [color.toLowerCase().replace(/[^a-z0-9]+/g, ''), color]));
const FINISH_BY_KEY = new Map(VEHICLE_COLOR_FINISHES.map((finish) => [finish.toLowerCase().replace(/[^a-z0-9]+/g, ''), finish]));
const ABSENT_COLOR_KEYS = new Set(['', 'unknown', 'unknowncolor', 'n/a', 'na', 'none', 'notspecified', 'notset']);

const COLOR_PATTERNS = [
  ['Two-Tone', /\b(two[ -]?tone|bi[ -]?tone|dual[ -]?tone|bicolor)\b/i],
  ['Black', /\b(black|obsidian|onyx|raven|ebony|jet)\b/i],
  ['White', /\b(white|alpine|glacier|ivory|porcelain)\b/i],
  ['Gray', /\b(gr[ae]y|graphite|gunmetal|charcoal|cement|celestite)\b/i],
  ['Silver', /\b(silver|aluminium|aluminum|platinum metallic)\b/i],
  ['Red', /\b(red|ruby|scarlet|crimson|burgundy|maroon|rosso|milano|flame|tornado|renaissance)\b/i],
  ['Blue', /\b(blue|azure|navy|cobalt|estoril|laguna|yas marina)\b/i],
  ['Green', /\b(green|emerald|olive|forest|jade|british racing)\b/i],
  ['Yellow', /\b(yellow|canary|sunburst|solar)\b/i],
  ['Orange', /\b(orange|tangerine|papaya)\b/i],
  ['Brown', /\b(brown|mocha|chocolate|espresso|walnut)\b/i],
  ['Gold', /\b(gold|champagne)\b/i],
  ['Purple', /\b(purple|violet|plum|amethyst)\b/i],
  ['Pink', /\b(pink|magenta|fuchsia)\b/i],
  ['Beige', /\b(beige|tan|sand|khaki|cream)\b/i],
  ['Bronze', /\b(bronze|copper)\b/i],
];

export const normalizeVehicleColorKey = (value) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()
  .replace(/\s+/g, ' ');

const compactKey = (value) => normalizeVehicleColorKey(value).replace(/\s+/g, '');
const cleanText = (value, name, { required = false, max = 300 } = {}) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw Object.assign(new Error(`${name} must be ${required ? 'a nonempty ' : ''}string of at most ${max} characters.`), {
      code: 'VEHICLE_COLOR_INVALID', statusCode: 422,
    });
  }
  return value.trim().replace(/\s+/g, ' ');
};

const normalizeYear = (value, required = false) => {
  if (value == null || value === '') {
    if (!required) return null;
    throw Object.assign(new Error('year is required.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1886 || parsed > 2200) {
    throw Object.assign(new Error('year must be a valid model year.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
  }
  return parsed;
};

export function normalizeStandardVehicleColor(value, fallbackName = '') {
  const exact = STANDARD_COLOR_BY_KEY.get(compactKey(value));
  if (exact) return exact;
  const input = cleanText([value, fallbackName].filter(Boolean).join(' '), 'color', { max: 400 });
  if (!input || ABSENT_COLOR_KEYS.has(compactKey(input))) return null;
  return COLOR_PATTERNS.find(([, pattern]) => pattern.test(input))?.[0] || 'Custom';
}

export function detectVehicleColorFinish(value) {
  const input = cleanText(value, 'finish', { max: 200 });
  if (!input) return '';
  const exact = FINISH_BY_KEY.get(compactKey(input));
  if (exact) return exact;
  if (/\b(two[ -]?tone|bi[ -]?tone|dual[ -]?tone|bicolor)\b/i.test(input)) return 'Two Tone';
  if (/\bcarbon[ -]?fiber\b/i.test(input)) return 'Carbon Fiber';
  if (/\bchrome\b/i.test(input)) return 'Chrome';
  if (/\b(frozen|matte|matt)\b/i.test(input)) return /\bmetallic\b/i.test(input) ? 'Matte Metallic' : 'Matte';
  if (/\bsatin\b/i.test(input)) return 'Satin';
  if (/\b(pearl|pearlescent|mica|crystal)\b/i.test(input)) return 'Pearlescent';
  if (/\bmetallic\b/i.test(input)) return 'Metallic';
  if (/\bgloss\b/i.test(input)) return 'Gloss';
  if (/\bsolid\b/i.test(input)) return 'Solid';
  return '';
}

const normalizeHex = (value) => {
  const input = cleanText(value, 'hexColor', { max: 7 });
  if (!input) return '';
  const candidate = input.startsWith('#') ? input : `#${input}`;
  if (!/^#[0-9a-f]{6}$/i.test(candidate)) {
    throw Object.assign(new Error('hexColor must use #RRGGBB format.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
  }
  return candidate.toUpperCase();
};

const rgbFromHex = (hex) => hex ? {
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
} : undefined;

const normalizeRgb = (value, hex) => {
  if (value == null || value === '') return rgbFromHex(hex);
  let channels = value;
  if (typeof value === 'string') {
    const match = value.match(/^\s*(?:rgb\()?\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?\s*$/i);
    if (!match) throw Object.assign(new Error('rgbValue must contain red, green and blue channels.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
    channels = { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  }
  if (!channels || typeof channels !== 'object' || ['r', 'g', 'b'].some((channel) => !Number.isInteger(Number(channels[channel])) || Number(channels[channel]) < 0 || Number(channels[channel]) > 255)) {
    throw Object.assign(new Error('rgbValue channels must be integers from 0 to 255.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
  }
  return { r: Number(channels.r), g: Number(channels.g), b: Number(channels.b) };
};

const normalizeStringArray = (value, name) => [...new Set((Array.isArray(value) ? value : value ? [value] : [])
  .map((item) => cleanText(item, name, { max: 120 })).filter(Boolean))];

export function normalizeVehicleColorRecord(input, importedAt = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw Object.assign(new Error('Each vehicle color record must be an object.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
  }
  const vehicleBrand = cleanText(input.vehicleBrand ?? input.vehicle_brand ?? input.brand ?? input.make, 'vehicleBrand', { required: true, max: 200 });
  const vehicleModel = cleanText(input.vehicleModel ?? input.vehicle_model ?? input.model, 'vehicleModel', { required: true, max: 200 });
  const year = normalizeYear(input.year, true);
  const factoryColorName = cleanText(input.factoryColorName ?? input.factory_color_name ?? input.colorName, 'factoryColorName', { required: true, max: 200 });
  const standardColor = normalizeStandardVehicleColor(input.standardColor ?? input.standard_color, factoryColorName);
  const paintCode = cleanText(input.paintCode ?? input.paint_code, 'paintCode', { max: 100 });
  const finishType = FINISH_BY_KEY.get(compactKey(input.finishType ?? input.finish_type))
    || detectVehicleColorFinish(input.finishType ?? input.finish_type ?? factoryColorName)
    || 'Solid';
  const hexColor = normalizeHex(input.hexColor ?? input.hex_color ?? input.hex);
  const rgbValue = normalizeRgb(input.rgbValue ?? input.rgb_value ?? input.rgb, hexColor);
  const availability = cleanText(input.availability || 'unknown', 'availability', { required: true, max: 30 }).toLowerCase().replace(/\s+/g, '_');
  if (!['available', 'limited', 'special_edition', 'discontinued', 'unknown'].includes(availability)) {
    throw Object.assign(new Error('availability is invalid.'), { code: 'VEHICLE_COLOR_INVALID', statusCode: 422 });
  }
  const provider = cleanText(input.provider, 'provider', { required: true, max: 100 }).toLowerCase();
  const sourceId = cleanText(input.sourceId ?? input.source_id, 'sourceId', { max: 200 });
  const editionName = cleanText(input.editionName ?? input.edition_name, 'editionName', { max: 200 });
  const brandKey = normalizeVehicleColorKey(vehicleBrand);
  const modelKey = normalizeVehicleColorKey(vehicleModel);
  const factoryColorKey = normalizeVehicleColorKey(factoryColorName);
  const paintCodeKey = normalizeVehicleColorKey(paintCode);
  const editionKey = normalizeVehicleColorKey(editionName);
  return {
    vehicleBrand, vehicleModel, year, factoryColorName, standardColor, paintCode, finishType,
    hexColor, rgbValue, availability,
    specialEdition: Boolean(input.specialEdition ?? input.special_edition ?? availability === 'special_edition'),
    editionName, regions: normalizeStringArray(input.regions, 'region'),
    brandKey, modelKey, factoryColorKey, paintCodeKey,
    importKey: [brandKey, modelKey, year, factoryColorKey, paintCodeKey, editionKey, provider].join('|'),
    source: {
      provider,
      sourceId,
      sourceUrl: cleanText(input.sourceUrl ?? input.source_url, 'sourceUrl', { max: 1000 }),
      license: cleanText(input.license, 'license', { max: 300 }),
      importedAt,
      sourceUpdatedAt: input.sourceUpdatedAt || input.source_updated_at ? new Date(input.sourceUpdatedAt ?? input.source_updated_at) : null,
    },
  };
}

export async function upsertVehicleColorBatch(inputs, options = {}) {
  if (!Array.isArray(inputs) || inputs.length === 0) return { received: 0, upserted: 0, modified: 0 };
  const maxBatchSize = options.maxBatchSize || 1000;
  if (inputs.length > maxBatchSize) {
    throw Object.assign(new Error(`Vehicle color imports are limited to ${maxBatchSize} records per batch.`), {
      code: 'VEHICLE_COLOR_BATCH_TOO_LARGE', statusCode: 413,
    });
  }
  const importedAt = options.importedAt || new Date();
  const normalized = inputs.map((input) => normalizeVehicleColorRecord(input, importedAt));
  const records = [...new Map(normalized.map((record) => [record.importKey, record])).values()];
  const result = await VehicleColor.bulkWrite(records.map((record) => ({
    updateOne: { filter: { importKey: record.importKey }, update: { $set: record }, upsert: true },
  })), { ordered: false });
  return {
    received: inputs.length,
    unique: records.length,
    upserted: result.upsertedCount || 0,
    modified: result.modifiedCount || 0,
  };
}

export async function findExactOemVehicleColor({ brand, make, model, year, color, factoryColorName, paintCode }) {
  const brandKey = normalizeVehicleColorKey(brand || make);
  const modelKey = normalizeVehicleColorKey(model);
  const parsedYear = normalizeYear(year, false);
  const nameKey = normalizeVehicleColorKey(factoryColorName || color);
  const codeKey = normalizeVehicleColorKey(paintCode);
  if (!brandKey || !modelKey || !parsedYear || (!nameKey && !codeKey)) return null;
  const query = { brandKey, modelKey, year: parsedYear };
  if (nameKey) query.factoryColorKey = nameKey;
  if (codeKey) query.paintCodeKey = codeKey;
  return VehicleColor.findOne(query).sort({ specialEdition: -1, updatedAt: -1 }).lean();
}

export async function resolveVehicleColor(input = {}) {
  const suppliedColor = cleanText(input.factoryColorName || input.color, 'color', { max: 200 });
  const suppliedPaintCode = cleanText(input.paintCode, 'paintCode', { max: 100 });
  const hasUsableColor = suppliedColor && !ABSENT_COLOR_KEYS.has(compactKey(suppliedColor));
  const oem = await findExactOemVehicleColor(input);
  if (oem) {
    return {
      displayColor: oem.factoryColorName,
      standardColor: oem.standardColor,
      factoryColorName: oem.factoryColorName,
      paintCode: oem.paintCode || '',
      finishType: oem.finishType || '',
      hexColor: oem.hexColor || STANDARD_COLOR_HEX[oem.standardColor] || '',
      rgbValue: oem.rgbValue,
      colorSource: 'oem_database',
      colorDatabaseId: oem._id,
      reason: 'EXACT_OEM_COLOR_MATCH',
    };
  }
  if (hasUsableColor) {
    const standardColor = normalizeStandardVehicleColor(suppliedColor) || 'Custom';
    const exactStandard = STANDARD_COLOR_BY_KEY.get(compactKey(suppliedColor));
    return {
      displayColor: exactStandard || suppliedColor,
      standardColor,
      factoryColorName: '',
      paintCode: suppliedPaintCode,
      finishType: detectVehicleColorFinish(suppliedColor),
      hexColor: STANDARD_COLOR_HEX[standardColor] || '',
      rgbValue: undefined,
      colorSource: 'user_selected',
      colorDatabaseId: null,
      reason: 'USER_SELECTED_COLOR',
    };
  }
  if (suppliedPaintCode) {
    return {
      displayColor: `Paint code ${suppliedPaintCode}`,
      standardColor: 'Custom',
      factoryColorName: '',
      paintCode: suppliedPaintCode,
      finishType: '',
      hexColor: STANDARD_COLOR_HEX.Custom,
      rgbValue: undefined,
      colorSource: 'user_selected',
      colorDatabaseId: null,
      reason: 'USER_SUPPLIED_PAINT_CODE',
    };
  }
  return {
    displayColor: VEHICLE_COLOR_NOT_SPECIFIED,
    standardColor: null,
    factoryColorName: '',
    paintCode: '',
    finishType: '',
    hexColor: '',
    rgbValue: undefined,
    colorSource: 'not_specified',
    colorDatabaseId: null,
    reason: 'NO_COLOR_DATA',
  };
}

export async function vehicleColorFields(input = {}) {
  const resolved = await resolveVehicleColor(input);
  return {
    color: resolved.displayColor,
    standardColor: resolved.standardColor || undefined,
    factoryColorName: resolved.factoryColorName,
    paintCode: resolved.paintCode,
    finishType: resolved.finishType,
    colorHex: resolved.hexColor,
    colorRgb: resolved.rgbValue,
    colorSource: resolved.colorSource,
    colorDatabaseId: resolved.colorDatabaseId,
    colorResolution: { reason: resolved.reason, resolvedAt: new Date() },
  };
}

export async function listVehicleColors(query = {}) {
  const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 250);
  const filter = {};
  if (query.brand) filter.brandKey = normalizeVehicleColorKey(query.brand);
  if (query.model) filter.modelKey = normalizeVehicleColorKey(query.model);
  if (query.year != null && query.year !== '') filter.year = normalizeYear(query.year, false);
  if (query.standardColor) {
    const standardColor = normalizeStandardVehicleColor(query.standardColor);
    if (!standardColor) return { data: [], nextCursor: null };
    filter.standardColor = standardColor;
  }
  if (query.after) filter._id = { $gt: query.after };
  if (query.q) {
    const q = normalizeVehicleColorKey(query.q);
    filter.$or = [{ factoryColorKey: { $regex: `^${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } }, { paintCodeKey: q }];
  }
  const data = await VehicleColor.find(filter).sort({ _id: 1 }).limit(limit).lean();
  return { data, nextCursor: data.length === limit ? String(data.at(-1)._id) : null };
}

export async function vehicleColorCoverage() {
  const [records, brands, models, years, factoryColors, specialEditions] = await Promise.all([
    VehicleColor.countDocuments(),
    VehicleColor.distinct('brandKey'),
    VehicleColor.aggregate([{ $group: { _id: { brand: '$brandKey', model: '$modelKey' } } }, { $count: 'count' }]),
    VehicleColor.distinct('year'),
    VehicleColor.distinct('factoryColorKey'),
    VehicleColor.countDocuments({ specialEdition: true }),
  ]);
  return {
    records,
    manufacturers: brands.length,
    models: models[0]?.count || 0,
    years: years.length,
    earliestYear: years.length ? Math.min(...years) : null,
    latestYear: years.length ? Math.max(...years) : null,
    factoryColors: factoryColors.length,
    specialEditions,
  };
}
