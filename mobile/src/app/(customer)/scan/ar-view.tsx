import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PremiumLoader } from '@/components/ui/loading';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import {
  AiPill,
  BottomActionBar,
  GlassPanel,
  PipelineStepper,
  ScannerBackground,
  ScannerHeader,
  scannerColors,
  severityMeta,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import {
  isZeroDetectionResult,
  ZERO_DETECTION_MESSAGE,
} from '@/features/ai-scan/scanResultState';
import { pollAiScan3D, startAiScan3D } from '@/services/api/aiService';
import {
  createArLaunchSession,
  type ArLaunchSession,
} from '@/services/api/arLaunchService';
import { AI_SCAN_ROUTES } from '@/features/ai-scan/threeDPreparation';

export default function ArViewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const modelStatus = useAiScanStore((state) => state.modelStatus);
  const modelTaskId = useAiScanStore((state) => state.modelTaskId);
  const modelUrl = useAiScanStore((state) => state.modelUrl);
  const repairedModelUrl = useAiScanStore((state) => state.repairedModelUrl);
  const modelUsdzUrl = useAiScanStore((state) => state.modelUsdzUrl);
  const modelProgress = useAiScanStore((state) => state.modelProgress);
  const modelMessage = useAiScanStore((state) => state.modelMessage);
  const modelPrecedingTasks = useAiScanStore((state) => state.modelPrecedingTasks);
  const vehicle3DSourceImage = useAiScanStore((state) => state.vehicle3DSourceImage);
  const workflow = useAiScanStore((state) => state.workflow);

  const running = useRef(false);
  // Flipped on unmount so an in-flight poll loop for this screen instance
  // stops applying updates instead of writing into the store after the user
  // has already navigated away.
  const cancelledRef = useRef(false);
  useEffect(() => () => {
    cancelledRef.current = true;
  }, []);

  const [launchSession, setLaunchSession] = useState<ArLaunchSession | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const noDamageDetected = scan ? isZeroDetectionResult(scan) : false;

  const ready = modelStatus === 'ready' && Boolean(modelUrl);
  const queued = modelStatus === 'queued';
  // Local polling window elapsed while Meshy was still PENDING/IN_PROGRESS.
  // This is NOT a failure — Meshy's own task status is the only terminal
  // authority — so it is deliberately excluded from `unavailable` below.
  const stillProcessing = modelStatus === 'still_processing';
  const unavailable = modelStatus === 'failed' || modelStatus === 'unavailable';
  const iosMissingUsdz = Platform.OS === 'ios' && ready && !String(modelUsdzUrl || '').trim();
  const precedingTasksLabel =
    queued && typeof modelPrecedingTasks === 'number' && modelPrecedingTasks > 0
      ? `Approximately ${modelPrecedingTasks} generation task${modelPrecedingTasks === 1 ? '' : 's'} ${modelPrecedingTasks === 1 ? 'is' : 'are'} ahead.`
      : null;
  const directLaunchLabel =
    Platform.OS === 'ios'
      ? 'Open Quick Look AR'
      : Platform.OS === 'android'
        ? 'Open Scene Viewer AR'
        : 'Open AR Launcher';

  const startOrPoll = useCallback(
    async (force = false) => {
      if (!scan || running.current) return;
      if (!force && modelStatus === 'ready') return;
      if (!force && (modelStatus === 'failed' || modelStatus === 'unavailable')) return;

      running.current = true;
      setLaunchError(null);
      if (force) setLaunchSession(null);

      // Captured once this run's task id is known, and used by the poll loop
      // below to detect it has been superseded (screen unmounted, or a
      // force-regenerate started a different task) — so a late response for
      // an old task can never overwrite a newer generation session.
      let activeTaskId: string | null = null;

      try {
        let taskId = force ? null : modelTaskId;

        if (!taskId) {
          if (!vehicle3DSourceImage) {
            router.replace(AI_SCAN_ROUTES.prepare3d as never);
            return;
          }

          const started = await startAiScan3D(
            scan.scanId || '',
            [vehicle3DSourceImage],
            { preferUploadedImages: true }
          );
          if (cancelledRef.current) return;
          aiScanStore.setModelProgress(started);

          taskId = started.taskId ?? null;
          if (started.status === 'ar_ready') {

            return;
          }
          if (started.status !== 'processing' || !taskId) return;
        }

        activeTaskId = taskId;

        // 10-minute foreground polling window — a defense-safe default, not
        // Meshy's real deadline. Exceeding it resolves as 'still_processing'
        // (see pollAiScan3D), never as a failure, so "Continue Waiting" can
        // always resume polling this exact task id.
        const result = await pollAiScan3D(taskId, {
          intervalMs: 3500,
          timeoutMs: 600000,
          seedProgress: modelProgress,
          onProgress: (progress) => aiScanStore.setModelProgress(progress),
          shouldCancel: () =>
            cancelledRef.current || aiScanStore.getState().modelTaskId !== activeTaskId,
        });
        if (result.status !== 'cancelled') {
          aiScanStore.setModelProgress(result);
        }

      } catch (error) {
        // A stale/cancelled run's rejection (e.g. a genuine Meshy FAILED
        // status firing after the screen unmounted, or after a newer task
        // superseded this one) must not overwrite whatever the active
        // session is showing now. A local polling timeout never reaches
        // this catch block — pollAiScan3D resolves it non-terminally.
        if (cancelledRef.current) return;
        if (activeTaskId && aiScanStore.getState().modelTaskId !== activeTaskId) return;

        const message = error instanceof Error ? error.message : '3D reconstruction failed.';
        aiScanStore.setModelProgress({
          status: 'failed',
          taskId: modelTaskId ?? undefined,
          progress: modelProgress,
          message,
        });

      } finally {
        running.current = false;
      }
    },
    [modelProgress, modelStatus, modelTaskId, router, scan, vehicle3DSourceImage]
  );

  const prepareLaunchSession = useCallback(async () => {
    if (!scan || !ready || !modelUrl || iosMissingUsdz) return;

    setLaunchBusy(true);
    setLaunchError(null);
    try {
      const session = await createArLaunchSession({
        modelUrl,
        repairedModelUrl: repairedModelUrl || modelUrl,
        usdzUrl: modelUsdzUrl || undefined,
        damages: scan.damages,
      });
      setLaunchSession(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create AR launch QR.';
      setLaunchError(message);
      setLaunchSession(null);
    } finally {
      setLaunchBusy(false);
    }
  }, [iosMissingUsdz, modelUrl, modelUsdzUrl, ready, repairedModelUrl, scan]);

  const openDirectNativeAr = useCallback(async () => {
    if (iosMissingUsdz) {
      setLaunchError('USDZ unavailable — regenerate the 3D model to launch native iPhone AR.');
      return;
    }

    if (!launchSession) {
      setLaunchError('AR launch session is not ready yet.');
      return;
    }

    const directUrl = launchSession.directLaunchUrl;
    if (!directUrl) {
      setLaunchError('Native AR URL is unavailable for this device.');
      return;
    }

    try {

      await Linking.openURL(directUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open native AR launcher.';
      setLaunchError(message);
    }
  }, [iosMissingUsdz, launchSession]);

  useEffect(() => {
    aiScanStore.activateWorkflowStage('3d');
  }, []);

  useEffect(() => {
    startOrPoll();
  }, [startOrPoll]);

  useEffect(() => {
    if (!ready) {
      setLaunchSession(null);
      setLaunchError(null);
      setLaunchBusy(false);
    }
  }, [ready]);

  useEffect(() => {
    if (!ready || iosMissingUsdz) return;
    if (launchSession?.launchUrl) return;
    void prepareLaunchSession();
  }, [iosMissingUsdz, launchSession?.launchUrl, prepareLaunchSession, ready]);

  if (!scan) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader title="AR Repair Simulation" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={56} color={scannerColors.textMuted} />
          <Text style={styles.emptyTitle}>No scan loaded</Text>
          <Text style={styles.emptyText}>Run an AI inspection first.</Text>
        </View>
      </ScannerBackground>
    );
  }

  // "Preparing AR" is only true once a usable 3D model exists and the QR/AR
  // launch link is actually being created — never while Meshy is still
  // queued or generating the model itself.
  const arPreparing = ready && launchBusy;

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow={!ready ? '3D Vehicle Model' : arPreparing ? 'AR Setup' : 'QR Native AR'}
        title={
          !ready
            ? queued
              ? 'Queued for 3D Generation'
              : stillProcessing
                ? 'Still Processing'
                : 'Generating 3D Model'
            : arPreparing
              ? 'Preparing AR'
              : 'Native AR Launch Ready'
        }
        onBack={() => router.back()}
        right={
          <Ionicons
            name={ready ? 'qr-code-outline' : 'cube-outline'}
            size={20}
            color={ready ? scannerColors.green : scannerColors.orange}
          />
        }
      />
      <PipelineStepper currentIndex={ready ? 3 : 2} stepStates={workflow.stepStates} />

      {ready ? (
        <View style={[styles.stateBar, iosMissingUsdz ? styles.stateBarBlocked : styles.stateBarReady]}>
          <Ionicons
            name={iosMissingUsdz ? 'alert-circle' : 'checkmark-circle'}
            size={13}
            color={iosMissingUsdz ? scannerColors.red : scannerColors.green}
          />
          <Text
            style={[
              styles.stateBarText,
              { color: iosMissingUsdz ? scannerColors.red : scannerColors.green },
            ]}
          >
            {iosMissingUsdz ? 'USDZ REQUIRED FOR IPHONE QUICK LOOK' : 'NATIVE AR SESSION READY'}
          </Text>
        </View>
      ) : null}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        {noDamageDetected ? (
          <GlassPanel style={styles.zeroDetectionCard}>
            <View style={styles.zeroDetectionRow}>
              <Ionicons name="alert-circle-outline" size={22} color={scannerColors.orange} />
              <View style={{ flex: 1 }}>
                <Text style={styles.zeroDetectionTitle}>Vehicle-only 3D model</Text>
                <Text style={styles.zeroDetectionText}>{ZERO_DETECTION_MESSAGE}</Text>
                <Text style={styles.zeroDetectionText}>
                  Model generation remains available, but no AI-confirmed damage region will be overlaid.
                </Text>
              </View>
            </View>
          </GlassPanel>
        ) : null}

        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassPanel style={styles.viewerCard} contentStyle={styles.viewerInner} intense>
            {stillProcessing ? (
              // The LOCAL polling window ran out, not Meshy — the task is
              // still alive, so this is deliberately NOT the failure view.
              <View style={styles.blockedWrap}>
                <Ionicons name="hourglass-outline" size={44} color={scannerColors.orange} />
                <Text style={styles.blockedTitle}>3D model is still processing</Text>
                <Text style={styles.blockedText}>
                  Meshy is taking longer than expected. You can keep waiting or return later.
                </Text>
                {precedingTasksLabel ? (
                  <Text style={styles.loadingHint}>{precedingTasksLabel}</Text>
                ) : null}
                <Pressable style={styles.retryButton} onPress={() => startOrPoll(false)}>
                  <Ionicons name="hourglass-outline" size={16} color="#fff" />
                  <Text style={styles.retryButtonText}>Continue Waiting</Text>
                </Pressable>
              </View>
            ) : !ready && !unavailable ? (
              <View style={styles.loadingTwin}>
                <View style={styles.loadingIcon}>
                  <Ionicons name={queued ? 'time-outline' : 'cube-outline'} size={44} color={scannerColors.orange} />
                </View>
                <Text style={styles.loadingTitle}>
                  {queued ? 'Queued for 3D generation' : 'Generating digital twin'}
                </Text>
                <Text style={styles.loadingText}>
                  {queued
                    ? 'Waiting for Meshy to start processing your vehicle.'
                    : (modelMessage || 'Meshy is creating your 3D vehicle model.')}
                </Text>
                {precedingTasksLabel ? (
                  <Text style={styles.loadingHint}>{precedingTasksLabel}</Text>
                ) : null}
                {queued ? (
                  // Meshy hasn't started this task yet, so there is no real
                  // percentage to bind to — an indeterminate loader instead
                  // of a fake/stuck 0% bar.
                  <View style={styles.queuedLoaderWrap}>
                    <PremiumLoader size="small" accessibilityLabel="Waiting in the Meshy generation queue" />
                  </View>
                ) : (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.max(4, modelProgress)}%` as `${number}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{Math.round(modelProgress)}%</Text>
                  </>
                )}
              </View>
            ) : unavailable ? (
              <View style={styles.blockedWrap}>
                <Ionicons name="alert-circle-outline" size={44} color={scannerColors.red} />
                <Text style={styles.blockedTitle}>3D model generation failed</Text>
                <Text style={styles.blockedText}>
                  {modelMessage || 'Meshy could not generate a 3D model from this photo.'}
                </Text>
                <Pressable style={styles.retryButton} onPress={() => startOrPoll(true)}>
                  <Ionicons name="refresh-outline" size={16} color="#fff" />
                  <Text style={styles.retryButtonText}>Retry 3D Generation</Text>
                </Pressable>
              </View>
            ) : iosMissingUsdz ? (
              <View style={styles.blockedWrap}>
                <Ionicons name="phone-portrait-outline" size={44} color={scannerColors.red} />
                <Text style={styles.blockedTitle}>USDZ unavailable — regenerate 3D model</Text>
                <Text style={styles.blockedText}>
                  Native iPhone AR requires a USDZ output. Generate a fresh Meshy model to continue.
                </Text>
                <Pressable style={styles.retryButton} onPress={() => startOrPoll(true)}>
                  <Ionicons name="refresh-outline" size={16} color="#fff" />
                  <Text style={styles.retryButtonText}>Regenerate 3D Twin</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.launchWrap}>
                <Text style={styles.launchTitle}>Scan QR to open native AR</Text>
                <Text style={styles.launchSub}>
                  {Platform.OS === 'ios'
                    ? 'iPhone: Safari opens Quick Look AR'
                    : 'Android: Chrome opens Scene Viewer AR'}
                </Text>

                {launchBusy ? (
                  <View style={styles.qrLoading}>
                    <PremiumLoader size="small" accessibilityLabel="Creating secure AR launch link" />
                    <Text style={styles.qrLoadingText}>Creating secure AR launch link…</Text>
                  </View>
                ) : launchSession?.launchUrl ? (
                  <>
                    <View style={styles.qrFrame}>
                      <QRCode value={launchSession.launchUrl} size={186} backgroundColor="#FFFFFF" color="#101114" />
                    </View>
                    <Text style={styles.qrHint}>Scan this QR from another device to launch native AR.</Text>
                    <Pressable
                      style={styles.directLaunchButton}
                      onPress={openDirectNativeAr}
                      disabled={!launchSession.directLaunchUrl}
                    >
                      <Ionicons name="open-outline" size={16} color="#fff" />
                      <Text style={styles.directLaunchText}>{directLaunchLabel}</Text>
                    </Pressable>
                    {!launchSession.directLaunchUrl ? (
                      <Text style={styles.directLaunchNote}>
                        Native AR launch is unavailable for this device.
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.qrLoading}>
                    <Ionicons name="warning-outline" size={18} color={scannerColors.red} />
                    <Text style={styles.qrLoadingText}>AR launch link unavailable. Try again.</Text>
                    <Pressable onPress={prepareLaunchSession} style={styles.retryInlineButton}>
                      <Text style={styles.retryInlineText}>Retry Link Generation</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            )}
          </GlassPanel>
        </Animated.View>

        <GlassPanel>
          <View style={styles.infoHead}>
            <AiPill
              label={
                ready
                  ? iosMissingUsdz
                    ? 'iPhone USDZ missing'
                    : arPreparing
                      ? 'Preparing AR launch'
                      : 'Native AR launch links ready'
                  : unavailable
                    ? '3D generation failed'
                    : stillProcessing
                      ? 'Still processing'
                      : queued
                        ? 'Queued for 3D generation'
                        : 'Generating 3D model'
              }
              icon={ready ? 'qr-code-outline' : 'time-outline'}
              color={ready ? scannerColors.green : scannerColors.orange}
            />
          </View>
          <Text style={styles.infoTitle}>
            {ready
              ? iosMissingUsdz
                ? 'Regenerate to produce USDZ'
                : arPreparing
                  ? 'Creating your AR launch link'
                  : 'QR-triggered native AR is active'
              : unavailable
                ? 'Could not generate a 3D model'
                : stillProcessing
                  ? 'Taking longer than expected'
                  : queued
                    ? 'Waiting in the Meshy queue'
                    : 'Generating your 3D model'}
          </Text>
          <Text style={styles.infoText}>
            {ready
              ? iosMissingUsdz
                ? 'This iOS device requires Meshy USDZ output for Quick Look. Retry generation and wait for a USDZ URL.'
                : arPreparing
                  ? 'Building a secure, short-lived link so the QR code and direct AR button below can launch this model.'
                  : 'Use the QR code for cross-device launch and the direct button below for same-device native viewer launch.'
              : unavailable
                ? 'Meshy could not start from the selected full-vehicle photo. Retry will upload that separate 3D source again.'
                : stillProcessing
                  ? 'Meshy has not reported success or failure yet. Your task is preserved — tap Continue Waiting to keep polling, or come back later.'
                  : queued
                    ? 'Meshy has accepted your vehicle photo and will begin reconstruction automatically — no action needed.'
                    : 'The app is uploading your selected full-vehicle photo to Meshy and waiting for model completion before creating QR launch links.'}
          </Text>
          {!ready && !unavailable && !stillProcessing ? (
            <Text style={styles.loadingHint}>{modelMessage || 'Meshy reconstruction is running in the background.'}</Text>
          ) : null}
          {launchError ? <Text style={styles.errorHint}>{launchError}</Text> : null}
        </GlassPanel>

        <View style={styles.damageStrip}>
          {scan.damages.map((damage) => {
            const meta = severityMeta[damage.severity];
            return (
              <GlassPanel key={damage.id} style={styles.damageChip} contentStyle={styles.damageChipInner}>
                <Ionicons name={meta.icon} size={16} color={meta.color} />
                <Text style={styles.damageArea} numberOfLines={1}>{damage.affectedArea}</Text>
                <Text style={[styles.damageTag, { color: meta.color }]}>{meta.label}</Text>
              </GlassPanel>
            );
          })}
        </View>
      </ScrollView>

      <BottomActionBar
        primaryLabel={
          ready
            ? iosMissingUsdz
              ? 'Regenerate 3D Twin'
              : 'Launch Native AR'
            : unavailable
              ? 'Retry 3D Twin'
              : stillProcessing
                ? 'Continue Waiting'
                : noDamageDetected
                  ? 'Continue with 0 AI Issues'
                  : 'Continue to Cost Estimate'
        }
        primaryIcon={
          ready
            ? iosMissingUsdz
              ? 'refresh-outline'
              : 'open-outline'
            : unavailable
              ? 'refresh-outline'
              : stillProcessing
                ? 'hourglass-outline'
                : 'cash'
        }
        onPrimaryPress={() => {
          if (ready) {
            if (iosMissingUsdz) {
              startOrPoll(true);
            } else {
              openDirectNativeAr();
            }
            return;
          }

          if (unavailable) {
            // Only an explicit user retry after a REAL terminal failure may
            // start a new Meshy task — never a local timeout.
            startOrPoll(true);
            return;
          }

          if (stillProcessing) {
            // Resumes polling the SAME task id (force=false) — never starts
            // a second Meshy generation while this one is still alive.
            startOrPoll(false);
            return;
          }

          aiScanStore.activateWorkflowStage('price');
          router.push('/(customer)/scan/estimate' as never);
        }}
        secondaryLabel={
          noDamageDetected
            ? 'Continue with 0 AI Issues'
            : ready || unavailable || stillProcessing
              ? 'Continue to Cost Estimate'
              : 'Skip to Cost Estimate'
        }
        onSecondaryPress={() => {
          aiScanStore.activateWorkflowStage('price');
          router.push('/(customer)/scan/estimate' as never);
        }}
      />
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 6,
    gap: 14,
  },
  zeroDetectionCard: {
    borderColor: 'rgba(255,107,53,0.32)',
  },
  zeroDetectionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  zeroDetectionTitle: {
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  zeroDetectionText: {
    color: scannerColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: 3,
  },
  stateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stateBarReady: {
    borderBottomColor: 'rgba(16,185,129,0.30)',
    backgroundColor: 'rgba(16,185,129,0.08)',
  },
  stateBarBlocked: {
    borderBottomColor: 'rgba(239,68,68,0.35)',
    backgroundColor: 'rgba(239,68,68,0.10)',
  },
  stateBarText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  viewerCard: {
    borderColor: 'rgba(255,107,53,0.30)',
  },
  viewerInner: {
    padding: 0,
    minHeight: 520,
  },
  loadingTwin: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    minHeight: 520,
  },
  loadingIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.28)',
    marginBottom: 18,
  },
  loadingTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  loadingText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
  },
  queuedLoaderWrap: {
    marginTop: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
    marginTop: 22,
  },
  progressFill: {
    height: '100%',
    backgroundColor: scannerColors.orange,
    borderRadius: 4,
  },
  progressText: {
    color: scannerColors.orange,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 8,
  },
  blockedWrap: {
    minHeight: 520,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 30,
    gap: 12,
  },
  blockedTitle: {
    color: scannerColors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  blockedText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 320,
  },
  retryButton: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: scannerColors.orange,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  launchWrap: {
    minHeight: 520,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 26,
    gap: 12,
  },
  launchTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  launchSub: {
    color: scannerColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  qrFrame: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  qrHint: {
    color: scannerColors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  directLaunchButton: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: scannerColors.orange,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  directLaunchText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  directLaunchNote: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 16,
  },
  qrLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  qrLoadingText: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  retryInlineButton: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,53,0.16)',
  },
  retryInlineText: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  infoHead: {
    marginBottom: 12,
  },
  infoTitle: {
    color: scannerColors.text,
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 8,
  },
  infoText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  loadingHint: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
  },
  errorHint: {
    color: scannerColors.red,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 10,
  },
  damageStrip: { gap: 10 },
  damageChip: { borderRadius: 20 },
  damageChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  damageArea: {
    flex: 1,
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  damageTag: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
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
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 8,
  },
});
