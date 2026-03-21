import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Always load backend/.env regardless of process cwd
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Determine email provider based on available credentials
const determineEmailProvider = () => {
  const providedProvider = process.env.EMAIL_PROVIDER;
  
  // If explicitly set, use it
  if (providedProvider) return providedProvider;
  
  // Check for Brevo credentials
  if (process.env.BREVO_SMTP_USER && process.env.BREVO_SMTP_PASSWORD) {
    return 'brevo';
  }
  
  // Check for Gmail credentials
  if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
    return 'gmail';
  }
  
  // Default to console mode for development
  console.log('⚠️ No email credentials configured - defaulting to console mode');
  return 'console';
};

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/autospf',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  corsOrigin: process.env.CORS_ORIGIN 
    ? process.env.CORS_ORIGIN.split(',') 
    : ['http://localhost:5173', 'http://192.168.18.94:5173', 'http://192.168.18.94:3000'],

  // Email Configuration
  emailProvider: determineEmailProvider(),
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
