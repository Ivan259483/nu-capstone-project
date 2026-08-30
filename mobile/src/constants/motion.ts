import { Easing } from 'react-native-reanimated';

/**
 * AutoSPF+ customer motion contract.
 *
 * Interaction motion is deliberately short and decisive. Long-running visual
 * effects (scanner progress, media processing, etc.) have their own semantic
 * timing and should not reuse these navigation/overlay values.
 */
export const Motion = {
  duration: {
    instant: 90,
    fast: 160,
    standard: 220,
    modalOpen: 230,
    modalClose: 190,
    sheetOpen: 240,
    sheetClose: 200,
    screen: 240,
    backdropOpen: 180,
    backdropClose: 160,
  },
  scale: {
    press: 0.985,
    compactPress: 0.99,
    modalFrom: 0.985,
  },
  distance: {
    modalY: 8,
  },
  easing: {
    enter: Easing.bezier(0.16, 1, 0.3, 1),
    exit: Easing.bezier(0.4, 0, 1, 1),
    standard: Easing.bezier(0.22, 1, 0.36, 1),
  },
} as const;

export const reducedMotionDuration = (reducedMotion: boolean, duration: number) =>
  reducedMotion ? 1 : duration;
