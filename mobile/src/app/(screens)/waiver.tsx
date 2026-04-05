import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import SignatureScreen from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import type { BookingRecord } from '@/services/api/types';

// ─── Design Tokens ───────────────────────────────────────────────────────────
const ACCENT = '#FF6B35';
const ACCENT_DARK = '#CC5214';
const BLACK = '#0A0A0A';
const SURFACE = '#111114';
const SURFACE_ALT = '#1A1A22';
const BORDER = '#2A2A30';

// ─── Terms Content ───────────────────────────────────────────────────────────
const WAIVER_SECTIONS = [
  {
    title: '1. Service Agreement',
    content:
      'By signing this waiver, you agree to the terms and conditions of the AutoGloss Smart Detailing service. The services rendered include but are not limited to: exterior wash, interior cleaning, paint correction, ceramic coating, and paint protection film (PPF) installation as outlined in your booking.',
  },
  {
    title: '2. Payment Terms',
    content:
      'Full payment for all services is collected strictly on-site upon completion of the service. We accept Cash and GCash as payment methods. A booking does not constitute a financial transaction — it is a reservation for service only.',
  },
  {
    title: '3. Vehicle Inspection',
    content:
      'A pre-service inspection will be conducted and documented with photographs. Any pre-existing damage, scratches, dents, or defects will be recorded before work begins. By signing, you confirm that the pre-service report accurately reflects the condition of your vehicle.',
  },
  {
    title: '4. Limitation of Liability',
    content:
      'AutoGloss shall not be held liable for any pre-existing conditions, manufacturer defects, or damages arising from normal wear and tear. While we exercise maximum care, minor imperfections inherent to the detailing process (e.g., swirl marks on extremely degraded paint) may occur.',
  },
  {
    title: '5. Cancellation & No-Show Policy',
    content:
      'Customers must arrive within 15 minutes of their scheduled appointment to avoid automatic cancellation. Failure to show without prior notice may result in a temporary booking restriction for future appointments.',
  },
  {
    title: '6. Data Privacy',
    content:
      'Personal information collected during the booking and waiver process (name, contact number, vehicle details, signature) is stored securely and used solely for service fulfillment, communication, and legal record-keeping in compliance with the Data Privacy Act of 2012 (RA 10173).',
  },
];

type PhotoAngles = 'front' | 'left' | 'right' | 'rear';

export default function WaiverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ bookingId?: string }>();
  const bookingId = params.bookingId;

  const sigRef = useRef<any>(null);
  const scrollRef = useRef<ScrollView>(null);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(!!bookingId);
  const [damageNotes, setDamageNotes] = useState('');

  const [photos, setPhotos] = useState<Record<string, string | null>>({
    front: null,
    left: null,
    right: null,
    rear: null,
  });

  useEffect(() => {
    if (bookingId) {
      bookingService
        .getBookingById(bookingId)
        .then((res) => setBooking(res))
        .catch((err) => {
          console.error(err);
          Alert.alert('Error', 'Could not fetch booking details.');
        })
        .finally(() => setLoadingBooking(false));
    }
  }, [bookingId]);

  const handlePickImage = async (angle: string) => {
    Alert.alert(
      'Take Photo',
      'Choose a photo source',
      [
        {
          text: 'Camera',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Camera permission is required.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.5,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setPhotos((prev) => ({ ...prev, [angle]: base64Data }));
            }
          },
        },
        {
          text: 'Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Gallery permission is required.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              quality: 0.5,
              base64: true,
            });
            if (!result.canceled && result.assets[0].base64) {
              const base64Data = `data:image/jpeg;base64,${result.assets[0].base64}`;
              setPhotos((prev) => ({ ...prev, [angle]: base64Data }));
            }
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleSignatureEnd = () => {
    sigRef.current?.readSignature();
  };

  const handleOK = (signature: string) => {
    setSignatureData(signature);
  };

  const handleClear = () => {
    sigRef.current?.clearSignature();
    setSignatureData(null);
  };

  const handleSubmit = async () => {
    const uploadedPhotos = Object.values(photos).filter(Boolean) as string[];
    
    if (uploadedPhotos.length < 2) {
      Alert.alert('Photos Required', 'Please upload at least 2 pre-service condition photos (ideally all 4 sides).');
      return;
    }

    if (!signatureData) {
      Alert.alert('Signature Required', 'Please sign the waiver before submitting.');
      return;
    }

    if (!bookingId) {
      Alert.alert('Error', 'Booking ID is missing. Cannot submit waiver.');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // 1. Submit waiver signature
      await bookingService.signWaiver(bookingId, signatureData);
      
      // 2. Submit pre-service inspection photos
      await bookingService.uploadInspection(bookingId, uploadedPhotos, damageNotes);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSubmitted(true);
    } catch (error) {
      console.error(error);
      Alert.alert('Submission Failed', 'An error occurred while submitting the waiver. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Success State ───
  if (isSubmitted) {
    return (
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={s.successCenter}>
          <Animated.View entering={FadeInDown.springify()} style={s.successContent}>
            <LinearGradient colors={[ACCENT, ACCENT_DARK]} style={s.successIcon}>
              <Ionicons name="document-text" size={36} color="#fff" />
            </LinearGradient>
            <Text style={s.successTitle}>Waiver Signed!</Text>
            <Text style={s.successSub}>
              Your digital waiver and photos have been securely recorded.{'\n'}
              A copy will be available in the admin portal.
            </Text>
            <TouchableOpacity
              style={s.successBtn}
              activeOpacity={0.88}
              onPress={() => router.back()}
            >
              <Ionicons name="checkmark-circle" size={18} color={BLACK} />
              <Text style={s.successBtnText}>Done</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─── Main UI ───
  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={18} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Service Waiver</Text>
        <View style={{ width: 36 }} />
      </View>

      {loadingBooking ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={s.loadingText}>Loading details...</Text>
        </View>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
        >
          {/* Info Banner */}
          <Animated.View entering={FadeInDown.delay(100).springify()}>
            <View style={s.infoBanner}>
              <LinearGradient
                colors={['rgba(255,107,53,0.12)', 'rgba(255,107,53,0.04)']}
                style={s.infoBannerInner}
              >
                <View style={s.infoBannerIcon}>
                  <Ionicons name="shield-checkmark" size={20} color={ACCENT} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.infoBannerTitle}>Digital Waiver & Inspection</Text>
                  <Text style={s.infoBannerSub}>
                    Please document vehicle condition, review terms, and sign below.
                  </Text>
                </View>
              </LinearGradient>
            </View>
          </Animated.View>

          {/* Customer Info */}
          <Animated.View entering={FadeInDown.delay(150).springify()}>
            <Text style={s.sectionLabel}>CUSTOMER INFO</Text>
            <View style={s.customerCard}>
              <View style={s.customerRow}>
                <View style={s.customerAvatar}>
                  <Text style={s.customerAvatarText}>
                    {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'AG'}
                  </Text>
                </View>
                <View>
                  <Text style={s.customerName}>{profile?.full_name || 'Customer'}</Text>
                  <Text style={s.customerEmail}>{profile?.email || 'N/A'}</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Vehicle Info */}
          <Animated.View entering={FadeInDown.delay(200).springify()}>
            <Text style={s.sectionLabel}>VEHICLE INFO</Text>
            <View style={s.vehicleCard}>
              <View style={s.vehicleRow}>
                <Ionicons name="car-sport" size={24} color={ACCENT} style={{ marginRight: 12 }} />
                <View>
                  <Text style={s.vehicleName}>
                    {`${booking?.vehicleYear || ''} ${booking?.vehicleMake || ''} ${booking?.vehicleModel || 'Unknown Vehicle'}`.trim()}
                  </Text>
                  <Text style={s.vehicleDetails}>
                    {`${booking?.vehicleColor || 'N/A'} • Plate: ${booking?.vehiclePlate || 'N/A'}`}
                  </Text>
                </View>
              </View>
              <View style={s.divider} />
              <View style={s.vehicleRow}>
                <Ionicons name="build" size={20} color="#888" style={{ marginRight: 16 }} />
                <View>
                  <Text style={s.vehicleDetails}>Service Requested</Text>
                  <Text style={s.vehicleName}>{booking?.serviceName || 'N/A'}</Text>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Pre-Service Photos */}
          <Animated.View entering={FadeInDown.delay(250).springify()}>
            <Text style={s.sectionLabel}>PRE-SERVICE CONDITION MODULE</Text>
            <View style={s.card}>
              <Text style={s.photoInstruction}>
                Capture 4 clear photos of the vehicle exterior before service begins. Minimum 2 required.
              </Text>
              <View style={s.photoGrid}>
                {['front', 'left', 'right', 'rear'].map((angle) => (
                  <TouchableOpacity
                    key={angle}
                    style={s.photoBox}
                    onPress={() => handlePickImage(angle)}
                    activeOpacity={0.8}
                  >
                    {photos[angle] ? (
                      <Animated.Image 
                        source={{ uri: photos[angle]! }} 
                        style={s.photoImage} 
                        entering={FadeIn}
                      />
                    ) : (
                      <View style={s.photoEmpty}>
                        <Ionicons name="camera" size={24} color="#666" />
                        <Text style={s.photoAngle}>{angle.toUpperCase()}</Text>
                      </View>
                    )}
                    {photos[angle] && (
                      <TouchableOpacity 
                        style={s.removePhotoBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          setPhotos(p => ({ ...p, [angle]: null }));
                        }}
                      >
                        <Ionicons name="close" size={12} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Damage Notes */}
              <View style={s.damageWrap}>
                <Text style={s.damageLabel}>Existing Damage / Scratches (Optional)</Text>
                <TextInput
                  style={s.damageInput}
                  placeholder="Note any pre-existing scratches, dents, or paint defects..."
                  placeholderTextColor="#666"
                  multiline
                  numberOfLines={3}
                  value={damageNotes}
                  onChangeText={setDamageNotes}
                />
              </View>
            </View>
          </Animated.View>

          {/* Terms & Conditions */}
          <Animated.View entering={FadeInDown.delay(300).springify()}>
            <Text style={s.sectionLabel}>TERMS & CONDITIONS</Text>
            <View style={s.termsCard}>
              {WAIVER_SECTIONS.map((section, i) => (
                <View key={i} style={i > 0 ? s.termSection : undefined}>
                  <Text style={s.termTitle}>{section.title}</Text>
                  <Text style={s.termBody}>{section.content}</Text>
                </View>
              ))}
              <View style={s.termSection}>
                <Text style={s.termTitle}>7. Acknowledgment</Text>
                <Text style={s.termBody}>
                  By affixing my digital signature below, I certify that I have read,
                  understood, and agree to all the terms and conditions outlined above.
                  I understand that this digital signature is legally binding.
                </Text>
              </View>
            </View>
          </Animated.View>

          {/* Signature Pad */}
          <Animated.View entering={FadeInDown.delay(350).springify()}>
            <Text style={s.sectionLabel}>YOUR SIGNATURE</Text>
            <View style={s.sigCard}>
              <View style={s.sigHeader}>
                <View style={s.sigHeaderLeft}>
                  <Ionicons name="create-outline" size={16} color={ACCENT} />
                  <Text style={s.sigHeaderText}>Draw your signature below</Text>
                </View>
                <TouchableOpacity onPress={handleClear} style={s.clearBtn}>
                  <Ionicons name="refresh" size={14} color="#888" />
                  <Text style={s.clearBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>

              <View style={s.sigPadWrap}>
                <SignatureScreen
                  ref={sigRef}
                  onEnd={handleSignatureEnd}
                  onOK={handleOK}
                  onEmpty={() => setSignatureData(null)}
                  autoClear={false}
                  descriptionText=""
                  webStyle={`
                    .m-signature-pad { box-shadow: none; border: none; margin: 0; }
                    .m-signature-pad--body { border: none; }
                    .m-signature-pad--footer { display: none; }
                    .m-signature-pad--body canvas {
                      background-color: #1A1A22;
                      border-radius: 12px;
                    }
                    body { background-color: #1A1A22; margin: 0; overscroll-behavior-y: none; }
                  `}
                  backgroundColor="#1A1A22"
                  penColor="#FFFFFF"
                  dotSize={2}
                  minWidth={1.5}
                  maxWidth={3}
                  style={s.sigCanvas}
                />
              </View>

              {/* Signature line */}
              <View style={s.sigLine}>
                <View style={s.sigLineDash} />
                <Text style={s.sigLineLabel}>Signature</Text>
              </View>

              {signatureData && (
                <View style={s.sigConfirm}>
                  <Ionicons name="checkmark-circle" size={14} color="#4ADE80" />
                  <Text style={s.sigConfirmText}>Signature captured</Text>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Submit */}
          <Animated.View entering={FadeInDown.delay(400).springify()}>
            <TouchableOpacity
              style={[
                s.submitBtn,
                (!signatureData || isSubmitting) && s.submitBtnDisabled,
              ]}
              activeOpacity={0.88}
              disabled={(!signatureData && !isSubmitting) || isSubmitting}
              onPress={handleSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color={BLACK} />
              ) : (
                <>
                  <Ionicons name="document-text" size={18} color={BLACK} />
                  <Text style={s.submitBtnText}>Submit Document</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={s.legalNote}>
              This digital document is legally binding under Philippine law (RA 8792 — E-Commerce Act).
              Records are stored securely for dispute resolution.
            </Text>
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BLACK },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingBottom: 40, gap: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: '#888', fontSize: 14, fontWeight: '500' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },

  infoBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  infoBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  infoBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,53,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBannerTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  infoBannerSub: { fontSize: 12, color: '#999', lineHeight: 17 },

  // Card Basics
  card: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 16,
  },
  customerCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  vehicleCard: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 4 },

  customerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  customerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerAvatarText: { fontSize: 14, fontWeight: '800', color: BLACK },
  customerName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  customerEmail: { fontSize: 12, color: '#888', marginTop: 1 },

  vehicleRow: { flexDirection: 'row', alignItems: 'center' },
  vehicleName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  vehicleDetails: { fontSize: 12, color: '#888', marginTop: 2 },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#555',
    marginBottom: -8,
  },

  // Photos
  photoInstruction: { fontSize: 12, color: '#aaa', lineHeight: 18 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  photoBox: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: SURFACE_ALT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  photoEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoAngle: { fontSize: 11, fontWeight: '700', color: '#666', letterSpacing: 1 },
  photoImage: { width: '100%', height: '100%' },
  removePhotoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  damageWrap: { marginTop: 4 },
  damageLabel: { fontSize: 12, fontWeight: '600', color: '#aaa', marginBottom: 8 },
  damageInput: {
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Terms
  termsCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    gap: 0,
  },
  termSection: { marginTop: 18, borderTopWidth: 1, borderTopColor: '#1E1E26', paddingTop: 18 },
  termTitle: { fontSize: 13, fontWeight: '700', color: ACCENT, marginBottom: 6 },
  termBody: { fontSize: 12.5, color: '#bbb', lineHeight: 20 },

  // Signature
  sigCard: {
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  sigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sigHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sigHeaderText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SURFACE_ALT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: BORDER,
  },
  clearBtnText: { fontSize: 11, fontWeight: '600', color: '#888' },

  sigPadWrap: {
    height: 200,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: SURFACE_ALT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  sigCanvas: {
    flex: 1,
    width: '100%',
  },

  sigLine: { alignItems: 'center', gap: 6, marginTop: -4 },
  sigLineDash: {
    width: '80%',
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#333',
  },
  sigLineLabel: { fontSize: 10, fontWeight: '600', color: '#555', letterSpacing: 1 },

  sigConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
  },
  sigConfirmText: { fontSize: 11, fontWeight: '600', color: '#4ADE80' },

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 15, fontWeight: '800', color: BLACK, letterSpacing: 0.3 },

  legalNote: {
    fontSize: 10,
    color: '#555',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 4,
  },

  // Success
  successCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  successContent: { alignItems: 'center', gap: 16, width: '100%' },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: { fontSize: 26, fontWeight: '800', color: '#fff', textAlign: 'center' },
  successSub: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 21, marginBottom: 8 },
  successBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    width: '100%',
  },
  successBtnText: { fontSize: 15, fontWeight: '800', color: BLACK },
});
