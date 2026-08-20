import {
  detectVehiclePart,
  normalizeSelectedDamageArea,
} from '../utils/vehiclePartMapper.utils.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, Number(value) || 0));

const DAMAGE_NAMES = {
  scratch: 'Scratch',
  paint_scratch: 'Paint Scratch',
  dent: 'Dent',
  deep_dent: 'Deep Dent',
  crack: 'Crack',
  paint_chip: 'Paint Chip',
  scuff: 'Surface Scuff',
  scrape: 'Surface Scrape',
  rust: 'Rust / Corrosion',
  corrosion: 'Rust / Corrosion',
  broken_light: 'Broken Light',
  shattered_glass: 'Shattered Glass',
  damage: 'Vehicle Damage',
};

const REPAIR_RECOMMENDATIONS = {
  scratch: 'Inspect paint depth, then compound and polish or apply localized touch-up paint.',
  paint_scratch: 'Inspect paint depth, then compound and polish or apply localized touch-up paint.',
  dent: 'Inspect the panel for paint stress and perform paintless dent repair when suitable.',
  deep_dent: 'Straighten the affected panel and refinish the damaged paint system.',
  crack: 'Stabilize the crack, repair or replace the component, then refinish the area.',
  paint_chip: 'Clean, prime, color-match, and seal the exposed paint chip.',
  scuff: 'Remove transferred material and machine-polish the affected surface.',
  scrape: 'Level the damaged surface, spot-repair the paint, and blend the finish.',
  rust: 'Remove corrosion, apply rust treatment and primer, then refinish the panel.',
  corrosion: 'Remove corrosion, apply rust treatment and primer, then refinish the panel.',
  broken_light: 'Replace the damaged lamp assembly and inspect its mounts and wiring.',
  shattered_glass: 'Replace the damaged glass before the vehicle is returned to service.',
};

const canonicalKey = (value) => String(value || 'damage')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '') || 'damage';

const titleCase = (value) => String(value || 'Vehicle Damage')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const polygonArea = (points = []) => {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += (Number(current?.x) || 0) * (Number(next?.y) || 0)
      - (Number(next?.x) || 0) * (Number(current?.y) || 0);
  }
  return Math.abs(sum) / 2;
};

const resolveSeverity = (damageKey, areaPercentage) => {
  const structural = ['deep_dent', 'shattered_glass', 'broken_light'];
  if (structural.includes(damageKey) || areaPercentage >= 8) return 'high';
  if (areaPercentage >= 2 || ['dent', 'crack', 'rust', 'corrosion'].includes(damageKey)) return 'medium';
  return 'low';
};

const urgencyFor = (severity) => {
  if (severity === 'high') return 'Immediate';
  if (severity === 'medium') return 'Can Wait';
  return 'Optional';
};

export const buildDamageIssue = (prediction, context = {}) => {
  const imageWidth = Math.max(1, Number(context.imageWidth) || 1);
  const imageHeight = Math.max(1, Number(context.imageHeight) || 1);
  const damageKey = canonicalKey(prediction.class || prediction.class_name || prediction.label);
  const confidence = clamp(prediction.confidence ?? prediction.score);

  const box = prediction.boundingBox || {};
  const normalizedBox = {
    x: clamp(box.x / imageWidth),
    y: clamp(box.y / imageHeight),
    width: clamp(box.width / imageWidth),
    height: clamp(box.height / imageHeight),
  };

  const pixelPoints = Array.isArray(prediction.points) ? prediction.points : [];
  const normalizedPoints = pixelPoints
    .map((point) => ({
      x: Number(clamp((Number(point?.x) || 0) / imageWidth).toFixed(5)),
      y: Number(clamp((Number(point?.y) || 0) / imageHeight).toFixed(5)),
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  const polygonPixels = polygonArea(pixelPoints);
  const boundingBoxPixels = Math.max(0, Number(box.width) || 0) * Math.max(0, Number(box.height) || 0);
  const areaPixels = Math.round(polygonPixels || boundingBoxPixels);
  const areaPercentage = Number(((areaPixels / (imageWidth * imageHeight)) * 100).toFixed(2));
  const severity = resolveSeverity(damageKey, areaPercentage);
  const inferredArea = detectVehiclePart(normalizedBox, context.angleHint || 'close_up');
  const affectedArea = context.damageAreaHint
    ? normalizeSelectedDamageArea(context.damageAreaHint, context.angleHint)
    : inferredArea;
  const type = DAMAGE_NAMES[damageKey] || titleCase(damageKey);

  return {
    id: String(prediction.detection_id || prediction.id || `dmg_${context.imageIndex || 0}_${context.index || 0}`),
    type,
    damageClass: String(prediction.class || prediction.class_name || prediction.label || damageKey),
    severity,
    severityLabel: severity === 'high' ? 'Severe' : severity === 'medium' ? 'Moderate' : 'Minor',
    description: `${type} detected on the ${affectedArea.toLowerCase()}.`,
    confidence: Number(confidence.toFixed(4)),
    affectedArea,
    imageIndex: Number(context.imageIndex) || 0,
    angleHint: String(context.angleHint || 'close_up'),
    urgency: urgencyFor(severity),
    coordinates: normalizedBox,
    segmentation: {
      format: 'polygon',
      points: normalizedPoints,
      pointCount: normalizedPoints.length,
    },
    detectedArea: {
      pixels: areaPixels,
      percentage: areaPercentage,
      imageWidth,
      imageHeight,
    },
    recommendation: REPAIR_RECOMMENDATIONS[damageKey]
      || `Inspect and repair the ${type.toLowerCase()} using the appropriate panel refinishing process.`,
  };
};

export const buildDamageReport = ({ issues = [], requestId, model, generatedAt } = {}) => {
  const highestSeverity = issues.some((issue) => issue.severity === 'high')
    ? 'high'
    : issues.some((issue) => issue.severity === 'medium') ? 'medium' : 'low';
  const vehicleDetected = issues.length > 0;

  return {
    reportId: requestId || `damage_report_${Date.now()}`,
    title: 'Vehicle Damage Report',
    status: issues.length ? 'damage_detected' : 'no_damage_detected',
    provider: 'roboflow',
    model,
    generatedAt: generatedAt || new Date().toISOString(),
    vehicleDetected: vehicleDetected ? true : null,
    issueCount: issues.length,
    highestSeverity: issues.length ? highestSeverity : null,
    issues,
    downstream: {
      recommendation: issues.map(({ id, type, severity, affectedArea, recommendation }) => ({
        damageId: id, type, severity, affectedArea, recommendation,
      })),
      costEstimation: issues.map(({ id, type, severity, confidence, affectedArea, detectedArea }) => ({
        damageId: id, type, severity, confidence, affectedArea, detectedArea,
      })),
      visualization3d: issues.map(({ id, type, severity, affectedArea, coordinates, segmentation }) => ({
        damageId: id, type, severity, affectedArea, coordinates, segmentation,
      })),
      ar: issues.map(({ id, type, severity, affectedArea, coordinates, segmentation, recommendation }) => ({
        damageId: id, type, severity, affectedArea, coordinates, segmentation, recommendation,
      })),
    },
  };
};

export default { buildDamageIssue, buildDamageReport };
