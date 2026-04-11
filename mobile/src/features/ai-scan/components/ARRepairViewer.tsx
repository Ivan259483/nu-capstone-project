import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
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
  withSpring,
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
    rotation-per-second="8deg"
    interaction-prompt="none"
    shadow-intensity="1.8"
    shadow-softness="0.6"
    environment-image="neutral"
    exposure="0.85"
    camera-orbit="30deg 70deg 0.45m"
    camera-target="0m 0.035m 0m"
    min-camera-orbit="auto auto 0.2m"
    max-camera-orbit="auto auto 2m"
    field-of-view="40deg"
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

    viewer.addEventListener('load', async () => {
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

        // Make surface rough & dull (simulates scratches, oxidation, wear)
        pbr.setRoughnessFactor(Math.min(1.0, (orig.roughness || 0.5) + 0.35));
        pbr.setMetallicFactor(Math.max(0.0, (orig.metallic || 0.5) - 0.3));

        // Slightly desaturate / darken colors (sun damage, dirt, oxidation)
        const bc = orig.baseColor;
        pbr.setBaseColorFactor([
          bc[0] * 0.78,
          bc[1] * 0.75,
          bc[2] * 0.72,
          bc[3]
        ]);
      }
      // Lower exposure = dimmer, less pristine
      viewer.exposure = 0.7;
      viewer.shadowIntensity = 1.2;
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

  // Advance phases based on progress thresholds
  useEffect(() => {
    if (progress >= 80) setPhaseIndex(2);
    else if (progress >= 40) setPhaseIndex(1);
    else setPhaseIndex(0);
  }, [progress]);

  const shimmer = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + breathe.value * 0.5,
    transform: [{ scale: 0.92 + breathe.value * 0.08 }, { rotateY: `${shimmer.value * 15}deg` }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress}%`,
    opacity: 0.7 + shimmer.value * 0.3,
  }));

  const currentPhase = LOADING_PHASES[phaseIndex] || LOADING_PHASES[0];

  return (
    <View style={s.loaderContainer}>
      <LinearGradient
        colors={['rgba(255,107,53,0.04)', 'transparent', 'rgba(255,107,53,0.02)']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Phase Icon */}
      <Animated.View style={[s.loaderIconWrap, iconStyle]}>
        <Ionicons name={currentPhase.icon as any} size={44} color={ACCENT} />
      </Animated.View>

      {/* Phase Label */}
      <Animated.Text
        entering={FadeIn.duration(300)}
        key={currentPhase.phase}
        style={s.loaderTitle}
      >
        {currentPhase.label}
      </Animated.Text>
      <Text style={s.loaderSub}>{currentPhase.sub}</Text>

      {/* Progress Bar */}
      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, barStyle]} />
      </View>
      <Text style={s.progressLabel}>{progress}%</Text>

      {/* Phase Steps */}
      <View style={s.phaseSteps}>
        {LOADING_PHASES.map((p, i) => {
          const done = i < phaseIndex;
          const active = i === phaseIndex;
          return (
            <View key={p.phase} style={s.phaseRow}>
              <View style={[
                s.phaseDot,
                done && s.phaseDotDone,
                active && s.phaseDotActive,
              ]}>
                {done && <Ionicons name="checkmark" size={8} color="#fff" />}
              </View>
              <Text style={[
                s.phaseLabel,
                done && s.phaseLabelDone,
                active && s.phaseLabelActive,
              ]}>
                {p.label}
              </Text>
            </View>
          );
        })}
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
      entering={SlideInDown.springify().damping(18).stiffness(140)}
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

  /* ── AR Launch — Scene Viewer (Android) / Quick Look via Safari (iOS) ── */
  const triggerAR = useCallback(async () => {
    if (!modelReady || !modelUrl) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    try {
      if (Platform.OS === 'ios') {
        // iOS: Open the backend's AR viewer page in SFSafariViewController
        // SFSafariViewController is Safari-based, so it supports Quick Look AR
        const apiOrigin = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.18.164:3001').replace(/\/+$/, '').replace(/\/api$/, '');
        const arViewerUrl = `${apiOrigin}/api/ai/ar-viewer?src=${encodeURIComponent(modelUrl)}`;

        await WebBrowser.openBrowserAsync(arViewerUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          controlsColor: '#FF6B35',
        });
      } else {
        // Android: Scene Viewer intent
        const intentUrl =
          `intent://arvr.google.com/scene-viewer/1.0?` +
          `file=${encodeURIComponent(modelUrl)}` +
          `&mode=ar_preferred` +
          `&title=${encodeURIComponent('AutoSPF+ AR Repair')}` +
          `&resizable=true` +
          `#Intent;scheme=https;` +
          `package=com.google.android.googlequicksearchbox;` +
          `action=android.intent.action.VIEW;` +
          `S.browser_fallback_url=${encodeURIComponent(modelUrl)};end;`;
        await Linking.openURL(intentUrl);
      }
    } catch (err) {
      // Fallback: open the model URL directly
      try {
        await Linking.openURL(modelUrl);
      } catch {
        Alert.alert(
          'AR Not Available',
          Platform.OS === 'ios'
            ? 'Unable to open AR viewer. Make sure you are on the same Wi-Fi network as the server.'
            : 'Install Google Play Services for AR (ARCore) to use this feature.',
          [{ text: 'OK' }]
        );
      }
    }
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
          entering={FadeInDown.springify().damping(20)}
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
});
