/**
 * routes/aiDamage.js
 * POST /api/ai/analyze-damage
 *
 * Offline, rule-based vehicle damage assessment for the web estimator.
 */
import express from 'express';
import {
  buildLegacyDamageAssessment,
  buildOfflineImageContexts,
} from '../utils/offlineDamageEngine.utils.js';

const router = express.Router();

const toNumeric = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

router.post('/analyze-damage', async (req, res) => {
  const {
    imageBase64,
    mimeType,
    angle,
    damageArea,
    imageWidth,
    imageHeight,
    fileSize,
    fileName,
  } = req.body || {};

  if (!imageBase64 || !mimeType) {
    return res.status(400).json({
      success: false,
      message: 'imageBase64 and mimeType are required.',
    });
  }

  const estimatedBytes = toNumeric(fileSize) || Math.round((String(imageBase64).length * 3) / 4);
  const pseudoFile = {
    originalname: String(fileName || 'damage-upload.jpg'),
    mimetype: String(mimeType),
    size: estimatedBytes,
  };

  const contexts = buildOfflineImageContexts({
    files: [pseudoFile],
    angleHints: [String(angle || 'rear')],
    selectedAreas: [String(damageArea || '')],
    imageMeta: [{
      width: toNumeric(imageWidth),
      height: toNumeric(imageHeight),
      fileSize: estimatedBytes,
      fileName: String(fileName || 'damage-upload.jpg'),
      mimeType: String(mimeType),
      selectedDamageArea: String(damageArea || ''),
      angle: String(angle || 'rear'),
    }],
  });

  const data = buildLegacyDamageAssessment(contexts);
  return res.json({
    success: true,
    data: {
      issues: data.issues,
      totalEstimate: data.totalEstimate,
    },
    source: 'rule_based',
  });
});

export default router;
