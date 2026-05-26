import Service from '../models/service.model.js';
import {
  SPF_PACKAGE_PRICING,
  VEHICLE_PRICE_FIELDS,
  getPackageKeyFromName,
} from '../constants/spfPricing.js';

const toNumberOrNull = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const LEGACY_PRICE_KEYS = {
  hatchback: 'hatchback',
  sedan: 'sedan',
  midsized: 'midsized',
  suv: 'suv',
  pickup: 'pickup',
  largeSuv: 'largesuv',
  highend: 'highend',
};

const VEHICLE_TYPE_ALIASES = [
  { apiKey: 'hatchback', label: 'Hatchback', patterns: [/\bhatch\s*back\b/i, /\bhatchback\b/i] },
  { apiKey: 'sedan', label: 'Sedan', patterns: [/\bsedan\b/i, /\bsaloon\b/i] },
  { apiKey: 'midsized', label: 'Midsized', patterns: [/\bmid[\s-]?siz(?:ed|e)?\b/i, /\bmid\s*size\b/i] },
  { apiKey: 'suv', label: 'SUV', patterns: [/\bsuv\b/i, /\bsport\s*utility\b/i, /\bcrossover\b/i] },
  { apiKey: 'pickup', label: 'Pick Up', patterns: [/\bpick[\s-]?up\b/i, /\btruck\b/i] },
  { apiKey: 'largeSuv', label: 'Large SUV / Van', patterns: [/\blarge\s*suv\b/i, /\bfull[\s-]?size\s*suv\b/i, /\bvan\b/i] },
  { apiKey: 'highend', label: 'Highend Sedan', patterns: [/\bhigh[\s-]?end\b/i, /\bluxury\s*sedan\b/i, /\bpremium\s*sedan\b/i] },
];

const PPF_PRICE_ROWS = [
  { vehicle: 'Sedan / Hatch', prices: ['₱75,000', '₱80,000', '₱90,000', '₱120,000'] },
  { vehicle: 'Crossover', prices: ['₱80,000', '₱85,000', '₱95,000', '₱135,000'] },
  { vehicle: 'SUV / Pick Up', prices: ['₱85,000', '₱90,000', '₱100,000', '₱140,000'] },
  { vehicle: 'Full-Size SUV', prices: ['₱100,000', '₱110,000', '₱120,000', '₱150,000'] },
];

const ADD_ON_SERVICE_ROWS = [
  { name: 'Undercoating', price: '₱8,000' },
  { name: 'Repainting', price: 'Per panel' },
  { name: 'PDR (Paintless Dent Repair)', price: 'Per dent' },
  { name: 'PPF per panel', price: 'Per panel' },
  { name: 'Interior Detailing', price: 'Inquire' },
  { name: 'Engine Wash / Detailing', price: 'Inquire' },
];

export const formatCurrency = (value) => `₱${Number(value || 0).toLocaleString('en-PH')}`;

const getPublishedSpfServices = async () => {
  const services = await Service.find({
    status: 'Active',
    isPublished: true,
    name: { $regex: /spf\s*[-_]*(80|89|99|101)/i },
  })
    .select('name pricing prices basePrice')
    .lean();

  return services;
};

const getPricingEntry = (publishedService, packageDefaults, apiKey) => {
  const legacyKey = LEGACY_PRICE_KEYS[apiKey];
  const fromDb = publishedService?.pricing?.[apiKey] || {};
  const legacyBase = publishedService?.prices?.[legacyKey];

  return {
    base:
      toNumberOrNull(fromDb.base)
      ?? toNumberOrNull(legacyBase)
      ?? toNumberOrNull(packageDefaults.base[apiKey]),
    original:
      toNumberOrNull(fromDb.original) ?? toNumberOrNull(packageDefaults.original[apiKey]),
    addon: toNumberOrNull(fromDb.addon) ?? toNumberOrNull(packageDefaults.addon[apiKey]),
  };
};

/**
 * Merges Mongo published SPF services with bundled defaults (same source as /services page).
 */
export const buildSpfPricingMatrix = async () => {
  const published = await getPublishedSpfServices();
  const publishedByKey = new Map();

  published.forEach((service) => {
    const key = getPackageKeyFromName(service.name);
    if (key && !publishedByKey.has(key)) {
      publishedByKey.set(key, service);
    }
  });

  const packages = Object.entries(SPF_PACKAGE_PRICING).map(([packageKey, defaults]) => {
    const publishedService = publishedByKey.get(packageKey);
    const byVehicle = {};

    VEHICLE_PRICE_FIELDS.forEach(({ apiKey }) => {
      byVehicle[apiKey] = getPricingEntry(publishedService, defaults, apiKey);
    });

    return {
      packageKey,
      name: publishedService?.name || defaults.name,
      description: defaults.description,
      duration: defaults.duration,
      byVehicle,
    };
  });

  return packages.sort((a, b) => {
    const order = { spf80: 1, spf89: 2, spf99: 3, spf101: 4 };
    return (order[a.packageKey] || 99) - (order[b.packageKey] || 99);
  });
};

export const detectVehicleTypeFromMessage = (message = '') => {
  const text = String(message).toLowerCase();
  const hits = VEHICLE_TYPE_ALIASES.filter((entry) => entry.patterns.some((pattern) => pattern.test(text)));

  if (hits.length === 1) return hits[0];
  if (hits.length > 1) {
    const specific = hits.find((entry) => entry.apiKey === 'midsized') || hits[0];
    return specific;
  }
  return null;
};

export const getVehicleLabel = (apiKey) => {
  const fromAlias = VEHICLE_TYPE_ALIASES.find((entry) => entry.apiKey === apiKey);
  if (fromAlias) return fromAlias.label;
  const fromFields = VEHICLE_PRICE_FIELDS.find((field) => field.apiKey === apiKey);
  return fromFields?.label || apiKey;
};

const formatPackageLine = (pkgName, entry) => {
  if (entry.base == null) return null;

  const promo = formatCurrency(entry.base);
  if (entry.original != null && entry.original > entry.base) {
    return `${pkgName}: ${promo} promotional (regular ${formatCurrency(entry.original)})`;
  }
  return `${pkgName}: ${promo}`;
};

const formatVehicleSection = (vehicleLabel, packages, apiKey) => {
  const lines = packages
    .map((pkg) => formatPackageLine(pkg.name, pkg.byVehicle[apiKey]))
    .filter(Boolean);

  if (!lines.length) return null;
  return `**${vehicleLabel}**\n${lines.map((line) => `- ${line}`).join('\n')}`;
};

const formatPackageName = (name = '') => String(name).replace(/\s+—\s+.*$/, '').trim();

const formatCompactPackagePrice = (pkg, apiKey, field) => {
  const value = pkg.byVehicle?.[apiKey]?.[field];
  if (value == null) return null;
  return `${formatPackageName(pkg.name)} ${formatCurrency(value)}`;
};

const formatVehiclePriceRows = (packages, field) => VEHICLE_PRICE_FIELDS
  .map(({ apiKey, label }) => {
    const prices = packages
      .map((pkg) => formatCompactPackagePrice(pkg, apiKey, field))
      .filter(Boolean);

    if (!prices.length) return null;
    return `• ${label}: ${prices.join(' | ')}`;
  })
  .filter(Boolean);

const formatPublishedOtherServices = async () => {
  const services = await Service.find({
    status: 'Active',
    isPublished: true,
    name: { $not: { $regex: /spf\s*[-_]*(80|89|99|101)/i } },
    basePrice: { $ne: null },
  })
    .select('name basePrice category')
    .sort({ bookingCount: -1, createdAt: -1 })
    .limit(12)
    .lean();

  const rows = services
    .map((service) => {
      const price = toNumberOrNull(service.basePrice);
      if (price == null) return null;
      return `• ${service.name}: from ${formatCurrency(price)}`;
    })
    .filter(Boolean);

  return rows;
};

export const buildCompleteServicePriceListReply = async () => {
  const packages = await buildSpfPricingMatrix();
  const spfRows = formatVehiclePriceRows(packages, 'base');
  const tintRows = formatVehiclePriceRows(packages, 'addon');
  const publishedOtherRows = await formatPublishedOtherServices();

  return [
    'AutoSPF+ official service price list',
    'SPF Ceramic Coating packages — promo price by vehicle type:',
    ...spfRows,
    '',
    'SPF package with Nano Ceramic Window Tint:',
    ...tintRows,
    '',
    'Full-body PPF — all TPU material:',
    '• Columns: CEO PPF | XPEL | Vinyl Frog | ZIVENT',
    ...PPF_PRICE_ROWS.map((row) => `• ${row.vehicle}: ${row.prices.join(' | ')}`),
    '',
    'Add-on services:',
    ...ADD_ON_SERVICE_ROWS.map((row) => `• ${row.name}: ${row.price}`),
    ...(publishedOtherRows.length ? ['', 'Other published services:', ...publishedOtherRows] : []),
    '',
    'Tell me your vehicle type and I can recommend the best AutoSPF+ package for your budget.',
  ].join('\n');
};

export const buildSpfPricingKnowledge = async (preferredVehicleKey = null) => {
  const packages = await buildSpfPricingMatrix();

  if (preferredVehicleKey) {
    const vehicle = VEHICLE_PRICE_FIELDS.find((field) => field.apiKey === preferredVehicleKey)
      || VEHICLE_TYPE_ALIASES.find((entry) => entry.apiKey === preferredVehicleKey);

    const label = vehicle?.label || preferredVehicleKey;
    const section = formatVehicleSection(label, packages, preferredVehicleKey);
    if (section) {
      return [
        '### SPF CERAMIC COATING — OFFICIAL PRICING (matches autoservices page)',
        `Use ONLY these ${label} vehicle prices when answering. Do not substitute sedan or hatchback rates.`,
        section,
        '',
        'Optional add-on: Nano Ceramic Window Tint pricing is listed separately on the Services page when applicable.',
      ].join('\n');
    }
  }

  const sections = VEHICLE_PRICE_FIELDS.map(({ apiKey, label }) => formatVehicleSection(label, packages, apiKey))
    .filter(Boolean);

  return [
    '### SPF CERAMIC COATING — OFFICIAL PRICING BY VEHICLE TYPE',
    'These rates match the public Services page (/services). Promotional price is what customers pay; regular price is the pre-discount reference shown struck through on the site.',
    'When the customer names a vehicle type (sedan, midsized, SUV, etc.), quote ONLY that section. If vehicle type is unknown, ask before quoting.',
    '',
    sections.join('\n\n'),
  ].join('\n');
};

export const buildOtherServicesSummary = async () => {
  const services = await Service.find({
    status: 'Active',
    isPublished: true,
    name: { $not: { $regex: /spf\s*[-_]*(80|89|99|101)/i } },
  })
    .select('name basePrice category duration')
    .sort({ bookingCount: -1, createdAt: -1 })
    .limit(30)
    .lean();

  if (!services.length) return '';

  const lines = services.map(
    (service) => `${service.name} (${service.category || 'Standard'}) — from ${formatCurrency(service.basePrice)}`,
  );

  return ['### OTHER PUBLISHED SERVICES', lines.join('\n')].join('\n');
};

/** Topics the concierge may discuss — everything else must be declined. */
const SHOP_TOPIC_PATTERNS = [
  /\bautospf\b/i,
  /\bauto\s*spf\b/i,
  /\b(price|pric|price\s*list|pricelist|rate|rates|cost|quote|estimate|magkano|presyo|pricing)\b/i,
  /\b(book|booking|schedule|appointment|reserve|paano.*book|mag[\s-]?book)\b/i,
  /\b(login|log[\s-]?in|sign[\s-]?in|register|sign[\s-]?up|account|password|dashboard)\b/i,
  /\b(gawan|gawa|gumawa|igawa|iregister|i-register|pa\s*register|signup\s+ako|create\s+acc|gawa\s+acc)\b/i,
  /\b(spf|ppf|ceramic|coating|detailing|detail|tint|undercoat|graphene|wax|wash|sonax)\b/i,
  /\b(sedan|suv|hatchback|midsized|pickup|vehicle|vihicle|vechicle|kotse|sasakyan|car)\b/i,
  /\b(service|package|menu|offer|promo|website|site)\b/i,
  /\b(location|address|hours|open|contact|phone|las\s*piñas|piñas|marcos)\b/i,
  /\b(track|repair|order|status|waiver)\b/i,
  /\b(payment|pay|gcash|installment|down[\s-]?payment)\b/i,
  /\b(wrong|incorrect|mistake|correction|correct|mali|palitan|change|update)\b[\s\S]{0,80}\b(email|mail|phone|mobile|number|name|reference|appointment|booking)\b/i,
  /\b(scan|damage|ai\b)/i,
  /\b(gallery|about|contact|services)\b/i,
  /\b(warranty|protection|years?)\b/i,
  /\b(included|include|features?|kasama)\b/i,
  /\b(how\s+(to|do)|paano|what\s+is\s+(spf|ppf|ceramic))\b/i,
  /\b(hello|hi|hey|good\s*(morning|afternoon|evening)|kamusta|musta)\b/i,
  /\b(salamat|thank|thanks)\b/i,
  /\b(nagiisip|isip\s+pa|thinking|sandali|antay)\b/i,
  /\b(kasi|lang|po|naman)\b/i,
];

const CASUAL_IN_SCOPE_PATTERNS = [
  /^(okay|ok|oke|k|yes|yep|yeah|sure|sige|oo|hmm+|ah+|wait|thanks|thank\s+you|salamat|got\s+it|noted|alright)[\s!.?]*$/i,
  /\b(nagiisip|isip\s+pa|thinking|sandali|hold\s+on|antay)\b/i,
  /^price\??$/i,
  /\b(what\s+)?services?\??$/i,
  /\b(presyo|magkano)\b/i,
];

const OFF_TOPIC_BLOCK_PATTERNS = [
  /\b(weather|forecast|temperature|ulan)\b/i,
  /\b(recipe|cook|bake|lutuin)\b/i,
  /\b(joke|funny|story|poem|riddle|kwentong)\b/i,
  /\b(homework|essay|assignment|exam)\b/i,
  /\b(president|election|politics|religion|war)\b/i,
  /\b(bitcoin|crypto|stock\s*market|forex|trading)\b/i,
  /\b(python|javascript|react|programming|debug\s+code)\b/i,
  /\b(movie|song|lyrics|celebrity|gossip|nba|football)\b/i,
  /\b(capital\s+of|who\s+(invented|discovered)|solve\s+for\s+x)\b/i,
  /\btranslate\s+(this|to)\b/i,
  /\b(medical|doctor|medicine|sick|disease)\b/i,
  /\b(other\s+shop|competitor|cheaper\s+than)\b/i,
];

const FOLLOW_UP_PATTERNS = [
  /^(yes|no|okay|ok|sure|sige|oo|hindi|yep|nope|hmm+|wait|thanks|salamat)[\s!.?]*$/i,
  /^(midsized|sedan|suv|hatchback|pickup|highend|large\s*suv|van)\b/i,
  /^spf\s*[-_]?\s*(80|89|99|101)\b/i,
  /^[\d\s,+().-]{7,25}$/,
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
];

export const OFF_TOPIC_REPLY =
  'I can help with AutoSPF+ pricing, booking, tracker, location, hours, and services. Which one should we focus on?';

const messageMatchesShopTopic = (text) => SHOP_TOPIC_PATTERNS.some((pattern) => pattern.test(text));

const messageMatchesFollowUp = (text) => FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(text.trim()));

export const isPriceListRequest = (message = '') => {
  const text = String(message).trim();
  if (!text) return false;

  return [
    /\b(price\s*list|pricelist|rate\s*card|pricing\s*table|service\s*menu)\b/i,
    /\b(send|show|give|provide|share)\b[\s\S]{0,80}\b(prices?|pricing|presyo|rates?)\b/i,
    /\b(all|complete|full|lahat|buong)\b[\s\S]{0,80}\b(prices?|pricing|presyo|rates?)\b/i,
    /\b(prices?|pricing|presyo|rates?)\b[\s\S]{0,80}\b(vehicle|vihicle|vechicle|sasakyan|kotse|car|services?)\b/i,
  ].some((pattern) => pattern.test(text));
};

/**
 * Returns true when the message is allowed for the AutoSPF+ concierge.
 * @param {string} message
 * @param {string[]} recentUserMessages - prior user lines in this session (newest first)
 */
export const isAutoSpfScopeMessage = (message = '', recentUserMessages = []) => {
  const text = String(message).trim();
  if (!text) return false;

  if (CASUAL_IN_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) return true;

  if (messageMatchesShopTopic(text)) return true;

  const recentHasShopContext = recentUserMessages.some((line) => messageMatchesShopTopic(String(line || '')));

  if (messageMatchesFollowUp(text)) {
    if (recentHasShopContext) return true;
    if (text.length <= 24) return true;
  }

  const isBriefSocial = /^(hi|hello|hey|kamusta|musta|good\s*(morning|afternoon|evening))[\s!.?]*$/i.test(text);
  if (isBriefSocial) return true;

  if (OFF_TOPIC_BLOCK_PATTERNS.some((pattern) => pattern.test(text)) && !messageMatchesShopTopic(text)) {
    return false;
  }

  if (recentHasShopContext && text.length <= 80) return true;

  if (text.length <= 48 && /\b(kasi|lang|po|naman|ba|eh)\b/i.test(text) && recentHasShopContext) {
    return true;
  }

  return false;
};

export const buildWebsiteGuide = () => [
  '### AUTOSPF+ WEBSITE — WHAT YOU MAY EXPLAIN',
  '- **Services (/services):** SPF 80/89/99/101 packages; prices change by vehicle type (hatchback, sedan, midsized, SUV, pick up, large SUV/van, highend sedan).',
  '- **Book Now:** Customer picks package → vehicle details → schedule → confirm. Guest users may need name & phone for quotes.',
  '- **Login / Register:** Top nav **Login**; customers use dashboard for bookings, live tracker, garage, AI scan.',
  '- **Gallery / About / Contact:** Shop proof, team story, map & contact form.',
  '- **Live tracker:** Logged-in customers see job progress after booking.',
  '- **Location:** Las Piñas City, Metro Manila (Marcos Alvarez Ave.).',
  '- Human help: Only suggest Talk to a protection specialist when the customer explicitly asks for a person or has a serious unresolved complaint.',
].join('\n');
