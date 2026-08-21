/**
 * Transactional email service for AutoSPF+.
 * Supports Resend plus configured Gmail/SMTP transports.
 */
import { Resend } from 'resend';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import { config } from '../config/environment.js';

const FROM_NAME = process.env.EMAIL_FROM_NAME || 'AutoSPF+';
const FROM_EMAIL = (
  String(config.emailProvider || '').toLowerCase() === 'resend'
    ? process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS
    : process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER
) || 'verify@autospf.shop';
const FROM = `"${FROM_NAME}" <${FROM_EMAIL}>`;
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || 'support@autospf.shop';

let resend = null;
let smtpTransporter = null;
let mailerInitializationPromise = null;

const EMAIL_PROVIDER = String(config.emailProvider || 'resend').trim().toLowerCase();
const EMAIL_SEND_TIMEOUT_MS = config.emailSendTimeoutMs;
const EMAIL_RETRY_DELAY_MS = config.emailRetryDelayMs;
const MAX_EMAIL_RETRIES = 1;
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ESOCKET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EAI_AGAIN',
  'ENOTFOUND',
]);
const TRANSIENT_HTTP_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_SMTP_RESPONSE_CODES = new Set([421, 450, 451, 452]);
const SMTP_AUTH_RESPONSE_CODES = new Set([530, 534, 535, 538]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function maskRecipient(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const [local = '', domain = ''] = normalized.split('@');
  if (!local || !domain) return '[invalid-email]';
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local.length > 2 ? local.at(-1) : ''}@${domain}`;
}

function emailLog(event, metadata = {}, level = 'info') {
  const entry = {
    event,
    provider: EMAIL_PROVIDER,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  const method = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  method('[EMAIL_DELIVERY]', JSON.stringify(entry));
}

function numericErrorStatus(error) {
  const raw = error?.statusCode ?? error?.status ?? error?.responseCode;
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Classify whether one failed provider call is both transient and safe to retry.
 * SMTP DATA-phase failures have an ambiguous delivery outcome, so they are never
 * retried. Resend calls are idempotent when an idempotency key is supplied.
 */
export function classifyEmailDeliveryError(error, { provider = EMAIL_PROVIDER } = {}) {
  const statusCode = numericErrorStatus(error);
  const code = String(error?.code || error?.name || '').toUpperCase();
  const command = String(error?.command || '').toUpperCase();
  const message = String(error?.message || error || '').toLowerCase();
  const authFailure =
    ['EAUTH', 'AUTHENTICATION_ERROR', 'MISSING_API_KEY'].includes(code)
    || [401, 403].includes(statusCode)
    || SMTP_AUTH_RESPONSE_CODES.has(statusCode)
    || /invalid (api )?key|authentication failed|invalid credentials|bad credentials/.test(message);
  const transientSmtpFailure = provider !== 'resend' && TRANSIENT_SMTP_RESPONSE_CODES.has(statusCode);
  const validationFailure =
    (['EENVELOPE', 'VALIDATION_ERROR'].includes(code) && !transientSmtpFailure)
    || [400, 404, 409, 422].includes(statusCode);
  const networkFailure =
    TRANSIENT_NETWORK_CODES.has(code)
    || ['ABORTERROR', 'TIMEOUTERROR'].includes(code)
    || /timed?\s*out|socket hang up|network|unable to fetch data|could not be resolved/.test(message);
  const transientProviderFailure = TRANSIENT_HTTP_STATUS_CODES.has(statusCode) || transientSmtpFailure;
  const ambiguousSmtpDelivery = provider !== 'resend' && ['DATA', 'DOT'].includes(command);
  const transient = !authFailure && !validationFailure && (networkFailure || transientProviderFailure);

  return {
    statusCode,
    code: code || null,
    command: command || null,
    authFailure,
    validationFailure,
    transient,
    retryable: transient && !ambiguousSmtpDelivery,
    ambiguousDelivery: ambiguousSmtpDelivery,
  };
}

function createSmtpTransporter() {
  if (!config.emailUser || !config.emailPassword) {
    const error = new Error(`${EMAIL_PROVIDER.toUpperCase()} credentials are not configured.`);
    error.code = 'EAUTH';
    throw error;
  }

  const sharedOptions = {
    auth: { user: config.emailUser, pass: config.emailPassword },
    connectionTimeout: config.smtpConnectionTimeoutMs,
    greetingTimeout: config.smtpGreetingTimeoutMs,
    socketTimeout: config.smtpSocketTimeoutMs,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  };

  if (EMAIL_PROVIDER === 'gmail') {
    return nodemailer.createTransport({ service: 'gmail', ...sharedOptions });
  }

  return nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort),
    secure: String(config.smtpSecure) === 'true',
    ...sharedOptions,
  });
}

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

function smtpMessageId(idempotencyKey) {
  if (!idempotencyKey) return undefined;
  const domain = String(FROM_EMAIL).split('@')[1] || 'autospf.shop';
  const digest = crypto.createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32);
  return `<${digest}@${domain}>`;
}

async function sendEmail({
  to,
  subject,
  html,
  text,
  replyTo = DEFAULT_REPLY_TO,
  tags = [],
  idempotencyKey,
  requestId,
  category = 'transactional',
}) {
  const recipient = maskRecipient(to);
  const deliveryStartedAt = Date.now();

  for (let attempt = 1; attempt <= MAX_EMAIL_RETRIES + 1; attempt += 1) {
    const attemptStartedAt = Date.now();
    emailLog('attempt_started', {
      requestId: requestId || null,
      category,
      recipient,
      attempt,
      maxAttempts: MAX_EMAIL_RETRIES + 1,
      timeoutMs: EMAIL_SEND_TIMEOUT_MS,
      hasIdempotencyKey: Boolean(idempotencyKey),
    });

    try {
      await initializeMailer();
      let messageId;

      if (EMAIL_PROVIDER === 'resend') {
        const payload = { from: FROM, to, subject, html, replyTo };
        if (text) payload.text = text;
        if (tags.length) payload.tags = tags;

        const sendOptions = {
          ...(idempotencyKey ? { idempotencyKey } : {}),
          signal: AbortSignal.timeout(EMAIL_SEND_TIMEOUT_MS),
        };
        const { data, error } = await resend.emails.send(payload, sendOptions);
        if (error) {
          const providerError = Object.assign(new Error(error.message || 'Email provider rejected the request.'), error);
          throw providerError;
        }
        messageId = data?.id;
      } else if (EMAIL_PROVIDER === 'gmail' || EMAIL_PROVIDER === 'smtp') {
        const result = await smtpTransporter.sendMail({
          from: FROM,
          to,
          subject,
          html,
          text,
          replyTo,
          messageId: smtpMessageId(idempotencyKey),
          headers: idempotencyKey ? { 'X-AutoSPF-Idempotency-Key': idempotencyKey } : undefined,
        });
        messageId = result?.messageId;
      } else {
        // Explicit console mode is intended for local/test environments only.
        messageId = `console_${Date.now()}`;
      }

      emailLog('provider_accepted', {
        requestId: requestId || null,
        category,
        recipient,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        totalDurationMs: Date.now() - deliveryStartedAt,
        messageId: messageId || null,
      });
      return {
        success: true,
        messageId,
        attempts: attempt,
        retryCount: attempt - 1,
        provider: EMAIL_PROVIDER,
      };
    } catch (error) {
      const classification = classifyEmailDeliveryError(error);
      const resendRetryIsSafe =
        EMAIL_PROVIDER !== 'resend'
        || Boolean(idempotencyKey)
        || classification.statusCode !== null;
      const canRetry = attempt <= MAX_EMAIL_RETRIES && classification.retryable && resendRetryIsSafe;
      emailLog('attempt_failed', {
        requestId: requestId || null,
        category,
        recipient,
        attempt,
        durationMs: Date.now() - attemptStartedAt,
        error: String(error?.message || error).slice(0, 300),
        ...classification,
        willRetry: canRetry,
      }, canRetry ? 'warn' : 'error');

      if (canRetry) {
        emailLog('retry_scheduled', {
          requestId: requestId || null,
          category,
          recipient,
          retryNumber: attempt,
          delayMs: EMAIL_RETRY_DELAY_MS,
        }, 'warn');
        if (EMAIL_RETRY_DELAY_MS > 0) await sleep(EMAIL_RETRY_DELAY_MS);
        continue;
      }

      return {
        success: false,
        error: String(error?.message || error),
        attempts: attempt,
        retryCount: attempt - 1,
        provider: EMAIL_PROVIDER,
        classification,
      };
    }
  }

  return { success: false, error: 'Email delivery failed.', attempts: 0, retryCount: 0, provider: EMAIL_PROVIDER };
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
  const validityMinutes = isLogin ? 5 : 10;
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
                <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#1c1917;letter-spacing:0.01em">Valid for ${validityMinutes} minutes</p>
                <p style="margin:0;font-size:13px;line-height:1.65;color:#78716c">For your security, never share this code. If you did not request verification, you may disregard this message—your account will remain unchanged.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, {
    preheader: `Your AutoSPF+ code: ${otp}. Valid ${validityMinutes} minutes.`,
    accent: 'brand',
    confidentialityRibbon: true,
  });
}

function otpPlainText(otp, { purpose = 'verification' } = {}) {
  const label = purpose === 'login' ? 'sign-in code' : 'verification code';
  const validityMinutes = purpose === 'login' ? 5 : 10;
  return `AutoSPF+ ${label}\n\n${otp}\n\nThis code is valid for ${validityMinutes} minutes. If you did not request it, ignore this email.\n\n${getAppPublicUrl()}`;
}

// ─── Staff Account Verification Link Template ───────────────────────────────

function staffVerificationTemplate(name, verificationUrl, expiresHours = 24) {
  const safeName = escapeHtml(name || 'there');
  const safeVerificationUrl = escapeHtml(verificationUrl);
  const supportAddr = escapeHtml(getSupportEmail());
  const supportMailto = escapeHtml(`mailto:${getSupportEmail()}`);

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:46px 38px 28px;text-align:center;border-bottom:1px solid #f1f5f9">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.22em;color:#c2410c">Staff account verification</p>
          <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.035em;color:#0a0f1a;line-height:1.2">Verify your AutoSPF+ account</h1>
          <p style="margin:18px auto 0;font-size:15px;line-height:1.65;color:#64748b;max-width:410px">Hi ${safeName}, an AutoSPF+ staff account was created for this email address. Verify the account before signing in.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 36px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px">
            <tr>
              <td style="border-radius:14px;background:#0f172a">
                <a href="${safeVerificationUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px">Verify Account</a>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#fff7ed;border-radius:14px;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:20px 22px">
                <p style="margin:0 0 7px;font-size:13px;font-weight:700;color:#9a3412">Valid for ${expiresHours} hour${expiresHours === 1 ? '' : 's'}</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c">This secure link is bound to your account and can be used only once. After verification, sign in with your password and the separate 6-digit sign-in code sent to your email.</p>
              </td>
            </tr>
          </table>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.65;color:#94a3b8;text-align:center">If the button does not work, copy this link into your browser:<br><a href="${safeVerificationUrl}" style="color:#d97706;text-decoration:none;word-break:break-all">${safeVerificationUrl}</a></p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
            <tr>
              <td style="border-top:1px solid #f1f5f9;padding-top:18px;text-align:center">
                <p style="margin:0;font-size:12px;line-height:1.55;color:#64748b">Did not expect this account? Contact <a href="${supportMailto}" style="color:#d97706;text-decoration:none;font-weight:600">${supportAddr}</a>.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;

  return baseWrapper(content, {
    preheader: 'Verify your AutoSPF+ staff account with this secure one-time link.',
    accent: 'brand',
    confidentialityRibbon: true,
  });
}

function staffVerificationPlainText(name, verificationUrl, expiresHours = 24) {
  return `AutoSPF+ staff account verification\n\nHi ${name || 'there'},\n\nVerify your account using this secure one-time link:\n${verificationUrl}\n\nThis link is valid for ${expiresHours} hour${expiresHours === 1 ? '' : 's'}. After verification, sign in with your password and the separate 6-digit sign-in code sent to your registered email.\n\n${getAppPublicUrl()}`;
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

// ─── Password Setup Link Template ─────────────────────────────────────────────

function passwordSetupTemplate(name, setupUrl, expiresMinutes = 60) {
  const safeName = escapeHtml(name || 'there');
  const safeSetupUrl = escapeHtml(setupUrl);
  const supportAddr = escapeHtml(getSupportEmail());
  const supportMailto = escapeHtml(`mailto:${getSupportEmail()}`);

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:46px 38px 28px;text-align:center;border-bottom:1px solid #f1f5f9">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.22em;color:#c2410c">Secure account setup</p>
          <h1 style="margin:0;font-size:28px;font-weight:700;letter-spacing:-0.035em;color:#0a0f1a;line-height:1.2">Create your AutoSPF+ password</h1>
          <p style="margin:18px auto 0;font-size:15px;line-height:1.65;color:#64748b;max-width:410px">Hi ${safeName}, your concierge created a pending AutoSPF+ account. Use this secure link to set your own password and activate access.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 32px 36px">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 26px">
            <tr>
              <td style="border-radius:14px;background:#0f172a">
                <a href="${safeSetupUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px">Set my password</a>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="background:#fff7ed;border-radius:14px;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:20px 22px">
                <p style="margin:0 0 7px;font-size:13px;font-weight:700;color:#9a3412">Valid for ${expiresMinutes} minutes</p>
                <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c">For your security, this link can be used once. AutoSPF+ will never ask the AI assistant to create a password for you.</p>
              </td>
            </tr>
          </table>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.65;color:#94a3b8;text-align:center">If the button does not work, copy this link into your browser:<br><a href="${safeSetupUrl}" style="color:#d97706;text-decoration:none;word-break:break-all">${safeSetupUrl}</a></p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
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
    preheader: 'Set your AutoSPF+ password with a secure one-time link.',
    accent: 'brand',
    confidentialityRibbon: true,
  });
}

function passwordSetupPlainText(name, setupUrl, expiresMinutes = 60) {
  return `AutoSPF+ secure account setup\n\nHi ${name || 'there'},\n\nSet your password using this secure one-time link:\n${setupUrl}\n\nThis link is valid for ${expiresMinutes} minutes. AutoSPF+ will never ask the AI assistant to create a password for you.\n\n${getAppPublicUrl()}`;
}

// ─── Customer Notification Template ──────────────────────────────────────────

function absoluteAppUrl(pathOrUrl) {
  const raw = String(pathOrUrl || '').trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw || 'customer/dashboard'}`;
  return `${getAppPublicUrl()}${path}`;
}

export function buildCustomerNotificationEmailTemplate(spec = {}) {
  const subject = String(spec.emailSubject || spec.subject || spec.title || 'AutoSPF+ booking update').trim();
  const title = escapeHtml(spec.title || subject);
  const message = escapeHtml(spec.message || 'There is a new update for your AutoSPF+ booking.');
  const bookingReference = escapeHtml(spec.bookingReference || spec.orderNumber || 'N/A');
  const vehicle = escapeHtml(spec.vehicle || 'Your vehicle');
  const serviceName = escapeHtml(spec.serviceName || 'AutoSPF+ service');
  const stageLabel = escapeHtml(spec.stageLabel || spec.stage || spec.status || 'Booking update');
  const ctaLabel = escapeHtml(spec.ctaLabel || 'View update');
  const ctaUrl = escapeHtml(absoluteAppUrl(spec.ctaPath || spec.link || '/customer/dashboard'));
  const priorityLabel = spec.priority === 'high'
    ? `<p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#c2410c">Important update</p>`
    : `<p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;color:#94a3b8">Booking update</p>`;

  const content = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:40px 36px 26px;text-align:center;border-bottom:1px solid #f1f5f9">
          ${priorityLabel}
          <h1 style="margin:0;font-size:25px;font-weight:700;letter-spacing:-0.03em;color:#0f172a;line-height:1.25">${title}</h1>
          <p style="margin:16px auto 0;font-size:15px;line-height:1.65;color:#64748b;max-width:420px">${message}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px 32px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px">
            <tr><td style="padding:18px 20px 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#94a3b8">Booking details</td></tr>
            <tr><td style="padding:0 20px 18px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;color:#0f172a">
                <tr><td style="padding:6px 0;color:#64748b">Reference</td><td style="padding:6px 0;text-align:right;font-weight:700">${bookingReference}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b">Vehicle</td><td style="padding:6px 0;text-align:right;font-weight:600">${vehicle}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b">Service</td><td style="padding:6px 0;text-align:right;font-weight:600">${serviceName}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b">Current status</td><td style="padding:6px 0;text-align:right;font-weight:600">${stageLabel}</td></tr>
              </table>
            </td></tr>
          </table>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto 0">
            <tr>
              <td style="border-radius:14px;background:#0f172a">
                <a href="${ctaUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px">${ctaLabel}</a>
              </td>
            </tr>
          </table>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.65;color:#94a3b8;text-align:center">This message reflects the latest status saved in your AutoSPF+ live tracker.</p>
        </td>
      </tr>
    </table>
  `;

  const text = [
    `AutoSPF+ - ${subject}`,
    '',
    spec.message || 'There is a new update for your AutoSPF+ booking.',
    '',
    `Reference: ${spec.bookingReference || spec.orderNumber || 'N/A'}`,
    `Vehicle: ${spec.vehicle || 'Your vehicle'}`,
    `Service: ${spec.serviceName || 'AutoSPF+ service'}`,
    `Current status: ${spec.stageLabel || spec.stage || spec.status || 'Booking update'}`,
    '',
    absoluteAppUrl(spec.ctaPath || spec.link || '/customer/dashboard'),
  ].join('\n');

  return {
    subject,
    html: baseWrapper(content, {
      preheader: spec.preheader || spec.message || subject,
      accent: spec.priority === 'high' ? 'brand' : 'slate',
    }),
    text,
  };
}

export async function sendCustomerNotificationEmail({ to, spec, idempotencyKey }) {
  const built = buildCustomerNotificationEmailTemplate(spec);
  const result = await sendEmail({
    to,
    subject: built.subject,
    html: built.html,
    text: built.text,
    tags: [
      { name: 'type', value: 'customer_notification' },
      { name: 'kind', value: normalizeTagValue(spec?.kind || spec?.emailCategory || 'booking_update') },
      { name: 'stage', value: normalizeTagValue(spec?.stage || 'none') },
    ],
    idempotencyKey: buildIdempotencyKey('customer_notification', idempotencyKey),
  });

  return {
    ...result,
    subject: built.subject,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const sendOtpEmail = async (email, otp, { purpose = 'verification', otpRecordId, requestId } = {}) => {
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
    requestId,
    category: `otp_${safePurpose}`,
  });
};

export const sendStaffVerificationEmail = async (
  email,
  name,
  verificationUrl,
  { tokenRecordId, expiresInSeconds = 86400 } = {},
) => {
  console.log(`📨 [${EMAIL_PROVIDER}] Sending staff verification link to ${maskRecipient(email)}...`);
  const expiresHours = Math.max(1, Math.ceil(Number(expiresInSeconds || 86400) / 3600));
  return sendEmail({
    to: email,
    subject: 'Verify your AutoSPF+ staff account',
    html: staffVerificationTemplate(name, verificationUrl, expiresHours),
    text: staffVerificationPlainText(name, verificationUrl, expiresHours),
    tags: [
      { name: 'type', value: 'account_verification' },
      { name: 'purpose', value: 'staff_email_verification' },
    ],
    idempotencyKey: buildIdempotencyKey('staff_email_verification', tokenRecordId),
  });
};

export const sendWelcomeEmail = async (email, name) => {
  console.log(`📨 [${EMAIL_PROVIDER}] Sending welcome email to ${maskRecipient(email)}...`);
  return sendEmail({
    to: email,
    subject: 'Welcome to AutoSPF+',
    html: welcomeTemplate(name),
    tags: [{ name: 'type', value: 'welcome' }],
  });
};

export const sendPasswordResetEmail = async (email, otp, { otpRecordId } = {}) => {
  console.log(`📨 [${EMAIL_PROVIDER}] Sending password reset OTP to ${maskRecipient(email)}...`);
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

export const sendPasswordSetupEmail = async (email, name, setupUrl, { tokenRecordId, expiresInSeconds = 3600 } = {}) => {
  console.log(`📨 [${EMAIL_PROVIDER}] Sending password setup link to ${maskRecipient(email)}...`);
  const expiresMinutes = Math.max(1, Math.round(Number(expiresInSeconds || 3600) / 60));
  return sendEmail({
    to: email,
    subject: 'Set up your AutoSPF+ password',
    html: passwordSetupTemplate(name, setupUrl, expiresMinutes),
    text: passwordSetupPlainText(name, setupUrl, expiresMinutes),
    tags: [
      { name: 'type', value: 'account_setup' },
      { name: 'purpose', value: 'password_setup' },
    ],
    idempotencyKey: buildIdempotencyKey('password_setup', tokenRecordId),
  });
};

export const initializeMailer = async () => {
  if (EMAIL_PROVIDER === 'resend' && resend) return;
  if ((EMAIL_PROVIDER === 'gmail' || EMAIL_PROVIDER === 'smtp') && smtpTransporter) return;
  if (EMAIL_PROVIDER === 'console') return;
  if (mailerInitializationPromise) return mailerInitializationPromise;

  mailerInitializationPromise = (async () => {
    const startedAt = Date.now();
    emailLog('initialization_started', {
      connectionTimeoutMs: config.smtpConnectionTimeoutMs,
      greetingTimeoutMs: config.smtpGreetingTimeoutMs,
      socketTimeoutMs: config.smtpSocketTimeoutMs,
    });

    try {
      if (EMAIL_PROVIDER === 'resend') {
        if (!config.resendApiKey) {
          const error = new Error('RESEND_API_KEY is not configured.');
          error.code = 'MISSING_API_KEY';
          throw error;
        }
        resend = new Resend(config.resendApiKey);
      } else if (EMAIL_PROVIDER === 'gmail' || EMAIL_PROVIDER === 'smtp') {
        const candidate = createSmtpTransporter();
        await candidate.verify();
        smtpTransporter = candidate;
      } else {
        const error = new Error(`Unsupported EMAIL_PROVIDER: ${EMAIL_PROVIDER}`);
        error.code = 'EMAIL_PROVIDER_CONFIG';
        throw error;
      }

      emailLog('initialization_succeeded', {
        durationMs: Date.now() - startedAt,
        fromDomain: String(FROM_EMAIL).split('@')[1] || null,
      });
    } catch (error) {
      resend = null;
      smtpTransporter = null;
      const classification = classifyEmailDeliveryError(error);
      emailLog('initialization_failed', {
        durationMs: Date.now() - startedAt,
        error: String(error?.message || error).slice(0, 300),
        ...classification,
      }, 'error');
      throw error;
    }
  })();

  try {
    return await mailerInitializationPromise;
  } finally {
    mailerInitializationPromise = null;
  }
};

export default {
  initializeMailer,
  sendOtpEmail,
  sendStaffVerificationEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendPasswordSetupEmail,
  sendCustomerNotificationEmail,
  buildCustomerNotificationEmailTemplate,
};
