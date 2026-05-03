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
router.post('/generate-3d', upload.array('images', 5), generate3DModel);
router.get('/generate-3d/:taskId', get3DModelStatus);
router.post('/estimate', estimateCost);
router.post('/calculate-cost', calculateCost);
router.post('/confirm', authenticate, confirmServiceRequest);
router.post('/repair-preview', generateRepairPreview);
router.post('/upload-image', upload.single('image'), uploadImage);

/* ── NEW AI Scan Module — GPT-4 Vision (mock+real), Meshy 3D, Estimator ── */
router.post('/scan', optionalAuthenticate, upload.array('images', 5), scanWithGPTVision);
router.get('/scan/:id', optionalAuthenticate, getScanById);
router.post('/generate-3d-from-scan', optionalAuthenticate, generate3DFromScan);
router.post('/estimate-from-damages', estimateFromDamages);

/* ── GLB Proxy — pipes Meshy/Cloudinary GLB with CORS headers ── */
router.get('/proxy-glb', proxyGlb);

/* ── QC Staff Portal — list all AI scans ── */
router.get('/scans', listAiScans);

/* ── AR Viewer Page (for iOS Quick Look support) ── */
router.get('/ar-viewer', (req, res) => {
  const modelUrl = req.query.src || '';
  if (!modelUrl) {
    return res.status(400).send('Missing model URL (?src=)');
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>AutoSPF+ AR Viewer</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: #0A0A0C; overflow: hidden; }
    model-viewer {
      width: 100%; height: 100%;
      --poster-color: transparent;
      background: transparent;
    }
    .ar-btn {
      position: fixed;
      bottom: max(20px, env(safe-area-inset-bottom));
      left: 50%; transform: translateX(-50%);
      padding: 16px 36px;
      background: linear-gradient(135deg, #FF6B35 0%, #FF8C42 100%);
      border: none; border-radius: 50px;
      color: #fff; font: 700 16px/1 -apple-system, sans-serif;
      letter-spacing: 0.5px;
      box-shadow: 0 8px 32px rgba(255,107,53,0.4);
      cursor: pointer; z-index: 100;
    }
    .ar-btn:active { transform: translateX(-50%) scale(0.95); opacity: 0.9; }
    .header {
      position: fixed; top: 0; left: 0; right: 0;
      padding: max(50px, env(safe-area-inset-top)) 20px 16px;
      background: linear-gradient(180deg, rgba(10,10,12,0.9) 0%, transparent 100%);
      z-index: 100;
      text-align: center;
    }
    .header h1 { color: #fff; font: 600 17px/1 -apple-system, sans-serif; }
    .header p { color: rgba(255,255,255,0.5); font: 400 12px/1 -apple-system, sans-serif; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>AutoSPF+ AR Preview</h1>
    <p>Tap the button below to view in your space</p>
  </div>
  <model-viewer
    id="viewer"
    src="${modelUrl}"
    alt="AutoSPF+ Vehicle"
    ar
    ar-modes="webxr scene-viewer quick-look"
    camera-controls
    auto-rotate
    shadow-intensity="1.8"
    environment-image="neutral"
    exposure="1.1"
    camera-orbit="30deg 70deg auto"
    field-of-view="40deg"
    loading="eager"
  >
    <button slot="ar-button" class="ar-btn">
      📱 View In Your Space
    </button>
  </model-viewer>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
