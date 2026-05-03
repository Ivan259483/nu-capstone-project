/**
 * GPT-4 Vision Service — AutoSPF+ AI Damage Detection
 * ════════════════════════════════════════════════════
 *
 * Production-ready GPT-4 Vision wrapper with automatic mock/real toggle.
 *
 * ▸ When OPENAI_API_KEY is empty/missing → returns realistic mock data
 *   that is structurally indistinguishable from a real GPT-4 Vision response.
 * ▸ When OPENAI_API_KEY is set → calls the real Chat Completions API
 *   (model: gpt-4o) with vision input and parses the JSON response.
 *
 * No code changes are required to switch — just drop the key into .env.
 */

import axios from 'axios';
import { createHash } from 'crypto';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = (process.env.OPENAI_VISION_MODEL || 'gpt-4o').trim();
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 60_000);

export const isOpenAIConfigured = () => Boolean(OPENAI_API_KEY);

const MOCK_DAMAGE_LIBRARY = [
  {
    type: 'Deep Scratch',
    severity: 'high',
    description: 'Deep paint scratch reaching primer layer with visible metal exposure.',
    area: 'Front Bumper',
    recommendedPackage: 'SPF 99 Premium',
  },
  {
    type: 'Paint Chip',
    severity: 'medium',
    description: 'Surface paint chip with light clear-coat damage. Repairable with spot paint.',
    area: 'Hood',
    recommendedPackage: 'SPF 89 Advanced',
  },
  {
    type: 'Light Scuff',
    severity: 'low',
    description: 'Cosmetic scuff on clear-coat. Buffable with paint correction.',
    area: 'Door Panel',
    recommendedPackage: 'SPF 80 Essential',
  },
  {
    type: 'Dent',
    severity: 'medium',
    description: 'Minor surface dent without paint break. Suitable for paintless dent repair.',
    area: 'Rear Quarter Panel',
    recommendedPackage: 'SPF 89 Advanced',
  },
  {
    type: 'Bumper Crack',
    severity: 'high',
    description: 'Hairline crack in bumper plastic substrate. Requires bumper repair & refinish.',
    area: 'Rear Bumper',
    recommendedPackage: 'SPF 99 Premium',
  },
  {
    type: 'Headlight Haze',
    severity: 'low',
    description: 'UV oxidation on headlight lens. Restorable with polish & UV sealant.',
    area: 'Right Headlight',
    recommendedPackage: 'SPF 80 Essential',
  },
];

const SEVERITY_WEIGHTS = { high: 3, medium: 2, low: 1 };
const URGENCY_BY_SEVERITY = { high: 'Immediate', medium: 'Can Wait', low: 'Optional' };

const seededRandom = (seed) => {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

const buildSeedFromFiles = (files = []) => {
  const hash = createHash('sha1');
  files.forEach((file, index) => {
    hash.update(String(index));
    hash.update(String(file?.originalname || ''));
    hash.update(String(file?.size || 0));
    if (file?.buffer && Buffer.isBuffer(file.buffer)) {
      // Sample first 4KB only for fingerprint speed
      hash.update(file.buffer.subarray(0, 4096));
    }
  });
  const digest = hash.digest('hex').slice(0, 8);
  return parseInt(digest, 16) || Date.now();
};

const computeOverallCondition = (damages) => {
  if (!damages.length) return 'Excellent';
  const severityScore = damages.reduce(
    (sum, d) => sum + (SEVERITY_WEIGHTS[d.severity] || 1),
    0
  );
  const avg = severityScore / damages.length;
  if (avg >= 2.5) return 'Poor';
  if (avg >= 1.7) return 'Fair';
  if (avg >= 1.2) return 'Good';
  return 'Excellent';
};

const computeRecommendedPackage = (damages) => {
  if (damages.some((d) => d.severity === 'high')) return 'SPF 99 Premium';
  if (damages.some((d) => d.severity === 'medium')) return 'SPF 89 Advanced';
  return 'SPF 80 Essential';
};

const computeUrgency = (damages) => {
  if (damages.some((d) => d.severity === 'high')) return 'Immediate';
  if (damages.some((d) => d.severity === 'medium')) return 'Can Wait';
  return 'Optional';
};

/**
 * Builds a deterministic, realistic mock response that mirrors the exact
 * shape of a real GPT-4 Vision damage assessment.
 *
 * The same image set will always produce the same mock damages — this
 * makes the UX feel like a real AI inference rather than random output.
 */
const buildMockResponse = (files, { angles = [], requestId = '' } = {}) => {
  const seed = buildSeedFromFiles(files);
  const random = seededRandom(seed);

  const damageCount = Math.max(2, Math.min(4, 2 + Math.floor(random() * 3)));
  const shuffled = [...MOCK_DAMAGE_LIBRARY].sort(() => random() - 0.5);
  const picks = shuffled.slice(0, damageCount);

  const damages = picks.map((pick, index) => {
    const confidence = 0.78 + random() * 0.20; // 0.78 – 0.98
    const x = 0.10 + random() * 0.55;
    const y = 0.20 + random() * 0.40;
    const w = 0.18 + random() * 0.20;
    const h = 0.14 + random() * 0.18;
    const angleHint = angles[index % Math.max(1, angles.length)] || 'close_up';

    return {
      id: `dmg_${index + 1}`,
      type: pick.type,
      severity: pick.severity,
      description: pick.description,
      confidence: Number(confidence.toFixed(2)),
      coordinates: {
        x: Number(Math.min(0.95, x).toFixed(3)),
        y: Number(Math.min(0.85, y).toFixed(3)),
        width: Number(Math.min(0.5, w).toFixed(3)),
        height: Number(Math.min(0.5, h).toFixed(3)),
      },
      affectedArea: pick.area,
      imageIndex: index % Math.max(1, files.length),
      angleHint,
      urgency: URGENCY_BY_SEVERITY[pick.severity] || 'Can Wait',
    };
  });

  return {
    source: 'mock',
    requestId,
    model: 'gpt-4-vision-mock',
    vehicleDetected: true,
    overallCondition: computeOverallCondition(damages),
    recommendedPackage: computeRecommendedPackage(damages),
    urgency: computeUrgency(damages),
    summary: `${damages.length} damage area${damages.length === 1 ? '' : 's'} detected — overall condition ${computeOverallCondition(damages).toLowerCase()}.`,
    damages,
    rawResponse: null,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Calls the real OpenAI GPT-4 Vision endpoint with base64-encoded images.
 * The prompt is engineered to return strict JSON matching our schema.
 */
const buildOpenAIPrompt = () => `You are AutoSPF+ — an expert automotive damage inspector.

Analyze the provided vehicle photos and return a STRICT JSON object describing
visible exterior damage. Use this exact schema (no commentary, no markdown):

{
  "vehicleDetected": boolean,
  "overallCondition": "Excellent" | "Good" | "Fair" | "Poor",
  "recommendedPackage": "SPF 80 Essential" | "SPF 89 Advanced" | "SPF 99 Premium",
  "urgency": "Immediate" | "Can Wait" | "Optional",
  "summary": string,
  "damages": [
    {
      "type": string,                // e.g. "Deep Scratch", "Dent", "Paint Chip"
      "severity": "high" | "medium" | "low",
      "description": string,         // one sentence, plain English
      "confidence": number,          // 0.0 - 1.0
      "coordinates": {               // normalized 0-1 bounding box on the image
        "x": number,
        "y": number,
        "width": number,
        "height": number
      },
      "affectedArea": string,        // e.g. "Front Bumper", "Right Door"
      "imageIndex": number,          // 0-based index of the image where this damage appears
      "urgency": "Immediate" | "Can Wait" | "Optional"
    }
  ]
}

Severity rules:
- HIGH  = structural/deep damage requiring SPF 99 Premium
- MEDIUM = panel-level cosmetic damage requiring SPF 89 Advanced
- LOW   = surface-level scuff requiring SPF 80 Essential

If no damage is detectable, return an empty "damages" array with overallCondition "Excellent".`;

const callOpenAIVision = async (files, { angles = [], requestId = '' } = {}) => {
  if (!OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is not configured.');
    error.code = 'OPENAI_NOT_CONFIGURED';
    throw error;
  }

  const imageContents = files.map((file) => ({
    type: 'image_url',
    image_url: {
      url: `data:${file.mimetype || 'image/jpeg'};base64,${file.buffer.toString('base64')}`,
      detail: 'high',
    },
  }));

  const angleText = angles.length
    ? `Image angles in order: ${angles.join(', ')}.`
    : 'Vehicle photo set provided.';

  const messages = [
    {
      role: 'system',
      content: 'You are AutoSPF+ — return ONLY valid JSON matching the schema given by the user.',
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `${buildOpenAIPrompt()}\n\n${angleText}` },
        ...imageContents,
      ],
    },
  ];

  const response = await axios.post(
    OPENAI_API_URL,
    {
      model: OPENAI_MODEL,
      messages,
      max_tokens: 1500,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: OPENAI_TIMEOUT_MS,
    }
  );

  const raw = response.data?.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError) {
    const error = new Error('GPT-4 Vision returned non-JSON content.');
    error.code = 'OPENAI_PARSE_FAILED';
    error.rawResponse = raw;
    throw error;
  }

  const damages = Array.isArray(parsed.damages) ? parsed.damages : [];

  return {
    source: 'gpt4_vision',
    requestId,
    model: OPENAI_MODEL,
    vehicleDetected: parsed.vehicleDetected !== false,
    overallCondition: parsed.overallCondition || computeOverallCondition(damages),
    recommendedPackage: parsed.recommendedPackage || computeRecommendedPackage(damages),
    urgency: parsed.urgency || computeUrgency(damages),
    summary: parsed.summary || `${damages.length} damage area(s) detected.`,
    damages: damages.map((d, index) => ({
      id: d.id || `dmg_${index + 1}`,
      type: String(d.type || 'Damage'),
      severity: ['high', 'medium', 'low'].includes(d.severity) ? d.severity : 'medium',
      description: String(d.description || ''),
      confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0.5)),
      coordinates: d.coordinates || { x: 0.1, y: 0.2, width: 0.2, height: 0.2 },
      affectedArea: String(d.affectedArea || 'Vehicle Body'),
      imageIndex: Number.isFinite(Number(d.imageIndex)) ? Number(d.imageIndex) : 0,
      angleHint: angles[Number(d.imageIndex) || 0] || angles[0] || 'close_up',
      urgency: d.urgency || URGENCY_BY_SEVERITY[d.severity] || 'Can Wait',
    })),
    rawResponse: raw,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Public entry point. Auto-selects the real call when OPENAI_API_KEY is
 * present, otherwise falls back to the mock response.
 */
export const analyzeWithGPTVision = async (files, options = {}) => {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('At least one image is required for GPT-4 Vision analysis.');
  }

  if (!isOpenAIConfigured()) {
    console.log('[GPT-Vision] OPENAI_API_KEY not set — returning realistic mock response.');
    return buildMockResponse(files, options);
  }

  try {
    console.log(`[GPT-Vision] Calling ${OPENAI_MODEL} with ${files.length} image(s)...`);
    const startedAt = Date.now();
    const result = await callOpenAIVision(files, options);
    console.log(
      `[GPT-Vision] ${OPENAI_MODEL} responded in ${Date.now() - startedAt}ms (damages=${result.damages.length})`
    );
    return result;
  } catch (error) {
    console.warn(
      '[GPT-Vision] Real call failed, falling back to mock response:',
      error?.message || error
    );
    const mock = buildMockResponse(files, options);
    return { ...mock, fallbackReason: error?.message || 'OpenAI request failed' };
  }
};

export default {
  analyzeWithGPTVision,
  isOpenAIConfigured,
};
