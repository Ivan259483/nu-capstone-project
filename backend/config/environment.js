import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file — but do NOT override env vars already set by the platform (Railway, etc.)
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

// Startup-only presence check. Never log configuration values because the API
// key and other deployment settings are server-side secrets.
const ROBOFLOW_ENV_KEYS = [
  'ROBOFLOW_API_KEY',
  'ROBOFLOW_API_URL',
  'ROBOFLOW_WORKSPACE',
  'ROBOFLOW_WORKFLOW_ID',
  'ROBOFLOW_IMAGE_INPUT',
];

console.log('\nRoboflow Configuration:');
ROBOFLOW_ENV_KEYS.forEach((key) => {
  const configured = Boolean(String(process.env[key] || '').trim());
  console.log(`  ${key}: ${configured ? 'configured' : 'missing'}`);
});

// Determine email provider based on available credentials
const determineEmailProvider = () => {
  const providedProvider = process.env.EMAIL_PROVIDER;

  // If explicitly set, use it
  if (providedProvider) return providedProvider;

  // Check for Resend credentials
  if (process.env.RESEND_API_KEY) return 'resend';


  // Check for Gmail credentials
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) return 'gmail';

  // Default to console mode for development
  console.log('⚠️ No email credentials configured - defaulting to console mode');
  return 'console';
};

/* ─── Required secrets validation ──────────────────────────────────────
   These must be set via environment variables before the server starts.
   A missing secret causes a hard crash so the issue is caught immediately
   rather than silently degrading security in production.
   ─────────────────────────────────────────────────────────────────────── */
const REQUIRED_SECRETS = ['JWT_SECRET', 'ENCRYPTION_KEY'];
const missingSecrets = REQUIRED_SECRETS.filter((key) => !process.env[key]);
if (missingSecrets.length > 0) {
  console.error(
    '\n🚨 [CONFIG] FATAL: Required secret environment variables are missing:\n' +
    missingSecrets.map((k) => `   ✗ ${k}`).join('\n') +
    '\n\n   Add these to your backend/.env file and restart the server.\n' +
    '   See backend/.env.example for reference.\n'
  );
  process.exit(1);
}

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  publicApiOrigin: (() => {
    const isProduction = process.env.NODE_ENV === 'production';
    const fallback = isProduction ? 'https://nu-capstone-project.onrender.com' : '';
    const raw = String(process.env.PUBLIC_API_ORIGIN || fallback).trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
      if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
        throw new Error('must be an origin without credentials, path, query, or fragment');
      }
      if (isProduction && parsed.protocol !== 'https:') throw new Error('production origin must use HTTPS');
      return parsed.origin;
    } catch (error) {
      console.warn(`[CONFIG] Invalid PUBLIC_API_ORIGIN; using the safe default: ${error.message}`);
      return fallback;
    }
  })(),
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf',
  jwtSecret: process.env.JWT_SECRET, // Required — validated above
  corsOrigin: (() => {
    const raw = process.env.CORS_ORIGIN;

    const productionOrigins = [
      'https://autospf.shop',
      'https://www.autospf.shop',
      // Capacitor iOS uses this app-scoped WebView origin; it is not a network
      // localhost endpoint. Native Expo/server clients continue to omit Origin.
      'capacitor://localhost',
    ];
    const developmentOrigins = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'capacitor://localhost',
      // Next.js / Vite dev (HTTP + HTTPS) for local + mkcert
      'http://localhost:3100',
      'https://localhost:3100',
      'http://127.0.0.1:3100',
      'https://127.0.0.1:3100',
    ];
    const isProduction = process.env.NODE_ENV === 'production';
    const defaults = isProduction
      ? productionOrigins
      : developmentOrigins;

    if (!raw || raw.trim() === '*') {
      // A missing or wildcard-like value always resolves to exact, environment-
      // scoped defaults. Development must not silently become allow-all.
      return defaults;
    }

    // Merge explicitly configured origins only after normalizing exact origins.
    // Production accepts only the fixed application allowlist. Development may
    // add an exact tunnel/staging origin without creating a wildcard policy.
    const fromEnv = raw.split(',').map(s => s.trim()).filter(Boolean).flatMap((candidate) => {
      try {
        if (candidate === '*' || candidate.includes('*')) throw new Error('wildcards are not allowed');
        const parsed = new URL(candidate);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
        if (parsed.username || parsed.password) throw new Error('credentials are not allowed');
        if (parsed.search || parsed.hash || (parsed.pathname && parsed.pathname !== '/')) {
          throw new Error('paths, queries, and fragments are not allowed');
        }
        if (isProduction && parsed.protocol !== 'https:') throw new Error('production origins must use HTTPS');
        if (isProduction && ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
          throw new Error('localhost is development-only');
        }
        if (isProduction && !productionOrigins.includes(parsed.origin)) {
          throw new Error('origin is not in the production application allowlist');
        }
        return [parsed.origin];
      } catch (error) {
        console.warn(`[CONFIG] Ignoring invalid CORS_ORIGIN entry "${candidate}": ${error.message}`);
        return [];
      }
    });
    const merged = Array.from(new Set([...defaults, ...fromEnv]));
    return merged;
  })(),

  // Email Configuration
  emailProvider: determineEmailProvider(),
  emailFromName: process.env.EMAIL_FROM_NAME || 'AutoSPF+',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'verify@autospf.shop',

  // Resend Configuration
  resendApiKey: process.env.RESEND_API_KEY || '',

  // Generic SMTP Configuration (Alternative)
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: process.env.SMTP_PORT || 587,
  smtpSecure: process.env.SMTP_SECURE || 'false',

  // OTP Configuration
  otpExpiry: parseInt(process.env.OTP_EXPIRY || '600', 10), // 10 minutes in seconds
  otpLength: parseInt(process.env.OTP_LENGTH || '6', 10), // 6 digit OTP
  loginOtpExpiry: parseInt(process.env.LOGIN_OTP_EXPIRY || '300', 10), // 5 minutes in seconds
  loginOtpChallengeExpiry: parseInt(process.env.LOGIN_OTP_CHALLENGE_EXPIRY || '900', 10), // 15 minutes in seconds
  loginOtpResendCooldown: parseInt(process.env.LOGIN_OTP_RESEND_COOLDOWN || '60', 10),
  loginOtpMaxAttempts: parseInt(process.env.LOGIN_OTP_MAX_ATTEMPTS || '3', 10),
  loginOtpMaxSends: parseInt(process.env.LOGIN_OTP_MAX_SENDS || '5', 10),
  staffVerificationTokenExpiry: parseInt(process.env.STAFF_VERIFICATION_TOKEN_EXPIRY || '86400', 10), // 24 hours in seconds
  passwordSetupTokenExpiry: parseInt(process.env.PASSWORD_SETUP_TOKEN_EXPIRY || '3600', 10), // 1 hour in seconds
};

export default config;
