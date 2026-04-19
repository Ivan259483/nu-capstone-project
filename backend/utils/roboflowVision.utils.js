/**
 * Vehicle Damage Detection — Groq Vision Primary
 *
 * Previous Roboflow models (car-damage-detection-t0g92, car_damage_detector-nx53r)
 * returned 0 predictions or 404. Switched to Groq LLaMA Vision which gives
 * structured JSON damage detections from a single API call.
 *
 * Uses OpenAI SDK with Groq base URL (already installed as 'openai').
 * Roboflow workflow kept as optional fallback path.
 *
 * Workspace : ivans-workspace-ps59t
 * Workflow  : detect-and-classify (kept for reference)
 */

import axios from 'axios';
import OpenAI from 'openai';

// ── Canvas (native C++ addon) — graceful import ──────────────────────────────
// canvas requires system-level cairo/pango libs. If unavailable (e.g. Railway
// without apt packages), we skip image resizing and send raw buffers to Groq.
let createCanvas = null;
let loadImage = null;
try {
  const canvasModule = await import('canvas');
  createCanvas = canvasModule.createCanvas;
  loadImage = canvasModule.loadImage;
  console.log('[VisionAI] ✅ canvas module loaded — image resizing enabled');
} catch (canvasErr) {
  console.warn('[VisionAI] ⚠️  canvas module unavailable — image resizing disabled:', canvasErr.message);
}

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_IMAGE_WIDTH      = 1024;   // Resize before sending to any vision API
const CONFIDENCE_THRESHOLD = 0.10;   // Accept low-confidence detections

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
// llama-4-scout — confirmed working, returns valid JSON damage detections
const GROQ_MODEL   = 'meta-llama/llama-4-scout-17b-16e-instruct';

// Startup diagnostic
console.log(
  `[VisionAI] ✅ Module loaded — provider=Groq, model=${GROQ_MODEL}, ` +
  `threshold=${CONFIDENCE_THRESHOLD}, max_width=${MAX_IMAGE_WIDTH}`
);

// ── Groq client (OpenAI-compatible) ───────────────────────────────────────────
const groqClient = GROQ_API_KEY
  ? new OpenAI({ apiKey: GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
  : null;

// ── Roboflow (kept as optional path, currently unused) ─────────────────────────
const ROBOFLOW_API_KEY   = process.env.ROBOFLOW_API_KEY   || '';
const ROBOFLOW_WORKSPACE = process.env.ROBOFLOW_WORKSPACE || 'ivans-workspace-ps59t';
const ROBOFLOW_WORKFLOW  = process.env.ROBOFLOW_WORKFLOW  || 'detect-and-classify';
const ROBOFLOW_ENDPOINT  =
  process.env.ROBOFLOW_ENDPOINT
  || `https://serverless.roboflow.com/infer/workflows/${ROBOFLOW_WORKSPACE}/${ROBOFLOW_WORKFLOW}`;

// ── Image resize + base64 encode ───────────────────────────────────────────────
const resizeAndEncode = async (file) => {
  try {
    // If canvas module is unavailable, skip resizing and send raw buffer
    if (!loadImage || !createCanvas) {
      console.log(
        `[VisionAI] 🖼️  Canvas unavailable — sending raw buffer ` +
        `(${(file.size / 1024).toFixed(0)} KB)`
      );
      return { base64: file.buffer.toString('base64'), width: 1024, height: 768 };
    }

    const img   = await loadImage(file.buffer);
    const origW = img.width;
    const origH = img.height;

    if (origW <= MAX_IMAGE_WIDTH) {
      console.log(
        `[VisionAI] 🖼️  Image ${origW}x${origH} — no resize needed ` +
        `(${(file.size / 1024).toFixed(0)} KB)`
      );
      return { base64: file.buffer.toString('base64'), width: origW, height: origH };
    }

    const scale  = MAX_IMAGE_WIDTH / origW;
    const newW   = MAX_IMAGE_WIDTH;
    const newH   = Math.round(origH * scale);

    const canvas = createCanvas(newW, newH);
    const ctx    = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, newW, newH);

    const resizedBuf = canvas.toBuffer('image/jpeg', { quality: 0.90 });
    console.log(
      `[VisionAI] 🖼️  Resized ${origW}x${origH} → ${newW}x${newH} ` +
      `(${(file.size / 1024).toFixed(0)} KB → ${(resizedBuf.length / 1024).toFixed(0)} KB)`
    );
    return { base64: resizedBuf.toString('base64'), width: newW, height: newH };
  } catch (err) {
    console.warn('[VisionAI] ⚠️  Resize failed — using raw buffer:', err.message);
    return { base64: file.buffer.toString('base64'), width: 1024, height: 768 };
  }
};

// ── Damage class label → AutoSPF+ damage_type mapping ─────────────────────────
const CLASS_TO_DAMAGE_TYPE = {
  scratch:            'Paint Scratch',
  paint_scratch:      'Paint Scratch',
  'paint scratch':    'Paint Scratch',
  dent:               'Dent',
  deep_dent:          'Deep Dent',
  'deep dent':        'Deep Dent',
  crack:              'Crack',
  cracked:            'Crack',
  paint_chip:         'Paint Chip',
  'paint chip':       'Paint Chip',
  scuff:              'Surface Scuff',
  surface_scuff:      'Surface Scuff',
  'surface scuff':    'Surface Scuff',
  paint_transfer:     'Paint Transfer',
  'paint transfer':   'Paint Transfer',
  clearcoat:          'Clear Coat Damage',
  clear_coat:         'Clear Coat Damage',
  'clear coat':       'Clear Coat Damage',
  rust:               'Rust Spot',
  rust_spot:          'Rust Spot',
  faded:              'Faded Paint',
  faded_paint:        'Faded Paint',
  misalignment:       'Panel Misalignment',
  panel_misalignment: 'Panel Misalignment',
  shattered_glass:    'Shattered Glass',
  broken_light:       'Broken Light',
  flat_tire:          'Flat Tire',
  damaged_hood:       'Dent',
  damaged_door:       'Dent',
  damaged_bumper:     'Dent',
  damaged_windshield: 'Cracked Windshield',
  damage:             'Surface Damage',
};

// ── Area inference from normalised bounding box position ──────────────────────
const inferAffectedArea = (xCenter, yCenter) => {
  const isTop    = yCenter < 0.33;
  const isBottom = yCenter > 0.67;
  const isLeft   = xCenter < 0.33;
  const isRight  = xCenter > 0.67;

  if (isTop    && isLeft)  return 'Left Fender';
  if (isTop    && isRight) return 'Right Fender';
  if (isTop)               return 'Hood';
  if (isBottom && isLeft)  return 'Left Rear Panel';
  if (isBottom && isRight) return 'Right Rear Panel';
  if (isBottom)            return 'Rear Bumper';
  if (isLeft)              return 'Left Door Panel';
  if (isRight)             return 'Right Door Panel';
  return 'Front Bumper';
};

// ── Severity from confidence ───────────────────────────────────────────────────
const severityFromConfidence = (confidence) => {
  if (confidence >= 0.80) return 'severe';
  if (confidence >= 0.55) return 'moderate';
  return 'minor';
};

const capitalize = (str) =>
  str ? str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ') : '';

const buildRecommendedAction = (damageType, severity) => {
  const actions = {
    'Paint Scratch':      'Apply paint correction compound and touch-up paint; polish affected area.',
    'Dent':               'Perform paintless dent repair (PDR) on affected panel.',
    'Deep Dent':          'Panel straightening and repaint required.',
    'Crack':              'Fill crack with epoxy filler, sand, prime, and repaint.',
    'Paint Chip':         'Sand chipped area, apply primer and factory color touch-up.',
    'Surface Scuff':      'Buff with cutting compound; light polish to restore gloss.',
    'Paint Transfer':     'Remove with clay bar and polishing compound; inspect underlying paint.',
    'Clear Coat Damage':  'Apply clear coat restoration or spot re-clear.',
    'Rust Spot':          'Sand to bare metal, treat with rust inhibitor, prime, and repaint.',
    'Faded Paint':        'Multi-stage machine polish and paint sealant application.',
    'Panel Misalignment': 'Re-align panel and check mounting points.',
    'Shattered Glass':    'Full glass replacement required; do not drive until replaced.',
    'Cracked Windshield': 'Windshield repair or full replacement depending on crack size.',
    'Flat Tire':          'Tire replacement or plug repair required before driving.',
    'Broken Light':       'Replace headlight/taillight assembly; check wiring harness.',
    'Surface Damage':     'Assess extent; buff minor damage or repaint affected area.',
  };
  const base = actions[damageType] || `Inspect and repair ${damageType}.`;
  if (severity === 'severe') return `URGENT — ${base}`;
  return base;
};

// ── Normalise an LLM prediction (normalised 0-1 coords) to AutoSPF+ format ────
// LLM returns x_center, y_center, width, height all as 0-1 fractions.
const normalizeLLMPrediction = (pred, imageIndex) => {
  const rawClass   = String(pred.class || '').trim().toLowerCase();
  const damageType = CLASS_TO_DAMAGE_TYPE[rawClass] || capitalize(rawClass) || 'Surface Damage';
  const confidence = Math.max(0, Math.min(1, Number(pred.confidence || 0.75)));

  const cx = Number(pred.x_center ?? 0.5);
  const cy = Number(pred.y_center ?? 0.5);
  const bw = Number(pred.width    ?? 0.25);
  const bh = Number(pred.height   ?? 0.20);

  // Centre → top-left (all values already 0-1)
  const normX = Math.max(0, Math.min(1, cx - bw / 2));
  const normY = Math.max(0, Math.min(1, cy - bh / 2));
  const normW = Math.max(0.02, Math.min(1 - normX, bw));
  const normH = Math.max(0.02, Math.min(1 - normY, bh));

  const affectedArea = inferAffectedArea(cx, cy);
  const severity     = severityFromConfidence(confidence);

  return {
    damage_type:        damageType,
    affected_area:      affectedArea,
    severity,
    confidence,
    recommended_action: buildRecommendedAction(damageType, severity),
    bounding_box:       { x: normX, y: normY, width: normW, height: normH },
    image_index:        imageIndex,
  };
};

// ── Groq Vision prompt ─────────────────────────────────────────────────────────
const DAMAGE_PROMPT = `You are a professional vehicle damage inspector AI. Your job is to detect every visible scratch, dent, crack, or defect on the car in this photo.

IMPORTANT COORDINATE SYSTEM:
- x_center and y_center are the CENTER of the damage as a fraction from 0.0 (left/top) to 1.0 (right/bottom)
- width and height are the SIZE of the damage as a fraction of the full image (e.g. a scratch taking 30% of image width = 0.30)
- Be PRECISE — look at where in the image the damage actually is, not just guess

INSPECTION RULES:
1. Scan the ENTIRE image top-to-bottom, left-to-right
2. Report EACH scratch, dent, or scuff as a SEPARATE entry — even if they are the same type
3. Thin linear scratches: use a narrow height (0.02–0.05) and accurate width matching the scratch length
4. Do NOT merge multiple scratches into one box — each scratch gets its own entry
5. Include low-confidence detections (confidence >= 0.3) — it is better to over-report than miss damage
6. Reflections and shadows are NOT damage — ignore them

Return ONLY valid JSON, no markdown, no explanation:
{
  "vehicle_detected": true,
  "damages": [
    {
      "class": "scratch",
      "confidence": 0.90,
      "x_center": 0.25,
      "y_center": 0.35,
      "width": 0.18,
      "height": 0.03
    }
  ]
}

Valid class values: scratch, dent, crack, rust, paint_chip, scuff, paint_transfer, clear_coat_damage, shattered_glass, broken_light, flat_tire, deep_dent, faded_paint
If no vehicle is in photo: { "vehicle_detected": false, "damages": [] }
If vehicle is clean with no damage: { "vehicle_detected": true, "damages": [] }`;

// ── Groq Vision: analyze a single image ───────────────────────────────────────
const analyzeImageWithGroq = async (base64, imageIndex) => {
  const response = await groqClient.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` },
          },
          {
            type: 'text',
            text: DAMAGE_PROMPT,
          },
        ],
      },
    ],
    max_tokens: 2048,
    temperature: 0.05, // near-deterministic for structured output
  });

  const raw = response.choices?.[0]?.message?.content?.trim() || '';
  console.log(`[VisionAI] Groq raw response (img ${imageIndex + 1}):\n${raw.slice(0, 400)}`);

  // Strip potential markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error('[VisionAI] ❌ Failed to parse Groq JSON response:', parseErr.message);
    console.error('[VisionAI] Raw was:', raw.slice(0, 300));
    return { vehicle_detected: false, damages: [] };
  }

  return parsed;
};

// ── Public: analyze vehicle images with Groq Vision ───────────────────────────
/**
 * @param {Express.Multer.File[]} files      - Multer files with .buffer
 * @param {string[]}              angleHints - Optional per-image angle hints
 * @returns {Promise<{ damages: object[], vehicle_detected: boolean, summary: string, source: string }>}
 */
export const analyzeWithRoboflow = async (files, angleHints = []) => {
  if (!files || files.length === 0) throw new Error('No image files provided');

  if (!groqClient) {
    throw new Error('GROQ_API_KEY is not configured — cannot perform AI vision analysis');
  }

  const allDamages    = [];
  let vehicleDetected = false;

  for (let i = 0; i < files.length; i++) {
    const file      = files[i];
    const { base64 } = await resizeAndEncode(file);

    console.log(
      `[VisionAI] Analyzing image ${i + 1}/${files.length} ` +
      `(${file.originalname || 'image'}, ${(file.size / 1024).toFixed(1)} KB) via Groq Vision...`
    );

    const startTime = Date.now();
    let result;

    try {
      result = await analyzeImageWithGroq(base64, i);
      console.log(
        `[VisionAI] ✅ Groq response in ${Date.now() - startTime}ms — ` +
        `vehicle=${result.vehicle_detected}, raw_damages=${result.damages?.length ?? 0}`
      );
    } catch (err) {
      console.error(`[VisionAI] ❌ Groq Vision failed for image ${i + 1}:`, err.message);
      continue;
    }

    if (result.vehicle_detected) vehicleDetected = true;

    if (Array.isArray(result.damages) && result.damages.length > 0) {
      const imageDamages = result.damages
        .filter((d) => Number(d.confidence || 0) >= CONFIDENCE_THRESHOLD)
        .map((d) => normalizeLLMPrediction(d, i));

      console.log(
        `[VisionAI] ✅ ${imageDamages.length} damage(s) above threshold ${CONFIDENCE_THRESHOLD} ` +
        `(${result.damages.length - imageDamages.length} filtered out)`
      );
      allDamages.push(...imageDamages);
    }
  }

  // De-duplicate by damage_type + affected_area
  const unique = [];
  const seen   = new Set();
  for (const d of allDamages) {
    const key = `${d.damage_type}:${d.affected_area}`;
    if (!seen.has(key)) { seen.add(key); unique.push(d); }
  }

  const summary =
    unique.length > 0
      ? `AI detected ${unique.length} damage area(s): ` +
        unique.map((d) => `${d.damage_type} on ${d.affected_area}`).join(', ') + '.'
      : vehicleDetected
        ? 'Vehicle detected but no significant damage found.'
        : 'No vehicle or damage detected in the provided images.';

  return {
    damages:          unique,
    vehicle_detected: vehicleDetected || unique.length > 0,
    summary,
    source:           'groq_vision',
  };
};

// ── Public: check if vision AI is configured ──────────────────────────────────
export const isRoboflowAvailable = () => Boolean(GROQ_API_KEY);
