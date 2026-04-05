import React, { useState } from 'react';
import { Image } from 'expo-image';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { DamageIssue } from '@/features/ai-scan/types';

/* ═══════════════════════════════════════════════════════════════════════════
 * PREMIUM Damage Overlay — floating glass pills, confidence glow ring,
 * no childish red/yellow/green boxes.
 *
 * Design language: Tesla service center diagnostic readout
 * ═══════════════════════════════════════════════════════════════════════════ */

const ACCENT = '#FF6B35';
const SEVERITY_COLORS: Record<string, { bg: string; glow: string; text: string; border: string }> = {
  severe:   { bg: 'rgba(255,60,60,0.12)',  glow: 'rgba(255,60,60,0.4)',   text: '#FF6B6B', border: 'rgba(255,60,60,0.35)' },
  moderate: { bg: 'rgba(255,165,0,0.10)',   glow: 'rgba(255,165,0,0.35)',  text: '#FFB347', border: 'rgba(255,165,0,0.3)' },
  minor:    { bg: 'rgba(80,200,120,0.10)',  glow: 'rgba(80,200,120,0.3)', text: '#60D394', border: 'rgba(80,200,120,0.25)' },
};

const getSeverityMeta = (severity: string) =>
  SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.minor;

interface DamageOverlayImageProps {
  imageUri: string;
  issues: DamageIssue[];
  onIssuePress?: (issue: DamageIssue) => void;
  highlightedIssueId?: string | null;
}

export default function DamageOverlayImage({
  imageUri,
  issues,
  onIssuePress,
  highlightedIssueId,
}: DamageOverlayImageProps) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const overlayIssues = issues.filter((issue) => issue.boundingBox);

  return (
    <View style={styles.container} onLayout={onLayout}>
      <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" transition={200} />

      {/* Subtle scan-grid lines */}
      <View style={styles.scanOverlay}>
        {[1, 2, 3].map((i) => (
          <View key={`h${i}`} style={[styles.scanLine, { top: `${i * 25}%`, left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
        ))}
        {[1, 2, 3].map((i) => (
          <View key={`v${i}`} style={[styles.scanLine, { left: `${i * 25}%`, top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
        ))}
      </View>

      {/* Top-left scan badge */}
      <Animated.View entering={FadeIn.delay(200)} style={styles.scanBadge}>
        <View style={styles.scanBadgeDot} />
        <Text style={styles.scanBadgeText}>AI VISION</Text>
      </Animated.View>

      {/* Damage zone bounding boxes — clean thin border + floating pill label */}
      {containerSize.width > 0 &&
        overlayIssues.map((issue, index) => {
          if (!issue.boundingBox) return null;
          const { x, y, width, height } = issue.boundingBox;
          const meta = getSeverityMeta(issue.severity);
          const isHighlighted = highlightedIssueId === issue.id;

          // Calculate vertical offset for overlapping labels
          const labelOffset = overlayIssues
            .slice(0, index)
            .filter(
              (b) =>
                b.boundingBox &&
                Math.abs(b.boundingBox.y - y) < 0.12 &&
                Math.abs(b.boundingBox.x - x) < 0.12
            ).length * 28;

          return (
            <Animated.View
              key={issue.id}
              entering={FadeIn.delay(index * 100).duration(350)}
              style={[
                styles.damageZone,
                {
                  left: x * containerSize.width,
                  top: y * containerSize.height,
                  width: width * containerSize.width,
                  height: height * containerSize.height,
                  borderColor: isHighlighted ? meta.text : meta.border,
                  backgroundColor: isHighlighted ? meta.bg : 'transparent',
                },
              ]}
            >
              <TouchableOpacity
                style={styles.zoneInner}
                onPress={() => onIssuePress?.(issue)}
                activeOpacity={0.7}
              >
                {/* ── Floating pill label ── */}
                <View
                  style={[
                    styles.floatingPill,
                    { marginTop: labelOffset },
                  ]}
                >
                  <LinearGradient
                    colors={['rgba(0,0,0,0.82)', 'rgba(0,0,0,0.72)']}
                    style={styles.pillGradient}
                  >
                    {/* Severity dot */}
                    <View style={[styles.severityDot, {
                      backgroundColor: meta.text,
                      shadowColor: meta.glow,
                      shadowOpacity: 0.8,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 0 },
                    }]} />
                    <Text style={styles.pillLabel} numberOfLines={1}>
                      {issue.damageType}
                    </Text>
                    {issue.location && (
                      <Text style={styles.pillLocation} numberOfLines={1}>
                        · {issue.location}
                      </Text>
                    )}
                  </LinearGradient>
                </View>

                {/* ── Confidence ring badge ── */}
                <View style={styles.confidenceWrap}>
                  <View style={[styles.confidenceRing, { borderColor: meta.text }]}>
                    <Text style={[styles.confidenceValue, { color: meta.text }]}>
                      {(issue.confidence * 100).toFixed(0)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Corner crosshairs — only 2 corners for clean look */}
              <View style={[styles.crosshair, styles.crossTL, { borderColor: meta.text }]} />
              <View style={[styles.crosshair, styles.crossBR, { borderColor: meta.text }]} />
            </Animated.View>
          );
        })}

      {/* Bottom-right zone summary */}
      {overlayIssues.length > 0 && (
        <Animated.View entering={FadeInDown.delay(350)} style={styles.summaryBadge}>
          <Ionicons name="analytics-outline" size={10} color={ACCENT} />
          <Text style={styles.summaryText}>
            {overlayIssues.length} anomal{overlayIssues.length !== 1 ? 'ies' : 'y'} mapped
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#08080c',
    aspectRatio: 16 / 10,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  scanLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,107,53,0.04)',
  },

  /* Scan badge */
  scanBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    zIndex: 30,
  },
  scanBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  scanBadgeText: {
    color: ACCENT,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  /* Damage zones */
  damageZone: {
    position: 'absolute',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 3,
    zIndex: 10,
  },
  zoneInner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 2,
  },

  /* Floating pill */
  floatingPill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    overflow: 'hidden',
    maxWidth: '92%',
  },
  pillGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  pillLabel: {
    color: '#e8e8ec',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pillLocation: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 8,
    fontWeight: '500',
  },

  /* Confidence ring */
  confidenceWrap: {
    alignSelf: 'flex-end',
  },
  confidenceRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  confidenceValue: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: -0.2,
  },

  /* Crosshairs */
  crosshair: {
    position: 'absolute',
    width: 6,
    height: 6,
  },
  crossTL: { top: -1, left: -1, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  crossBR: { bottom: -1, right: -1, borderBottomWidth: 1.5, borderRightWidth: 1.5 },

  /* Summary badge */
  summaryBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    zIndex: 20,
  },
  summaryText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
