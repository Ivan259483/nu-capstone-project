
import { config } from './config/environment.js';

console.log('Current Backend Configuration:');
console.log('-----------------------------');
console.log('Email Provider:', config.emailProvider);
console.log('Email From Address:', config.emailFromAddress);
console.log('Brevo SMTP User:', config.brevoSmtpUser);
console.log('Brevo SMTP Password:', config.brevoSmtpPassword ? '********' : 'MISSING');
console.log('-----------------------------');

if (config.brevoSmtpPassword === 'your_brevo_smtp_password_here') {
  console.log('⚠️  WARNING: Using placeholder Brevo password from .env.local!');
} else {
  console.log('✅ Not using placeholder password.');
}
