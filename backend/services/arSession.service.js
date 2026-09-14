/**
 * AR Launch Session Service — AutoSPF+
 * ════════════════════════════════════════════
 *
 * Builds the AR launch surface shared by every entry point that hands a
 * generated GLB/USDZ model to a customer's phone:
 *   - Android: a Google Scene Viewer URL (arvr.google.com/scene-viewer).
 *   - iPhone:  the USDZ file itself, opened via Apple AR Quick Look.
 *   - QR code: a short, device-sniffing `/api/ai/ar-launch?token=...` link
 *     (avoids iOS Linking.openURL failures on very long signed Meshy URLs,
 *     and avoids ever leaking an unvalidated host into a native AR launcher).
 *
 * Session tokens are held in-memory with a TTL — this mirrors an anonymous,
 * short-lived "share link" rather than durable state, so no persistence is
 * required. This module is the single source of truth for that Map; routes
 * and controllers must go through createArSession/getArSession rather than
 * keeping their own copy.
 */

import { randomBytes } from 'crypto';
import { config } from '../config/environment.js';

const arSessions = new Map(); // token → { modelUrl, repairedModelUrl, usdzUrl, sceneViewerUrl, damages, createdAt }
const AR_SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, data] of arSessions) {
    if (now - data.createdAt > AR_SESSION_TTL_MS) arSessions.delete(token);
  }
}, 5 * 60 * 1000);
cleanupTimer.unref?.();

export const buildSceneViewerUrl = (modelUrl) =>
  `https://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(modelUrl)}`;

export const getPublicOrigin = (req) => {
  if (config.publicApiOrigin) return config.publicApiOrigin;
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
};

export const buildLaunchUrl = (req, token) =>
  `${getPublicOrigin(req)}/api/ai/ar-launch?token=${encodeURIComponent(token)}`;

// Only allow AR asset URLs to point at hosts we actually serve models from —
// prevents a QR/redirect from being used to open an arbitrary attacker URL.
const AR_ASSET_ALLOWED_HOSTS = new Set([
  'nu-capstone-project.onrender.com',
  'assets.meshy.ai',
  'res.cloudinary.com',
  'storage.googleapis.com',
]);

const isLoopbackHostname = (hostname) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

export const normalizeArAssetUrl = (req, value) => {
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

export const normalizeArDamages = (damages) => (Array.isArray(damages) ? damages : [])
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

/**
 * Create a short-lived AR launch session for a ready GLB (+ optional USDZ).
 * Returns null when modelUrl fails host/protocol validation.
 */
export const createArSession = (req, { modelUrl, repairedModelUrl, usdzUrl, damages } = {}) => {
  const safeModelUrl = normalizeArAssetUrl(req, modelUrl);
  if (!safeModelUrl) return null;

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

  return {
    token,
    launchUrl,
    sceneViewerUrl,
    usdzUrl: safeUsdzUrl || '',
  };
};

export const getArSession = (token) => arSessions.get(String(token || '')) || null;

export default {
  buildSceneViewerUrl,
  getPublicOrigin,
  buildLaunchUrl,
  normalizeArAssetUrl,
  normalizeArDamages,
  createArSession,
  getArSession,
};
