import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

export type HapticImpact = 'light' | 'medium' | 'heavy';
export type HapticNotification = 'success' | 'warning' | 'error';

const impactStyle: Record<HapticImpact, ExpoHaptics.ImpactFeedbackStyle> = {
  light: ExpoHaptics.ImpactFeedbackStyle.Light,
  medium: ExpoHaptics.ImpactFeedbackStyle.Medium,
  heavy: ExpoHaptics.ImpactFeedbackStyle.Heavy,
};

const notificationType: Record<HapticNotification, ExpoHaptics.NotificationFeedbackType> = {
  success: ExpoHaptics.NotificationFeedbackType.Success,
  warning: ExpoHaptics.NotificationFeedbackType.Warning,
  error: ExpoHaptics.NotificationFeedbackType.Error,
};

function supported() {
  return Platform.OS !== 'web';
}

export const Haptics = {
  impact(kind: HapticImpact = 'light') {
    if (!supported()) return;
    void ExpoHaptics.impactAsync(impactStyle[kind]).catch(() => undefined);
  },
  selection() {
    if (!supported()) return;
    void ExpoHaptics.selectionAsync().catch(() => undefined);
  },
  notify(kind: HapticNotification) {
    if (!supported()) return;
    void ExpoHaptics.notificationAsync(notificationType[kind]).catch(() => undefined);
  },
} as const;
