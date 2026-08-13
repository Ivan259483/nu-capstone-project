import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes } from 'crypto';
import {
  analyzeDamage,
  generate3DModel,
  get3DModelStatus,
  estimateCost,
  calculateCost,
  confirmServiceRequest,
  generateRepairPreview,
  uploadImage,
  scanWithGPTVision,
  getScanById,
  getWebARSession,
  generate3DFromScan,
  estimateFromDamages,
  proxyGlb,
  proxyGlbHead,
  proxyGlbOptions,
  listAiScans,
} from '../controllers/ai.controller.js';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth.middleware.js';
import { SERVICE_OPERATION_ROLES } from '../constants/roles.js';
import { config } from '../config/environment.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const aiGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many 3D generation requests. Please try again later.' },
});

router.post('/analyze', upload.array('images', 5), analyzeDamage);

/**
 * POST /api/ai/generate-3d
 * - JSON `{ "scanId": "..." }` → Meshy from stored scan images (same as /generate-3d-from-scan).
 * - multipart `images[]` → legacy upload flow (generate3DModel).
 */
router.post('/generate-3d', optionalAuthenticate, aiGenerationLimiter, (req, res, next) => {
  const contentType = String(req.headers['content-type'] || '');
  if (contentType.includes('application/json')) {
    const scanId = String(req.body?.scanId || '').trim();
    if (!scanId) {
      return res.status(400).json({
        success: false,
        message: 'JSON body must include scanId, or send multipart images for the legacy flow.',
      });
    }
    return generate3DFromScan(req, res);
  }
  return upload.array('images', 5)(req, res, (err) => {
    if (err) return next(err);
    const scanId = String(req.body?.scanId || '').trim();
    if (scanId) return generate3DFromScan(req, res);
    return generate3DModel(req, res);
  });
});
router.get('/generate-3d/:taskId', get3DModelStatus);
router.post('/estimate', estimateCost);
router.post('/calculate-cost', calculateCost);
router.post('/confirm', authenticate, confirmServiceRequest);
router.post('/repair-preview', generateRepairPreview);
router.post('/upload-image', upload.single('image'), uploadImage);

/* ── NEW AI Scan Module — GPT-4 Vision (mock+real), Meshy 3D, Estimator ── */
router.post('/scan', optionalAuthenticate, upload.array('images', 5), scanWithGPTVision);
router.get('/scan/:id', optionalAuthenticate, getScanById);
router.get('/webar-session/:scanId', optionalAuthenticate, getWebARSession);
// Accepts both JSON { scanId } (normal path) and multipart images[] (direct fallback when Cloudinary is down).
router.post('/generate-3d-from-scan', optionalAuthenticate, aiGenerationLimiter, (req, res, next) => {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return upload.array('images', 5)(req, res, (err) => {
      if (err) return next(err);
      return generate3DFromScan(req, res);
    });
  }
  return generate3DFromScan(req, res);
});
router.post('/estimate-from-damages', estimateFromDamages);

/* ── GLB Proxy — pipes Meshy/Cloudinary GLB with CORS headers ── */
router.options('/proxy-glb', proxyGlbOptions);
router.head('/proxy-glb', proxyGlbHead);
router.get('/proxy-glb', proxyGlb);

/* ── AR Session Tokens ──
   iOS Linking.openURL fails with very long Meshy signed GLB URLs.
   The mobile app POSTs the model URL → gets a short token.
   ar.html opens with ?token=xxx (short URL) → fetches model URL from GET.
   Tokens auto-expire after 30 minutes. */
const arSessions = new Map(); // token → { modelUrl, createdAt }
const AR_SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

// Cleanup expired tokens every 5 minutes
const arSessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of arSessions) {
    if (now - data.createdAt > AR_SESSION_TTL_MS) arSessions.delete(token);
  }
}, 5 * 60 * 1000);
arSessionCleanupTimer.unref?.();

const buildSceneViewerUrl = (modelUrl) =>
  `https://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(modelUrl)}`;

const getPublicOrigin = (req) => {
  if (config.publicApiOrigin) return config.publicApiOrigin;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
};

const buildLaunchUrl = (req, token) =>
  `${getPublicOrigin(req)}/api/ai/ar-launch?token=${encodeURIComponent(token)}`;

const AR_ASSET_ALLOWED_HOSTS = new Set([
  'nu-capstone-project.onrender.com',
  'assets.meshy.ai',
  'res.cloudinary.com',
  'storage.googleapis.com',
]);

const isLoopbackHostname = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

const normalizeArAssetUrl = (req, value) => {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const publicOrigin = new URL(getPublicOrigin(req));
    const parsed = new URL(candidate, publicOrigin);
    if (parsed.username || parsed.password) return '';
    const isAllowedExternalHost = [...AR_ASSET_ALLOWED_HOSTS]
      .some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`));
    const secureProtocol = parsed.protocol === 'https:';
    const localDevelopmentUrl = parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname);
    if (!(secureProtocol || localDevelopmentUrl)) return '';
    const isLocalOwnOrigin = parsed.origin === publicOrigin.origin && isLoopbackHostname(parsed.hostname);
    if (!(isLocalOwnOrigin || isAllowedExternalHost)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
};

const escapeHtml = (value) => String(value ?? '').replace(
  /[&<>"']/g,
  (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]
);

const normalizeArDamages = (damages) => (Array.isArray(damages) ? damages : [])
  .slice(0, 50)
  .map((damage) => ({
    type: String(damage?.type || 'Damage').slice(0, 100),
    affectedArea: String(damage?.affectedArea || '').slice(0, 100),
    severity: ['high', 'medium', 'low'].includes(damage?.severity) ? damage.severity : 'medium',
    coordinates: {
      x: Math.max(0, Math.min(1, Number(damage?.coordinates?.x) || 0)),
      y: Math.max(0, Math.min(1, Number(damage?.coordinates?.y) || 0)),
      width: Math.max(0, Math.min(1, Number(damage?.coordinates?.width) || 0)),
      height: Math.max(0, Math.min(1, Number(damage?.coordinates?.height) || 0)),
    },
  }));

const buildArLaunchFallbackHtml = ({
  title,
  message,
  usdzUrl,
  sceneViewerUrl,
}) => {
  const safeTitle = escapeHtml(title || 'AR Launch');
  const safeMessage = escapeHtml(message || 'AR launch is unavailable.');
  const usdzLink = usdzUrl
    ? `<a class="btn" href="${escapeHtml(usdzUrl)}" rel="noreferrer">Open USDZ Link</a>`
    : '';
  const sceneLink = sceneViewerUrl
    ? `<a class="btn secondary" href="${escapeHtml(sceneViewerUrl)}" rel="noreferrer">Open Scene Viewer Link</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${safeTitle}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      min-height: 100%;
      background: #0a0a0c;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 460px;
      border-radius: 16px;
      padding: 22px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(16, 16, 20, 0.92);
    }
    h1 {
      font-size: 20px;
      font-weight: 800;
      margin-bottom: 10px;
      color: #f97316;
    }
    p {
      color: rgba(255, 255, 255, 0.75);
      font-size: 14px;
      line-height: 1.55;
      margin-bottom: 16px;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      min-height: 44px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 700;
      color: #fff;
      background: linear-gradient(135deg, #f97316, #fb923c);
    }
    .btn.secondary {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.14);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <div class="actions">
        ${usdzLink}
        ${sceneLink}
      </div>
    </div>
  </div>
</body>
</html>`;
};

const arLaunchStyle = buildArLaunchFallbackHtml({}).match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
const arLaunchStyleHash = createHash('sha256').update(arLaunchStyle, 'utf8').digest('base64');
const AR_LAUNCH_CSP = [
  "default-src 'none'",
  `style-src 'sha256-${arLaunchStyleHash}'`,
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

router.post('/ar-session', (req, res) => {
  const { modelUrl, repairedModelUrl, usdzUrl, damages } = req.body || {};
  const safeModelUrl = normalizeArAssetUrl(req, modelUrl);
  if (!safeModelUrl) {
    return res.status(400).json({ error: 'A valid HTTPS modelUrl from an approved model host is required.' });
  }
  const safeRepairedModelUrl = normalizeArAssetUrl(req, repairedModelUrl) || safeModelUrl;
  const safeUsdzUrl = normalizeArAssetUrl(req, usdzUrl);
  const token = randomBytes(24).toString('base64url');
  const sceneViewerUrl = buildSceneViewerUrl(safeModelUrl);
  const launchUrl = buildLaunchUrl(req, token);
  arSessions.set(token, {
    modelUrl: safeModelUrl,
    repairedModelUrl: safeRepairedModelUrl,
    usdzUrl: safeUsdzUrl,
    sceneViewerUrl,
    damages: normalizeArDamages(damages),
    createdAt: Date.now(),
  });
  res.json({
    token,
    launchUrl,
    sceneViewerUrl,
    ...(safeUsdzUrl ? { usdzUrl: safeUsdzUrl } : {}),
  });
});

router.get('/ar-session/:token', (req, res) => {
  const data = arSessions.get(req.params.token);
  if (!data) return res.status(404).json({ error: 'Session expired or not found' });
  res.json({
    modelUrl: data.modelUrl,
    repairedModelUrl: data.repairedModelUrl,
    ...(data.usdzUrl ? { usdzUrl: data.usdzUrl } : {}),
    sceneViewerUrl: data.sceneViewerUrl || buildSceneViewerUrl(data.modelUrl),
    damages: data.damages,
  });
});

router.get('/ar-launch', (req, res) => {
  res.setHeader('Content-Security-Policy', AR_LAUNCH_CSP);
  res.setHeader('Referrer-Policy', 'no-referrer');
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res
      .status(400)
      .type('html')
      .send(buildArLaunchFallbackHtml({
        title: 'Missing AR Token',
        message: 'The AR launch link is missing its token. Please regenerate the QR code from the app.',
      }));
  }

  const data = arSessions.get(token);
  if (!data) {
    return res
      .status(404)
      .type('html')
      .send(buildArLaunchFallbackHtml({
        title: 'AR Session Expired',
        message: 'This AR launch session has expired. Please generate a new QR code from the app.',
      }));
  }

  const ua = String(req.get('user-agent') || '');
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo/i.test(ua);

  const usdzUrl = String(data.usdzUrl || '').trim();
  const sceneViewerUrl = String(data.sceneViewerUrl || buildSceneViewerUrl(data.modelUrl || '')).trim();

  if (isIOS) {
    if (!usdzUrl) {
      return res
        .status(400)
        .type('html')
        .send(buildArLaunchFallbackHtml({
          title: 'USDZ Not Available',
          message: 'This model does not include a USDZ file yet. Please regenerate the 3D model and try again.',
        }));
    }

    if (!isSafari) {
      return res
        .status(200)
        .type('html')
        .send(buildArLaunchFallbackHtml({
          title: 'Open In Safari',
          message: 'For iPhone AR, open this link in Safari to launch Quick Look.',
          usdzUrl,
        }));
    }

    return res.redirect(302, usdzUrl);
  }

  if (isAndroid) {
    if (!sceneViewerUrl) {
      return res
        .status(400)
        .type('html')
        .send(buildArLaunchFallbackHtml({
          title: 'Scene Viewer URL Missing',
          message: 'Could not build the Android Scene Viewer URL for this AR session.',
        }));
    }
    return res.redirect(302, sceneViewerUrl);
  }

  return res
    .status(200)
    .type('html')
    .send(buildArLaunchFallbackHtml({
      title: 'Unsupported Device',
      message: 'This device or browser is not supported for native AR launch. Use iPhone Safari or Android Chrome.',
      usdzUrl: usdzUrl || undefined,
      sceneViewerUrl: sceneViewerUrl || undefined,
    }));
});

/* ── QC Staff Portal — list all AI scans ── */
router.get('/scans', authenticate, authorize(...SERVICE_OPERATION_ROLES), listAiScans);

/* ── AR Viewer Page (for iOS Quick Look support) ── */
router.get('/ar-viewer', (req, res) => {
  const modelUrl = normalizeArAssetUrl(req, req.query.src);
  if (!modelUrl) {
    return res.status(400).send('Missing or disallowed model URL (?src=)');
  }

  // Keep one audited AR document instead of maintaining a second generated
  // HTML/template CSP surface.
  return res.redirect(302, `/ar.html?model=${encodeURIComponent(modelUrl)}`);
});

export default router;
