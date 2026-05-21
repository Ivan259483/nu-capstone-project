/**
 * Email Configuration by Provider
 * This file shows all available email service configurations
 * Copy the relevant section to your .env file
 */

// ============================================
// 🏆 RECOMMENDED: RESEND
// ============================================
// Best for transactional app email with custom-domain SPF/DKIM/DMARC
// Setup time: 5 minutes
// Credentials location: https://resend.com/api-keys

export const RESEND_CONFIG = {
  EMAIL_PROVIDER: 'resend',
  EMAIL_FROM_NAME: 'AutoSPF+',
  EMAIL_FROM_ADDRESS: 'verify@autospf.shop',
  EMAIL_REPLY_TO: 'support@autospf.shop',
  SUPPORT_EMAIL: 'support@autospf.shop',
  RESEND_API_KEY: 're_xxxxxxxxx',
};

// ============================================
// 💻 ALTERNATIVE: GMAIL
// ============================================
// Free but limited: ~500/day (rate limited)
// Setup time: 10 minutes
// Good for: Development, backup

export const GMAIL_CONFIG = {
  EMAIL_PROVIDER: 'gmail',
  EMAIL_FROM_NAME: 'AutoSPF+',
  EMAIL_FROM_ADDRESS: 'verify@autospf.shop', // Overridden by Gmail
  EMAIL_USER: 'your_email@gmail.com',
  EMAIL_PASSWORD: 'xxxx xxxx xxxx xxxx', // 16-char app password from https://myaccount.google.com/apppasswords
  // Steps: Enable 2FA → Generate App Password → Use that password
};

// ============================================
// 🔌 ALTERNATIVE: GENERIC SMTP
// ============================================
// Works with any SMTP server
// Examples: SendGrid, MailerSend, etc.
// Setup time: 15 minutes

export const SMTP_CONFIG = {
  EMAIL_PROVIDER: 'smtp',
  EMAIL_FROM_NAME: 'AutoSPF+',
  EMAIL_FROM_ADDRESS: 'verify@autospf.shop',
  EMAIL_USER: 'your_smtp_username',
  EMAIL_PASSWORD: 'your_smtp_password',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false', // Set to 'true' for port 465
};

// ============================================
// 🧪 DEVELOPMENT: CONSOLE
// ============================================
// Emails logged to console instead of sent
// Perfect for: Testing without email service

export const CONSOLE_CONFIG = {
  EMAIL_PROVIDER: 'console',
  EMAIL_FROM_NAME: 'AutoSPF+',
  EMAIL_FROM_ADDRESS: 'verify@autospf.shop',
  // Emails will be logged to console
  // No external service needed
};

// ============================================
// OTP CONFIGURATION (Same for all providers)
// ============================================
export const OTP_CONFIG = {
  OTP_EXPIRY: '600', // 10 minutes in seconds
  OTP_LENGTH: '6', // 6-digit OTP
};

// ============================================
// EXAMPLE: Complete .env for Resend
// ============================================
export const EXAMPLE_ENV_RESEND = `
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/autospf
JWT_SECRET=your_jwt_secret_key_change_in_production
CORS_ORIGIN=http://localhost:5173

# Email Configuration
EMAIL_PROVIDER=resend
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=verify@autospf.shop
EMAIL_REPLY_TO=support@autospf.shop
SUPPORT_EMAIL=support@autospf.shop

# Resend Credentials
RESEND_API_KEY=re_xxxxxxxxx

# OTP Configuration
OTP_EXPIRY=600
OTP_LENGTH=6

# Optional: Fallback Gmail
EMAIL_USER=your_backup_email@gmail.com
EMAIL_PASSWORD=xxxx xxxx xxxx xxxx
`;

// ============================================
// COMPARISON TABLE
// ============================================
export const PROVIDER_COMPARISON = {
  resend: {
    name: 'Resend',
    freeTier: 'Plan-dependent',
    cost: 'Free tier available, then usage-based',
    customDomain: true,
    setupTime: '5 minutes',
    deliverability: 'Excellent',
    recommended: true,
    pros: [
      'Custom domain support with SPF, DKIM, and DMARC alignment',
      'Transactional email API with tags and idempotency keys',
      'Dashboard logs and domain verification status',
    ],
    cons: [
      'Requires DNS setup and domain warm-up',
      'New domains still need reputation building',
    ],
  },
  gmail: {
    name: 'Gmail',
    freeTier: 'Unlimited*',
    cost: 'Free (with account)',
    customDomain: false,
    setupTime: '10 minutes',
    deliverability: 'Good',
    recommended: false,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    tlsRequired: true,
    pros: [
      'Free (no additional cost)',
      'Familiar platform',
      'Reliable',
    ],
    cons: [
      'Limited to ~500 emails/day (rate limited)',
      'Cannot use custom domain',
      'Requires Google Account 2FA',
      'Less professional for business',
    ],
  },
  smtp: {
    name: 'Generic SMTP',
    freeTier: 'Varies',
    cost: 'Varies',
    customDomain: true,
    setupTime: '15 minutes',
    deliverability: 'Varies',
    recommended: false,
    pros: [
      'Works with any SMTP provider',
      'Maximum flexibility',
    ],
    cons: [
      'Requires external service',
      'Configuration varies by provider',
    ],
  },
};

// ============================================
// QUICK SETUP STEPS
// ============================================
export const SETUP_STEPS = {
  resend: [
    '1. Go to https://resend.com/domains',
    '2. Add autospf.shop as a sending domain',
    '3. Add the Resend SPF, DKIM, and return-path MX records in DNS',
    '4. Add _dmarc.autospf.shop with a monitoring policy',
    '5. Click Verify DNS Records in Resend',
    '6. Set RESEND_API_KEY and EMAIL_FROM_ADDRESS=verify@autospf.shop',
    '7. Run: npm run check:email-dns',
    '8. Test: curl -X POST http://localhost:8080/api/auth/send-otp',
  ],
  gmail: [
    '1. Go to https://myaccount.google.com/security',
    '2. Enable 2-Step Verification',
    '3. Go to https://myaccount.google.com/apppasswords',
    '4. Select "Mail" and "Windows Computer"',
    '5. Copy the 16-character password',
    '6. Update .env with Gmail and app password',
    '7. Run: npm install nodemailer',
    '8. Start: npm run dev',
  ],
};

// ============================================
// HELP & TROUBLESHOOTING
// ============================================
export const TROUBLESHOOTING = {
  noEmailReceived: {
    issue: 'Email not arriving',
    solutions: [
      'Check spam/junk folder',
      'Verify sender email is correct',
      'Check service dashboard for delivery status',
      'Try alternative email address',
    ],
  },
  serviceError: {
    issue: 'Email service error on startup',
    solutions: [
      'Verify SMTP credentials are correct',
      'Check internet connection',
      'Ensure port 587 is not blocked',
      'Try restarting: npm run dev',
    ],
  },
  failedToSend: {
    issue: '"Failed to send OTP" error',
    solutions: [
      'Verify EMAIL_PROVIDER setting',
      'Check credentials in .env',
      'Ensure npm install was run',
      'Look at console logs for details',
    ],
  },
  otpExpired: {
    issue: 'OTP expired before user verification',
    solutions: [
      'OTP validity is 10 minutes by default',
      'Increase OTP_EXPIRY in .env if needed',
      'User can request new OTP',
    ],
  },
};

export default {
  RESEND_CONFIG,
  GMAIL_CONFIG,
  SMTP_CONFIG,
  CONSOLE_CONFIG,
  OTP_CONFIG,
  EXAMPLE_ENV_RESEND,
  PROVIDER_COMPARISON,
  SETUP_STEPS,
  TROUBLESHOOTING,
};
