import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_CONFIG } from '@/config/env';

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

let auth: Auth;
try {
  // Firebase v10+ React Native persistence
  const { getReactNativePersistence } = require('firebase/auth');
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });
} catch {
  // Fallback: use default auth without custom persistence
  auth = getAuth(app);
}

export { app, auth };
