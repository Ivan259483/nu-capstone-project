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

router.post('/ar-session', (req, res) => {
  const { modelUrl, repairedModelUrl, damages } = req.body || {};
  if (!modelUrl) return res.status(400).json({ error: 'modelUrl is required' });
  const token = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  arSessions.set(token, {
    modelUrl,
    repairedModelUrl: repairedModelUrl || modelUrl,
    damages: damages || [],
    createdAt: Date.now(),
  });
  res.json({ token });
});

router.get('/ar-session/:token', (req, res) => {
  const data = arSessions.get(req.params.token);
  if (!data) return res.status(404).json({ error: 'Session expired or not found' });
  res.json({
    modelUrl: data.modelUrl,
    repairedModelUrl: data.repairedModelUrl,
    damages: data.damages,
  });
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
