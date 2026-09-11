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
let pushRegistrationPromise: Promise<PushRegistrationResult> | null = null;

export type PushPermissionState =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unavailable'
  | 'error';

export type PushRegistrationResult = {
  state: PushPermissionState | 'ready';
  token?: string;
};

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

export async function getPushNotificationPermissionState(): Promise<PushPermissionState> {
  if (!Notifications || !Device.isDevice) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted' || status === 'denied' || status === 'undetermined') {
      return status;
    }
    return 'undetermined';
  } catch {
    return 'error';
  }
}

async function registerForPushNotificationsAsync(
  requestPermission: boolean
): Promise<PushRegistrationResult> {
  if (!Notifications || !Device.isDevice) return { state: 'unavailable' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      lightColor: '#FF6347',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    if (requestPermission) {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return {
        state: finalStatus === 'denied' ? 'denied' : 'undetermined',
      };
    }
  }

  try {
    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

    const token = (
      await Notifications.getExpoPushTokenAsync({
        projectId,
      })
    ).data;
    return token ? { state: 'ready', token } : { state: 'error' };
  } catch (e) {
    console.warn('Could not fetch Expo push token ->', e);
    return { state: 'error' };
  }
}

/** Verify OS permission, fetch the Expo token, and register this installation. */
export async function ensureCurrentPushTokenRegistered({
  requestPermission = true,
}: {
  requestPermission?: boolean;
} = {}): Promise<PushRegistrationResult> {
  if (registeredExpoPushToken) {
    const permissionState = await getPushNotificationPermissionState();
    if (permissionState === 'granted') {
      return { state: 'ready', token: registeredExpoPushToken };
    }
    if (!requestPermission || permissionState !== 'undetermined') {
      return { state: permissionState };
    }
  }
  if (pushRegistrationPromise) return pushRegistrationPromise;

  const task = (async (): Promise<PushRegistrationResult> => {
    const jwtUserToken = await authStorage.getToken();
    if (!jwtUserToken) return { state: 'error' as const };

    const registration = await registerForPushNotificationsAsync(requestPermission);
    if (registration.state !== 'ready' || !registration.token) return registration;

    try {
      await apiClient.post('/users/push-token', { token: registration.token });
      registeredExpoPushToken = registration.token;
      return registration;
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 401) {
        console.warn('[PUSH] Session expired during push registration.');
      } else {
        console.warn('[PUSH] Failed to submit push token to backend:', error?.message || error);
      }
      return { state: 'error' };
    }
  })().finally(() => {
    pushRegistrationPromise = null;
  });
  pushRegistrationPromise = task;

  return task;
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

      const registration = await ensureCurrentPushTokenRegistered();
      if (cancelled) return;
      const token = registration.token;
      setExpoPushToken(token);

      if (token) {
        if (__DEV__) console.log('[PUSH] Device token registered with AutoSPF+ backend.');
      } else if (registration.state === 'unavailable' && isExpoGoAndroid) {
        console.warn(
          '[PUSH] Skipped in Expo Go on Android (SDK 53+). Use a development build for push notifications.'
        );
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
