import { Easing } from 'react-native-reanimated';

/**
 * Loading motion contract
 *
 * - 140-220 ms: local content swaps and fades.
 * - 420 ms: success confirmation before navigation or dismissal.
 * - 1,080 ms: calm orbital progress loop.
 * - 1,450 ms: low-contrast skeleton shimmer.
 *
 * Infinite motion is disabled when Reduce Motion is enabled. Loading copy and
 * accessibility state must always communicate progress without animation.
 */
export const LoadingMotion = {
  contentExit: 140,
  contentEnter: 180,
  sectionEnter: 220,
  success: 420,
  orbit: 1080,
  shimmer: 1450,
  easing: Easing.bezier(0.22, 1, 0.36, 1),
  linear: Easing.linear,
} as const;

export const LoadingColor = {
  accent: '#FF7A1A',
  accentSoft: 'rgba(255, 122, 26, 0.16)',
  light: '#F4F4F5',
  lightSoft: 'rgba(244, 244, 245, 0.14)',
  muted: '#8A8A93',
  mutedSoft: 'rgba(138, 138, 147, 0.14)',
  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.15)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.15)',
  skeletonBase: '#17171B',
  skeletonHighlight: 'rgba(255, 255, 255, 0.055)',
} as const;
