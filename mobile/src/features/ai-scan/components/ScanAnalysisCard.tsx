import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  FadeIn,
  FadeInDown,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/* ═══════════════════════════════════════════════════════════════════════════
 * SCAN ANALYSIS CARD — Realistic AI scan visualization
 *
 * 4-phase progressive analysis with animated progress, glow pulse,
 * and phase-specific status labels. Min ~12s total runtime.
 *
 * Tesla / Porsche diagnostics aesthetic
 * ═══════════════════════════════════════════════════════════════════════════ */

const ACCENT = '#FF6B35';
const SUCCESS = '#10B981';

export interface ScanPhase {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

export const SCAN_PHASES: ScanPhase[] = [
  { key: 'structure',  label: 'Analyzing body panel structure…',       icon: 'car-sport-outline' },
  { key: 'damage',     label: 'Detecting scratches, dents, cracks…',   icon: 'search-outline' },
  { key: 'mapping',    label: 'Mapping damage zones…',                 icon: 'map-outline' },
  { key: 'confidence', label: 'Generating confidence score…',          icon: 'shield-checkmark-outline' },
];

/* ── Glow Pulse Ring ─────────────────────────────────────────────── */
function GlowPulse() {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.15 + pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.3 }],
  }));

  return <Animated.View style={[styles.glowPulse, glowStyle]} />;
}

/* ── Phase Row ────────────────────────────────────────────────────── */
function PhaseRow({
  phase,
  status,
  index,
}: {
  phase: ScanPhase;
  status: 'pending' | 'active' | 'done';
  index: number;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 150).duration(300)}
      style={[styles.phaseRow, status === 'active' && styles.phaseRowActive]}
    >
      <View style={styles.phaseIconWrap}>
        {status === 'active' && <GlowPulse />}
        <View
          style={[
            styles.phaseIcon,
            status === 'done' && styles.phaseIconDone,
            status === 'active' && styles.phaseIconActive,
          ]}
        >
          {status === 'done' ? (
            <Ionicons name="checkmark" size={12} color="#fff" />
          ) : (
            <Ionicons
              name={phase.icon}
              size={12}
              color={status === 'active' ? '#fff' : '#3a3a48'}
            />
          )}
        </View>
      </View>

      <Text
        style={[
          styles.phaseLabel,
          status === 'active' && styles.phaseLabelActive,
          status === 'done' && styles.phaseLabelDone,
        ]}
      >
        {phase.label}
      </Text>

      {status === 'done' && (
        <Animated.View entering={FadeIn.duration(200)}>
          <Text style={styles.phaseDone}>Done</Text>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */
interface ScanAnalysisCardProps {
  /** 0-based index of the currently active phase (-1 = not started, 4+ = all done) */
  activePhase: number;
  /** 0–100 overall progress percentage */
  progress: number;
  /** Optional additional status message */
  statusMessage?: string;
}

export default function ScanAnalysisCard({
  activePhase,
  progress,
  statusMessage,
}: ScanAnalysisCardProps) {
  const progressAnim = useSharedValue(0);

  useEffect(() => {
    progressAnim.value = withTiming(progress, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progressAnim.value}%` as any,
  }));

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.scanBadge}>
            <GlowPulse />
            <Ionicons name="pulse-outline" size={14} color={ACCENT} style={{ zIndex: 2 }} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Analysis in Progress</Text>
            <Text style={styles.headerSub}>
              {statusMessage || 'Processing vehicle scan data…'}
            </Text>
          </View>
        </View>
        <Text style={styles.percentText}>{Math.round(progress)}%</Text>
      </View>

      {/* Animated Progress Bar */}
      <View style={styles.progressTrack}>
        <Animated.View style={[styles.progressFillWrap, barStyle]}>
          <LinearGradient
            colors={[ACCENT, '#D44200']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.progressGradient}
          />
        </Animated.View>
      </View>

      {/* Phase List */}
      <View style={styles.phaseList}>
        {SCAN_PHASES.map((phase, idx) => {
          let status: 'pending' | 'active' | 'done' = 'pending';
          if (idx < activePhase) status = 'done';
          else if (idx === activePhase) status = 'active';
          return <PhaseRow key={phase.key} phase={phase} status={status} index={idx} />;
        })}
      </View>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,10,16,0.9)',
    borderColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  scanBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  headerSub: {
    color: '#5a5a68',
    fontSize: 10,
    marginTop: 1,
  },
  percentText: {
    color: ACCENT,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* ── Progress Bar ── */
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  progressFillWrap: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressGradient: {
    flex: 1,
    borderRadius: 2,
  },

  /* ── Phase List ── */
  phaseList: { gap: 6 },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  phaseRowActive: {
    backgroundColor: 'rgba(255,107,53,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.1)',
  },
  phaseIconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glowPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT,
  },
  phaseIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0c0c14',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  phaseIconDone: {
    backgroundColor: SUCCESS,
    borderColor: 'rgba(16,185,129,0.5)',
    shadowColor: SUCCESS,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  phaseIconActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
  },
  phaseLabel: {
    flex: 1,
    color: '#3a3a48',
    fontSize: 12,
    fontWeight: '600',
  },
  phaseLabelActive: {
    color: '#e0e0e0',
  },
  phaseLabelDone: {
    color: '#6a6a78',
  },
  phaseDone: {
    color: SUCCESS,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
