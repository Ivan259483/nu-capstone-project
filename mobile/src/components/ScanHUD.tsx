/**
 * ScanHUD — Futuristic scanning overlay with animated progress ring,
 * pulsing grid lines, and step checklist.
 * Built entirely with Reanimated + React Native (no Lottie).
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Rect } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, BorderRadius } from '@/constants/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const { width: SCREEN_W } = Dimensions.get('window');

interface ScanHUDProps {
  progress: number; // 0-100
}

export default function ScanHUD({ progress }: ScanHUDProps) {
  const { colors } = useTheme();

  // Animated ring
  const animatedProgress = useSharedValue(0);
  useEffect(() => {
    animatedProgress.value = withTiming(progress / 100, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - animatedProgress.value),
  }));

  // Pulsing grid
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.3, 0.8]),
  }));

  // Scan line animation
  const scanLineY = useSharedValue(0);
  useEffect(() => {
    scanLineY.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const scanLineStyle = useAnimatedStyle(() => ({
    top: interpolate(scanLineY.value, [0, 1], [0, 160]),
  }));

  const steps = [
    { label: 'Defect Detection', done: progress > 30 },
    { label: 'Area Mapping', done: progress > 60 },
    { label: 'Cost Estimation', done: progress > 80 },
    { label: 'AR Model Generation', done: progress >= 100 },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Grid overlay */}
      <Animated.View style={[styles.gridOverlay, pulseStyle]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={`h${i}`}
            style={[
              styles.gridLine,
              styles.gridLineH,
              { top: `${(i + 1) * 16}%`, backgroundColor: Palette.accent + '20' },
            ]}
          />
        ))}
        {[0, 1, 2].map((i) => (
          <View
            key={`v${i}`}
            style={[
              styles.gridLine,
              styles.gridLineV,
              { left: `${(i + 1) * 25}%`, backgroundColor: Palette.accent + '20' },
            ]}
          />
        ))}
      </Animated.View>

      {/* Scan line */}
      <Animated.View
        style={[
          styles.scanLine,
          scanLineStyle,
          {
            backgroundColor: Palette.accent,
          },
        ]}
      />

      {/* Progress Ring & Reticle Container */}
      <View style={styles.ringContainer}>
        {/* Targeting Reticle Background */}
        <Animated.View style={[styles.reticleWrapper, pulseStyle]}>
          <View style={styles.reticleCrossH} />
          <View style={styles.reticleCrossV} />
          {/* Corner brackets for reticle */}
          <View style={[styles.reticleBracket, styles.bracketTL]} />
          <View style={[styles.reticleBracket, styles.bracketTR]} />
          <View style={[styles.reticleBracket, styles.bracketBL]} />
          <View style={[styles.reticleBracket, styles.bracketBR]} />
        </Animated.View>

        {/* 3D Car Model Stand-in */}
        <Ionicons name="car-sport-outline" size={48} color={Palette.accent} style={styles.carModel} />

        <Svg width={120} height={120} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
          <Circle
            cx={60}
            cy={60}
            r={RADIUS}
            fill="none"
            stroke={colors.border}
            strokeWidth={4}
            strokeDasharray="4 8"
          />
          <AnimatedCircle
            cx={60}
            cy={60}
            r={RADIUS}
            fill="none"
            stroke={Palette.accent}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            animatedProps={ringProps}
          />
        </Svg>
        <View style={styles.ringLabel}>
          <Text style={[styles.ringPercent, { color: Palette.accent }]}>
            {Math.round(progress)}%
          </Text>
        </View>
      </View>

      {/* Title */}
      <View style={styles.titleSection}>
        <Text style={[styles.title, { color: colors.text }]}>Analyzing Vehicle...</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Offline engine is scanning for damage patterns
        </Text>
      </View>

      {/* Pulsing corner nodes */}
      {[
        { top: 12, left: 12 },
        { top: 12, right: 12 },
        { bottom: 12, left: 12 },
        { bottom: 12, right: 12 },
      ].map((pos, i) => (
        <Animated.View
          key={i}
          entering={FadeIn.delay(i * 200)}
          style={[styles.cornerNode, pos]}
        >
          <Animated.View style={[styles.cornerNodeDot, pulseStyle]} />
        </Animated.View>
      ))}

      {/* Steps */}
      <View style={styles.steps}>
        {steps.map((s, i) => (
          <Animated.View
            key={s.label}
            entering={FadeIn.delay(i * 150 + 300)}
            style={styles.stepRow}
          >
            <View
              style={[
                styles.stepDot,
                {
                  backgroundColor: s.done ? Palette.success : colors.cardAlt,
                  borderColor: s.done ? Palette.success : colors.border,
                },
              ]}
            >
              {s.done && <Ionicons name="checkmark" size={10} color="#fff" />}
            </View>
            <Text
              style={[
                styles.stepLabel,
                { color: s.done ? colors.text : colors.textMuted },
              ]}
            >
              {s.label}
            </Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    padding: 24,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
  },
  gridLineH: {
    left: 0,
    right: 0,
    height: 1,
  },
  gridLineV: {
    top: 0,
    bottom: 0,
    width: 1,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    opacity: 0.6,
  },
  ringContainer: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleWrapper: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleCrossH: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: Palette.accent,
    opacity: 0.5,
  },
  reticleCrossV: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: Palette.accent,
    opacity: 0.5,
  },
  reticleBracket: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: Palette.accent,
  },
  bracketTL: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2 },
  bracketTR: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2 },
  bracketBL: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2 },
  bracketBR: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2 },
  carModel: {
    position: 'absolute',
    opacity: 0.9,
  },
  ringLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  ringPercent: {
    fontSize: 14,
    fontWeight: '800',
    backgroundColor: 'rgba(17,17,24,0.8)',
    paddingHorizontal: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  titleSection: {
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  cornerNode: {
    position: 'absolute',
    width: 8,
    height: 8,
  },
  cornerNodeDot: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 4,
    backgroundColor: Palette.accent,
  },
  steps: {
    width: '100%',
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 13,
  },
});
