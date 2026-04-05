/**
 * AutoSPF+ Premium Theme System
 * Ultra-premium dark mode with glassmorphism, gold accents, and precision spacing.
 */

import { Platform } from 'react-native';

// ── Color Palettes ─────────────────────────────────────────────────
export const Palette = {
  accent: '#FF6B35', // Premium Orange
  accentDark: '#CC5214', // Darker Orange for gradients
  white: '#FFFFFF',
  black: '#000000',
  success: '#10B981', // Green glow
  warning: '#F59E0B', // Pending orange glow
  danger: '#FF4C4C', // Red destructive glow
  info: '#3B82F6', // Blue progress glow
} as const;

// We provide an ultra-premium dark aesthetic and a clean international light aesthetic.
export const Colors = {
  light: {
    background: '#F9FAFB',
    card: '#FFFFFF',
    cardAlt: '#F3F4F6',
    text: '#111827',
    textSecondary: '#6B7280',
    textMuted: '#9CA3AF',
    border: '#E5E7EB',
    borderLight: '#F3F4F6',
    accent: Palette.accent,
    accentLight: 'rgba(255, 107, 53, 0.1)',
    accentBorder: 'rgba(255, 107, 53, 0.3)',
    success: Palette.success,
    warning: Palette.warning,
    danger: Palette.danger,
    info: Palette.info,
    infoLight: 'rgba(59, 130, 246, 0.15)',
    successLight: 'rgba(16, 185, 129, 0.15)',
    warningLight: 'rgba(245, 158, 11, 0.15)',
    dangerLight: 'rgba(255, 76, 76, 0.15)',
    glassBackground: 'rgba(255, 255, 255, 0.85)',
    glassBorder: 'rgba(0, 0, 0, 0.05)',
  },
  dark: {
    background: '#040405',
    card: '#0D0D12',
    cardAlt: '#16161D',
    text: '#FFFFFF',
    textSecondary: '#A1A1AA',
    textMuted: '#71717A',
    border: '#27272A',
    borderLight: '#18181B',
    accent: Palette.accent,
    accentLight: 'rgba(255, 107, 53, 0.15)',
    accentBorder: 'rgba(255, 107, 53, 0.4)',
    success: Palette.success,
    warning: Palette.warning,
    danger: Palette.danger,
    info: Palette.info,
    infoLight: 'rgba(59, 130, 246, 0.15)',
    successLight: 'rgba(16, 185, 129, 0.15)',
    warningLight: 'rgba(245, 158, 11, 0.15)',
    dangerLight: 'rgba(255, 76, 76, 0.15)',
    glassBackground: 'rgba(4, 4, 5, 0.85)',
    glassBorder: 'rgba(255, 107, 53, 0.15)',
  },
} as const;

export type ThemeColors = typeof Colors.dark;
export type ColorScheme = 'light' | 'dark';

// ── Typography ─────────────────────────────────────────────────────
export const Typography = {
  hero: { fontSize: 28, fontWeight: '800' as const, lineHeight: 34, letterSpacing: 0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28, letterSpacing: 0.3 },
  heading: { fontSize: 18, fontWeight: '700' as const, lineHeight: 24, letterSpacing: 0.2 },
  large: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodyMedium: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
  small: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14 },
  micro: { fontSize: 10, fontWeight: '700' as const, lineHeight: 12 },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
    lineHeight: 16,
  },
} as const;

// ── Spacing & Sizes ────────────────────────────────────────────────
// Base unit: 8px grid
// Padding: Generous 24px horizontal safe zone
// Section spacing: 32px between sections
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24, // Main horizontal padding
  xl: 32, // Section spacing
  xxl: 40,
  xxxl: 48,
} as const;

export const BorderRadius = {
  sm: 8, // Inputs
  md: 12, // Cards
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999, // Pills/Badges
} as const;

// ── Shadows ────────────────────────────────────────────────────────
// Card elevation: Use shadowColor: '#FF6B35' with opacity 0.08
export const Shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: Palette.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
    },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: Palette.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
    },
    android: { elevation: 4 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: Palette.accent,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
    },
    android: { elevation: 8 },
    default: {},
  }),
  glow: Platform.select({
    ios: {
      shadowColor: Palette.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
  dangerGlow: Platform.select({
    ios: {
      shadowColor: Palette.danger,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

// ── Glass Effect ───────────────────────────────────────────────────
export const Glass = {
  intensity: Platform.OS === 'ios' ? 40 : 80,
  tint: 'dark' as const, // Forcing dark tint
} as const;

// ── Bottom Tab ─────────────────────────────────────────────────────
export const BottomTabInset = Platform.select({ ios: 34, android: 16 }) ?? 0;
export const TabBarHeight = 72 + BottomTabInset; // Larger for floating style
export const MaxContentWidth = 430;
