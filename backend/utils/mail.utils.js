/**
 * Resend Email Service for AutoSPF+
 * Uses the Resend SDK to send transactional emails.
 */
import { Resend } from 'resend';

const FROM_NAME = process.env.EMAIL_FROM_NAME || 'AutoSPF+';
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || 'verify@autospf.shop'; // verified domain — do NOT use onboarding@resend.dev
const FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || 'support@autospf.shop';

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

function getSupportEmail() {
  return (process.env.SUPPORT_EMAIL || 'support@autospf.shop').trim();
}

/** Email-safe accent strip at top of card (no CSS gradients on outer clients). */
function accentTopRow(kind) {
  if (!kind || kind === 'none') return '';
  if (kind === 'slate') {
    return `<tr><td style="height:3px;line-height:3px;font-size:0;mso-line-height-rule:exactly;background:#475569">&nbsp;</td></tr>`;
  }
  return `<tr>
    <td style="padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="33.33%" style="height:4px;line-height:4px;font-size:0;background:#c2410c">&nbsp;</td>
          <td width="33.34%" style="height:4px;line-height:4px;font-size:0;background:#f59e0b">&nbsp;</td>
          <td width="33.33%" style="height:4px;line-height:4px;font-size:0;background:#fcd34d">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function getClient() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is not set in environment variables.');
    resend = new Resend(apiKey);
  }
  return resend;
}

function normalizeTagValue(value) {
  return String(value || 'transactional')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 256) || 'transactional';
}

function buildIdempotencyKey(kind, id) {
  if (!id) return undefined;
  const safeKind = normalizeTagValue(kind);
  return `autospf_${safeKind}_${String(id).slice(0, 160)}`.slice(0, 256);
}

async function sendEmail({ to, subject, html, text, replyTo = DEFAULT_REPLY_TO, tags = [], idempotencyKey }) {
  try {
    const client = getClient();
    const payload = { from: FROM, to, subject, html, replyTo };
    if (text) payload.text = text;
    if (tags.length) payload.tags = tags;

    const sendOptions = idempotencyKey ? { idempotencyKey } : undefined;
    const { data, error } = await client.emails.send(payload, sendOptions);

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

function baseWrapper(
  content,
  { preheader = '', accent = 'brand', showFooterLinks = true, confidentialityRibbon = false } = {}
) {
  const logoSrc = escapeHtml(getEmailLogoUrl());
  const pre = preheader ? escapeHtml(preheader) : '';
  const appUrl = escapeHtml(getAppPublicUrl());
  const supportEmail = escapeHtml(getSupportEmail());
  const supportMailto = escapeHtml(`mailto:${getSupportEmail()}`);
  const bar = accentTopRow(accent);

  const footerLinks = showFooterLinks
    ? `<p style="margin:16px 0 0;font-size:11px;line-height:1.65;color:#94a3b8">
        <a href="${supportMailto}" style="color:#64748b;text-decoration:none;border-bottom:1px solid #cbd5e1;padding-bottom:1px">Customer care</a>
        <span style="color:#cbd5e1;padding:0 8px;font-weight:300">|</span>
        <a href="${appUrl}" style="color:#64748b;text-decoration:none;border-bottom:1px solid #cbd5e1;padding-bottom:1px">Official website</a>
      </p>`
    : '';

  const ribbon = confidentialityRibbon
    ? `<p style="margin:12px 0 0;font-size:10px;line-height:1.6;color:#cbd5e1;letter-spacing:0.12em">
        CONFIDENTIAL&nbsp;&nbsp;|&nbsp;&nbsp;CONFIDENTIEL&nbsp;&nbsp;|&nbsp;&nbsp;CONFIDENCIAL
      </p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <title>AutoSPF+</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:'Instrument Sans',ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;color:#0f172a">
  ${pre ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f3f4f6;opacity:0">${pre}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6">
    <tr>
      <td align="center" style="padding:48px 20px 56px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px">
          <tr>
            <td align="center" style="padding-bottom:36px">
              <a href="${appUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">
                <img src="${logoSrc}" width="200" alt="AutoSPF+" border="0" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;height:auto;max-height:54px;width:auto;max-width:220px" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-radius:20px;border:1px solid rgba(15,23,42,0.06);box-shadow:0 4px 6px -1px rgba(15,23,42,0.04),0 22px 44px -16px rgba(15,23,42,0.14);overflow:hidden;padding:0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${bar}
                <tr>
                  <td style="padding:0">
                    ${content}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-top:32px;padding-left:16px;padding-right:16px">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#64748b;font-weight:500;letter-spacing:0.02em">&copy; ${new Date().getFullYear()} AutoSPF+</p>
              <p style="margin:0;font-size:11px;line-height:1.65;color:#94a3b8">AutoSPF+ account security notice</p>
              ${footerLinks}
              ${ribbon}
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

function otpTemplate(otp, { purpose = 'verification' } = {}) {
  const digits = String(otp).split('');
  const isLogin = purpose === 'login';
  const heading = isLogin ? 'Your sign-in code' : 'Your verification code';
  const intro = isLogin
    ? 'Enter this single-use code to finish signing in. It was issued only for your account.'
    : 'Enter this single-use code to confirm your email and continue. It was issued only for your account.';
  const digitBoxes = digits
    .map(
      (d) => `
    <td style="padding:5px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate">
        <tr>
          <td style="min-width:42px;height:58px;background:#ffffff;border:1px solid #e6c875;border-radius:14px;text-align:center;vertical-align:middle;font-size:26px;font-weight:600;color:#0c1222;font-family:ui-monospace,'Cascadia Mono','Segoe UI Mono',Consolas,monospace;letter-spacing:-0.02em;box-shadow:0 1px 3px rgba(15,23,42,0.05)">${d}</td>
        </tr>
      </table>
    </td>`
    )
    .join('');

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:48px 40px 32px;text-align:center">
          <p style="margin:0 0 12px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;color:#94a3b8">Account security</p>
          <h1 style="margin:0;font-size:28px;font-weight:600;letter-spacing:-0.035em;color:#0a0f1a;line-height:1.2">${heading}</h1>
          <p style="margin:18px auto 0;font-size:16px;line-height:1.65;color:#64748b;max-width:400px;font-weight:400">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0">
            <tr>
              <td style="width:40px;height:2px;line-height:2px;font-size:0;background:#f59e0b;border-radius:2px">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 40px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 32px">
            <tr>
              ${digitBoxes}
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#fafaf9;border-radius:14px;border:1px solid #e7e5e4;border-left:4px solid #d97706;padding:22px 26px">
                <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1c1917;letter-spacing:0.01em">Valid for 10 minutes</p>
                <p style="margin:0;font-size:13px;line-height:1.65;color:#78716c">For your security, never share this code. If you did not request verification, you may disregard this message—your account will remain unchanged.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, {
    preheader: `Your AutoSPF+ code: ${otp}. Valid 10 minutes.`,
    accent: 'brand',
    confidentialityRibbon: true,
  });
}

function otpPlainText(otp, { purpose = 'verification' } = {}) {
  const label = purpose === 'login' ? 'sign-in code' : 'verification code';
  return `AutoSPF+ ${label}\n\n${otp}\n\nThis code is valid for 10 minutes. If you did not request it, ignore this email.\n\n${getAppPublicUrl()}`;
}

// ─── Welcome Template ─────────────────────────────────────────────────────────

function welcomeTemplate(name) {
  const safeName = escapeHtml(name);
  const appUrl = escapeHtml(getAppPublicUrl());
  const supportAddr = escapeHtml(getSupportEmail());
  const supportMailto = escapeHtml(`mailto:${getSupportEmail()}`);
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
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Questions? <a href="${supportMailto}" style="color:#d97706;text-decoration:none;font-weight:600">${supportAddr}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, { preheader: `Welcome to AutoSPF+, ${name}.`, accent: 'brand' });
}

// ─── Password Reset Template ──────────────────────────────────────────────────

function passwordResetTemplate(otp) {
  const supportAddr = escapeHtml(getSupportEmail());
  const supportMailto = escapeHtml(`mailto:${getSupportEmail()}`);
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
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Need help? <a href="${supportMailto}" style="color:#d97706;text-decoration:none;font-weight:600">${supportAddr}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, {
    preheader: `AutoSPF+ password reset code: ${otp}. Valid 10 minutes.`,
    accent: 'slate',
  });
}

function passwordResetPlainText(otp) {
  return `AutoSPF+ — password reset\n\n${otp}\n\nValid for 10 minutes. If you did not request this, ignore this email.\n\n${getAppPublicUrl()}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const sendOtpEmail = async (email, otp, { purpose = 'verification', otpRecordId } = {}) => {
  console.log(`📨 [Resend] Sending OTP to ${email}...`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`   🔑 OTP Code: ${otp}`);
  }
  const safePurpose = purpose === 'login' ? 'login' : 'verification';
  return sendEmail({
    to: email,
    subject: safePurpose === 'login' ? 'Your AutoSPF+ sign-in code' : 'Your AutoSPF+ verification code',
    html: otpTemplate(otp, { purpose: safePurpose }),
    text: otpPlainText(otp, { purpose: safePurpose }),
    tags: [
      { name: 'type', value: 'otp' },
      { name: 'purpose', value: safePurpose },
    ],
    idempotencyKey: buildIdempotencyKey(`otp_${safePurpose}`, otpRecordId),
  });
};

export const sendWelcomeEmail = async (email, name) => {
  console.log(`📨 [Resend] Sending welcome email to ${email}...`);
  return sendEmail({
    to: email,
    subject: 'Welcome to AutoSPF+',
    html: welcomeTemplate(name),
    tags: [{ name: 'type', value: 'welcome' }],
  });
};

export const sendPasswordResetEmail = async (email, otp, { otpRecordId } = {}) => {
  console.log(`📨 [Resend] Sending password reset OTP to ${email}...`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`   🔑 OTP Code: ${otp}`);
  }
  return sendEmail({
    to: email,
    subject: 'Your AutoSPF+ password reset code',
    html: passwordResetTemplate(otp),
    text: passwordResetPlainText(otp),
    tags: [
      { name: 'type', value: 'otp' },
      { name: 'purpose', value: 'password_reset' },
    ],
    idempotencyKey: buildIdempotencyKey('otp_password_reset', otpRecordId),
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
