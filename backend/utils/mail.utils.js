/**
 * Resend Email Service for AutoSPF+
 * Uses the Resend SDK to send transactional emails.
 */
import { Resend } from 'resend';

const FROM_NAME  = process.env.EMAIL_FROM_NAME    || 'AutoSPF+';
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'onboarding@resend.dev';
const FROM       = `"${FROM_NAME}" <${FROM_EMAIL}>`;

let resend = null;

function getClient() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not set in environment variables.');
    resend = new Resend(apiKey);
  }
  return resend;
}

async function sendEmail({ to, subject, html }) {
  try {
    const client = getClient();
    const { data, error } = await client.emails.send({ from: FROM, to, subject, html });

    if (error) {
      console.error('❌ [Resend] Send error:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ [Resend] Email sent → ${to} | id: ${data?.id}`);
    return { success: true, messageId: data?.id };
  } catch (err) {
    console.error('❌ [Resend] Unexpected error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Shared base wrapper ──────────────────────────────────────────────────────

function baseWrapper(content) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>AutoSPF+</title>
</head>
<body style="margin:0;padding:0;background-color:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0d0d0d;min-height:100vh">
    <tr>
      <td align="center" style="padding:40px 16px 40px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

          <!-- HEADER LOGO ROW -->
          <tr>
            <td align="center" style="padding-bottom:28px">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:10px 24px;background:linear-gradient(135deg,#1a1a1a,#111);border:1px solid #2a2a2a;border-radius:40px">
                    <span style="font-size:22px;font-weight:800;letter-spacing:2px;color:#f59e0b;font-family:Arial,sans-serif">AUTO</span><span style="font-size:22px;font-weight:800;letter-spacing:2px;color:#ffffff;font-family:Arial,sans-serif">SPF+</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- MAIN CARD -->
          <tr>
            <td style="background:#141414;border:1px solid #222;border-radius:24px;overflow:hidden">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding-top:28px">
              <p style="margin:0 0 8px;font-size:12px;color:#444">© ${new Date().getFullYear()} AutoSPF+ · Premium Automotive Care</p>
              <p style="margin:0;font-size:11px;color:#333">This email was sent from an automated system. Please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── OTP Template ─────────────────────────────────────────────────────────────

function otpTemplate(otp) {
  const digits = String(otp).split('');
  const digitBoxes = digits.map(d =>
    `<td style="padding:0 4px">
       <div style="width:48px;height:60px;background:#1a1a1a;border:2px solid #f59e0b;border-radius:12px;text-align:center;line-height:60px;font-size:28px;font-weight:800;color:#f59e0b;font-family:'Courier New',monospace">${d}</div>
     </td>`
  ).join('');

  const content = `
    <!-- GRADIENT HEADER -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:linear-gradient(135deg,#1a0f00 0%,#2d1800 50%,#1a0f00 100%);padding:40px 40px 32px;text-align:center;border-bottom:1px solid #2a2a2a">
          <div style="width:72px;height:72px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;margin:0 auto 20px;display:flex;align-items:center;justify-content:center">
            <span style="font-size:32px;line-height:72px;display:block">🔐</span>
          </div>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Verify Your Email</h1>
          <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.5">Enter the code below to confirm your identity</p>
        </td>
      </tr>
    </table>

    <!-- BODY -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:40px 40px 32px">

          <!-- OTP DIGITS -->
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px">
            <tr>
              ${digitBoxes}
            </tr>
          </table>

          <!-- INFO BOX -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px">
            <tr>
              <td style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2);border-radius:12px;padding:16px 20px;text-align:center">
                <p style="margin:0 0 4px;font-size:14px;color:#d97706;font-weight:600">⏱ Expires in 10 minutes</p>
                <p style="margin:0;font-size:13px;color:#6b7280">Do not share this code with anyone</p>
              </td>
            </tr>
          </table>

          <!-- DIVIDER -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-top:1px solid #222;padding-top:20px;text-align:center">
                <p style="margin:0;font-size:12px;color:#4b5563">Didn't request this? You can safely ignore this email.</p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content);
}

// ─── Welcome Template ─────────────────────────────────────────────────────────

function welcomeTemplate(name) {
  const features = [
    { icon: '🛡️', title: 'PPF & Paint Protection', desc: 'Premium ceramic coating & paint protection film' },
    { icon: '📅', title: 'Easy Online Booking', desc: 'Schedule services anytime, from any device' },
    { icon: '🔍', title: 'Real-Time Tracking', desc: 'Live updates on your vehicle service status' },
  ];

  const featureRows = features.map(f => `
    <tr>
      <td style="padding-bottom:12px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:12px;padding:16px 18px">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="width:44px;vertical-align:middle">
                    <div style="width:40px;height:40px;background:rgba(245,158,11,0.12);border-radius:10px;text-align:center;line-height:40px;font-size:20px">${f.icon}</div>
                  </td>
                  <td style="padding-left:14px;vertical-align:middle">
                    <p style="margin:0 0 3px;font-size:14px;font-weight:700;color:#fff">${f.title}</p>
                    <p style="margin:0;font-size:12px;color:#6b7280">${f.desc}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const content = `
    <!-- GRADIENT HEADER -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:linear-gradient(135deg,#1a0f00 0%,#2d1800 50%,#1a0f00 100%);padding:40px 40px 32px;text-align:center;border-bottom:1px solid #2a2a2a">
          <div style="font-size:52px;margin-bottom:16px">🚗</div>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Welcome, ${name}!</h1>
          <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.5">Your AutoSPF+ account is ready to go.</p>
        </td>
      </tr>
    </table>

    <!-- BODY -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:36px 40px 32px">

          <p style="margin:0 0 24px;font-size:15px;color:#9ca3af;line-height:1.6">Here's what you get with your account:</p>

          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            ${featureRows}
          </table>

          <!-- CTA BUTTON -->
          <table cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0">
            <tr>
              <td style="background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px">
                <a href="http://localhost:5173" style="display:block;padding:15px 40px;font-size:15px;font-weight:700;color:#000;text-decoration:none;letter-spacing:0.3px">Book Your First Service →</a>
              </td>
            </tr>
          </table>

          <!-- DIVIDER -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px">
            <tr>
              <td style="border-top:1px solid #222;padding-top:20px;text-align:center">
                <p style="margin:0;font-size:12px;color:#4b5563">Questions? Email us at <a href="mailto:support@autospf.com" style="color:#f59e0b;text-decoration:none">support@autospf.com</a></p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content);
}

// ─── Password Reset Template ──────────────────────────────────────────────────

function passwordResetTemplate(otp) {
  const digits = String(otp).split('');
  const digitBoxes = digits.map(d =>
    `<td style="padding:0 4px">
       <div style="width:48px;height:60px;background:#1a0000;border:2px solid #ef4444;border-radius:12px;text-align:center;line-height:60px;font-size:28px;font-weight:800;color:#ef4444;font-family:'Courier New',monospace">${d}</div>
     </td>`
  ).join('');

  const content = `
    <!-- GRADIENT HEADER -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="background:linear-gradient(135deg,#1a0000 0%,#2d0000 50%,#1a0000 100%);padding:40px 40px 32px;text-align:center;border-bottom:1px solid #2a2a2a">
          <div style="width:72px;height:72px;background:linear-gradient(135deg,#ef4444,#b91c1c);border-radius:50%;margin:0 auto 20px">
            <span style="font-size:32px;line-height:72px;display:block">🔑</span>
          </div>
          <h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px">Password Reset</h1>
          <p style="margin:0;font-size:15px;color:#9ca3af;line-height:1.5">Use the code below to reset your password</p>
        </td>
      </tr>
    </table>

    <!-- BODY -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:40px 40px 32px">

          <!-- OTP DIGITS -->
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 32px">
            <tr>
              ${digitBoxes}
            </tr>
          </table>

          <!-- INFO BOX -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px">
            <tr>
              <td style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px 20px;text-align:center">
                <p style="margin:0 0 4px;font-size:14px;color:#ef4444;font-weight:600">⏱ Expires in 10 minutes</p>
                <p style="margin:0;font-size:13px;color:#6b7280">Do not share this code with anyone</p>
              </td>
            </tr>
          </table>

          <!-- SECURITY ALERT -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px">
            <tr>
              <td style="background:#1a0000;border:1px solid rgba(239,68,68,0.3);border-left:4px solid #ef4444;border-radius:8px;padding:14px 16px">
                <p style="margin:0;font-size:13px;color:#fca5a5;font-weight:600">⚠️ Security Notice</p>
                <p style="margin:4px 0 0;font-size:12px;color:#9ca3af">If you did not request a password reset, please contact our support team immediately.</p>
              </td>
            </tr>
          </table>

          <!-- DIVIDER -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-top:1px solid #222;padding-top:20px;text-align:center">
                <p style="margin:0;font-size:12px;color:#4b5563">Contact support: <a href="mailto:support@autospf.com" style="color:#f59e0b;text-decoration:none">support@autospf.com</a></p>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const sendOtpEmail = async (email, otp) => {
  console.log(`📨 [Resend] Sending OTP to ${email}...`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`   🔑 OTP Code: ${otp}`);
  }
  return sendEmail({
    to: email,
    subject: '🔐 Your AutoSPF+ Verification Code',
    html: otpTemplate(otp),
  });
};

export const sendWelcomeEmail = async (email, name) => {
  console.log(`📨 [Resend] Sending welcome email to ${email}...`);
  return sendEmail({
    to: email,
    subject: '🚗 Welcome to AutoSPF+!',
    html: welcomeTemplate(name),
  });
};

export const sendPasswordResetEmail = async (email, otp) => {
  console.log(`📨 [Resend] Sending password reset OTP to ${email}...`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`   🔑 OTP Code: ${otp}`);
  }
  return sendEmail({
    to: email,
    subject: '🔑 AutoSPF+ Password Reset Code',
    html: passwordResetTemplate(otp),
  });
};

/** Kept for backward compatibility — Resend needs no SMTP initialization */
export const initializeMailer = async () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ [Resend] RESEND_API_KEY not set — emails will fail.');
    return;
  }
  resend = new Resend(apiKey);
  console.log('✅ [Resend] Mailer initialized');
  console.log(`   From: ${FROM}`);
};

export default { initializeMailer, sendOtpEmail, sendWelcomeEmail, sendPasswordResetEmail };
