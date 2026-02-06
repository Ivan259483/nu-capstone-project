
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const config = {
  emailProvider: 'brevo',
  brevoSmtpUser: process.env.BREVO_SMTP_USER,
  brevoSmtpPassword: process.env.BREVO_SMTP_PASSWORD,
  emailFromAddress: process.env.EMAIL_FROM_ADDRESS,
  emailFromName: process.env.EMAIL_FROM_NAME,
};

console.log('Testing with config:', {
  ...config,
  brevoSmtpPassword: config.brevoSmtpPassword ? '********' : 'MISSING'
});

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: config.brevoSmtpUser,
    pass: config.brevoSmtpPassword,
  },
});

async function test() {
  try {
    console.log('Verifying transporter...');
    await transporter.verify();
    console.log('✅ SMTP connection verified!');

    console.log('Sending test email...');
    const info = await transporter.sendMail({
      from: `"${config.emailFromName}" <${config.emailFromAddress}>`,
      to: 'test@example.com', // Change this to a real email if you want to see it
      subject: 'SMTP Test from AutoSPF+',
      text: 'This is a test email to verify SMTP configuration.',
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ SMTP Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response);
    }
  }
}

test();
