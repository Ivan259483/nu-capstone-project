// ── API URL Resolution ────────────────────────────────────────────────
// Priority: EXPO_PUBLIC_API_URL env var → fallback production domain
//
// ⚠️  DO NOT use "localhost" or "127.0.0.1" here.
//     Mobile devices can NOT reach your Mac's localhost.
//     Use your machine's LAN IP (e.g. 192.168.x.x) for local dev,
//     or deploy to Railway/Render and use the production domain.
//
// Local dev: set EXPO_PUBLIC_API_URL=http://192.168.18.164:3000/api in .env
// Production: set EXPO_PUBLIC_API_URL=https://your-backend.railway.app/api

const FALLBACK_API_ORIGIN = 'https://nu-capstone-project-production.up.railway.app';

const rawApiUrl = (process.env.EXPO_PUBLIC_API_URL || FALLBACK_API_ORIGIN).trim();
const sanitizedApiUrl = rawApiUrl.replace(/\/+$/, '');

export const API_BASE_URL = sanitizedApiUrl.endsWith('/api')
  ? sanitizedApiUrl
  : `${sanitizedApiUrl}/api`;

// ── Debug: log API URL on startup ────────────────────────────────────
if (__DEV__) {
  console.log('[Config] API_BASE_URL:', API_BASE_URL);
}

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
