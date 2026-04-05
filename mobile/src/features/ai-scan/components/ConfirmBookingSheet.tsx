import React, { useEffect } from 'react';
import { Image } from 'expo-image';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeInUp,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { CostEstimate, AddOnService } from '../types';
import { formatPhp } from '../utils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ACCENT = '#FF6B35';

/* ═══════════════════════════════════════════════════════════════════════════════
 * CONFIRM BOOKING SHEET — Premium full-screen summary modal
 *
 * Tesla/Porsche-level final review before locking the repair quote
 * ═══════════════════════════════════════════════════════════════════════════════ */

interface ConfirmBookingSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  estimate: CostEstimate;
  selectedServiceCount: number;
  beforeImageUri?: string | null;
  afterImageUri?: string | null;
  modelAvailable: boolean;
}

/* ── Pulsing dot for "Recommended" label ── */
function PulseDot() {
  const pulse = useSharedValue(0.4);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000 }),
        withTiming(0.4, { duration: 1000 })
      ),
      -1,
      true
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));
  return <Animated.View style={[styles.pulseDot, style]} />;
}

export default function ConfirmBookingSheet({
  visible,
  onClose,
  onConfirm,
  confirming,
  estimate,
  selectedServiceCount,
  beforeImageUri,
  afterImageUri,
  modelAvailable,
}: ConfirmBookingSheetProps) {
  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View entering={FadeIn.duration(200)} style={styles.backdrop}>
        <Animated.View entering={SlideInDown.springify().damping(20)} style={styles.sheet}>
          <BlurView intensity={60} tint="dark" style={styles.blurFill}>
            {/* ── Header ── */}
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Confirm Service</Text>
                <Text style={styles.headerSub}>Review your repair plan before submitting</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={18} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={{ paddingBottom: 120 }}
              showsVerticalScrollIndicator={false}
            >
              {/* ── Preview Thumbnails ── */}
              {(beforeImageUri || afterImageUri) && (
                <Animated.View entering={FadeInDown.delay(100).springify()} style={styles.previewRow}>
                  {beforeImageUri && (
                    <View style={styles.previewSlot}>
                      <Image source={beforeImageUri} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                      <View style={styles.previewLabel}>
                        <View style={[styles.previewDot, { backgroundColor: '#FF5252' }]} />
                        <Text style={styles.previewLabelText}>Before</Text>
                      </View>
                    </View>
                  )}
                  {afterImageUri && (
                    <View style={styles.previewSlot}>
                      <Image source={afterImageUri} style={styles.previewImage} contentFit="cover" cachePolicy="memory-disk" transition={200} />
                      <View style={styles.previewLabel}>
                        <View style={[styles.previewDot, { backgroundColor: '#00E676' }]} />
                        <Text style={styles.previewLabelText}>After</Text>
                      </View>
                    </View>
                  )}
                  {modelAvailable && (
                    <View style={[styles.previewSlot, styles.previewSlotMini]}>
                      <View style={styles.modelBadge}>
                        <Ionicons name="cube-outline" size={18} color={ACCENT} />
                        <Text style={styles.modelBadgeText}>3D</Text>
                      </View>
                    </View>
                  )}
                </Animated.View>
              )}

              {/* ── Repair Services ── */}
              <Animated.View entering={FadeInDown.delay(200).springify()}>
                <Text style={styles.sectionLabel}>REPAIR SERVICES ({selectedServiceCount})</Text>
                {estimate.breakdown.map((line) => (
                  <View key={line.serviceId} style={styles.lineItem}>
                    <View style={styles.lineItemLeft}>
                      <Ionicons name="construct-outline" size={12} color="#888" />
                      <Text style={styles.lineItemName}>{line.serviceName}</Text>
                    </View>
                    <Text style={styles.lineItemPrice}>
                      {formatPhp(line.subtotalMin)} – {formatPhp(line.subtotalMax)}
                    </Text>
                  </View>
                ))}
              </Animated.View>

              {/* ── Add-Ons ── */}
              {estimate.addOnBreakdown.length > 0 && (
                <Animated.View entering={FadeInDown.delay(300).springify()}>
                  <Text style={styles.sectionLabel}>ADD-ON SERVICES</Text>
                  {estimate.addOnBreakdown.map((addOn) => (
                    <View key={addOn.id} style={styles.lineItem}>
                      <View style={styles.lineItemLeft}>
                        <Ionicons name="sparkles-outline" size={12} color={ACCENT} />
                        <Text style={styles.lineItemName}>{addOn.name}</Text>
                      </View>
                      <Text style={[styles.lineItemPrice, { color: ACCENT }]}>
                        +{formatPhp(addOn.price)}
                      </Text>
                    </View>
                  ))}
                </Animated.View>
              )}

              {/* ── Cost Summary ── */}
              <Animated.View entering={FadeInDown.delay(350).springify()} style={styles.costSummaryCard}>
                <LinearGradient
                  colors={['rgba(255,107,53,0.06)', 'rgba(255,107,53,0.02)', 'rgba(4,4,6,0.5)']}
                  style={styles.costGradient}
                >
                  <View style={styles.costRow}>
                    <Text style={styles.costLabel}>Estimated Range</Text>
                    <Text style={styles.costRange}>{estimate.formattedRange}</Text>
                  </View>
                  <View style={styles.recommendedRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <PulseDot />
                      <Text style={styles.recommendedLabel}>Recommended</Text>
                    </View>
                    <Text style={styles.recommendedValue}>{estimate.formattedRecommended}</Text>
                  </View>
                  {estimate.addOnTotal > 0 && (
                    <View style={styles.addOnTotalRow}>
                      <Text style={styles.addOnTotalLabel}>Includes Add-Ons</Text>
                      <Text style={styles.addOnTotalValue}>+{formatPhp(estimate.addOnTotal)}</Text>
                    </View>
                  )}
                </LinearGradient>
              </Animated.View>

              {/* ── Assumptions ── */}
              {estimate.assumptions.length > 0 && (
                <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.assumptionsWrap}>
                  {estimate.assumptions.map((a, i) => (
                    <Text key={i} style={styles.assumptionText}>• {a}</Text>
                  ))}
                </Animated.View>
              )}
            </ScrollView>

            {/* ── Bottom CTA ── */}
            <Animated.View entering={FadeInUp.delay(500).springify()} style={styles.ctaWrap}>
              <LinearGradient
                colors={['rgba(4,4,6,0)', 'rgba(4,4,6,0.98)']}
                style={styles.ctaGradientMask}
              />
              <View style={styles.ctaRow}>
                <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={onConfirm}
                  disabled={confirming}
                  style={[styles.confirmBtn, confirming && { opacity: 0.5 }]}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={[ACCENT, '#D44200']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.confirmBtnGradient}
                  >
                    <Ionicons name="shield-checkmark-outline" size={15} color="#fff" />
                    <Text style={styles.confirmBtnText}>
                      {confirming ? 'Submitting...' : 'Confirm Booking'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          </BlurView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  blurFill: {
    flex: 1,
    backgroundColor: 'rgba(8,8,14,0.92)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  /* ── Header ── */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSub: {
    color: '#6a6a78',
    fontSize: 11,
    marginTop: 2,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: 20,
  },
  scrollBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },

  /* ── Preview ── */
  previewRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  previewSlot: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0c0c14',
  },
  previewSlotMini: {
    maxWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: 80,
  },
  previewLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  previewDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  previewLabelText: {
    color: '#aaa',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  modelBadge: {
    alignItems: 'center',
    gap: 4,
    padding: 10,
  },
  modelBadgeText: {
    color: ACCENT,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  /* ── Sections ── */
  sectionLabel: {
    color: '#5a5a68',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 14,
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  lineItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  lineItemName: {
    color: '#ddd',
    fontSize: 12,
    fontWeight: '600',
  },
  lineItemPrice: {
    color: '#bbb',
    fontSize: 11,
    fontWeight: '700',
  },

  /* ── Cost Summary ── */
  costSummaryCard: {
    marginTop: 18,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.15)',
  },
  costGradient: {
    padding: 16,
    gap: 10,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  costLabel: {
    color: '#7a7a88',
    fontSize: 11,
    fontWeight: '600',
  },
  costRange: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '700',
  },
  recommendedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
  },
  recommendedLabel: {
    color: ACCENT,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recommendedValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  addOnTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addOnTotalLabel: {
    color: '#5a5a68',
    fontSize: 10,
    fontWeight: '600',
  },
  addOnTotalValue: {
    color: ACCENT,
    fontSize: 12,
    fontWeight: '700',
  },

  /* ── Assumptions ── */
  assumptionsWrap: {
    marginTop: 14,
    gap: 3,
  },
  assumptionText: {
    color: '#5a5a68',
    fontSize: 10,
    lineHeight: 15,
  },

  /* ── CTA ── */
  ctaWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  ctaGradientMask: {
    height: 30,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 4,
    backgroundColor: 'rgba(4,4,6,0.98)',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  confirmBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 12,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
