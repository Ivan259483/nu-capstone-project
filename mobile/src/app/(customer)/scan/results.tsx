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

function DamageOverlay({
  damage,
  active,
  onPress,
}: {
  damage: AiScanDamage;
  active: boolean;
  onPress: () => void;
}) {
  const meta = severityMeta[damage.severity];
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.damageBox,
        {
          left: `${damage.coordinates.x * 100}%`,
          top: `${damage.coordinates.y * 100}%`,
          width: `${damage.coordinates.width * 100}%`,
          height: `${damage.coordinates.height * 100}%`,
          borderColor: meta.color,
          backgroundColor: meta.bg,
        },
        active && styles.damageBoxActive,
      ]}
    >
      <LinearGradient
        colors={[`${meta.color}33`, 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.damageDot, { backgroundColor: meta.color }]} />
      <View style={[styles.damageLabel, { borderColor: `${meta.color}88` }]}>
        <Text style={styles.damageLabelText}>{Math.round(damage.confidence * 100)}%</Text>
      </View>
    </Pressable>
  );
}

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const scanError = useAiScanStore((state) => state.scanError);
  const capturedImages = useAiScanStore((state) => state.capturedImages);
  const [activeDamageId, setActiveDamageId] = useState<string | null>(
    scan?.damages[0]?.id ?? null
  );

  const damages = scan?.damages ?? [];
  const activeDamage = damages.find((damage) => damage.id === activeDamageId) ?? damages[0];
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
  const highCount = damages.filter((damage) => damage.severity === 'high').length;

  const repairLines = useMemo(
    () =>
      [...(scan?.estimate.lineItems ?? [])].sort((a, b) => {
        const rank = { high: 3, medium: 2, low: 1 };
        return rank[b.severity] - rank[a.severity] || b.confidence - a.confidence;
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
              <AiPill label="AI diagnostic layer" icon="radio-outline" />
              <View style={styles.conditionBadge}>
                <Text style={styles.conditionText}>{scan.overallCondition}</Text>
              </View>
            </View>
            <View style={styles.overlayLayer}>
              {damages.map((damage) => (
                <DamageOverlay
                  key={damage.id}
                  damage={damage}
                  active={damage.id === activeDamage?.id}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActiveDamageId(damage.id);
                  }}
                />
              ))}
            </View>
            <View style={styles.heatLegend}>
              <Text style={styles.heatLegendText}>Heatmap intensity</Text>
              <View style={styles.heatBar}>
                <LinearGradient
                  colors={[scannerColors.green, scannerColors.yellow, scannerColors.red]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.metricRow}>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricValue}>{damages.length}</Text>
            <Text style={styles.metricLabel}>Detected issues</Text>
          </GlassPanel>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricValue}>{highCount}</Text>
            <Text style={styles.metricLabel}>Critical zones</Text>
          </GlassPanel>
          <GlassPanel style={styles.metricCard}>
            <Text style={styles.metricValue}>{Math.round(avgConfidence * 100)}%</Text>
            <Text style={styles.metricLabel}>Confidence</Text>
          </GlassPanel>
        </View>

        {activeDamage ? (
          <Animated.View entering={FadeInDown.duration(340).delay(90)}>
            <GlassPanel style={styles.insightCard}>
              <View style={styles.insightHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.insightEyebrow}>Tap-to-inspect damage point</Text>
                  <Text style={styles.insightTitle}>{activeDamage.affectedArea}</Text>
                </View>
                <SeverityBadge severity={activeDamage.severity} />
              </View>
              <Text style={styles.insightDescription}>
                {activeDamage.description || activeDamage.type}
              </Text>
              <ConfidenceMeter value={activeDamage.confidence} />
              <View style={styles.insightDivider} />
              <View style={styles.insightBlock}>
                <Text style={styles.insightBlockTitle}>Possible cause analysis</Text>
                <Text style={styles.insightBlockText}>{causeForDamage(activeDamage)}</Text>
              </View>
              <View style={styles.insightBlock}>
                <Text style={styles.insightBlockTitle}>Recommended action</Text>
                <Text style={styles.insightBlockText}>
                  Prioritize {activeDamage.type.toLowerCase()} correction on {activeDamage.affectedArea}
                  before final coating or protection work.
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
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.25)',
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
  conditionBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.56)',
    borderWidth: 1,
    borderColor: scannerColors.borderStrong,
  },
  conditionText: {
    color: scannerColors.text,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  overlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  damageBox: {
    position: 'absolute',
    minWidth: 34,
    minHeight: 34,
    borderWidth: 2,
    borderRadius: 12,
    overflow: 'visible',
  },
  damageBoxActive: {
    borderWidth: 3,
    shadowColor: '#fff',
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  damageDot: {
    position: 'absolute',
    top: -7,
    left: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  damageLabel: {
    position: 'absolute',
    right: -8,
    bottom: -14,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.76)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  damageLabelText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  heatLegend: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.62)',
    padding: 12,
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  heatLegendText: {
    color: scannerColors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 8,
  },
  heatBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
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
  insightDescription: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginBottom: 16,
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
