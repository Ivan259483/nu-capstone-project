import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeInUp,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import type { DamageIssue } from '../types';

/* ══════════════════════════════════════════════════════════════════════════════
 * PREMIUM Before / After Repair Slider v4
 *
 * Luxury automotive-grade UI for repair visualization.
 * Features:
 *  • Glassmorphic slider handle with breathing glow + drag hint chip
 *  • Animated side labels with frosted glass badges
 *  • Pulsing damage zone markers on the BEFORE side
 *  • Smart fallback simulation when FLUX unavailable
 *  • Auto-reveal entrance animation (spring)
 *  • Haptic feedback on drag start + edges
 *  • Bottom stats strip (issues / confidence / severity / source)
 *  • Single GestureDetector wrapping the full touch area (no conflicts)
 * ══════════════════════════════════════════════════════════════════════════════ */

/* ── Design Tokens ─────────────────────────────────────────────────────────── */
const ACCENT      = '#FF6B35';
const GREEN       = '#10B981';
const RED_TAG     = '#FF5252';
const GREEN_TAG   = '#00E676';
const GOLD        = '#D4A853';
const SURFACE     = '#08080C';

const SEVERITY_COLOR: Record<string, string> = {
  severe:   '#FF6B6B',
  moderate: '#FFB347',
  minor:    '#60D394',
};

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface BeforeAfterSliderProps {
  beforeUri: string;
  afterUri?: string | null;
  repairStatus?: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  repairProgress?: number;
  width: number;
  issues?: DamageIssue[];
}

const IMAGE_ASPECT = 3 / 4;

/* ══════════════════════════════════════════════════════════════════════════════
 * SUB-COMPONENT: Processing Pipeline Overlay
 * ══════════════════════════════════════════════════════════════════════════════ */
const STAGES = [
  { label: 'Analyzing damage zones…',     icon: 'scan-outline'          as const, t: 0  },
  { label: 'Matching paint code (PPG)…',  icon: 'color-palette-outline' as const, t: 15 },
  { label: 'AI surface reconstruction…',  icon: 'construct-outline'     as const, t: 35 },
  { label: 'Body alignment mapping…',     icon: 'git-merge-outline'     as const, t: 55 },
  { label: 'Final compositing…',          icon: 'sparkles-outline'      as const, t: 75 },
];

const getCurrentStage = (progress: number) => {
  let current = STAGES[0];
  for (const stage of STAGES) {
    if (progress >= stage.t) current = stage;
  }
  return current;
};

function ProcessingOverlay({ progress }: { progress: number }) {
  const currentStage = getCurrentStage(progress);
  const pulse = useSharedValue(1);
  const sweep = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 900 }),
        withTiming(1,    { duration: 900 }),
      ), -1, true,
    );
    sweep.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }),
      -1, false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const sweepStyle = useAnimatedStyle(() => ({
    top: `${sweep.value * 100}%`,
    opacity: 0.6 + pulse.value * 0.4,
  }));

  return (
    <View style={proc.container}>
      <LinearGradient
        colors={['rgba(4,4,6,0.94)', 'rgba(8,8,16,0.96)', 'rgba(4,4,6,0.94)']}
        style={proc.gradient}
      >
        {/* Scan line */}
        <Reanimated.View style={[proc.scanLine, sweepStyle]} />

        {/* Icon */}
        <Reanimated.View
          entering={FadeIn.duration(300)}
          key={currentStage.label}
        >
          <View style={proc.iconContainer}>
            <Ionicons name={currentStage.icon} size={28} color={ACCENT} />
          </View>
        </Reanimated.View>

        {/* Label */}
        <Reanimated.View
          entering={FadeInDown.duration(250)}
          key={`lbl-${currentStage.label}`}
        >
          <Text style={proc.stageLabel}>{currentStage.label}</Text>
        </Reanimated.View>

        {/* Progress */}
        <View style={proc.barOuter}>
          <LinearGradient
            colors={[ACCENT, '#FF9F6B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[proc.barInner, { width: `${Math.min(95, progress)}%` }]}
          />
        </View>
        <Text style={proc.progressText}>{Math.round(progress)}%</Text>

        {/* Pipeline dots */}
        <View style={proc.dotsRow}>
          {STAGES.map((s, i) => (
            <View
              key={i}
              style={[proc.dot, progress >= s.t && proc.dotActive]}
            />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * SUB-COMPONENT: Animated Damage Marker
 * ══════════════════════════════════════════════════════════════════════════════ */
function DamageMarker({
  issue,
  containerW,
  containerH,
  index,
}: {
  issue: DamageIssue;
  containerW: number;
  containerH: number;
  index: number;
}) {
  const ring = useSharedValue(0);
  const sevColor = SEVERITY_COLOR[issue.severity] || ACCENT;

  useEffect(() => {
    ring.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }),
          withTiming(0, { duration: 0 }),
        ), -1, false,
      ),
    );
  }, []);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + ring.value * 1.4 }],
    opacity: 0.7 - ring.value * 0.7,
  }));

  if (!issue.boundingBox) return null;
  const { x, y, width: bw, height: bh } = issue.boundingBox;
  const cx = (x + bw / 2) * containerW;
  const cy = (y + bh / 2) * containerH;

  return (
    <Reanimated.View
      entering={FadeIn.delay(300 + index * 120).duration(400)}
      style={[markerS.wrap, { left: cx - 14, top: cy - 14 }]}
    >
      <Reanimated.View style={[markerS.ring, { borderColor: sevColor }, ringStyle]} />
      <View style={[markerS.core, { backgroundColor: sevColor }]}>
        <View style={markerS.crossH} />
        <View style={markerS.crossV} />
      </View>
    </Reanimated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * SUB-COMPONENT: Side Label Badge (DAMAGED / REPAIRED / PROJECTED)
 * ══════════════════════════════════════════════════════════════════════════════ */
function SideLabel({
  side,
  mode,
  hasReal,
}: {
  side: 'left' | 'right';
  mode: 'before' | 'after';
  hasReal: boolean;
}) {
  const isBefore = mode === 'before';
  const dotColor = isBefore ? RED_TAG : (hasReal ? GREEN_TAG : '#64B5F6');
  const textColor = isBefore ? '#FF8A80' : (hasReal ? GREEN_TAG : '#90CAF9');
  const icon = isBefore ? 'alert-circle' : (hasReal ? 'checkmark-circle' : 'sparkles');
  const label = isBefore ? 'DAMAGED' : (hasReal ? 'REPAIRED' : 'PROJECTED');

  return (
    <Reanimated.View
      entering={
        side === 'left'
          ? FadeInDown.delay(600).springify().damping(18)
          : FadeInDown.delay(800).springify().damping(18)
      }
      style={[lbl.badge, side === 'left' ? lbl.left : lbl.right]}
    >
      <BlurView intensity={40} tint="dark" style={lbl.blurInner}>
        <Ionicons name={icon as any} size={9} color={dotColor} />
        <Text style={[lbl.text, { color: textColor }]}>{label}</Text>
      </BlurView>
    </Reanimated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * SUB-COMPONENT: Bottom Stats Strip
 * ══════════════════════════════════════════════════════════════════════════════ */
function StatsStrip({
  issues,
  hasReal,
}: {
  issues: DamageIssue[];
  hasReal: boolean;
}) {
  const issueCount = issues.length;
  const avgConf = issues.length > 0
    ? Math.round(issues.reduce((s, i) => s + i.confidence, 0) / issues.length * 100)
    : 0;
  const severeCt = issues.filter(i => i.severity === 'severe').length;
  const moderateCt = issues.filter(i => i.severity === 'moderate').length;

  return (
    <Reanimated.View entering={FadeInUp.delay(1000).springify().damping(20)} style={statsS.strip}>
      <View style={statsS.item}>
        <Ionicons name="flag-outline" size={10} color={ACCENT} />
        <Text style={statsS.value}>{issueCount}</Text>
        <Text style={statsS.label}>issues</Text>
      </View>

      <View style={statsS.divider} />

      <View style={statsS.item}>
        <Ionicons name="analytics-outline" size={10} color={GOLD} />
        <Text style={statsS.value}>{avgConf}%</Text>
        <Text style={statsS.label}>confidence</Text>
      </View>

      <View style={statsS.divider} />

      <View style={statsS.item}>
        {severeCt > 0 && (
          <View style={statsS.sevChip}>
            <View style={[statsS.sevDot, { backgroundColor: '#FF6B6B' }]} />
            <Text style={[statsS.sevText, { color: '#FF6B6B' }]}>{severeCt}</Text>
          </View>
        )}
        {moderateCt > 0 && (
          <View style={statsS.sevChip}>
            <View style={[statsS.sevDot, { backgroundColor: '#FFB347' }]} />
            <Text style={[statsS.sevText, { color: '#FFB347' }]}>{moderateCt}</Text>
          </View>
        )}
        <Text style={statsS.label}>severity</Text>
      </View>

      <View style={statsS.divider} />

      <View style={statsS.item}>
        <Ionicons
          name={hasReal ? 'sparkles' : 'layers-outline'}
          size={10}
          color={hasReal ? GREEN : '#666'}
        />
        <Text style={[statsS.value, hasReal && { color: GREEN }]}>
          {hasReal ? 'AI' : 'SIM'}
        </Text>
        <Text style={statsS.label}>source</Text>
      </View>
    </Reanimated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * SUB-COMPONENT: Glassmorphic Slider Handle
 * ══════════════════════════════════════════════════════════════════════════════ */
function SliderHandle() {
  const glow = useSharedValue(0);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      ), -1, true,
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.4 + glow.value * 0.4,
    transform: [{ scale: 1 + glow.value * 0.06 }],
  }));

  return (
    <Reanimated.View style={[handleS.outer, glowStyle]}>
      <LinearGradient
        colors={['rgba(255,107,53,0.55)', 'rgba(255,107,53,0.30)']}
        style={handleS.gradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      >
        <View style={handleS.inner}>
          <View style={handleS.arrowRow}>
            <Ionicons name="chevron-back" size={10} color="rgba(255,255,255,0.9)" />
            <View style={handleS.dot} />
            <Ionicons name="chevron-forward" size={10} color="rgba(255,255,255,0.9)" />
          </View>
        </View>
      </LinearGradient>
    </Reanimated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * SUB-COMPONENT: Drag Hint (animated instruction)
 * ══════════════════════════════════════════════════════════════════════════════ */
function DragHint({ visible }: { visible: boolean }) {
  const slide = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      slide.value = withDelay(
        1200,
        withRepeat(
          withSequence(
            withTiming(-8, { duration: 600, easing: Easing.inOut(Easing.ease) }),
            withTiming(8,  { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(0,  { duration: 600, easing: Easing.inOut(Easing.ease) }),
          ), 3, false,
        ),
      );
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
  }));

  if (!visible) return null;

  return (
    <Reanimated.View
      entering={FadeIn.delay(1000).duration(500)}
      style={dragHintS.container}
    >
      <BlurView intensity={35} tint="dark" style={dragHintS.blur}>
        <Reanimated.View style={[dragHintS.inner, animStyle]}>
          <Ionicons name="swap-horizontal-outline" size={11} color="rgba(255,255,255,0.7)" />
          <Text style={dragHintS.text}>Drag to compare</Text>
        </Reanimated.View>
      </BlurView>
    </Reanimated.View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * MAIN EXPORTED COMPONENT
 * ══════════════════════════════════════════════════════════════════════════════ */
export default function BeforeAfterSlider({
  beforeUri,
  afterUri,
  repairStatus = 'idle',
  repairProgress = 0,
  width,
  issues = [],
}: BeforeAfterSliderProps) {
  const imageHeight = width * IMAGE_ASPECT;
  const sliderX = useSharedValue(width * 0.85);
  const startX = useSharedValue(0);
  const [hasRevealed, setHasRevealed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);

  const hasRealAfter = repairStatus === 'ready' && !!afterUri;
  const showProcessing = repairStatus === 'processing';
  const showFallback = !hasRealAfter && (repairStatus === 'failed' || repairStatus === 'unavailable');
  const showComparison = hasRealAfter || showFallback;
  const showSlider = showComparison || showProcessing || repairStatus === 'idle';

  /* ── Auto-Reveal Animation ──────────────────────────────────────────────── */
  const triggerReveal = useCallback(() => {
    setHasRevealed(true);
  }, []);

  useEffect(() => {
    if (isReady && !hasRevealed && showComparison) {
      sliderX.value = width * 0.85;
      sliderX.value = withDelay(
        400,
        withSpring(width / 2, {
          damping: 16,
          stiffness: 90,
          mass: 0.8,
        }, () => {
          runOnJS(triggerReveal)();
        }),
      );
    }
  }, [isReady, showComparison]);

  /* ── Haptic Feedback ────────────────────────────────────────────────────── */
  const fireHaptic = useCallback((type: 'start' | 'edge') => {
    if (type === 'start') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
  }, []);

  const markDragged = useCallback(() => {
    setHasDragged(true);
  }, []);

  /* ── SINGLE Pan Gesture on entire container ─────────────────────────────── */
  const panGesture = useMemo(() =>
    Gesture.Pan()
      .onStart(() => {
        startX.value = sliderX.value;
        runOnJS(fireHaptic)('start');
        runOnJS(markDragged)();
      })
      .onUpdate((e) => {
        const next = startX.value + e.translationX;
        const clamped = Math.max(16, Math.min(width - 16, next));
        sliderX.value = clamped;
        if (clamped <= 18 || clamped >= width - 18) {
          runOnJS(fireHaptic)('edge');
        }
      }),
    [width],
  );

  /* ── Animated Styles ────────────────────────────────────────────────────── */
  const sliderLineStyle = useAnimatedStyle(() => ({
    left: sliderX.value,
  }));

  const afterClipStyle = useAnimatedStyle(() => ({
    width: width - sliderX.value,
    left: sliderX.value,
  }));

  const lineGlow = useSharedValue(0);
  useEffect(() => {
    lineGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, true,
    );
  }, []);

  const lineGlowStyle = useAnimatedStyle(() => ({
    opacity: 0.4 + lineGlow.value * 0.6,
  }));

  return (
    <View style={{ width }}>
      {/* SINGLE GestureDetector wrapping the whole slider area */}
      <GestureHandlerRootView style={{ width }}>
        <GestureDetector gesture={panGesture}>
          <Reanimated.View style={[s.container, { width, height: imageHeight }]}>

            {/* ── BEFORE layer (full width, bottom) ───────────────────── */}
            <View style={[s.imageLayer, { width, height: imageHeight }]}>
              <Image
                source={beforeUri}
                style={{ width, height: imageHeight }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                onLoad={() => setIsReady(true)}
              />
              {/* Cinematic vignette */}
              <LinearGradient
                colors={[
                  'rgba(0,0,0,0.55)',
                  'rgba(0,0,0,0.05)',
                  'rgba(0,0,0,0.12)',
                  'rgba(0,0,0,0.55)',
                ]}
                locations={[0, 0.3, 0.7, 1]}
                style={StyleSheet.absoluteFillObject}
                pointerEvents="none"
              />
              {/* Damage markers */}
              {issues.map((issue, idx) => (
                <DamageMarker
                  key={issue.id}
                  issue={issue}
                  containerW={width}
                  containerH={imageHeight}
                  index={idx}
                />
              ))}
              {/* DAMAGED badge */}
              <SideLabel side="left" mode="before" hasReal={hasRealAfter} />
            </View>

            {/* ── AFTER layer (clipped from right) ────────────────────── */}
            {showComparison && (
              <Reanimated.View
                style={[s.afterLayer, afterClipStyle, { height: imageHeight }]}
              >
                {hasRealAfter ? (
                  <Image
                    source={afterUri!}
                    style={{
                      width,
                      height: imageHeight,
                      position: 'absolute',
                      right: 0,
                    }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={300}
                  />
                ) : (
                  /* Smart fallback simulation */
                  <View
                    style={{
                      width,
                      height: imageHeight,
                      position: 'absolute',
                      right: 0,
                    }}
                  >
                    <Image
                      source={beforeUri}
                      style={{ width, height: imageHeight }}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      transition={200}
                    />
                    {/* Fresh-paint brightness */}
                    <LinearGradient
                      colors={[
                        'rgba(255,255,255,0.04)',
                        'rgba(255,255,255,0.02)',
                        'rgba(255,255,255,0.04)',
                      ]}
                      style={StyleSheet.absoluteFillObject}
                    />
                    {/* Per-damage heal zones */}
                    {issues.map(issue => {
                      if (!issue.boundingBox) return null;
                      const { x, y, width: bw, height: bh } = issue.boundingBox;
                      return (
                        <View
                          key={issue.id}
                          style={{
                            position: 'absolute',
                            left: x * width,
                            top: y * imageHeight,
                            width: bw * width,
                            height: bh * imageHeight,
                            borderRadius: 8,
                            overflow: 'hidden',
                          }}
                        >
                          <BlurView
                            intensity={Platform.OS === 'ios' ? 18 : 12}
                            tint="default"
                            style={StyleSheet.absoluteFillObject}
                          />
                          <LinearGradient
                            colors={[
                              'rgba(16,185,129,0.18)',
                              'rgba(16,185,129,0.06)',
                              'rgba(16,185,129,0.14)',
                            ]}
                            style={StyleSheet.absoluteFillObject}
                          />
                          <LinearGradient
                            colors={[
                              'rgba(255,255,255,0.10)',
                              'transparent',
                              'rgba(255,255,255,0.06)',
                            ]}
                            start={{ x: 0.2, y: 0 }}
                            end={{ x: 0.8, y: 1 }}
                            style={StyleSheet.absoluteFillObject}
                          />
                          <View style={fallbackS.checkBadge}>
                            <Ionicons name="checkmark-circle" size={10} color={GREEN} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
                {/* Cinematic vignette after */}
                <LinearGradient
                  colors={[
                    'rgba(0,0,0,0.45)',
                    'rgba(0,0,0,0.02)',
                    'rgba(0,0,0,0.08)',
                    'rgba(0,0,0,0.45)',
                  ]}
                  locations={[0, 0.3, 0.7, 1]}
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents="none"
                />
                <SideLabel side="right" mode="after" hasReal={hasRealAfter} />
              </Reanimated.View>
            )}

            {/* ── Processing overlay ──────────────────────────────────── */}
            {showProcessing && (
              <Reanimated.View
                entering={FadeIn.duration(400)}
                style={[s.overlayLayer, afterClipStyle, { height: imageHeight }]}
              >
                <ProcessingOverlay progress={repairProgress} />
              </Reanimated.View>
            )}

            {/* ── Idle right-side overlay ─────────────────────────────── */}
            {repairStatus === 'idle' && (
              <Reanimated.View
                style={[s.overlayLayer, afterClipStyle, { height: imageHeight }]}
              >
                <View style={proc.container}>
                  <LinearGradient
                    colors={['rgba(4,4,6,0.82)', 'rgba(10,10,18,0.90)']}
                    style={[proc.gradient, { justifyContent: 'center' }]}
                  >
                    <View style={proc.iconContainer}>
                      <Ionicons name="layers-outline" size={24} color="#555" />
                    </View>
                    <Text style={[proc.stageLabel, { color: '#555', fontSize: 11 }]}>
                      Repair projection will appear here
                    </Text>
                  </LinearGradient>
                </View>
              </Reanimated.View>
            )}

            {/* ── Slider Line + Handle ───────────────────────────────── */}
            {showSlider && (
              <Reanimated.View
                style={[s.sliderLine, sliderLineStyle, { height: imageHeight }]}
                pointerEvents="none"
              >
                <Reanimated.View style={[s.lineGlow, lineGlowStyle]} />
                <SliderHandle />
                <View style={s.endcapTop} />
                <View style={s.endcapBot} />
              </Reanimated.View>
            )}

            {/* ── Drag Hint ─────────────────────────────────────────── */}
            <DragHint visible={showComparison && !hasDragged} />

          </Reanimated.View>
        </GestureDetector>
      </GestureHandlerRootView>

      {/* ── Bottom Stats Strip ───────────────────────────────────────── */}
      {issues.length > 0 && showComparison && (
        <StatsStrip issues={issues} hasReal={hasRealAfter} />
      )}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * STYLES
 * ══════════════════════════════════════════════════════════════════════════════ */
const s = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: SURFACE,
  },
  imageLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  afterLayer: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
    zIndex: 3,
  },
  overlayLayer: {
    position: 'absolute',
    top: 0,
    overflow: 'hidden',
    zIndex: 4,
  },
  sliderLine: {
    position: 'absolute',
    top: 0,
    width: 2.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -1.25,
  },
  lineGlow: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 24,
    left: -10.75,
    backgroundColor: 'transparent',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 0,
  },
  endcapTop: {
    position: 'absolute',
    top: 0,
    width: 8,
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
    left: -2.75,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  endcapBot: {
    position: 'absolute',
    bottom: 0,
    width: 8,
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.85)',
    left: -2.75,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});

/* ── Marker ────────────────────────────────────────────────────────────── */
const markerS = StyleSheet.create({
  wrap: {
    position: 'absolute',
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  ring: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  core: {
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  crossH: {
    position: 'absolute',
    width: 6,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 0.5,
  },
  crossV: {
    position: 'absolute',
    width: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 0.5,
  },
});

/* ── Side Label ────────────────────────────────────────────────────────── */
const lbl = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: 10,
    zIndex: 5,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  left: { left: 10 },
  right: { right: 10 },
  blurInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
  },
});

/* ── Handle ────────────────────────────────────────────────────────────── */
const handleS = StyleSheet.create({
  outer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 14,
    elevation: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
});

/* ── Stats Strip ───────────────────────────────────────────────────────── */
const statsS = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  value: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  label: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sevChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginRight: 3,
  },
  sevDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  sevText: {
    fontSize: 10,
    fontWeight: '700',
  },
});

/* ── Processing Overlay ────────────────────────────────────────────────── */
const proc = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,107,53,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.15)',
  },
  stageLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  barOuter: {
    width: '75%',
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barInner: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dotActive: {
    backgroundColor: ACCENT,
  },
});

/* ── Fallback ──────────────────────────────────────────────────────────── */
const fallbackS = StyleSheet.create({
  checkBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 8,
    padding: 2,
  },
});

/* ── Drag Hint ─────────────────────────────────────────────────────────── */
const dragHintS = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    zIndex: 12,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  blur: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.3,
  },
});
