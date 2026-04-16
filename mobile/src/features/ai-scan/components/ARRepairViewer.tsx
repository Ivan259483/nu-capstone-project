import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  FadeOut,
  interpolateColor,
  LinearTransition,
  SlideInDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { Palette } from '@/constants/theme';
import type { DamageIssue } from '@/features/ai-scan/types';
import { isValidGlbUrl } from '@/features/ai-scan/utils';

/* ══════════════════════════════════════════════════════════════════════════════
 * TYPES
 * ══════════════════════════════════════════════════════════════════════════════ */
type VisualMode = 'damaged' | 'repaired';

type LoadingPhase =
  | 'generating_3d'
  | 'preparing_ar'
  | 'loading_repair';

interface ARRepairViewerProps {
  modelStatus: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  modelProgress: number;
  modelUrl: string | null;
  repairedModelUrl?: string | null;
  issues: DamageIssue[];
  onRetry?: () => void;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * CONSTANTS & DESIGN TOKENS
 * ══════════════════════════════════════════════════════════════════════════════ */
const { width: SCREEN_W } = Dimensions.get('window');
const ACCENT = '#FF6B35';
const ACCENT_GLOW = 'rgba(255,107,53,0.35)';
const GOLD = '#D4A853';
const CARD_BG = '#0A0A0C';
const SURFACE = '#111114';

const SEVERITY_META: Record<string, { color: string; bg: string; border: string; icon: string }> = {
  severe:   { color: '#FF6B6B', bg: 'rgba(255,60,60,0.12)',  border: 'rgba(255,60,60,0.25)', icon: 'alert-circle' },
  moderate: { color: '#FFB347', bg: 'rgba(255,165,0,0.10)',  border: 'rgba(255,165,0,0.22)', icon: 'warning' },
  minor:    { color: '#60D394', bg: 'rgba(80,200,120,0.10)', border: 'rgba(80,200,120,0.22)', icon: 'information-circle' },
};

const LOADING_PHASES: { phase: LoadingPhase; label: string; sub: string; icon: string }[] = [
  { phase: 'generating_3d',  label: 'Generating 3D Model',      sub: 'Constructing vehicle mesh from scan data…', icon: 'cube-outline' },
  { phase: 'preparing_ar',   label: 'Preparing AR Simulation',   sub: 'Calibrating spatial anchors & lighting…',   icon: 'scan-outline' },
  { phase: 'loading_repair',  label: 'Loading Repair Preview',    sub: 'Mapping before & after repair states…',     icon: 'construct-outline' },
];

/* ══════════════════════════════════════════════════════════════════════════════
 * HOTSPOT POSITION MAPPER — Maps damage areas to precise 3D coordinates
 *
 * These map AI-detected `affectedArea` / `location` strings to positions
 * on a generic vehicle model. Positions are in model-viewer's 3D coordinate
 * system (meters): X = left/right, Y = up/down, Z = front/back.
 * ══════════════════════════════════════════════════════════════════════════════ */
const AREA_COORDINATE_MAP: Record<string, [number, number, number]> = {
  // Front — ToyCar faces +Z, approx 0.20m long
  'front bumper':      [0,     0.025, 0.095],
  'front panel':       [0,     0.035, 0.080],
  'hood':              [0,     0.055, 0.050],
  'grille':            [0,     0.028, 0.098],
  'left headlight':    [-0.035, 0.035, 0.090],
  'right headlight':   [0.035,  0.035, 0.090],
  'windshield':        [0,     0.070, 0.025],

  // Rear
  'rear bumper':       [0,     0.025, -0.095],
  'rear panel':        [0,     0.035, -0.080],
  'trunk':             [0,     0.050, -0.060],
  'tailgate':          [0,     0.040, -0.085],
  'left tail light':   [-0.035, 0.032, -0.090],
  'right tail light':  [0.035,  0.032, -0.090],

  // Left side
  'left fender':       [-0.050, 0.035, 0.045],
  'left door':         [-0.055, 0.040, 0.000],
  'left panel':        [-0.050, 0.035, -0.030],
  'left quarter panel':[-0.048, 0.035, -0.055],
  'left mirror':       [-0.058, 0.055, 0.018],
  'left bumper':       [-0.035, 0.025, 0.085],
  'left rocker':       [-0.050, 0.012, 0.000],

  // Right side
  'right fender':      [0.050,  0.035, 0.045],
  'right door':        [0.055,  0.040, 0.000],
  'right panel':       [0.050,  0.035, -0.030],
  'right quarter panel':[0.048, 0.035, -0.055],
  'right mirror':      [0.058,  0.055, 0.018],
  'right bumper':      [0.035,  0.025, 0.085],
  'right rocker':      [0.050,  0.012, 0.000],

  // Top
  'roof':              [0,     0.080, 0.000],
  'a-pillar':          [0.025, 0.072, 0.025],
  'b-pillar':          [0.028, 0.068, -0.010],
  'c-pillar':          [0.025, 0.065, -0.035],
};

/**
 * Converts an AI-detected area string → 3D position string.
 * Tries exact match first, then keyword fallback with intelligent staggering.
 */
const getHotspotPosition = (area: string, index: number): string => {
  const key = area.toLowerCase().trim();

  // Exact match
  if (AREA_COORDINATE_MAP[key]) {
    const [x, y, z] = AREA_COORDINATE_MAP[key];
    return `${x} ${y} ${z}`;
  }

  // Keyword fallback — scan for the best partial match
  for (const [mapKey, coords] of Object.entries(AREA_COORDINATE_MAP)) {
    const words = mapKey.split(' ');
    const matched = words.filter(w => key.includes(w)).length;
    if (matched >= 2 || (words.length === 1 && key.includes(words[0]))) {
      const jitter = (index * 0.005) % 0.015;
      return `${coords[0] + jitter} ${coords[1]} ${coords[2] - jitter}`;
    }
  }

  // Broad category fallback (ToyCar scale ~0.20m)
  const l = key;
  let base: [number, number, number] = [0, 0.04, 0];
  if (l.includes('front') || l.includes('hood') || l.includes('headlight'))       base = [0, 0.035, 0.080];
  else if (l.includes('rear') || l.includes('trunk') || l.includes('back'))       base = [0, 0.035, -0.080];
  else if (l.includes('roof') || l.includes('top'))                               base = [0, 0.080, 0];
  else if (l.includes('left') || l.includes('driver'))                            base = [-0.050, 0.035, 0];
  else if (l.includes('right') || l.includes('passenger'))                        base = [0.050, 0.035, 0];
  else if (l.includes('door') || l.includes('fender') || l.includes('panel'))     base = [index % 2 === 0 ? -0.050 : 0.050, 0.035, 0];
  else if (l.includes('bumper'))                                                  base = [0, 0.025, index % 2 === 0 ? 0.090 : -0.090];

  const xOff = ((index % 3) - 1) * 0.008;
  const zOff = (index % 2) * 0.006;
  return `${base[0] + xOff} ${base[1]} ${base[2] + zOff}`;
};

/* ══════════════════════════════════════════════════════════════════════════════
 * HTML TEMPLATE — model-viewer WebView content
 *
 * Features:
 *  • Dual src switching (damaged ↔ repaired GLB)
 *  • Hotspot pulsing markers with click handlers
 *  • Crossfade overlay animation on model switch
 *  • AR activation bridge
 *  • Bidirectional RN ↔ WebView messaging
 * ══════════════════════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════════════════════
 * FULL-SCREEN AR HTML — Used for the "View in Your Space" modal
 *
 * This renders inside a React Native Modal WebView, which correctly loads
 * ES modules (unlike SFSafariViewController). The model-viewer AR button
 * triggers Quick Look on iOS or Scene Viewer on Android natively.
 * ══════════════════════════════════════════════════════════════════════════════ */
const buildArHtml = (modelUrl: string): string => {
  const safeUrl = modelUrl.replace(/'/g, '%27');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"/>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: radial-gradient(ellipse at 50% 80%, rgba(255,107,53,0.08) 0%, #0A0A0C 60%);
      overflow: hidden;
    }
    model-viewer {
      width: 100%; height: 100%;
      --poster-color: transparent;
      background: transparent;
      outline: none;
    }
    /* AR / Quick Look button */
    .ar-btn {
      position: fixed;
      bottom: max(28px, env(safe-area-inset-bottom, 28px));
      left: 50%; transform: translateX(-50%);
      padding: 15px 32px;
      background: linear-gradient(135deg, #FF6B35 0%, #FF9A6C 100%);
      border: none; border-radius: 50px;
      color: #fff;
      font: 700 15px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.4px;
      box-shadow: 0 8px 28px rgba(255,107,53,0.5), 0 2px 8px rgba(0,0,0,0.4);
      cursor: pointer; z-index: 100;
      display: flex; align-items: center; gap: 8px;
      white-space: nowrap;
    }
    .ar-btn:active { opacity: 0.85; transform: translateX(-50%) scale(0.96); }
    .ar-btn svg { width: 18px; height: 18px; fill: none; stroke: #fff; stroke-width: 2; }

    /* Loading overlay */
    #splash {
      position: fixed; inset: 0; z-index: 200;
      background: #0A0A0C;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 16px;
      transition: opacity 0.5s ease;
    }
    #splash.hidden { opacity: 0; pointer-events: none; }
    .loader-ring {
      width: 48px; height: 48px;
      border: 3px solid rgba(255,107,53,0.2);
      border-top-color: #FF6B35;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .loader-text {
      color: rgba(255,255,255,0.5);
      font: 500 13px/1 -apple-system, sans-serif;
      letter-spacing: 0.3px;
    }

    /* Hint overlay */
    #hint {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(15,15,18,0.7);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(12px);
      border-radius: 20px;
      padding: 6px 14px;
      color: rgba(255,255,255,0.45);
      font: 500 11px/1 -apple-system, sans-serif;
      letter-spacing: 0.3px;
      z-index: 50;
      white-space: nowrap;
      opacity: 1; transition: opacity 1s ease 3s;
    }
    #hint.fade { opacity: 0; }
  </style>
</head>
<body>

  <!-- Loading splash -->
  <div id="splash">
    <div class="loader-ring"></div>
    <div class="loader-text">Loading 3D model…</div>
  </div>

  <!-- Hint -->
  <div id="hint">Drag to rotate  ·  Pinch to zoom</div>

  <model-viewer
    id="mv"
    src='${safeUrl}'
    alt="AutoSPF+ Vehicle 3D Model"
    ar
    ar-modes="webxr scene-viewer quick-look"
    camera-controls
    touch-action="pan-y"
    auto-rotate
    auto-rotate-delay="2000"
    rotation-per-second="8deg"
    shadow-intensity="2"
    shadow-softness="0.7"
    environment-image="neutral"
    exposure="1.1"
    camera-orbit="25deg 72deg auto"
    camera-target="0m 0m 0m"
    min-camera-orbit="auto auto 0.2m"
    max-camera-orbit="auto auto 3m"
    field-of-view="38deg"
    loading="eager"
  >
    <button slot="ar-button" class="ar-btn">
      <svg viewBox="0 0 24 24"><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8l4 2.3v4.4L12 17l-4-2.3V10.3L12 8z" stroke-linecap="round" stroke-linejoin="round"/></svg>
      View in Your Space
    </button>
  </model-viewer>

  <script>
    const mv = document.getElementById('mv');
    const splash = document.getElementById('splash');
    const hint = document.getElementById('hint');

    mv.addEventListener('load', () => {
      splash.classList.add('hidden');
      // Auto-fade hint after 3s
      setTimeout(() => hint.classList.add('fade'), 3000);
    });

    mv.addEventListener('error', () => {
      splash.querySelector('.loader-text').textContent = 'Failed to load model';
      splash.querySelector('.loader-ring').style.display = 'none';
    });
  </script>
</body>
</html>`;
};

const buildHtml = (
  modelUrl: string,
  _repairedModelUrl: string | null | undefined,
  issues: DamageIssue[]
): string => {
  const safeUrl = modelUrl.replace(/'/g, '%27');

  const hotspotsHtml = issues
    .map((issue, idx) => {
      const pos = getHotspotPosition(issue.location || issue.affectedArea, idx);
      const sevColor = SEVERITY_META[issue.severity]?.color || ACCENT;
      return `
      <button class="hotspot" slot="hotspot-${issue.id}"
        data-position="${pos}" data-normal="0 1 0"
        onclick="handleHotspotClick('${issue.id}')">
        <div class="hotspot-ring" style="--sev-color: ${sevColor}"></div>
        <div class="hotspot-dot" style="background: ${sevColor}"></div>
      </button>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"/>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%; height: 100%;
      background: radial-gradient(ellipse at 50% 120%, rgba(255,107,53,0.06) 0%, transparent 60%), #0A0A0C;
      overflow: hidden; touch-action: none;
    }
    model-viewer {
      width: 100%; height: 100%;
      --poster-color: transparent;
      background: transparent;
      outline: none;
      transition: opacity 0.5s ease;
    }
    model-viewer:focus { outline: none; }

    /* ── Crossfade Overlay ── */
    #crossfade {
      position: fixed; inset: 0; z-index: 999;
      background: #0A0A0C;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.35s ease;
    }
    #crossfade.active { opacity: 1; }

    /* ── Scan Line Sweep ── */
    #scanSweep {
      position: fixed; left: 0; right: 0;
      top: -4px; height: 4px; z-index: 1000;
      pointer-events: none; opacity: 0;
      background: linear-gradient(90deg, transparent 0%, #FF6B35 30%, #fff 50%, #FF6B35 70%, transparent 100%);
      box-shadow: 0 0 20px rgba(255,107,53,0.8), 0 0 60px rgba(255,107,53,0.3);
      transition: none;
    }
    #scanSweep.repaired {
      background: linear-gradient(90deg, transparent 0%, #10B981 30%, #fff 50%, #10B981 70%, transparent 100%);
      box-shadow: 0 0 20px rgba(16,185,129,0.8), 0 0 60px rgba(16,185,129,0.3);
    }
    @keyframes sweepDown {
      0%   { top: -4px; opacity: 0; }
      5%   { opacity: 1; }
      95%  { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }
    #scanSweep.active {
      animation: sweepDown 0.7s ease-in-out forwards;
    }

    /* ── Particle Container ── */
    #particles {
      position: fixed; inset: 0; z-index: 998;
      pointer-events: none; overflow: hidden;
    }
    .particle {
      position: absolute; width: 3px; height: 3px;
      border-radius: 50%; opacity: 0;
      background: #D4A853;
      box-shadow: 0 0 6px rgba(212,168,83,0.6);
    }
    @keyframes sparkle {
      0%   { transform: translateY(0) scale(0); opacity: 0; }
      15%  { opacity: 1; transform: translateY(-10px) scale(1); }
      100% { transform: translateY(-80px) scale(0.3); opacity: 0; }
    }

    /* ── Hotspot Markers ── */
    .hotspot {
      display: block; width: 32px; height: 32px;
      border: none; background: transparent;
      cursor: pointer; padding: 0;
      transform: translate(-50%, -50%);
      position: relative;
    }
    .hotspot:active { transform: translate(-50%, -50%) scale(0.85); }
    .hotspot-ring {
      position: absolute; inset: -4px;
      border-radius: 50%;
      border: 2px solid var(--sev-color, #FF6B35);
      opacity: 0.5;
      animation: ringPulse 2.5s ease-out infinite;
    }
    .hotspot-dot {
      width: 100%; height: 100%;
      border-radius: 50%;
      border: 2.5px solid rgba(255,255,255,0.9);
      box-shadow: 0 0 12px rgba(255,107,53,0.6), 0 0 4px rgba(255,255,255,0.4);
      animation: dotPulse 2s infinite;
    }
    @keyframes ringPulse {
      0%   { transform: scale(1);   opacity: 0.5; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes dotPulse {
      0%, 100% { box-shadow: 0 0 6px rgba(255,107,53,0.4); }
      50%      { box-shadow: 0 0 16px rgba(255,107,53,0.9), 0 0 6px rgba(255,255,255,0.5); }
    }

    /* ── Mode Badge ── */
    #modeBadge {
      position: fixed; bottom: 14px; left: 50%;
      transform: translateX(-50%);
      padding: 6px 18px; border-radius: 20px;
      background: rgba(10,10,12,0.75);
      border: 1px solid rgba(255,255,255,0.08);
      backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
      color: rgba(255,255,255,0.6);
      font: 500 11px/1 -apple-system, sans-serif;
      letter-spacing: 1px; text-transform: uppercase;
      opacity: 0; transition: opacity 0.4s ease;
      z-index: 1000; pointer-events: none;
    }
    #modeBadge.show { opacity: 1; }
  </style>
</head>
<body>
  <div id="crossfade"></div>
  <div id="scanSweep"></div>
  <div id="particles"></div>
  <div id="modeBadge">DAMAGED</div>
  <model-viewer
    id="viewer"
    src='${safeUrl}'
    alt="3D Vehicle – AI Damage Visualization"
    ar
    ar-modes="webxr scene-viewer quick-look"
    camera-controls
    touch-action="pan-y"
    auto-rotate
    auto-rotate-delay="2500"
    rotation-per-second="6deg"
    interaction-prompt="none"
    shadow-intensity="1.5"
    shadow-softness="0.8"
    environment-image="legacy"
    exposure="1.2"
    camera-orbit="30deg 72deg auto"
    camera-target="auto"
    min-camera-orbit="auto auto auto"
    max-camera-orbit="auto auto auto"
    field-of-view="38deg"
    loading="eager"
  >
    ${hotspotsHtml}
  </model-viewer>

  <script>
    const viewer = document.getElementById('viewer');
    const crossfade = document.getElementById('crossfade');
    const badge = document.getElementById('modeBadge');
    let currentMode = 'damaged';
    let materialsReady = false;
    let originalMaterials = [];

    const publish = (payload) => {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    };

    // Single load handler: auto-fit camera + cache materials + notify RN
    viewer.addEventListener('load', async () => {
      // Auto-fit: reset camera so the full model is visible regardless of scale
      try {
        viewer.resetTurntable && viewer.resetTurntable();
        viewer.jumpCameraToGoal && viewer.jumpCameraToGoal();
      } catch(e) {}

      // Cache original material state for toggling
      try {
        const model = viewer.model;
        if (model) {
          originalMaterials = [];
          for (let i = 0; i < model.materials.length; i++) {
            const mat = model.materials[i];
            const pbr = mat.pbrMetallicRoughness;
            originalMaterials.push({
              roughness: pbr.roughnessFactor,
              metallic: pbr.metallicFactor,
              baseColor: pbr.baseColorFactor ? [...pbr.baseColorFactor] : [1,1,1,1],
            });
          }
          materialsReady = true;
          // Apply damaged look initially
          applyDamagedMaterials();
        }
      } catch(e) { console.warn('Material init error:', e); }

      publish({ type: 'MODEL_LOADED' });
      showBadge(currentMode);
    });


    viewer.addEventListener('error', (e) => {
      publish({ type: 'MODEL_ERROR', detail: e?.message || 'load_failed' });
    });

    window.handleHotspotClick = (issueId) => {
      publish({ type: 'HOTSPOT_CLICKED', issueId });
    };

    function showBadge(mode) {
      badge.textContent = mode === 'repaired' ? '✨ REPAIRED' : '⚠ DAMAGED';
      badge.style.borderColor = mode === 'repaired'
        ? 'rgba(96,211,148,0.4)' : 'rgba(255,107,53,0.3)';
      badge.style.color = mode === 'repaired'
        ? 'rgba(96,211,148,0.85)' : 'rgba(255,179,71,0.85)';
      badge.classList.add('show');
      clearTimeout(badge._t);
      badge._t = setTimeout(() => badge.classList.remove('show'), 3000);
    }

    /* ── Material Manipulation: DAMAGED state ── */
    function applyDamagedMaterials() {
      if (!materialsReady) return;
      const model = viewer.model;
      for (let i = 0; i < model.materials.length; i++) {
        const mat = model.materials[i];
        const pbr = mat.pbrMetallicRoughness;
        const orig = originalMaterials[i];

        // Subtle roughness increase (simulates surface damage)
        pbr.setRoughnessFactor(Math.min(1.0, (orig.roughness || 0.5) + 0.15));
        pbr.setMetallicFactor(Math.max(0.0, (orig.metallic || 0.5) - 0.1));

        // Very slight desaturation only — keep model recognizable
        const bc = orig.baseColor;
        pbr.setBaseColorFactor([
          bc[0] * 0.92,
          bc[1] * 0.90,
          bc[2] * 0.88,
          bc[3]
        ]);
      }
      viewer.exposure = 1.0;
      viewer.shadowIntensity = 1.5;
    }

    /* ── Material Manipulation: REPAIRED state ── */
    function applyRepairedMaterials() {
      if (!materialsReady) return;
      const model = viewer.model;
      for (let i = 0; i < model.materials.length; i++) {
        const mat = model.materials[i];
        const pbr = mat.pbrMetallicRoughness;
        const orig = originalMaterials[i];

        // Restore to glossy, smooth finish (fresh paint, polished)
        pbr.setRoughnessFactor(Math.max(0.05, (orig.roughness || 0.5) * 0.3));
        pbr.setMetallicFactor(Math.min(1.0, (orig.metallic || 0.5) + 0.3));

        // Restore & slightly boost original colors (fresh detailing)
        const bc = orig.baseColor;
        pbr.setBaseColorFactor([
          Math.min(1.0, bc[0] * 1.08),
          Math.min(1.0, bc[1] * 1.06),
          Math.min(1.0, bc[2] * 1.05),
          bc[3]
        ]);
      }
      // Higher exposure = brighter, showroom feel
      viewer.exposure = 1.3;
      viewer.shadowIntensity = 2.0;
    }

    /* ── Particle Shower (golden sparkles on "repaired") ── */
    function spawnParticles(count) {
      const container = document.getElementById('particles');
      for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = (10 + Math.random() * 80) + '%';
        p.style.top  = (20 + Math.random() * 60) + '%';
        p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
        p.style.animation = 'sparkle ' + (0.8 + Math.random() * 0.6) + 's ease-out ' + (Math.random() * 0.4) + 's forwards';
        container.appendChild(p);
        // Cleanup
        setTimeout(() => p.remove(), 1800);
      }
    }

    /* ── Mode Transition with Scan Sweep + Particles ── */
    const applyMode = (mode) => {
      if (mode === currentMode) return;
      currentMode = mode;
      const repaired = mode === 'repaired';
      const sweep = document.getElementById('scanSweep');

      // Configure sweep color
      sweep.className = repaired ? 'repaired' : '';

      // Step 1: Brief crossfade
      crossfade.classList.add('active');

      // Step 2: Start sweep after slight delay
      setTimeout(() => {
        sweep.classList.add('active');
      }, 150);

      // Step 3: Apply material changes mid-sweep
      setTimeout(() => {
        if (repaired) {
          applyRepairedMaterials();
          spawnParticles(20); // golden sparkle shower
        } else {
          applyDamagedMaterials();
        }

        // Toggle hotspots visibility
        document.querySelectorAll('.hotspot').forEach(hs => {
          hs.style.display = repaired ? 'none' : 'block';
        });

        showBadge(mode);
      }, 400);

      // Step 4: Fade back in
      setTimeout(() => {
        crossfade.classList.remove('active');
      }, 650);

      // Step 5: Reset sweep
      setTimeout(() => {
        sweep.classList.remove('active', 'repaired');
        sweep.style.top = '-4px';
      }, 900);
    };

    window.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'SET_VISUAL_MODE') applyMode(data.mode);
        if (data.type === 'ACTIVATE_AR') {
          if (viewer.activateAR) viewer.activateAR();
        }
      } catch {}
    });
  </script>
</body>
</html>`;
};

/* ══════════════════════════════════════════════════════════════════════════════
 *  SEQUENTIAL LOADING COMPONENT — Premium multi-stage shimmer
 * ══════════════════════════════════════════════════════════════════════════════ */
function SequentialLoader({ progress }: { progress: number }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Advance phases based on progress thresholds
  useEffect(() => {
    if (progress >= 80) setPhaseIndex(2);
    else if (progress >= 35) setPhaseIndex(1);
    else setPhaseIndex(0);
  }, [progress]);

  // Elapsed timer
  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const ring   = useSharedValue(0);
  const breathe = useSharedValue(0);
  const barAnim = useSharedValue(0);

  useEffect(() => {
    ring.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1, false
    );
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1600, easing: Easing.inOut(Easing.ease) })
      ),
      -1, false
    );
  }, []);

  // Animate bar WIDTH smoothly
  useEffect(() => {
    barAnim.value = withTiming(progress, { duration: 600, easing: Easing.out(Easing.ease) });
  }, [progress]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.55 + breathe.value * 0.45,
    transform: [{ scale: 0.94 + breathe.value * 0.06 }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${barAnim.value}%` as any,
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ring.value * 360}deg` }],
    opacity: 0.15 + breathe.value * 0.1,
  }));

  const currentPhase = LOADING_PHASES[phaseIndex] || LOADING_PHASES[0];
  const eta = Math.max(0, Math.round(((100 - progress) / 100) * 180) - elapsed);
  const etaLabel = eta > 60
    ? `~${Math.round(eta / 60)}m ${eta % 60}s`
    : eta > 0 ? `~${eta}s` : 'Almost done…';

  return (
    <View style={sl.wrap}>

      {/* Ambient gradient */}
      <LinearGradient
        colors={['rgba(255,107,53,0.06)', 'transparent', 'rgba(255,107,53,0.03)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Spinning ring + icon */}
      <View style={sl.iconArea}>
        <Animated.View style={[sl.spinRing, ringStyle]} />
        <Animated.View style={[sl.iconWrap, iconStyle]}>
          <Ionicons name={currentPhase.icon as any} size={38} color={ACCENT} />
        </Animated.View>
      </View>

      {/* Phase label */}
      <Animated.Text
        entering={FadeIn.duration(250)}
        key={currentPhase.phase}
        style={sl.title}
      >
        {currentPhase.label}
      </Animated.Text>
      <Text style={sl.sub}>{currentPhase.sub}</Text>

      {/* Progress bar */}
      <View style={sl.barTrack}>
        <Animated.View style={[sl.barFill, barStyle]}>
          <LinearGradient
            colors={[ACCENT, '#FF9A6C']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </Animated.View>
      </View>

      {/* Progress stats row */}
      <View style={sl.statsRow}>
        <Text style={sl.pct}>{Math.round(progress)}%</Text>
        <Text style={sl.eta}>{etaLabel}</Text>
      </View>

      {/* Phase steps */}
      <View style={sl.steps}>
        {LOADING_PHASES.map((p, i) => {
          const done   = i < phaseIndex;
          const active = i === phaseIndex;
          return (
            <View key={p.phase} style={sl.stepRow}>
              <View style={[sl.dot, done && sl.dotDone, active && sl.dotActive]}>
                {done
                  ? <Ionicons name="checkmark" size={9} color="#fff" />
                  : active
                    ? <View style={sl.dotPulse} />
                    : null
                }
              </View>
              <Text style={[sl.stepLabel, done && sl.stepDone, active && sl.stepActive]}>
                {p.label}
              </Text>
              {active && (
                <View style={sl.activePill}>
                  <Text style={sl.activePillText}>IN PROGRESS</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* Powered by badge */}
      <View style={sl.badge}>
        <Ionicons name="sparkles" size={10} color={GOLD} />
        <Text style={sl.badgeText}>Powered by Meshy AI</Text>
      </View>
    </View>
  );
}


/* ══════════════════════════════════════════════════════════════════════════════
 *  IDLE STATE — When no model has been generated yet
 * ══════════════════════════════════════════════════════════════════════════════ */
function IdleView() {
  return (
    <View style={s.idleContainer}>
      <LinearGradient
        colors={['rgba(255,107,53,0.03)', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />
      <Ionicons name="cube-outline" size={52} color="rgba(255,255,255,0.08)" />
      <Text style={s.idleTitle}>3D Model Preview</Text>
      <Text style={s.idleSub}>
        Complete AI analysis to generate a 3D repair visualization
      </Text>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  FAILED STATE — With retry action
 * ══════════════════════════════════════════════════════════════════════════════ */
function FailedView({ onRetry }: { onRetry?: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(400)} style={s.failContainer}>
      <View style={s.failIconWrap}>
        <Ionicons name="warning-outline" size={36} color="rgba(255,107,53,0.5)" />
      </View>
      <Text style={s.failTitle}>3D Model Unavailable</Text>
      <Text style={s.failSub}>
        The repair simulation could not be rendered.{'\n'}
        Check your connection and try again.
      </Text>
      {onRetry && (
        <TouchableOpacity
          style={s.retryBtn}
          onPress={onRetry}
          activeOpacity={0.75}
        >
          <Ionicons name="refresh" size={15} color="#fff" />
          <Text style={s.retryText}>Retry Generation</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  HOTSPOT DETAIL CARD
 * ══════════════════════════════════════════════════════════════════════════════ */
function HotspotCard({
  issue,
  onClose,
}: {
  issue: DamageIssue;
  onClose: () => void;
}) {
  const sev = SEVERITY_META[issue.severity] || SEVERITY_META.minor;

  return (
    <Animated.View
      entering={SlideInDown.duration(200)}
      exiting={FadeOut.duration(200)}
      style={s.hotspotCardWrap}
    >
      <BlurView intensity={60} tint="dark" style={s.hotspotCard}>
        {/* Close */}
        <TouchableOpacity style={s.hotspotClose} onPress={onClose} activeOpacity={0.7}>
          <Ionicons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>

        {/* Header */}
        <View style={s.hotspotHeader}>
          <View style={s.hotspotTypeRow}>
            <View style={[s.hotspotSevDot, { backgroundColor: sev.color }]} />
            <Text style={s.hotspotTitle} numberOfLines={1}>
              {issue.damageType}
            </Text>
          </View>
          <View style={[s.sevBadge, { backgroundColor: sev.bg, borderColor: sev.border }]}>
            <Ionicons name={sev.icon as any} size={10} color={sev.color} />
            <Text style={[s.sevBadgeText, { color: sev.color }]}>
              {issue.severity.toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Location */}
        <View style={s.hotspotMetaRow}>
          <Ionicons name="location-outline" size={12} color="#777" />
          <Text style={s.hotspotMetaText}>{issue.affectedArea}</Text>
        </View>

        {/* Confidence */}
        {issue.confidence > 0 && (
          <View style={s.hotspotMetaRow}>
            <Ionicons name="analytics-outline" size={12} color="#777" />
            <Text style={s.hotspotMetaText}>
              {Math.round(issue.confidence * 100)}% detection confidence
            </Text>
          </View>
        )}

        {/* Recommended Action */}
        <View style={s.hotspotActionRow}>
          <Ionicons name="construct-outline" size={13} color={ACCENT} />
          <Text style={s.hotspotActionText} numberOfLines={2}>
            {issue.recommendedAction}
          </Text>
        </View>
      </BlurView>
    </Animated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  MAIN EXPORTED COMPONENT
 * ══════════════════════════════════════════════════════════════════════════════ */
export default function ARRepairViewer({
  modelStatus,
  modelProgress,
  modelUrl,
  repairedModelUrl,
  issues,
  onRetry,
}: ARRepairViewerProps) {
  const webViewRef = useRef<WebView>(null);
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [activeMode, setActiveMode] = useState<VisualMode>('damaged');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showArModal, setShowArModal] = useState(false);

  const selectedIssue = useMemo(
    () => issues.find(i => i.id === selectedIssueId) || null,
    [selectedIssueId, issues]
  );

  const modelReady = modelStatus === 'ready' && webViewLoaded && !modelError;

  // Build HTML when URLs change
  useEffect(() => {
    if (modelUrl && isValidGlbUrl(modelUrl)) {
      setWebViewLoaded(false);
      setModelError(false);
      setHtmlContent(buildHtml(modelUrl, repairedModelUrl, issues));
    }
  }, [modelUrl, repairedModelUrl, issues]);

  // Reset mode when model changes
  useEffect(() => {
    setActiveMode('damaged');
    setSelectedIssueId(null);
  }, [modelUrl]);

  /* ── WebView Message Handler ── */
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'MODEL_LOADED':
          setWebViewLoaded(true);
          setModelError(false);
          webViewRef.current?.injectJavaScript(
            `window.postMessage(JSON.stringify({ type: 'SET_VISUAL_MODE', mode: '${activeMode}' }), '*'); true;`
          );
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          break;

        case 'MODEL_ERROR':
          setModelError(true);
          setWebViewLoaded(false);
          break;

        case 'HOTSPOT_CLICKED':
          setSelectedIssueId(data.issueId);
          Haptics.selectionAsync().catch(() => {});
          break;
      }
    } catch {
      // silently ignore parse failures
    }
  }, [activeMode]);

  /* ── Mode Toggle ── */
  const handleToggleMode = useCallback((mode: VisualMode) => {
    if (mode === activeMode || transitioning) return;
    setTransitioning(true);
    setActiveMode(mode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (mode === 'repaired') setSelectedIssueId(null);

    webViewRef.current?.injectJavaScript(
      `window.postMessage(JSON.stringify({ type: 'SET_VISUAL_MODE', mode: '${mode}' }), '*'); true;`
    );

    // Unlock interaction after crossfade completes
    setTimeout(() => setTransitioning(false), 900);
  }, [activeMode, transitioning]);

  /* ── AR Launch — opens full-screen in-app WebView modal (works on iOS + Android) ── */
  const triggerAR = useCallback(() => {
    if (!modelReady || !modelUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setShowArModal(true);
  }, [modelReady, modelUrl]);

  /* ── WebView Navigation Interceptor (for AR intents & Quick Look) ── */
  const handleNavRequest = useCallback((request: any): boolean => {
    const { url } = request;

    // iOS: intercept blob/USDZ URLs (model-viewer Quick Look)
    if (
      Platform.OS === 'ios' &&
      (url.includes('.usdz') || url.startsWith('blob:'))
    ) {
      // Open USDZ in Safari for Quick Look
      if (url.includes('.usdz') && !url.startsWith('blob:')) {
        Linking.openURL(url).catch(() => {});
      }
      return false;
    }

    // Android: intercept Scene Viewer intent URLs
    if (
      url.startsWith('intent://') ||
      url.includes('arvr.google.com/scene-viewer') ||
      url.includes('arcore')
    ) {
      Linking.openURL(url).catch(() => {
        const httpsUrl = url.replace('intent://', 'https://').split('#')[0];
        Linking.openURL(httpsUrl).catch(() => {});
      });
      return false;
    }

    return true;
  }, []);

  /* ══════════════════════════════════════════════════════════════════════════
   *  RENDER
   * ══════════════════════════════════════════════════════════════════════════ */

  /* ── Full-screen AR Modal HTML ── */
  const arModalHtml = modelUrl ? buildArHtml(modelUrl) : '';

  // Idle state — no model generated yet
  if (modelStatus === 'idle') {
    return (
      <View style={s.container}>
        <IdleView />
      </View>
    );
  }

  // Failed / unavailable states
  if (modelStatus === 'failed' || modelStatus === 'unavailable' || modelError) {
    return (
      <View style={s.container}>
        <FailedView onRetry={onRetry} />
      </View>
    );
  }

  return (
    <View style={s.container}>

      {/* ── FULL-SCREEN AR MODAL ── */}
      <Modal
        visible={showArModal}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setShowArModal(false)}
      >
        <View style={s.arModal}>
          <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />

          {/* Header */}
          <View style={s.arModalHeader}>
            <View>
              <Text style={s.arModalTitle}>3D Vehicle Viewer</Text>
              <Text style={s.arModalSub}>Drag to orbit · Pinch to zoom</Text>
            </View>
            <TouchableOpacity
              style={s.arModalClose}
              onPress={() => setShowArModal(false)}
              activeOpacity={0.75}
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Full-screen model-viewer */}
          <WebView
            source={{ html: arModalHtml }}
            style={{ flex: 1, backgroundColor: '#0A0A0C' }}
            javaScriptEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            originWhitelist={['*']}
            scrollEnabled={false}
            bounces={false}
            onShouldStartLoadWithRequest={(req) => {
              const url = req.url;
              if (url.startsWith('intent://') || url.includes('arvr.google.com')) {
                Linking.openURL(url).catch(() => {});
                return false;
              }
              return true;
            }}
          />
        </View>
      </Modal>

      {/* ── WebView 3D Viewport ── */}
      <View style={s.viewerWrapper}>
        {htmlContent ? (
          <WebView
            ref={webViewRef}
            source={{ html: htmlContent }}
            style={s.webview}
            scrollEnabled={false}
            bounces={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            onMessage={handleMessage}
            onShouldStartLoadWithRequest={handleNavRequest}
            androidLayerType="hardware"
            originWhitelist={['*']}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
          />
        ) : null}

        {/* Loading Overlays */}
        {modelStatus === 'processing' && (
          <View style={s.loaderOverlay}>
            <SequentialLoader progress={modelProgress} />
          </View>
        )}
        {modelStatus === 'ready' && !webViewLoaded && !modelError && (
          <View style={s.loaderOverlay}>
            <ActivityIndicator size="small" color={ACCENT} />
            <Text style={s.inlineLoadText}>Initializing viewer…</Text>
          </View>
        )}
      </View>

      {/* ── MODE TOGGLE (Top) ── */}
      {modelReady && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={s.topBar}
        >
          <BlurView intensity={50} tint="dark" style={s.segmentWrap}>
            {(['damaged', 'repaired'] as VisualMode[]).map(mode => {
              const active = activeMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[s.segBtn, active && s.segBtnActive]}
                  onPress={() => handleToggleMode(mode)}
                  activeOpacity={0.75}
                  disabled={transitioning}
                >
                  <Ionicons
                    name={mode === 'damaged' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                    size={13}
                    color={active ? '#fff' : 'rgba(255,255,255,0.4)'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[s.segText, active && s.segTextActive]}>
                    {mode === 'damaged' ? 'BEFORE' : 'AFTER'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </BlurView>
        </Animated.View>
      )}

      {/* ── ISSUE COUNT BADGE ── */}
      {modelReady && issues.length > 0 && activeMode === 'damaged' && (
        <Animated.View entering={FadeIn.delay(500)} style={s.issueBadgeWrap}>
          <BlurView intensity={40} tint="dark" style={s.issueBadge}>
            <Ionicons name="flag-outline" size={11} color={ACCENT} />
            <Text style={s.issueBadgeText}>
              {issues.length} issue{issues.length !== 1 ? 's' : ''} detected
            </Text>
          </BlurView>
        </Animated.View>
      )}

      {/* ── HOTSPOT DETAIL CARD ── */}
      {selectedIssue && activeMode === 'damaged' && (
        <HotspotCard
          issue={selectedIssue}
          onClose={() => setSelectedIssueId(null)}
        />
      )}

      {/* ── BOTTOM CONTROLS ── */}
      {modelReady && (
        <Animated.View entering={FadeInUp.delay(350)} style={s.bottomBar}>
          <Text style={s.orbitHint}>
            Drag to orbit · Pinch to zoom · Tap markers
          </Text>
          <TouchableOpacity
            style={s.arBtn}
            activeOpacity={0.75}
            onPress={triggerAR}
          >
            <LinearGradient
              colors={['rgba(255,107,53,0.25)', 'rgba(255,107,53,0.10)']}
              style={s.arBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name="cube-outline" size={16} color="#fff" />
              <Text style={s.arBtnText}>View In Your Space</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 *  STYLES
 * ══════════════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  /* ── Container ── */
  container: {
    height: 500,
    backgroundColor: CARD_BG,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
    position: 'relative',
  },
  viewerWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  /* ── Loading ── */
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10,10,12,0.85)',
  },
  inlineLoadText: {
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    marginTop: 10,
  },

  /* ── Sequential Loader ── */
  loaderContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loaderIconWrap: {
    marginBottom: 16,
  },
  loaderTitle: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  loaderSub: {
    color: 'rgba(255,255,255,0.45)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 17,
  },
  progressTrack: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: ACCENT,
    borderRadius: 2,
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    marginTop: 6,
    letterSpacing: 1,
  },
  phaseSteps: {
    marginTop: 24,
    alignSelf: 'stretch',
    paddingHorizontal: 8,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  phaseDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  phaseDotDone: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  phaseDotActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,107,53,0.15)',
  },
  phaseLabel: {
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  phaseLabelDone: {
    color: 'rgba(255,255,255,0.5)',
  },
  phaseLabelActive: {
    color: '#fff',
  },

  /* ── Idle ── */
  idleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  idleTitle: {
    color: 'rgba(255,255,255,0.25)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    marginTop: 14,
    textAlign: 'center',
  },
  idleSub: {
    color: 'rgba(255,255,255,0.15)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 18,
  },

  /* ── Failed ── */
  failContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  failIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  failTitle: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    textAlign: 'center',
  },
  failSub: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 99,
    gap: 7,
  },
  retryText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },

  /* ── Top Bar / Mode Toggle ── */
  topBar: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: 20,
  },
  segmentWrap: {
    flexDirection: 'row',
    borderRadius: 99,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,15,18,0.70)',
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  segBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 99,
  },
  segBtnActive: {
    backgroundColor: 'rgba(255,107,53,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  segText: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Inter_700Bold',
    fontSize: 10.5,
    letterSpacing: 0.8,
  },
  segTextActive: {
    color: '#fff',
  },

  /* ── Issue Count Badge ── */
  issueBadgeWrap: {
    position: 'absolute',
    top: 58,
    right: 14,
    zIndex: 15,
  },
  issueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 99,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,15,18,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.15)',
    gap: 5,
  },
  issueBadgeText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    letterSpacing: 0.3,
  },

  /* ── Hotspot Detail Card ── */
  hotspotCardWrap: {
    position: 'absolute',
    bottom: 72,
    left: 14,
    right: 14,
    zIndex: 30,
  },
  hotspotCard: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: 'rgba(12,12,15,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.20)',
    overflow: 'hidden',
  },
  hotspotClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 2,
    padding: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
  },
  hotspotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingRight: 28,
  },
  hotspotTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hotspotSevDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 7,
  },
  hotspotTitle: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    flex: 1,
  },
  sevBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    gap: 4,
  },
  sevBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 8.5,
    letterSpacing: 0.6,
  },
  hotspotMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 5,
  },
  hotspotMetaText: {
    color: '#888',
    fontFamily: 'Inter_500Medium',
    fontSize: 11.5,
  },
  hotspotActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,107,53,0.08)',
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.15)',
    marginTop: 4,
    gap: 8,
  },
  hotspotActionText: {
    color: ACCENT,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    flex: 1,
    lineHeight: 16,
  },

  /* ── Bottom Bar ── */
  bottomBar: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  orbitHint: {
    color: 'rgba(255,255,255,0.35)',
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 0.2,
    flex: 1,
  },
  arBtn: {
    borderRadius: 99,
    overflow: 'hidden',
  },
  arBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.35)',
    gap: 6,
  },
  arBtnText: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 0.2,
  },

  /* ── Full-screen AR Modal ── */
  arModal: {
    flex: 1,
    backgroundColor: '#0A0A0C',
  },
  arModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight || 0) + 16,
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: 'rgba(10,10,12,0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  arModalTitle: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  arModalSub: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  arModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});


/* ── Sequential Loader Stylesheet ─────────────────────────────────────────── */
const sl = StyleSheet.create({
  wrap: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 20,
  },

  /* Icon area */
  iconArea: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  spinRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: ACCENT,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Labels */
  title: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    letterSpacing: 0.3,
    textAlign: 'center',
    marginBottom: 4,
  },
  sub: {
    color: 'rgba(255,255,255,0.4)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 22,
  },

  /* Progress bar */
  barTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 4,
  },

  /* Stats row */
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
    marginBottom: 24,
  },
  pct: {
    color: ACCENT,
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  eta: {
    color: 'rgba(255,255,255,0.3)',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },

  /* Phase steps */
  steps: {
    width: '100%',
    gap: 10,
    marginBottom: 20,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotDone: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  dotActive: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  dotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  stepLabel: {
    flex: 1,
    color: 'rgba(255,255,255,0.2)',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
  },
  stepDone: {
    color: 'rgba(255,255,255,0.5)',
  },
  stepActive: {
    color: '#fff',
    fontFamily: 'Inter_600SemiBold',
  },
  activePill: {
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
    borderRadius: 99,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  activePillText: {
    color: ACCENT,
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.8,
  },

  /* Powered by badge */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    opacity: 0.45,
  },
  badgeText: {
    color: GOLD,
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 0.3,
  },
});

