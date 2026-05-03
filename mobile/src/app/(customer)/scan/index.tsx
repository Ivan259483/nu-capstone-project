import React, { useCallback, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Toast } from '@/components/ui/PremiumToast';
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
import { aiScanStore } from '@/features/ai-scan/scanStore';
import type { AiScanInputImage } from '@/services/api/aiService';

const MAX_IMAGES = 5;

const CAPTURE_SLOTS = [
  { angle: 'front', label: 'Front', hint: 'Full nose and hood', icon: 'car-sport-outline' },
  { angle: 'rear', label: 'Rear', hint: 'Bumper and trunk', icon: 'return-down-back-outline' },
  { angle: 'left', label: 'Left', hint: 'Driver-side panels', icon: 'arrow-back-outline' },
  { angle: 'right', label: 'Right', hint: 'Passenger-side panels', icon: 'arrow-forward-outline' },
  { angle: 'close_up', label: 'Close-up', hint: 'Visible damage zone', icon: 'contract-outline' },
] as const;

const angleHintFromIndex = (index: number) => CAPTURE_SLOTS[index]?.angle ?? 'close_up';

export default function AiScanEntry() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [images, setImages] = useState<AiScanInputImage[]>([]);

  const completedCount = images.length;
  const nextSlot = CAPTURE_SLOTS[Math.min(completedCount, CAPTURE_SLOTS.length - 1)];
  const canAddMore = images.length < MAX_IMAGES;

  const liveHint = useMemo(() => {
    if (images.length === 0) return 'Start with a clean front three-quarter vehicle photo.';
    if (images.length < 4) return `Next recommended angle: ${nextSlot.label}.`;
    if (images.length === 4) return 'Add one close-up to help AI classify paint depth.';
    return 'Vehicle image set is ready for AI inspection.';
  }, [images.length, nextSlot.label]);

  const addAssets = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    setImages((prev) => {
      const room = MAX_IMAGES - prev.length;
      const additions = assets.slice(0, room).map((asset, idx): AiScanInputImage => ({
        uri: asset.uri,
        fileName: asset.fileName || `vehicle_${Date.now()}_${idx}.jpg`,
        mimeType: asset.mimeType || 'image/jpeg',
        angle: angleHintFromIndex(prev.length + idx),
      }));
      return [...prev, ...additions];
    });
  }, []);

  const captureWithCamera = useCallback(async () => {
    if (!canAddMore) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Toast.show('Camera access is required to scan a vehicle.', 'warning');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.88,
    });
    if (!result.canceled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addAssets(result.assets);
    }
  }, [addAssets, canAddMore]);

  const pickFromLibrary = useCallback(async () => {
    if (!canAddMore) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show('Photo library access is required for gallery upload.', 'warning');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
      quality: 0.86,
    });
    if (!result.canceled) addAssets(result.assets);
  }, [addAssets, canAddMore, images.length]);

  const removeImage = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  }, []);

  const startInspection = useCallback(() => {
    if (images.length === 0) {
      Toast.show('Add at least one vehicle photo to start AI inspection.', 'warning');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    aiScanStore.setCapturedImages(images);
    router.push('/(customer)/scan/analyzing' as never);
  }, [images, router]);

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow="Vehicle Intelligence"
        title="AI Inspection"
        onBack={() => router.back()}
        right={<Ionicons name="shield-checkmark-outline" size={20} color={scannerColors.cyan} />}
      />
      <PipelineStepper currentIndex={0} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: 24 }]}
      >
        <Animated.View entering={FadeInDown.duration(420)} style={styles.hero}>
          <View style={styles.heroCopy}>
            <AiPill label="AI ready" icon="radio-outline" />
            <Text style={styles.title}>Smart vehicle scan</Text>
            <Text style={styles.subtitle}>
              Capture guided angles. The AI will detect damage, reconstruct a digital twin,
              simulate repair, and price the job.
            </Text>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(420).delay(80)}>
          <GlassPanel style={styles.scanCard} contentStyle={styles.scanCardInner} intense>
            <ScanZoneOverlay label="AI Ready Scan Zone" hint={liveHint} />
            <View style={styles.scanActions}>
              <Pressable style={styles.cameraAction} onPress={captureWithCamera}>
                <LinearGradient
                  colors={[scannerColors.cyan, scannerColors.blue]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.cameraActionText}>Capture angle</Text>
              </Pressable>
              <Pressable style={styles.galleryAction} onPress={pickFromLibrary}>
                <Ionicons name="images-outline" size={19} color={scannerColors.cyan} />
                <Text style={styles.galleryActionText}>Upload gallery</Text>
              </Pressable>
            </View>
          </GlassPanel>
        </Animated.View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Guided capture set</Text>
          <Text style={styles.sectionMeta}>{completedCount}/{MAX_IMAGES} angles locked</Text>
        </View>

        <View style={styles.slotGrid}>
          {CAPTURE_SLOTS.map((slot, index) => {
            const image = images[index];
            const active = index === images.length && canAddMore;
            return (
              <Animated.View key={slot.angle} entering={FadeInDown.duration(280).delay(index * 45)}>
                <Pressable
                  onPress={image ? () => removeImage(index) : captureWithCamera}
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
                      <View style={styles.removeChip}>
                        <Ionicons name="close" size={12} color="#fff" />
                      </View>
                    </>
                  ) : null}
                  <View style={styles.slotContent}>
                    <View style={[styles.slotIcon, active && styles.slotIconActive]}>
                      <Ionicons
                        name={slot.icon}
                        size={18}
                        color={image || active ? scannerColors.cyan : scannerColors.textMuted}
                      />
                    </View>
                    <Text style={styles.slotLabel}>{slot.label}</Text>
                    <Text style={styles.slotHint}>{image ? 'Captured' : slot.hint}</Text>
                  </View>
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
            Keep the vehicle centered, avoid harsh reflections, and capture one close-up for each visible damage cluster.
          </Text>
        </GlassPanel>
      </ScrollView>

      <BottomActionBar
        primaryLabel="Start AI Inspection"
        primaryIcon="sparkles"
        disabled={images.length === 0}
        onPrimaryPress={startInspection}
        secondaryLabel={images.length > 0 ? 'Add More Angles' : undefined}
        onSecondaryPress={images.length > 0 ? captureWithCamera : undefined}
      />
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
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
    borderColor: 'rgba(53,217,255,0.22)',
  },
  scanCardInner: {
    padding: 12,
    gap: 12,
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
    color: scannerColors.cyan,
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
    borderColor: 'rgba(53,217,255,0.55)',
  },
  slotCardFilled: {
    borderColor: 'rgba(16,185,129,0.42)',
  },
  slotImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  slotImageVeil: {
    ...StyleSheet.absoluteFillObject,
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
    borderColor: 'rgba(53,217,255,0.5)',
    backgroundColor: 'rgba(53,217,255,0.12)',
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
