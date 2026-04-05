import { getApp, getApps, initializeApp } from 'firebase/app';
import { initializeAuth, type Auth } from 'firebase/auth';
// @ts-ignore - getReactNativePersistence is not correctly typed in all firebase versions
import { getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_CONFIG } from '@/config/env';

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export { app, auth };
