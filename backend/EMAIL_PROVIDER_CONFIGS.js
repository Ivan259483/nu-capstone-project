/**
 * Email Configuration by Provider
 * This file shows all available email service configurations
 * Copy the relevant section to your .env file
 */

// ============================================
// 🏆 RECOMMENDED: BREVO (SENDINBLUE)
// ============================================
// Best for startups: 300 free emails/day, custom domain, professional
// Setup time: 5 minutes
// Credentials location: https://app.brevo.com → Settings → SMTP & API

export const BREVO_CONFIG = {
  EMAIL_PROVIDER: 'brevo',
  EMAIL_FROM_NAME: 'AutoSPF+',
  EMAIL_FROM_ADDRESS: 'noreply@autospf.com',
  BREVO_SMTP_USER: 'contact@autospf.com', // Your Brevo email/username
  BREVO_SMTP_PASSWORD: 'your_brevo_smtp_password', // Generate in dashboard
  BREVO_API_KEY: 'optional_for_advanced_features',
  // SMTP Details: smtp-relay.brevo.com:587 (TLS)
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
  EMAIL_FROM_ADDRESS: 'noreply@autospf.com', // Overridden by Gmail
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
  EMAIL_FROM_ADDRESS: 'noreply@autospf.com',
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
  EMAIL_FROM_ADDRESS: 'noreply@autospf.com',
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
// EXAMPLE: Complete .env for Brevo
// ============================================
export const EXAMPLE_ENV_BREVO = `
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/autospf
JWT_SECRET=your_jwt_secret_key_change_in_production
CORS_ORIGIN=http://localhost:5173

# Email Configuration
EMAIL_PROVIDER=brevo
EMAIL_FROM_NAME=AutoSPF+
EMAIL_FROM_ADDRESS=noreply@autospf.com

# Brevo Credentials
BREVO_SMTP_USER=contact@autospf.com
BREVO_SMTP_PASSWORD=your_brevo_smtp_password_here
BREVO_API_KEY=optional_api_key

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
  brevo: {
    name: 'Brevo (Sendinblue)',
    freeTier: '300 emails/day',
    cost: 'Free → €20/month',
    customDomain: true,
    setupTime: '5 minutes',
    deliverability: 'Excellent',
    recommended: true,
    smtpHost: 'smtp-relay.brevo.com',
    smtpPort: 587,
    tlsRequired: true,
    pros: [
      '300 free emails/day (plenty for MVP)',
      'Custom domain support (professional)',
      'Excellent deliverability reputation',
      'Easy SMTP setup',
      'Great dashboard with detailed logs',
    ],
    cons: [
      'Requires account creation',
      'Limited to free tier after 300/day',
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
  brevo: [
    '1. Go to https://www.brevo.com',
    '2. Click "Sign up for free"',
    '3. Verify email and complete setup',
    '4. Go to Settings → SMTP & API',
    '5. Copy SMTP Login and Password',
    '6. Update .env with credentials',
    '7. Run: npm install nodemailer',
    '8. Start: npm run dev',
    '9. Test: curl -X POST http://localhost:3000/api/auth/send-otp',
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
  BREVO_CONFIG,
  GMAIL_CONFIG,
  SMTP_CONFIG,
  CONSOLE_CONFIG,
  OTP_CONFIG,
  EXAMPLE_ENV_BREVO,
  PROVIDER_COMPARISON,
  SETUP_STEPS,
  TROUBLESHOOTING,
};
