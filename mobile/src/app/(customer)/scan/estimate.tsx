import React, { useCallback, useMemo, useState } from 'react';
import {
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AiPill,
  BottomActionBar,
  ConfidenceMeter,
  CostRangeBar,
  formatPhp,
  GlassPanel,
  PipelineStepper,
  RepairIntelligenceCard,
  ScannerBackground,
  ScannerHeader,
  scannerColors,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import { recomputeAiScanEstimate } from '@/services/api/aiService';

export default function EstimateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const estimate = useAiScanStore((state) => state.estimate);
  const selectedIds = useAiScanStore((state) => state.selectedLineItemIds);
  const [busy, setBusy] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  const lineItems = useMemo(() => estimate?.lineItems ?? [], [estimate?.lineItems]);
  const selectedLines = useMemo(
    () => lineItems.filter((line) => selectedIds.includes(line.id)),
    [lineItems, selectedIds]
  );

  const selectedMin = selectedLines.reduce((sum, line) => sum + line.subtotalMin, 0);
  const selectedMax = selectedLines.reduce((sum, line) => sum + line.subtotalMax, 0);
  const recommendedTotal = estimate?.recommendedPackage?.premiumPrice || estimate?.totalEstimate || selectedMax;
  const confidence = scan?.damages.length
    ? scan.damages.reduce((sum, damage) => sum + damage.confidence, 0) / scan.damages.length
    : 0;

  const costBuckets = useMemo(() => {
    const total = Math.max(selectedMax, 0);
    return [
      { label: 'Labor', value: Math.round(total * 0.42), icon: 'construct-outline' as const },
      { label: 'Paint and materials', value: Math.round(total * 0.33), icon: 'color-palette-outline' as const },
      { label: 'Parts and prep', value: Math.round(total * 0.18), icon: 'hardware-chip-outline' as const },
      { label: 'QA and finish', value: Math.round(total * 0.07), icon: 'shield-checkmark-outline' as const },
    ];
  }, [selectedMax]);

  const recompute = useCallback(async () => {
    if (!scan) return;
    setBusy(true);
    try {
      const selectedDamageIds = new Set(selectedLines.map((line) => line.damageId));
      const damages = scan.damages.filter((damage) => selectedDamageIds.has(damage.id));
      const nextEstimate = await recomputeAiScanEstimate(damages.length ? damages : scan.damages);
      aiScanStore.setEstimate(nextEstimate);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.warn('[ai-scan/estimate] recompute failed:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } finally {
      setBusy(false);
    }
  }, [scan, selectedLines]);

  const continueToApproval = useCallback(() => {
    if (selectedIds.length === 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push('/(customer)/scan/confirm' as never);
  }, [router, selectedIds.length]);

  if (!scan || !estimate) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader
          title="Cost Intelligence"
          eyebrow="AI Estimate"
          onBack={() => router.back()}
        />
        <View style={styles.empty}>
          <Ionicons name="cash-outline" size={56} color={scannerColors.textMuted} />
          <Text style={styles.emptyTitle}>No estimate yet</Text>
          <Text style={styles.emptyText}>Run an AI inspection to generate repair pricing.</Text>
        </View>
      </ScannerBackground>
    );
  }

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="Intelligent Cost Estimation"
        title="Pricing Engine"
        onBack={() => router.back()}
        right={
          <Pressable onPress={recompute} disabled={busy} hitSlop={10}>
            <Ionicons
              name={busy ? 'hourglass-outline' : 'refresh-outline'}
              size={20}
              color={busy ? scannerColors.textMuted : scannerColors.orange}
            />
          </Pressable>
        }
      />
      <PipelineStepper currentIndex={4} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(420)}>
          <GlassPanel style={styles.heroCard} intense>
            <AiPill label="Insurance-ready estimate" icon="document-text-outline" />
            <Text style={styles.heroTitle}>{formatPhp(recommendedTotal)}</Text>
            <Text style={styles.heroSubtitle}>
              AI recommended total for selected repairs and package protection.
            </Text>
            <CostRangeBar min={selectedMin} max={selectedMax || recommendedTotal} recommended={recommendedTotal} />
            <View style={styles.confidenceWrap}>
              <ConfidenceMeter value={confidence} label="Estimate accuracy" />
            </View>
          </GlassPanel>
        </Animated.View>

        {estimate.recommendedPackage ? (
          <GlassPanel style={styles.packageCard}>
            <View style={styles.packageHead}>
              <View style={styles.packageIcon}>
                <Ionicons name="diamond-outline" size={24} color={estimate.recommendedPackage.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.packageEyebrow}>AI recommended package</Text>
                <Text style={styles.packageTitle}>{estimate.recommendedPackage.name}</Text>
                <Text style={styles.packageText}>{estimate.recommendedPackage.description}</Text>
              </View>
            </View>
            <View style={styles.packageFooter}>
              <Text style={styles.packagePrice}>{estimate.recommendedPackage.formattedPrice}</Text>
              <Text style={styles.packageWarranty}>
                {estimate.recommendedPackage.durationYears} year protection
              </Text>
            </View>
          </GlassPanel>
        ) : null}

        <View style={styles.sectionHead}>
          <View>
            <Text style={styles.sectionTitle}>Repair scope</Text>
            <Text style={styles.sectionText}>
              {selectedLines.length} of {lineItems.length} items selected
            </Text>
          </View>
          <Pressable style={styles.recalcBtn} onPress={recompute} disabled={busy}>
            <Ionicons name="sparkles" size={14} color={scannerColors.orange} />
            <Text style={styles.recalcText}>{busy ? 'Updating' : 'Reprice'}</Text>
          </Pressable>
        </View>

        <View style={styles.repairList}>
          {lineItems.map((line, index) => (
            <RepairIntelligenceCard
              key={line.id}
              line={line}
              index={index}
              selected={selectedIds.includes(line.id)}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                aiScanStore.toggleLineItem(line.id);
              }}
            />
          ))}
        </View>

        <GlassPanel>
          <View style={styles.breakdownHead}>
            <Ionicons name="calculator-outline" size={20} color={scannerColors.orange} />
            <Text style={styles.breakdownTitle}>Transparent cost breakdown</Text>
          </View>
          <View style={styles.bucketList}>
            {costBuckets.map((bucket) => (
              <View key={bucket.label} style={styles.bucketRow}>
                <View style={styles.bucketLeft}>
                  <Ionicons name={bucket.icon} size={17} color={scannerColors.orange} />
                  <Text style={styles.bucketLabel}>{bucket.label}</Text>
                </View>
                <Text style={styles.bucketValue}>{formatPhp(bucket.value)}</Text>
              </View>
            ))}
          </View>
        </GlassPanel>

        <GlassPanel>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setWhyOpen((value) => !value);
            }}
            style={styles.whyHead}
          >
            <View style={styles.whyLeft}>
              <Ionicons name="help-circle-outline" size={20} color={scannerColors.orange} />
              <Text style={styles.whyTitle}>Why this cost?</Text>
            </View>
            <Ionicons
              name={whyOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={scannerColors.textMuted}
            />
          </Pressable>
          {whyOpen ? (
            <View style={styles.whyBody}>
              <Text style={styles.whyText}>
                Pricing is based on AI-detected severity, affected panel area, confidence, recommended service level, and package warranty coverage. A technician can adjust the final quote after in-shop validation.
              </Text>
              {estimate.assumptions.map((item) => (
                <View key={item} style={styles.assumptionRow}>
                  <View style={styles.assumptionDot} />
                  <Text style={styles.assumptionText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </GlassPanel>

        <GlassPanel style={styles.insuranceCard}>
          <View style={styles.insuranceHead}>
            <Ionicons name="briefcase-outline" size={20} color={scannerColors.green} />
            <Text style={styles.insuranceTitle}>Insurance-ready summary</Text>
          </View>
          <Text style={styles.insuranceText}>
            {scan.damages.length} AI-detected damage area(s), {selectedLines.length} approved repair item(s), estimated range {formatPhp(selectedMin)} to {formatPhp(selectedMax)}.
          </Text>
        </GlassPanel>
      </ScrollView>

      <BottomActionBar
        primaryLabel="Confirm & Send to Shop"
        primaryIcon="send"
        disabled={selectedIds.length === 0}
        onPrimaryPress={continueToApproval}
        secondaryLabel="Review 3D Simulation"
        onSecondaryPress={() => router.push('/(customer)/scan/ar-view' as never)}
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
    borderColor: 'rgba(255,107,53,0.25)',
  },
  heroTitle: {
    color: scannerColors.text,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: -1.2,
    marginTop: 18,
  },
  heroSubtitle: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 6,
    marginBottom: 18,
  },
  confidenceWrap: {
    marginTop: 18,
  },
  packageCard: {
    borderColor: 'rgba(255,107,53,0.18)',
  },
  packageHead: {
    flexDirection: 'row',
    gap: 14,
  },
  packageIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  packageEyebrow: {
    color: scannerColors.orange,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  packageTitle: {
    color: scannerColors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  packageText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 5,
  },
  packageFooter: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  packagePrice: {
    color: scannerColors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  packageWarranty: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  recalcBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.28)',
    backgroundColor: 'rgba(255,107,53,0.10)',
  },
  recalcText: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  repairList: {
    gap: 10,
  },
  breakdownHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  breakdownTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  bucketList: {
    gap: 12,
  },
  bucketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: scannerColors.border,
  },
  bucketLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  bucketLabel: {
    color: scannerColors.textSoft,
    fontSize: 13,
    fontWeight: '800',
  },
  bucketValue: {
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  whyHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  whyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  whyTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  whyBody: {
    marginTop: 14,
    gap: 10,
  },
  whyText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  assumptionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  assumptionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: scannerColors.orange,
    marginTop: 6,
  },
  assumptionText: {
    flex: 1,
    color: scannerColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  insuranceCard: {
    borderColor: 'rgba(16,185,129,0.2)',
  },
  insuranceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  insuranceTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  insuranceText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
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
