import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file — but do NOT override env vars already set by the platform (Railway, etc.)
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });

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
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf',
  jwtSecret: process.env.JWT_SECRET, // Required — validated above
  corsOrigin: (() => {
    const raw = process.env.CORS_ORIGIN;

    // Always-allowed origins (production domains + local dev)
    const ALWAYS_ALLOWED = [
      'https://autospf.shop',
      'https://www.autospf.shop',
      'http://localhost:5173',
      'http://localhost:3000',
      'http://127.0.0.1:5173',
      // Next.js / Vite dev (HTTP + HTTPS) for local + mkcert
      'http://localhost:3100',
      'https://localhost:3100',
      'http://127.0.0.1:3100',
      'https://127.0.0.1:3100',
    ];

    if (!raw || raw.trim() === '*') {
      // No restriction set — allow all (return true = any origin)
      return true;
    }

    // Merge env var origins with always-allowed list (deduplicated)
    const fromEnv = raw.split(',').map(s => s.trim()).filter(Boolean);
    const merged = Array.from(new Set([...ALWAYS_ALLOWED, ...fromEnv]));
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
};

export default config;
