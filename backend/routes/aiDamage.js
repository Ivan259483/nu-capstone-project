/**
 * routes/aiDamage.js
 * POST /api/ai/analyze-damage
 *
 * Architecture: Frontend → Express backend → AI Vision (OpenAI GPT-4o-mini)
 * Demo fallback: If the API quota is exceeded, returns a realistic simulated
 * analysis so the capstone demo flow works flawlessly regardless of API limits.
 */
import express from 'express';
import OpenAI from 'openai';

const router = express.Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are an expert auto body inspector in the Philippines. 
Analyze the uploaded car image. Return a raw JSON object (NO markdown formatting, NO backticks) 
matching this exact structure:
{ "issues": [ { "name": "string", "severity": "Low" | "Medium" | "High", "cost": number } ], "totalEstimate": number }
Analyze the real damage seen in the photo. Keep costs realistic in Philippine Peso (PHP).`;

// ── Realistic damage pools for capstone demo simulation ────────────────────────
const HIGH_ISSUES = [
    { name: 'Paint Oxidation & Fading',      severity: 'High',   cost: 4500 },
    { name: 'Clear Coat Delamination',        severity: 'High',   cost: 6200 },
    { name: 'Deep Scratch (Quarter Panel)',   severity: 'High',   cost: 5800 },
    { name: 'Rust Formation (Undercarriage)', severity: 'High',   cost: 7000 },
    { name: 'Collision Dent (Front Bumper)',  severity: 'High',   cost: 8500 },
];
const MED_ISSUES = [
    { name: 'Surface Swirl Marks',           severity: 'Medium', cost: 2500 },
    { name: 'Paint Chip Cluster (Hood)',      severity: 'Medium', cost: 2200 },
    { name: 'Water Spot Etching',             severity: 'Medium', cost: 1800 },
    { name: 'Minor Door Ding',               severity: 'Medium', cost: 1500 },
    { name: 'Headlight Yellowing',            severity: 'Medium', cost: 1200 },
];
const LOW_ISSUES = [
    { name: 'Fine Micro-Scratches',          severity: 'Low',    cost: 800  },
    { name: 'Dust Contamination (Paint)',    severity: 'Low',    cost: 600  },
    { name: 'Bird Drop Etch Marks',          severity: 'Low',    cost: 500  },
    { name: 'Tar & Iron Deposit Build-Up',   severity: 'Low',    cost: 700  },
];

function buildSimulatedResponse(seed) {
    // Use the image base64 length as a repeatable seed for variation
    const s = seed % 3;

    const issues = [
        HIGH_ISSUES[seed % HIGH_ISSUES.length],
        HIGH_ISSUES[(seed + 1) % HIGH_ISSUES.length],
        MED_ISSUES[seed % MED_ISSUES.length],
        LOW_ISSUES[seed % LOW_ISSUES.length],
        ...(s === 0 ? [MED_ISSUES[(seed + 2) % MED_ISSUES.length]] : []),
    ];

    const totalEstimate = issues.reduce((sum, i) => sum + i.cost, 0);
    console.log('🧪 [AI Damage] Returning simulated analysis (API quota exceeded)');
    return { issues, totalEstimate };
}

// ── Route ──────────────────────────────────────────────────────────────────────
router.post('/analyze-damage', async (req, res) => {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || !mimeType) {
        return res.status(400).json({ success: false, message: 'imageBase64 and mimeType are required.' });
    }

    // ── Try real OpenAI vision first ─────────────────────────────────────────
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: SYSTEM_PROMPT },
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'low' } },
                ],
            }],
        });

        const rawText = response.choices[0]?.message?.content || '';
        const cleanJson = rawText.replace(/```json\n?|```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        console.log('✅ [AI Damage] OpenAI analysis returned successfully');
        return res.json({ success: true, data: parsed, source: 'openai' });

    } catch (apiError) {
        // ── Quota / network error → return realistic simulation ──────────────
        console.warn('⚠️  [AI Damage] OpenAI unavailable, using demo simulation:', apiError?.message?.substring(0, 80));

        const seed = imageBase64.length % 97; // deterministic, varies per image size
        const data = buildSimulatedResponse(seed);
        return res.json({ success: true, data, source: 'simulation' });
    }
});

export default router;
