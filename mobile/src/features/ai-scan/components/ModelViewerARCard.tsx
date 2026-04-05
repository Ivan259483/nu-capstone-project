import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { Palette } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type VisualMode = 'damaged' | 'repaired';

interface ModelViewerARCardProps {
  modelStatus: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  modelProgress: number;
  modelUrl: string | null;
  onRetry?: () => void;
}

const RING_RADIUS = 38;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/* ══════════════════════════════════════════════════════════════════════════════
 * HTML Template for model-viewer
 * ══════════════════════════════════════════════════════════════════════════════ */
const buildHtml = (modelUrl: string) => {
  const safeUrl = modelUrl.replace(/'/g, '%27');
  return `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js"></script>
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: #050506;
        overflow: hidden;
        touch-action: none;
      }
      model-viewer {
        width: 100%;
        height: 100%;
        --poster-color: transparent;
        background: radial-gradient(circle at center, #121218 0%, #070708 72%, #050506 100%);
        outline: none;
      }
      model-viewer:focus { outline: none; }
      #arButton {
        position: absolute;
        right: 14px;
        bottom: 14px;
        padding: 10px 16px;
        border-radius: 999px;
        border: 1px solid rgba(255,107,53,0.35);
        background: rgba(255,107,53,0.25);
        color: #fff;
        font: 600 13px -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
        cursor: pointer;
      }
      #arButton:active { transform: scale(0.96); }
      .interaction-hint {
        position: absolute;
        bottom: 58px;
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 14px;
        border-radius: 20px;
        background: rgba(0,0,0,0.65);
        border: 1px solid rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.65);
        font: 500 11px -apple-system, sans-serif;
        pointer-events: none;
        opacity: 1;
        transition: opacity 0.6s ease;
      }
      .interaction-hint.hidden { opacity: 0; }
    </style>
  </head>
  <body>
    <model-viewer
      id="viewer"
      src='${safeUrl}'
      alt="Generated 3D vehicle model"
      ar
      ar-modes="webxr scene-viewer quick-look"
      camera-controls
      touch-action="pan-y"
      auto-rotate
      auto-rotate-delay="1500"
      rotation-per-second="12deg"
      interaction-prompt="none"
      shadow-intensity="1.2"
      shadow-softness="0.8"
      environment-image="neutral"
      exposure="0.95"
      loading="eager"
    >
      <button slot="ar-button" id="arButton">View In Your Space</button>
    </model-viewer>
    <div id="hint" class="interaction-hint">Drag to rotate · Pinch to zoom</div>
    <script>
      const viewer = document.getElementById('viewer');
      const hint = document.getElementById('hint');
      const publish = (payload) => {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify(payload));
        }
      };

      viewer.addEventListener('load', () => {
        publish({ type: 'LOADED' });
        // Auto-hide rotation hint after 4s
        setTimeout(() => hint.classList.add('hidden'), 4000);
      });
      viewer.addEventListener('error', () => publish({ type: 'ERROR' }));
      viewer.addEventListener('camera-change', () => {
        // Hide hint on first interaction
        hint.classList.add('hidden');
      });

      const applyMode = (mode) => {
        const repaired = mode === 'repaired';
        viewer.exposure = repaired ? 1.22 : 0.92;
        if (viewer.model && viewer.model.materials) {
          viewer.model.materials.forEach((mat) => {
            const pbr = mat.pbrMetallicRoughness;
            if (pbr && pbr.setRoughnessFactor) {
              pbr.setRoughnessFactor(repaired ? 0.08 : 0.56);
            }
            if (mat.extensions && mat.extensions.KHR_materials_clearcoat) {
              const cc = mat.extensions.KHR_materials_clearcoat;
              if (cc.setClearcoatFactor) {
                cc.setClearcoatFactor(repaired ? 1.0 : 0.1);
              }
            }
          });
        }
      };

      window.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'SET_VISUAL_MODE') {
            applyMode(data.mode);
          }
          if (data.type === 'ACTIVATE_AR') {
            if (viewer.activateAR) viewer.activateAR();
          }
        } catch {}
      });
    </script>
  </body>
</html>
`;
};

/* ── Processing State ─────────────────────────────────────────────── */
function ProcessingView({ progress }: { progress: number }) {
  const pulse = useSharedValue(0);
  const dotPulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
    dotPulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const cubeStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: 0.9 + pulse.value * 0.15 },
      { rotateY: `${pulse.value * 45}deg` },
    ],
    opacity: 0.6 + pulse.value * 0.4,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotPulse.value,
  }));

  const normalizedProgress = Math.max(0, Math.min(100, progress));
  const dashOffset = RING_CIRCUMFERENCE * (1 - normalizedProgress / 100);

  // Determine processing stage label
  const stageLabel =
    normalizedProgress < 15 ? 'Uploading vehicle images...'
    : normalizedProgress < 40 ? 'Analyzing geometry & mesh...'
    : normalizedProgress < 65 ? 'Generating 3D surfaces...'
    : normalizedProgress < 85 ? 'Applying textures & materials...'
    : 'Finalizing model...';

  return (
    <Animated.View entering={FadeIn} style={styles.processingContainer}>
      {/* Progress ring */}
      <View style={styles.progressRingWrap}>
        <Svg width={100} height={100} style={{ transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={50}
            cy={50}
            r={RING_RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={4}
            strokeDasharray="4 6"
          />
          <Circle
            cx={50}
            cy={50}
            r={RING_RADIUS}
            fill="none"
            stroke={Palette.accent}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </Svg>

        <View style={styles.progressCenter}>
          <Animated.View style={cubeStyle}>
            <Ionicons name="cube" size={28} color={Palette.accent} />
          </Animated.View>
          <Text style={styles.progressPercent}>{normalizedProgress.toFixed(0)}%</Text>
        </View>
      </View>

      <Text style={styles.processingTitle}>Generating 3D Model</Text>
      <Text style={styles.processingSubtitle}>
        AI is reconstructing your vehicle for AR visualization
      </Text>

      {/* Status pipeline steps */}
      <View style={styles.pipelineRow}>
        {['Upload', 'Mesh', 'Texture', 'Finalize'].map((step, idx) => {
          const stepProgress = (idx + 1) * 25;
          const isActive = normalizedProgress >= stepProgress - 25 && normalizedProgress < stepProgress;
          const isDone = normalizedProgress >= stepProgress;
          return (
            <View key={step} style={styles.pipelineItem}>
              <View style={[
                styles.pipelineDot,
                isDone && styles.pipelineDotDone,
                isActive && styles.pipelineDotActive,
              ]}>
                {isDone ? (
                  <Ionicons name="checkmark" size={8} color="#fff" />
                ) : isActive ? (
                  <Animated.View style={dotStyle}>
                    <View style={styles.pipelineDotInner} />
                  </Animated.View>
                ) : null}
              </View>
              <Text style={[
                styles.pipelineLabel,
                isDone && styles.pipelineLabelDone,
                isActive && styles.pipelineLabelActive,
              ]}>
                {step}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Current stage detail */}
      <View style={styles.stageRow}>
        <Ionicons name="information-circle-outline" size={12} color="#6a6a75" />
        <Text style={styles.stageText}>{stageLabel}</Text>
      </View>
    </Animated.View>
  );
}

/* ── Failed State ─────────────────────────────────────────────────── */
function FailedView({ onRetry }: { onRetry?: () => void }) {
  return (
    <Animated.View entering={FadeInDown} style={styles.failedContainer}>
      <View style={styles.failedIconWrap}>
        <Ionicons name="warning-outline" size={28} color={Palette.danger} />
      </View>
      <Text style={styles.failedTitle}>3D Generation Failed</Text>
      <Text style={styles.failedSubtitle}>
        Unable to generate the 3D model. You can retry or continue with the estimate.
      </Text>
      {onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Ionicons name="refresh-outline" size={14} color="#fff" />
          <Text style={styles.retryText}>Retry Generation</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

/* ── Unavailable State ────────────────────────────────────────────── */
function UnavailableView() {
  return (
    <Animated.View entering={FadeIn} style={styles.unavailableContainer}>
      <View style={styles.unavailableIconWrap}>
        <Ionicons name="cube-outline" size={24} color="#5a5a65" />
      </View>
      <Text style={styles.unavailableTitle}>3D Model Not Available</Text>
      <Text style={styles.unavailableSubtitle}>
        3D model generation is not configured. You can still continue with repair estimate.
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
        <Ionicons name="information-circle-outline" size={12} color="#555" />
        <Text style={{ color: '#555', fontSize: 10, letterSpacing: 0.3 }}>
          Configure MESHY_API_KEY to enable 3D scanning
        </Text>
      </View>
    </Animated.View>
  );
}

/* ── Ready State (Full Model Viewer) ──────────────────────────────── */
function ReadyView({ modelUrl }: { modelUrl: string }) {
  const webRef = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<VisualMode>('damaged');
  const html = useMemo(() => buildHtml(modelUrl), [modelUrl]);

  const sendToViewer = (payload: unknown) => {
    webRef.current?.postMessage(JSON.stringify(payload));
  };

  const applyMode = async (nextMode: VisualMode) => {
    setMode(nextMode);
    sendToViewer({ type: 'SET_VISUAL_MODE', mode: nextMode });
    await Haptics.selectionAsync();
  };

  return (
    <Animated.View entering={FadeIn} style={styles.readyContainer}>
      {/* Header row: AR badge + model info */}
      <View style={styles.readyHeader}>
        <View style={styles.modelInfoRow}>
          <Ionicons name="cube" size={16} color={Palette.accent} />
          <View>
            <Text style={styles.modelInfoTitle}>3D Vehicle Model</Text>
            <Text style={styles.modelInfoSub}>Interactive • Auto-rotating</Text>
          </View>
        </View>
        <Animated.View entering={FadeInDown.delay(300)} style={styles.arReadyBadge}>
          <View style={styles.arReadyDot} />
          <Text style={styles.arReadyText}>AR READY</Text>
        </Animated.View>
      </View>

      {/* 3D Viewer */}
      <View style={styles.viewerFrame}>
        <WebView
          ref={webRef}
          source={{ html }}
          style={styles.webView}
          javaScriptEnabled
          mixedContentMode="always"
          allowsInlineMediaPlayback
          onLoadEnd={() => {
            setLoaded(true);
            sendToViewer({ type: 'SET_VISUAL_MODE', mode: 'damaged' });
          }}
          onMessage={(event) => {
            try {
              const payload = JSON.parse(event.nativeEvent.data) as { type?: string };
              if (payload.type === 'LOADED') setLoaded(true);
            } catch {}
          }}
        />

        {/* GLB Loading overlay */}
        {!loaded && (
          <View style={styles.loadingOverlay}>
            <View style={styles.loadingSpinnerWrap}>
              <ActivityIndicator size="small" color={Palette.accent} />
            </View>
            <Text style={styles.loadingTitle}>Loading 3D Model</Text>
            <Text style={styles.loadingSubtitle}>Downloading GLB asset...</Text>
          </View>
        )}
      </View>

      {/* Interaction hint */}
      {loaded && (
        <Animated.View entering={FadeIn.delay(500)} style={styles.interactionHint}>
          <Ionicons name="finger-print-outline" size={12} color="#8a8a96" />
          <Text style={styles.interactionHintText}>Drag to rotate · Pinch to zoom</Text>
        </Animated.View>
      )}

      {/* Visual mode toggle */}
      <BlurView intensity={55} tint="dark" style={styles.controlRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'damaged' && styles.modeBtnActive]}
          onPress={() => applyMode('damaged')}
        >
          <Ionicons name="alert-circle-outline" size={14} color={mode === 'damaged' ? Palette.accent : '#888'} />
          <Text style={[styles.modeText, mode === 'damaged' && styles.modeTextActive]}>Damage View</Text>
        </TouchableOpacity>
        <View style={styles.modeDivider} />
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'repaired' && styles.modeBtnActive]}
          onPress={() => applyMode('repaired')}
        >
          <Ionicons name="sparkles-outline" size={14} color={mode === 'repaired' ? Palette.accent : '#888'} />
          <Text style={[styles.modeText, mode === 'repaired' && styles.modeTextActive]}>Repaired View</Text>
        </TouchableOpacity>
      </BlurView>

      {/* AR Launch */}
      <TouchableOpacity
        style={styles.launchArBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          sendToViewer({ type: 'ACTIVATE_AR' });
        }}
      >
        <Ionicons name="phone-portrait-outline" size={16} color="#fff" />
        <Text style={styles.launchArText}>View In Your Space</Text>
        <View style={styles.arBtnChevron}>
          <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.5)" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
export default function ModelViewerARCard({
  modelStatus,
  modelProgress,
  modelUrl,
  onRetry,
}: ModelViewerARCardProps) {
  // CRITICAL GUARD: Block rendering if URL is not a valid .glb file
  if (modelStatus === 'ready' && modelUrl) {
    const cleanedPath = modelUrl.split('?')[0].split('#')[0].toLowerCase().trim();
    const isGlb = cleanedPath.endsWith('.glb')
      && (modelUrl.startsWith('http://') || modelUrl.startsWith('https://'));

    if (!isGlb) {
      console.error(
        '[ModelViewerARCard] BLOCKED non-GLB URL from rendering:',
        modelUrl,
      );
      return <FailedView onRetry={onRetry} />;
    }

    return <ReadyView modelUrl={modelUrl} />;
  }

  if (modelStatus === 'processing') {
    return <ProcessingView progress={modelProgress} />;
  }

  if (modelStatus === 'failed') {
    return <FailedView onRetry={onRetry} />;
  }

  if (modelStatus === 'unavailable') {
    return <UnavailableView />;
  }

  return null;
}

/* ══════════════════════════════════════════════════════════════════════════════
 * STYLES
 * ══════════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  /* ── Processing ──────────────────────────────────── */
  processingContainer: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0a0a10',
  },
  progressRingWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  progressPercent: {
    color: Palette.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  processingTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  processingSubtitle: {
    color: '#8a8a96',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },

  /* Pipeline steps */
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginTop: 6,
    paddingHorizontal: 6,
  },
  pipelineItem: {
    alignItems: 'center',
    gap: 5,
  },
  pipelineDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipelineDotDone: {
    backgroundColor: 'rgba(16,185,129,0.3)',
    borderColor: 'rgba(16,185,129,0.6)',
  },
  pipelineDotActive: {
    backgroundColor: 'rgba(255,107,53,0.2)',
    borderColor: 'rgba(255,107,53,0.5)',
  },
  pipelineDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.accent,
  },
  pipelineLabel: {
    color: '#5a5a65',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  pipelineLabelDone: {
    color: Palette.success,
  },
  pipelineLabelActive: {
    color: Palette.accent,
  },

  /* Stage detail */
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  stageText: {
    color: '#6a6a75',
    fontSize: 10,
    fontWeight: '500',
  },

  /* ── Failed ──────────────────────────────────────── */
  failedContainer: {
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,76,76,0.2)',
    backgroundColor: '#0a0a10',
  },
  failedIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,76,76,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  failedTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  failedSubtitle: {
    color: '#9a9aa6',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,53,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.35)',
    marginTop: 4,
  },
  retryText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  /* ── Unavailable ─────────────────────────────────── */
  unavailableContainer: {
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0a0a10',
  },
  unavailableIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  unavailableTitle: {
    color: '#8a8a96',
    fontSize: 14,
    fontWeight: '700',
  },
  unavailableSubtitle: {
    color: '#6a6a75',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },

  /* ── Ready ───────────────────────────────────────── */
  readyContainer: {
    gap: 10,
  },
  readyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelInfoTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  modelInfoSub: {
    color: '#6a6a75',
    fontSize: 10,
    fontWeight: '500',
  },
  arReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.45)',
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  arReadyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.success,
  },
  arReadyText: {
    color: Palette.success,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  viewerFrame: {
    height: 320,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#070708',
  },
  webView: {
    flex: 1,
    backgroundColor: '#070708',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,5,6,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingSpinnerWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,107,53,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  loadingTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingSubtitle: {
    color: '#6a6a75',
    fontSize: 11,
    fontWeight: '500',
  },

  /* Interaction hint */
  interactionHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  interactionHintText: {
    color: '#6a6a75',
    fontSize: 10,
    fontWeight: '500',
  },

  /* Mode toggle */
  controlRow: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 6,
  },
  modeBtnActive: {
    backgroundColor: 'rgba(255,107,53,0.14)',
  },
  modeDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modeText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
  },
  modeTextActive: {
    color: Palette.accent,
    fontWeight: '800',
  },

  /* AR Launch */
  launchArBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.35)',
    backgroundColor: 'rgba(255,107,53,0.16)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    shadowColor: Palette.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  launchArText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    flex: 1,
    textAlign: 'center',
  },
  arBtnChevron: {
    position: 'absolute',
    right: 14,
  },
});
