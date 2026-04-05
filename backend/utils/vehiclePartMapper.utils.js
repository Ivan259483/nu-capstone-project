/**
 * vehiclePartMapper.js
 * Deterministic area mapping for the offline damage engine.
 *
 * Output labels are intentionally restricted to supported repair sections:
 * bumper, fender, panel, trunk, headlight, tail light.
 */

export const ALLOWED_DAMAGE_AREAS = {
  front: ['Front Bumper', 'Left Fender', 'Right Fender', 'Front Panel', 'Left Headlight', 'Right Headlight'],
  rear: ['Rear Bumper', 'Trunk', 'Rear Panel', 'Left Tail Light', 'Right Tail Light'],
  left: ['Left Bumper', 'Left Fender', 'Left Panel'],
  right: ['Right Bumper', 'Right Fender', 'Right Panel'],
  close_up: ['Bumper', 'Fender', 'Panel', 'Trunk', 'Headlight', 'Tail Light'],
};

const DEFAULT_DAMAGE_AREAS = {
  front: 'Front Bumper',
  rear: 'Rear Bumper',
  left: 'Left Panel',
  right: 'Right Panel',
  close_up: 'Panel',
};

const ZONE_GRIDS = {
  rear: [
    ['Left Tail Light', 'Trunk', 'Right Tail Light'],
    ['Rear Panel', 'Rear Panel', 'Rear Panel'],
    ['Rear Bumper', 'Rear Bumper', 'Rear Bumper'],
  ],
  front: [
    ['Left Headlight', 'Front Panel', 'Right Headlight'],
    ['Left Fender', 'Front Panel', 'Right Fender'],
    ['Front Bumper', 'Front Bumper', 'Front Bumper'],
  ],
  left: [
    ['Left Panel', 'Left Panel', 'Left Panel'],
    ['Left Fender', 'Left Panel', 'Left Panel'],
    ['Left Bumper', 'Left Panel', 'Left Panel'],
  ],
  right: [
    ['Right Panel', 'Right Panel', 'Right Panel'],
    ['Right Panel', 'Right Panel', 'Right Fender'],
    ['Right Panel', 'Right Panel', 'Right Bumper'],
  ],
  close_up: [
    ['Headlight', 'Panel', 'Tail Light'],
    ['Fender', 'Panel', 'Fender'],
    ['Bumper', 'Panel', 'Bumper'],
  ],
};

/* ═══════════════════════════════════════════════════════════════════
 * Professional Damage Category Map
 *
 * Maps fuzzy AI-generated damage type strings into clean,
 * professional automotive repair terminology.
 * ═══════════════════════════════════════════════════════════════════ */

const DAMAGE_CATEGORY_MAP = [
  // Deep / severe dents first (more specific before generic)
  { patterns: ['deep dent', 'heavy dent', 'large dent', 'severe dent', 'major dent', 'collision dent'], category: 'Deep Dent' },
  { patterns: ['dent', 'ding', 'dimple', 'depression', 'pushed in', 'indentation'], category: 'Dent' },

  // Paint damage categories
  { patterns: ['paint transfer', 'paint rub', 'foreign paint', 'paint exchange'], category: 'Paint Transfer' },
  { patterns: ['scratch', 'key scratch', 'keyed', 'scratching', 'line scratch', 'paint scratch'], category: 'Paint Scratch' },
  { patterns: ['scuff', 'surface scuff', 'abrasion', 'rub mark', 'scrape', 'graze'], category: 'Surface Scuff' },

  // Structural
  { patterns: ['crack', 'fracture', 'split', 'broken', 'shattered'], category: 'Crack' },
  { patterns: ['misalign', 'gap', 'offset', 'shifted', 'uneven'], category: 'Panel Misalignment' },

  // Clear coat & oxidation
  { patterns: ['clearcoat', 'clear coat', 'oxidation', 'oxidized', 'fade', 'fading', 'peel', 'flaking'], category: 'Clear Coat Damage' },

  // Chips
  { patterns: ['chip', 'stone chip', 'rock chip', 'paint chip'], category: 'Paint Chip' },

  // Corrosion
  { patterns: ['rust', 'corrosion', 'corroded'], category: 'Corrosion' },
];

const FALLBACK_CATEGORY = 'Surface Damage';

/* ═══════════════════════════════════════════════════════════════════
 * Angle validation — which parts are valid for which angle
 * ═══════════════════════════════════════════════════════════════════ */

const compact = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export const normalizeAngle = (angle) => {
  if (!angle || typeof angle !== 'string') return 'close_up';
  const lower = angle.toLowerCase().trim();
  if (lower.includes('rear') || lower.includes('back')) return 'rear';
  if (lower.includes('front')) return 'front';
  if (lower.includes('left')) return 'left';
  if (lower.includes('right')) return 'right';
  return 'close_up';
};

export const getDamageAreaOptions = (angleHint = 'close_up') => {
  const normalizedAngle = normalizeAngle(angleHint);
  return ALLOWED_DAMAGE_AREAS[normalizedAngle] || ALLOWED_DAMAGE_AREAS.close_up;
};

export const inferDamageSection = (areaName = '') => {
  const lower = String(areaName || '').toLowerCase();
  if (lower.includes('tail light')) return 'tail-light';
  if (lower.includes('headlight') || lower.includes('head light')) return 'headlight';
  if (lower.includes('trunk')) return 'trunk';
  if (lower.includes('bumper')) return 'bumper';
  if (lower.includes('fender')) return 'fender';
  if (lower.includes('panel')) return 'panel';
  return 'panel';
};

export const normalizeSelectedDamageArea = (selectedArea, angleHint = 'close_up') => {
  const normalizedAngle = normalizeAngle(angleHint);
  const options = getDamageAreaOptions(normalizedAngle);
  const raw = String(selectedArea || '').trim();

  if (!raw) {
    return DEFAULT_DAMAGE_AREAS[normalizedAngle] || DEFAULT_DAMAGE_AREAS.close_up;
  }

  const directMatch = options.find((option) => compact(option) === compact(raw));
  if (directMatch) return directMatch;

  const requestedSection = inferDamageSection(raw);
  const sectionMatch = options.find((option) => inferDamageSection(option) === requestedSection);
  if (sectionMatch) return sectionMatch;

  const globalMatch = Object.values(ALLOWED_DAMAGE_AREAS)
    .flat()
    .find((option) => compact(option) === compact(raw));

  if (globalMatch) {
    const globalSection = inferDamageSection(globalMatch);
    const safeOption = options.find((option) => inferDamageSection(option) === globalSection);
    if (safeOption) return safeOption;
  }

  return DEFAULT_DAMAGE_AREAS[normalizedAngle] || DEFAULT_DAMAGE_AREAS.close_up;
};

/* ═══════════════════════════════════════════════════════════════════
 * detectVehiclePart(boundingBox, angleHint)
 *
 * Maps a normalized bounding box to a vehicle region string using
 * the center point of the box and the camera angle hint.
 *
 * @param {Object} boundingBox - { x, y, width, height } (0-1 normalized)
 * @param {string} angleHint   - 'front' | 'rear' | 'left' | 'right' | 'close_up'
 * @returns {string} Vehicle part name
 * ═══════════════════════════════════════════════════════════════════ */

export const detectVehiclePart = (boundingBox, angleHint = 'close_up') => {
  if (!boundingBox || typeof boundingBox !== 'object') {
    return DEFAULT_DAMAGE_AREAS[normalizeAngle(angleHint)] || DEFAULT_DAMAGE_AREAS.close_up;
  }

  const { x = 0, y = 0, width = 0.1, height = 0.1 } = boundingBox;

  // Calculate center point of bounding box
  const centerX = Math.max(0, Math.min(1, x + width / 2));
  const centerY = Math.max(0, Math.min(1, y + height / 2));

  // Map center to 3×3 grid cell
  const col = centerX < 0.33 ? 0 : centerX < 0.66 ? 1 : 2;
  const row = centerY < 0.33 ? 0 : centerY < 0.66 ? 1 : 2;

  // Look up angle grid
  const normalizedAngle = normalizeAngle(angleHint);
  const grid = ZONE_GRIDS[normalizedAngle];

  if (!grid || !grid[row] || !grid[row][col]) {
    return DEFAULT_DAMAGE_AREAS[normalizedAngle] || DEFAULT_DAMAGE_AREAS.close_up;
  }

  return grid[row][col];
};

/* ═══════════════════════════════════════════════════════════════════
 * normalizeDamageCategory(rawType)
 *
 * Cleans AI free-text damage type into a professional category.
 *
 * @param {string} rawType - Raw damage type from AI (e.g., "door dent", "paint scratch and chip")
 * @returns {string} Professional category (e.g., "Dent", "Paint Scratch")
 * ═══════════════════════════════════════════════════════════════════ */

export const normalizeDamageCategory = (rawType) => {
  if (!rawType || typeof rawType !== 'string') return FALLBACK_CATEGORY;

  const lower = rawType.toLowerCase().trim();

  // Check for compound damages (e.g., "dent and scratches") — return both
  const matched = [];

  for (const entry of DAMAGE_CATEGORY_MAP) {
    for (const pattern of entry.patterns) {
      if (lower.includes(pattern)) {
        if (!matched.includes(entry.category)) {
          matched.push(entry.category);
        }
        break;
      }
    }
  }

  if (matched.length === 0) return FALLBACK_CATEGORY;
  if (matched.length === 1) return matched[0];

  // For compound damages, join up to 2 categories
  return matched.slice(0, 2).join(' & ');
};

/* ═══════════════════════════════════════════════════════════════════
 * validatePartMatch(partName, angleHint)
 *
 * Validates that the mapped part makes sense for the given angle.
 * If mismatch, returns a safe generic fallback.
 *
 * @param {string} partName  - Mapped part (e.g., "Rear Bumper")
 * @param {string} angleHint - Camera angle
 * @returns {string} Validated part name or fallback
 * ═══════════════════════════════════════════════════════════════════ */

export const validatePartMatch = (partName, angleHint = 'close_up') => {
  return normalizeSelectedDamageArea(partName, angleHint);
};

/* ═══════════════════════════════════════════════════════════════════
 * mapDamageToVehiclePart(damage, angleHint)
 *
 * Convenience function: takes a raw damage object from the detector and returns
 * the full enriched damage with:
 *  - normalized damage category
 *  - mapped vehicle part (location)
 *  - validated against angle
 *
 * @param {Object} damage    - Raw damage from the detector
 * @param {string} angleHint - Camera angle
 * @returns {Object} Enriched damage
 * ═══════════════════════════════════════════════════════════════════ */

export const mapDamageToVehiclePart = (damage, angleHint = 'close_up') => {
  const normalizedCategory = normalizeDamageCategory(damage?.damage_type || '');
  const rawPart = detectVehiclePart(damage?.bounding_box, angleHint);
  const validatedPart = validatePartMatch(rawPart, angleHint);

  return {
    ...damage,
    damage_type: normalizedCategory,
    original_damage_type: damage?.damage_type || '',
    affected_area: validatedPart,
    location: validatedPart,
  };
};
