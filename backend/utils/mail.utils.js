import nodemailer from 'nodemailer';

/**
 * Brevo (Sendinblue) SMTP Mailer Utility
 * Strict configuration for reliable email delivery
 */

let transporter = null;

/**
 * Initialize Brevo SMTP transporter with strict configuration
 */
export const initializeMailer = async () => {
  try {
    // Validate required environment variables
    const brevoUser = process.env.BREVO_SMTP_USER;
    const brevoPassword = process.env.BREVO_SMTP_PASSWORD;
    const brevoApiKey = process.env.BREVO_API_KEY;

    console.log('🔐 Brevo SMTP Configuration Check:');
    console.log('  ✓ BREVO_SMTP_USER:', !!brevoUser ? 'Loaded' : '❌ MISSING');
    console.log('  ✓ BREVO_SMTP_PASSWORD:', !!brevoPassword ? 'Loaded' : '❌ MISSING');
    console.log('  ✓ BREVO_API_KEY:', !!brevoApiKey ? 'Loaded' : '❌ MISSING');

    if (!brevoUser || !brevoPassword) {
      throw new Error('BREVO_SMTP_USER and BREVO_SMTP_PASSWORD are required');
    }

    // Create transporter with STRICT Brevo settings
    transporter = nodemailer.createTransport({
      host: 'smtp-relay.brevo.com',  // Brevo SMTP relay (updated from sendinblue.com)
      port: 587,                          // Strict port (TLS)
      secure: false,                      // IMPORTANT: false for port 587 (TLS, not SSL)
      auth: {
        user: brevoUser,                  // Your Brevo SMTP login email
        pass: brevoPassword,              // Your Brevo SMTP password
      },
      logger: true,                       // Log SMTP transactions
      debug: true,                        // Show detailed SMTP conversation
      connectionTimeout: 5000,            // 5 seconds
      socketTimeout: 5000,                // 5 seconds
    });

    // Verify connection
    try {
      const verified = await transporter.verify();
      if (verified) {
        console.log('✅ Brevo SMTP transporter verified successfully');
        console.log('   Host: smtp-relay.brevo.com:587 (TLS)');
        console.log('   User:', brevoUser);
      }
    } catch (verifyError) {
      console.error('⚠️ SMTP verification failed:');
      console.error('   Error:', verifyError.message);
      console.error('   Code:', verifyError.code);
      
      if (verifyError.responseCode) {
        console.error('   SMTP Code:', verifyError.responseCode);
      }
      
      console.error('   This could mean:');
      console.error('   - Invalid SMTP credentials');
      console.error('   - Brevo account not verified');
      console.error('   - SMTP user account disabled');
      
      throw verifyError;
    }
  } catch (error) {
    console.error('❌ Mailer initialization failed:', error.message);
    throw error;
  }
};

/**
 * Send email via Brevo SMTP
 * @param {object} mailOptions - Mail options object
 * @param {string} mailOptions.to - Recipient email
 * @param {string} mailOptions.subject - Email subject
 * @param {string} mailOptions.html - HTML content
 * @param {string} mailOptions.text - Text content
 * @returns {Promise} Nodemailer response
 */
export const sendEmail = async (mailOptions) => {
  try {
    if (!transporter) {
      await initializeMailer();
    }

    // Set default from address if not provided
    const from = mailOptions.from || `"${process.env.EMAIL_FROM_NAME || 'AutoSPF+'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.BREVO_SMTP_USER}>`;

    const completeMailOptions = {
      from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
    };

    console.log('📤 [SMTP] Sending email:');
    console.log('   From:', completeMailOptions.from);
    console.log('   To:', completeMailOptions.to);
    console.log('   Subject:', completeMailOptions.subject);

    const result = await transporter.sendMail(completeMailOptions);

    console.log('✅ [SMTP] Email sent successfully');
    console.log('   MessageID:', result.messageId);
    console.log('   Response:', result.response);

    return {
      success: true,
      messageId: result.messageId,
      response: result.response,
    };
  } catch (error) {
    // DETAILED ERROR LOGGING - Log entire error object
    console.error('❌ [SMTP] Failed to send email:');
    console.error('   To:', mailOptions.to);
    console.error('   Error Message:', error.message);
    console.error('   Error Code:', error.code);
    console.error('   Error Command:', error.command);
    
    // SMTP specific errors
    if (error.responseCode) {
      console.error('   SMTP Response Code:', error.responseCode);
    }
    
    if (error.response) {
      console.error('   SMTP Server Response:', error.response);
    }
    
    // Full error object for debugging
    console.error('   Full Error Object:', JSON.stringify(error, null, 2));

    return {
      success: false,
      error: error.message,
      code: error.code,
      responseCode: error.responseCode,
      response: error.response,
    };
  }
};

/**
 * Send OTP email
 * @param {string} email - Recipient email address
 * @param {string} otp - 6-digit OTP code
 * @returns {Promise} Email result object
 */
export const sendOtpEmail = async (email, otp) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 500px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
          .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
          .otp-code { 
            font-size: 32px; 
            font-weight: bold; 
            color: #667eea; 
            letter-spacing: 4px; 
            text-align: center; 
            margin: 20px 0; 
            font-family: monospace;
          }
          .footer { color: #6b7280; font-size: 12px; text-align: center; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Your OTP Code</h1>
          </div>
          <div class="content">
            <p>Hi there,</p>
            <p>You requested an OTP code for AutoSPF+. Use the code below to verify your account:</p>
            <div class="otp-code">${otp}</div>
            <p style="color: #6b7280; font-size: 14px;">This code expires in 10 minutes. Do not share this code with anyone.</p>
            <p>If you didn't request this, please ignore this email.</p>
            <div class="footer">
              <p>© 2026 AutoSPF+. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const textContent = `Your OTP code for AutoSPF+ is: ${otp}\nThis code expires in 10 minutes.\nDo not share this code with anyone.`;

  return sendEmail({
    to: email,
    subject: 'Your OTP Code for AutoSPF+ - Expires in 10 Minutes',
    html: htmlContent,
    text: textContent,
  });
};

/**
 * Send verification email
 */
export const sendVerificationEmail = async (email, verificationLink) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
          .container { max-width: 500px; margin: 0 auto; padding: 20px; }
          .button { 
            background: #667eea; 
            color: white; 
            padding: 12px 24px; 
            border-radius: 6px; 
            text-decoration: none; 
            display: inline-block;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Verify Your Email</h2>
          <p>Please click the button below to verify your email address:</p>
          <a href="${verificationLink}" class="button">Verify Email</a>
          <p>Or copy this link: ${verificationLink}</p>
        </div>
      </body>
    </html>
  `;

  return sendEmail({
    to: email,
    subject: 'Verify Your Email for AutoSPF+',
    html: htmlContent,
    text: `Click here to verify: ${verificationLink}`,
  });
};

export default {
  initializeMailer,
  sendEmail,
  sendOtpEmail,
  sendVerificationEmail,
};
