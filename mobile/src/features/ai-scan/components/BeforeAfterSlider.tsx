import React, { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Reanimated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import type { DamageIssue } from '../types';

/* ═══════════════════════════════════════════════════════════════════════════
 * PREMIUM Before / After Slider — Tesla service diagnostic UX
 * No blurred white rectangles. Real AI-repaired preview or premium fallback.
 * ═══════════════════════════════════════════════════════════════════════════ */

const ACCENT = '#FF6B35';

interface BeforeAfterSliderProps {
  beforeUri: string;
  afterUri?: string | null;
  repairStatus?: 'idle' | 'processing' | 'ready' | 'failed' | 'unavailable';
  repairProgress?: number;
  width: number;
  issues?: DamageIssue[];
}

const IMAGE_ASPECT = 3 / 4;

/* ── Processing Stage Labels ─────────────────────────────────────── */
const STAGES = [
  { label: 'Analyzing damage zones...', icon: 'scan-outline' as const, t: 0 },
  { label: 'Matching paint code (PPG)...', icon: 'color-palette-outline' as const, t: 15 },
  { label: 'AI surface reconstruction...', icon: 'construct-outline' as const, t: 35 },
  { label: 'Body alignment mapping...', icon: 'git-merge-outline' as const, t: 55 },
  { label: 'Final compositing...', icon: 'sparkles-outline' as const, t: 75 },
];

const getCurrentStage = (progress: number) => {
  let current = STAGES[0];
  for (const stage of STAGES) {
    if (progress >= stage.t) current = stage;
  }
  return current;
};

/* ── Processing Overlay ──────────────────────────────────────────── */
const ProcessingOverlay = ({ progress }: { progress: number }) => {
  const currentStage = getCurrentStage(progress);
  const pulseOpacity = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: 900 }),
        withTiming(1, { duration: 900 })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  return (
    <View style={processingStyles.container}>
      <LinearGradient
        colors={['rgba(4,4,6,0.94)', 'rgba(8,8,16,0.96)', 'rgba(4,4,6,0.94)']}
        style={processingStyles.gradient}
      >
        {/* Horizontal scan line */}
        <Reanimated.View style={[processingStyles.scanLine, pulseStyle]} />

        <Reanimated.View entering={FadeIn.duration(300)} key={currentStage.label}>
          <View style={processingStyles.iconContainer}>
            <Ionicons name={currentStage.icon} size={28} color={ACCENT} />
          </View>
        </Reanimated.View>

        <Reanimated.View entering={FadeInDown.duration(250)} key={`label-${currentStage.label}`}>
          <Text style={processingStyles.stageLabel}>{currentStage.label}</Text>
        </Reanimated.View>

        {/* Progress bar */}
        <View style={processingStyles.barOuter}>
          <View style={[processingStyles.barInner, { width: `${Math.min(95, progress)}%` }]} />
        </View>

        <Text style={processingStyles.progressText}>{Math.round(progress)}%</Text>

        {/* Pipeline dots */}
        <View style={processingStyles.dotsRow}>
          {STAGES.map((s, i) => (
            <View
              key={i}
              style={[
                processingStyles.dot,
                progress >= s.t && processingStyles.dotActive,
              ]}
            />
          ))}
        </View>
      </LinearGradient>
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */
export default function BeforeAfterSlider({
  beforeUri,
  afterUri,
  repairStatus = 'idle',
  repairProgress = 0,
  width,
  issues = [],
}: BeforeAfterSliderProps) {
  const imageHeight = width * IMAGE_ASPECT;
  const sliderX = useSharedValue(width / 2);
  const startX = useSharedValue(width / 2);
  const [isReady, setIsReady] = useState(false);

  const hasRealAfter = repairStatus === 'ready' && !!afterUri;
  const showProcessing = repairStatus === 'processing';
  const showSimulationFallback = !hasRealAfter && (repairStatus === 'failed' || repairStatus === 'unavailable');

  const panGesture = useMemo(() =>
    Gesture.Pan()
      .hitSlop({ left: 20, right: 20, top: 10, bottom: 10 })
      .onStart(() => { startX.value = sliderX.value; })
      .onUpdate((e) => {
        const next = startX.value + e.translationX;
        sliderX.value = Math.max(16, Math.min(width - 16, next));
      }),
    [width]
  );

  const sliderLineStyle = useAnimatedStyle(() => ({ left: sliderX.value }));
  const afterClipStyle = useAnimatedStyle(() => ({
    width: width - sliderX.value,
    left: sliderX.value,
  }));

  return (
    <GestureHandlerRootView style={{ width, overflow: 'hidden' }}>
      <View style={[styles.container, { width, height: imageHeight }]}>

        {/* ── BEFORE image (full width, behind) ── */}
        <Reanimated.View style={[styles.imageLayer, { width, height: imageHeight }]}>
          <Image
            source={beforeUri}
            style={{ width, height: imageHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            onLoad={() => setIsReady(true)}
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.6)', 'transparent', 'rgba(0,0,0,0.4)']}
            style={styles.imageGradient}
          />
          <View style={[styles.sideLabel, styles.labelLeft]}>
            <View style={[styles.labelDot, { backgroundColor: '#FF5252' }]} />
            <Text style={[styles.labelText, { color: '#FF8A80' }]}>CURRENT</Text>
          </View>
        </Reanimated.View>

        {/* ── AFTER side (clipped) ── */}
        {(hasRealAfter || showSimulationFallback) && (
          <GestureDetector gesture={panGesture}>
            <Reanimated.View style={[styles.afterLayer, afterClipStyle, { height: imageHeight }]}>
              {hasRealAfter ? (
                <Image
                  source={afterUri!}
                  style={{ width, height: imageHeight, position: 'absolute', right: 0 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                />
              ) : (
                /* Premium fallback — tinted overlay instead of blurry white rect */
                <View style={{ width, height: imageHeight, position: 'absolute', right: 0 }}>
                  <Image
                    source={beforeUri}
                    style={{ width, height: imageHeight }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                  {/* Global "repaired" tint — subtle green hue shift */}
                  <LinearGradient
                    colors={['rgba(16,185,129,0.06)', 'rgba(16,185,129,0.03)', 'rgba(16,185,129,0.06)']}
                    style={StyleSheet.absoluteFillObject}
                  />
                  {/* Per-damage zone subtle repair overlay */}
                  {issues.map(issue => {
                    if (!issue.boundingBox) return null;
                    const { x, y, width: bw, height: bh } = issue.boundingBox;
                    return (
                      <View key={issue.id} style={{
                        position: 'absolute',
                        left: x * width,
                        top: y * imageHeight,
                        width: bw * width,
                        height: bh * imageHeight,
                        borderRadius: 6,
                        overflow: 'hidden',
                      }}>
                        <BlurView intensity={8} tint="dark" style={StyleSheet.absoluteFillObject} />
                        <LinearGradient
                          colors={['rgba(16,185,129,0.12)', 'rgba(16,185,129,0.06)']}
                          style={StyleSheet.absoluteFillObject}
                        />
                      </View>
                    );
                  })}
                </View>
              )}
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'transparent', 'rgba(0,0,0,0.35)']}
                style={styles.imageGradient}
              />
              <View style={[styles.sideLabel, styles.labelRight]}>
                <View style={[styles.labelDot, { backgroundColor: hasRealAfter ? '#00E676' : '#64B5F6' }]} />
                <Text style={[styles.labelText, { color: hasRealAfter ? '#00E676' : '#90CAF9' }]}>
                  {hasRealAfter ? 'REPAIRED' : 'PROJECTED'}
                </Text>
              </View>
            </Reanimated.View>
          </GestureDetector>
        )}

        {/* ── Processing overlay (when generating) ── */}
        {showProcessing && (
          <Reanimated.View
            entering={FadeIn.duration(400)}
            style={[styles.overlayLayer, afterClipStyle, { height: imageHeight }]}
          >
            <ProcessingOverlay progress={repairProgress} />
          </Reanimated.View>
        )}

        {/* ── Idle state ── */}
        {repairStatus === 'idle' && (
          <Reanimated.View style={[styles.overlayLayer, afterClipStyle, { height: imageHeight }]}>
            <View style={processingStyles.container}>
              <LinearGradient
                colors={['rgba(4,4,6,0.82)', 'rgba(10,10,18,0.90)']}
                style={[processingStyles.gradient, { justifyContent: 'center' }]}
              >
                <View style={processingStyles.iconContainer}>
                  <Ionicons name="layers-outline" size={24} color="#555" />
                </View>
                <Text style={[processingStyles.stageLabel, { color: '#666', fontSize: 12 }]}>
                  Repair projection will appear here
                </Text>
              </LinearGradient>
            </View>
          </Reanimated.View>
        )}

        {/* ── Slider Line ── */}
        {(hasRealAfter || showProcessing || showSimulationFallback || repairStatus === 'idle') && (
          <GestureDetector gesture={panGesture}>
            <Reanimated.View
              style={[styles.sliderLine, sliderLineStyle, { height: imageHeight }]}
            >
              <View style={styles.sliderKnob}>
                <View style={styles.sliderArrowRow}>
                  <Ionicons name="chevron-back" size={9} color="#FFF" />
                  <Ionicons name="chevron-forward" size={9} color="#FFF" />
                </View>
              </View>
            </Reanimated.View>
          </GestureDetector>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#08080C',
  },
  imageLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1,
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
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
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.85)',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  sliderKnob: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  sliderArrowRow: {
    flexDirection: 'row',
    gap: -3,
  },
  sideLabel: {
    position: 'absolute',
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  labelLeft: { left: 10 },
  labelRight: { right: 10 },
  labelDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  labelText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});

const processingStyles = StyleSheet.create({
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
    top: '40%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,107,53,0.3)',
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
    backgroundColor: ACCENT,
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
