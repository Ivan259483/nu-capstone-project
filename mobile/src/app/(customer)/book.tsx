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
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
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

const STEP_LABELS = ['Info', 'Schedule', 'Review', 'Confirm'];

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
          <React.Fragment key={i}>
            <View style={ind.item}>
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
            {i < STEP_LABELS.length - 1 && (
              <View style={[ind.line, (done || active) && i < current && ind.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const ind = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: BLACK,
  },
  item: { alignItems: 'center', width: 50 },
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
    marginTop: 13, // align visually with the center of the 26px dot
    marginHorizontal: 4,
  },
  lineDone: { backgroundColor: ACCENT_DARK },
  label: { fontSize: 9, fontWeight: '600', color: '#555', marginTop: 5, letterSpacing: 0.5, textAlign: 'center' },
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
            <Text style={vc.metaText}>
              {vehicle.color ? vehicle.color.charAt(0).toUpperCase() + vehicle.color.slice(1).toLowerCase() : 'Unknown color'}
            </Text>
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

  // Step 0 — Customer info
  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [customerNameError, setCustomerNameError] = useState('');
  const [contactNumberError, setContactNumberError] = useState('');
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

  // Step 2 — Payment proof
  const [downpaymentProof, setDownpaymentProof] = useState<string | null>(null);

  // General
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const dateScrollRef = useRef<ScrollView>(null);

  // Preview booking reference (generated client-side for display only)
  const previewBookingRef = React.useMemo(() => {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hex = Math.random().toString(16).substring(2, 6).toUpperCase();
    return `ASPF-${yy}${mm}${dd}-${hex}`;
  }, []);

  // ── Data Loading ──
  useFocusEffect(
    useCallback(() => {
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
    }, [])
  );

  // Sync customer info from profile instantly
  useEffect(() => {
    if (profile?.full_name) setCustomerName(profile.full_name);
    if (profile?.phone) {
      setContactNumber(profile.phone);
      setPhone(profile.phone);
    }
  }, [profile]);

  // ── Navigation ──
  const goNext = () => {
    if (step === 0) {
      let hasErr = false;
      setCustomerNameError('');
      setContactNumberError('');
      if (!customerName.trim() || customerName.trim().length < 2) {
        setCustomerNameError('Full name is required');
        hasErr = true;
      }
      if (!contactNumber.trim()) {
        setContactNumberError('Contact number is required');
        hasErr = true;
      } else if (!Validation.isValidPhone(contactNumber)) {
        setContactNumberError('Enter a valid PH mobile number');
        hasErr = true;
      }
      if (hasErr) return;
    }
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
    setCustomerName('');
    setContactNumber('');
    setCustomerNameError('');
    setContactNumberError('');
    setNotes('');
    setDownpaymentProof(null);
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
    if (!/^[A-Z0-9]{4,8}$/.test(normalizedPlate)) {
      setVPlateError('Must be 4-8 letters/numbers');
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
      // 🔍 DEBUG: Verify outbound booking payload (remove after verification)
      console.log('🔍 [BOOKING_PAYLOAD] Outbound:', {
        customerName: profile?.full_name,
        customerPhone: phone.trim() || undefined,
        vehiclePlate: selectedVehicle?.plateNumber,
        vehicleYear: selectedVehicle?.year?.toString(),
        vehicleMake: selectedVehicle?.make,
        vehicleModel: selectedVehicle?.model,
        vehicleColor: selectedVehicle?.color,
        serviceType: selectedService?.name,
        date: selectedDate,
        time: selectedTime,
      });
      await bookingService.createBooking({
        service: selectedService,
        date: selectedDate,
        time: selectedTime,
        customerName: customerName.trim(),
        customerPhone: contactNumber.trim(),
        notes: notes.trim() || undefined,
        vehiclePlate: selectedVehicle?.plateNumber,
        vehicleYear: selectedVehicle?.year?.toString(),
        vehicleMake: selectedVehicle?.make,
        vehicleModel: selectedVehicle?.model,
        vehicleColor: selectedVehicle?.color,
        downpaymentProof: downpaymentProof || undefined,
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
  const canProceedStep0 = !!selectedVehicle && customerName.trim().length >= 2 && contactNumber.trim().length > 0;
  const canProceedStep1 = !!selectedService && !!selectedDate && !!selectedTime;

  // ─────────────────────────────────────────────────────────────────────────
  // Success screen
  // ─────────────────────────────────────────────────────────────────────────
  if (isSuccess) {
    const WORKFLOW_STEPS = [
      { key: 'booking', label: 'Booking Submitted', icon: 'document-text', active: true, ts: 'Just now' },
      { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle', active: false, ts: '—' },
      { key: 'ingress', label: 'Ingress Checklist', icon: 'clipboard', active: false, ts: '—' },
      { key: 'job', label: 'Job Order Created', icon: 'construct', active: false, ts: '—' },
      { key: 'service', label: 'Service In Progress', icon: 'build', active: false, ts: '—' },
      { key: 'qc', label: 'QC Checklist', icon: 'shield-checkmark', active: false, ts: '—' },
      { key: 'egress', label: 'Egress Release', icon: 'log-out', active: false, ts: '—' },
      { key: 'completed', label: 'Completed', icon: 'trophy', active: false, ts: '—' },
    ];

    return (
      <View style={[ss.screen, { backgroundColor: BLACK }]}>
        <AnimatedHeader />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: TabBarHeight + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Success Hero ── */}
          <Animated.View entering={FadeInDown.springify().damping(16)} style={s4.heroWrap}>
            <LinearGradient
              colors={['rgba(255,107,53,0.15)', 'rgba(255,107,53,0.02)', 'transparent']}
              style={s4.heroBg}
            />
            <View style={s4.heroIconWrap}>
              <LinearGradient colors={[ACCENT, ACCENT_DARK]} style={s4.heroIcon}>
                <Ionicons name="checkmark" size={44} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={s4.heroTitle}>Booking Confirmed!</Text>
            <Text style={s4.heroSub}>
              Your appointment has been submitted.{'\n'}We'll confirm it shortly.
            </Text>

            {/* Booking reference badge */}
            <View style={s4.heroRefBadge}>
              <Ionicons name="bookmark" size={14} color={ACCENT} />
              <Text style={s4.heroRefText}>{previewBookingRef}</Text>
            </View>
          </Animated.View>

          {/* ── Quick Summary Card ── */}
          <Animated.View entering={FadeInDown.delay(150).springify().damping(16)} style={s4.sectionPad}>
            <View style={s4.quickCard}>
              <View style={s4.quickRow}>
                <Ionicons name="car-outline" size={16} color="#666" />
                <Text style={s4.quickLabel}>Vehicle</Text>
                <Text style={s4.quickVal} numberOfLines={1}>
                  {selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : '—'}
                </Text>
              </View>
              <View style={s4.quickDivider} />
              <View style={s4.quickRow}>
                <Ionicons name="sparkles-outline" size={16} color="#666" />
                <Text style={s4.quickLabel}>Service</Text>
                <Text style={s4.quickVal} numberOfLines={1}>{selectedService?.name || '—'}</Text>
              </View>
              <View style={s4.quickDivider} />
              <View style={s4.quickRow}>
                <Ionicons name="calendar-outline" size={16} color="#666" />
                <Text style={s4.quickLabel}>Schedule</Text>
                <Text style={s4.quickVal}>{selectedDate} • {selectedTime}</Text>
              </View>
            </View>
          </Animated.View>

          {/* ── Workflow Tracker ── */}
          <Animated.View entering={FadeInDown.delay(300).springify().damping(16)} style={s4.sectionPad}>
            <View style={s4.trackerHeader}>
              <View style={s4.trackerIconWrap}>
                <Ionicons name="git-branch" size={14} color={ACCENT} />
              </View>
              <Text style={s4.trackerTitle}>SERVICE WORKFLOW</Text>
            </View>

            <View style={s4.trackerCard}>
              {WORKFLOW_STEPS.map((ws, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === WORKFLOW_STEPS.length - 1;
                return (
                  <Animated.View
                    key={ws.key}
                    entering={FadeInDown.delay(350 + idx * 60).springify().damping(18)}
                    style={s4.timelineRow}
                  >
                    {/* Connector line */}
                    <View style={s4.timelineLeft}>
                      {!isFirst && (
                        <View style={[s4.timelineLine, ws.active && s4.timelineLineActive]} />
                      )}
                      <View style={[
                        s4.timelineDot,
                        ws.active ? s4.timelineDotActive : s4.timelineDotInactive,
                      ]}>
                        <Ionicons
                          name={ws.icon as any}
                          size={14}
                          color={ws.active ? '#fff' : '#555'}
                        />
                      </View>
                      {!isLast && (
                        <View style={[s4.timelineLine, WORKFLOW_STEPS[idx + 1]?.active && s4.timelineLineActive]} />
                      )}
                    </View>

                    {/* Content */}
                    <View style={s4.timelineContent}>
                      <Text style={[s4.timelineLabel, ws.active && s4.timelineLabelActive]}>
                        {ws.label}
                      </Text>
                      <Text style={s4.timelineTs}>{ws.ts}</Text>
                    </View>

                    {/* Status badge */}
                    {ws.active && (
                      <View style={s4.timelineBadge}>
                        <Text style={s4.timelineBadgeText}>CURRENT</Text>
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>

          {/* ── Action Buttons ── */}
          <Animated.View entering={FadeInDown.delay(700).springify().damping(16)} style={s4.sectionPad}>
            <View style={{ gap: 10 }}>
              <PremiumButton
                title="Track My Booking"
                icon="navigate-outline"
                onPress={() => {
                  reset();
                  router.push('/(customer)/track');
                }}
              />
              <PremiumButton
                title="Book Another Service"
                variant="outline"
                icon="add-circle-outline"
                onPress={reset}
              />
              <TouchableOpacity
                style={s4.dashboardBtn}
                activeOpacity={0.85}
                onPress={() => {
                  reset();
                  router.push('/(customer)');
                }}
              >
                <Ionicons name="grid-outline" size={16} color="#888" />
                <Text style={s4.dashboardBtnText}>Go to Dashboard</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
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
              STEP 0 — CUSTOMER & VEHICLE INFO
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

              {/* ── Section 1: Customer Information ── */}
              <Animated.View entering={FadeInDown.delay(150).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="person" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>CUSTOMER INFORMATION</Text>
                </View>
                <View style={s1.glassCard}>
                  <PremiumInput
                    label="FULL NAME"
                    iconName="person-outline"
                    placeholder="Juan Dela Cruz"
                    value={customerName}
                    editable={false}
                  />
                  <PremiumInput
                    label="CONTACT NUMBER"
                    iconName="call-outline"
                    placeholder="+63 9xx xxx xxxx"
                    value={contactNumber}
                    editable={false}
                  />
                  <Text style={{ fontSize: 11, color: '#666', marginTop: 4, textAlign: 'center' }}>
                    Information is pulled from your profile. You can update this in the Settings tab.
                  </Text>
                </View>
              </Animated.View>

              {/* ── Section 2: Vehicle Selection ── */}
              <Animated.View entering={FadeInDown.delay(250).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="car-sport" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>SELECT VEHICLE</Text>
                </View>

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
                      No vehicles found. Go to Settings and add yours.
                    </Text>
                    <PremiumButton 
                      title="Go to Settings" 
                      variant="outline" 
                      style={{ marginTop: 20 }}
                      onPress={() => router.push('/(screens)/vehicles')} 
                    />
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {vehicles.map((v, i) => (
                      <Animated.View
                        key={v.id}
                        entering={FadeInDown.delay(300 + i * 60).springify()}
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


              </Animated.View>

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
              STEP 1 — SERVICE & SCHEDULE
          ═══════════════════════════════════════════════════ */}
          {step === 1 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              {/* Header */}
              <View style={ss.stepHeader}>
                <Text style={ss.stepTitle}>Service & Schedule</Text>
                <Text style={ss.stepSub}>
                  Choose your service, preferred date, and time slot.
                </Text>
              </View>

              {/* ── Section 1: Service Selection — 2-col grid ── */}
              <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="sparkles" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>SELECT SERVICE</Text>
                </View>

                <View style={s2.serviceGrid}>
                  {services.map((s, idx) => {
                    const isSelected = selectedService?.id === s.id;
                    return (
                      <Animated.View
                        key={s.id}
                        entering={FadeInDown.delay(120 + idx * 50).springify().damping(16)}
                        style={s2.serviceGridItem}
                      >
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => {
                            setSelectedService(s);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          }}
                          style={[
                            s2.serviceCard,
                            isSelected && s2.serviceCardSelected,
                          ]}
                        >
                          {/* Icon */}
                          <View style={[s2.serviceIconBox, isSelected && s2.serviceIconBoxSelected]}>
                            <Ionicons
                              name={(s.icon as any) || 'pricetag-outline'}
                              size={24}
                              color={isSelected ? '#fff' : '#8E8E93'}
                            />
                          </View>

                          {/* Title + Subtitle */}
                          <Text style={[s2.serviceName, isSelected && s2.serviceNameSelected]} numberOfLines={1}>
                            {s.name}
                          </Text>
                          <Text style={s2.serviceDesc} numberOfLines={1}>
                            {s.description || s.duration}
                          </Text>

                          {/* Price tag */}
                          <View style={s2.servicePriceRow}>
                            <Text style={[s2.servicePrice, isSelected && s2.servicePriceSelected]}>
                              ₱{Number(s.price).toLocaleString()}
                            </Text>
                          </View>

                          {/* Selected checkmark */}
                          {isSelected && (
                            <View style={s2.serviceCheck}>
                              <Ionicons name="checkmark-circle" size={20} color={ACCENT} />
                            </View>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </View>
              </Animated.View>

              {/* ── Section 2: Smart Calendar ── */}
              <Animated.View entering={FadeInDown.delay(300).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="calendar" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>PREFERRED DATE</Text>
                </View>

                {/* Horizontal date strip */}
                <View style={s2.calendarCard}>
                  <ScrollView
                    ref={dateScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 8, paddingVertical: 4, paddingHorizontal: 4 }}
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

                  {/* Selected date badge */}
                  {selectedDate && (
                    <View style={s2.dateBadge}>
                      <Ionicons name="calendar-outline" size={13} color={ACCENT} />
                      <Text style={s2.dateBadgeText}>{selectedDate}</Text>
                    </View>
                  )}
                </View>

                {/* Time slots */}
                {selectedDate && (
                  <Animated.View entering={FadeInDown.delay(80).springify().damping(18)}>
                    <View style={[s1.sectionHeader, { marginTop: 18 }]}>
                      <View style={s1.sectionIconWrap}>
                        <Ionicons name="time" size={14} color={ACCENT} />
                      </View>
                      <Text style={ss.sectionLabel}>PREFERRED TIME</Text>
                    </View>

                    <View style={s2.timeGrid}>
                      {TIME_SLOTS.map((t) => {
                        const isActive = selectedTime === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => {
                              setSelectedTime(t);
                              Haptics.selectionAsync();
                            }}
                            activeOpacity={0.85}
                            style={[
                              s2.timePill,
                              isActive && s2.timePillSelected,
                            ]}
                          >
                            <Text style={[s2.timeText, isActive && s2.timeTextSelected]}>
                              {t}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}
              </Animated.View>

              {/* ── Section 3: Notes ── */}
              <Animated.View entering={FadeInDown.delay(400).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="document-text" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>NOTES & REQUESTS</Text>
                </View>

                <View style={s2.notesCard}>
                  <PremiumInput
                    label="SPECIAL INSTRUCTIONS (OPTIONAL)"
                    iconName="document-text-outline"
                    placeholder="e.g. Focus on the custom rims, tint darkness preference…"
                    value={notes}
                    onChangeText={setNotes}
                    multiline
                    numberOfLines={3}
                  />
                </View>
              </Animated.View>

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
              STEP 2 — REVIEW & PAYMENT PROOF
          ═══════════════════════════════════════════════════ */}
          {step === 2 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              <View style={ss.stepHeader}>
                <Text style={ss.stepTitle}>Review & Payment</Text>
                <Text style={ss.stepSub}>Review your booking details and upload payment proof.</Text>
              </View>

              {/* ── Section 1: Booking Summary ── */}
              <Animated.View entering={FadeInDown.delay(100).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="receipt" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>BOOKING SUMMARY</Text>
                </View>

                <View style={s3.summaryCard}>
                  {/* Card header band */}
                  <LinearGradient
                    colors={[ACCENT, ACCENT_DARK]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s3.summaryHeader}
                  >
                    <Ionicons name="car-sport" size={16} color="#fff" />
                    <Text style={s3.summaryHeaderText}>APPOINTMENT DETAILS</Text>
                  </LinearGradient>

                  <View style={s3.summaryBody}>
                    {[
                      { icon: 'person-outline', label: 'Customer', value: customerName.trim() || '—' },
                      { icon: 'call-outline', label: 'Contact', value: contactNumber.trim() || '—' },
                      { icon: 'car-outline', label: 'Vehicle', value: selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : '—' },
                      { icon: 'barcode-outline', label: 'Plate No.', value: selectedVehicle?.plateNumber?.toUpperCase() || '—' },
                      { icon: 'sparkles-outline', label: 'Service', value: selectedService?.name || '—' },
                      { icon: 'calendar-outline', label: 'Date', value: selectedDate || '—' },
                      { icon: 'time-outline', label: 'Time', value: selectedTime || '—' },
                    ].map((item, i) => (
                      <React.Fragment key={i}>
                        <View style={s3.summaryRow}>
                          <View style={s3.summaryRowLeft}>
                            <Ionicons name={item.icon as any} size={15} color="#666" />
                            <Text style={s3.summaryLabel}>{item.label}</Text>
                          </View>
                          <Text style={s3.summaryValue} numberOfLines={1}>{item.value}</Text>
                        </View>
                        {i < 6 && <View style={s3.summaryDivider} />}
                      </React.Fragment>
                    ))}

                    {/* Notes if present */}
                    {notes.trim() !== '' && (
                      <>
                        <View style={s3.summaryDivider} />
                        <View style={[s3.summaryRow, { alignItems: 'flex-start' }]}>
                          <View style={[s3.summaryRowLeft, { marginTop: 2 }]}>
                            <Ionicons name="document-text-outline" size={15} color="#666" />
                            <Text style={s3.summaryLabel}>Notes</Text>
                          </View>
                          <Text style={[s3.summaryValue, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>
                            {notes}
                          </Text>
                        </View>
                      </>
                    )}

                    {/* Total */}
                    <View style={s3.totalRow}>
                      <Text style={s3.totalLabel}>TOTAL AMOUNT</Text>
                      <Text style={s3.totalValue}>
                        ₱{Number(selectedService?.price || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* ── Section 2: Booking Reference ── */}
              <Animated.View entering={FadeInDown.delay(200).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="bookmark" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>BOOKING REFERENCE</Text>
                </View>

                <View style={s3.refCard}>
                  <View style={s3.refIconWrap}>
                    <Ionicons name="qr-code-outline" size={28} color={ACCENT} />
                  </View>
                  <Text style={s3.refCode}>{previewBookingRef}</Text>
                  <Text style={s3.refHint}>
                    Your official reference will be generated upon confirmation
                  </Text>
                </View>
              </Animated.View>

              {/* ── Section 3: GCash Downpayment Upload ── */}
              <Animated.View entering={FadeInDown.delay(300).springify().damping(16).stiffness(120)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="card" size={14} color={ACCENT} />
                  </View>
                  <Text style={ss.sectionLabel}>GCASH DOWNPAYMENT (OPTIONAL)</Text>
                </View>

                <View style={s3.uploadCard}>
                  {downpaymentProof ? (
                    /* Preview uploaded image */
                    <Animated.View entering={FadeInDown.springify().damping(18)} style={s3.previewWrap}>
                      <Image
                        source={{ uri: downpaymentProof }}
                        style={s3.previewImage}
                        resizeMode="contain"
                      />
                      <View style={s3.previewActions}>
                        <TouchableOpacity
                          style={s3.previewActionBtn}
                          activeOpacity={0.8}
                          onPress={async () => {
                            const result = await ImagePicker.launchImageLibraryAsync({
                              mediaTypes: ['images'],
                              allowsEditing: true,
                              quality: 0.7,
                              base64: true,
                            });
                            if (!result.canceled && result.assets[0]?.base64) {
                              const mime = result.assets[0].mimeType || 'image/jpeg';
                              setDownpaymentProof(`data:${mime};base64,${result.assets[0].base64}`);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }
                          }}
                        >
                          <Ionicons name="swap-horizontal" size={16} color={ACCENT} />
                          <Text style={s3.previewActionText}>Replace</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s3.previewActionBtn, { borderColor: '#FF4444' }]}
                          activeOpacity={0.8}
                          onPress={() => {
                            setDownpaymentProof(null);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Ionicons name="trash-outline" size={16} color="#FF4444" />
                          <Text style={[s3.previewActionText, { color: '#FF4444' }]}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    </Animated.View>
                  ) : (
                    /* Upload buttons */
                    <View style={s3.uploadContent}>
                      <View style={s3.uploadIconWrap}>
                        <Ionicons name="cloud-upload-outline" size={36} color="#555" />
                      </View>
                      <Text style={s3.uploadTitle}>Upload Payment Screenshot</Text>
                      <Text style={s3.uploadSubtitle}>GCash receipt or payment confirmation</Text>
                      <View style={s3.uploadBtnRow}>
                        <TouchableOpacity
                          style={s3.uploadBtn}
                          activeOpacity={0.85}
                          onPress={async () => {
                            const result = await ImagePicker.launchImageLibraryAsync({
                              mediaTypes: ['images'],
                              allowsEditing: true,
                              quality: 0.7,
                              base64: true,
                            });
                            if (!result.canceled && result.assets[0]?.base64) {
                              const mime = result.assets[0].mimeType || 'image/jpeg';
                              setDownpaymentProof(`data:${mime};base64,${result.assets[0].base64}`);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }
                          }}
                        >
                          <Ionicons name="images-outline" size={18} color={BLACK} />
                          <Text style={s3.uploadBtnText}>Gallery</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s3.uploadBtn, s3.uploadBtnOutline]}
                          activeOpacity={0.85}
                          onPress={async () => {
                            const perms = await ImagePicker.requestCameraPermissionsAsync();
                            if (!perms.granted) {
                              Alert.alert('Permission Required', 'Camera access is needed to take a photo.');
                              return;
                            }
                            const result = await ImagePicker.launchCameraAsync({
                              allowsEditing: true,
                              quality: 0.7,
                              base64: true,
                            });
                            if (!result.canceled && result.assets[0]?.base64) {
                              const mime = result.assets[0].mimeType || 'image/jpeg';
                              setDownpaymentProof(`data:${mime};base64,${result.assets[0].base64}`);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }
                          }}
                        >
                          <Ionicons name="camera-outline" size={18} color={ACCENT} />
                          <Text style={[s3.uploadBtnText, { color: ACCENT }]}>Camera</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </Animated.View>

              {/* ── Section 4: Disclaimer ── */}
              <Animated.View entering={FadeInDown.delay(400).springify().damping(16).stiffness(120)}>
                <View style={s3.disclaimerCard}>
                  <LinearGradient
                    colors={['rgba(255,107,53,0.10)', 'rgba(255,107,53,0.03)']}
                    style={s3.disclaimerGradient}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Ionicons name="shield-checkmark" size={28} color={ACCENT} />
                    </View>
                    <View style={s3.disclaimerDivider} />
                    {[
                      { icon: 'calendar-outline', text: 'Your booking schedule may be adjusted based on shop availability.' },
                      { icon: 'card-outline', text: 'GCash downpayment is recommended to secure your slot.' },
                      { icon: 'ban-outline', text: 'Double bookings are not allowed. One slot per customer.' },
                      { icon: 'checkmark-done-outline', text: 'Confirmation is subject to admin review and approval.' },
                    ].map((item, i) => (
                      <View key={i} style={s3.disclaimerRow}>
                        <View style={s3.disclaimerRowIcon}>
                          <Ionicons name={item.icon as any} size={15} color={ACCENT} />
                        </View>
                        <Text style={s3.disclaimerRowText}>{item.text}</Text>
                      </View>
                    ))}
                  </LinearGradient>
                </View>
              </Animated.View>

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
              STEP 3 — FINAL CONFIRMATION
          ═══════════════════════════════════════════════════ */}
          {step === 3 && (
            <Animated.View
              entering={FadeInDown.springify().damping(18).stiffness(140)}
              style={ss.stepWrap}
            >
              {/* Header */}
              <View style={ss.stepHeader}>
                <Text style={[ss.stepTitle, { fontSize: 24 }]}>Confirm Booking</Text>
                <Text style={ss.stepSub}>
                  Your appointment is almost set. Tap confirm to submit.
                </Text>
              </View>

              {/* Booking Reference */}
              <Animated.View entering={FadeInDown.delay(100).springify().damping(16)}>
                <View style={s4.confirmRefCard}>
                  <Ionicons name="bookmark" size={18} color={ACCENT} />
                  <View>
                    <Text style={s4.confirmRefLabel}>BOOKING REFERENCE</Text>
                    <Text style={s4.confirmRefCode}>{previewBookingRef}</Text>
                  </View>
                </View>
              </Animated.View>

              {/* Compact Summary */}
              <Animated.View entering={FadeInDown.delay(200).springify().damping(16)}>
                <View style={s4.confirmCard}>
                  <LinearGradient
                    colors={[ACCENT, ACCENT_DARK]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s4.confirmCardHeader}
                  >
                    <Ionicons name="car-sport" size={16} color="#fff" />
                    <Text style={s4.confirmCardHeaderText}>APPOINTMENT DETAILS</Text>
                  </LinearGradient>

                  <View style={s4.confirmCardBody}>
                    {[
                      { icon: 'person-outline', label: 'Customer', value: customerName || '—' },
                      { icon: 'car-outline', label: 'Vehicle', value: selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : '—' },
                      { icon: 'sparkles-outline', label: 'Service', value: selectedService?.name || '—' },
                      { icon: 'calendar-outline', label: 'Schedule', value: `${selectedDate} • ${selectedTime}` },
                    ].map((item, i, arr) => (
                      <React.Fragment key={i}>
                        <View style={s4.confirmRow}>
                          <Ionicons name={item.icon as any} size={14} color="#555" />
                          <Text style={s4.confirmLabel}>{item.label}</Text>
                          <Text style={s4.confirmVal} numberOfLines={1}>{item.value}</Text>
                        </View>
                        {i < arr.length - 1 && <View style={s4.confirmDivider} />}
                      </React.Fragment>
                    ))}

                    {/* Total */}
                    <View style={s4.confirmTotalRow}>
                      <Text style={s4.confirmTotalLabel}>TOTAL</Text>
                      <Text style={s4.confirmTotalVal}>
                        ₱{Number(selectedService?.price || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                </View>
              </Animated.View>

              {/* Downpayment badge */}
              {downpaymentProof && (
                <Animated.View entering={FadeInDown.delay(250).springify().damping(16)}>
                  <View style={s4.paymentBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={s4.paymentBadgeText}>GCash proof attached</Text>
                  </View>
                </Animated.View>
              )}

              {/* Notice */}
              <Animated.View entering={FadeInDown.delay(300).springify().damping(16)}>
                <View style={s4.noticeBar}>
                  <Ionicons name="information-circle" size={18} color={ACCENT} />
                  <Text style={s4.noticeBarText}>
                    By confirming, you agree to the booking terms. Arrive{' '}
                    <Text style={{ color: ACCENT, fontWeight: '700' }}>15 min early</Text>.
                  </Text>
                </View>
              </Animated.View>

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
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={isSubmitting}
                  onPress={handleConfirm}
                  style={[s4.confirmBtn, isSubmitting && { opacity: 0.6 }, { flex: 2 }]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color={BLACK} />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color={BLACK} />
                      <Text style={s4.confirmBtnText}>Confirm Booking</Text>
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
    fontSize: 11,
    fontWeight: '800',
    color: '#8A8A9A',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
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
    backgroundColor: 'rgba(255,107,53,0.1)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.3)',
    borderStyle: 'solid',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  addVehicleText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT,
  },
});

/** Step 1 — Service & Schedule premium styles */
const s2 = StyleSheet.create({
  /* ── 2-Column Service Grid ── */
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceGridItem: {
    width: '48%',
  },
  serviceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    minHeight: 150,
    justifyContent: 'center',
  },
  serviceCardSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
    }),
  },
  serviceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A22',
    borderWidth: 1,
    borderColor: '#2A2A32',
    marginBottom: 4,
  },
  serviceIconBoxSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  serviceName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  serviceNameSelected: {
    color: '#FFFFFF',
  },
  serviceDesc: {
    fontSize: 10,
    color: '#666',
    textAlign: 'center',
    lineHeight: 14,
  },
  servicePriceRow: {
    marginTop: 2,
  },
  servicePrice: {
    fontSize: 15,
    fontWeight: '900',
    color: '#8E8E93',
    textAlign: 'center',
  },
  servicePriceSelected: {
    color: ACCENT,
  },
  serviceCheck: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: BLACK,
    borderRadius: 10,
    padding: 1,
  },

  /* ── Calendar Card ── */
  calendarCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  dateBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  },

  /* ── Time Grid ── */
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timePill: {
    width: '30.5%',
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  timePillSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
  },
  timeTextSelected: {
    color: BLACK,
    fontWeight: '800',
  },

  /* ── Notes Card ── */
  notesCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
});

/** Step 2 — Review & Payment premium styles */
const s3 = StyleSheet.create({
  /* ── Summary Card ── */
  summaryCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  summaryHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  summaryBody: {
    padding: 16,
    gap: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ddd',
    maxWidth: '55%',
    textAlign: 'right',
  },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 107, 53, 0.2)',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#888',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: ACCENT,
  },

  /* ── Booking Reference Card ── */
  refCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  refIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  refCode: {
    fontSize: 22,
    fontWeight: '900',
    color: ACCENT,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  refHint: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 220,
  },

  /* ── Upload Card ── */
  uploadCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  uploadContent: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  uploadIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: '#2A2A32',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  uploadSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  uploadBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  uploadBtnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: ACCENT,
  },
  uploadBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: BLACK,
  },

  /* ── Image Preview ── */
  previewWrap: {
    padding: 12,
    gap: 10,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: '#111',
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  previewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: ACCENT,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  previewActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  },

  /* ── Disclaimer Card ── */
  disclaimerCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
  },
  disclaimerGradient: {
    padding: 20,
    gap: 12,
  },
  disclaimerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  disclaimerRowIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  disclaimerRowText: {
    flex: 1,
    fontSize: 12,
    color: '#aaa',
    lineHeight: 18,
  },
});

/** Step 3 / Success — Confirmation & Workflow Tracker styles */
const s4 = StyleSheet.create({
  /* ══════════════════════════════════════
     SUCCESS HERO
  ══════════════════════════════════════ */
  heroWrap: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 20,
    paddingHorizontal: 24,
    position: 'relative',
  },
  heroBg: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroIconWrap: {
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 12,
  },
  heroRefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.35)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  heroRefText: {
    fontSize: 15,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  /* ══════════════════════════════════════
     QUICK SUMMARY
  ══════════════════════════════════════ */
  sectionPad: { paddingHorizontal: 18, marginTop: 16 },
  quickCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  quickLabel: { fontSize: 13, color: '#666' },
  quickVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#ddd',
    textAlign: 'right',
  },
  quickDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
  },

  /* ══════════════════════════════════════
     WORKFLOW TIMELINE TRACKER
  ══════════════════════════════════════ */
  trackerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  trackerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackerTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#666',
  },
  trackerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    paddingLeft: 8,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  timelineLeft: {
    width: 40,
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#222',
    minHeight: 10,
  },
  timelineLineActive: {
    backgroundColor: ACCENT,
  },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  timelineDotActive: {
    backgroundColor: ACCENT,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  timelineDotInactive: {
    backgroundColor: '#1A1A22',
    borderWidth: 1.5,
    borderColor: '#2A2A32',
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 10,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  timelineLabelActive: {
    color: '#fff',
    fontWeight: '800',
  },
  timelineTs: {
    fontSize: 11,
    color: '#444',
    marginTop: 1,
  },
  timelineBadge: {
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.3)',
  },
  timelineBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: ACCENT,
    letterSpacing: 1,
  },

  /* ══════════════════════════════════════
     DASHBOARD BUTTON
  ══════════════════════════════════════ */
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A32',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  dashboardBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },

  /* ══════════════════════════════════════
     CONFIRM STEP (Step 3 wizard)
  ══════════════════════════════════════ */
  confirmRefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 107, 53, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.25)',
    padding: 14,
  },
  confirmRefLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#666',
  },
  confirmRefCode: {
    fontSize: 18,
    fontWeight: '900',
    color: ACCENT,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 1,
  },
  confirmCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  confirmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  confirmCardHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1.5,
  },
  confirmCardBody: {
    padding: 16,
    gap: 0,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  confirmLabel: {
    fontSize: 13,
    color: '#666',
  },
  confirmVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#ddd',
    textAlign: 'right',
  },
  confirmDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#222',
  },
  confirmTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 107, 53, 0.2)',
  },
  confirmTotalLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#888',
  },
  confirmTotalVal: {
    fontSize: 22,
    fontWeight: '900',
    color: ACCENT,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.25)',
    padding: 12,
  },
  paymentBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },
  noticeBar: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 107, 53, 0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.18)',
    padding: 14,
  },
  noticeBarText: {
    flex: 1,
    fontSize: 12.5,
    color: '#aaa',
    lineHeight: 19,
  },
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

/** Step 0 — Customer & Vehicle Info glassmorphism styles */
const s1 = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
    padding: 18,
    gap: 14,
    ...Platform.select({
      ios: {
        shadowColor: ACCENT,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 2 },
    }),
  },
});
