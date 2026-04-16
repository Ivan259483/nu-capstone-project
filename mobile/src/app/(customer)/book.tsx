/**
 * Book Screen — Premium 4-Step Service Booking Wizard
 * ═══════════════════════════════════════════════════════
 * "The Kinetic Gallery" Design System
 * 
 * Obsidian surfaces · Warm amber accents · Editorial typography
 * Glassmorphism · Tonal depth · No hard borders
 * 
 * Step 0: Vehicle & Customer Info
 * Step 1: Service & Schedule
 * Step 2: Review & Payment
 * Step 3: Final Confirmation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInRight,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
// expo-blur available if needed for future glassmorphism enhancements
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

// ─── Kinetic Gallery Design Tokens ───────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');

// Surface tiers aligned exactly with global theme.ts colors for UI consistency
const VOID           = '#040405';   // deepest layer (theme.dark.background)
const SURFACE_LOW    = '#040405';   // surface_container_lowest
const SURFACE        = '#0D0D12';   // base surface (theme.dark.card)
const SURFACE_MID    = '#0D0D12';   // surface_container
const SURFACE_HIGH   = '#16161D';   // surface_container_high (theme.dark.cardAlt)
const SURFACE_TOP    = '#27272A';   // surface_container_highest (theme.dark.border)
const SURFACE_BRIGHT = '#353534';   // hover / subtle interaction

// Brand accents (warm amber — used sparingly)
const PRIMARY        = '#FFB77D';   // primary
const PRIMARY_CTR    = '#FF8C00';   // primary_container
const ON_PRIMARY     = '#4D2600';   // on_primary (dark text on accent)

// Functional tones
const SECONDARY      = '#C6C6C7';   // secondary text
const TERTIARY       = '#85CFFF';   // tech/sensor blue
const MUTED          = '#555555';   // muted elements
const DIM_TEXT       = '#777777';   // dim body text
const GHOST          = 'rgba(255,255,255,0.08)'; // ghost border

const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
  '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM',
  '4:00 PM', '5:00 PM',
];

const STEP_LABELS = ['Info', 'Schedule', 'Review', 'Confirm'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Month Calendar logic is encapsulated below

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** Kinetic Gallery step indicator — floating capsule, tonal dots */
function StepIndicator({ current }: { current: number }) {
  return (
    <View style={ind.container}>
      <View style={ind.track}>
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
                    <Ionicons name="checkmark" size={11} color={ON_PRIMARY} />
                  ) : (
                    <Text style={[ind.dotNum, active && { color: ON_PRIMARY }]}>
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
                <View style={[ind.line, i < current && ind.lineDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

const ind = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    backgroundColor: SURFACE_LOW,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: SURFACE_MID,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  item: { alignItems: 'center', width: 50 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SURFACE_HIGH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    backgroundColor: PRIMARY,
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  dotDone: { backgroundColor: PRIMARY_CTR },
  dotNum: { fontSize: 11, fontWeight: '700', color: MUTED },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: SURFACE_HIGH,
    marginTop: 13,
    marginHorizontal: 4,
    borderRadius: 1,
  },
  lineDone: { backgroundColor: PRIMARY_CTR },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: MUTED,
    marginTop: 6,
    letterSpacing: 0.8,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  labelActive: { color: PRIMARY },
  labelDone: { color: PRIMARY_CTR },
});

/** Vehicle card — tonal depth, no borders, ambient glow on select */
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
        onPressIn={() => { scale.value = withTiming(0.97, { duration: 100 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
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
          colors={selected ? [PRIMARY_CTR, PRIMARY] : [SURFACE_HIGH, SURFACE_MID]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={vc.iconBox}
        >
          <Ionicons
            name="car-sport"
            size={24}
            color={selected ? ON_PRIMARY : MUTED}
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
            <LinearGradient
              colors={[PRIMARY_CTR, PRIMARY]}
              style={vc.checkGradient}
            >
              <Ionicons name="checkmark" size={14} color={ON_PRIMARY} />
            </LinearGradient>
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
    backgroundColor: SURFACE_MID,
    borderRadius: 20,
    padding: 16,
    position: 'relative',
  },
  cardSelected: {
    backgroundColor: 'rgba(255,183,125,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: { elevation: 6 },
    }),
  },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 6, justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', letterSpacing: -0.01 * 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  metaText: { fontSize: 13, color: SECONDARY, fontWeight: '400' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: MUTED },
  plate: { fontSize: 13, fontWeight: '500', color: SECONDARY, textTransform: 'uppercase', letterSpacing: 0.05 * 13 },
  checkContainer: {
    position: 'absolute',
    top: -6,
    right: -6,
  },
  checkGradient: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const MONTH_NAMES_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Month Calendar Grid Component */
function MonthCalendar({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
}) {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth(); // 0-11
  const today = new Date();

  const prevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // Sunday is 0
  const blanks = firstDay === 0 ? 6 : firstDay - 1; // Start on Monday
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const grid = [];

  // Trailing previous month days
  for (let i = 0; i < blanks; i++) {
    grid.push({
      day: daysInPrevMonth - blanks + i + 1,
      isCurrentMonth: false,
      dateKey: '',
      isPast: true,
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const isPast = (year < today.getFullYear()) ||
                   (year === today.getFullYear() && month < today.getMonth()) ||
                   (year === today.getFullYear() && month === today.getMonth() && i < today.getDate());
    grid.push({
      day: i,
      isCurrentMonth: true,
      dateKey: `${MONTH_NAMES_SHORT[month]} ${i}, ${year}`,
      isPast,
    });
  }

  // Leading next month days
  const remaining = 7 - (grid.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      grid.push({
        day: i,
        isCurrentMonth: false,
        dateKey: '',
        isPast: false,
      });
    }
  }

  return (
    <View style={[cal.container, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, ...Shadows.sm }]}>
      {/* Header */}
      <View style={cal.header}>
        <Text style={cal.monthTitle}>{MONTH_NAMES_FULL[month]} {year}</Text>
        <View style={cal.arrows}>
          <TouchableOpacity onPress={prevMonth} style={[cal.arrowBtn, { backgroundColor: colors.cardAlt }]} activeOpacity={0.7} hitSlop={{top:10,bottom:10,left:10,right:10}}>
            <Ionicons name="chevron-back" size={16} color={SECONDARY} />
          </TouchableOpacity>
          <TouchableOpacity onPress={nextMonth} style={[cal.arrowBtn, { backgroundColor: colors.cardAlt }]} activeOpacity={0.7} hitSlop={{top:10,bottom:10,left:10,right:10}}>
            <Ionicons name="chevron-forward" size={16} color={SECONDARY} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Weekdays */}
      <View style={cal.weekdays}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={cal.weekdayText}>{d}</Text>
        ))}
      </View>

      {/* Grid */}
      <View style={cal.grid}>
        {grid.map((item, idx) => {
          const isSelected = item.isCurrentMonth && selectedDate === item.dateKey;
          const isDisabled = !item.isCurrentMonth || item.isPast;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={0.8}
              disabled={isDisabled}
              onPress={() => {
                onSelectDate(item.dateKey);
                Haptics.selectionAsync();
              }}
              style={[
                cal.dayCell,
                item.isCurrentMonth && !item.isPast && !isSelected && { backgroundColor: 'rgba(255,183,125,0.03)' },
                item.isCurrentMonth && !item.isPast && !isSelected && cal.dayCellActiveBorder,
                isSelected && cal.dayCellSelected,
              ]}
            >
              <Text
                style={[
                  cal.dayText,
                  !item.isCurrentMonth && cal.dayTextHidden,
                  item.isCurrentMonth && item.isPast && cal.dayTextPast,
                  isSelected && cal.dayTextSelected,
                ]}
              >
                {item.day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xxl,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.01 * 17,
  },
  arrows: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  arrowBtn: {
    padding: 6,
    borderRadius: Math.round(BorderRadius.sm * 1.5),
  },
  weekdays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  dayCell: {
    width: '13%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14, // Subtle rounded squares
    marginHorizontal: '0.64%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
    }),
  },
  dayCellActiveBorder: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dayCellSelected: {
    backgroundColor: PRIMARY,
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      android: { elevation: 6 },
    }),
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  dayTextHidden: {
    color: SURFACE_HIGH,
  },
  dayTextPast: {
    color: MUTED,
    fontWeight: '400',
  },
  dayTextSelected: {
    color: ON_PRIMARY,
    fontWeight: '800',
  },
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
      <View style={[ss.screen, { backgroundColor: SURFACE_LOW }]}>
        <AnimatedHeader />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: TabBarHeight + 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Success Hero ── */}
          <Animated.View entering={FadeInDown.duration(200)} style={s4.heroWrap}>
            <LinearGradient
              colors={['rgba(255,140,0,0.12)', 'rgba(255,183,125,0.03)', 'transparent']}
              style={s4.heroBg}
            />
            <View style={s4.heroIconWrap}>
              <LinearGradient
                colors={[PRIMARY_CTR, PRIMARY]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s4.heroIcon}
              >
                <Ionicons name="checkmark" size={44} color={ON_PRIMARY} />
              </LinearGradient>
            </View>
            <Text style={s4.heroLabel}>APPOINTMENT CONFIRMED</Text>
            <Text style={s4.heroTitle}>You're All Set</Text>
            <Text style={s4.heroSub}>
              Your booking has been submitted.{'\n'}We'll confirm it shortly.
            </Text>

            {/* Booking reference badge */}
            <View style={s4.heroRefBadge}>
              <Ionicons name="bookmark-outline" size={14} color={PRIMARY} />
              <Text style={s4.heroRefText}>{previewBookingRef}</Text>
            </View>
          </Animated.View>

          {/* ── Quick Summary Card ── */}
          <Animated.View entering={FadeInDown.delay(150).duration(200)} style={s4.sectionPad}>
            <View style={s4.quickCard}>
              {[
                { icon: 'car-outline', label: 'Vehicle', value: selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : '—' },
                { icon: 'sparkles-outline', label: 'Service', value: selectedService?.name || '—' },
                { icon: 'calendar-outline', label: 'Schedule', value: `${selectedDate} • ${selectedTime}` },
              ].map((item, i, arr) => (
                <View key={i} style={[s4.quickRow, i < arr.length - 1 && { marginBottom: 16 }]}>
                  <View style={s4.quickIconWrap}>
                    <Ionicons name={item.icon as any} size={16} color={PRIMARY} />
                  </View>
                  <Text style={s4.quickLabel}>{item.label}</Text>
                  <Text style={s4.quickVal} numberOfLines={1}>{item.value}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ── Workflow Tracker ── */}
          <Animated.View entering={FadeInDown.delay(300).duration(200)} style={s4.sectionPad}>
            <View style={s4.trackerHeader}>
              <View style={s4.trackerIconWrap}>
                <Ionicons name="git-branch-outline" size={14} color={PRIMARY} />
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
                    entering={FadeInDown.delay(350 + idx * 60).duration(200)}
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
                          size={13}
                          color={ws.active ? ON_PRIMARY : MUTED}
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
          <Animated.View entering={FadeInDown.delay(700).duration(200)} style={s4.sectionPad}>
            <View style={{ gap: 12 }}>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  reset();
                  router.push('/(customer)/track');
                }}
              >
                <LinearGradient
                  colors={[PRIMARY_CTR, PRIMARY]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={s4.actionGradientBtn}
                >
                  <Ionicons name="navigate-outline" size={18} color={ON_PRIMARY} />
                  <Text style={s4.actionGradientText}>Track My Booking</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={reset}
                style={s4.actionOutlineBtn}
              >
                <Ionicons name="add-circle-outline" size={18} color={PRIMARY} />
                <Text style={s4.actionOutlineText}>Book Another Service</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s4.dashboardBtn}
                activeOpacity={0.85}
                onPress={() => {
                  reset();
                  router.push('/(customer)');
                }}
              >
                <Ionicons name="grid-outline" size={16} color={DIM_TEXT} />
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
    <View style={[ss.screen, { backgroundColor: SURFACE_LOW }]}>
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
              entering={FadeInDown.duration(200)}
              style={ss.stepWrap}
            >
              {/* ── Editorial Hero Header ── */}
              <Animated.View entering={FadeInDown.delay(80).duration(200)} style={ss.heroSection}>
                <Text style={ss.heroLabel}>SCHEDULE EXPERIENCE</Text>
                <Text style={ss.heroTitle}>Book a{'\n'}Service</Text>
                <Text style={ss.heroSub}>
                  Precision care for your vehicle. Select your preferred treatment and timing.
                </Text>
              </Animated.View>

              {/* ── Customer Information ── */}
              <Animated.View entering={FadeInDown.delay(150).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="person-outline" size={14} color={PRIMARY} />
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
                  <Text style={ss.profileHint}>
                    Auto-synced from your profile settings
                  </Text>
                </View>
              </Animated.View>

              {/* ── Vehicle Selection ── */}
              <Animated.View entering={FadeInDown.delay(250).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="car-sport-outline" size={14} color={PRIMARY} />
                  </View>
                  <Text style={ss.sectionLabel}>SELECT VEHICLE</Text>
                </View>

                {vehiclesLoading ? (
                  <View style={ss.loadingBox}>
                    <ActivityIndicator size="large" color={PRIMARY} />
                    <Text style={ss.loadingText}>Loading vehicles…</Text>
                  </View>
                ) : vehicles.length === 0 ? (
                  <View style={ss.emptyBox}>
                    <View style={ss.emptyIconWrap}>
                      <Ionicons name="car-outline" size={32} color={MUTED} />
                    </View>
                    <Text style={ss.emptyTitle}>No vehicles registered</Text>
                    <Text style={ss.emptySub}>
                      Add your vehicle in Settings to get started.
                    </Text>
                    <TouchableOpacity 
                      activeOpacity={0.85}
                      onPress={() => router.push('/(screens)/vehicles')}
                      style={ss.emptyActionBtn}
                    >
                      <Text style={ss.emptyActionText}>Go to Settings</Text>
                      <Ionicons name="arrow-forward" size={14} color={PRIMARY} />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    {vehicles.map((v, i) => (
                      <Animated.View
                        key={v.id}
                        entering={FadeInDown.delay(300 + i * 60).duration(200)}
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

              {/* Next Button */}
              <TouchableOpacity
                activeOpacity={0.88}
                disabled={!canProceedStep0}
                onPress={goNext}
                style={{ opacity: canProceedStep0 ? 1 : 0.4 }}
              >
                <LinearGradient
                  colors={[PRIMARY_CTR, PRIMARY]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={ss.gradientBtn}
                >
                  <Text style={ss.gradientBtnText}>Continue</Text>
                  <Ionicons name="chevron-forward" size={18} color={ON_PRIMARY} />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 1 — SERVICE & SCHEDULE
          ═══════════════════════════════════════════════════ */}
          {step === 1 && (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={ss.stepWrap}
            >
              {/* Header */}
              <View style={ss.editorialHeader}>
                <Text style={ss.editorialLabel}>CONFIGURE APPOINTMENT</Text>
                <Text style={ss.editorialTitle}>Service &{'\n'}Schedule</Text>
                <Text style={ss.editorialSub}>
                  Choose your premium treatment, preferred date, and time slot.
                </Text>
              </View>

              {/* ── Service Selection — Horizontal Showcase ── */}
              <Animated.View entering={FadeInDown.delay(100).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="sparkles-outline" size={14} color={PRIMARY} />
                  </View>
                  <Text style={ss.sectionLabel}>SELECT SERVICE</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={ss.viewAllLabel}>{services.length} available</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 14, paddingRight: 4 }}
                  decelerationRate="fast"
                  snapToInterval={SCREEN_W * 0.52 + 14}
                >
                  {services.map((s, idx) => {
                    const isSelected = selectedService?.id === s.id;
                    return (
                      <Animated.View
                        key={s.id}
                        entering={FadeInRight.delay(80 + idx * 60).duration(200)}
                      >
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => {
                            setSelectedService(s);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                          }}
                          style={[
                            s2.showcaseCard,
                            isSelected && s2.showcaseCardSelected,
                          ]}
                        >
                          {/* Dark gradient overlay */}
                          <LinearGradient
                            colors={['transparent', 'rgba(0,0,0,0.7)', SURFACE_LOW]}
                            style={s2.showcaseGradient}
                          />

                          {/* Icon at top */}
                          <View style={s2.showcaseIconRow}>
                            <View style={[s2.showcaseIconBox, isSelected && s2.showcaseIconBoxSelected]}>
                              <Ionicons
                                name={(s.icon as any) || 'pricetag-outline'}
                                size={22}
                                color={isSelected ? ON_PRIMARY : SECONDARY}
                              />
                            </View>
                            {isSelected && (
                              <View style={s2.showcaseCheckBadge}>
                                <Ionicons name="checkmark" size={12} color={ON_PRIMARY} />
                              </View>
                            )}
                          </View>

                          {/* Bottom info — glass overlay */}
                          <View style={s2.showcaseInfo}>
                            <Text style={s2.showcaseName} numberOfLines={2}>{s.name}</Text>
                            <Text style={s2.showcaseDesc} numberOfLines={1}>
                              {s.description || s.duration}
                            </Text>
                            <View style={s2.showcasePriceRow}>
                              <Text style={[s2.showcasePrice, isSelected && s2.showcasePriceSelected]}>
                                ₱{Number(s.price).toLocaleString()}
                              </Text>
                              <Text style={s2.showcasePriceSuffix}>+</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  })}
                </ScrollView>
              </Animated.View>

              {/* ── Date Selection ── */}
              <Animated.View entering={FadeInDown.delay(300).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="calendar-outline" size={14} color={PRIMARY} />
                  </View>
                  <Text style={ss.sectionLabel}>SELECT DATE</Text>
                </View>

                <MonthCalendar
                  selectedDate={selectedDate}
                  onSelectDate={(val) => {
                    setSelectedDate(val);
                    Haptics.selectionAsync();
                  }}
                />

                {/* Time slots */}
                {selectedDate && (
                  <Animated.View entering={FadeInDown.delay(80).duration(200)}>
                    <View style={[s1.sectionHeader, { marginTop: 24 }]}>
                      <View style={s1.sectionIconWrap}>
                        <Ionicons name="time-outline" size={14} color={PRIMARY} />
                      </View>
                      <Text style={ss.sectionLabel}>AVAILABLE TIME</Text>
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
                            {isActive ? (
                              <LinearGradient
                                colors={[PRIMARY_CTR, PRIMARY]}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={s2.timePillGradient}
                              >
                                <Text style={s2.timeTextSelected}>{t}</Text>
                              </LinearGradient>
                            ) : (
                              <Text style={s2.timeText}>{t}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}
              </Animated.View>

              {/* ── Notes ── */}
              <Animated.View entering={FadeInDown.delay(400).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="document-text-outline" size={14} color={PRIMARY} />
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
                <TouchableOpacity activeOpacity={0.85} onPress={goBack} style={[ss.outlineBtn, { flex: 1 }]}>
                  <Text style={ss.outlineBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={!canProceedStep1}
                  onPress={goNext}
                  style={{ flex: 2, opacity: canProceedStep1 ? 1 : 0.4 }}
                >
                  <LinearGradient
                    colors={[PRIMARY_CTR, PRIMARY]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={ss.gradientBtn}
                  >
                    <Text style={ss.gradientBtnText}>Continue</Text>
                    <Ionicons name="chevron-forward" size={18} color={ON_PRIMARY} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 2 — REVIEW & PAYMENT PROOF
          ═══════════════════════════════════════════════════ */}
          {step === 2 && (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={ss.stepWrap}
            >
              <View style={ss.editorialHeader}>
                <Text style={ss.editorialLabel}>REVIEW DETAILS</Text>
                <Text style={ss.editorialTitle}>Review &{'\n'}Payment</Text>
                <Text style={ss.editorialSub}>Verify your booking details and upload payment proof.</Text>
              </View>

              {/* ── Booking Summary ── */}
              <Animated.View entering={FadeInDown.delay(100).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="receipt-outline" size={14} color={PRIMARY} />
                  </View>
                  <Text style={ss.sectionLabel}>BOOKING SUMMARY</Text>
                </View>

                <View style={s3.summaryCard}>
                  {/* Card header band */}
                  <LinearGradient
                    colors={[PRIMARY_CTR, PRIMARY]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s3.summaryHeader}
                  >
                    <Ionicons name="car-sport-outline" size={16} color={ON_PRIMARY} />
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
                      <View key={i} style={[s3.summaryRow, i > 0 && { marginTop: 14 }]}>
                        <View style={s3.summaryRowLeft}>
                          <Ionicons name={item.icon as any} size={15} color={MUTED} />
                          <Text style={s3.summaryLabel}>{item.label}</Text>
                        </View>
                        <Text style={s3.summaryValue} numberOfLines={1}>{item.value}</Text>
                      </View>
                    ))}

                    {/* Notes if present */}
                    {notes.trim() !== '' && (
                      <View style={[s3.summaryRow, { alignItems: 'flex-start', marginTop: 14 }]}>
                        <View style={[s3.summaryRowLeft, { marginTop: 2 }]}>
                          <Ionicons name="document-text-outline" size={15} color={MUTED} />
                          <Text style={s3.summaryLabel}>Notes</Text>
                        </View>
                        <Text style={[s3.summaryValue, { flex: 1, textAlign: 'right' }]} numberOfLines={3}>
                          {notes}
                        </Text>
                      </View>
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

              {/* ── Booking Reference ── */}
              <Animated.View entering={FadeInDown.delay(200).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="bookmark-outline" size={14} color={PRIMARY} />
                  </View>
                  <Text style={ss.sectionLabel}>BOOKING REFERENCE</Text>
                </View>

                <View style={s3.refCard}>
                  <View style={s3.refIconWrap}>
                    <Ionicons name="qr-code-outline" size={28} color={PRIMARY} />
                  </View>
                  <Text style={s3.refCode}>{previewBookingRef}</Text>
                  <Text style={s3.refHint}>
                    Your official reference will be generated upon confirmation
                  </Text>
                </View>
              </Animated.View>

              {/* ── GCash Downpayment Upload ── */}
              <Animated.View entering={FadeInDown.delay(300).duration(200)}>
                <View style={s1.sectionHeader}>
                  <View style={s1.sectionIconWrap}>
                    <Ionicons name="card-outline" size={14} color={PRIMARY} />
                  </View>
                  <Text style={ss.sectionLabel}>GCASH DOWNPAYMENT (OPTIONAL)</Text>
                </View>

                <View style={s3.uploadCard}>
                  {downpaymentProof ? (
                    <Animated.View entering={FadeInDown.duration(200)} style={s3.previewWrap}>
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
                          <Ionicons name="swap-horizontal" size={16} color={PRIMARY} />
                          <Text style={s3.previewActionText}>Replace</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[s3.previewActionBtn, { backgroundColor: 'rgba(255,68,68,0.08)' }]}
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
                    <View style={s3.uploadContent}>
                      <View style={s3.uploadIconWrap}>
                        <Ionicons name="cloud-upload-outline" size={32} color={MUTED} />
                      </View>
                      <Text style={s3.uploadTitle}>Upload Payment Screenshot</Text>
                      <Text style={s3.uploadSubtitle}>GCash receipt or payment confirmation</Text>
                      <View style={s3.uploadBtnRow}>
                        <TouchableOpacity
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
                          <LinearGradient
                            colors={[PRIMARY_CTR, PRIMARY]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={s3.uploadGradientBtn}
                          >
                            <Ionicons name="images-outline" size={16} color={ON_PRIMARY} />
                            <Text style={s3.uploadGradientText}>Gallery</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={s3.uploadOutlineBtn}
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
                          <Ionicons name="camera-outline" size={16} color={PRIMARY} />
                          <Text style={s3.uploadOutlineText}>Camera</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </Animated.View>

              {/* ── Disclaimer ── */}
              <Animated.View entering={FadeInDown.delay(400).duration(200)}>
                <View style={s3.disclaimerCard}>
                  <LinearGradient
                    colors={['rgba(255,140,0,0.08)', 'rgba(255,183,125,0.02)']}
                    style={s3.disclaimerGradient}
                  >
                    <View style={{ alignItems: 'center' }}>
                      <Ionicons name="shield-checkmark-outline" size={28} color={PRIMARY} />
                    </View>
                    {[
                      { icon: 'calendar-outline', text: 'Your booking schedule may be adjusted based on shop availability.' },
                      { icon: 'card-outline', text: 'GCash downpayment is recommended to secure your slot.' },
                      { icon: 'ban-outline', text: 'Double bookings are not allowed. One slot per customer.' },
                      { icon: 'checkmark-done-outline', text: 'Confirmation is subject to admin review and approval.' },
                    ].map((item, i) => (
                      <View key={i} style={s3.disclaimerRow}>
                        <View style={s3.disclaimerRowIcon}>
                          <Ionicons name={item.icon as any} size={14} color={PRIMARY} />
                        </View>
                        <Text style={s3.disclaimerRowText}>{item.text}</Text>
                      </View>
                    ))}
                  </LinearGradient>
                </View>
              </Animated.View>

              {/* Navigation */}
              <View style={ss.btnRow}>
                <TouchableOpacity activeOpacity={0.85} onPress={goBack} style={[ss.outlineBtn, { flex: 1 }]}>
                  <Text style={ss.outlineBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.88} onPress={goNext} style={{ flex: 2 }}>
                  <LinearGradient
                    colors={[PRIMARY_CTR, PRIMARY]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={ss.gradientBtn}
                  >
                    <Text style={ss.gradientBtnText}>Proceed</Text>
                    <Ionicons name="arrow-forward" size={18} color={ON_PRIMARY} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 3 — FINAL CONFIRMATION
          ═══════════════════════════════════════════════════ */}
          {step === 3 && (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={ss.stepWrap}
            >
              {/* Header */}
              <View style={ss.editorialHeader}>
                <Text style={ss.editorialLabel}>FINALIZE BOOKING</Text>
                <Text style={[ss.editorialTitle, { fontSize: 32 }]}>Confirm{'\n'}Booking</Text>
                <Text style={ss.editorialSub}>
                  Your appointment is almost set. Tap confirm to submit.
                </Text>
              </View>

              {/* Booking Reference */}
              <Animated.View entering={FadeInDown.delay(100).duration(200)}>
                <View style={s4.confirmRefCard}>
                  <View style={s4.confirmRefIconWrap}>
                    <Ionicons name="bookmark-outline" size={18} color={PRIMARY} />
                  </View>
                  <View>
                    <Text style={s4.confirmRefLabel}>BOOKING REFERENCE</Text>
                    <Text style={s4.confirmRefCode}>{previewBookingRef}</Text>
                  </View>
                </View>
              </Animated.View>

              {/* Compact Summary */}
              <Animated.View entering={FadeInDown.delay(200).duration(200)}>
                <View style={s4.confirmCard}>
                  <LinearGradient
                    colors={[PRIMARY_CTR, PRIMARY]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={s4.confirmCardHeader}
                  >
                    <Ionicons name="car-sport-outline" size={16} color={ON_PRIMARY} />
                    <Text style={s4.confirmCardHeaderText}>APPOINTMENT DETAILS</Text>
                  </LinearGradient>

                  <View style={s4.confirmCardBody}>
                    {[
                      { icon: 'person-outline', label: 'Customer', value: customerName || '—' },
                      { icon: 'car-outline', label: 'Vehicle', value: selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : '—' },
                      { icon: 'sparkles-outline', label: 'Service', value: selectedService?.name || '—' },
                      { icon: 'calendar-outline', label: 'Schedule', value: `${selectedDate} • ${selectedTime}` },
                    ].map((item, i, arr) => (
                      <View key={i} style={[s4.confirmRow, i > 0 && { marginTop: 14 }]}>
                        <Ionicons name={item.icon as any} size={14} color={MUTED} />
                        <Text style={s4.confirmLabel}>{item.label}</Text>
                        <Text style={s4.confirmVal} numberOfLines={1}>{item.value}</Text>
                      </View>
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
                <Animated.View entering={FadeInDown.delay(250).duration(200)}>
                  <View style={s4.paymentBadge}>
                    <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                    <Text style={s4.paymentBadgeText}>GCash proof attached</Text>
                  </View>
                </Animated.View>
              )}

              {/* Notice */}
              <Animated.View entering={FadeInDown.delay(300).duration(200)}>
                <View style={s4.noticeBar}>
                  <Ionicons name="information-circle-outline" size={18} color={PRIMARY} />
                  <Text style={s4.noticeBarText}>
                    By confirming, you agree to the booking terms. Arrive{' '}
                    <Text style={{ color: PRIMARY, fontWeight: '700' }}>15 min early</Text>.
                  </Text>
                </View>
              </Animated.View>

              {/* Actions */}
              <View style={ss.btnRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goBack}
                  disabled={isSubmitting}
                  style={[ss.outlineBtn, { flex: 1 }]}
                >
                  <Text style={ss.outlineBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={isSubmitting}
                  onPress={handleConfirm}
                  style={{ flex: 2, opacity: isSubmitting ? 0.6 : 1 }}
                >
                  <LinearGradient
                    colors={[PRIMARY_CTR, PRIMARY]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={ss.gradientBtn}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={ON_PRIMARY} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color={ON_PRIMARY} />
                        <Text style={ss.gradientBtnText}>Confirm Booking</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// KINETIC GALLERY — STYLE SHEETS
// ═══════════════════════════════════════════════════════════════════════════════

/** Screen-level & shared styles */
const ss = StyleSheet.create({
  screen: { flex: 1, backgroundColor: SURFACE_LOW },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  stepWrap: { gap: 28 },

  // ── Editorial Hero (Step 0) ──
  heroSection: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05 * 11,
    color: PRIMARY,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 38,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.02 * 38,
    lineHeight: 42,
    marginBottom: 10,
  },
  heroSub: {
    fontSize: 15,
    color: DIM_TEXT,
    lineHeight: 22,
    letterSpacing: 0.01 * 15,
  },

  // ── Editorial Header (Steps 1-3) ──
  editorialHeader: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  editorialLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05 * 11,
    color: PRIMARY,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  editorialTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.02 * 34,
    lineHeight: 38,
    marginBottom: 10,
  },
  editorialSub: {
    fontSize: 15,
    color: DIM_TEXT,
    lineHeight: 22,
    letterSpacing: 0.01 * 15,
  },

  // ── Section Label ──
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.05 * 10,
    color: MUTED,
    textTransform: 'uppercase',
  },

  viewAllLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: PRIMARY,
    letterSpacing: 0.01 * 11,
  },

  profileHint: {
    fontSize: 11,
    color: MUTED,
    marginTop: 6,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // ── Gradient Button (Primary CTA) ──
  gradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.15,
        shadowRadius: 40,
      },
      android: { elevation: 8 },
    }),
  },
  gradientBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: ON_PRIMARY,
    letterSpacing: 0.01 * 15,
  },

  // ── Outline Button (Secondary) ──
  outlineBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: SURFACE_MID,
  },
  outlineBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: SECONDARY,
  },

  // ── Button Row ──
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },

  // ── Loading & Empty ──
  loadingBox: { alignItems: 'center', paddingVertical: 48, gap: 14 },
  loadingText: { color: MUTED, fontSize: 13, fontWeight: '500' },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: SURFACE_HIGH,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: SECONDARY },
  emptySub: { fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 20 },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,183,125,0.08)',
    borderRadius: 16,
  },
  emptyActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: PRIMARY,
  },
});

/** Step 1 — Service & Schedule Kinetic Gallery styles */
const s2 = StyleSheet.create({
  /* ── Horizontal Service Showcase ── */
  showcaseCard: {
    width: SCREEN_W * 0.52,
    height: 220,
    borderRadius: 24,
    backgroundColor: SURFACE_MID,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  showcaseCardSelected: {
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
    }),
  },
  showcaseGradient: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  showcaseIconRow: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  showcaseIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: SURFACE_HIGH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseIconBoxSelected: {
    backgroundColor: PRIMARY_CTR,
  },
  showcaseCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseInfo: {
    padding: 16,
    gap: 4,
  },
  showcaseName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.01 * 15,
  },
  showcaseDesc: {
    fontSize: 11,
    color: DIM_TEXT,
    lineHeight: 15,
  },
  showcasePriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 4,
  },
  showcasePrice: {
    fontSize: 20,
    fontWeight: '800',
    color: SECONDARY,
  },
  showcasePriceSelected: {
    color: PRIMARY,
  },
  showcasePriceSuffix: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
    marginLeft: 2,
  },

  /* ── Calendar Card ── */
  calendarCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 14,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(255,183,125,0.08)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  dateBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY,
  },

  /* ── Time Grid ── */
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timePill: {
    width: '30.5%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: SURFACE_MID,
  },
  timePillSelected: {
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
      },
      android: { elevation: 4 },
    }),
  },
  timePillGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '500',
    color: SECONDARY,
    paddingVertical: 14,
    textAlign: 'center',
  },
  timeTextSelected: {
    color: ON_PRIMARY,
    fontWeight: '700',
    fontSize: 13,
  },

  /* ── Notes Card ── */
  notesCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 18,
  },
});

/** Step 2 — Review & Payment Kinetic Gallery styles */
const s3 = StyleSheet.create({
  /* ── Summary Card ── */
  summaryCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: SURFACE_MID,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  summaryHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: ON_PRIMARY,
    letterSpacing: 0.05 * 11,
  },
  summaryBody: {
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryLabel: {
    fontSize: 13,
    color: DIM_TEXT,
    fontWeight: '400',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E0E0E0',
    maxWidth: '55%',
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,183,125,0.12)',
  },
  totalLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05 * 11,
    color: MUTED,
  },
  totalValue: {
    fontSize: 28,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: -0.02 * 28,
  },

  /* ── Booking Reference ── */
  refCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  refIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,183,125,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  refCode: {
    fontSize: 22,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  refHint: {
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 17,
    maxWidth: 240,
  },

  /* ── Upload ── */
  uploadCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    overflow: 'hidden',
  },
  uploadContent: {
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  uploadIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: SURFACE_HIGH,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.01 * 16,
  },
  uploadSubtitle: {
    fontSize: 13,
    color: DIM_TEXT,
    marginBottom: 8,
  },
  uploadBtnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
  },
  uploadGradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  uploadGradientText: {
    fontSize: 13,
    fontWeight: '700',
    color: ON_PRIMARY,
  },
  uploadOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: SURFACE_HIGH,
  },
  uploadOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY,
  },

  /* ── Preview ── */
  previewWrap: {
    padding: 14,
    gap: 12,
  },
  previewImage: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    backgroundColor: SURFACE,
  },
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  previewActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,183,125,0.06)',
  },
  previewActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY,
  },

  /* ── Disclaimer ── */
  disclaimerCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  disclaimerGradient: {
    padding: 24,
    gap: 14,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  disclaimerRowIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,183,125,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  disclaimerRowText: {
    flex: 1,
    fontSize: 13,
    color: SECONDARY,
    lineHeight: 19,
  },
});

/** Step 3 / Success — Confirmation & Workflow Tracker styles */
const s4 = StyleSheet.create({
  /* ── SUCCESS HERO ── */
  heroWrap: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 28,
    position: 'relative',
  },
  heroBg: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  heroIconWrap: {
    marginBottom: 20,
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY_CTR,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.4,
        shadowRadius: 30,
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
  heroLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05 * 11,
    color: PRIMARY,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -0.02 * 32,
    marginBottom: 6,
  },
  heroSub: {
    fontSize: 14,
    color: DIM_TEXT,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 16,
  },
  heroRefBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,183,125,0.08)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  heroRefText: {
    fontSize: 15,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  /* ── QUICK SUMMARY ── */
  sectionPad: { paddingHorizontal: 20, marginTop: 20 },
  quickCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 20,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,183,125,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 13, color: DIM_TEXT, fontWeight: '400' },
  quickVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#E0E0E0',
    textAlign: 'right',
  },

  /* ── WORKFLOW TIMELINE ── */
  trackerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  trackerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(255,183,125,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.05 * 11,
    color: MUTED,
    textTransform: 'uppercase',
  },
  trackerCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 18,
    paddingLeft: 10,
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
    backgroundColor: SURFACE_HIGH,
    minHeight: 10,
    borderRadius: 1,
  },
  timelineLineActive: {
    backgroundColor: PRIMARY_CTR,
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
    backgroundColor: PRIMARY_CTR,
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY_CTR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  timelineDotInactive: {
    backgroundColor: SURFACE_HIGH,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
  },
  timelineLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
  timelineTs: {
    fontSize: 11,
    color: SURFACE_TOP,
    marginTop: 2,
  },
  timelineBadge: {
    backgroundColor: 'rgba(255,183,125,0.1)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  timelineBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: PRIMARY,
    letterSpacing: 0.05 * 9,
  },

  /* ── ACTION BUTTONS ── */
  actionGradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 24,
    paddingVertical: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 20 },
        shadowOpacity: 0.15,
        shadowRadius: 40,
      },
      android: { elevation: 8 },
    }),
  },
  actionGradientText: {
    fontSize: 15,
    fontWeight: '700',
    color: ON_PRIMARY,
  },
  actionOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 24,
    backgroundColor: SURFACE_MID,
  },
  actionOutlineText: {
    fontSize: 15,
    fontWeight: '600',
    color: PRIMARY,
  },
  dashboardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: SURFACE,
  },
  dashboardBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: DIM_TEXT,
  },

  /* ── CONFIRM STEP (Step 3 wizard) ── */
  confirmRefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(255,183,125,0.06)',
    borderRadius: 20,
    padding: 16,
  },
  confirmRefIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,183,125,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmRefLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.05 * 10,
    color: MUTED,
    textTransform: 'uppercase',
  },
  confirmRefCode: {
    fontSize: 18,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: 2,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  confirmCard: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: SURFACE_MID,
  },
  confirmCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  confirmCardHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: ON_PRIMARY,
    letterSpacing: 0.05 * 11,
  },
  confirmCardBody: {
    padding: 20,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  confirmLabel: {
    fontSize: 13,
    color: DIM_TEXT,
    fontWeight: '400',
  },
  confirmVal: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#E0E0E0',
    textAlign: 'right',
  },
  confirmTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,183,125,0.1)',
  },
  confirmTotalLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.05 * 11,
    color: MUTED,
    textTransform: 'uppercase',
  },
  confirmTotalVal: {
    fontSize: 26,
    fontWeight: '800',
    color: PRIMARY,
    letterSpacing: -0.02 * 26,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(52, 199, 89, 0.06)',
    borderRadius: 16,
    padding: 14,
  },
  paymentBadgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#34C759',
  },
  noticeBar: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,183,125,0.04)',
    borderRadius: 20,
    padding: 16,
  },
  noticeBarText: {
    flex: 1,
    fontSize: 13,
    color: SECONDARY,
    lineHeight: 20,
  },
});

/** Add Vehicle Form */
const avf = StyleSheet.create({
  container: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 20,
    gap: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.01 * 16 },
  row: { flexDirection: 'row', gap: 12 },
  fieldHalf: { flex: 1 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 6,
    letterSpacing: 0.05 * 11,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: SURFACE_LOW,
    borderRadius: 14,
    borderBottomWidth: 1,
    borderBottomColor: GHOST,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  hint: {
    fontSize: 10,
    color: MUTED,
    marginTop: 5,
    letterSpacing: 0.3,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 20,
    paddingVertical: 14,
    marginTop: 4,
    overflow: 'hidden',
  },
  submitText: {
    fontSize: 14,
    fontWeight: '700',
    color: ON_PRIMARY,
    letterSpacing: 0.01 * 14,
  },
});

/** Step 0 — Customer & Vehicle glassmorphism */
const s1 = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(255,183,125,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 20,
    gap: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
      },
      android: { elevation: 2 },
    }),
  },
});
