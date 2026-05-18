import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import * as Haptics from 'expo-haptics';
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
import { pollAiScan3D, startAiScan3D } from '@/services/api/aiService';
import {
  createArLaunchSession,
  type ArLaunchSession,
} from '@/services/api/arLaunchService';

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
  const capturedImages = useAiScanStore((state) => state.capturedImages);

  const running = useRef(false);
  const [launchSession, setLaunchSession] = useState<ArLaunchSession | null>(null);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const ready = modelStatus === 'ready' && Boolean(modelUrl);
  const unavailable = modelStatus === 'failed' || modelStatus === 'unavailable';
  const iosMissingUsdz = Platform.OS === 'ios' && ready && !String(modelUsdzUrl || '').trim();
  const directLaunchLabel =
    Platform.OS === 'ios'
      ? 'Open Quick Look AR'
      : Platform.OS === 'android'
        ? 'Open Scene Viewer AR'
        : 'Open AR Launcher';

  const pipelineStepIndex = useMemo(() => {
    if (!scan) return 0;
    return ready ? 3 : 2;
  }, [scan, ready]);

  const startOrPoll = useCallback(
    async (force = false) => {
      if (!scan || running.current) return;
      if (!force && modelStatus === 'ready') return;
      if (!force && (modelStatus === 'failed' || modelStatus === 'unavailable')) return;

      running.current = true;
      setLaunchError(null);
      if (force) setLaunchSession(null);

      try {
        let taskId = force ? null : modelTaskId;

        if (!taskId) {
          if (!scan.scanId && capturedImages.length === 0) {
            aiScanStore.setModelProgress({
              status: 'unavailable',
              progress: 0,
              message: '3D reconstruction requires a saved scan or captured vehicle photo.',
            });
            return;
          }

          const started = await startAiScan3D(scan.scanId || '', capturedImages);
          aiScanStore.setModelProgress(started);

          taskId = started.taskId ?? null;
          if (started.status === 'ar_ready') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }
          if (started.status !== 'processing' || !taskId) return;
        }

        const result = await pollAiScan3D(taskId, {
          intervalMs: 3500,
          timeoutMs: 240000,
          onProgress: (progress) => aiScanStore.setModelProgress(progress),
        });
        aiScanStore.setModelProgress(result);

        if (result.status === 'ar_ready') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '3D reconstruction failed.';
        aiScanStore.setModelProgress({
          status: 'failed',
          taskId: modelTaskId ?? undefined,
          progress: modelProgress,
          message,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        running.current = false;
      }
    },
    [capturedImages, modelProgress, modelStatus, modelTaskId, scan]
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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      await Linking.openURL(directUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not open native AR launcher.';
      setLaunchError(message);
    }
  }, [iosMissingUsdz, launchSession]);

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

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow={ready ? 'QR Native AR' : '3D Vehicle Model'}
        title={ready ? 'Native AR Launch Ready' : 'Preparing AR'}
        onBack={() => router.back()}
        right={
          <Ionicons
            name={ready ? 'qr-code-outline' : 'cube-outline'}
            size={20}
            color={ready ? scannerColors.green : scannerColors.orange}
          />
        }
      />
      <PipelineStepper currentIndex={pipelineStepIndex} />

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
        <Animated.View entering={FadeInDown.duration(400)}>
          <GlassPanel style={styles.viewerCard} contentStyle={styles.viewerInner} intense>
            {!ready ? (
              <View style={styles.loadingTwin}>
                <View style={styles.loadingIcon}>
                  <Ionicons name="cube-outline" size={44} color={scannerColors.orange} />
                </View>
                <Text style={styles.loadingTitle}>Generating digital twin</Text>
                <Text style={styles.loadingText}>
                  {modelMessage || 'Meshy is reconstructing geometry and surface textures.'}
                </Text>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(4, modelProgress)}%` as `${number}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round(modelProgress)}%</Text>
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
                    <ActivityIndicator size="small" color={scannerColors.orange} />
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
                    : 'Native AR launch links ready'
                  : 'Preparing launch payload'
              }
              icon={ready ? 'qr-code-outline' : 'time-outline'}
              color={ready ? scannerColors.green : scannerColors.orange}
            />
          </View>
          <Text style={styles.infoTitle}>
            {ready
              ? iosMissingUsdz
                ? 'Regenerate to produce USDZ'
                : 'QR-triggered native AR is active'
              : 'Preparing AR experience'}
          </Text>
          <Text style={styles.infoText}>
            {ready
              ? iosMissingUsdz
                ? 'This iOS device requires Meshy USDZ output for Quick Look. Retry generation and wait for a USDZ URL.'
                : 'Use the QR code for cross-device launch and the direct button below for same-device native viewer launch.'
              : unavailable
                ? 'Meshy could not start from the saved scan image. Retry will upload the captured photo directly to the 3D pipeline.'
                : 'The app is uploading your captured vehicle photo to Meshy and waiting for model completion before creating QR launch links.'}
          </Text>
          {!ready && !unavailable ? (
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
              : 'Continue to Cost Estimate'
        }
        primaryIcon={
          ready
            ? iosMissingUsdz
              ? 'refresh-outline'
              : 'open-outline'
            : unavailable
              ? 'refresh-outline'
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
            startOrPoll(true);
            return;
          }

          router.push('/(customer)/scan/estimate' as never);
        }}
        secondaryLabel={ready || unavailable ? 'Continue to Cost Estimate' : 'Skip to Cost Estimate'}
        onSecondaryPress={() => router.push('/(customer)/scan/estimate' as never)}
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
