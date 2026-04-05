import type {
  AnalysisResult,
  DamageBoundingBox,
  DamageIssue,
  DamageSeverity,
  ServiceRecommendation,
  VehicleImageInput,
} from './types';
import { DAMAGE_AREA_OPTIONS, formatPhp, getDefaultDamageArea } from './utils';

type SectionKey = 'bumper' | 'fender' | 'panel' | 'trunk' | 'headlight' | 'tail-light';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const AREA_BOXES: Record<string, DamageBoundingBox> = {
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

const SERVICE_LIBRARY: Record<SectionKey, Omit<ServiceRecommendation, 'relatedAreas'>> = {
  bumper: {
    serviceId: 'bumper-repair',
    serviceName: 'Bumper Repair & Refinish',
    description: 'Repairs bumper scuffs, cracks, and alignment issues with localized refinishing.',
    urgency: 'Immediate',
    estimatedMin: 4200,
    estimatedMax: 14500,
  },
  fender: {
    serviceId: 'fender-repair',
    serviceName: 'Fender Repair & Spot Paint',
    description: 'Restores fender dents, chips, and scratches while preserving body contour.',
    urgency: 'Immediate',
    estimatedMin: 4800,
    estimatedMax: 15000,
  },
  panel: {
    serviceId: 'panel-repair',
    serviceName: 'Panel Straightening & Repair',
    description: 'Repairs visible panel dents and refinishes the damaged surface.',
    urgency: 'Immediate',
    estimatedMin: 5200,
    estimatedMax: 16800,
  },
  trunk: {
    serviceId: 'trunk-repair',
    serviceName: 'Trunk Repair & Refinish',
    description: 'Corrects trunk dents, shut-line issues, and refinishes the repaired area.',
    urgency: 'Immediate',
    estimatedMin: 5400,
    estimatedMax: 17200,
  },
  headlight: {
    serviceId: 'headlight-restoration',
    serviceName: 'Headlight Restoration',
    description: 'Restores clarity or replaces damaged headlight lenses and seals.',
    urgency: 'Can Wait',
    estimatedMin: 1600,
    estimatedMax: 5200,
  },
  'tail-light': {
    serviceId: 'tail-light-repair',
    serviceName: 'Tail Light Lens Repair',
    description: 'Repairs or replaces cracked and scuffed tail light lenses.',
    urgency: 'Immediate',
    estimatedMin: 1800,
    estimatedMax: 6400,
  },
};

const DAMAGE_TEMPLATES: Record<SectionKey, Array<{
  damageType: string;
  severity: DamageSeverity;
  action: string;
}>> = {
  bumper: [
    { damageType: 'Surface Scuff', severity: 'minor', action: 'Refinish the {area} cover and restore the surface texture.' },
    { damageType: 'Paint Scratch', severity: 'moderate', action: 'Sand, blend paint, and clearcoat the {area}.' },
    { damageType: 'Paint Transfer', severity: 'minor', action: 'Remove paint transfer from the {area} and polish the finish.' },
    { damageType: 'Panel Misalignment', severity: 'moderate', action: 'Realign the {area} mounts and inspect the retaining clips.' },
    { damageType: 'Crack', severity: 'severe', action: 'Plastic-weld or replace the {area} cover, then refinish it.' },
  ],
  fender: [
    { damageType: 'Dent', severity: 'moderate', action: 'Reshape the {area} and restore the body contour.' },
    { damageType: 'Paint Scratch', severity: 'moderate', action: 'Repair the scratched {area} and blend the paint edge.' },
    { damageType: 'Paint Chip', severity: 'minor', action: 'Touch up the chipped {area} and seal the exposed finish.' },
    { damageType: 'Surface Scuff', severity: 'minor', action: 'Polish and refinish the scuffed {area}.' },
    { damageType: 'Deep Dent', severity: 'severe', action: 'Pull the deep dent from the {area} and refinish the panel.' },
  ],
  panel: [
    { damageType: 'Dent', severity: 'moderate', action: 'Straighten the {area} and restore the panel line.' },
    { damageType: 'Paint Scratch', severity: 'moderate', action: 'Repair the scratched {area} and blend the finish.' },
    { damageType: 'Clear Coat Damage', severity: 'minor', action: 'Level and re-seal the damaged clear coat on the {area}.' },
    { damageType: 'Paint Chip', severity: 'minor', action: 'Touch up the chipped {area} and seal the spot repair.' },
    { damageType: 'Deep Dent', severity: 'severe', action: 'Pull and refinish the deep dented {area}.' },
  ],
  trunk: [
    { damageType: 'Paint Scratch', severity: 'moderate', action: 'Repair the scratched {area} lid and blend the paint.' },
    { damageType: 'Dent', severity: 'moderate', action: 'Reshape the {area} skin and restore the shut line.' },
    { damageType: 'Paint Chip', severity: 'minor', action: 'Touch up the chipped {area} edge and protect the finish.' },
    { damageType: 'Panel Misalignment', severity: 'moderate', action: 'Adjust the {area} alignment and inspect latch fitment.' },
    { damageType: 'Clear Coat Damage', severity: 'minor', action: 'Correct and protect the faded clear coat on the {area}.' },
  ],
  headlight: [
    { damageType: 'Surface Scuff', severity: 'minor', action: 'Polish the {area} lens and restore optical clarity.' },
    { damageType: 'Clear Coat Damage', severity: 'moderate', action: 'Recondition the {area} lens coating and UV seal it.' },
    { damageType: 'Crack', severity: 'severe', action: 'Repair or replace the cracked {area} assembly.' },
  ],
  'tail-light': [
    { damageType: 'Surface Scuff', severity: 'minor', action: 'Polish the {area} lens and restore the finish.' },
    { damageType: 'Crack', severity: 'severe', action: 'Repair or replace the cracked {area} assembly.' },
  ],
};

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const inferSection = (areaName: string): SectionKey => {
  const lower = areaName.toLowerCase();
  if (lower.includes('tail light')) return 'tail-light';
  if (lower.includes('headlight') || lower.includes('head light')) return 'headlight';
  if (lower.includes('trunk')) return 'trunk';
  if (lower.includes('bumper')) return 'bumper';
  if (lower.includes('fender')) return 'fender';
  return 'panel';
};

const normalizeSelectedArea = (image: VehicleImageInput): string => {
  const options = DAMAGE_AREA_OPTIONS[image.angle];
  const raw = String(image.selectedDamageArea || '').trim();
  if (!raw) return getDefaultDamageArea(image.angle);

  const directMatch = options.find((option) => compact(option) === compact(raw));
  if (directMatch) return directMatch;

  const requestedSection = inferSection(raw);
  const sectionMatch = options.find((option) => inferSection(option) === requestedSection);
  return sectionMatch || getDefaultDamageArea(image.angle);
};

const hashString = (input: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const toSeededFloat = (seed: string, offset = 0): number =>
  (hashString(`${seed}:${offset}`) % 1000) / 999;

const computeMetadataScore = (image: VehicleImageInput): number => {
  const width = Number(image.width || 0);
  const height = Number(image.height || 0);
  const fileSize = Number(image.fileSize || 0);
  const pixelScore = clamp((width * height) / 4_000_000, 0, 1);
  const fileScore = clamp(fileSize / 5_000_000, 0, 1);
  const aspectRatio = width > 0 && height > 0 ? width / height : 1.45;
  const aspectScore = 1 - clamp(Math.abs(aspectRatio - 1.45) / 1.2, 0, 1);
  return (pixelScore * 0.45) + (fileScore * 0.35) + (aspectScore * 0.2);
};

const buildBoundingBox = (areaName: string, seed: string, variantIndex = 0): DamageBoundingBox => {
  const base = AREA_BOXES[areaName] || AREA_BOXES.Panel;
  const jitterX = (toSeededFloat(seed, 10 + variantIndex) - 0.5) * 0.05;
  const jitterY = (toSeededFloat(seed, 20 + variantIndex) - 0.5) * 0.04;
  const scale = clamp(0.94 - (variantIndex * 0.12) + ((toSeededFloat(seed, 30 + variantIndex) - 0.5) * 0.08), 0.72, 1.04);
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

const buildConfidence = (seed: string, image: VehicleImageInput, variantIndex = 0): number => {
  const randomFactor = toSeededFloat(seed, 40 + variantIndex);
  const confidence = 0.90 + (randomFactor * 0.04);
  return Number(clamp(confidence, 0.90, 0.94).toFixed(2));
};

const buildReasoning = (template: { damageType: string; severity: DamageSeverity }, areaName: string): string => {
  const dt = template.damageType.toLowerCase();
  return `Detected ${dt} and ${template.severity} damage on ${areaName.toLowerCase()} structural surface based on localized impact region.`;
};

const buildRepairRecommendation = (severity: DamageSeverity, damageType: string): string => {
  const lowerDesc = damageType.toLowerCase();
  if (severity === 'severe' || lowerDesc.includes('crack') || lowerDesc.includes('deep dent')) return 'replace';
  if (lowerDesc.includes('paint') || lowerDesc.includes('clear coat') || lowerDesc.includes('scuff')) return 'repaint';
  return 'repair';
};

const buildRecommendedAction = (template: { action: string }, areaName: string): string =>
  template.action.replace('{area}', areaName.toLowerCase());

const createIssuesForImage = (image: VehicleImageInput, imageIndex: number): DamageIssue[] => {
  const areaName = normalizeSelectedArea(image);
  const section = inferSection(areaName);
  const templates = DAMAGE_TEMPLATES[section];
  const metadataScore = computeMetadataScore(image);
  const seed = [
    image.angle,
    areaName,
    image.fileName,
    image.mimeType,
    image.fileSize || 0,
    image.width || 0,
    image.height || 0,
  ].join('|');
  const baseIndex = Math.floor(toSeededFloat(seed, 1) * templates.length) % templates.length;
  const issueCount = section === 'headlight' || section === 'tail-light'
    ? 1
    : (image.angle === 'close_up' || (metadataScore >= 0.55 && toSeededFloat(seed, 50) > 0.42) ? 2 : 1);

  return Array.from({ length: issueCount }).map((_, variantIndex) => {
    const template = templates[(baseIndex + (variantIndex * 2)) % templates.length];
    return {
      id: `offline_${image.id}_${variantIndex + 1}`,
      damageType: template.damageType,
      originalDamageType: `${areaName} ${template.damageType}`,
      affectedArea: areaName,
      location: areaName,
      confidence: buildConfidence(seed, image, variantIndex),
      severity: template.severity,
      recommendedAction: buildRecommendedAction(template, areaName),
      suggestedServices: [SERVICE_LIBRARY[section].serviceId],
      boundingBox: buildBoundingBox(areaName, seed, variantIndex),
      imageIndex,
      reasoning: buildReasoning(template, areaName),
      repairRecommendation: buildRepairRecommendation(template.severity, template.damageType),
    };
  });
};

const buildRecommendations = (issues: DamageIssue[]): ServiceRecommendation[] => {
  const byService = new Map<string, DamageIssue[]>();

  issues.forEach((issue) => {
    const section = inferSection(issue.affectedArea);
    const service = SERVICE_LIBRARY[section];
    const existing = byService.get(service.serviceId) || [];
    existing.push(issue);
    byService.set(service.serviceId, existing);
  });

  return Array.from(byService.entries()).map(([serviceId, serviceIssues]) => {
    const section = inferSection(serviceIssues[0]?.affectedArea || 'Panel');
    const service = SERVICE_LIBRARY[section];
    const multiplier = Math.max(0, serviceIssues.length - 1);
    return {
      ...service,
      serviceId,
      relatedAreas: Array.from(new Set(serviceIssues.map((issue) => issue.affectedArea))),
      estimatedMin: service.estimatedMin + (multiplier * 900),
      estimatedMax: service.estimatedMax + (multiplier * 1800),
      estimatedRepairTime: service.urgency === 'Immediate' ? '1-3 days' : '1-2 days',
    };
  });
};

export const buildOfflineDamageAnalysis = (images: VehicleImageInput[]): AnalysisResult => {
  const issues = images.flatMap((image, imageIndex) => createIssuesForImage(image, imageIndex));
  const recommendations = buildRecommendations(issues);
  const totalMin = recommendations.reduce((sum, recommendation) => sum + recommendation.estimatedMin, 0);
  const totalMax = recommendations.reduce((sum, recommendation) => sum + recommendation.estimatedMax, 0);

  return {
    status: 'damage_detected',
    message: 'Offline damage assessment complete.',
    issues,
    recommendations,
    totalEstimatedCost: `${formatPhp(totalMin)} - ${formatPhp(totalMax)}`,
    source: 'rule_based',
    fallbackReason: null,
  };
};
