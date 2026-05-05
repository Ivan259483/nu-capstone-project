/**
 * Resend Email Service for AutoSPF+
 * Uses the Resend SDK to send transactional emails.
 */
import { Resend } from 'resend';

const FROM_NAME = process.env.EMAIL_FROM_NAME || 'AutoSPF+';
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'noreply@autospf.shop'; // verified domain — do NOT use onboarding@resend.dev
const FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;

let resend = null;

/** Public site URL for links in emails (never localhost in production if unset). */
function getAppPublicUrl() {
  const explicit = process.env.CLIENT_URL || process.env.FRONTEND_URL || process.env.PUBLIC_APP_URL;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const cors = process.env.CORS_ORIGIN;
  if (cors && typeof cors === 'string' && cors.trim() && cors.trim() !== '*') {
    const first = cors.split(',')[0].trim();
    if (first) return first.replace(/\/$/, '');
  }
  return 'https://autospf.shop';
}

/** Absolute URL for logo in email clients (HTTPS recommended). */
function getEmailLogoUrl() {
  const u = process.env.EMAIL_LOGO_URL;
  if (u && /^https?:\/\//i.test(String(u).trim())) return String(u).trim();
  return `${getAppPublicUrl()}/autospf-logo.jpg`;
}

function getClient() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not set in environment variables.');
    resend = new Resend(apiKey);
  }
  return resend;
}

async function sendEmail({ to, subject, html, text }) {
  try {
    const client = getClient();
    const payload = { from: FROM, to, subject, html };
    if (text) payload.text = text;
    const { data, error } = await client.emails.send(payload);

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

// ─── Shared base wrapper (premium, international-friendly) ─────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function baseWrapper(content, { preheader = '' } = {}) {
  const logoSrc = escapeHtml(getEmailLogoUrl());
  const pre = preheader ? escapeHtml(preheader) : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>AutoSPF+</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,'Helvetica Neue',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#0f172a">
  ${pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f1f5f9;opacity:0">${pre}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9">
    <tr>
      <td align="center" style="padding:40px 16px 48px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
          <tr>
            <td align="center" style="padding-bottom:28px">
              <a href="${escapeHtml(getAppPublicUrl())}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
                <img src="${logoSrc}" width="200" alt="AutoSPF+" border="0" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;height:auto;max-height:52px;width:auto;max-width:200px" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;box-shadow:0 12px 40px rgba(15,23,42,0.08);overflow:hidden">
              ${content}
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:28px;padding-left:12px;padding-right:12px">
              <p style="margin:0 0 8px;font-size:12px;line-height:1.55;color:#64748b">&copy; ${new Date().getFullYear()} AutoSPF+</p>
              <p style="margin:0;font-size:11px;line-height:1.55;color:#94a3b8">Premium automotive care &middot; Automated message &middot; Please do not reply</p>
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
  const digitBoxes = digits
    .map(
      (d) => `
    <td style="padding:4px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
        <tr>
          <td style="min-width:38px;height:50px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;font-weight:700;color:#0f172a;font-family:Consolas,'Courier New',ui-monospace,monospace;letter-spacing:0">${d}</td>
        </tr>
      </table>
    </td>`
    )
    .join('');

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #f1f5f9">
          <p style="margin:0 0 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#64748b">Security</p>
          <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;line-height:1.25">Your verification code</h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#64748b;max-width:400px;margin-left:auto;margin-right:auto">Use this one-time code to confirm your email address and continue with AutoSPF+.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 28px">
            <tr>
              ${digitBoxes}
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px">
            <tr>
              <td style="background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;text-align:center">
                <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#0f172a">Valid for 10 minutes</p>
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Never share this code. If you did not request it, you can safely ignore this message.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, {
    preheader: `Your AutoSPF+ code: ${otp}. Valid 10 minutes.`,
  });
}

function otpPlainText(otp) {
  return `AutoSPF+ — verification code\n\n${otp}\n\nThis code is valid for 10 minutes. If you did not request it, ignore this email.\n\n${getAppPublicUrl()}`;
}

// ─── Welcome Template ─────────────────────────────────────────────────────────

function welcomeTemplate(name) {
  const safeName = escapeHtml(name);
  const appUrl = escapeHtml(getAppPublicUrl());
  const features = [
    { title: 'PPF & paint protection', desc: 'Ceramic coating and film options for lasting finish.' },
    { title: 'Online booking', desc: 'Schedule services when it suits you, from any device.' },
    { title: 'Live status', desc: 'Follow your vehicle through service milestones in real time.' },
  ];

  const featureRows = features
    .map(
      (f) => `
    <tr>
      <td style="padding-bottom:12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px">
          <tr>
            <td style="padding:16px 18px">
              <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#0f172a">${escapeHtml(f.title)}</p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b">${escapeHtml(f.desc)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('');

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:36px 32px 24px;text-align:center;border-bottom:1px solid #f1f5f9">
          <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;line-height:1.25">Welcome, ${safeName}</h1>
          <p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#64748b">Your AutoSPF+ account is ready.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 32px">
          <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#64748b">Here is what you can do next:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${featureRows}
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 0">
            <tr>
              <td style="border-radius:12px;background:linear-gradient(135deg,#f59e0b,#d97706)">
                <a href="${appUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0f172a;text-decoration:none;border-radius:12px">Book a service</a>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px">
            <tr>
              <td style="border-top:1px solid #f1f5f9;padding-top:20px;text-align:center">
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Questions? <a href="mailto:support@autospf.com" style="color:#d97706;text-decoration:none;font-weight:600">support@autospf.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, { preheader: `Welcome to AutoSPF+, ${name}.` });
}

// ─── Password Reset Template ──────────────────────────────────────────────────

function passwordResetTemplate(otp) {
  const digits = String(otp).split('');
  const digitBoxes = digits
    .map(
      (d) => `
    <td style="padding:4px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
        <tr>
          <td style="min-width:38px;height:50px;background:#fef2f2;border:1px solid #fecaca;border-radius:12px;text-align:center;vertical-align:middle;font-size:22px;font-weight:700;color:#991b1b;font-family:Consolas,'Courier New',ui-monospace,monospace">${d}</td>
        </tr>
      </table>
    </td>`
    )
    .join('');

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:36px 32px 28px;text-align:center;border-bottom:1px solid #f1f5f9">
          <p style="margin:0 0 10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.16em;color:#64748b">Account</p>
          <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em;color:#0f172a;line-height:1.25">Password reset code</h1>
          <p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:#64748b;max-width:400px;margin-left:auto;margin-right:auto">Use this code to set a new password. If you did not ask for a reset, ignore this email.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px 28px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px">
            <tr>
              ${digitBoxes}
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px">
            <tr>
              <td style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;padding:18px 20px;text-align:center">
                <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#991b1b">Valid for 10 minutes</p>
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Do not share this code with anyone.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:10px;padding:14px 16px">
                <p style="margin:0;font-size:13px;font-weight:600;color:#92400e">Did not request a reset?</p>
                <p style="margin:6px 0 0;font-size:12px;line-height:1.5;color:#78716c">Someone may have entered your email by mistake. Your password stays unchanged until you complete the reset.</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px">
            <tr>
              <td style="border-top:1px solid #f1f5f9;padding-top:18px;text-align:center">
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Need help? <a href="mailto:support@autospf.com" style="color:#d97706;text-decoration:none;font-weight:600">support@autospf.com</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, {
    preheader: `AutoSPF+ password reset code: ${otp}. Valid 10 minutes.`,
  });
}

function passwordResetPlainText(otp) {
  return `AutoSPF+ — password reset\n\n${otp}\n\nValid for 10 minutes. If you did not request this, ignore this email.\n\n${getAppPublicUrl()}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const sendOtpEmail = async (email, otp) => {
  console.log(`📨 [Resend] Sending OTP to ${email}...`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`   🔑 OTP Code: ${otp}`);
  }
  return sendEmail({
    to: email,
    subject: 'Your AutoSPF+ verification code',
    html: otpTemplate(otp),
    text: otpPlainText(otp),
  });
};

export const sendWelcomeEmail = async (email, name) => {
  console.log(`📨 [Resend] Sending welcome email to ${email}...`);
  return sendEmail({
    to: email,
    subject: 'Welcome to AutoSPF+',
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
    subject: 'Your AutoSPF+ password reset code',
    html: passwordResetTemplate(otp),
    text: passwordResetPlainText(otp),
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
