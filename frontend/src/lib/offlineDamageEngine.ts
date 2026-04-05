export type WebScanAngle = 'front' | 'rear' | 'left' | 'right' | 'close_up';
export type WebSeverity = 'High' | 'Medium' | 'Low';

export interface DamageEstimateIssue {
  name: string;
  severity: WebSeverity;
  cost: number;
}

export interface OfflineDamageEstimate {
  issues: DamageEstimateIssue[];
  totalEstimate: number;
}

export const DAMAGE_AREA_OPTIONS: Record<WebScanAngle, string[]> = {
  front: ['Front Bumper', 'Left Fender', 'Right Fender', 'Front Panel', 'Left Headlight', 'Right Headlight'],
  rear: ['Rear Bumper', 'Trunk', 'Rear Panel', 'Left Tail Light', 'Right Tail Light'],
  left: ['Left Bumper', 'Left Fender', 'Left Panel'],
  right: ['Right Bumper', 'Right Fender', 'Right Panel'],
  close_up: ['Bumper', 'Fender', 'Panel', 'Trunk', 'Headlight', 'Tail Light'],
};

export const getDefaultDamageArea = (angle: WebScanAngle): string => {
  switch (angle) {
    case 'front':
      return 'Front Bumper';
    case 'rear':
      return 'Rear Bumper';
    case 'left':
      return 'Left Panel';
    case 'right':
      return 'Right Panel';
    default:
      return 'Panel';
  }
};

const DAMAGE_TEMPLATES = {
  bumper: [
    { damageType: 'Surface Scuff', severity: 'Low' as const, factor: 0.85 },
    { damageType: 'Paint Scratch', severity: 'Medium' as const, factor: 1.1 },
    { damageType: 'Paint Transfer', severity: 'Low' as const, factor: 0.95 },
    { damageType: 'Panel Misalignment', severity: 'Medium' as const, factor: 1.45 },
    { damageType: 'Crack', severity: 'High' as const, factor: 1.95 },
  ],
  fender: [
    { damageType: 'Dent', severity: 'Medium' as const, factor: 1.3 },
    { damageType: 'Paint Scratch', severity: 'Medium' as const, factor: 1.15 },
    { damageType: 'Paint Chip', severity: 'Low' as const, factor: 0.95 },
    { damageType: 'Surface Scuff', severity: 'Low' as const, factor: 0.85 },
    { damageType: 'Deep Dent', severity: 'High' as const, factor: 1.75 },
  ],
  panel: [
    { damageType: 'Dent', severity: 'Medium' as const, factor: 1.35 },
    { damageType: 'Paint Scratch', severity: 'Medium' as const, factor: 1.15 },
    { damageType: 'Clear Coat Damage', severity: 'Low' as const, factor: 1.05 },
    { damageType: 'Paint Chip', severity: 'Low' as const, factor: 0.95 },
    { damageType: 'Deep Dent', severity: 'High' as const, factor: 1.8 },
  ],
  trunk: [
    { damageType: 'Paint Scratch', severity: 'Medium' as const, factor: 1.15 },
    { damageType: 'Dent', severity: 'Medium' as const, factor: 1.35 },
    { damageType: 'Paint Chip', severity: 'Low' as const, factor: 0.95 },
    { damageType: 'Panel Misalignment', severity: 'Medium' as const, factor: 1.4 },
    { damageType: 'Clear Coat Damage', severity: 'Low' as const, factor: 1.05 },
  ],
  headlight: [
    { damageType: 'Surface Scuff', severity: 'Low' as const, factor: 0.85 },
    { damageType: 'Clear Coat Damage', severity: 'Medium' as const, factor: 1.1 },
    { damageType: 'Crack', severity: 'High' as const, factor: 1.9 },
  ],
  'tail-light': [
    { damageType: 'Surface Scuff', severity: 'Low' as const, factor: 0.85 },
    { damageType: 'Crack', severity: 'High' as const, factor: 1.9 },
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

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');

const inferSection = (areaName: string) => {
  const lower = areaName.toLowerCase();
  if (lower.includes('tail light')) return 'tail-light' as const;
  if (lower.includes('headlight') || lower.includes('head light')) return 'headlight' as const;
  if (lower.includes('trunk')) return 'trunk' as const;
  if (lower.includes('bumper')) return 'bumper' as const;
  if (lower.includes('fender')) return 'fender' as const;
  return 'panel' as const;
};

const normalizeDamageArea = (angle: WebScanAngle, damageArea: string): string => {
  const options = DAMAGE_AREA_OPTIONS[angle];
  const raw = String(damageArea || '').trim();
  if (!raw) return getDefaultDamageArea(angle);

  const directMatch = options.find((option) => compact(option) === compact(raw));
  if (directMatch) return directMatch;

  const requestedSection = inferSection(raw);
  return options.find((option) => inferSection(option) === requestedSection) || getDefaultDamageArea(angle);
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

export const analyzeDamagePhoto = (params: {
  file: File;
  angle: WebScanAngle;
  damageArea: string;
  width: number;
  height: number;
}): OfflineDamageEstimate => {
  const areaName = normalizeDamageArea(params.angle, params.damageArea);
  const section = inferSection(areaName);
  const templates = DAMAGE_TEMPLATES[section];
  const seed = [
    params.angle,
    areaName,
    params.file.name,
    params.file.type,
    params.file.size,
    params.width,
    params.height,
  ].join('|');
  const detailScore = Math.min(1, ((params.width * params.height) / 4_000_000) + (params.file.size / 6_000_000));
  const issueCount = section === 'headlight' || section === 'tail-light'
    ? 1
    : (params.angle === 'close_up' || (detailScore > 0.55 && toSeededFloat(seed, 6) > 0.45) ? 2 : 1);
  const baseIndex = Math.floor(toSeededFloat(seed, 1) * templates.length) % templates.length;

  const issues = Array.from({ length: issueCount }).map((_, index) => {
    const template = templates[(baseIndex + (index * 2)) % templates.length];
    const randomCost = 350 + Math.round(toSeededFloat(seed, 10 + index) * 900);
    const cost = Math.round((SECTION_BASE_COST[section] * template.factor) + randomCost);
    return {
      name: `${areaName} ${template.damageType}`,
      severity: template.severity,
      cost,
    };
  });

  return {
    issues,
    totalEstimate: issues.reduce((sum, issue) => sum + issue.cost, 0),
  };
};
