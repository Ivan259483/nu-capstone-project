/**
 * AutoSPF+ Auth Theme
 *
 * A restrained, international-premium dark theme scoped to the auth flow
 * (Welcome, Sign In, Create Account, Reset Password, OTP) only. This does
 * NOT replace `./theme.ts`, which remains the app-wide, orange-branded
 * theme for the dashboard/bookings/etc. Orange never appears here — the
 * brand mark is confined to the bundled logo images, not this palette.
 *
 * Fixed dark aesthetic: unlike `./theme.ts`, this module does not read
 * from `useThemeContext()` and has no light variant.
 */

import { Motion } from './motion';

export const AuthColors = {
  // Surfaces
  bg: '#0B0B0C',
  card: '#141416',
  elevated: '#1C1C1F',

  // Borders
  borderHairline: 'rgba(255,255,255,0.08)',
  borderFocus: 'rgba(255,255,255,0.24)',

  // Text
  textPrimary: '#F5F5F4',
  textSecondary: 'rgba(245,245,244,0.56)',
  textTertiary: 'rgba(245,245,244,0.36)',

  // Semantic — text + 1px border only, never used as a fill
  error: '#E5484D',
  success: '#30A46C',

  // Buttons
  buttonPrimaryBg: '#F5F5F4',
  buttonPrimaryText: '#0B0B0C',
  buttonDisabledBg: '#1C1C1F',
  buttonDisabledText: 'rgba(245,245,244,0.36)',

  // Cinematic background treatment (Sign In / Welcome only)
  photoMute: 'rgba(128,128,128,0.18)',
  photoScrimTop: 'rgba(11,11,12,0.35)',
  photoScrimBottom: 'rgba(11,11,12,0.92)',
  photoBase: 'rgba(11,11,12,0.45)',

  // Form-on-photo surface (Sign In fields sit above the cinematic backdrop)
  cardOnPhoto: 'rgba(20,20,22,0.96)',
} as const;

export const AuthRadius = {
  input: 14,
  button: 14,
  card: 20,
  full: 9999, // avatars/back-button only
} as const;

export const AuthSpacing = {
  unit: 4, // 4pt grid base
  sectionGap: 32,
  fieldGap: 20,
  labelToInput: 8,
  screenPaddingHorizontal: 24,
} as const;

export const AuthFontFamily = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semiBold: 'Inter-SemiBold',
} as const;

/** Passed to `useFonts()` in the root layout. */
export const AuthFontAssets = {
  [AuthFontFamily.regular]: require('../../assets/fonts/Inter-Regular.ttf'),
  [AuthFontFamily.medium]: require('../../assets/fonts/Inter-Medium.ttf'),
  [AuthFontFamily.semiBold]: require('../../assets/fonts/Inter-SemiBold.ttf'),
} as const;

export const AuthTypography = {
  h1: {
    fontFamily: AuthFontFamily.semiBold,
    fontSize: 30,
    lineHeight: 30 * 1.15,
    letterSpacing: -0.02 * 30,
  },
  body: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 16,
    lineHeight: 24,
  },
  bodySecondary: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontFamily: AuthFontFamily.medium,
    fontSize: 13,
    letterSpacing: 0,
  },
  button: {
    fontFamily: AuthFontFamily.semiBold,
    fontSize: 16,
  },
  error: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 13,
  },
  footer: {
    fontFamily: AuthFontFamily.regular,
    fontSize: 14,
  },
} as const;

// Re-exported (not duplicated) — see `Motion.scale.authPress` /
// `Motion.easing.authStandard` in `./motion.ts` for the two additive tokens
// this theme relies on.
export { Motion as AuthMotion } from './motion';

export const AuthTheme = {
  colors: AuthColors,
  radius: AuthRadius,
  spacing: AuthSpacing,
  typography: AuthTypography,
  fontFamily: AuthFontFamily,
  motion: Motion,
} as const;
