import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, type Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_CONFIG } from '@/config/env';

// ── Singleton guard: only initialize once even across hot reloads ──────
const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);

// ── Auth with React Native AsyncStorage persistence ───────────────────
// initializeAuth throws if auth is already initialized for this app.
// getAuth() returns the existing instance in that case.
let auth: Auth;

if (getApps().length > 0) {
  try {
    // Try to create with persistence first (first launch / fresh start)
    const { getReactNativePersistence } = require('firebase/auth');
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
    console.log('[Firebase] Auth initialized with AsyncStorage persistence');
  } catch (e: any) {
    // Already initialized — just get the existing instance
    auth = getAuth(app);
    console.log('[Firebase] Auth already initialized, using existing instance');
  }
} else {
  auth = getAuth(app);
}

export { app, auth };
