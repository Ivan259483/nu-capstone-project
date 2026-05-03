import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Toast } from '@/components/ui/PremiumToast';
import {
  AiPill,
  BottomActionBar,
  formatPhp,
  GlassPanel,
  PipelineStepper,
  ScannerBackground,
  ScannerHeader,
  SeverityBadge,
  scannerColors,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import { vehicleService } from '@/services/api/vehicleService';
import type { Vehicle } from '@/services/api/types';

const PACKAGE_KEY_BY_NAME: Record<string, string> = {
  'SPF 80 Essential': 'spf80',
  'SPF 89 Advanced': 'spf89',
  'SPF 99 Premium': 'spf99',
};

const buildAiNotes = (
  summary: string,
  damages: { affectedArea: string; type: string; severity: string }[],
  estimateText: string
) => {
  const lines = [`AI Vehicle Intelligence Scan - ${summary || `${damages.length} issue(s) detected.`}`];
  lines.push(`Estimate: ${estimateText}`);
  if (damages.length) {
    lines.push('');
    lines.push('Detected issues:');
    damages.forEach((damage) => {
      lines.push(`- ${damage.affectedArea}: ${damage.type} (${damage.severity})`);
    });
  }
  return lines.join('\n');
};

export default function ConfirmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const estimate = useAiScanStore((state) => state.estimate);
  const selectedIds = useAiScanStore((state) => state.selectedLineItemIds);
  const storedVehicleId = useAiScanStore((state) => state.vehicleId);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(storedVehicleId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const loadVehicles = async () => {
      try {
        const list = await vehicleService.getMyVehicles();
        if (!alive) return;
        setVehicles(list);
        const preferred = storedVehicleId
          ? list.find((vehicle) => vehicle.id === storedVehicleId || vehicle._id === storedVehicleId)
          : null;
        setSelectedVehicleId((current) => current || preferred?.id || list[0]?.id || null);
      } catch (error) {
        console.warn('[ai-scan/confirm] vehicle load failed:', error);
      } finally {
        if (alive) setVehiclesLoading(false);
      }
    };
    loadVehicles();
    return () => {
      alive = false;
    };
  }, [storedVehicleId]);

  const selectedDamages = useMemo(() => {
    if (!scan || !estimate) return [];
    const selectedDamageIds = new Set(
      estimate.lineItems
        .filter((line) => selectedIds.includes(line.id))
        .map((line) => line.damageId)
    );
    const filtered = scan.damages.filter((damage) => selectedDamageIds.has(damage.id));
    return filtered.length ? filtered : scan.damages;
  }, [estimate, scan, selectedIds]);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === selectedVehicleId);
  const selectedLines = estimate?.lineItems.filter((line) => selectedIds.includes(line.id)) ?? [];
  const selectedMax = selectedLines.reduce((sum, line) => sum + line.subtotalMax, 0);
  const packageKey = scan?.recommendedPackage
    ? PACKAGE_KEY_BY_NAME[scan.recommendedPackage] || 'spf89'
    : 'spf89';

  const confirmAndBook = useCallback(() => {
    if (!scan || !estimate) return;
    if (!selectedVehicleId || vehicles.length === 0) {
      Toast.show('Please select or add a vehicle before confirming.', 'warning');
      return;
    }

    setBusy(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const estimateText = selectedMax > 0 ? formatPhp(selectedMax) : estimate.formattedTotal;
    const notes = buildAiNotes(
      scan.summary,
      selectedDamages.map((damage) => ({
        affectedArea: damage.affectedArea,
        type: damage.type,
        severity: damage.severity,
      })),
      estimateText
    );

    aiScanStore.setVehicleId(selectedVehicleId);
    aiScanStore.setNotes(notes);

    setTimeout(() => {
      router.replace({
        pathname: '/(customer)/book',
        params: {
          vehicleId: selectedVehicleId,
          pkg: packageKey,
          notes,
          step: '1',
        },
      } as never);
    }, 240);
  }, [
    estimate,
    packageKey,
    router,
    scan,
    selectedDamages,
    selectedMax,
    selectedVehicleId,
    vehicles.length,
  ]);

  const startNewScan = useCallback(() => {
    aiScanStore.reset();
    router.replace('/(customer)/scan' as never);
  }, [router]);

  if (!scan || !estimate) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader title="Customer Approval" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="checkmark-done-outline" size={56} color={scannerColors.textMuted} />
          <Text style={styles.emptyTitle}>No approval package</Text>
          <Text style={styles.emptyText}>Complete the AI estimate before approval.</Text>
        </View>
      </ScannerBackground>
    );
  }

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="Customer Approval"
        title="Confirm Repair Plan"
        onBack={() => router.back()}
        right={<Ionicons name="checkmark-done-outline" size={20} color={scannerColors.cyan} />}
      />
      <PipelineStepper currentIndex={5} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(420)}>
          <GlassPanel style={styles.heroCard} intense>
            <AiPill label="Approval ready" icon="shield-checkmark-outline" />
            <Text style={styles.heroTitle}>{scan.recommendedPackage}</Text>
            <Text style={styles.heroText}>{scan.summary}</Text>
            <View style={styles.heroStats}>
              <View>
                <Text style={styles.statValue}>{scan.damages.length}</Text>
                <Text style={styles.statLabel}>Damage zones</Text>
              </View>
              <View>
                <Text style={styles.statValue}>{selectedLines.length}</Text>
                <Text style={styles.statLabel}>Approved repairs</Text>
              </View>
              <View>
                <Text style={styles.statValue}>{formatPhp(selectedMax || estimate.totalEstimate)}</Text>
                <Text style={styles.statLabel}>Estimate</Text>
              </View>
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Vehicle receiving plan</Text>
          <Text style={styles.sectionText}>
            {vehiclesLoading ? 'Loading garage' : `${vehicles.length} saved vehicle(s)`}
          </Text>
        </View>

        <View style={styles.vehicleList}>
          {vehicles.map((vehicle) => {
            const active = vehicle.id === selectedVehicleId;
            return (
              <Pressable
                key={vehicle.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelectedVehicleId(vehicle.id);
                }}
              >
                <GlassPanel
                  style={[styles.vehicleCard, active && styles.vehicleCardActive]}
                  contentStyle={styles.vehicleInner}
                >
                  <View style={styles.vehicleIcon}>
                    <Ionicons
                      name="car-sport-outline"
                      size={22}
                      color={active ? scannerColors.cyan : scannerColors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </Text>
                    <Text style={styles.vehicleMeta}>
                      {vehicle.plateNumber || 'No plate'} {vehicle.color ? `- ${vehicle.color}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <Ionicons name="checkmark" size={14} color="#041014" /> : null}
                  </View>
                </GlassPanel>
              </Pressable>
            );
          })}
        </View>

        {vehicles.length === 0 && !vehiclesLoading ? (
          <GlassPanel style={styles.noVehicleCard}>
            <Text style={styles.noVehicleTitle}>No vehicle saved</Text>
            <Text style={styles.noVehicleText}>
              Add a vehicle in your garage before sending the AI repair plan to the shop.
            </Text>
          </GlassPanel>
        ) : null}

        <GlassPanel>
          <View style={styles.approvalHead}>
            <Ionicons name="document-text-outline" size={20} color={scannerColors.orange} />
            <Text style={styles.approvalTitle}>Approval summary</Text>
          </View>
          <View style={styles.damageList}>
            {selectedDamages.map((damage) => (
              <View key={damage.id} style={styles.damageRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.damageArea}>{damage.affectedArea}</Text>
                  <Text style={styles.damageType}>{damage.type}</Text>
                </View>
                <SeverityBadge severity={damage.severity} />
              </View>
            ))}
          </View>
        </GlassPanel>

        <GlassPanel style={styles.handoffCard}>
          <View style={styles.handoffHead}>
            <Ionicons name="navigate-outline" size={20} color={scannerColors.green} />
            <Text style={styles.handoffTitle}>Shop handoff</Text>
          </View>
          <Text style={styles.handoffText}>
            Confirmation sends the AI summary into the booking wizard with the vehicle, recommended package, damage notes, and repair estimate context already attached.
          </Text>
          {selectedVehicle ? (
            <Text style={styles.handoffMeta}>
              Assigned to: {selectedVehicle.make} {selectedVehicle.model} - {selectedVehicle.plateNumber}
            </Text>
          ) : null}
        </GlassPanel>
      </ScrollView>

      <BottomActionBar
        primaryLabel={busy ? 'Preparing Booking' : 'Approve & Send to Shop'}
        primaryIcon="send"
        disabled={busy || vehicles.length === 0 || !selectedVehicleId}
        onPrimaryPress={confirmAndBook}
        secondaryLabel="Start New Scan"
        onSecondaryPress={startNewScan}
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
    borderColor: 'rgba(53,217,255,0.25)',
  },
  heroTitle: {
    color: scannerColors.text,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginTop: 16,
  },
  heroText: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  heroStats: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  statValue: {
    color: scannerColors.text,
    fontSize: 17,
    fontWeight: '900',
  },
  statLabel: {
    color: scannerColors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    marginTop: 3,
    textTransform: 'uppercase',
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
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
  },
  vehicleList: {
    gap: 10,
  },
  vehicleCard: {
    borderRadius: 22,
  },
  vehicleCardActive: {
    borderColor: 'rgba(53,217,255,0.52)',
  },
  vehicleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  vehicleName: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  vehicleMeta: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: scannerColors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    backgroundColor: scannerColors.cyan,
    borderColor: scannerColors.cyan,
  },
  noVehicleCard: {
    borderColor: 'rgba(245,158,11,0.25)',
  },
  noVehicleTitle: {
    color: scannerColors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  noVehicleText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 6,
  },
  approvalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  approvalTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  damageList: {
    gap: 12,
  },
  damageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: scannerColors.border,
  },
  damageArea: {
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  damageType: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  handoffCard: {
    borderColor: 'rgba(16,185,129,0.2)',
  },
  handoffHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  handoffTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  handoffText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  handoffMeta: {
    color: scannerColors.green,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
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
