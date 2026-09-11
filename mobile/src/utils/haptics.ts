import { Platform } from 'react-native';
import * as ExpoHaptics from 'expo-haptics';

function runIos(effect: () => Promise<void>) {
  if (Platform.OS !== 'ios') return;
  void effect().catch(() => undefined);
}

export const Haptics = {
  primaryPress() {
    if (Platform.OS === 'android') {
      void ExpoHaptics.performAndroidHapticsAsync(ExpoHaptics.AndroidHaptics.Virtual_Key)
        .catch(() => undefined);
      return;
    }
    runIos(() => ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Light));
  },
  formSubmitError() {
    if (Platform.OS === 'android') {
      void ExpoHaptics.performAndroidHapticsAsync(ExpoHaptics.AndroidHaptics.Reject)
        .catch(() => undefined);
      return;
    }
    runIos(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error));
  },
  termsReviewComplete() {
    if (Platform.OS === 'android') {
      void ExpoHaptics.performAndroidHapticsAsync(ExpoHaptics.AndroidHaptics.Confirm)
        .catch(() => undefined);
      return;
    }
    runIos(() => ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success));
  },
} as const;
