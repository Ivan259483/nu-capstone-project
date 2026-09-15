import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BeforeAfterSlider from '@/features/ai-scan/components/BeforeAfterSlider';
import {
  BottomActionBar,
  GlassPanel,
  PipelineStepper,
  ScannerBackground,
  ScannerHeader,
  scannerColors,
} from '@/features/ai-scan/components/PremiumScanner';
import {
  buildRepairSourceOptions,
  getRepairPreviewMountAction,
  waitForPersistedRepairSource,
  type RepairVisualizationProgress,
} from '@/features/ai-scan/repairVisualization';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import {
  fetchAiScanById,
  pollRepairVisualizationStatus,
  startRepairVisualization,
} from '@/services/api/aiService';
import { AI_SCAN_ROUTES } from '@/features/ai-scan/threeDPreparation';

const DISCLAIMER_TITLE = 'AI-Generated Repair Visualization';
const DISCLAIMER_TEXT =
  'This image shows an AI-generated preview of a possible repaired outcome, not an actual restoration. Actual repair results may vary.';

export default function RepairPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ scanId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const scan = useAiScanStore((state) => state.scan);
  const capturedImages = useAiScanStore((state) => state.capturedImages);
  const workflow = useAiScanStore((state) => state.workflow);
  const status = useAiScanStore((state) => state.repairVisualizationStatus);
  const repairStateScanId = useAiScanStore((state) => state.repairVisualizationScanId);
  const beforeUrl = useAiScanStore((state) => state.repairVisualizationBeforeUrl);
  const afterUrl = useAiScanStore((state) => state.repairVisualizationAfterUrl);
  const progress = useAiScanStore((state) => state.repairVisualizationProgress);
  const message = useAiScanStore((state) => state.repairVisualizationMessage);
  const precedingTasks = useAiScanStore((state) => state.repairVisualizationPrecedingTasks);
  const storedSourceIndex = useAiScanStore((state) => state.repairVisualizationSourceImageIndex);
  const runningRef = useRef(false);
  const hydrationRef = useRef(false);
  const cancelledRef = useRef(false);
  const mountActionsRef = useRef(new Set<string>());
  const selectionScanIdRef = useRef<string | null>(null);
  const [resolutionMessage, setResolutionMessage] = useState('');

  const routeScanId = String(
    Array.isArray(params.scanId) ? params.scanId[0] : params.scanId || ''
  ).trim();
  const loadedScanId = String(scan?.scanId || '').trim();
  const requestedScanId = routeScanId || loadedScanId;
  const activeScan = requestedScanId && loadedScanId === requestedScanId ? scan : null;

  const sourceOptions = useMemo(
    () => activeScan
      ? buildRepairSourceOptions(activeScan, capturedImages.map((image) => image.uri))
      : [],
    [activeScan, capturedImages]
  );
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const selectedSource = sourceOptions.find((option) => option.imageIndex === selectedImageIndex)
    || sourceOptions[0]
    || null;

  useEffect(() => {
    const newScan = selectionScanIdRef.current !== requestedScanId;
    const selectionStillExists = sourceOptions.some(
      (option) => option.imageIndex === selectedImageIndex
    );
    if (!newScan && selectionStillExists) return;
    selectionScanIdRef.current = requestedScanId || null;
    const storedSelectionBelongsToScan = repairStateScanId === requestedScanId
      && storedSourceIndex !== null
      && sourceOptions.some((option) => option.imageIndex === storedSourceIndex);
    setSelectedImageIndex(
      storedSelectionBelongsToScan ? storedSourceIndex : sourceOptions[0]?.imageIndex ?? null
    );
  }, [
    repairStateScanId,
    requestedScanId,
    selectedImageIndex,
    sourceOptions,
    storedSourceIndex,
  ]);

  const active = status === 'queued' || status === 'processing';
  const stillProcessing = status === 'still_processing';
  const ready = status === 'ready' && Boolean(beforeUrl && afterUrl);
  const failed = status === 'failed';
  const sourceLocked = active || stillProcessing || ready;
  const comparisonWidth = Math.max(240, Math.min(windowWidth - 64, 520));

  const applyProgress = useCallback((next: RepairVisualizationProgress) => {
    if (__DEV__) {
      console.log(
        `[RepairPreview] scanId=${requestedScanId || '(missing)'} status=${next.status}`
      );
    }
    aiScanStore.setRepairVisualizationProgress(next);
  }, [requestedScanId]);

  const pollExisting = useCallback(async (seed?: RepairVisualizationProgress | null) => {
    const scanId = requestedScanId;
    if (!scanId || runningRef.current) return;
    runningRef.current = true;
    try {
      const result = await pollRepairVisualizationStatus(scanId, {
        intervalMs: 3_500,
        timeoutMs: 600_000,
        seed: seed || null,
        onProgress: applyProgress,
        shouldCancel: () => cancelledRef.current,
      });
      if (!cancelledRef.current && result.status !== 'cancelled') applyProgress(result);
    } catch (error) {
      // A rejected status request is a transport problem, not a Meshy failure.
      // Preserve the current task ID and offer Continue Waiting.
      if (!cancelledRef.current) {
        const current = aiScanStore.getState();
        applyProgress({
          status: 'still_processing',
          taskId: current.repairVisualizationTaskId,
          beforeImageUrl: current.repairVisualizationBeforeUrl,
          afterImageUrl: current.repairVisualizationAfterUrl,
          sourceView: current.repairVisualizationSourceView,
          sourceImageIndex: current.repairVisualizationSourceImageIndex,
          sourceDamageId: current.repairVisualizationSourceDamageId,
          aiModel: current.repairVisualizationAiModel,
          configuredCreditsPerImage: null,
          consumedCredits: current.repairVisualizationConsumedCredits,
          progress: current.repairVisualizationProgress,
          precedingTasks: current.repairVisualizationPrecedingTasks,
          message: error instanceof Error
            ? error.message
            : 'Repair visualization is still processing.',
        });
      }
    } finally {
      runningRef.current = false;
    }
  }, [applyProgress, requestedScanId]);

  const hydrateActiveScan = useCallback(async () => {
    if (!requestedScanId || hydrationRef.current) return null;
    hydrationRef.current = true;
    setResolutionMessage('Loading the current scan…');
    try {
      const hydrated = await fetchAiScanById(requestedScanId);
      if (cancelledRef.current) return null;
      aiScanStore.setScan(hydrated);
      setResolutionMessage('');
      return hydrated;
    } catch (error) {
      if (cancelledRef.current) return null;
      const rawMessage = typeof error === 'object'
        && error !== null
        && 'message' in error
        && typeof error.message === 'string'
        ? error.message
        : '';
      setResolutionMessage(
        /not found|status code 404/i.test(rawMessage)
          ? 'The current scan was not found on the configured backend. Verify the device API base URL and run the scan again.'
          : rawMessage || 'Could not load the current scan. Check the device connection and try again.'
      );
      return null;
    } finally {
      hydrationRef.current = false;
    }
  }, [requestedScanId]);

  const startGeneration = useCallback(async () => {
    if (!requestedScanId || !selectedSource || runningRef.current) return;
    runningRef.current = true;
    try {
      let source = selectedSource;
      if (!source.isPersisted) {
        setResolutionMessage('Waiting for the selected scan image to finish saving…');
        const resolved = await waitForPersistedRepairSource({
          scanId: requestedScanId,
          imageIndex: selectedSource.imageIndex,
          fetchScan: fetchAiScanById,
          shouldCancel: () => cancelledRef.current,
        });
        if (!resolved || cancelledRef.current) return;
        aiScanStore.setScan(resolved.scan);
        source = resolved.source;
      }

      const current = aiScanStore.getState();
      const retry = current.repairVisualizationScanId === requestedScanId
        && current.repairVisualizationStatus === 'failed';
      aiScanStore.setRepairVisualizationSource({
        beforeImageUrl: source.previewUri,
        sourceView: source.viewId,
        sourceImageIndex: source.imageIndex,
        sourceDamageId: source.sourceDamageId,
      });
      setResolutionMessage('');
      if (__DEV__) {
        console.log(
          `[RepairPreview] scanId=${requestedScanId} selectedView=${source.viewId}`
        );
      }
      const started = await startRepairVisualization({
        scanId: requestedScanId,
        sourceView: source.viewId,
        selectedImageIndex: source.imageIndex,
        sourceDamageId: source.sourceDamageId,
        retry,
      });
      if (cancelledRef.current) return;
      applyProgress(started);
      runningRef.current = false;
      if (started.status === 'queued' || started.status === 'processing') {
        await pollExisting(started);
      }
    } catch (error) {
      if (cancelledRef.current) return;
      const current = aiScanStore.getState();
      const errorMessage = typeof error === 'object'
        && error !== null
        && 'message' in error
        && typeof error.message === 'string'
        ? error.message
        : 'Couldn’t start a repair preview. Please try again.';
      applyProgress({
        // A rejected POST can be a temporary archive/network condition. Keep
        // Generate available; the backend's atomic claim prevents duplicates
        // if the original request actually reached Meshy.
        status: 'idle',
        taskId: current.repairVisualizationTaskId,
        beforeImageUrl: selectedSource.previewUri,
        afterImageUrl: null,
        sourceView: selectedSource.viewId,
        sourceImageIndex: selectedSource.imageIndex,
        sourceDamageId: selectedSource.sourceDamageId,
        aiModel: null,
        configuredCreditsPerImage: null,
        consumedCredits: null,
        progress: 0,
        precedingTasks: null,
        message: errorMessage,
      });
    } finally {
      runningRef.current = false;
    }
  }, [applyProgress, pollExisting, requestedScanId, selectedSource]);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!requestedScanId) {
      setResolutionMessage('No completed scan ID is available. Return to Results and run the scan again.');
      return;
    }
    if (aiScanStore.prepareRepairVisualizationForScan(requestedScanId)) return;

    const action = getRepairPreviewMountAction({
      requestedScanId,
      loadedScanId: loadedScanId || null,
      repairStateScanId,
      status,
      hasPersistedSource: Boolean(selectedSource?.isPersisted),
    });
    const taskKey = aiScanStore.getState().repairVisualizationTaskId || 'none';
    const actionKey = `${requestedScanId}:${action}:${taskKey}`;
    if (mountActionsRef.current.has(actionKey)) return;
    mountActionsRef.current.add(actionKey);

    if (action === 'hydrate_scan') {
      void hydrateActiveScan();
    } else if (action === 'resolve_source' || action === 'start') {
      void startGeneration();
    } else if (action === 'resume') {
      const current = aiScanStore.getState();
      void pollExisting({
        status: current.repairVisualizationStatus,
        taskId: current.repairVisualizationTaskId,
        beforeImageUrl: current.repairVisualizationBeforeUrl,
        afterImageUrl: current.repairVisualizationAfterUrl,
        sourceView: current.repairVisualizationSourceView,
        sourceImageIndex: current.repairVisualizationSourceImageIndex,
        sourceDamageId: current.repairVisualizationSourceDamageId,
        aiModel: current.repairVisualizationAiModel,
        configuredCreditsPerImage: null,
        consumedCredits: current.repairVisualizationConsumedCredits,
        progress: current.repairVisualizationProgress,
        precedingTasks: current.repairVisualizationPrecedingTasks,
        message: current.repairVisualizationMessage,
      });
    }
  }, [
    hydrateActiveScan,
    loadedScanId,
    pollExisting,
    repairStateScanId,
    requestedScanId,
    selectedSource?.isPersisted,
    startGeneration,
    status,
  ]);

  const continueWaiting = useCallback(() => {
    cancelledRef.current = false;
    const current = aiScanStore.getState();
    void pollExisting({
      status: current.repairVisualizationStatus,
      taskId: current.repairVisualizationTaskId,
      beforeImageUrl: current.repairVisualizationBeforeUrl,
      afterImageUrl: current.repairVisualizationAfterUrl,
      sourceView: current.repairVisualizationSourceView,
      sourceImageIndex: current.repairVisualizationSourceImageIndex,
      sourceDamageId: current.repairVisualizationSourceDamageId,
      aiModel: current.repairVisualizationAiModel,
      configuredCreditsPerImage: null,
      consumedCredits: current.repairVisualizationConsumedCredits,
      progress: current.repairVisualizationProgress,
      precedingTasks: current.repairVisualizationPrecedingTasks,
      message: current.repairVisualizationMessage,
    });
  }, [pollExisting]);

  const skipToEstimate = useCallback(() => {
    aiScanStore.activateWorkflowStage('price');
    router.push(AI_SCAN_ROUTES.estimate as never);
  }, [router]);

  if (!activeScan) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader title="Repair Preview" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="images-outline" size={54} color={scannerColors.textMuted} />
          <Text style={styles.emptyTitle}>Current scan unavailable</Text>
          <Text style={styles.emptyText}>
            {resolutionMessage || 'Return to Results and open Repair Preview from a completed scan.'}
          </Text>
        </View>
      </ScannerBackground>
    );
  }

  const primaryLabel = ready
    ? 'Continue to 3D'
    : status === 'unavailable'
      ? 'Retry Connection'
    : stillProcessing
      ? 'Continue Waiting'
      : failed
        ? 'Retry Visualization'
        : active
          ? 'Generating Repair Preview…'
          : 'Generate Repair Preview';

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="Optional Before / After"
        title="AI Repair Preview"
        onBack={() => router.back()}
        right={<Ionicons name="sparkles-outline" size={20} color={scannerColors.orange} />}
      />
      <PipelineStepper currentIndex={1} stepStates={workflow.stepStates} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Animated.View entering={FadeInDown.duration(360)}>
          <GlassPanel style={styles.sourceCard} intense>
            <Text style={styles.eyebrow}>Repair Preview Source</Text>
            <Text style={styles.sourceTitle}>Choose one inspection view</Text>
            <Text style={styles.sourceDescription}>
              The strongest credible damage view is selected automatically. You can choose another available view before generation.
            </Text>

            {sourceOptions.length > 0 ? (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {sourceOptions.map((option) => {
                    const selected = option.imageIndex === selectedSource?.imageIndex;
                    return (
                      <Pressable
                        key={`${option.viewId}-${option.imageIndex}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: sourceLocked }}
                        disabled={sourceLocked}
                        onPress={() => setSelectedImageIndex(option.imageIndex)}
                        style={[styles.chip, selected && styles.chipSelected, sourceLocked && styles.chipLocked]}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {selectedSource && !ready ? (
                  <View style={styles.sourcePreviewWrap}>
                    <Image source={{ uri: selectedSource.previewUri }} style={styles.sourcePreview} />
                    <View style={styles.sourceBadge}>
                      <Ionicons name="checkmark-circle" size={14} color={scannerColors.green} />
                      <Text style={styles.sourceBadgeText}>{selectedSource.label} selected</Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.noSourceRow}>
                <Ionicons name="cloud-offline-outline" size={22} color={scannerColors.orange} />
                <Text style={styles.noSourceText}>
                  No inspection image is available from stable storage. You can still continue to the cost estimate.
                </Text>
              </View>
            )}
          </GlassPanel>
        </Animated.View>

        {ready && beforeUrl && afterUrl ? (
          <GlassPanel style={styles.comparisonCard} contentStyle={styles.comparisonContent} intense>
            <View style={styles.comparisonLabels}>
              <Text style={styles.beforeLabel}>BEFORE</Text>
              <Text style={styles.afterLabel}>AI-GENERATED AFTER</Text>
            </View>
            <BeforeAfterSlider
              beforeUri={beforeUrl}
              afterUri={afterUrl}
              repairStatus="ready"
              width={comparisonWidth}
            />
          </GlassPanel>
        ) : active || stillProcessing ? (
          <GlassPanel style={styles.statusCard} intense>
            <View style={styles.statusIcon}>
              <Ionicons name={status === 'queued' ? 'time-outline' : 'sparkles-outline'} size={32} color={scannerColors.orange} />
            </View>
            <Text style={styles.statusTitle}>
              {status === 'queued'
                ? 'Waiting in the queue…'
                : stillProcessing
                  ? 'Repair visualization is still processing.'
                  : 'Generating your repair visualization…'}
            </Text>
            <Text style={styles.statusText}>
              {message || 'You can continue waiting or move on to the cost estimate without creating another task.'}
            </Text>
            {precedingTasks !== null ? (
              <Text style={styles.queueText}>{precedingTasks} task{precedingTasks === 1 ? '' : 's'} ahead</Text>
            ) : null}
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, progress))}%` }]} />
            </View>
          </GlassPanel>
        ) : failed || status === 'unavailable' || (status === 'idle' && Boolean(message || resolutionMessage)) ? (
          <GlassPanel style={styles.statusCard}>
            <Ionicons name="alert-circle-outline" size={38} color={scannerColors.red} />
            <Text style={styles.statusTitle}>
              {failed
                ? 'Couldn’t generate a repair preview.'
                : status === 'unavailable'
                  ? 'Repair preview is unavailable.'
                  : 'Repair preview is not ready yet.'}
            </Text>
            <Text style={styles.statusText}>{message || resolutionMessage}</Text>
          </GlassPanel>
        ) : null}

        <GlassPanel style={styles.disclaimerCard}>
          <View style={styles.disclaimerHead}>
            <Ionicons name="information-circle-outline" size={20} color={scannerColors.orange} />
            <Text style={styles.disclaimerTitle}>{DISCLAIMER_TITLE}</Text>
          </View>
          <Text style={styles.disclaimerText}>{DISCLAIMER_TEXT}</Text>
        </GlassPanel>
      </ScrollView>

      <BottomActionBar
        helperText="Optional preview. Only the selected view is sent for generation."
        primaryLabel={primaryLabel}
        primaryIcon={ready ? 'cube-outline' : stillProcessing ? 'hourglass-outline' : failed ? 'refresh-outline' : 'sparkles-outline'}
        disabled={!ready && !stillProcessing && !failed && (!selectedSource || active)}
        onPrimaryPress={() => {
          if (ready) {
            aiScanStore.activateWorkflowStage('3d');
            router.push(AI_SCAN_ROUTES.prepare3d as never);
          } else if (stillProcessing) {
            continueWaiting();
          } else {
            void startGeneration();
          }
        }}
        secondaryLabel="Skip to Cost Estimate"
        onSecondaryPress={skipToEstimate}
      />
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 24, gap: 16 },
  sourceCard: { gap: 10 },
  eyebrow: { color: scannerColors.orange, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  sourceTitle: { color: scannerColors.text, fontSize: 20, fontWeight: '900' },
  sourceDescription: { color: scannerColors.textSoft, fontSize: 13, lineHeight: 20 },
  chipRow: { gap: 8, paddingVertical: 4 },
  chip: { borderWidth: 1, borderColor: scannerColors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: 'rgba(255,255,255,0.04)' },
  chipSelected: { borderColor: scannerColors.orange, backgroundColor: 'rgba(255,107,53,0.14)' },
  chipLocked: { opacity: 0.7 },
  chipText: { color: scannerColors.textMuted, fontSize: 12, fontWeight: '800' },
  chipTextSelected: { color: scannerColors.orangeSoft },
  sourcePreviewWrap: { height: 250, borderRadius: 16, overflow: 'hidden', marginTop: 4, backgroundColor: '#09090B' },
  sourcePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  sourceBadge: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(4,6,9,0.84)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  sourceBadgeText: { color: scannerColors.text, fontSize: 11, fontWeight: '800' },
  noSourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  noSourceText: { flex: 1, color: scannerColors.textSoft, fontSize: 13, lineHeight: 20 },
  comparisonCard: { alignItems: 'center' },
  comparisonContent: { alignItems: 'center', paddingHorizontal: 16 },
  comparisonLabels: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  beforeLabel: { color: '#FF8A80', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  afterLabel: { color: scannerColors.green, fontSize: 10, fontWeight: '900', letterSpacing: 1.0 },
  statusCard: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  statusIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,107,53,0.10)', borderWidth: 1, borderColor: 'rgba(255,107,53,0.24)' },
  statusTitle: { color: scannerColors.text, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  statusText: { color: scannerColors.textSoft, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  queueText: { color: scannerColors.orangeSoft, fontSize: 11, fontWeight: '800' },
  progressTrack: { width: '100%', height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', marginTop: 4 },
  progressFill: { height: '100%', borderRadius: 2, backgroundColor: scannerColors.orange },
  disclaimerCard: { borderColor: 'rgba(255,107,53,0.24)', gap: 8 },
  disclaimerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclaimerTitle: { color: scannerColors.text, fontSize: 14, fontWeight: '900' },
  disclaimerText: { color: scannerColors.textSoft, fontSize: 12, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, gap: 10 },
  emptyTitle: { color: scannerColors.text, fontSize: 20, fontWeight: '900' },
  emptyText: { color: scannerColors.textMuted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
