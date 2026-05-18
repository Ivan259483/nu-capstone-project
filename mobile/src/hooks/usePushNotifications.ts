import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiClient } from '@/services/api/client';
import { authStorage } from '@/services/storage/authStorage';

// SDK 53+: remote push was removed from Expo Go on Android — importing the module throws.
// Load only when push is actually available (dev build / standalone / iOS Expo Go).
const isExpoGoAndroid = Constants.appOwnership === 'expo' && Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;

if (!isExpoGoAndroid) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications') as NotificationsModule;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function registerForPushNotificationsAsync() {
  if (!Notifications) return undefined;

  let token: string | undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF6347',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
    } catch (e) {
      console.warn('Could not fetch expo push token ->', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export const usePushNotifications = (session?: unknown) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('');
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!session) return;
    if (!Notifications) {
      if (isExpoGoAndroid) {
        console.warn(
          '[PUSH] Skipped in Expo Go on Android (SDK 53+). Use a development build for push notifications.'
        );
      }
      return;
    }

    const setupToken = async () => {
      await new Promise((r) => setTimeout(r, 500));

      const jwtUserToken = await authStorage.getToken();
      if (!jwtUserToken) {
        console.warn('[PUSH] Session exists but no JWT token in storage yet — skipping push registration');
        return;
      }

      const token = await registerForPushNotificationsAsync();
      setExpoPushToken(token);

      if (token) {
        try {
          await apiClient.post('/users/push-token', { token });
          console.log(`[PUSH] Token registered securely with AutoSPF+ Backend: ${token}`);
        } catch (error: any) {
          const status = error?.response?.status;
          if (status === 401) {
            console.warn('[PUSH] Auth token expired during push registration — will retry on next session change');
          } else {
            console.warn('[PUSH] Failed to submit push token to backend:', error?.message || error);
          }
        }
      }
    };

    setupToken();

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: unknown) => {
      console.log('User tapped push notification:', response);
    });

    return () => {
      responseListener.current?.remove();
    };
  }, [session]);

  return { expoPushToken };
};
