import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Polygon } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AiPill,
  BottomActionBar,
  ConfidenceMeter,
  GlassPanel,
  PipelineStepper,
  RepairIntelligenceCard,
  ScannerBackground,
  ScannerHeader,
  SeverityBadge,
  scannerColors,
  severityMeta,
} from '@/features/ai-scan/components/PremiumScanner';
import { useAiScanStore } from '@/features/ai-scan/scanStore';
import type { AiScanDamage } from '@/services/api/aiService';

const causeForDamage = (damage: AiScanDamage) => {
  const text = `${damage.type} ${damage.description}`.toLowerCase();
  if (text.includes('scratch')) return 'Likely caused by surface contact, wash marring, or road debris.';
  if (text.includes('dent')) return 'Likely caused by low-speed impact or pressure on the affected panel.';
  if (text.includes('paint')) return 'Likely clear-coat or paint-layer degradation under direct lighting.';
  return 'AI recommends technician validation under controlled shop lighting.';
};

const severityRank = { high: 3, medium: 2, low: 1 } as const;

function DamageMaskLayer({ damage }: { damage: AiScanDamage }) {
  if (damage.segmentation.points.length < 3) return null;

  const meta = severityMeta[damage.severity];
  const points = damage.segmentation.points
    .map((point) => `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)}`)
    .join(' ');

  return (
    <Svg
      pointerEvents="none"
      viewBox="0 0 1000 1000"
      preserveAspectRatio="none"
      style={styles.maskLayer}
      accessibilityLabel="Roboflow damage segmentation masks"
    >
      <Polygon
        points={points}
        fill={`${meta.color}2B`}
        stroke={meta.color}
        strokeWidth={4}
      />
    </Svg>
  );
}

function AssessmentField({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <View style={styles.assessmentField}>
      <Text style={styles.assessmentLabel}>{label}</Text>
      <Text style={[styles.assessmentValue, accent ? { color: accent } : null]}>{value}</Text>
    </View>
  );
}

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const scanError = useAiScanStore((state) => state.scanError);
  const capturedImages = useAiScanStore((state) => state.capturedImages);
  const [showOverlay, setShowOverlay] = useState(false);
  const [activeDamageId, setActiveDamageId] = useState<string | null>(
    scan?.damages[0]?.id ?? null
  );

  const damages = useMemo(() => scan?.damages ?? [], [scan?.damages]);
  const rankedDamages = useMemo(
    () =>
      [...damages].sort(
        (left, right) =>
          severityRank[right.severity] - severityRank[left.severity]
          || right.confidence - left.confidence
          || right.detectedArea.percentage - left.detectedArea.percentage
      ),
    [damages]
  );
  const activeDamage = rankedDamages.find((damage) => damage.id === activeDamageId)
    ?? rankedDamages[0];
  const overallSeverity = rankedDamages[0]?.severity ?? 'low';
  const activeImageIndex = activeDamage?.imageIndex ?? 0;
  const heroImage =
    scan?.imageUrls[activeImageIndex] ||
    capturedImages[activeImageIndex]?.uri ||
    scan?.imageUrls[0] ||
    capturedImages[0]?.uri ||
    null;
  const displayImageCount = Math.max(scan?.imageUrls.length ?? 0, capturedImages.length);
  const avgConfidence = damages.length
    ? damages.reduce((sum, damage) => sum + damage.confidence, 0) / damages.length
    : 0;
  const severeCount = damages.filter((damage) => damage.severity === 'high').length;

  const repairLines = useMemo(
    () =>
      [...(scan?.estimate.lineItems ?? [])].sort((a, b) => {
        return severityRank[b.severity] - severityRank[a.severity] || b.confidence - a.confidence;
      }),
    [scan?.estimate.lineItems]
  );

  if (!scan) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader
          title="Damage Report"
          eyebrow="AI Diagnostic"
          onBack={() => router.replace('/(customer)/scan' as never)}
        />
        <View style={styles.empty}>
          <Ionicons
            name={scanError ? 'alert-circle-outline' : 'scan-outline'}
            size={56}
            color={scanError ? scannerColors.red : scannerColors.textMuted}
          />
          <Text style={styles.emptyTitle}>{scanError ? 'Scan needs attention' : 'No report yet'}</Text>
          <Text style={styles.emptyText}>
            {scanError || 'Start an AI vehicle inspection to generate a damage report.'}
          </Text>
        </View>
        <BottomActionBar
          primaryLabel="Start New Scan"
          primaryIcon="scan"
          onPrimaryPress={() => router.replace('/(customer)/scan' as never)}
        />
      </ScannerBackground>
    );
  }

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="Damage Analysis Report"
        title="AI Diagnosis"
        onBack={() => router.replace('/(customer)/scan' as never)}
        right={<Ionicons name="analytics-outline" size={20} color={scannerColors.orange} />}
      />
      <PipelineStepper currentIndex={1} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(420)}>
          <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner} intense>
            {heroImage ? <Image source={{ uri: heroImage }} style={styles.heroImage} /> : null}
            <View style={styles.heroGradient} />
            <View style={styles.heroTop}>
              <AiPill
                label={showOverlay ? 'AI segmentation' : 'Original scan'}
                icon={showOverlay ? 'layers-outline' : 'image-outline'}
              />
              <SeverityBadge severity={overallSeverity} />
            </View>
            {showOverlay && activeDamage ? (
              <View style={styles.overlayLayer}>
                <DamageMaskLayer damage={activeDamage} />
              </View>
            ) : null}
            <View style={styles.overlayControlWrap}>
              <View style={{ flex: 1 }}>
                <Text style={styles.overlayControlTitle}>AI damage overlay</Text>
                <Text style={styles.overlayControlSub} numberOfLines={1}>
                  {showOverlay && activeDamage
                    ? `Showing #${rankedDamages.findIndex((item) => item.id === activeDamage.id) + 1} · ${activeDamage.type}`
                    : 'Off · viewing the clean source image'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="AI damage overlay"
                accessibilityState={{ checked: showOverlay }}
                hitSlop={8}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowOverlay((visible) => !visible);
                }}
                style={[styles.overlaySwitch, showOverlay && styles.overlaySwitchOn]}
              >
                <View style={[styles.overlaySwitchKnob, showOverlay && styles.overlaySwitchKnobOn]} />
              </Pressable>
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.metricRow}>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricValue}>{damages.length}</Text>
            <Text style={styles.metricLabel}>Detected issues</Text>
          </GlassPanel>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricValue}>{severeCount}</Text>
            <Text style={styles.metricLabel}>Severe findings</Text>
          </GlassPanel>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricValue}>{Math.round(avgConfidence * 100)}%</Text>
            <Text style={styles.metricLabel}>Confidence</Text>
          </GlassPanel>
        </View>

        {scan.noDamageDetected ? (
          <GlassPanel style={styles.clearReportCard}>
            <Ionicons name="checkmark-circle-outline" size={24} color={scannerColors.green} />
            <View style={{ flex: 1 }}>
              <Text style={styles.clearReportTitle}>No damage prediction found</Text>
              <Text style={styles.clearReportText}>
                No YOLO11 instance met the configured confidence threshold. A technician can still perform a manual inspection.
              </Text>
            </View>
          </GlassPanel>
        ) : null}

        {!scan.noDamageDetected && rankedDamages.length ? (
          <View>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionTitle}>Detected damage ranking</Text>
                <Text style={styles.sectionText}>Ranked by severity, confidence, and affected area.</Text>
              </View>
            </View>
            <View style={styles.damageRankingList}>
              {rankedDamages.map((damage, index) => {
                const selected = damage.id === activeDamage?.id;
                const meta = severityMeta[damage.severity];
                return (
                  <Pressable
                    key={damage.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveDamageId(damage.id);
                    }}
                    style={({ pressed }) => [
                      styles.damageRankRow,
                      selected && { borderColor: `${meta.color}88`, backgroundColor: `${meta.color}12` },
                      pressed && { opacity: 0.86 },
                    ]}
                  >
                    <View style={[styles.damageRankNumber, selected && { backgroundColor: meta.color }]}>
                      <Text style={styles.damageRankNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.damageRankBody}>
                      <View style={styles.damageRankTop}>
                        <Text style={styles.damageRankTitle} numberOfLines={1}>{damage.type}</Text>
                        <SeverityBadge severity={damage.severity} />
                      </View>
                      <Text style={styles.damageRankComponent} numberOfLines={1}>
                        {damage.affectedArea}
                      </Text>
                      <Text style={styles.damageRankMeta}>
                        {Math.round(damage.confidence * 100)}% confidence · {damage.detectedArea.percentage.toFixed(2)}% area
                      </Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'chevron-forward'}
                      size={19}
                      color={selected ? meta.color : scannerColors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {activeDamage ? (
          <Animated.View entering={FadeInDown.duration(340).delay(90)}>
            <GlassPanel style={styles.insightCard}>
              <View style={styles.insightHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.insightEyebrow}>AI Damage Assessment</Text>
                  <Text style={styles.insightTitle}>{activeDamage.type}</Text>
                </View>
                <SeverityBadge severity={activeDamage.severity} />
              </View>

              <View style={styles.assessmentGrid}>
                <AssessmentField label="Damage type" value={activeDamage.type} />
                <AssessmentField label="Affected component" value={activeDamage.affectedArea} />
                <AssessmentField
                  label="Confidence score"
                  value={`${Math.round(activeDamage.confidence * 100)}%`}
                  accent={scannerColors.orange}
                />
                <AssessmentField
                  label="Severity"
                  value={activeDamage.severityLabel}
                  accent={severityMeta[activeDamage.severity].color}
                />
                <AssessmentField
                  label="Detection area"
                  value={`${activeDamage.detectedArea.percentage.toFixed(2)}%`}
                  accent={scannerColors.orangeSoft}
                />
              </View>
              <ConfidenceMeter value={activeDamage.confidence} />
              <View style={styles.insightDivider} />
              <View style={styles.insightBlock}>
                <Text style={styles.insightBlockTitle}>Possible cause analysis</Text>
                <Text style={styles.insightBlockText}>{causeForDamage(activeDamage)}</Text>
              </View>
              <View style={styles.insightBlock}>
                <Text style={styles.insightBlockTitle}>Recommended action</Text>
                <Text style={styles.insightBlockText}>
                  {activeDamage.recommendation || `Prioritize ${activeDamage.type.toLowerCase()} correction on ${activeDamage.affectedArea} before final coating or protection work.`}
                </Text>
              </View>
            </GlassPanel>
          </Animated.View>
        ) : null}

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>Smart repair intelligence</Text>
            <Text style={styles.sectionText}>AI-ranked repair plan for technician review.</Text>
          </View>
          <Pressable
            style={styles.optimizeBtn}
            onPress={() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)}
          >
            <Ionicons name="sparkles" size={14} color={scannerColors.orange} />
            <Text style={styles.optimizeText}>Optimize</Text>
          </Pressable>
        </View>

        <View style={styles.repairList}>
          {repairLines.map((line, index) => (
            <RepairIntelligenceCard key={line.id} line={line} index={index} />
          ))}
        </View>

        <GlassPanel>
          <View style={styles.summaryHead}>
            <Ionicons name="document-text-outline" size={20} color={scannerColors.orange} />
            <Text style={styles.summaryTitle}>Detected issues summary</Text>
          </View>
          <Text style={styles.summaryText}>{scan.summary}</Text>
          <Text style={styles.summaryMeta}>
            Source: {scan.source} - Model: {scan.model} - Images: {displayImageCount}
          </Text>
          <View style={styles.handoffDivider} />
          <Text style={styles.handoffTitle}>Diagnosis data ready for</Text>
          <View style={styles.handoffGrid}>
            {[
              { label: 'Repair advice', icon: 'sparkles-outline' as const },
              { label: 'Cost estimate', icon: 'cash-outline' as const },
              { label: 'Meshy 3D', icon: 'cube-outline' as const },
              { label: 'AR overlay', icon: 'aperture-outline' as const },
            ].map((item) => (
              <View key={item.label} style={styles.handoffItem}>
                <Ionicons name={item.icon} size={15} color={scannerColors.orange} />
                <Text style={styles.handoffItemText}>{item.label}</Text>
                <Ionicons name="checkmark-circle" size={14} color={scannerColors.green} />
              </View>
            ))}
          </View>
        </GlassPanel>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/(customer)/scan/ar-view' as never);
          }}
          style={({ pressed }) => [styles.webArRow, pressed && { opacity: 0.88 }]}
        >
          <LinearGradient
            colors={['rgba(59,130,246,0.22)', 'rgba(59,130,246,0.08)']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          />
          <Ionicons name="cube-outline" size={20} color="#93C5FD" />
          <View style={{ flex: 1 }}>
            <Text style={styles.webArRowTitle}>Next: Browser WebAR preview</Text>
            <Text style={styles.webArRowSub}>
              Generate the GLB, then open the MindAR repair simulation in the browser.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={scannerColors.textMuted} />
        </Pressable>
      </ScrollView>

      <BottomActionBar
        primaryLabel="Generate 3D Model"
        primaryIcon="cube-outline"
        onPrimaryPress={() => router.push('/(customer)/scan/ar-view' as never)}
        secondaryLabel="Skip to Cost Estimate"
        onSecondaryPress={() => router.push('/(customer)/scan/estimate' as never)}
      />
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 16,
  },
  heroCard: {
    borderColor: 'rgba(255,107,53,0.22)',
  },
  heroInner: {
    minHeight: 440,
    padding: 0,
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  heroTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
    zIndex: 3,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overlayLayer: {
    ...StyleSheet.absoluteFill,
    zIndex: 2,
  },
  maskLayer: {
    ...StyleSheet.absoluteFill,
  },
  overlayControlWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(4,6,9,0.80)',
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  overlayControlTitle: {
    color: scannerColors.text,
    fontSize: 12,
    fontWeight: '900',
  },
  overlayControlSub: {
    color: scannerColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  overlaySwitch: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  overlaySwitchOn: {
    backgroundColor: scannerColors.orange,
  },
  overlaySwitchKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  overlaySwitchKnobOn: {
    alignSelf: 'flex-end',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
  },
  metricValue: {
    color: scannerColors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  metricLabel: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 3,
  },
  clearReportCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderColor: 'rgba(16,185,129,0.32)',
  },
  clearReportTitle: {
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  clearReportText: {
    color: scannerColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 3,
  },
  damageRankingList: {
    gap: 9,
    marginTop: 12,
  },
  damageRankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: 12,
  },
  damageRankNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  damageRankNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  damageRankBody: {
    flex: 1,
    minWidth: 0,
  },
  damageRankTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  damageRankTitle: {
    flex: 1,
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  damageRankComponent: {
    color: scannerColors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  damageRankMeta: {
    color: scannerColors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  insightCard: {
    borderColor: 'rgba(255,107,53,0.18)',
  },
  insightHead: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  insightEyebrow: {
    color: scannerColors.orange,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  insightTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  assessmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginBottom: 16,
  },
  assessmentField: {
    width: '48%',
    minHeight: 66,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(255,255,255,0.035)',
    padding: 11,
  },
  assessmentLabel: {
    color: scannerColors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  assessmentValue: {
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 5,
  },
  insightDivider: {
    height: 1,
    backgroundColor: scannerColors.border,
    marginVertical: 16,
  },
  insightBlock: {
    marginBottom: 12,
  },
  insightBlockTitle: {
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
  },
  insightBlockText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: scannerColors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionText: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  optimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.28)',
    backgroundColor: 'rgba(255,107,53,0.10)',
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  optimizeText: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  repairList: {
    gap: 10,
  },
  summaryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  summaryTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  summaryText: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  summaryMeta: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 12,
  },
  handoffDivider: {
    height: 1,
    backgroundColor: scannerColors.border,
    marginVertical: 14,
  },
  handoffTitle: {
    color: scannerColors.text,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 9,
  },
  handoffGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  handoffItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.18)',
    backgroundColor: 'rgba(255,107,53,0.07)',
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  handoffItemText: {
    flex: 1,
    color: scannerColors.textSoft,
    fontSize: 10,
    fontWeight: '800',
  },
  webArRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(147,197,253,0.28)',
    marginTop: 4,
  },
  webArRowTitle: {
    color: '#E0F2FE',
    fontSize: 14,
    fontWeight: '900',
  },
  webArRowSub: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 15,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 16,
  },
  emptyText: {
    color: scannerColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
  },
});
