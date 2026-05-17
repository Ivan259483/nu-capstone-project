import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
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
  ScanZoneOverlay,
  scannerColors,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import { runAiScan } from '@/services/api/aiService';

const STAGES = [
  { threshold: 8, label: 'Secure upload', detail: 'Encrypting and sending vehicle image set.', icon: 'cloud-upload-outline' },
  { threshold: 28, label: 'Vehicle lock', detail: 'Finding body edges, glass, paint, and panel geometry.', icon: 'scan-outline' },
  { threshold: 52, label: 'Damage detection', detail: 'Classifying scratches, dents, paint defects, and severity.', icon: 'analytics-outline' },
  { threshold: 76, label: 'Repair intelligence', detail: 'Building technician-level recommendations and priority order.', icon: 'construct-outline' },
  { threshold: 94, label: 'Cost engine', detail: 'Estimating labor, materials, paint work, and protection package.', icon: 'cash-outline' },
] as const;

const stepForProgress = (progress: number) => {
  if (progress < 24) return 1;
  if (progress < 62) return 1;
  if (progress < 80) return 2;
  if (progress < 94) return 4;
  return 4;
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
  const [progress, setProgress] = useState(5);
  const [status, setStatus] = useState('Initializing AI inspection pipeline.');
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const currentStageIndex = useMemo(() => {
    let active = 0;
    STAGES.forEach((stage, index) => {
      if (progress >= stage.threshold) active = index;
    });
    return active;
  }, [progress]);

  const currentStage = STAGES[currentStageIndex];
  const heroImage = capturedImages[0]?.uri;

  useEffect(() => {
    if (inFlight.current) return;
    inFlight.current = true;

    if (capturedImages.length === 0) {
      router.replace('/(customer)/scan' as never);
      return;
    }

    let mounted = true;
    let cosmeticProgress = 6;
    const interval = setInterval(() => {
      cosmeticProgress = Math.min(88, cosmeticProgress + 4);
      if (mounted) setProgress((value) => Math.max(value, cosmeticProgress));
    }, 720);

    const run = async () => {
      try {
        const result = await runAiScan(capturedImages, {
          vehicleId: params.vehicleId,
          onUploadProgress: (uploadProgress) => {
            if (!mounted) return;
            setProgress((value) => Math.max(value, Math.min(68, uploadProgress)));
          },
        });

        if (!mounted) return;
        clearInterval(interval);
        setProgress(100);
        setStatus('Inspection complete. Preparing diagnostic report.');
        aiScanStore.setScan(result);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          if (mounted) router.replace('/(customer)/scan/results' as never);
        }, 700);
      } catch (error) {
        if (!mounted) return;
        clearInterval(interval);
        const message = error instanceof Error ? error.message : 'AI scan failed. Please retry.';
        setFailed(true);
        setStatus(message);
        aiScanStore.setScanError(message);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    run();

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [capturedImages, params.vehicleId, router]);

  useEffect(() => {
    if (!failed) setStatus(currentStage.detail);
  }, [currentStage.detail, failed]);

  const retry = () => {
    inFlight.current = false;
    setFailed(false);
    setProgress(5);
    setStatus('Restarting AI inspection pipeline.');
    router.replace('/(customer)/scan/analyzing' as never);
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
      <PipelineStepper currentIndex={stepForProgress(progress)} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.heroPanel}>
          <GlassPanel style={styles.visualPanel} contentStyle={styles.visualInner} intense>
            {heroImage ? <Image source={{ uri: heroImage }} style={styles.heroImage} /> : null}
            <View style={styles.heroVeil} />
            <ScanZoneOverlay label="Live AI scan" hint="Damage map generation in progress" compact />
            <View style={styles.progressOverlay}>
              <ProgressRing progress={progress} />
            </View>
          </GlassPanel>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(380).delay(120)}>
          <GlassPanel>
            <View style={styles.stageHead}>
              <AiPill
                label={failed ? 'Needs retry' : currentStage.label}
                icon={failed ? 'alert-circle-outline' : currentStage.icon}
                color={failed ? scannerColors.red : scannerColors.orange}
              />
              <Text style={styles.stageCount}>{currentStageIndex + 1}/{STAGES.length}</Text>
            </View>
            <Text style={styles.stageTitle}>
              {failed ? 'Inspection interrupted' : currentStage.label}
            </Text>
            <Text style={styles.stageText}>{status}</Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.min(100, progress)}%` }]} />
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.pipelineList}>
          {STAGES.map((stage, index) => {
            const complete = index < currentStageIndex || progress >= 100;
            const active = index === currentStageIndex && !failed;
            return (
              <Animated.View
                key={stage.label}
                entering={FadeInDown.duration(260).delay(index * 45)}
              >
                <GlassPanel contentStyle={styles.pipelineRow}>
                  <View
                    style={[
                      styles.pipelineIcon,
                      complete && styles.pipelineIconDone,
                      active && styles.pipelineIconActive,
                    ]}
                  >
                    <Ionicons
                      name={complete ? 'checkmark' : stage.icon}
                      size={17}
                      color={complete ? '#041014' : active ? scannerColors.orange : scannerColors.textMuted}
                    />
                  </View>
                  <View style={styles.pipelineCopy}>
                    <Text style={styles.pipelineTitle}>{stage.label}</Text>
                    <Text style={styles.pipelineText}>{stage.detail}</Text>
                  </View>
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
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    opacity: 0.36,
  },
  heroVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,3,5,0.38)',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
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
