import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiClient } from '@/services/api/client';
import { authStorage } from '@/services/storage/authStorage';
import { useRouter } from 'expo-router';
import { getNotificationRoute } from '@/utils/notificationNavigation';
import { requestPushNotificationRefresh } from '@/utils/notificationEvents';

// SDK 53+: remote push was removed from Expo Go on Android — importing the module throws.
// Load only when push is actually available (dev build / standalone / iOS Expo Go).
const isExpoGoAndroid = Constants.appOwnership === 'expo' && Platform.OS === 'android';

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;
let registeredExpoPushToken: string | undefined;

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

/** Detach only this installation before local credentials are cleared. */
export async function unregisterCurrentPushToken(): Promise<void> {
  const token = registeredExpoPushToken;
  if (!token) return;
  try {
    await apiClient.delete('/users/push-token', { data: { token } });
  } catch (error) {
    if (__DEV__) console.warn('[PUSH] Device token could not be unregistered.', error);
  } finally {
    registeredExpoPushToken = undefined;
  }
}

export const usePushNotifications = (authenticated = false) => {
  const router = useRouter();
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>();
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);
  const lastHandledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    if (!Notifications) {
      if (isExpoGoAndroid) {
        console.warn(
          '[PUSH] Skipped in Expo Go on Android (SDK 53+). Use a development build for push notifications.'
        );
      }
      return;
    }

    let cancelled = false;

    const openPushDestination = (response: any) => {
      const request = response?.notification?.request;
      const responseId = String(request?.identifier || '');
      if (responseId && lastHandledResponseId.current === responseId) return;
      if (responseId) lastHandledResponseId.current = responseId;
      const data = request?.content?.data || {};
      requestPushNotificationRefresh();
      router.push(getNotificationRoute(data) as any);
    };

    const setupToken = async () => {
      if (cancelled) return;

      const jwtUserToken = await authStorage.getToken();
      if (!jwtUserToken) {
        console.warn('[PUSH] Session exists but no JWT token in storage yet — skipping push registration');
        return;
      }

      const token = await registerForPushNotificationsAsync();
      if (cancelled) return;
      setExpoPushToken(token);

      if (token) {
        try {
          await apiClient.post('/users/push-token', { token });
          registeredExpoPushToken = token;
          if (__DEV__) console.log('[PUSH] Device token registered with AutoSPF+ backend.');
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

    notificationListener.current = Notifications.addNotificationReceivedListener(() => {
      requestPushNotificationRefresh();
    });
    responseListener.current = Notifications.addNotificationResponseReceivedListener(openPushDestination);

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!cancelled && response) openPushDestination(response);
    });

    return () => {
      cancelled = true;
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [authenticated, router]);

  return { expoPushToken };
};
