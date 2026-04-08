/**
 * Book Screen — Premium 4-Step Service Booking Wizard
 * McLaren/KTM high-end automotive aesthetic
 * Step 0: Vehicle Selection
 * Step 1: Scheduling & Details
 * Step 2: Pre-Confirmation Warning
 * Step 3: Booking Confirmation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutLeft,
  SlideInRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/services/api/client';
import { bookingService } from '@/services/api/bookingService';
import { serviceService } from '@/services/api/serviceService';
import { vehicleService } from '@/services/api/vehicleService';
import type { ServiceOption, Vehicle } from '@/services/api/types';
import { Palette, BorderRadius, Shadows, TabBarHeight, Spacing } from '@/constants/theme';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import { Validation } from '@/utils/validation';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCENT = '#FF6B35';
const ACCENT_DARK = '#CC5214';
const BLACK = '#0A0A0A';
const SURFACE = '#111114';
const BORDER = '#2A2A30';

const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM',
  '4:00 PM', '5:00 PM',
];

const STEP_LABELS = ['Vehicle', 'Schedule', 'Review', 'Confirm'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate next N days starting from today */
function generateDays(count = 14): { label: string; dayName: string; dateKey: string; isToday: boolean }[] {
  const days = [];
  const today = new Date();
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = dayNames[d.getDay()];
    const dateNum = d.getDate();
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    days.push({
      label: `${dateNum}`,
      dayName,
      dateKey: `${month} ${dateNum}, ${year}`,
      isToday: i === 0,
    });
  }
  return days;
}

const DAYS = generateDays(21);

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** Progress bar step indicator */
function StepIndicator({ current }: { current: number }) {
  return (
    <View style={ind.container}>
      {STEP_LABELS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={i} style={ind.item}>
            <View style={ind.dotRow}>
              <View
                style={[
                  ind.dot,
                  done && ind.dotDone,
                  active && ind.dotActive,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : (
                  <Text style={[ind.dotNum, active && { color: BLACK }]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              {i < STEP_LABELS.length - 1 && (
                <View style={[ind.line, (done || active) && i < current && ind.lineDone]} />
              )}
            </View>
            <Text
              style={[
                ind.label,
                active && ind.labelActive,
                done && ind.labelDone,
              ]}
            >
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const ind = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BLACK,
  },
  item: { alignItems: 'center', flex: 1 },
  dotRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#1C1C22',
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  dotDone: { backgroundColor: ACCENT_DARK, borderColor: ACCENT_DARK },
  dotNum: { fontSize: 11, fontWeight: '700', color: '#555' },
  line: {
    flex: 1,
    height: 1.5,
    backgroundColor: BORDER,
    marginHorizontal: 3,
    maxWidth: 40,
  },
  lineDone: { backgroundColor: ACCENT_DARK },
  label: { fontSize: 9, fontWeight: '600', color: '#555', marginTop: 5, letterSpacing: 0.5 },
  labelActive: { color: ACCENT },
  labelDone: { color: ACCENT_DARK },
});

/** Vehicle card for step 0 */
function VehicleCard({
  vehicle,
  selected,
  onPress,
}: {
  vehicle: Vehicle;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const CAR_COLORS: Record<string, string> = {
    black: '#1a1a1a', white: '#f5f5f5', silver: '#C0C0C0',
    gray: '#808080', grey: '#808080', red: '#CC2222',
    blue: '#1E40AF', green: '#166534', yellow: '#CA8A04',
    orange: '#EA580C', brown: '#92400E',
  };
  const swatchColor = vehicle.color
    ? CAR_COLORS[vehicle.color.toLowerCase()] ?? '#888'
    : '#888';

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPressIn={() => { scale.value = withSpring(0.97); }}
        onPressOut={() => { scale.value = withSpring(1); }}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        style={[
          vc.card,
          selected && vc.cardSelected,
        ]}
      >
        {/* Car icon area */}
        <LinearGradient
          colors={selected ? [ACCENT, ACCENT_DARK] : ['#2C2C2E', '#1C1C1E']}
          style={vc.iconBox}
        >
          <Ionicons
            name="car-sport"
            size={24}
            color={selected ? '#fff' : '#8E8E93'}
          />
        </LinearGradient>

        {/* Info */}
        <View style={vc.info}>
          <Text style={vc.name} numberOfLines={1}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </Text>
          <View style={vc.meta}>
            <View style={[vc.swatch, { backgroundColor: swatchColor }]} />
            <Text style={vc.metaText}>{vehicle.color || 'Unknown color'}</Text>
            <View style={vc.dot} />
            <Text style={vc.plate}>{vehicle.plateNumber}</Text>
          </View>
        </View>

        {selected && (
          <View style={vc.checkContainer}>
            <Ionicons name="checkmark-circle" size={26} color={ACCENT} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const vc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1C1C1E', // Dark gray
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#2C2C2E',
    padding: 16,
    position: 'relative',
  },
  cardSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,107,53,0.08)',
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 5,
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 6, justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#555' },
  metaText: { fontSize: 13, color: '#A0A0AB', fontWeight: '500' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#555' },
  plate: { fontSize: 13, fontWeight: '600', color: '#A0A0AB', textTransform: 'uppercase', letterSpacing: 0.5 },
  checkContainer: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#000',
    borderRadius: 13,
    padding: 2,
  },
});

/** Date strip day pill */
function DayPill({
  day,
  selected,
  onPress,
}: {
  day: { label: string; dayName: string; dateKey: string; isToday: boolean };
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[dp.pill, selected && dp.pillSelected]}
    >
      <Text style={[dp.dayName, selected && dp.textSelected]}>
        {day.dayName}
      </Text>
      <Text style={[dp.dateNum, selected && dp.numSelected]}>
        {day.label}
      </Text>
      {day.isToday && (
        <View style={[dp.todayDot, selected && dp.todayDotSelected]} />
      )}
    </TouchableOpacity>
  );
}

const dp = StyleSheet.create({
  pill: {
    width: 50,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    gap: 4,
  },
  pillSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  dayName: { fontSize: 9, fontWeight: '700', color: '#666', letterSpacing: 0.8 },
  dateNum: { fontSize: 18, fontWeight: '800', color: '#bbb' },
  textSelected: { color: 'rgba(0,0,0,0.7)' },
  numSelected: { color: BLACK },
  todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: ACCENT },
  todayDotSelected: { backgroundColor: BLACK },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BookScreen() {
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();
  const router = useRouter();

  // ── State ──
  const [step, setStep] = useState(0);

  // Step 0 — Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Step 1 — Service (loaded on mount)
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);

  // Step 1 — Schedule & Details
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [phone, setPhone] = useState('' );
  const [notes, setNotes] = useState('');

  // Add Vehicle form
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [vYear, setVYear] = useState('');
  const [vMake, setVMake] = useState('');
  const [vModel, setVModel] = useState('');
  const [vColor, setVColor] = useState('');
  const [vPlate, setVPlate] = useState('');
  
  // Validation Errors
  const [vYearError, setVYearError] = useState('');
  const [vMakeError, setVMakeError] = useState('');
  const [vModelError, setVModelError] = useState('');
  const [vColorError, setVColorError] = useState('');
  const [vPlateError, setVPlateError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  // General
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const dateScrollRef = useRef<ScrollView>(null);

  // ── Data Loading ──
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [v, s] = await Promise.all([
          vehicleService.getMyVehicles(),
          serviceService.getPublishedServices(),
        ]);
        if (mounted) {
          setVehicles(v);
          setServices(s);
        }
      } catch (err) {
        if (mounted) {
          console.warn('Failed to load booking data:', getApiErrorMessage(err));
        }
      } finally {
        if (mounted) setVehiclesLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, []);

  // ── Navigation ──
  const goNext = () => {
    if (step === 1) {
      setPhoneError('');
      if (phone.trim() && !Validation.isValidPhone(phone)) {
        setPhoneError('Enter a valid PH mobile number');
        return;
      }
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep((s) => s + 1);
  };
  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => Math.max(0, s - 1));
  };

  const reset = () => {
    setStep(0);
    setSelectedVehicle(null);
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setPhone('');
    setNotes('');
    setIsSuccess(false);
    setShowAddVehicle(false);
    setPhoneError('');
  };

  const resetVehicleForm = () => {
    setVYear('');
    setVMake('');
    setVModel('');
    setVColor('');
    setVPlate('');
    setVYearError('');
    setVMakeError('');
    setVModelError('');
    setVColorError('');
    setVPlateError('');
  };

  const handleAddVehicle = async () => {
    // Clear errors
    setVYearError('');
    setVMakeError('');
    setVModelError('');
    setVColorError('');
    setVPlateError('');

    let hasError = false;

    if (!vYear.trim() || vYear.length !== 4) {
      setVYearError('Valid 4-digit year');
      hasError = true;
    }
    if (!vMake.trim() || vMake.length < 2) {
      setVMakeError('Required');
      hasError = true;
    }
    if (!vModel.trim() || vModel.length < 2) {
      setVModelError('Required');
      hasError = true;
    }
    if (!vColor.trim() || vColor.length < 2) {
      setVColorError('Required');
      hasError = true;
    }

    const normalizedPlate = vPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z]{3}\d{4}$/.test(normalizedPlate)) {
      setVPlateError('Must be ABC1234');
      hasError = true;
    }

    if (hasError) return;

    setAddingVehicle(true);
    try {
      const newVehicle = await vehicleService.addVehicle({
        year: vYear.trim(),
        make: vMake.trim(),
        model: vModel.trim(),
        color: vColor.trim(),
        plateNumber: normalizedPlate,
      });
      Toast.show('Vehicle added successfully.', 'success');
      setVehicles((prev) => [...prev, newVehicle]);
      setSelectedVehicle(newVehicle);
      setShowAddVehicle(false);
      resetVehicleForm();
    } catch (error) {
      Toast.show(getApiErrorMessage(error, 'Could not add vehicle. Please try again.'), 'error');
    } finally {
      setAddingVehicle(false);
    }
  };

  // ── Confirm Booking ──
  const handleConfirm = async () => {
    if (!selectedService || !selectedDate || !selectedTime) return;
    setIsSubmitting(true);

    try {
      await bookingService.createBooking({
        service: selectedService,
        date: selectedDate,
        time: selectedTime,
        customerName: profile?.full_name,
        customerPhone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
        vehiclePlate: selectedVehicle?.plateNumber,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSuccess(true);
    } catch (error) {
      Toast.show(getApiErrorMessage(error, 'Something went wrong. Please try again.'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Computed ──
  const canProceedStep0 = !!selectedVehicle;
  const canProceedStep1 = !!selectedService && !!selectedDate && !!selectedTime;

  // ─────────────────────────────────────────────────────────────────────────
  // Success screen
  // ─────────────────────────────────────────────────────────────────────────
  if (isSuccess) {
    return (
      <View style={[ss.screen, { backgroundColor: BLACK }]}>
        <AnimatedHeader />
        <View style={ss.successCenter}>
          <Animated.View entering={FadeInDown.springify()} style={ss.successContent}>
            <LinearGradient colors={[ACCENT, ACCENT_DARK]} style={ss.successIcon}>
              <Ionicons name="checkmark" size={40} color="#fff" />
            </LinearGradient>
            <Text style={ss.successTitle}>Booking Confirmed!</Text>
            <Text style={ss.successSub}>
              Your appointment has been submitted.{'\n'}We'll confirm it shortly.
            </Text>
            <View style={{ gap: 12, width: '100%', marginTop: 10 }}>
              <PremiumButton
                title="Track My Booking"
                icon="navigate-outline"
                onPress={() => {
                  reset();
                  router.push('/(customer)/track');
                }}
              />
              <PremiumButton
                title="Book Another"
                variant="outline"
                onPress={reset}
              />
            </View>
          </Animated.View>
        </View>
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[ss.screen, { backgroundColor: BLACK }]}>
      <AnimatedHeader />
      <StepIndicator current={step} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={ss.scroll}
          contentContainerStyle={[ss.content, { paddingBottom: TabBarHeight + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ═══════════════════════════════════════════════════
              STEP 0 — VEHICLE SELECTION
          ═══════════════════════════════════════════════════ */}
          {step === 0 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              {/* Premium Welcome Banner */}
              <Animated.View entering={FadeInDown.delay(100).springify().damping(14).stiffness(110)} style={ss.compactGreeting}>
                <View style={ss.greetingHeaderRow}>
                   <View style={ss.greetingAvatarMini}>
                     <Text style={ss.greetingAvatarTextMini}>{profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'JD'}</Text>
                   </View>
                   <View style={ss.greetingTextRow}>
                     <Text style={ss.greetingTextMini}>Good to see you,</Text>
                     <Text style={ss.greetingName}>{profile?.full_name?.split(' ')[0] || 'Member'}</Text>
                   </View>
                </View>
              </Animated.View>
              
              <Text style={ss.sectionTitle}>Select a Vehicle</Text>

              {/* Vehicle List */}
              {vehiclesLoading ? (
                <View style={ss.loadingBox}>
                  <ActivityIndicator size="large" color={ACCENT} />
                  <Text style={ss.loadingText}>Loading vehicles…</Text>
                </View>
              ) : vehicles.length === 0 ? (
                <View style={ss.emptyBox}>
                  <Ionicons name="car-outline" size={48} color="#333" />
                  <Text style={ss.emptyTitle}>No vehicles registered</Text>
                  <Text style={ss.emptySub}>
                    Add your vehicle below to get started.
                  </Text>
                </View>
              ) : (
                <View style={{ gap: 10 }}>
                  {vehicles.map((v, i) => (
                    <Animated.View
                      key={v.id}
                      entering={FadeInDown.delay(i * 60).springify()}
                    >
                      <VehicleCard
                        vehicle={v}
                        selected={selectedVehicle?.id === v.id}
                        onPress={() => setSelectedVehicle(v)}
                      />
                    </Animated.View>
                  ))}
                </View>
              )}

              {/* Add Vehicle CTA */}
              {!showAddVehicle ? (
                <TouchableOpacity
                  style={ss.addVehicleBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowAddVehicle(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={20} color={ACCENT} />
                  <Text style={ss.addVehicleText}>Add Vehicle</Text>
                  <Ionicons name="chevron-forward" size={16} color={ACCENT} />
                </TouchableOpacity>
              ) : (
                <Animated.View entering={FadeInDown.springify().damping(18)} style={avf.container}>
                  {/* Form Header */}
                  <View style={avf.header}>
                    <View style={avf.headerLeft}>
                      <LinearGradient colors={[ACCENT, ACCENT_DARK]} style={avf.headerIcon}>
                        <Ionicons name="car-sport" size={16} color="#fff" />
                      </LinearGradient>
                      <Text style={avf.headerTitle}>Add Vehicle</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setShowAddVehicle(false); resetVehicleForm(); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={22} color="#555" />
                    </TouchableOpacity>
                  </View>

                  {/* Year + Make Row */}
                  <View style={avf.row}>
                    <View style={avf.fieldHalf}>
                      <PremiumInput
                        label="YEAR"
                        iconName="calendar-outline"
                        placeholder="2024"
                        value={vYear}
                        onChangeText={(t) => { setVYear(t); setVYearError(''); }}
                        keyboardType="number-pad"
                        maxLength={4}
                        error={vYearError}
                      />
                    </View>
                    <View style={avf.fieldHalf}>
                      <PremiumInput
                        label="MAKE"
                        iconName="car-outline"
                        placeholder="Toyota"
                        value={vMake}
                        onChangeText={(t) => { setVMake(t); setVMakeError(''); }}
                        autoCapitalize="words"
                        error={vMakeError}
                      />
                    </View>
                  </View>

                  {/* Model + Color Row */}
                  <View style={avf.row}>
                    <View style={avf.fieldHalf}>
                      <PremiumInput
                        label="MODEL"
                        iconName="car-sport-outline"
                        placeholder="Camry"
                        value={vModel}
                        onChangeText={(t) => { setVModel(t); setVModelError(''); }}
                        autoCapitalize="words"
                        error={vModelError}
                      />
                    </View>
                    <View style={avf.fieldHalf}>
                      <PremiumInput
                        label="COLOR"
                        iconName="color-palette-outline"
                        placeholder="Black"
                        value={vColor}
                        onChangeText={(t) => { setVColor(t); setVColorError(''); }}
                        autoCapitalize="words"
                        error={vColorError}
                      />
                    </View>
                  </View>

                  {/* Plate Number */}
                  <View>
                    <PremiumInput
                      label="PLATE NUMBER"
                      iconName="barcode-outline"
                      placeholder="ABC1234"
                      value={vPlate}
                      onChangeText={(t) => { setVPlate(t.toUpperCase()); setVPlateError(''); }}
                      autoCapitalize="characters"
                      maxLength={7}
                      error={vPlateError}
                    />
                  </View>

                  {/* Submit */}
                  <TouchableOpacity
                    style={[avf.submitBtn, addingVehicle && { opacity: 0.6 }]}
                    disabled={addingVehicle}
                    activeOpacity={0.88}
                    onPress={handleAddVehicle}
                  >
                    {addingVehicle ? (
                      <ActivityIndicator size="small" color={BLACK} />
                    ) : (
                      <>
                        <Ionicons name="add-circle" size={18} color={BLACK} />
                        <Text style={avf.submitText}>Save Vehicle</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </Animated.View>
              )}

              {/* Next */}
              <PremiumButton
                title="Continue"
                icon="chevron-forward"
                onPress={goNext}
                disabled={!canProceedStep0}
              />
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 1 — SCHEDULING & DETAILS
          ═══════════════════════════════════════════════════ */}
          {step === 1 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              {/* Header */}
              <View style={ss.stepHeader}>
                <Text style={ss.stepTitle}>Schedule & Details</Text>
                <Text style={ss.stepSub}>
                  Choose your preferred date, time, and service.
                </Text>
              </View>

              {/* Service Selection */}
              <View>
                <Text style={ss.sectionLabel}>SELECT SERVICE</Text>
                <View style={{ gap: 10 }}>
                  {services.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedService(s);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                      style={[
                        sc.card,
                        selectedService?.id === s.id && sc.cardSelected,
                      ]}
                    >
                      <View style={[sc.iconBox, selectedService?.id === s.id && sc.iconBoxSelected]}>
                        <Ionicons
                          name={(s.icon as any) || 'pricetag-outline'}
                          size={22}
                          color={selectedService?.id === s.id ? '#fff' : '#666'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={sc.nameRow}>
                          <Text style={sc.name}>{s.name}</Text>
                          <Text style={sc.tag}>{s.tag}</Text>
                        </View>
                        <Text style={sc.desc} numberOfLines={1}>{s.description}</Text>
                        <View style={sc.meta}>
                          <Text style={sc.price}>₱{Number(s.price).toLocaleString()}</Text>
                          <View style={sc.timeRow}>
                            <Ionicons name="time-outline" size={11} color="#666" />
                            <Text style={sc.dur}>{s.duration}</Text>
                          </View>
                        </View>
                      </View>
                      {selectedService?.id === s.id && (
                        <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Date Strip */}
              <View>
                <Text style={ss.sectionLabel}>SELECT DATE</Text>
                <ScrollView
                  ref={dateScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 2 }}
                >
                  {DAYS.map((d) => (
                    <DayPill
                      key={d.dateKey}
                      day={d}
                      selected={selectedDate === d.dateKey}
                      onPress={() => {
                        setSelectedDate(d.dateKey);
                        Haptics.selectionAsync();
                      }}
                    />
                  ))}
                </ScrollView>
                {selectedDate && (
                  <View style={ss.selectedDateBadge}>
                    <Ionicons name="calendar-outline" size={13} color={ACCENT} />
                    <Text style={ss.selectedDateText}>{selectedDate}</Text>
                  </View>
                )}
              </View>

              {/* Time Grid */}
              {selectedDate && (
                <Animated.View entering={FadeInDown.springify()}>
                  <Text style={ss.sectionLabel}>SELECT TIME</Text>
                  <View style={tg.grid}>
                    {TIME_SLOTS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => {
                          setSelectedTime(t);
                          Haptics.selectionAsync();
                        }}
                        style={[
                          tg.pill,
                          selectedTime === t && tg.pillSelected,
                        ]}
                      >
                        <Text style={[tg.text, selectedTime === t && tg.textSelected]}>
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Contact & Notes */}
              <View style={{ gap: 12 }}>
                <Text style={ss.sectionLabel}>CONTACT & NOTES</Text>
                <PremiumInput
                  label="PHONE NUMBER (OPTIONAL)"
                  iconName="call-outline"
                  placeholder="+63 9xx xxx xxxx"
                  value={phone}
                  onChangeText={(t) => { setPhone(t); setPhoneError(''); }}
                  keyboardType="phone-pad"
                  error={phoneError}
                />
                
                <PremiumInput
                  label="SPECIAL INSTRUCTIONS (OPTIONAL)"
                  iconName="document-text-outline"
                  placeholder="e.g. Focus on the custom rims..."
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Navigation */}
              <View style={ss.btnRow}>
                <PremiumButton
                  title="Back"
                  variant="outline"
                  onPress={goBack}
                  style={{ flex: 1 }}
                  fullWidth={false}
                />
                <PremiumButton
                  title="Continue"
                  icon="chevron-forward"
                  onPress={goNext}
                  disabled={!canProceedStep1}
                  style={{ flex: 2 }}
                  fullWidth={false}
                />
              </View>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 2 — PRE-CONFIRMATION WARNING
          ═══════════════════════════════════════════════════ */}
          {step === 2 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              <View style={ss.stepHeader}>
                <Text style={ss.stepTitle}>Before You Confirm</Text>
                <Text style={ss.stepSub}>Please review the following before proceeding.</Text>
              </View>

              {/* Notice Card */}
              <View style={warn.card}>
                <LinearGradient
                  colors={['rgba(255,107,53,0.12)', 'rgba(255,107,53,0.04)']}
                  style={warn.gradient}
                >
                  <View style={warn.iconWrap}>
                    <Ionicons name="information-circle" size={32} color={ACCENT} />
                  </View>
                  <Text style={warn.title}>Service Package Booking</Text>
                  <Text style={warn.body}>
                    Select a service package and schedule your appointment.
                  </Text>

                  <View style={warn.divider} />

                  {[
                    { icon: 'cash-outline', text: 'Payment is collected on-site. No upfront payment required.' },
                    { icon: 'checkmark-circle-outline', text: 'Please review all booking details carefully before proceeding.' },
                    { icon: 'time-outline', text: 'Arrive 15 minutes before your scheduled time to avoid cancellation.' },
                    { icon: 'card-outline', text: 'We accept Cash and GCash payments on-site.' },
                  ].map((item, i) => (
                    <View key={i} style={warn.row}>
                      <View style={warn.rowIcon}>
                        <Ionicons name={item.icon as any} size={16} color={ACCENT} />
                      </View>
                      <Text style={warn.rowText}>{item.text}</Text>
                    </View>
                  ))}
                </LinearGradient>
              </View>

              {/* Quick Summary Preview */}
              <View style={warn.summaryPreview}>
                <Text style={warn.previewTitle}>YOUR BOOKING SUMMARY</Text>
                <View style={{ gap: 8 }}>
                  <View style={warn.previewRow}>
                    <Text style={warn.previewLabel}>Vehicle</Text>
                    <Text style={warn.previewVal}>
                      {selectedVehicle
                        ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`
                        : '—'}
                    </Text>
                  </View>
                  <View style={warn.previewRow}>
                    <Text style={warn.previewLabel}>Service</Text>
                    <Text style={warn.previewVal}>{selectedService?.name || '—'}</Text>
                  </View>
                  <View style={warn.previewRow}>
                    <Text style={warn.previewLabel}>Date</Text>
                    <Text style={warn.previewVal}>{selectedDate || '—'}</Text>
                  </View>
                  <View style={warn.previewRow}>
                    <Text style={warn.previewLabel}>Time</Text>
                    <Text style={warn.previewVal}>{selectedTime || '—'}</Text>
                  </View>
                </View>
              </View>

              <View style={ss.btnRow}>
                <PremiumButton
                  title="Back"
                  variant="outline"
                  onPress={goBack}
                  style={{ flex: 1 }}
                  fullWidth={false}
                />
                <PremiumButton
                  title="Proceed"
                  icon="arrow-forward"
                  onPress={goNext}
                  style={{ flex: 2 }}
                  fullWidth={false}
                />
              </View>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 3 — BOOKING CONFIRMATION
          ═══════════════════════════════════════════════════ */}
          {step === 3 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              {/* Header */}
              <View style={ss.stepHeader}>
                <Text style={[ss.stepTitle, { fontSize: 26 }]}>Booking Confirmation</Text>
                <Text style={ss.stepSub}>
                  Your appointment is almost set. Please review and confirm.
                </Text>
              </View>

              {/* Premium Summary Card */}
              <View style={conf.card}>
                {/* Card header band */}
                <LinearGradient
                  colors={[ACCENT, ACCENT_DARK]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={conf.cardHeader}
                >
                  <Ionicons name="car-sport" size={18} color="#fff" />
                  <Text style={conf.cardHeaderText}>APPOINTMENT DETAILS</Text>
                </LinearGradient>

                <View style={conf.cardBody}>
                  {/* Vehicle row */}
                  {selectedVehicle && (
                    <>
                      <View style={conf.row}>
                        <View style={conf.rowLeft}>
                          <Ionicons name="car-outline" size={15} color="#666" />
                          <Text style={conf.rowLabel}>Vehicle</Text>
                        </View>
                        <Text style={conf.rowVal}>
                          {selectedVehicle.year} {selectedVehicle.make} {selectedVehicle.model}
                        </Text>
                      </View>
                      <View style={conf.divider} />
                    </>
                  )}

                  {/* Service */}
                  <View style={conf.row}>
                    <View style={conf.rowLeft}>
                      <Ionicons name="sparkles-outline" size={15} color="#666" />
                      <Text style={conf.rowLabel}>Service</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', flex: 1 }}>
                      <Text style={conf.rowVal}>{selectedService?.name}</Text>
                      <Text style={conf.rowSub}>{selectedService?.duration}</Text>
                    </View>
                  </View>
                  <View style={conf.divider} />

                  {/* Date & Time */}
                  <View style={conf.row}>
                    <View style={conf.rowLeft}>
                      <Ionicons name="calendar-outline" size={15} color="#666" />
                      <Text style={conf.rowLabel}>Date & Time</Text>
                    </View>
                    <Text style={conf.rowVal}>
                      {selectedDate} at {selectedTime}
                    </Text>
                  </View>
                  <View style={conf.divider} />

                  {/* Phone */}
                  {phone.trim() !== '' && (
                    <>
                      <View style={conf.row}>
                        <View style={conf.rowLeft}>
                          <Ionicons name="call-outline" size={15} color="#666" />
                          <Text style={conf.rowLabel}>Contact</Text>
                        </View>
                        <Text style={conf.rowVal}>{phone}</Text>
                      </View>
                      <View style={conf.divider} />
                    </>
                  )}

                  {/* Notes */}
                  {notes.trim() !== '' && (
                    <>
                      <View style={[conf.row, { alignItems: 'flex-start' }]}>
                        <View style={[conf.rowLeft, { marginTop: 2 }]}>
                          <Ionicons name="document-text-outline" size={15} color="#666" />
                          <Text style={conf.rowLabel}>Notes</Text>
                        </View>
                        <Text style={[conf.rowVal, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>
                          {notes}
                        </Text>
                      </View>
                      <View style={conf.divider} />
                    </>
                  )}

                  {/* Total Amount */}
                  <View style={conf.totalRow}>
                    <Text style={conf.totalLabel}>TOTAL AMOUNT</Text>
                    <Text style={conf.totalVal}>
                      ₱{Number(selectedService?.price).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Important Notice */}
              <View style={conf.notice}>
                <Ionicons name="warning-outline" size={18} color={ACCENT} style={{ marginTop: 1 }} />
                <Text style={conf.noticeText}>
                  <Text style={{ fontWeight: '700', color: '#fff' }}>Note: </Text>
                  To avoid cancellation, please arrive{' '}
                  <Text style={{ color: ACCENT, fontWeight: '700' }}>15 minutes</Text>
                  {' '}before your scheduled time.{'\n'}
                  Payment will be collected strictly on-site via{' '}
                  <Text style={{ color: ACCENT, fontWeight: '700' }}>Cash or GCash</Text>.
                </Text>
              </View>

              {/* Actions */}
              <View style={ss.btnRow}>
                <PremiumButton
                  title="Back"
                  variant="outline"
                  onPress={goBack}
                  style={{ flex: 1 }}
                  fullWidth={false}
                  disabled={isSubmitting}
                />
                {/* Custom CTA — deep black text on orange */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={isSubmitting}
                  onPress={handleConfirm}
                  style={[conf.confirmBtn, isSubmitting && { opacity: 0.6 }, { flex: 2 }]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={BLACK} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={BLACK} />
                      <Text style={conf.confirmBtnText}>Confirm Payment</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

/** Screen-level */
const ss = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BLACK },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 18, paddingTop: 20 },
  stepWrap: { gap: 20 },

  stepHeader: { gap: 4, marginBottom: 4 },
  stepTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  stepSub: { fontSize: 13, color: '#777', lineHeight: 19 },

  // Premium Welcome Banner for Step 0
  compactGreeting: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  greetingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  greetingAvatarMini: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingAvatarTextMini: { color: ACCENT, fontSize: 16, fontWeight: '800' },
  greetingTextRow: { flex: 1 },
  greetingTextMini: { fontSize: 13, fontWeight: '600', color: '#A0A0AB', letterSpacing: 0.5 },
  greetingName: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 14,
    paddingLeft: 4,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#555',
    marginBottom: 10,
  },

  inputLabel: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textAreaWrap: {
    alignItems: 'flex-start',
    paddingVertical: 14,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },

  selectedDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
  },
  selectedDateText: { fontSize: 12, fontWeight: '700', color: ACCENT },

  btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },

  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { color: '#666', fontSize: 13 },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
    backgroundColor: SURFACE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderStyle: 'dashed',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#555' },
  emptySub: { fontSize: 12, color: '#444', textAlign: 'center', paddingHorizontal: 20 },

  addVehicleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,107,53,0.07)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.25)',
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  addVehicleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
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
});

/** Service card */
const sc = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 13,
  },
  cardSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255,107,53,0.07)',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A22',
  },
  iconBoxSelected: { backgroundColor: ACCENT },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: '#fff', flex: 1 },
  tag: {
    fontSize: 9,
    fontWeight: '700',
    color: ACCENT,
    backgroundColor: 'rgba(255,107,53,0.12)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    letterSpacing: 0.8,
    overflow: 'hidden',
  },
  desc: { fontSize: 11, color: '#666', marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  price: { fontSize: 16, fontWeight: '800', color: ACCENT },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dur: { fontSize: 11, color: '#666' },
});

/** Time grid */
const tg = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    width: '30.5%',
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 11,
    backgroundColor: SURFACE,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  pillSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  text: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  textSelected: { color: BLACK, fontWeight: '800' },
});

/** Warning / pre-confirm screen */
const warn = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,107,53,0.25)',
  },
  gradient: { padding: 20, gap: 14 },
  iconWrap: { alignItems: 'center' },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 19,
  },
  divider: { height: 1, backgroundColor: 'rgba(255,107,53,0.15)' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  rowIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: 'rgba(255,107,53,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowText: { flex: 1, fontSize: 13, color: '#ccc', lineHeight: 19 },
  summaryPreview: {
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  previewTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#555',
    marginBottom: 2,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { fontSize: 13, color: '#666' },
  previewVal: { fontSize: 13, fontWeight: '600', color: '#ccc', textAlign: 'right', flex: 1, marginLeft: 12 },
});

/** Confirmation step */
const conf = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: { elevation: 8 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  cardHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  cardBody: { padding: 18, gap: 0 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 13, color: '#777' },
  rowVal: { fontSize: 13, fontWeight: '700', color: '#fff', textAlign: 'right' },
  rowSub: { fontSize: 11, color: '#666', marginTop: 2, textAlign: 'right' },
  divider: { height: 1, backgroundColor: '#1E1E26' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#1E1E26',
  },
  totalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, color: '#666' },
  totalVal: { fontSize: 24, fontWeight: '900', color: ACCENT },

  notice: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,107,53,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.2)',
    padding: 14,
  },
  noticeText: { flex: 1, fontSize: 12.5, color: '#bbb', lineHeight: 20 },

  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
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
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: BLACK,
    letterSpacing: 0.3,
  },
});

/** Add Vehicle Form */
const avf = StyleSheet.create({
  container: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 18,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  row: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: '#1A1A22',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    fontSize: 10,
    color: '#555',
    marginTop: 5,
    letterSpacing: 0.3,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 2,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  submitText: {
    fontSize: 14,
    fontWeight: '800',
    color: BLACK,
    letterSpacing: 0.3,
  },
});
