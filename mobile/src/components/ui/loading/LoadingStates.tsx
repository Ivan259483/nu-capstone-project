import React, { useEffect } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  ZoomIn,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { BorderRadius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/useThemeContext';
import SkeletonPulse from '@/components/ui/SkeletonPulse';
import PremiumLoader, { PremiumLoaderTone } from './PremiumLoader';
import { LoadingColor, LoadingMotion } from './motion';

type SectionLoaderProps = {
  label?: string;
  detail?: string;
  minHeight?: number;
  tone?: PremiumLoaderTone;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** For an isolated card, panel, footer, or modal region. Reserves its space. */
export function SectionLoader({
  label = 'Loading',
  detail,
  minHeight = 112,
  tone = 'accent',
  compact = false,
  style,
}: SectionLoaderProps) {
  const { colors } = useTheme();
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.sectionEnter)}
      exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
      accessibilityLiveRegion="polite"
      style={[styles.section, { minHeight }, compact && styles.sectionCompact, style]}
    >
      <PremiumLoader size={compact ? 18 : 24} tone={tone} accessibilityLabel={label} />
      <View style={styles.copy}>
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{label}</Text>
        {detail ? <Text style={[styles.sectionDetail, { color: colors.textMuted }]}>{detail}</Text> : null}
      </View>
    </Animated.View>
  );
}

type FullScreenLoaderProps = {
  label?: string;
  detail?: string;
  branded?: boolean;
  backgroundColor?: string;
};

/** Reserved for cold start, auth restoration, and truly blocking app gates. */
export function FullScreenLoader({
  label = 'Preparing your experience',
  detail = 'Please wait a moment',
  branded = true,
  backgroundColor = '#040405',
}: FullScreenLoaderProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(LoadingMotion.sectionEnter)}
      exiting={reduceMotion ? undefined : FadeOut.duration(LoadingMotion.contentExit)}
      accessibilityLiveRegion="polite"
      style={[styles.fullScreen, { backgroundColor }]}
    >
      {branded ? (
        <View style={styles.wordmarkRow}>
          <View style={styles.wordmarkRule} />
          <Text style={styles.wordmark}>AUTOSPF+</Text>
          <View style={styles.wordmarkRule} />
        </View>
      ) : null}
      <PremiumLoader size={32} accessibilityLabel={label} />
      <Text style={styles.fullScreenLabel}>{label}</Text>
      {detail ? <Text style={styles.fullScreenDetail}>{detail}</Text> : null}
    </Animated.View>
  );
}

export type PageSkeletonPreset = 'list' | 'detail' | 'dashboard';

type PageSkeletonProps = {
  preset?: PageSkeletonPreset;
  rows?: number;
  style?: StyleProp<ViewStyle>;
};

/** Content-shaped placeholder for initial loads on data-heavy pages. */
export function PageSkeleton({ preset = 'list', rows = 4, style }: PageSkeletonProps) {
  const { colors } = useTheme();
  const cardStyle = { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading page content"
      style={[styles.skeletonPage, style]}
    >
      <SkeletonPulse style={[styles.heroSkeleton, cardStyle]}>
        <View style={styles.skeletonEyebrow} />
        <View style={styles.skeletonTitle} />
        <View style={styles.skeletonSubtitle} />
        {preset === 'dashboard' ? <View style={styles.skeletonMetric} /> : null}
      </SkeletonPulse>

      {preset === 'detail' ? (
        <SkeletonPulse style={[styles.detailSkeleton, cardStyle]}>
          <View style={styles.skeletonBlock} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '72%' }]} />
          <View style={[styles.skeletonLine, { width: '88%' }]} />
        </SkeletonPulse>
      ) : (
        Array.from({ length: rows }).map((_, index) => (
          <SkeletonPulse key={index} style={[styles.rowSkeleton, cardStyle]}>
            <View style={styles.skeletonIcon} />
            <View style={styles.skeletonRowCopy}>
              <View style={[styles.skeletonLine, { width: index % 2 ? '58%' : '72%' }]} />
              <View style={[styles.skeletonLineSmall, { width: index % 2 ? '76%' : '54%' }]} />
            </View>
          </SkeletonPulse>
        ))
      )}
    </View>
  );
}

type SuccessMarkProps = {
  size?: number;
  label?: string;
  onAnimationComplete?: () => void;
};

/** Short semantic completion state. Never loops and never substitutes for persisted state. */
export function SuccessMark({ size = 20, label = 'Complete', onAnimationComplete }: SuccessMarkProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!onAnimationComplete) return;
    if (reduceMotion) {
      onAnimationComplete();
      return;
    }
    progress.value = withTiming(1, { duration: LoadingMotion.success, easing: LoadingMotion.easing }, (done) => {
      if (done) runOnJS(onAnimationComplete)();
    });
  }, [onAnimationComplete, progress, reduceMotion]);

  return (
    <Animated.View
      entering={reduceMotion ? undefined : ZoomIn.duration(LoadingMotion.contentEnter)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.successMark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: LoadingColor.successSoft,
        },
      ]}
    >
      <Ionicons name="checkmark" size={size * 0.68} color={LoadingColor.success} />
    </Animated.View>
  );
}

const skeletonFill = { backgroundColor: 'rgba(255,255,255,0.075)', borderRadius: 999 } as const;

const styles = StyleSheet.create({
  section: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: Spacing.lg,
  },
  sectionCompact: {
    minHeight: 48,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: Spacing.sm,
  },
  copy: { alignItems: 'center', gap: 3 },
  sectionLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2, textAlign: 'center' },
  sectionDetail: { fontSize: 12, lineHeight: 17, textAlign: 'center' },
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  wordmarkRule: { width: 18, height: 1, backgroundColor: 'rgba(255,122,26,0.40)' },
  wordmark: { color: '#F4F4F5', fontSize: 12, fontWeight: '800', letterSpacing: 2.4 },
  fullScreenLabel: { color: '#F4F4F5', fontSize: 15, fontWeight: '600', marginTop: 4 },
  fullScreenDetail: { color: '#777780', fontSize: 12, textAlign: 'center' },
  skeletonPage: { width: '100%', gap: 12, padding: Spacing.lg },
  heroSkeleton: {
    height: 118,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: 18,
    justifyContent: 'center',
    gap: 10,
  },
  rowSkeleton: {
    minHeight: 82,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailSkeleton: {
    minHeight: 300,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: 18,
    gap: 14,
  },
  skeletonEyebrow: { ...skeletonFill, width: 72, height: 8 },
  skeletonTitle: { ...skeletonFill, width: '58%', height: 15 },
  skeletonSubtitle: { ...skeletonFill, width: '78%', height: 10 },
  skeletonMetric: { ...skeletonFill, width: 110, height: 22, marginTop: 3 },
  skeletonIcon: { ...skeletonFill, width: 42, height: 42, borderRadius: 13 },
  skeletonRowCopy: { flex: 1, gap: 10 },
  skeletonLine: { ...skeletonFill, height: 11 },
  skeletonLineSmall: { ...skeletonFill, height: 8 },
  skeletonBlock: { ...skeletonFill, borderRadius: 14, height: 150, width: '100%', marginBottom: 4 },
  successMark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(52,211,153,0.28)' },
});
