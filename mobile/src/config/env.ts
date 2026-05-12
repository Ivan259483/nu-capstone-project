// ── API URL Resolution ────────────────────────────────────────────────
// Priority:
//   1. EXPO_PUBLIC_API_URL env var (explicit override)
//   2. In dev: auto-detect the LAN IP from Expo's debugger host
//      (whichever IP `expo start` bound to, e.g. 192.168.x.x)
//   3. Fallback to the production Render domain
//
// This means swapping Wi-Fi networks or moving between routers
// "just works" — no .env edits needed for local dev.
import Constants from 'expo-constants';

const FALLBACK_API_ORIGIN = 'https://nu-capstone-project.onrender.com';
const DEV_API_PORT = 3000;

/**
 * Pull the host:port that Metro/Expo Dev Server is bound to.
 * Works across SDK versions (expoConfig, expoGoConfig, manifest2).
 */
const getExpoDebuggerHost = (): string | undefined => {
  const c = Constants as any;
  return (
    c.expoConfig?.hostUri ||
    c.expoGoConfig?.debuggerHost ||
    c.manifest2?.extra?.expoGo?.debuggerHost ||
    c.manifest?.debuggerHost ||
    c.manifest?.hostUri
  );
};

const resolveApiOrigin = (): string => {
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit;

  if (__DEV__) {
    const host = getExpoDebuggerHost();
    const ip = host?.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      return `http://${ip}:${DEV_API_PORT}`;
    }
  }

  return FALLBACK_API_ORIGIN;
};

const sanitizedApiUrl = resolveApiOrigin().replace(/\/+$/, '');

export const API_BASE_URL = sanitizedApiUrl.endsWith('/api')
  ? sanitizedApiUrl
  : `${sanitizedApiUrl}/api`;

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
