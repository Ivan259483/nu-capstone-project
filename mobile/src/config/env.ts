const DEFAULT_API_ORIGIN = 'https://nu-capstone-project-production.up.railway.app';

const rawApiUrl = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_ORIGIN).trim();
const sanitizedApiUrl = rawApiUrl.replace(/\/+$/, '');

export const API_BASE_URL = sanitizedApiUrl.endsWith('/api')
  ? sanitizedApiUrl
  : `${sanitizedApiUrl}/api`;

export const APP_STORAGE_KEYS = {
  token: 'autospf_token',
  backendUser: 'autospf_backend_user',
} as const;

export const FIREBASE_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCO203nx1fifBUyn9-KuAE1AfqflxPaQ5M',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'autospf-plus.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'autospf-plus',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'autospf-plus.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '227724962432',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:227724962432:web:fddb58f76cf6b348ee5465',
} as const;

/**
 * Google Web Client ID – required for expo-auth-session Google Sign-In.
 * Get this from Firebase Console → Authentication → Sign-in method → Google → Web Client ID
 * Or Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client
 */
export const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
