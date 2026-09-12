import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AiPill,
  BottomActionBar,
  GlassPanel,
  PipelineStepper,
  ScannerBackground,
  ScannerHeader,
  scannerColors,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import {
  createPendingScanProgressController,
  createSessionNavigationGuard,
} from '@/features/ai-scan/scanWorkflowState';
import {
  countCompletedGuidedViews,
  getGuidedViewStatusLabel,
  type GuidedViewProgress,
} from '@/features/ai-scan/guidedViews';
import { runAiScanBatch } from '@/services/api/aiService';

const DETECTION_MESSAGE = 'Each guided view is analyzed on its own for visible vehicle damage.';

const VIEW_STATUS_ICON: Record<GuidedViewProgress['status'], keyof typeof Ionicons.glyphMap> = {
  pending: 'ellipse-outline',
  ready: 'ellipse-outline',
  analyzing: 'sync-outline',
  complete: 'checkmark',
  failed: 'alert-circle-outline',
  retake_required: 'alert-circle-outline',
};

function ProgressRing({ progress }: { progress: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(1, { duration: 4200, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value * 360}deg` }],
  }));

  return (
    <View style={styles.ringOuter}>
      <Animated.View style={[styles.ringSweep, ringStyle]} />
      <View style={styles.ringInner}>
        <Text style={styles.progressValue}>{Math.round(progress)}%</Text>
        <Text style={styles.progressLabel}>AI scan</Text>
      </View>
    </View>
  );
}

export default function AnalyzingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ vehicleId?: string }>();
  const capturedImages = useAiScanStore((state) => state.capturedImages);
  const workflow = useAiScanStore((state) => state.workflow);
  const guidedViewProgress = useAiScanStore((state) => state.guidedViewProgress);
  const progress = workflow.progress;
  const resolvedViewCount = countCompletedGuidedViews(guidedViewProgress);
  const requestSettled = workflow.requestStatus === 'succeeded' || workflow.requestStatus === 'failed';
  const [status, setStatus] = useState(DETECTION_MESSAGE);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const navigationGuard = useRef(createSessionNavigationGuard());
  const heroImage = capturedImages[0]?.uri;

  useEffect(() => {
    if (capturedImages.length === 0) {
      router.replace('/(customer)/scan' as never);
      return;
    }

    let mounted = true;
    let transitionTimer: ReturnType<typeof setTimeout> | null = null;
    const sessionId = aiScanStore.beginScanRequest();
    const progressController = createPendingScanProgressController((nextProgress) => {
      if (mounted) aiScanStore.updateScanProgress(sessionId, nextProgress);
    });

    const run = async () => {
      try {
        const result = await runAiScanBatch(capturedImages, {
          vehicleId: params.vehicleId,
          onUploadProgress: (uploadProgress) => {
            if (mounted) progressController.reportUpload(uploadProgress);
          },
        });

        if (!mounted) return;
        progressController.stop();
        const accepted = aiScanStore.completeScanRequest(sessionId, result);
        if (!accepted) return;

        setStatus('All view results received. Preparing the inspection report.');

        transitionTimer = setTimeout(() => {
          const currentSessionId = aiScanStore.getState().workflow.sessionId;
          if (mounted && navigationGuard.current.claim(sessionId, currentSessionId)) {
            router.replace('/(customer)/scan/results' as never);
          }
        }, 700);
      } catch (error) {
        if (!mounted) return;
        progressController.stop();
        const message = error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'AI scan failed. Please retry.';
        if (aiScanStore.failScanRequest(sessionId, message)) {
          setFailed(true);
          setStatus(message);

        }
      }
    };

    run();

    return () => {
      mounted = false;
      progressController.stop();
      if (transitionTimer !== null) clearTimeout(transitionTimer);
    };
  }, [attempt, capturedImages, params.vehicleId, router]);

  const retry = () => {
    setFailed(false);
    setStatus(DETECTION_MESSAGE);
    setAttempt((value) => value + 1);
  };

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="AI Diagnostic Pipeline"
        title="Analyzing Vehicle"
        onBack={() => router.replace('/(customer)/scan' as never)}
        right={<Ionicons name="hardware-chip-outline" size={20} color={scannerColors.orange} />}
      />
      <PipelineStepper
        currentIndex={1}
        stepStates={workflow.requestStatus === 'idle' ? undefined : workflow.stepStates}
      />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.heroPanel}>
          <GlassPanel style={styles.visualPanel} contentStyle={styles.visualInner} intense>
            {heroImage ? <Image source={{ uri: heroImage }} style={styles.heroImage} /> : null}
            <View style={styles.heroVeil} />
            <View style={styles.detectionChip}>
              <AiPill label="Damage Detection" icon="analytics-outline" />
            </View>
            <View style={styles.progressOverlay}>
              <ProgressRing progress={progress} />
            </View>
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(380).delay(120)}>
          <GlassPanel>
            <View style={styles.stageHead}>
              <AiPill
                label={failed ? 'Needs retry' : 'Damage Detection'}
                icon={failed ? 'alert-circle-outline' : 'analytics-outline'}
                color={failed ? scannerColors.red : scannerColors.orange}
              />
              <Text style={styles.stageCount}>RF-DETR</Text>
            </View>
            <Text style={styles.stageTitle}>
              {failed ? 'Inspection interrupted' : 'Damage Detection'}
            </Text>
            <Text style={styles.stageText}>{status}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.pipelineList}>
          <View style={styles.viewListHead}>
            <Text style={styles.viewListTitle}>Guided views</Text>
            <Text style={styles.viewListMeta}>
              {requestSettled
                ? `${resolvedViewCount} of ${guidedViewProgress.length} views analyzed`
                : `${guidedViewProgress.length} ${guidedViewProgress.length === 1 ? 'view' : 'views'} in progress`}
            </Text>
          </View>

          {guidedViewProgress.map((view, index) => {
            const done = view.status === 'complete';
            const needsRetake = view.status === 'failed' || view.status === 'retake_required';
            return (
              <Animated.View key={view.viewId} entering={FadeInDown.duration(260).delay(index * 40)}>
                <GlassPanel contentStyle={styles.pipelineRow}>
                  <View style={[
                    styles.pipelineIcon,
                    done && styles.pipelineIconDone,
                    needsRetake && styles.pipelineIconFailed,
                    view.status === 'analyzing' && styles.pipelineIconActive,
                  ]}>
                    <Ionicons
                      name={VIEW_STATUS_ICON[view.status]}
                      size={17}
                      color={done ? '#041014' : needsRetake ? scannerColors.red : scannerColors.orange}
                    />
                  </View>
                  <View style={styles.pipelineCopy}>
                    <Text style={styles.pipelineTitle}>{view.label}</Text>
                    <Text style={styles.pipelineText}>
                      {view.message || (done ? 'Analyzed' : DETECTION_MESSAGE)}
                    </Text>
                  </View>
                  <Text style={[
                    styles.viewStatusLabel,
                    done && styles.viewStatusLabelDone,
                    needsRetake && styles.viewStatusLabelFailed,
                  ]}>
                    {getGuidedViewStatusLabel(view.status)}
                  </Text>
                </GlassPanel>
              </Animated.View>
            );
          })}
        </View>
      </ScrollView>

      {failed ? (
        <BottomActionBar
          primaryLabel="Retry Inspection"
          primaryIcon="refresh"
          onPrimaryPress={retry}
          secondaryLabel="Back to Scan"
          onSecondaryPress={() => router.replace('/(customer)/scan' as never)}
        />
      ) : null}
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 16,
  },
  heroPanel: {
    minHeight: 360,
  },
  visualPanel: {
    borderColor: 'rgba(255,107,53,0.24)',
  },
  visualInner: {
    minHeight: 352,
    padding: 12,
  },
  heroImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    opacity: 0.36,
  },
  heroVeil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(2,3,5,0.38)',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detectionChip: {
    alignSelf: 'center',
    paddingTop: 4,
  },
  ringOuter: {
    width: 154,
    height: 154,
    borderRadius: 77,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.28)',
  },
  ringSweep: {
    position: 'absolute',
    width: 154,
    height: 154,
    borderRadius: 77,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: scannerColors.orange,
  },
  ringInner: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,4,5,0.86)',
  },
  progressValue: {
    color: scannerColors.text,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  progressLabel: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  stageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  stageCount: {
    color: scannerColors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  stageTitle: {
    color: scannerColors.text,
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  stageText: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  progressTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.09)',
    marginTop: 18,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: scannerColors.orange,
  },
  pipelineList: {
    gap: 10,
  },
  pipelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pipelineIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  pipelineIconActive: {
    borderColor: scannerColors.orange,
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  pipelineIconDone: {
    backgroundColor: scannerColors.orange,
    borderColor: scannerColors.orange,
  },
  pipelineIconFailed: {
    borderColor: scannerColors.red,
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  viewListHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  viewListTitle: {
    color: scannerColors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  viewListMeta: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  viewStatusLabel: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  viewStatusLabelDone: {
    color: scannerColors.orange,
  },
  viewStatusLabelFailed: {
    color: scannerColors.red,
  },
  pipelineCopy: {
    flex: 1,
  },
  pipelineTitle: {
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  pipelineText: {
    color: scannerColors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    marginTop: 2,
  },
});
