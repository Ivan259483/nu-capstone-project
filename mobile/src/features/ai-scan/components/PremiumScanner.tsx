import React, { useEffect } from 'react';
import {
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { BorderRadius, Colors, Glass, Palette, TabBarHeight } from '@/constants/theme';
import type { AiScanLineItem, AiScanSeverity } from '@/services/api/aiService';

export const scannerColors = {
  bg: Colors.dark.background,
  card: Colors.dark.card,
  cardAlt: Colors.dark.cardAlt,
  text: Colors.dark.text,
  textSoft: 'rgba(255,255,255,0.72)',
  textMuted: 'rgba(255,255,255,0.48)',
  border: 'rgba(255,255,255,0.10)',
  borderStrong: 'rgba(255,255,255,0.18)',
  orange: Palette.accent,
  cyan: '#35D9FF',
  blue: '#2F80FF',
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
} as const;

export const severityMeta: Record<
  AiScanSeverity,
  { label: string; color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  high: {
    label: 'Critical',
    color: scannerColors.red,
    bg: 'rgba(239,68,68,0.14)',
    icon: 'alert-circle-outline',
  },
  medium: {
    label: 'Medium',
    color: scannerColors.yellow,
    bg: 'rgba(245,158,11,0.14)',
    icon: 'warning-outline',
  },
  low: {
    label: 'Low',
    color: scannerColors.green,
    bg: 'rgba(16,185,129,0.14)',
    icon: 'information-circle-outline',
  },
};

export const defaultInspectionSteps = [
  { key: 'scan', label: 'Scan', icon: 'scan-outline' as const },
  { key: 'detect', label: 'Detect', icon: 'analytics-outline' as const },
  { key: '3d', label: '3D', icon: 'cube-outline' as const },
  { key: 'ar', label: 'AR', icon: 'aperture-outline' as const },
  { key: 'price', label: 'Price', icon: 'cash-outline' as const },
  { key: 'approve', label: 'Approve', icon: 'checkmark-done-outline' as const },
];

type StepItem = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export function ScannerBackground({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.root, style]}>
      <LinearGradient
        colors={['#020305', '#07121A', '#040405']}
        locations={[0, 0.44, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.blueGlow} pointerEvents="none" />
      <View style={styles.orangeGlow} pointerEvents="none" />
      <View style={styles.gridVeil} pointerEvents="none" />
      {children}
    </View>
  );
}

export function GlassPanel({
  children,
  style,
  contentStyle,
  intense = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intense?: boolean;
}) {
  return (
    <View style={[styles.glassWrap, style]}>
      <BlurView
        intensity={intense ? 65 : Glass.intensity}
        tint={Glass.tint}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.025)']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glassContent, contentStyle]}>{children}</View>
    </View>
  );
}

export function ScannerHeader({
  title,
  eyebrow,
  onBack,
  right,
}: {
  title: string;
  eyebrow?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        disabled={!onBack}
        hitSlop={10}
        style={[styles.headerBtn, !onBack && styles.headerBtnGhost]}
      >
        {onBack ? <Ionicons name="chevron-back" size={22} color={scannerColors.text} /> : null}
      </Pressable>
      <View style={styles.headerCenter}>
        {eyebrow ? <Text style={styles.headerEyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerBtn}>{right}</View>
    </View>
  );
}

export function AiPill({
  label,
  icon = 'sparkles-outline',
  color = scannerColors.orange,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  color?: string;
}) {
  return (
    <View style={[styles.aiPill, { borderColor: `${color}55`, backgroundColor: `${color}16` }]}>
      <View style={[styles.aiPillDot, { backgroundColor: color }]} />
      <Ionicons name={icon} size={12} color={color} />
      <Text style={[styles.aiPillText, { color }]}>{label}</Text>
    </View>
  );
}

export function PipelineStepper({
  currentIndex,
  steps = defaultInspectionSteps,
}: {
  currentIndex: number;
  steps?: StepItem[];
}) {
  return (
    <GlassPanel contentStyle={styles.stepperContent} style={styles.stepperWrap}>
      {steps.map((step, index) => {
        const active = index === currentIndex;
        const complete = index < currentIndex;
        const color = active || complete ? scannerColors.orange : scannerColors.textMuted;
        return (
          <React.Fragment key={step.key}>
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepNode,
                  active && styles.stepNodeActive,
                  complete && styles.stepNodeComplete,
                ]}
              >
                <Ionicons
                  name={complete ? 'checkmark' : step.icon}
                  size={14}
                  color={complete ? '#fff' : color}
                />
              </View>
              <Text style={[styles.stepLabel, { color }]} numberOfLines={1}>
                {step.label}
              </Text>
            </View>
            {index < steps.length - 1 ? (
              <View style={[styles.stepRail, complete && styles.stepRailComplete]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </GlassPanel>
  );
}

export function ScanZoneOverlay({
  label = 'AI Ready Scan Zone',
  hint = 'Align vehicle inside frame',
  compact = false,
}: {
  label?: string;
  hint?: string;
  compact?: boolean;
}) {
  const sweep = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse, sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sweep.value * 420 }],
    opacity: 0.25 + pulse.value * 0.45,
  }));

  const cornerStyle = useAnimatedStyle(() => ({
    opacity: 0.72 + pulse.value * 0.28,
  }));

  return (
    <View style={[styles.scanZone, compact && styles.scanZoneCompact]}>
      <View style={styles.scanZoneGrid} />
      <Animated.View style={[styles.scanBeam, sweepStyle]} />
      {['tl', 'tr', 'bl', 'br'].map((corner) => (
        <Animated.View
          key={corner}
          style={[
            styles.scanCorner,
            corner.includes('t') ? styles.cornerTop : styles.cornerBottom,
            corner.includes('l') ? styles.cornerLeft : styles.cornerRight,
            cornerStyle,
          ]}
        />
      ))}
      <View style={styles.scanZoneCenter}>
        <AiPill label={label} icon="radio-outline" />
        <Text style={styles.scanZoneHint}>{hint}</Text>
      </View>
    </View>
  );
}

export function SeverityBadge({ severity }: { severity: AiScanSeverity }) {
  const meta = severityMeta[severity];
  return (
    <View style={[styles.severityBadge, { backgroundColor: meta.bg, borderColor: `${meta.color}66` }]}>
      <Ionicons name={meta.icon} size={12} color={meta.color} />
      <Text style={[styles.severityText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

export function ConfidenceMeter({
  value,
  label = 'AI confidence',
  color = scannerColors.orange,
}: {
  value: number;
  label?: string;
  color?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <View>
      <View style={styles.meterHead}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={[styles.meterValue, { color }]}>{pct}%</Text>
      </View>
      <View style={styles.meterTrack}>
        <LinearGradient
          colors={[color, scannerColors.orange]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.meterFill, { width: `${pct}%` }]}
        />
      </View>
    </View>
  );
}

export function CostRangeBar({
  min,
  max,
  recommended,
}: {
  min: number;
  max: number;
  recommended: number;
}) {
  const safeMax = Math.max(max, min, 1);
  const markerLeft = `${Math.max(4, Math.min(96, (recommended / safeMax) * 100))}%`;
  return (
    <View style={styles.costRangeWrap}>
      <View style={styles.costRangeTrack}>
        <LinearGradient
          colors={[scannerColors.green, scannerColors.orange, scannerColors.yellow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.costMarker, { left: markerLeft as `${number}%` }]} />
      </View>
      <View style={styles.costRangeLabels}>
        <Text style={styles.costRangeLabel}>Low {formatPhp(min)}</Text>
        <Text style={styles.costRangeLabel}>High {formatPhp(safeMax)}</Text>
      </View>
    </View>
  );
}

export function RepairIntelligenceCard({
  line,
  index,
  selected = true,
  onPress,
}: {
  line: AiScanLineItem;
  index: number;
  selected?: boolean;
  onPress?: () => void;
}) {
  const meta = severityMeta[line.severity];
  const difficulty =
    line.severity === 'high' ? 'Advanced' : line.severity === 'medium' ? 'Moderate' : 'Light';
  return (
    <Animated.View entering={FadeInDown.duration(260).delay(index * 55)}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.repairCard,
          selected && { borderColor: `${meta.color}70` },
          pressed && { transform: [{ scale: 0.985 }] },
        ]}
      >
        <LinearGradient
          colors={[`${meta.color}1E`, 'rgba(255,255,255,0.02)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.repairRank}>
          <Text style={styles.repairRankText}>{index + 1}</Text>
        </View>
        <View style={styles.repairBody}>
          <View style={styles.repairTop}>
            <Text style={styles.repairTitle} numberOfLines={1}>
              {line.serviceName}
            </Text>
            <SeverityBadge severity={line.severity} />
          </View>
          <Text style={styles.repairSub} numberOfLines={2}>
            {line.affectedArea} - {line.damageType}
          </Text>
          <View style={styles.repairMetaRow}>
            <AiPill label={`Priority ${line.urgency}`} icon="flash-outline" color={meta.color} />
            <AiPill label={`${difficulty} repair`} icon="construct-outline" color={scannerColors.orange} />
          </View>
        </View>
        {onPress ? (
          <View style={[styles.repairCheck, selected && { backgroundColor: meta.color }]}>
            {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function BottomActionBar({
  primaryLabel,
  onPrimaryPress,
  primaryIcon = 'arrow-forward',
  disabled = false,
  secondaryLabel,
  onSecondaryPress,
}: {
  primaryLabel: string;
  onPrimaryPress: () => void;
  primaryIcon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
}) {
  return (
    <View style={styles.bottomBar}>
      <BlurView intensity={55} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.bottomBarVeil} />
      {secondaryLabel && onSecondaryPress ? (
        <Pressable onPress={onSecondaryPress} style={styles.secondaryAction}>
          <Text style={styles.secondaryActionText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable disabled={disabled} onPress={onPrimaryPress} style={styles.primaryActionOuter}>
        <LinearGradient
          colors={
            disabled
              ? ['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.06)']
              : [scannerColors.orange, '#EA580C']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.primaryAction, disabled && styles.primaryActionDisabled]}
        >
          <Text style={styles.primaryActionText}>{primaryLabel}</Text>
          <Ionicons name={primaryIcon} size={18} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export const formatPhp = (value: number) =>
  `PHP ${Math.max(0, Math.round(value)).toLocaleString('en-PH')}`;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: scannerColors.bg,
  },
  blueGlow: {
    position: 'absolute',
    top: -120,
    right: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  orangeGlow: {
    position: 'absolute',
    bottom: -140,
    left: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  gridVeil: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
  },
  glassWrap: {
    overflow: 'hidden',
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(8,10,14,0.64)',
    shadowColor: scannerColors.orange,
    shadowOpacity: Platform.OS === 'ios' ? 0.14 : 0,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },
  glassContent: {
    padding: 16,
  },
  header: {
    height: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  headerBtnGhost: {
    opacity: 0,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 12,
  },
  headerEyebrow: {
    color: scannerColors.orange,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: scannerColors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  aiPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  aiPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  aiPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  stepperWrap: {
    marginHorizontal: 16,
  },
  stepperContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepItem: {
    alignItems: 'center',
    gap: 5,
    width: 44,
  },
  stepNode: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  stepNodeActive: {
    borderColor: scannerColors.orange,
    shadowColor: scannerColors.orange,
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },
  stepNodeComplete: {
    backgroundColor: scannerColors.orange,
    borderColor: scannerColors.orange,
  },
  stepLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  stepRail: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
    marginHorizontal: 2,
    marginBottom: 17,
  },
  stepRailComplete: {
    backgroundColor: scannerColors.orange,
  },
  scanZone: {
    height: 320,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.38)',
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  scanZoneCompact: {
    height: 230,
  },
  scanZoneGrid: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.08)',
  },
  scanBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -80,
    height: 96,
    backgroundColor: 'rgba(255,107,53,0.10)',
    borderBottomWidth: 2,
    borderBottomColor: scannerColors.orange,
  },
  scanCorner: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderColor: scannerColors.orange,
  },
  cornerTop: {
    top: 18,
    borderTopWidth: 3,
  },
  cornerBottom: {
    bottom: 18,
    borderBottomWidth: 3,
  },
  cornerLeft: {
    left: 18,
    borderLeftWidth: 3,
  },
  cornerRight: {
    right: 18,
    borderRightWidth: 3,
  },
  scanZoneCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  scanZoneHint: {
    color: scannerColors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  meterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  meterLabel: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  meterValue: {
    fontSize: 12,
    fontWeight: '900',
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 4,
  },
  costRangeWrap: {
    gap: 10,
  },
  costRangeTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  costMarker: {
    position: 'absolute',
    top: -5,
    width: 4,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
  costRangeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  costRangeLabel: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  repairCard: {
    minHeight: 104,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: scannerColors.border,
    overflow: 'hidden',
    padding: 14,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  repairRank: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  repairRankText: {
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  repairBody: {
    flex: 1,
    gap: 8,
  },
  repairTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  repairTitle: {
    flex: 1,
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  repairSub: {
    color: scannerColors.textSoft,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  repairMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repairCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  bottomBar: {
    overflow: 'hidden',
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: TabBarHeight,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,107,53,0.18)',
    gap: 10,
  },
  bottomBarVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4,4,5,0.76)',
  },
  secondaryAction: {
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  secondaryActionText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryActionOuter: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  primaryAction: {
    height: 56,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryActionDisabled: {
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  primaryActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
