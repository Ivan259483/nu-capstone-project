import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Toast } from '@/components/ui/PremiumToast';
import { Haptics } from '@/utils/haptics';
import {
  AiPill,
  BottomActionBar,
  GlassPanel,
  PipelineStepper,
  ScannerBackground,
  ScannerHeader,
  scannerColors,
  scannerPrimaryGradient,
} from '@/features/ai-scan/components/PremiumScanner';
import { aiScanStore } from '@/features/ai-scan/scanStore';
import {
  canAnalyzeGuidedSet,
  clearGuidedViewImage,
  countReadyGuidedViews,
  createGuidedCaptureSet,
  getGuidedSubmissionImages,
  getNextEmptyGuidedView,
  getDefaultDamageArea,
  GUIDED_VIEWS,
  MAX_GUIDED_VIEWS,
  setGuidedViewImage,
  type GuidedViewId,
} from '@/features/ai-scan/guidedViews';
import { createSingleSubmitLatch } from '@/features/ai-scan/scanWorkflowState';
import type { AiScanInputImage } from '@/services/api/aiService';

const assetToInputImage = (
  asset: ImagePicker.ImagePickerAsset,
  viewId: GuidedViewId
): AiScanInputImage => ({
  uri: asset.uri,
  fileName: asset.fileName || `vehicle_${viewId}_${Date.now()}.jpg`,
  mimeType: asset.mimeType || 'image/jpeg',
  angle: viewId,
  selectedDamageArea: getDefaultDamageArea(viewId),
  width: asset.width,
  height: asset.height,
  fileSize: asset.fileSize,
});

export default function AiScanEntry() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Each guided view is keyed by its own id, so retaking one angle never
  // shifts, relabels, or discards the others.
  const [captureSet, setCaptureSet] = useState(createGuidedCaptureSet);
  const submitLatch = useRef(createSingleSubmitLatch());

  const completedCount = countReadyGuidedViews(captureSet);
  const nextEmptyViewId = getNextEmptyGuidedView(captureSet);
  const canAnalyze = canAnalyzeGuidedSet(captureSet);

  const liveHint = useMemo(() => {
    if (completedCount === 0) return 'Start with the Front view, or tap any angle to capture it first.';
    if (completedCount < MAX_GUIDED_VIEWS) {
      const remaining = MAX_GUIDED_VIEWS - completedCount;
      return `${completedCount} of ${MAX_GUIDED_VIEWS} views ready. Tap a captured view to retake just that angle.`
        + (remaining === 1 ? ' One angle left.' : '');
    }
    return 'All guided views are ready for AI inspection.';
  }, [completedCount]);

  const applyAssetsFromView = useCallback((
    assets: ImagePicker.ImagePickerAsset[],
    startViewId: GuidedViewId
  ) => {
    setCaptureSet((previous) => {
      let next = previous;
      let targetId: GuidedViewId | null = startViewId;

      assets.forEach((asset) => {
        if (!targetId) return;
        next = setGuidedViewImage(next, targetId, assetToInputImage(asset, targetId));
        // Extra gallery picks fill the next empty guided views in order.
        targetId = getNextEmptyGuidedView(next);
      });

      return next;
    });
  }, []);

  const captureView = useCallback(async (viewId: GuidedViewId) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Toast.show('Camera access is required to scan a vehicle.', 'warning');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.88,
    });
    if (result.canceled) return;
    applyAssetsFromView(result.assets, viewId);
  }, [applyAssetsFromView]);

  const pickForView = useCallback(async (viewId: GuidedViewId) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show('Photo library access is required for gallery upload.', 'warning');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: MAX_GUIDED_VIEWS,
      quality: 0.86,
    });
    if (result.canceled) return;
    applyAssetsFromView(result.assets, viewId);
  }, [applyAssetsFromView]);

  const removeView = useCallback((viewId: GuidedViewId) => {
    setCaptureSet((previous) => clearGuidedViewImage(previous, viewId));
  }, []);

  const analyzeVehicle = useCallback(() => {
    if (!canAnalyze) {
      Haptics.formSubmitError();
      Toast.show('Capture at least one guided vehicle view to start the inspection.', 'warning');
      return;
    }
    // A double tap must not start two inspections.
    if (!submitLatch.current.claim()) return;

    // This ordered list defines every imageIndex in the response.
    aiScanStore.setCapturedImages(getGuidedSubmissionImages(captureSet));
    router.push('/(customer)/scan/analyzing' as never);
    submitLatch.current.release();
  }, [canAnalyze, captureSet, router]);

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="Vehicle Intelligence"
        title="AI Inspection"
        hideRightSlot
      />
      <PipelineStepper currentIndex={0} />

      <ScrollView
        style={styles.scrollViewport}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 62 + insets.bottom + 24 },
        ]}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
          <View style={styles.heroCopy}>
            <AiPill label="AI ready" icon="radio-outline" />
            <Text style={styles.title}>Smart vehicle scan</Text>
            <Text style={styles.subtitle}>
              Capture guided angles. Each view is analyzed on its own, then combined into one
              vehicle inspection report.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(80)}>
          <GlassPanel style={styles.scanCard} contentStyle={styles.scanCardInner} intense>
            <Text style={styles.captureHint}>{liveHint}</Text>
            <View style={styles.scanActions}>
              <Pressable
                style={styles.cameraAction}
                onPress={() => captureView(nextEmptyViewId ?? GUIDED_VIEWS[0].id)}
              >
                <LinearGradient
                  colors={[...scannerPrimaryGradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.cameraActionText}>Capture angle</Text>
              </Pressable>
              <Pressable
                style={styles.galleryAction}
                onPress={() => pickForView(nextEmptyViewId ?? GUIDED_VIEWS[0].id)}
              >
                <Ionicons name="images-outline" size={19} color={scannerColors.orangeSoft} />
                <Text style={styles.galleryActionText}>Upload gallery</Text>
              </Pressable>
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Guided capture set</Text>
          <Text style={styles.sectionMeta}>{completedCount}/{MAX_GUIDED_VIEWS} angles locked</Text>
        </View>

        <View style={styles.slotGrid}>
          {GUIDED_VIEWS.map((view, index) => {
            const entry = captureSet[view.id];
            const image = entry?.image;
            const active = view.id === nextEmptyViewId;
            return (
              <Animated.View key={view.id} entering={FadeInDown.duration(280).delay(index * 45)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={image ? `Retake ${view.label} view` : `Capture ${view.label} view`}
                  onPress={() => captureView(view.id)}
                  onLongPress={() => pickForView(view.id)}
                  style={[
                    styles.slotCard,
                    active && styles.slotCardActive,
                    image && styles.slotCardFilled,
                  ]}
                >
                  {image ? (
                    <>
                      <Image source={{ uri: image.uri }} style={styles.slotImage} />
                      <View style={styles.slotImageVeil} />
                    </>
                  ) : null}
                  <View style={styles.slotContent}>
                    <View style={[styles.slotIcon, active && styles.slotIconActive]}>
                      <Ionicons
                        name={view.icon}
                        size={18}
                        color={image || active ? scannerColors.orangeSoft : scannerColors.textMuted}
                      />
                    </View>
                    <Text style={styles.slotLabel}>{view.label}</Text>
                    <Text style={styles.slotHint}>{image ? 'Captured · tap to retake' : view.hint}</Text>
                  </View>
                  {image ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${view.label} view`}
                      hitSlop={10}
                      onPress={() => removeView(view.id)}
                      style={styles.removeChip}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </Pressable>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <GlassPanel style={styles.assistCard}>
          <View style={styles.assistRow}>
            <Ionicons name="phone-portrait-outline" size={19} color={scannerColors.orange} />
            <Text style={styles.assistTitle}>One-handed scan guidance</Text>
          </View>
          <Text style={styles.assistText}>
            {'Tap an angle to capture it, or long-press to pick it from your gallery.\nKeep the damaged area centered and clearly visible.\nRetake a single bad angle without restarting the set.'}
          </Text>
        </GlassPanel>

        <BottomActionBar
          inline
          primaryLabel="Analyze Vehicle"
          primaryIcon="sparkles"
          primaryVariant="solid"
          onPrimaryPress={analyzeVehicle}
          secondaryLabel={nextEmptyViewId ? 'Add Another Angle' : undefined}
          onSecondaryPress={nextEmptyViewId ? () => captureView(nextEmptyViewId) : undefined}
        />
      </ScrollView>
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scrollViewport: {
    flex: 1,
    marginTop: 16,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 18,
  },
  hero: {
    gap: 12,
  },
  heroCopy: {
    gap: 10,
  },
  title: {
    color: scannerColors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '900',
    letterSpacing: -0.7,
  },
  subtitle: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  scanCard: {
    borderColor: 'rgba(255,107,53,0.22)',
  },
  scanCardInner: {
    padding: 12,
    gap: 12,
  },
  captureHint: {
    color: scannerColors.textSoft,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
  },
  scanActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cameraAction: {
    flex: 1.25,
    height: 52,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  cameraActionText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  galleryAction: {
    flex: 1,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderColor: scannerColors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  galleryActionText: {
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    color: scannerColors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  sectionMeta: {
    color: scannerColors.orange,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  slotGrid: {
    gap: 10,
  },
  slotCard: {
    minHeight: 86,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  slotCardActive: {
    borderColor: 'rgba(255,107,53,0.55)',
  },
  slotCardFilled: {
    borderColor: 'rgba(16,185,129,0.42)',
  },
  slotImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  slotImageVeil: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.44)',
  },
  removeChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.62)',
  },
  slotContent: {
    minHeight: 86,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  slotIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: scannerColors.border,
  },
  slotIconActive: {
    borderColor: 'rgba(255,107,53,0.5)',
    backgroundColor: 'rgba(255,107,53,0.12)',
  },
  slotLabel: {
    flex: 0.45,
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  slotHint: {
    flex: 1,
    color: scannerColors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  assistCard: {
    marginTop: 2,
  },
  assistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  assistTitle: {
    color: scannerColors.text,
    fontSize: 14,
    fontWeight: '900',
  },
  assistText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
});
