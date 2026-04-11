/**
 * Gemini Vision AI — Vehicle Damage Detection
 *
 * Uses Google Gemini 2.0 Flash to analyze uploaded vehicle images
 * and return structured damage data (type, area, severity, bounding box).
 */
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const MODEL_ID = 'gemini-2.5-flash-lite';

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const SYSTEM_PROMPT = `You are an expert automotive damage assessment AI system for "AutoSPF+" — a premium car detailing and repair center in the Philippines.

Analyze the provided vehicle image(s) and detect ALL visible damage.

For EACH damage found, provide:
- damage_type: specific type (e.g. "Paint Scratch", "Dent", "Deep Dent", "Crack", "Surface Scuff", "Paint Chip", "Paint Transfer", "Clear Coat Damage", "Panel Misalignment", "Rust Spot", "Faded Paint")
- affected_area: specific location on vehicle (e.g. "Front Bumper", "Left Fender", "Right Panel", "Rear Bumper", "Trunk", "Left Headlight", "Right Tail Light", "Hood", "Roof", "Left Door Panel", "Right Door Panel", etc.)
- severity: "minor", "moderate", or "severe"
- confidence: 0.0 to 1.0
- recommended_action: specific repair instruction
- bounding_box: normalized coordinates { x, y, width, height } where values are 0.0-1.0 relative to image dimensions. x,y is top-left corner.
- image_index: which image (0-indexed) this damage is from

If the image does NOT show a vehicle or has NO visible damage, return an empty damages array.

RESPOND ONLY with valid JSON in this exact format:
{
  "damages": [
    {
      "damage_type": "string",
      "affected_area": "string",
      "severity": "minor|moderate|severe",
      "confidence": 0.0-1.0,
      "recommended_action": "string",
      "bounding_box": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 },
      "image_index": 0
    }
  ],
  "vehicle_detected": true,
  "summary": "Brief overall assessment"
}`;

/**
 * Convert a multer file buffer to Gemini inline image part
 */
const fileToImagePart = (file) => ({
  inlineData: {
    data: file.buffer.toString('base64'),
    mimeType: file.mimetype || 'image/jpeg',
  },
});

/**
 * Parse Gemini response text to JSON, handling markdown code blocks
 */
const parseGeminiResponse = (text) => {
  let cleaned = text.trim();

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('[GeminiVision] Failed to parse response:', cleaned.slice(0, 500));
    throw new Error(`Gemini returned invalid JSON: ${err.message}`);
  }
};

/**
 * Validate and normalize bounding box values
 */
const normalizeBBox = (box) => {
  if (!box || typeof box !== 'object') return null;
  const x = Math.max(0, Math.min(1, Number(box.x || 0)));
  const y = Math.max(0, Math.min(1, Number(box.y || 0)));
  const width = Math.max(0.02, Math.min(1 - x, Number(box.width || 0.1)));
  const height = Math.max(0.02, Math.min(1 - y, Number(box.height || 0.1)));
  return { x, y, width, height };
};

/**
 * Analyze vehicle images using Gemini Vision AI
 *
 * @param {Express.Multer.File[]} files - Array of uploaded image files with buffers
 * @param {string[]} angleHints - Optional angle hints for each image
 * @returns {Promise<{ damages: object[], vehicle_detected: boolean, summary: string }>}
 */
export const analyzeWithGemini = async (files, angleHints = []) => {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (!files || files.length === 0) {
    throw new Error('No image files provided');
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL_ID,
    safetySettings: SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.2,
      topP: 0.8,
      maxOutputTokens: 4096,
    },
  });

  // Build prompt with angle context
  let userPrompt = 'Analyze the following vehicle image(s) for damage:\n\n';
  angleHints.forEach((angle, index) => {
    if (angle) {
      userPrompt += `Image ${index + 1}: ${angle} angle\n`;
    }
  });
  userPrompt += '\nDetect ALL visible damage and return structured JSON.';

  // Build parts array: text + images
  const imageParts = files.map(fileToImagePart);
  const parts = [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }, ...imageParts];

  console.log(`[GeminiVision] Sending ${files.length} image(s) to ${MODEL_ID}...`);
  const startTime = Date.now();

  const result = await model.generateContent(parts);
  const response = result.response;
  const text = response.text();

  console.log(`[GeminiVision] Response received in ${Date.now() - startTime}ms`);

  const parsed = parseGeminiResponse(text);

  // Normalize all damages
  const damages = Array.isArray(parsed.damages)
    ? parsed.damages.map((d, index) => ({
        damage_type: String(d.damage_type || '').trim(),
        affected_area: String(d.affected_area || '').trim(),
        severity: ['minor', 'moderate', 'severe'].includes(d.severity) ? d.severity : 'moderate',
        confidence: Math.max(0, Math.min(1, Number(d.confidence || 0.85))),
        recommended_action: String(d.recommended_action || 'Inspect and repair').trim(),
        bounding_box: normalizeBBox(d.bounding_box),
        image_index: Number.isFinite(Number(d.image_index)) ? Number(d.image_index) : 0,
      })).filter(d => d.damage_type && d.affected_area)
    : [];

  return {
    damages,
    vehicle_detected: parsed.vehicle_detected !== false,
    summary: String(parsed.summary || 'Analysis complete'),
  };
};

/**
 * Check if Gemini Vision is available
 */
export const isGeminiAvailable = () => Boolean(GEMINI_API_KEY);
