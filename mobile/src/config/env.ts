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
import { Platform } from 'react-native';

const FALLBACK_API_ORIGIN = 'https://nu-capstone-project.onrender.com';
/** Local Express default (see backend PORT || 3000). Override with EXPO_PUBLIC_DEV_API_PORT if needed. */
const DEV_API_PORT = Number(process.env.EXPO_PUBLIC_DEV_API_PORT || 3000) || 3000;

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
  // Full origin, e.g. https://your-app.ngrok-free.app — /api is appended below.
  // Required for WebAR in WebView: mobile browsers need HTTPS (or localhost) for getUserMedia.
  const explicit = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/api\/?$/i, '').replace(/\/+$/, '');

  if (__DEV__) {
    const host = getExpoDebuggerHost();
    const ip = host?.split(':')[0];
    if (ip && ip !== 'localhost' && ip !== '127.0.0.1') {
      // Android emulator: the host machine is reachable at 10.0.2.2, not the LAN IP.
      const host =
        Platform.OS === 'android' && Constants.isDevice === false ? '10.0.2.2' : ip;
      return `http://${host}:${DEV_API_PORT}`;
    }
  }

  return FALLBACK_API_ORIGIN;
};

const sanitizedApiUrl = resolveApiOrigin().replace(/\/+$/, '');
const usedExplicitApiUrl = Boolean(process.env.EXPO_PUBLIC_API_URL?.trim());

export const API_BASE_URL = sanitizedApiUrl.endsWith('/api')
  ? sanitizedApiUrl
  : `${sanitizedApiUrl}/api`;

/**
 * When true, AR viewer uses the Cloudinary `raw` GLB URL directly instead of
 * `/api/ai/proxy-glb` — use to verify failures are proxy-related (no Meshy regen).
 * Set EXPO_PUBLIC_AR_DIRECT_GLB=1 in mobile/.env and restart Metro.
 */
export const AR_DIRECT_GLB =
  process.env.EXPO_PUBLIC_AR_DIRECT_GLB === '1' ||
  process.env.EXPO_PUBLIC_AR_DIRECT_GLB === 'true';

if (__DEV__) {
  console.log('[Config] API_BASE_URL:', API_BASE_URL);
  const insecureHttpDev =
    !usedExplicitApiUrl &&
    sanitizedApiUrl.startsWith('http://') &&
    !/localhost|127\.0\.0\.1/i.test(sanitizedApiUrl);
  if (insecureHttpDev) {
    console.warn(
      '[Config] EXPO_PUBLIC_API_URL is unset — using LAN HTTP. In-app WebAR blocks the camera; set EXPO_PUBLIC_API_URL to your ngrok HTTPS origin in mobile/.env, then restart Metro.'
    );
  }

  // Ngrok must forward to Express (GET /health → { status: 'ok' }). Offline tunnel (ERR_NGROK_3200) or wrong port → 404 on /api/*.
  if (usedExplicitApiUrl && /ngrok/i.test(API_BASE_URL)) {
    const origin = sanitizedApiUrl.replace(/\/+$/, '');
    const healthUrl = `${origin}/health`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    void fetch(healthUrl, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    })
      .then(async (r) => {
        clearTimeout(timer);
        const text = await r.text();
        let backendOk = false;
        if (r.ok) {
          try {
            const j = JSON.parse(text) as { status?: string; success?: boolean };
            backendOk = j?.status === 'ok' || j?.success === true;
          } catch {
            backendOk = false;
          }
        }
        if (!backendOk) {
          const offline =
            r.status === 404 && /ERR_NGROK_3200|endpoint .* is offline/i.test(text);
          const hint = offline
            ? 'This ngrok hostname is offline (ERR_NGROK_3200). Start the backend, run `ngrok http <PORT>` (same as backend PORT, often 3000), copy the new https forwarding URL into mobile/.env as EXPO_PUBLIC_API_URL, then restart Metro.'
            : 'Tunnel may not reach Express (wrong port or not this API). Run the backend, `ngrok http <that-port>`, set EXPO_PUBLIC_API_URL to that https origin (no trailing /api), restart Metro.';
          console.warn(`[Config] API probe failed (HTTP ${r.status}) at ${healthUrl}. ${hint}`);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        console.warn(
          `[Config] Could not reach ${healthUrl} (network or timeout). Confirm ngrok is running, the backend is up, and EXPO_PUBLIC_API_URL matches the active tunnel.`
        );
      });
  }
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
