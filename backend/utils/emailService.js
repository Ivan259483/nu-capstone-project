import nodemailer from 'nodemailer';
import axios from 'axios';
import { config } from '../config/environment.js';

/**
 * Email Service - Multi-provider Support
 * Providers: Brevo (primary), Gmail (fallback), Console (development)
 */

// Initialize transporter based on environment
const createTransporter = () => {
  // Option 1: Brevo (Sendinblue) - PRIMARY
  if (config.emailProvider === 'brevo') {
    return nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // TLS
      auth: {
        user: config.brevoSmtpUser,
        pass: config.brevoSmtpPassword,
      },
    });
  }

  // Option 2: Gmail with App Password
  if (config.emailProvider === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.emailUser,
        pass: config.emailPassword,
      },
    });
  }

  // Option 3: Generic SMTP
  if (config.emailProvider === 'smtp') {
    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure === 'true',
      auth: {
        user: config.emailUser,
        pass: config.emailPassword,
      },
    });
  }

  // Default: Console transport for development
  return nodemailer.createTransport({
    host: 'localhost',
    port: 1025,
    logger: true,
  });
};

let transporter = null;

/**
 * Initialize email service
 */
export const initializeEmailService = async () => {
  try {
    transporter = createTransporter();

    // Verify connection
    if (config.emailProvider && config.emailProvider !== 'console') {
      await transporter.verify();
      console.log('✅ Email service verified and ready');
    } else {
      console.log('📧 Email service in development mode (console)');
    }
  } catch (error) {
    console.error('❌ Email service error:', error.message);
    throw error;
  }
};

/**
 * Send OTP via email
 */
export const sendOtpEmail = async (userEmail, otp) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: userEmail,
      subject: 'Your OTP Code for AutoSPF+',
      html: generateOtpTemplate(otp),
      text: `Your OTP is: ${otp}. This code will expire in 10 minutes.`,
    };

    const result = await transporter.sendMail(mailOptions);

    console.log('✅ OTP email sent successfully:', {
      to: userEmail,
      from: senderEmail,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('❌ Failed to send OTP email:', {
      email: userEmail,
      error: error.message,
      stack: error.stack,
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });

    return {
      success: false,
      error: error.message,
      details: error.response || null
    };
  }
};

/**
 * Send verification email
 */
export const sendVerificationEmail = async (userEmail, verificationLink) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: userEmail,
      subject: 'Verify Your AutoSPF+ Account',
      html: generateVerificationTemplate(verificationLink),
    };

    const result = await transporter.sendMail(mailOptions);

    console.log('✅ Verification email sent:', {
      to: userEmail,
      from: senderEmail,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('❌ Failed to send verification email:', {
      email: userEmail,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (userEmail, resetLink) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: userEmail,
      subject: 'Password Reset Request - AutoSPF+',
      html: generatePasswordResetTemplate(resetLink),
    };

    const result = await transporter.sendMail(mailOptions);

    console.log('✅ Password reset email sent:', {
      to: userEmail,
      from: senderEmail,
      messageId: result.messageId,
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    console.error('❌ Failed to send password reset email:', {
      email: userEmail,
      error: error.message,
    });

    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * HTML Template for OTP Email
 */
const generateOtpTemplate = (otp) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 10px; }
          .header { text-align: center; border-bottom: 2px solid #007bff; padding-bottom: 20px; }
          .header h1 { color: #007bff; margin: 0; }
          .content { padding: 20px 0; text-align: center; }
          .otp-box { background-color: #f9f9f9; border: 2px solid #007bff; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .otp { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; }
          .footer { text-align: center; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>AutoSPF+</h1>
          </div>
          <div class="content">
            <h2>Your One-Time Password</h2>
            <p>Your OTP code is:</p>
            <div class="otp-box">
              <div class="otp">${otp}</div>
            </div>
            <p><strong>This code will expire in 10 minutes.</strong></p>
            <p>If you didn't request this code, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; 2026 AutoSPF+. All rights reserved.</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * HTML Template for Verification Email
 */
const generateVerificationTemplate = (verificationLink) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 10px; }
          .header { text-align: center; border-bottom: 2px solid #28a745; padding-bottom: 20px; }
          .header h1 { color: #28a745; margin: 0; }
          .content { padding: 20px 0; }
          .button { display: inline-block; background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Verify Your Account</h1>
          </div>
          <div class="content">
            <h2>Welcome to AutoSPF+!</h2>
            <p>Click the button below to verify your email address and activate your account.</p>
            <a href="${verificationLink}" class="button">Verify Email</a>
            <p>Or copy this link:</p>
            <p><small>${verificationLink}</small></p>
          </div>
          <div class="footer">
            <p>&copy; 2026 AutoSPF+. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

/**
 * HTML Template for Password Reset Email
 */
const generatePasswordResetTemplate = (resetLink) => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 10px; }
          .header { text-align: center; border-bottom: 2px solid #ffc107; padding-bottom: 20px; }
          .header h1 { color: #ffc107; margin: 0; }
          .content { padding: 20px 0; }
          .button { display: inline-block; background-color: #ffc107; color: black; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Reset Your Password</h1>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
            <a href="${resetLink}" class="button">Reset Password</a>
            <p>Or copy this link:</p>
            <p><small>${resetLink}</small></p>
            <p><strong>If you didn't request this, please ignore this email.</strong></p>
          </div>
          <div class="footer">
            <p>&copy; 2026 AutoSPF+. All rights reserved.</p>
          </div>
        </div>
      </body>
    </html>
  `;
};

export default {
  initializeEmailService,
  sendOtpEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};
