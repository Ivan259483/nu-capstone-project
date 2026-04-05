import { createHash } from 'crypto';
import {
  detectVehiclePart,
  inferDamageSection,
  normalizeAngle,
  normalizeSelectedDamageArea,
} from './vehiclePartMapper.utils.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundCurrency = (value) => Math.max(0, Math.round(value));

const SECTION_SERVICE_IDS = {
  bumper: 'bumper-repair',
  fender: 'fender-repair',
  panel: 'panel-repair',
  trunk: 'trunk-repair',
  headlight: 'headlight-restoration',
  'tail-light': 'tail-light-repair',
};

const AREA_BOXES = {
  'Front Bumper': { x: 0.28, y: 0.71, width: 0.44, height: 0.18 },
  'Left Fender': { x: 0.09, y: 0.42, width: 0.22, height: 0.24 },
  'Right Fender': { x: 0.69, y: 0.42, width: 0.22, height: 0.24 },
  'Front Panel': { x: 0.34, y: 0.34, width: 0.32, height: 0.22 },
  'Left Headlight': { x: 0.11, y: 0.18, width: 0.18, height: 0.12 },
  'Right Headlight': { x: 0.71, y: 0.18, width: 0.18, height: 0.12 },
  'Rear Bumper': { x: 0.27, y: 0.72, width: 0.46, height: 0.18 },
  Trunk: { x: 0.34, y: 0.26, width: 0.32, height: 0.2 },
  'Rear Panel': { x: 0.31, y: 0.45, width: 0.38, height: 0.2 },
  'Left Tail Light': { x: 0.1, y: 0.2, width: 0.18, height: 0.12 },
  'Right Tail Light': { x: 0.72, y: 0.2, width: 0.18, height: 0.12 },
  'Left Bumper': { x: 0.08, y: 0.72, width: 0.24, height: 0.18 },
  'Left Panel': { x: 0.28, y: 0.38, width: 0.34, height: 0.24 },
  'Right Bumper': { x: 0.68, y: 0.72, width: 0.24, height: 0.18 },
  'Right Panel': { x: 0.38, y: 0.38, width: 0.34, height: 0.24 },
  Bumper: { x: 0.27, y: 0.65, width: 0.46, height: 0.2 },
  Fender: { x: 0.2, y: 0.38, width: 0.24, height: 0.24 },
  Panel: { x: 0.3, y: 0.34, width: 0.4, height: 0.26 },
  Headlight: { x: 0.24, y: 0.22, width: 0.2, height: 0.14 },
  'Tail Light': { x: 0.24, y: 0.22, width: 0.2, height: 0.14 },
};

const DAMAGE_TEMPLATES = {
  bumper: [
    {
      damageType: 'Surface Scuff',
      severity: 'minor',
      action: 'Refinish the {area} cover and restore the surface texture.',
    },
    {
      damageType: 'Paint Scratch',
      severity: 'moderate',
      action: 'Sand, blend paint, and clearcoat the {area}.',
    },
    {
      damageType: 'Paint Transfer',
      severity: 'minor',
      action: 'Remove paint transfer from the {area} and polish the finish.',
    },
    {
      damageType: 'Panel Misalignment',
      severity: 'moderate',
      action: 'Realign the {area} mounts and inspect the retaining clips.',
    },
    {
      damageType: 'Crack',
      severity: 'severe',
      action: 'Plastic-weld or replace the {area} cover, then refinish it.',
    },
  ],
  fender: [
    {
      damageType: 'Dent',
      severity: 'moderate',
      action: 'Reshape the {area} and restore the body contour.',
    },
    {
      damageType: 'Paint Scratch',
      severity: 'moderate',
      action: 'Repair the scratched {area} and blend the paint edge.',
    },
    {
      damageType: 'Paint Chip',
      severity: 'minor',
      action: 'Touch up the chipped {area} and seal the exposed finish.',
    },
    {
      damageType: 'Surface Scuff',
      severity: 'minor',
      action: 'Polish and refinish the scuffed {area}.',
    },
    {
      damageType: 'Deep Dent',
      severity: 'severe',
      action: 'Pull the deep dent from the {area} and refinish the panel.',
    },
  ],
  panel: [
    {
      damageType: 'Dent',
      severity: 'moderate',
      action: 'Straighten the {area} and restore the panel line.',
    },
    {
      damageType: 'Paint Scratch',
      severity: 'moderate',
      action: 'Repair the scratched {area} and blend the finish.',
    },
    {
      damageType: 'Clear Coat Damage',
      severity: 'minor',
      action: 'Level and re-seal the damaged clear coat on the {area}.',
    },
    {
      damageType: 'Paint Chip',
      severity: 'minor',
      action: 'Touch up the chipped {area} and seal the spot repair.',
    },
    {
      damageType: 'Deep Dent',
      severity: 'severe',
      action: 'Pull and refinish the deep dented {area}.',
    },
  ],
  trunk: [
    {
      damageType: 'Paint Scratch',
      severity: 'moderate',
      action: 'Repair the scratched {area} lid and blend the paint.',
    },
    {
      damageType: 'Dent',
      severity: 'moderate',
      action: 'Reshape the {area} skin and restore the shut line.',
    },
    {
      damageType: 'Paint Chip',
      severity: 'minor',
      action: 'Touch up the chipped {area} edge and protect the finish.',
    },
    {
      damageType: 'Panel Misalignment',
      severity: 'moderate',
      action: 'Adjust the {area} alignment and inspect latch fitment.',
    },
    {
      damageType: 'Clear Coat Damage',
      severity: 'minor',
      action: 'Correct and protect the faded clear coat on the {area}.',
    },
  ],
  headlight: [
    {
      damageType: 'Surface Scuff',
      severity: 'minor',
      action: 'Polish the {area} lens and restore optical clarity.',
    },
    {
      damageType: 'Clear Coat Damage',
      severity: 'moderate',
      action: 'Recondition the {area} lens coating and UV seal it.',
    },
    {
      damageType: 'Crack',
      severity: 'severe',
      action: 'Repair or replace the cracked {area} assembly.',
    },
  ],
  'tail-light': [
    {
      damageType: 'Surface Scuff',
      severity: 'minor',
      action: 'Polish the {area} lens and restore the finish.',
    },
    {
      damageType: 'Crack',
      severity: 'severe',
      action: 'Repair or replace the cracked {area} assembly.',
    },
  ],
};

const SECTION_BASE_COST = {
  bumper: 3200,
  fender: 3400,
  panel: 3600,
  trunk: 3800,
  headlight: 2000,
  'tail-light': 2300,
};

const DAMAGE_COST_FACTOR = {
  'Surface Scuff': 0.85,
  'Paint Scratch': 1.1,
  'Paint Transfer': 0.9,
  Dent: 1.3,
  'Deep Dent': 1.75,
  Crack: 1.95,
  'Panel Misalignment': 1.45,
  'Clear Coat Damage': 1.05,
  'Paint Chip': 0.95,
};

const severityToUi = {
  minor: 'Low',
  moderate: 'Medium',
  severe: 'High',
};

const formatAreaText = (areaName) => String(areaName || '').toLowerCase();

const toHashFloat = (seed, offset = 0) => {
  const digest = createHash('sha1').update(`${seed}:${offset}`).digest('hex');
  return parseInt(digest.slice(0, 8), 16) / 0xffffffff;
};

const toNumeric = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const computeMetadataScore = ({ width = 0, height = 0, fileSize = 0 }) => {
  const pixelScore = clamp((width * height) / 4_000_000, 0, 1);
  const fileScore = clamp(fileSize / 5_000_000, 0, 1);
  const aspectRatio = width > 0 && height > 0 ? width / height : 1.45;
  const aspectScore = 1 - clamp(Math.abs(aspectRatio - 1.45) / 1.2, 0, 1);
  return (pixelScore * 0.45) + (fileScore * 0.35) + (aspectScore * 0.2);
};

const buildBoundingBox = (areaName, seed, variantIndex = 0) => {
  const base = AREA_BOXES[areaName] || AREA_BOXES.Panel;
  const jitterX = (toHashFloat(seed, 10 + variantIndex) - 0.5) * 0.05;
  const jitterY = (toHashFloat(seed, 20 + variantIndex) - 0.5) * 0.04;
  const scale = clamp(0.94 - (variantIndex * 0.12) + ((toHashFloat(seed, 30 + variantIndex) - 0.5) * 0.08), 0.72, 1.04);

  const width = clamp(base.width * scale, 0.08, 0.6);
  const height = clamp(base.height * scale, 0.08, 0.4);
  const x = clamp(base.x + jitterX + (variantIndex * 0.03), 0.02, 0.98 - width);
  const y = clamp(base.y + jitterY - (variantIndex * 0.02), 0.02, 0.98 - height);

  return {
    x: Number(x.toFixed(2)),
    y: Number(y.toFixed(2)),
    width: Number(width.toFixed(2)),
    height: Number(height.toFixed(2)),
  };
};

const buildConfidence = (seed, metadataScore, angle, variantIndex = 0) => {
  const angleBoost = angle === 'close_up' ? 0.03 : 0.01;
  const variantPenalty = variantIndex * 0.02;
  const confidence = 0.75 + (metadataScore * 0.08) + (toHashFloat(seed, 40 + variantIndex) * 0.12) + angleBoost - variantPenalty;
  return Number(clamp(confidence, 0.75, 0.95).toFixed(2));
};

const selectDamageCount = (context, metadataScore, section) => {
  if (section === 'headlight' || section === 'tail-light') return 1;
  if (context.angle === 'close_up') return 2;
  return metadataScore >= 0.55 && toHashFloat(context.seed, 50) > 0.42 ? 2 : 1;
};

const buildRecommendedAction = (template, areaName) =>
  template.action.replace('{area}', formatAreaText(areaName));

export const buildOfflineImageContexts = ({
  files = [],
  angleHints = [],
  selectedAreas = [],
  imageMeta = [],
}) => {
  return files.map((file, index) => {
    const meta = imageMeta[index] || {};
    const angle = normalizeAngle(angleHints[index] || meta.angle || meta.imageAngle || 'close_up');
    const fallbackArea = detectVehiclePart(null, angle);
    const selectedArea = normalizeSelectedDamageArea(
      selectedAreas[index]
      || meta.selectedDamageArea
      || meta.damageArea
      || meta.area
      || fallbackArea,
      angle
    );
    const width = toNumeric(meta.width);
    const height = toNumeric(meta.height);
    const fileSize = toNumeric(meta.fileSize || file?.size);
    const mimeType = String(meta.mimeType || file?.mimetype || 'image/jpeg');
    const fileName = String(meta.fileName || file?.originalname || `scan_${index + 1}.jpg`);
    const seed = [
      angle,
      selectedArea,
      width,
      height,
      fileSize,
      mimeType,
      fileName,
      index,
    ].join('|');

    return {
      index,
      angle,
      selectedArea,
      width,
      height,
      fileSize,
      mimeType,
      fileName,
      seed,
    };
  });
};

export const generateOfflineDamages = (contexts = []) => {
  return contexts.flatMap((context) => {
    const section = inferDamageSection(context.selectedArea);
    const templates = DAMAGE_TEMPLATES[section] || DAMAGE_TEMPLATES.panel;
    const metadataScore = computeMetadataScore(context);
    const damageCount = selectDamageCount(context, metadataScore, section);
    const baseIndex = Math.floor(toHashFloat(context.seed, 1) * templates.length) % templates.length;

    return Array.from({ length: damageCount }).map((_, variantIndex) => {
      const template = templates[(baseIndex + (variantIndex * 2)) % templates.length];
      return {
        id: `dmg_local_${context.index + 1}_${variantIndex + 1}`,
        damage_type: template.damageType,
        original_damage_type: `${context.selectedArea} ${template.damageType}`,
        affected_area: context.selectedArea,
        location: context.selectedArea,
        part: context.selectedArea,
        confidence: buildConfidence(context.seed, metadataScore, context.angle, variantIndex),
        severity: template.severity,
        recommended_action: buildRecommendedAction(template, context.selectedArea),
        suggested_services: [SECTION_SERVICE_IDS[section] || SECTION_SERVICE_IDS.panel],
        bounding_box: buildBoundingBox(context.selectedArea, context.seed, variantIndex),
        image_index: context.index,
      };
    });
  });
};

const estimateLegacyIssueCost = (damage) => {
  const section = inferDamageSection(damage.affected_area);
  const severityFactor = {
    minor: 1,
    moderate: 1.35,
    severe: 1.85,
  };
  const baseCost = SECTION_BASE_COST[section] || SECTION_BASE_COST.panel;
  const factor = DAMAGE_COST_FACTOR[damage.damage_type] || 1;
  const randomness = 350 + Math.round(toHashFloat(damage.id, 60) * 900);
  return roundCurrency((baseCost * factor * (severityFactor[damage.severity] || 1)) + randomness);
};

export const buildLegacyDamageAssessment = (contexts = []) => {
  const damages = generateOfflineDamages(contexts);
  const issues = damages.map((damage) => ({
    name: `${damage.affected_area} ${damage.damage_type}`,
    severity: severityToUi[damage.severity] || 'Medium',
    cost: estimateLegacyIssueCost(damage),
  }));

  return {
    issues,
    totalEstimate: issues.reduce((sum, issue) => sum + issue.cost, 0),
    damages,
  };
};
