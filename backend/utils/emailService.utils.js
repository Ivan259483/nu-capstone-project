import nodemailer from 'nodemailer';
import axios from 'axios';
import { config } from '../config/environment.js';

/**
 * Email Service - Multi-provider Support
 * Providers: Brevo (primary), Gmail (fallback), Console (development)
 */

// Initialize transporter based on environment
const createTransporter = () => {
  // Option 1: Brevo (Sendinblue) - PRIMARY (strict SMTP configuration)
  if (config.emailProvider === 'brevo') {
    if (!config.brevoSmtpUser || !config.brevoSmtpPassword) {
      console.error('❌ Brevo credentials missing - cannot create Brevo transporter');
      console.error('   Required: BREVO_SMTP_USER and BREVO_SMTP_PASSWORD');
      return createConsoleTransporter();
    }

    console.log('📧 Initializing Brevo SMTP transporter...');
    console.log('  Host: smtp-relay.brevo.com');
    console.log('  Port: 587');
    console.log('  Secure: false (TLS)');
    console.log('  User:', config.brevoSmtpUser);

    return nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',
      port: 587,
      secure: false, // TLS (NOT SSL)
      auth: {
        user: config.brevoSmtpUser,
        pass: config.brevoSmtpPassword,
      },
      logger: true,
      debug: true, // Enable debug mode to see SMTP conversation
    });
  }

  // Option 2: Gmail with App Password
  if (config.emailProvider === 'gmail') {
    if (!config.emailUser || !config.emailPassword) {
      console.error('❌ Gmail credentials missing - cannot create Gmail transporter');
      return createConsoleTransporter();
    }

    console.log('📧 Using Gmail SMTP provider');
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
    if (!config.emailUser || !config.emailPassword) {
      console.error('❌ SMTP credentials missing');
      return createConsoleTransporter();
    }

    console.log('📧 Using Generic SMTP provider');
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
  console.log('📧 Using Console mode for development');
  return createConsoleTransporter();
};

const createConsoleTransporter = () => {
  return {
    sendMail: async (mailOptions) => {
      console.log('📧 [CONSOLE EMAIL] Would send email:', {
        from: mailOptions.from,
        to: mailOptions.to,
        subject: mailOptions.subject,
        text: mailOptions.text ? mailOptions.text.substring(0, 100) : undefined
      });
      return { response: 'Console mode - email not actually sent' };
    },
    verify: async () => true
  };
};

let transporter = null;

/**
 * Initialize email service
 */
export const initializeEmailService = async () => {
  try {
    transporter = createTransporter();

    // Verify connection (skip for console mode)
    if (config.emailProvider && config.emailProvider !== 'console') {
      try {
        console.log('🔄 Verifying email service connection...');
        await transporter.verify();
        console.log('✅ Email service verified successfully');
      } catch (verifyError) {
        console.error('❌ Email service verification failed:');
        console.error('   Error:', verifyError.message);
        console.error('   Code:', verifyError.code);
        console.error('   Command:', verifyError.command);
        if (verifyError.response) {
          console.error('   SMTP Response:', verifyError.response);
        }
        
        console.log('⚠️ Falling back to console mode for OTP sending');
        transporter = createConsoleTransporter();
      }
    } else {
      console.log('📧 Email service configured for console mode (development)');
    }
  } catch (error) {
    console.error('❌ Email service initialization error:', error.message);
    transporter = createConsoleTransporter();
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

    console.log('📤 Sending OTP email...');
    console.log('   From:', mailOptions.from);
    console.log('   To:', userEmail);
    console.log('   OTP:', otp);

    const result = await transporter.sendMail(mailOptions);

    console.log('✅ OTP email sent successfully');
    console.log('   MessageID:', result.messageId);
    console.log('   Response:', result.response);

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    // DETAILED ERROR LOGGING
    console.error('❌ Failed to send OTP email');
    console.error('   Email:', userEmail);
    console.error('   Error Message:', error.message);
    console.error('   Error Code:', error.code);
    console.error('   SMTP Command:', error.command);
    console.error('   Response Code:', error.responseCode);
    
    if (error.response) {
      console.error('   SMTP Server Response:', error.response);
    }
    
    if (error.stack) {
      console.error('   Stack Trace:', error.stack.substring(0, 500));
    }

    return {
      success: false,
      error: error.message,
      details: {
        code: error.code,
        responseCode: error.responseCode,
        response: error.response
      }
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
 * Send booking notification email
 */
export const sendBookingNotification = async (recipientEmail, orderData) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+ Notifications';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: recipientEmail,
      subject: `New Booking Received: ${orderData.orderNumber}`,
      html: generateBookingTemplate(orderData),
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send booking email:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send low stock alert email
 */
export const sendLowStockAlert = async (recipientEmail, itemData) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+ Inventory';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: recipientEmail,
      subject: `🚨 Low Stock Alert: ${itemData.name}`,
      html: generateLowStockTemplate(itemData),
    };

    const result = await transporter.sendMail(mailOptions);
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send low stock alert:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send service completed email to customer
 */
export const sendServiceCompletedEmail = async (customerEmail, orderData) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: customerEmail,
      subject: `✨ Your ${orderData.serviceName} is Complete!`,
      html: generateServiceCompletedTemplate(orderData),
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Service completed email sent:', {
      to: customerEmail,
      orderNumber: orderData.orderNumber,
      messageId: result.messageId,
    });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send service completed email:', error.message);
    return { success: false, error: error.message };
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

/**
 * HTML Template for Booking Notification
 */
const generateBookingTemplate = (order) => {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
      <div style="background: #F57C00; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">New Service Booking</h1>
      </div>
      <div style="padding: 24px; color: #333;">
        <p>A new booking has been placed on <strong>AutoSPF+</strong>.</p>
        <div style="background: #f9f9f9; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <p style="margin: 0 0 8px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p style="margin: 0 0 8px 0;"><strong>Customer:</strong> ${order.customerName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Service:</strong> ${order.serviceName}</p>
          <p style="margin: 0 0 8px 0;"><strong>Date/Time:</strong> ${order.bookingDate} at ${order.bookingTime}</p>
          <p style="margin: 0 0 0 0;"><strong>Vehicle:</strong> ${order.vehicleInfo}</p>
        </div>
        <p>Please log in to the Admin Dashboard to assign a detailer.</p>
      </div>
    </div>
  `;
};

/**
 * HTML Template for Low Stock Alert
 */
const generateLowStockTemplate = (item) => {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
      <div style="background: #d32f2f; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Low Stock Alert</h1>
      </div>
      <div style="padding: 24px; color: #333;">
        <p>The following inventory item has reached its minimum level:</p>
        <div style="background: #fff5f5; border: 1px solid #ffcdd2; padding: 16px; border-radius: 4px; margin: 16px 0;">
          <h2 style="margin: 0 0 8px 0; color: #d32f2f;">${item.name}</h2>
          <p style="margin: 0 0 8px 0;"><strong>Current Stock:</strong> ${item.stock} ${item.unit}</p>
          <p style="margin: 0 0 0 0;"><strong>Minimum Level:</strong> ${item.minLevel} ${item.unit}</p>
        </div>
        <p>Please contact your supplier to restock this item.</p>
      </div>
    </div>
  `;
};

/**
 * HTML Template for Service Completed Email
 */
const generateServiceCompletedTemplate = (order) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 20px auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      <div style="background: linear-gradient(135deg, #F57C00 0%, #E65100 100%); color: white; padding: 32px; text-align: center;">
        <h1 style="margin: 0 0 8px 0; font-size: 28px;">✨ Service Complete!</h1>
        <p style="margin: 0; opacity: 0.9;">Your vehicle is ready for pickup</p>
      </div>
      <div style="padding: 32px; color: #333; background: #fff;">
        <p style="font-size: 16px; margin-bottom: 24px;">Hi <strong>${order.customerName}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.6;">Great news! Your <strong>${order.serviceName}</strong> has been completed and your vehicle is looking better than ever.</p>
        
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0; border-left: 4px solid #F57C00;">
          <p style="margin: 0 0 12px 0;"><strong>Order Number:</strong> ${order.orderNumber}</p>
          <p style="margin: 0 0 12px 0;"><strong>Vehicle:</strong> ${order.vehicleInfo}</p>
          <p style="margin: 0 0 12px 0;"><strong>Service:</strong> ${order.serviceName}</p>
          <p style="margin: 0;"><strong>Completed:</strong> ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <p style="margin-bottom: 16px; color: #666;">We'd love to hear about your experience!</p>
          <a href="${order.ratingLink || '#'}" style="display: inline-block; background: #F57C00; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Rate Your Experience ⭐</a>
        </div>
        
        <p style="font-size: 14px; color: #666; line-height: 1.6;">Thank you for choosing AutoSPF+. We look forward to serving you again!</p>
      </div>
      <div style="background: #1a1a1a; color: #888; padding: 20px; text-align: center; font-size: 12px;">
        <p style="margin: 0 0 8px 0;">&copy; 2026 AutoSPF+. Premium Auto Detailing.</p>
        <p style="margin: 0;">This is an automated message. Please do not reply.</p>
      </div>
    </div>
  `;
};

/**
 * Send digital receipt email to customer after POS settlement
 */
export const sendDigitalReceiptEmail = async (customerEmail, receiptData) => {
  try {
    if (!transporter) {
      await initializeEmailService();
    }

    const senderEmail = config.emailFromAddress || config.emailUser;
    const senderName = config.emailFromName || 'AutoSPF+';

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: customerEmail,
      subject: `🧾 Your AutoSPF+ Receipt — ${receiptData.bookingReference || receiptData.orderNumber}`,
      html: generateReceiptTemplate(receiptData),
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Digital receipt email sent:', {
      to: customerEmail,
      orderNumber: receiptData.orderNumber,
      messageId: result.messageId,
    });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('❌ Failed to send receipt email:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * HTML Template for Digital Receipt
 */
const generateReceiptTemplate = (data) => {
  const formatCurrency = (amount) => `₱${(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 20px auto; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.15);">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); color: white; padding: 36px 32px; text-align: center;">
        <h1 style="margin: 0 0 4px 0; font-size: 24px; font-weight: 700; letter-spacing: 1px;">AutoSPF+</h1>
        <p style="margin: 0; color: #FF6B35; font-size: 14px; letter-spacing: 2px; text-transform: uppercase;">Digital Receipt</p>
      </div>

      <!-- Booking Reference -->
      <div style="background: #FF6B35; padding: 16px 32px; text-align: center;">
        <p style="margin: 0; color: white; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Booking Reference</p>
        <p style="margin: 4px 0 0 0; color: white; font-size: 22px; font-weight: bold; letter-spacing: 3px; font-family: monospace;">${data.bookingReference || data.orderNumber || 'N/A'}</p>
      </div>

      <!-- Body -->
      <div style="padding: 32px; background: #fff; color: #333;">
        <p style="font-size: 16px; margin-bottom: 24px;">Hi <strong>${data.customerName || 'Valued Customer'}</strong>,</p>
        <p style="font-size: 14px; line-height: 1.6; color: #555;">Thank you for choosing AutoSPF+. Here's your digital receipt for the service completed on <strong>${dateStr}</strong>.</p>

        <!-- Service Details -->
        <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 24px 0; border-left: 4px solid #FF6B35;">
          <h3 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Service Details</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #888;">Service</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${data.serviceName || 'Premium Detailing'}</td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Vehicle</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${data.vehicleInfo || 'N/A'}</td></tr>
            <tr><td style="padding: 6px 0; color: #888;">Plate No.</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${data.plateNumber || 'N/A'}</td></tr>
            ${data.detailerName ? `<tr><td style="padding: 6px 0; color: #888;">Detailer</td><td style="padding: 6px 0; text-align: right; font-weight: 600;">${data.detailerName}</td></tr>` : ''}
          </table>
        </div>

        <!-- Payment Breakdown -->
        <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 24px 0;">
          <h3 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">Payment Summary</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${data.downPayment ? `<tr><td style="padding: 6px 0; color: #888;">Down Payment</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(data.downPayment)}</td></tr>` : ''}
            ${data.finalPayment ? `<tr><td style="padding: 6px 0; color: #888;">Final Payment</td><td style="padding: 6px 0; text-align: right;">${formatCurrency(data.finalPayment)}</td></tr>` : ''}
            <tr style="border-top: 2px solid #ddd;">
              <td style="padding: 12px 0 6px 0; font-weight: bold; font-size: 16px;">Total Paid</td>
              <td style="padding: 12px 0 6px 0; text-align: right; font-weight: bold; font-size: 16px; color: #FF6B35;">${formatCurrency(data.totalAmount)}</td>
            </tr>
            <tr><td style="padding: 4px 0; color: #888; font-size: 12px;">Payment Method</td><td style="padding: 4px 0; text-align: right; font-size: 12px; color: #888;">${(data.paymentMethod || 'N/A').toUpperCase()}</td></tr>
          </table>
        </div>

        <!-- Loyalty Points -->
        ${data.pointsEarned ? `
        <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%); padding: 20px; border-radius: 12px; margin: 24px 0; color: white; text-align: center;">
          <p style="margin: 0 0 4px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #FF6B35;">Loyalty Points Earned</p>
          <p style="margin: 0; font-size: 28px; font-weight: bold;">+${data.pointsEarned}</p>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #aaa;">Total Points: ${data.totalPoints || 'N/A'} • Tier: ${data.loyaltyTier || 'Bronze'}</p>
        </div>
        ` : ''}

        <p style="font-size: 13px; color: #888; text-align: center; margin-top: 24px;">Questions? Contact us at <a href="mailto:admin@autospf.com" style="color: #FF6B35;">admin@autospf.com</a></p>
      </div>

      <!-- Footer -->
      <div style="background: #1a1a1a; color: #666; padding: 20px; text-align: center; font-size: 11px;">
        <p style="margin: 0 0 4px 0;">&copy; 2026 AutoSPF+. Premium Auto Detailing.</p>
        <p style="margin: 0;">This is an automated receipt. Please keep for your records.</p>
      </div>
    </div>
  `;
};

export default {
  initializeEmailService,
  sendOtpEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBookingNotification,
  sendLowStockAlert,
  sendServiceCompletedEmail,
  sendDigitalReceiptEmail,
};
