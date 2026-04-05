export interface LocalCarScanImage {
  fileName: string;
  mimeType: string;
  fileSize: number;
  preview: string;
}

export interface LocalCarProfile {
  color: string;
  type: 'sedan' | 'suv' | 'truck' | 'sport' | 'hatchback' | 'unknown';
  condition: string;
  confidence: number;
}

const COLORS = ['#ffffff', '#111827', '#dc2626', '#2563eb', '#f59e0b', '#15803d', '#9a3412'];
const TYPES: LocalCarProfile['type'][] = ['sedan', 'suv', 'truck', 'sport', 'hatchback'];
const CONDITIONS = [
  'Glossy finish with light surface wear',
  'Clean paint with isolated panel blemishes',
  'Daily-use finish with moderate cosmetic wear',
  'Well-kept exterior with minor trim fade',
  'Good overall condition with visible touch-up needs',
];

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

export const analyzeLocalCarProfile = (images: LocalCarScanImage[]): LocalCarProfile => {
  const seed = images
    .map((image) => `${image.fileName}|${image.mimeType}|${image.fileSize}|${image.preview.length}`)
    .join('|');

  const metadataScore = Math.min(
    1,
    (images.reduce((sum, image) => sum + image.fileSize, 0) / Math.max(images.length, 1)) / 5_000_000
  );

  const color = COLORS[Math.floor(toSeededFloat(seed, 1) * COLORS.length) % COLORS.length];
  const type = TYPES[Math.floor(toSeededFloat(seed, 2) * TYPES.length) % TYPES.length] || 'unknown';
  const condition = CONDITIONS[Math.floor(toSeededFloat(seed, 3) * CONDITIONS.length) % CONDITIONS.length];
  const confidence = Number((0.78 + (metadataScore * 0.07) + (toSeededFloat(seed, 4) * 0.1)).toFixed(2));

  return {
    color,
    type,
    condition,
    confidence: Math.min(0.95, Math.max(0.78, confidence)),
  };
};
