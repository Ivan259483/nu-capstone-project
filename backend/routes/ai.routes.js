import express from 'express';
import multer from 'multer';
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
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware.js';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/analyze', upload.array('images', 5), analyzeDamage);

/**
 * POST /api/ai/generate-3d
 * - JSON `{ "scanId": "..." }` → Meshy from stored scan images (same as /generate-3d-from-scan).
 * - multipart `images[]` → legacy upload flow (generate3DModel).
 */
router.post('/generate-3d', optionalAuthenticate, (req, res, next) => {
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
router.post('/generate-3d-from-scan', optionalAuthenticate, (req, res, next) => {
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
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of arSessions) {
    if (now - data.createdAt > AR_SESSION_TTL_MS) arSessions.delete(token);
  }
}, 5 * 60 * 1000);

const buildSceneViewerUrl = (modelUrl) =>
  `https://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(modelUrl)}`;

const getPublicOrigin = (req) => {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
};

const buildLaunchUrl = (req, token) =>
  `${getPublicOrigin(req)}/api/ai/ar-launch?token=${encodeURIComponent(token)}`;

const buildArLaunchFallbackHtml = ({
  title,
  message,
  usdzUrl,
  sceneViewerUrl,
}) => {
  const safeTitle = String(title || 'AR Launch');
  const safeMessage = String(message || 'AR launch is unavailable.');
  const usdzLink = usdzUrl
    ? `<a class="btn" href="${usdzUrl}">Open USDZ Link</a>`
    : '';
  const sceneLink = sceneViewerUrl
    ? `<a class="btn secondary" href="${sceneViewerUrl}">Open Scene Viewer Link</a>`
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

router.post('/ar-session', (req, res) => {
  const { modelUrl, repairedModelUrl, usdzUrl, damages } = req.body || {};
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' });
  const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const sceneViewerUrl = buildSceneViewerUrl(modelUrl);
  const launchUrl = buildLaunchUrl(req, token);
  arSessions.set(token, {
    modelUrl,
    repairedModelUrl: repairedModelUrl || modelUrl,
    usdzUrl: typeof usdzUrl === 'string' ? usdzUrl : '',
    sceneViewerUrl,
    damages: damages || [],
    createdAt: Date.now(),
  });
  res.json({
    token,
    launchUrl,
    sceneViewerUrl,
    ...(typeof usdzUrl === 'string' && usdzUrl.trim() ? { usdzUrl: usdzUrl.trim() } : {}),
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
router.get('/scans', listAiScans);

/* ── AR Viewer Page (for iOS Quick Look support) ── */
router.get('/ar-viewer', (req, res) => {
  const modelUrl = decodeURIComponent(req.query.src || '');
  if (!modelUrl) {
    return res.status(400).send('Missing model URL (?src=)');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>AutoSPF+ AR Viewer</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"><\/script>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:100%;height:100%;background:#050506;overflow:hidden;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#fff}
    model-viewer{
      width:100%;height:100vh;
      --poster-color:#050506;
      --progress-bar-color:#f97316;
      background:radial-gradient(circle at 50% 46%,rgba(255,255,255,.05),transparent 30%),#050506;
    }
    .header{
      position:fixed;top:0;left:0;right:0;
      padding:max(52px,env(safe-area-inset-top)) 20px 14px;
      background:linear-gradient(180deg,rgba(5,5,6,.95) 0%,transparent 100%);
      z-index:100;text-align:center;
    }
    .header h1{font-size:17px;font-weight:700;color:#fff}
    .header p{font-size:12px;color:rgba(255,255,255,.5);margin-top:3px}
    #arBtn{
      position:fixed;
      bottom:max(28px,env(safe-area-inset-bottom,28px));
      left:50%;transform:translateX(-50%);
      padding:0 40px;height:54px;min-width:200px;border-radius:27px;
      background:linear-gradient(135deg,#f97316,#fb923c);
      color:#fff;font-size:15px;font-weight:800;letter-spacing:.4px;
      border:none;cursor:pointer;z-index:200;white-space:nowrap;
      box-shadow:0 8px 32px rgba(249,115,22,.45);
      transition:opacity .2s,transform .15s;
    }
    #arBtn:active{opacity:.85;transform:translateX(-50%) scale(.96)}
    #arBtn[hidden]{display:none}
    #noAr{
      position:fixed;bottom:max(28px,env(safe-area-inset-bottom,28px));
      left:50%;transform:translateX(-50%);
      font-size:12px;color:rgba(255,255,255,.4);text-align:center;
      white-space:nowrap;display:none;
    }
    #loading{
      position:fixed;inset:0;z-index:50;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:#050506;gap:16px;
    }
    .ring{width:52px;height:52px;border-radius:50%;
      border:3px solid rgba(249,115,22,.2);border-top-color:#f97316;
      animation:spin .9s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg)}}
    .lt{font-size:13px;font-weight:700;color:rgba(255,255,255,.6)}
  </style>
</head>
<body>
  <div class="header">
    <h1>AutoSPF+ AR Preview</h1>
    <p>Tap the button below to view in your space</p>
  </div>
  <div id="loading"><div class="ring"></div><div class="lt">Loading 3D model…</div></div>
  <model-viewer
    id="viewer"
    src="${modelUrl}"
    ios-src="${modelUrl}"
    alt="AutoSPF+ Vehicle 3D Model"
    ar
    ar-modes="quick-look scene-viewer webxr"
    ar-placement="floor"
    ar-scale="auto"
    camera-controls
    auto-rotate
    shadow-intensity="1.6"
    environment-image="neutral"
    exposure="1.1"
    camera-orbit="30deg 70deg auto"
    field-of-view="38deg"
    loading="eager"
    reveal="auto"
  >
    <button slot="ar-button" id="arBtn" type="button">📱 View In Your Space</button>
  </model-viewer>
  <div id="noAr">AR not supported on this device</div>
<script>
(function(){
  var mv = document.getElementById('viewer');
  var loading = document.getElementById('loading');
  var arBtn = document.getElementById('arBtn');
  var noAr = document.getElementById('noAr');

  mv.addEventListener('load', function(){
    loading.style.display = 'none';
  });

  mv.addEventListener('error', function(){
    loading.style.display = 'none';
    arBtn.textContent = '⚠️ Model failed to load';
    arBtn.disabled = true;
  });

  mv.addEventListener('ar-status', function(e){
    var s = (e.detail && e.detail.status) ? e.detail.status : '';
    if(s === 'failed'){
      // Quick Look not available — try direct iOS AR link as fallback
      var glbUrl = ${JSON.stringify(modelUrl)};
      var a = document.createElement('a');
      a.rel = 'ar';
      a.href = glbUrl;
      a.appendChild(document.createElement('img'));
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  });

  // Notify parent React Native if embedded in WebView
  try{
    if(window.ReactNativeWebView){
      mv.addEventListener('ar-status', function(e){
        var s = (e.detail && e.detail.status) ? e.detail.status : '';
        if(s === 'session-started') window.ReactNativeWebView.postMessage(JSON.stringify({type:'AR_STARTED'}));
        if(s === 'not-presenting') window.ReactNativeWebView.postMessage(JSON.stringify({type:'AR_ENDED'}));
      });
    }
  }catch(e){}
})();
<\/script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.send(html);
});

export default router;
