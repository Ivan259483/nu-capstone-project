import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiClient } from '@/services/api/client';
import { authStorage } from '@/services/storage/authStorage';

// Configure how notifications received in foreground should be handled
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync() {
  let token;

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
      // Get the native push token
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

export const usePushNotifications = (session?: string | null) => {
  const [expoPushToken, setExpoPushToken] = useState<string | undefined>('');
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Only register push token when we have an active session
    if (!session) return;

    const setupToken = async () => {
      // Small delay to ensure auth token is fully persisted to storage
      await new Promise((r) => setTimeout(r, 500));

      const jwtUserToken = await authStorage.getToken();
      if (!jwtUserToken) {
        console.warn('[PUSH] Session exists but no JWT token in storage yet — skipping push registration');
        return;
      }

      const token = await registerForPushNotificationsAsync();
      setExpoPushToken(token);

      if (token) {
        // Send the token securely to our backend
        try {
          await apiClient.post('/users/push-token', { token });
          console.log(`[PUSH] Token registered securely with AutoSPF+ Backend: ${token}`);
        } catch (error: any) {
          // If we get a 401, the token is likely expired — don't crash, just log
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

    // The user clicked on the notification (we can deep-link into orders later)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
      console.log('User tapped push notification:', response);
    });

    return () => {
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [session]); // Re-run when auth session changes (login/logout)

  return { expoPushToken };
};
