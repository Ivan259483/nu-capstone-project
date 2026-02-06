import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Email Configuration
  emailProvider: process.env.EMAIL_PROVIDER || 'brevo', // 'brevo', 'gmail', 'smtp', or 'console'
  emailFromName: process.env.EMAIL_FROM_NAME || 'AutoSPF+',
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@autospf.com',

  // Brevo (Sendinblue) Configuration
  brevoSmtpUser: process.env.BREVO_SMTP_USER || '',
  brevoSmtpPassword: process.env.BREVO_SMTP_PASSWORD || '',
  brevoApiKey: process.env.BREVO_API_KEY || '', // For advanced features

  // Gmail Configuration (Fallback)
  emailUser: process.env.EMAIL_USER || '',
  emailPassword: process.env.EMAIL_PASSWORD || '',

  // Generic SMTP Configuration (Alternative)
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: process.env.SMTP_PORT || 587,
  smtpSecure: process.env.SMTP_SECURE || 'false',

  // OTP Configuration
  otpExpiry: parseInt(process.env.OTP_EXPIRY || '600', 10), // 10 minutes in seconds
  otpLength: parseInt(process.env.OTP_LENGTH || '6', 10), // 6 digit OTP
};

export default config;
