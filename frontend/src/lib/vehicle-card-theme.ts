export type VehicleCardTheme = {
  from: string;
  to: string;
  glow: string;
  text: string;
  border: string;
  tint: string;
  headerBaseFrom: string;
  headerBaseTo: string;
  headerFromStrength: number;
  headerToStrength: number;
  glowLayerOpacity: number;
  badgeTintStrength: number;
  decorationOpacity: number;
};

type VehicleCardPalette = Pick<VehicleCardTheme, 'from' | 'to' | 'glow' | 'text' | 'border' | 'tint'>;
type VehicleCardSurface = Omit<VehicleCardTheme, keyof VehicleCardPalette>;

const COLORED_VEHICLE_CARD_SURFACE: VehicleCardSurface = {
  headerBaseFrom: '#f7f9fc',
  headerBaseTo: '#e8edf3',
  headerFromStrength: 38,
  headerToStrength: 40,
  glowLayerOpacity: 0.9,
  badgeTintStrength: 18,
  decorationOpacity: 0.14,
};

const NEUTRAL_VEHICLE_CARD_SURFACE: VehicleCardSurface = {
  headerBaseFrom: '#faf8f4',
  headerBaseTo: '#eeeae4',
  headerFromStrength: 25,
  headerToStrength: 28,
  glowLayerOpacity: 0.66,
  badgeTintStrength: 0,
  decorationOpacity: 0.08,
};

function createVehicleCardTheme(
  palette: VehicleCardPalette,
  surface: Partial<VehicleCardSurface> = {},
): VehicleCardTheme {
  return { ...palette, ...COLORED_VEHICLE_CARD_SURFACE, ...surface };
}

const NEUTRAL_VEHICLE_CARD_THEME: VehicleCardTheme = createVehicleCardTheme({
  from: '#a9b1bd',
  to: '#64748b',
  glow: 'rgba(100,116,139,0.16)',
  text: '#f8fafc',
  border: '#64748B',
  tint: '#FFFEFA',
}, NEUTRAL_VEHICLE_CARD_SURFACE);

const VEHICLE_CARD_THEMES: Record<string, VehicleCardTheme> = {
  white: createVehicleCardTheme({ from: '#f7fafc', to: '#cbd5e1', glow: 'rgba(203,213,225,0.48)', text: '#334155', border: '#B8C4D2', tint: '#F7F9FC' }, { headerFromStrength: 34, headerToStrength: 38 }),
  black: createVehicleCardTheme({ from: '#303640', to: '#11151b', glow: 'rgba(17,24,39,0.5)', text: '#f8fafc', border: '#303844', tint: '#EEF1F4' }, { headerFromStrength: 72, headerToStrength: 78, badgeTintStrength: 12 }),
  silver: createVehicleCardTheme({ from: '#cbd4df', to: '#8e9aa9', glow: 'rgba(148,163,184,0.44)', text: '#334155', border: '#98A5B5', tint: '#F1F5F9' }, { headerFromStrength: 36, headerToStrength: 40 }),
  gray: createVehicleCardTheme({ from: '#8c99aa', to: '#566577', glow: 'rgba(100,116,139,0.42)', text: '#f8fafc', border: '#687789', tint: '#EEF2F6' }, { headerFromStrength: 44, headerToStrength: 48, badgeTintStrength: 14 }),
  blue: createVehicleCardTheme({ from: '#4a86da', to: '#285faf', glow: 'rgba(37,99,180,0.46)', text: '#f8fbff', border: '#356FBD', tint: '#E7F0FC' }),
  red: createVehicleCardTheme({ from: '#cf5961', to: '#a63c47', glow: 'rgba(190,58,71,0.44)', text: '#fff7f7', border: '#B64751', tint: '#FBE9EA' }),
  green: createVehicleCardTheme({ from: '#4e9a68', to: '#2f754a', glow: 'rgba(47,132,72,0.44)', text: '#f7fff9', border: '#3E8557', tint: '#E8F4EB' }),
  yellow: createVehicleCardTheme({ from: '#d8ae36', to: '#a87918', glow: 'rgba(211,165,43,0.46)', text: '#2c2518', border: '#B88A20', tint: '#FBF3D8' }),
  orange: createVehicleCardTheme({ from: '#d97b32', to: '#aa4f20', glow: 'rgba(211,101,42,0.46)', text: '#fff8f2', border: '#BB612A', tint: '#FBEADD' }),
  brown: createVehicleCardTheme({ from: '#9e6d4f', to: '#684431', glow: 'rgba(139,83,50,0.42)', text: '#fffaf5', border: '#80543B', tint: '#F5EAE3' }),
  gold: createVehicleCardTheme({ from: '#d5aa31', to: '#987011', glow: 'rgba(205,153,24,0.45)', text: '#2c2518', border: '#AA7F16', tint: '#FAF1D5' }),
  purple: createVehicleCardTheme({ from: '#9865bd', to: '#65358d', glow: 'rgba(126,54,176,0.42)', text: '#fff8ff', border: '#79489C', tint: '#F2E8F8' }),
  pink: createVehicleCardTheme({ from: '#cf739c', to: '#a74472', glow: 'rgba(205,82,139,0.4)', text: '#fff8fb', border: '#B85883', tint: '#FAE8F0' }),
  beige: createVehicleCardTheme({ from: '#d8c6a7', to: '#ad9165', glow: 'rgba(190,157,105,0.4)', text: '#433a2e', border: '#B89D72', tint: '#F7F0E4' }, { headerFromStrength: 34, headerToStrength: 38 }),
  bronze: createVehicleCardTheme({ from: '#b97843', to: '#754423', glow: 'rgba(169,91,42,0.43)', text: '#fff8f2', border: '#91562E', tint: '#F5E7DC' }),
  'two-tone': createVehicleCardTheme({ from: '#8c99aa', to: '#303640', glow: 'rgba(71,85,105,0.4)', text: '#f8fafc', border: '#596777', tint: '#EDF1F5' }, { headerFromStrength: 48, headerToStrength: 58, badgeTintStrength: 14 }),
  custom: NEUTRAL_VEHICLE_CARD_THEME,
};

const VEHICLE_COLOR_ALIASES: Record<string, string> = {
  grey: 'gray',
  navy: 'blue',
  maroon: 'red',
  burgundy: 'red',
  violet: 'purple',
  cream: 'beige',
};

const ABSENT_VEHICLE_COLOR_KEYS = new Set([
  '',
  'unknown',
  'unknown color',
  'n/a',
  'na',
  'none',
  'not set',
  'not specified',
  'custom',
]);

function normalizeVehicleCardColor(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function resolveVehicleCardColorKey(value?: string | null): string | null {
  const normalized = normalizeVehicleCardColor(value);
  if (ABSENT_VEHICLE_COLOR_KEYS.has(normalized)) return null;
  if (VEHICLE_CARD_THEMES[normalized]) return normalized;
  if (VEHICLE_COLOR_ALIASES[normalized]) return VEHICLE_COLOR_ALIASES[normalized];

  const words = normalized.split(/[^a-z]+/).filter(Boolean);
  for (const word of words) {
    const key = VEHICLE_COLOR_ALIASES[word] || word;
    if (key !== 'custom' && VEHICLE_CARD_THEMES[key]) return key;
  }

  return null;
}

/**
 * Returns the presentation-only Garage card palette for a saved vehicle color.
 * A server-normalized standard color wins over a factory/free-text color name.
 */
export function getVehicleCardTheme(color?: string | null, standardColor?: string | null): VehicleCardTheme {
  const colorKey = resolveVehicleCardColorKey(standardColor) || resolveVehicleCardColorKey(color);
  return colorKey ? VEHICLE_CARD_THEMES[colorKey] : NEUTRAL_VEHICLE_CARD_THEME;
}

/** Keeps the existing non-Garage accent behavior unchanged for other vehicle pickers. */
export function getVehicleAccentTheme(color?: string | null, standardColor?: string | null): VehicleCardTheme {
  const colorKey = normalizeVehicleCardColor(standardColor) || normalizeVehicleCardColor(color) || 'custom';
  return VEHICLE_CARD_THEMES[colorKey] || VEHICLE_CARD_THEMES.custom;
}

export { NEUTRAL_VEHICLE_CARD_THEME, VEHICLE_CARD_THEMES };
