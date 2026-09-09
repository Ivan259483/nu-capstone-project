import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Toast } from '@/components/ui/PremiumToast';
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
import { aiScanStore, useAiScanStore } from '@/features/ai-scan/scanStore';
import { isZeroDetectionResult } from '@/features/ai-scan/scanResultState';
import {
  AI_SCAN_ROUTES,
  createVehicle3DSourceImage,
  getThreeDPreparationCopy,
  THREE_D_REQUIREMENTS,
  validateVehicle3DSourceImage,
} from '@/features/ai-scan/threeDPreparation';
import type { AiScanInputImage } from '@/services/api/aiService';

const readAsset = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<AiScanInputImage | null> => {
  let width = asset.width;
  let height = asset.height;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(asset.uri, (nextWidth, nextHeight) => {
          resolve({ width: nextWidth, height: nextHeight });
        }, reject);
      });
      width = dimensions.width;
      height = dimensions.height;
    } catch {
      return null;
    }
  }

  return createVehicle3DSourceImage({
    uri: asset.uri,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    width,
    height,
    fileSize: asset.fileSize,
  });
};

export default function Prepare3DScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scan = useAiScanStore((state) => state.scan);
  const vehicle3DSourceImage = useAiScanStore((state) => state.vehicle3DSourceImage);
  const workflow = useAiScanStore((state) => state.workflow);
  const [confirmedFullVehicle, setConfirmedFullVehicle] = useState(false);
  const noDamageDetected = scan ? isZeroDetectionResult(scan) : false;
  const copy = useMemo(
    () => getThreeDPreparationCopy(noDamageDetected),
    [noDamageDetected]
  );
  const validation = useMemo(
    () => validateVehicle3DSourceImage(vehicle3DSourceImage),
    [vehicle3DSourceImage]
  );

  useEffect(() => {
    aiScanStore.activateWorkflowStage('3d');
  }, []);

  const saveAsset = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const image = await readAsset(asset);
    const result = validateVehicle3DSourceImage(image);
    if (!result.valid) {
      Toast.show(result.message, 'warning');
      return;
    }

    aiScanStore.setVehicle3DSourceImage(image);
    setConfirmedFullVehicle(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const takePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== 'granted') {
      Toast.show('Camera access is required to take a full vehicle photo.', 'warning');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) await saveAsset(result.assets[0]);
  }, [saveAsset]);

  const chooseFromGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Toast.show('Photo library access is required to choose a vehicle photo.', 'warning');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) await saveAsset(result.assets[0]);
  }, [saveAsset]);

  const generateModel = useCallback(() => {
    if (!validation.valid || !confirmedFullVehicle) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(AI_SCAN_ROUTES.arView as never);
  }, [confirmedFullVehicle, router, validation.valid]);

  if (!scan) {
    return (
      <ScannerBackground style={{ paddingTop: insets.top }}>
        <StatusBar barStyle="light-content" />
        <ScannerHeader title="Prepare Vehicle Photo" onBack={() => router.back()} />
        <View style={styles.empty}>
          <Ionicons name="cube-outline" size={56} color={scannerColors.textMuted} />
          <Text style={styles.emptyTitle}>No diagnosis loaded</Text>
          <Text style={styles.emptyText}>Run an AI inspection before starting optional 3D generation.</Text>
        </View>
      </ScannerBackground>
    );
  }

  return (
    <ScannerBackground style={{ paddingTop: insets.top }}>
      <StatusBar barStyle="light-content" />
      <ScannerHeader
        eyebrow={copy.eyebrow}
        title="Prepare Your Vehicle for 3D"
        onBack={() => router.back()}
        right={<Ionicons name="camera-outline" size={20} color={scannerColors.orange} />}
      />
      <PipelineStepper currentIndex={2} stepStates={workflow.stepStates} />

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Animated.View entering={FadeInDown.duration(380)}>
          <GlassPanel style={styles.introCard} intense>
            <AiPill label="Separate 3D source photo" icon="images-outline" />
            <Text style={styles.title}>Use a clear full-vehicle photo</Text>
            <Text style={styles.description}>
              Use a clear photo showing the entire vehicle. Close-up damage photos are useful for AI diagnosis but are not enough for a full-vehicle 3D visualization.
            </Text>
            <View style={styles.contextRow}>
              <Ionicons
                name={noDamageDetected ? 'information-circle-outline' : 'shield-checkmark-outline'}
                size={18}
                color={scannerColors.orangeSoft}
              />
              <Text style={styles.contextText}>{copy.contextNote}</Text>
            </View>
          </GlassPanel>
        </Animated.View>

        <GlassPanel style={styles.requirementsCard}>
          <View style={styles.cardHead}>
            <View style={styles.cardIcon}>
              <Ionicons name="checkmark-done-outline" size={19} color={scannerColors.orange} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>3D Photo Requirements</Text>
              <Text style={styles.cardSubtitle}>The current 3D pipeline uses one vehicle image.</Text>
            </View>
          </View>
          <View style={styles.requirementList}>
            {THREE_D_REQUIREMENTS.map((requirement) => (
              <View key={requirement} style={styles.requirementRow}>
                <Ionicons name="checkmark-circle" size={17} color={scannerColors.green} />
                <Text style={styles.requirementText}>{requirement}</Text>
              </View>
            ))}
          </View>
          <View style={styles.warningRow}>
            <Ionicons name="warning-outline" size={18} color={scannerColors.orange} />
            <Text style={styles.warningText}>
              Damage close-up photos alone are not suitable for full-vehicle 3D generation. Leave some space around the vehicle.
            </Text>
          </View>
        </GlassPanel>

        <GlassPanel style={styles.photoCard} contentStyle={styles.photoCardInner} intense>
          {vehicle3DSourceImage ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: vehicle3DSourceImage.uri }} style={styles.previewImage} />
              <View style={styles.previewBadge}>
                <Ionicons name="checkmark-circle" size={15} color={scannerColors.green} />
                <Text style={styles.previewBadgeText}>3D source selected</Text>
              </View>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <View style={styles.placeholderIcon}>
                <Ionicons name="car-sport-outline" size={38} color={scannerColors.orange} />
              </View>
              <Text style={styles.placeholderTitle}>Add one full-vehicle photo</Text>
              <Text style={styles.placeholderText}>The diagnosis photo will not be replaced.</Text>
            </View>
          )}

          <Pressable onPress={takePhoto} style={styles.captureButton}>
            <LinearGradient
              colors={[...scannerPrimaryGradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name="camera" size={19} color="#fff" />
            <Text style={styles.captureButtonText}>Take Full Vehicle Photo</Text>
          </Pressable>
          <Pressable onPress={chooseFromGallery} style={styles.galleryButton}>
            <Ionicons name="images-outline" size={18} color={scannerColors.orangeSoft} />
            <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
          </Pressable>
        </GlassPanel>

        {vehicle3DSourceImage ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: confirmedFullVehicle }}
            onPress={() => {
              Haptics.selectionAsync();
              setConfirmedFullVehicle((value) => !value);
            }}
            style={[styles.confirmRow, confirmedFullVehicle && styles.confirmRowChecked]}
          >
            <Ionicons
              name={confirmedFullVehicle ? 'checkbox' : 'square-outline'}
              size={23}
              color={confirmedFullVehicle ? scannerColors.orange : scannerColors.textMuted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmTitle}>I can see the full vehicle in this photo.</Text>
              <Text style={styles.confirmText}>The app checks file readiness, not whether the whole vehicle is visible.</Text>
            </View>
          </Pressable>
        ) : null}
      </ScrollView>

      <BottomActionBar
        primaryLabel={copy.generationLabel}
        primaryIcon="cube-outline"
        disabled={!validation.valid || !confirmedFullVehicle}
        onPrimaryPress={generateModel}
        secondaryLabel="Skip 3D and Continue to Estimate"
        onSecondaryPress={() => {
          aiScanStore.activateWorkflowStage('price');
          router.push(AI_SCAN_ROUTES.estimate as never);
        }}
      />
    </ScannerBackground>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },
  introCard: {
    borderColor: 'rgba(255,107,53,0.30)',
  },
  title: {
    color: scannerColors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 14,
  },
  description: {
    color: scannerColors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: scannerColors.border,
    paddingTop: 12,
  },
  contextText: {
    flex: 1,
    color: scannerColors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  requirementsCard: {
    borderColor: 'rgba(255,255,255,0.13)',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,53,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  cardTitle: {
    color: scannerColors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  cardSubtitle: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  requirementList: {
    gap: 10,
    marginTop: 16,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requirementText: {
    color: scannerColors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 16,
    borderRadius: 16,
    padding: 12,
    backgroundColor: 'rgba(245,158,11,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.22)',
  },
  warningText: {
    flex: 1,
    color: scannerColors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  photoCard: {
    borderColor: 'rgba(255,107,53,0.24)',
  },
  photoCardInner: {
    gap: 10,
  },
  previewWrap: {
    height: 220,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(4,6,9,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
  },
  previewBadgeText: {
    color: scannerColors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  photoPlaceholder: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,107,53,0.35)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  placeholderIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,53,0.10)',
    marginBottom: 12,
  },
  placeholderTitle: {
    color: scannerColors.text,
    fontSize: 15,
    fontWeight: '900',
  },
  placeholderText: {
    color: scannerColors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  captureButton: {
    height: 54,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '900',
  },
  galleryButton: {
    height: 48,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
    borderWidth: 1,
    borderColor: scannerColors.borderStrong,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  galleryButtonText: {
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: scannerColors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  confirmRowChecked: {
    borderColor: 'rgba(255,107,53,0.42)',
    backgroundColor: 'rgba(255,107,53,0.08)',
  },
  confirmTitle: {
    color: scannerColors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  confirmText: {
    color: scannerColors.textMuted,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 3,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyTitle: {
    color: scannerColors.text,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 14,
  },
  emptyText: {
    color: scannerColors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 7,
  },
});
