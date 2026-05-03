/**
 * Estimator Service — AutoSPF+ Damage → Cost Mapping
 * ════════════════════════════════════════════════════
 *
 * Maps GPT-4 Vision damage detections to AutoSPF+ packages and produces
 * a customer-friendly cost estimate.
 *
 * Severity → Package mapping:
 *   high   → SPF 99 Premium    (₱13,999 – ₱22,999 base)
 *   medium → SPF 89 Advanced   (₱8,999  – ₱17,999 base)
 *   low    → SPF 80 Essential  (₱7,499  – ₱12,999 base)
 *
 * Returns: { lineItems, subtotal, totalEstimate, recommendedPackage,
 *            savingsAmount, condition, urgency }
 */

const PHP = (n) => `₱${Math.max(0, Math.round(Number(n) || 0)).toLocaleString('en-PH')}`;

/**
 * Canonical AutoSPF+ packages — mirrors the SPF_PACKAGES array used by the
 * mobile booking flow so prices stay aligned across surfaces.
 */
export const SPF_PACKAGE_CATALOG = {
  'SPF 80 Essential': {
    key: 'spf80',
    name: 'SPF 80 Essential',
    tier: 'essential',
    severity: 'low',
    durationYears: 3,
    basePrice: 7999,
    premiumPrice: 12999,
    description: '3 layers Graphene Ceramic Coating · Graphene Sealant · Free signature carwash',
    icon: 'shield-checkmark-outline',
    color: '#22C55E',
  },
  'SPF 89 Advanced': {
    key: 'spf89',
    name: 'SPF 89 Advanced',
    tier: 'advanced',
    severity: 'medium',
    durationYears: 5,
    basePrice: 9999,
    premiumPrice: 17999,
    description: '4 layers Graphene Ceramic Coating · Graphene Sealant · Free maintenance visit',
    icon: 'shield-half-outline',
    color: '#F59E0B',
  },
  'SPF 99 Premium': {
    key: 'spf99',
    name: 'SPF 99 Premium',
    tier: 'premium',
    severity: 'high',
    durationYears: 10,
    basePrice: 13999,
    premiumPrice: 22999,
    description: '4 layers SONAX Profiline CC EVO · Free recoat after 5 years · 2 free maintenance visits',
    icon: 'diamond-outline',
    color: '#EF4444',
  },
};

const SEVERITY_TO_PACKAGE = {
  high: 'SPF 99 Premium',
  medium: 'SPF 89 Advanced',
  low: 'SPF 80 Essential',
};

const SEVERITY_PRICE_FACTOR = {
  high: 0.55,    // High = larger fraction of premium price
  medium: 0.40,
  low: 0.25,
};

const URGENCY_BY_SEVERITY = {
  high: 'Immediate',
  medium: 'Can Wait',
  low: 'Optional',
};

const PRICING_DELTAS = {
  // Per-area uplift (₱) — heavier panels cost more
  'front bumper': 1500,
  'rear bumper': 1500,
  'hood': 2200,
  'trunk': 1800,
  'roof': 2400,
  'fender': 1800,
  'door panel': 1700,
  'quarter panel': 2100,
  'headlight': -800,
  'tail light': -800,
  'mirror': -500,
};

const safeArray = (v) => (Array.isArray(v) ? v : []);

const matchAreaDelta = (affectedArea = '') => {
  const lower = String(affectedArea).toLowerCase();
  for (const key of Object.keys(PRICING_DELTAS)) {
    if (lower.includes(key)) return PRICING_DELTAS[key];
  }
  return 0;
};

const computeLineItem = (damage, index) => {
  const severity = ['high', 'medium', 'low'].includes(damage?.severity)
    ? damage.severity
    : 'medium';
  const packageName = SEVERITY_TO_PACKAGE[severity];
  const pkg = SPF_PACKAGE_CATALOG[packageName];
  const delta = matchAreaDelta(damage?.affectedArea || damage?.location || '');

  const factor = SEVERITY_PRICE_FACTOR[severity];
  const subtotalMin = Math.max(800, Math.round(pkg.basePrice * factor + delta));
  const subtotalMax = Math.max(subtotalMin + 1000, Math.round(pkg.premiumPrice * factor + delta * 1.6));

  return {
    id: damage?.id || `line_${index + 1}`,
    damageId: damage?.id || `dmg_${index + 1}`,
    serviceId: pkg.key,
    serviceName: pkg.name,
    description: pkg.description,
    affectedArea: damage?.affectedArea || damage?.location || 'Vehicle Body',
    damageType: damage?.type || damage?.damage_type || 'Damage',
    severity,
    urgency: damage?.urgency || URGENCY_BY_SEVERITY[severity],
    confidence: Math.max(0, Math.min(1, Number(damage?.confidence) || 0.85)),
    subtotalMin,
    subtotalMax,
    formattedSubtotal: `${PHP(subtotalMin)} – ${PHP(subtotalMax)}`,
    icon: pkg.icon,
    color: pkg.color,
  };
};

const pickRecommendedPackage = (damages = []) => {
  if (damages.some((d) => d.severity === 'high')) return SPF_PACKAGE_CATALOG['SPF 99 Premium'];
  if (damages.some((d) => d.severity === 'medium')) return SPF_PACKAGE_CATALOG['SPF 89 Advanced'];
  return SPF_PACKAGE_CATALOG['SPF 80 Essential'];
};

const pickOverallUrgency = (damages = []) => {
  if (damages.some((d) => d.severity === 'high')) return 'Immediate';
  if (damages.some((d) => d.severity === 'medium')) return 'Can Wait';
  return 'Optional';
};

const pickOverallCondition = (damages = []) => {
  if (!damages.length) return 'Excellent';
  const counts = damages.reduce((acc, d) => {
    acc[d.severity] = (acc[d.severity] || 0) + 1;
    return acc;
  }, {});
  if ((counts.high || 0) >= 2) return 'Poor';
  if (counts.high) return 'Fair';
  if ((counts.medium || 0) >= 2) return 'Fair';
  if (counts.medium) return 'Good';
  return 'Excellent';
};

/**
 * Build a complete estimate from a list of damage detections.
 *
 * Input damage shape (matches GPT-4 Vision service output):
 *   { id, type, severity, affectedArea, confidence, urgency, ... }
 */
export const buildEstimateFromDamages = (damages = []) => {
  const cleaned = safeArray(damages).filter((d) => d && (d.severity || d.type));
  const lineItems = cleaned.map((d, i) => computeLineItem(d, i));

  const subtotalMin = lineItems.reduce((s, l) => s + l.subtotalMin, 0);
  const subtotalMax = lineItems.reduce((s, l) => s + l.subtotalMax, 0);
  const recommendedAverage = Math.round((subtotalMin + subtotalMax) / 2);

  const recommended = pickRecommendedPackage(cleaned);

  // Bundle savings — choosing the recommended package vs paying line-by-line
  const lineTotal = subtotalMax;
  const bundlePrice = recommended.premiumPrice;
  const savingsAmount = Math.max(0, lineTotal - bundlePrice);

  return {
    currency: 'PHP',
    lineItems,
    subtotal: subtotalMin,
    subtotalMax,
    totalEstimate: recommendedAverage,
    formattedSubtotal: `${PHP(subtotalMin)} – ${PHP(subtotalMax)}`,
    formattedTotal: PHP(recommendedAverage),
    recommendedPackage: {
      id: recommended.key,
      name: recommended.name,
      tier: recommended.tier,
      durationYears: recommended.durationYears,
      basePrice: recommended.basePrice,
      premiumPrice: recommended.premiumPrice,
      description: recommended.description,
      formattedPrice: `${PHP(recommended.basePrice)} – ${PHP(recommended.premiumPrice)}`,
      color: recommended.color,
      icon: recommended.icon,
    },
    savingsAmount,
    formattedSavings: PHP(savingsAmount),
    condition: pickOverallCondition(cleaned),
    urgency: pickOverallUrgency(cleaned),
    assumptions: [
      'Estimate is generated from AI damage detection and AutoSPF+ package pricing.',
      'Final price will be confirmed after in-person inspection at the service center.',
      'Bundle pricing applies when booking the recommended SPF package.',
    ],
  };
};

export default {
  SPF_PACKAGE_CATALOG,
  buildEstimateFromDamages,
};
