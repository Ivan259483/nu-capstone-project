/**
 * Book Screen — Premium 4-Step Service Booking Wizard
 * ═══════════════════════════════════════════════════════
 * "The Kinetic Gallery" Design System
 * 
 * Obsidian surfaces · Warm amber accents · Editorial typography
 * Glassmorphism · Tonal depth · No hard borders
 * 
 * Step 0: Vehicle selection / add vehicle
 * Step 1: Service & Schedule
 * Step 2: Review & Payment
 * Step 3: Final Confirmation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Dimensions,
  Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// expo-blur available if needed for future glassmorphism enhancements
import { useTheme } from '@/hooks/useThemeContext';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage, invalidateCache } from '@/services/api/client';
import { bookingService } from '@/services/api/bookingService';
import { serviceService } from '@/services/api/serviceService';
import { vehicleService } from '@/services/api/vehicleService';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import type { ServiceOption, Vehicle } from '@/services/api/types';
import { Palette, BorderRadius, Shadows, TabBarContentHeight, TabBarHeight, Spacing } from '@/constants/theme';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import GlassCard from '@/components/ui/GlassCard';
import Badge from '@/components/ui/Badge';
import PremiumButton from '@/components/ui/PremiumButton';
import PremiumInput from '@/components/ui/PremiumInput';
import { Toast } from '@/components/ui/PremiumToast';
import AddVehicleModal from '@/components/booking/AddVehicleModal';
import { Validation } from '@/utils/validation';
import {
  BOOKING_TERMS_DOCUMENT_TITLE,
  BOOKING_TERMS_INTRO,
  BOOKING_TERMS_SECTIONS,
} from '@/constants/bookingTerms';
import {
  SPF_BASE_PRICES,
  SPF_TINT_PRICES,
  type VehicleTypeKey,
} from '@/constants/spfPricing';

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

// ─── SPF Package Definitions — mirrors Services.tsx exactly ──────────────────
interface SPFPackage {
  key: string;
  label: string;
  years: string;
  badge: string;
  badgeColor: string;   // accent hex
  tier: string;
  /** Longer marketing copy — aligned with web RAW_SPF_PACKAGES.description */
  description: string;
  prices: Record<VehicleTypeKey, number | null>;
  tintPrices: Record<VehicleTypeKey, number | null>;
  features: string[];
  popular: boolean;
  flagship: boolean;
}

const SPF_PACKAGES: SPFPackage[] = [
  {
    key: 'spf80',
    label: 'SPF 80',
    years: '3 Years',
    badge: 'SPECIAL OFFER',
    badgeColor: '#F97316',
    tier: 'Essential',
    description:
      'Give your car the protection it deserves with our essential ceramic coating package. We apply a high-quality protective layer that helps shield your paint from scratches, UV rays, dirt, and water so your vehicle stays glossier and easier to wash between visits.',
    prices: SPF_BASE_PRICES.spf80,
    tintPrices: SPF_TINT_PRICES.spf80,
    features: [
      '3 Layers of Graphene Ceramic Coating (Made in Canada)',
      'Graphene Sealant',
      'FREE 1 visit Signature AUTOSPF Carwash',
    ],
    popular: false,
    flagship: false,
  },
  {
    key: 'spf89',
    label: 'SPF 89',
    years: '5 Years',
    badge: 'RECOMMENDED',
    badgeColor: '#10B981',
    tier: 'Advanced',
    description:
      'Step up to a deeper, longer-lasting ceramic stack built for daily drivers. Multiple graphene-rich layers add stronger UV and chemical resistance while keeping water beading tight—so your paint looks richer and stays protected through sun, rain, and road grime.',
    prices: SPF_BASE_PRICES.spf89,
    tintPrices: SPF_TINT_PRICES.spf89,
    features: [
      '4 Layers of Graphene Ceramic Coating (Made in Canada)',
      'Graphene Sealant',
      'FREE 1 visit Reboost/Maintenance (save ₱1,500)',
    ],
    popular: true,
    flagship: false,
  },
  {
    key: 'spf99',
    label: 'SPF 99',
    years: '10 Years',
    badge: '50% OFF PROMO',
    badgeColor: '#A855F7',
    tier: 'Premium',
    description:
      'Our premium coating program uses professional-grade SONAX Profiline layers for exceptional gloss and durability. Ideal if you want showroom depth, easier maintenance, and a documented maintenance path—including scheduled reboost visits to keep the film chemistry performing year after year.',
    prices: SPF_BASE_PRICES.spf99,
    tintPrices: SPF_TINT_PRICES.spf99,
    features: [
      '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
      'FREE Full Recoat After 5 Years',
      'FREE 2 visits Reboost/Maintenance (save ₱3,000)',
    ],
    popular: false,
    flagship: false,
  },
  {
    key: 'spf101',
    label: 'SPF 101',
    years: '10 Years',
    badge: 'ALL-IN PACKAGE',
    badgeColor: '#F59E0B',
    tier: 'Flagship',
    description:
      'The ultimate AutoSPF+ experience: strategic PPF coverage for high-impact areas, flagship ceramic coating, full nano-ceramic tint, and bundled maintenance so your vehicle leaves protected from bumper to glass. Built for owners who want maximum resale appeal and peace of mind in one appointment.',
    prices: SPF_BASE_PRICES.spf101,
    tintPrices: SPF_TINT_PRICES.spf101,
    features: [
      'Paint Protection Film PPF Install on: Hood, Front Bumper, Stepsils, Door Bowls, Side Mirrors, Headlight & Taillight',
      '4 Layers of SONAX Profiline CC EVO (Made in Germany)',
      'FREE 5 visits Reboost/Maintenance (save ₱7,500)',
      'FREE Full Recoat After 5 Years',
      'Nano Ceramic Window Tint (Full Wrap — Any Shades)',
      'FREE UnderCoating (Rust Proofing) (save ₱14,000)',
    ],
    popular: false,
    flagship: true,
  },
];

const VEHICLE_OPTIONS: { key: VehicleTypeKey; label: string; icon: string }[] = [
  { key: 'hatchback', label: 'Hatchback',       icon: 'car-outline' },
  { key: 'sedan',     label: 'Sedan',            icon: 'car-sport-outline' },
  { key: 'midsized',  label: 'Midsized',         icon: 'car-sport-outline' },
  { key: 'suv',       label: 'SUV',              icon: 'car-outline' },
  { key: 'pickup',    label: 'Pick Up',          icon: 'car-outline' },
  { key: 'largesuv',  label: 'Large SUV / Van',  icon: 'bus-outline' },
  { key: 'highend',   label: 'Highend Sedan',    icon: 'diamond-outline' },
];

const STEP_LABELS = ['Service', 'Details', 'Schedule', 'Review', 'Terms', 'Payment'];

// Package subtitle text — matches web's RAW_SPF_PACKAGES.duration
const PKG_DURATIONS: Record<string, string> = {
  spf80:  'Perfect entry-level protection',
  spf89:  'Our most chosen package',
  spf99:  'Maximum protection, best price-to-value',
  spf101: 'The complete transformation experience',
};

// Maps any vehicle-type string (from garage) to the price-key used in SPF_PACKAGES
const getVehiclePriceKey = (type: string): VehicleTypeKey => {
  const map: Record<string, VehicleTypeKey> = {
    'hatchback': 'hatchback', 'sedan': 'sedan', 'midsized': 'midsized',
    'suv': 'suv', 'pick up': 'pickup', 'pickup': 'pickup',
    'large suv / van': 'largesuv', 'large suv': 'largesuv', 'van': 'largesuv',
    'highend': 'highend', 'highend sedan': 'highend', 'high-end sedan': 'highend',
  };
  return map[type?.toLowerCase()] || 'hatchback';
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Month Calendar logic is encapsulated below

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** Thin progress bar — mirrors the web booking modal's 2px amber bar */
function StepIndicator({ current }: { current: number }) {
  const total = STEP_LABELS.length; // 6
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <View style={{ width: '100%', height: 2, backgroundColor: '#1a1a1a' }}>
      <View
        style={{
          height: 2,
          width: `${pct}%`,
          backgroundColor: PRIMARY,
          borderRadius: 999,
        }}
      />
    </View>
  );
}

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
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sunday-first, matches web
const EMERGENCY_CLOSURE_MESSAGE = 'Bookings for today have been temporarily closed. Please select another available date.';

type DayAvailabilityStatus = 'available' | 'full' | 'closed';
type DayAvailabilityInfo = {
  status: DayAvailabilityStatus;
  unavailable: boolean;
  reason: string;
  errorCode: string | null;
  closureType: 'emergency' | 'closure' | 'recurring' | null;
  remaining: number | null;
  booked: number | null;
  capacity: number | null;
};
type DayAvailabilityMap = Record<string, DayAvailabilityInfo>;

const CALENDAR_STATUS_COLORS = {
  available: '#22C55E',
  full: '#EF4444',
  closed: '#94A3B8',
} as const;

type AvailableSlotsPayload = {
  success?: boolean;
  slots?: {
    time?: string;
    label?: string;
    status?: string;
    available?: number;
    booked?: number;
    capacity?: number;
  }[];
  unavailable?: boolean;
  errorCode?: string | null;
  message?: string | null;
  error?: string | null;
  emergencyClosed?: boolean;
  closureType?: string | null;
  closedReason?: string | null;
  businessDate?: string | null;
  businessTimeZone?: string | null;
  timeZone?: string | null;
};

const normalizeAvailableSlotsPayload = (payload: AvailableSlotsPayload) => {
  const slots = Array.isArray(payload?.slots) ? payload.slots : [];
  const unavailable = !!payload?.unavailable;
  const errorCode = typeof payload?.errorCode === 'string' ? payload.errorCode : null;
  const message = (payload?.message || payload?.error || '').toString().trim();
  const closureType = String(payload?.closureType || payload?.closedReason || '').toLowerCase() || null;
  const emergencyClosed = errorCode === 'EMERGENCY_CLOSED'
    || payload?.emergencyClosed === true
    || closureType === 'emergency';
  const businessDate = typeof payload?.businessDate === 'string' ? payload.businessDate : null;
  const businessTimeZone = typeof payload?.businessTimeZone === 'string'
    ? payload.businessTimeZone
    : typeof payload?.timeZone === 'string'
      ? payload.timeZone
      : null;
  return {
    slots,
    unavailable,
    errorCode,
    message,
    closureType,
    emergencyClosed,
    businessDate,
    businessTimeZone,
  };
};

type SlotRangeRow = {
  date?: string;
  isClosed?: boolean;
  closedReason?: 'emergency' | 'closure' | 'recurring' | null;
  closureType?: 'emergency' | 'closure' | 'recurring' | null;
  closureReason?: string | null;
  errorCode?: string | null;
  emergencyClosed?: boolean;
  closureLabel?: string | null;
  availableSlots?: number;
  bookedSlots?: number;
  dailyCapacity?: number;
  status?: string;
};

const isIsoDate = (value: unknown): value is string => (
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
);

const getEmergencyClosureType = (row: SlotRangeRow): boolean => (
  row.emergencyClosed === true
  || String(row.errorCode || '').toUpperCase() === 'EMERGENCY_CLOSED'
  || String(row.closureType || row.closedReason || '').toLowerCase() === 'emergency'
);

const getLocalIsoDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatIsoDateForDisplay = (value: string | null, includeWeekday = false) => {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    date.getFullYear() !== Number(match[1])
    || date.getMonth() !== Number(match[2]) - 1
    || date.getDate() !== Number(match[3])
  ) return value;
  return date.toLocaleDateString('en-US', {
    ...(includeWeekday ? { weekday: 'long' as const } : {}),
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const getSlotStartMinutes = (value: string): number | null => {
  const raw = String(value || '').trim();
  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
    return null;
  }

  const twelveHour = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!twelveHour) return null;
  let hour = Number(twelveHour[1]);
  const minute = Number(twelveHour[2]);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (twelveHour[3].toUpperCase() === 'AM') {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour * 60 + minute;
};

/** Month Calendar Grid Component — mirrors web CustomerDashboard calendar */
function MonthCalendar({
  selectedDate,
  onSelectDate,
  monthAvailability = {},
  loading = false,
  businessDate,
  onMonthChange,
}: {
  selectedDate: string | null;
  onSelectDate: (dateKey: string, iso: string) => void;
  monthAvailability?: DayAvailabilityMap;
  loading?: boolean;
  businessDate?: string | null;
  onMonthChange?: (year: number, month: number) => void;
}) {
  const { colors } = useTheme();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const appliedBusinessDateRef = useRef<string | null>(null);

  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const todayKey = isIsoDate(businessDate) ? businessDate : getLocalIsoDate(new Date());

  useEffect(() => {
    if (!isIsoDate(businessDate) || appliedBusinessDateRef.current === businessDate) return;
    appliedBusinessDateRef.current = businessDate;
    const [businessYear, businessMonth, businessDay] = businessDate.split('-').map(Number);
    setCurrentMonth((current) => {
      if (current.getFullYear() === businessYear && current.getMonth() === businessMonth - 1) return current;
      const next = new Date(businessYear, businessMonth - 1, businessDay);
      onMonthChange?.(businessYear, businessMonth - 1);
      return next;
    });
  }, [businessDate, onMonthChange]);

  const prevMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = new Date(year, month - 1, 1);
    setCurrentMonth(d);
    onMonthChange?.(d.getFullYear(), d.getMonth());
  };
  const nextMonth = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = new Date(year, month + 1, 1);
    setCurrentMonth(d);
    onMonthChange?.(d.getFullYear(), d.getMonth());
  };

  const daysInMonth    = new Date(year, month + 1, 0).getDate();
  const firstDay       = new Date(year, month, 1).getDay(); // 0 = Sunday
  const blanks         = firstDay;
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const grid: Array<{
    day: number; isCurrentMonth: boolean;
    dateKey: string; iso: string; isPast: boolean;
  }> = [];

  for (let i = 0; i < blanks; i++) {
    grid.push({ day: daysInPrevMonth - blanks + i + 1, isCurrentMonth: false, dateKey: '', iso: '', isPast: true });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const isPast = iso < todayKey;
    grid.push({ day: i, isCurrentMonth: true, dateKey: iso, iso, isPast });
  }
  const remaining = 7 - (grid.length % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      grid.push({ day: i, isCurrentMonth: false, dateKey: '', iso: '', isPast: false });
    }
  }

  return (
    <View style={[cal.container, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, ...Shadows.sm }]}>
      {/* Header — arrows on sides, title centered */}
      <View style={cal.header}>
        <TouchableOpacity
          onPress={prevMonth}
          activeOpacity={0.7}
          style={cal.arrowBtn}
          accessibilityRole="button"
          accessibilityLabel="Show previous month"
        >
          <Ionicons name="chevron-back" size={20} color={SECONDARY} />
        </TouchableOpacity>
        <Text style={cal.monthTitle}>{MONTH_NAMES_FULL[month]} {year}</Text>
        <TouchableOpacity
          onPress={nextMonth}
          activeOpacity={0.7}
          style={cal.arrowBtn}
          accessibilityRole="button"
          accessibilityLabel="Show next month"
        >
          <Ionicons name="chevron-forward" size={20} color={SECONDARY} />
        </TouchableOpacity>
      </View>

      {/* Weekday headers */}
      <View style={cal.weekdays}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={cal.weekdayText}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={cal.grid}>
        {grid.map((item, idx) => {
          const isSelected = item.isCurrentMonth && selectedDate === item.dateKey;
          const isStaticDisabled = !item.isCurrentMonth || item.isPast;
          const dayInfo = item.isCurrentMonth && !item.isPast ? monthAvailability[item.iso] : undefined;
          const availStatus = dayInfo?.status;
          const isUnavailable = loading || !dayInfo || !!dayInfo.unavailable || availStatus === 'closed' || availStatus === 'full';
          const isToday = item.isCurrentMonth && item.iso === todayKey;
          const statusColor = dayInfo
            ? dayInfo.errorCode === 'EMERGENCY_CLOSED'
              ? CALENDAR_STATUS_COLORS.full
              : CALENDAR_STATUS_COLORS[dayInfo.status]
            : null;
          const statusMarkerStyle = dayInfo?.errorCode === 'EMERGENCY_CLOSED'
            ? cal.statusIndicatorBooked
            : dayInfo?.status === 'full'
              ? cal.statusIndicatorBooked
              : dayInfo?.status === 'closed'
                ? cal.statusIndicatorClosed
                : null;

          return (
            <TouchableOpacity
              key={idx}
              activeOpacity={isStaticDisabled || isUnavailable ? 1 : 0.8}
              disabled={isStaticDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: isStaticDisabled || isUnavailable, selected: isSelected }}
              accessibilityLabel={dayInfo && !item.isPast
                ? `${item.iso}: ${availStatus === 'closed'
                  ? dayInfo.errorCode === 'EMERGENCY_CLOSED' || dayInfo.closureType === 'emergency'
                    ? 'Emergency Closed'
                    : 'Closed'
                  : availStatus === 'full'
                    ? 'Fully Booked'
                    : `${dayInfo.remaining ?? 0} appointment${dayInfo.remaining === 1 ? '' : 's'} available`}`
                : undefined}
              onPress={() => {
                if (isStaticDisabled) return;
                if (isUnavailable) {
                  Toast.show(
                    loading
                      ? 'Checking live availability…'
                      : dayInfo?.reason || 'Live availability could not be confirmed for this date.',
                    'info',
                  );
                  return;
                }
                onSelectDate(item.dateKey, item.iso);
                Haptics.selectionAsync();
              }}
              style={[
                cal.dayCell,
              ]}
            >
              <Text style={[
                cal.dayText,
                !item.isCurrentMonth && cal.dayTextAdjacent,
                item.isCurrentMonth && item.isPast && cal.dayTextPast,
                item.isCurrentMonth && !item.isPast && isUnavailable && cal.dayTextUnavailable,
                isToday && cal.dayTextToday,
                isSelected && cal.dayTextSelected,
              ]}>
                {item.day}
              </Text>
              <View style={cal.statusIndicatorTrack}>
                {statusColor && !item.isPast ? (
                  <View style={[
                    cal.statusIndicator,
                    { backgroundColor: statusColor },
                    statusMarkerStyle,
                  ]} />
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={cal.legend} accessibilityLabel="Calendar availability legend">
        {[
          { color: CALENDAR_STATUS_COLORS.available, label: 'Available', marker: null },
          { color: CALENDAR_STATUS_COLORS.full, label: 'Booked', marker: cal.statusIndicatorBooked },
          { color: CALENDAR_STATUS_COLORS.closed, label: 'Closed', marker: cal.statusIndicatorClosed },
        ].map((item) => (
          <View key={item.label} style={cal.legendItem}>
            <View style={[cal.legendDot, { backgroundColor: item.color }, item.marker]} />
            <Text style={cal.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const cal = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.xxl,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: -0.01 * 17,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  weekdays: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#8B8B94',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    minHeight: 48,
    paddingVertical: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E4E4E7',
    width: 34,
    height: 34,
    textAlign: 'center',
    lineHeight: 34,
    borderRadius: 17,
    overflow: 'hidden',
  },
  dayTextAdjacent: {
    color: '#3F3F46',
    fontWeight: '400',
  },
  dayTextPast: {
    color: '#52525B',
    fontWeight: '400',
  },
  dayTextUnavailable: {
    color: '#71717A',
    fontWeight: '500',
  },
  dayTextToday: {
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.55)',
  },
  dayTextSelected: {
    backgroundColor: Palette.accent,
    borderColor: Palette.accent,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  statusIndicatorTrack: {
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusIndicatorBooked: {
    width: 10,
    height: 3,
    borderRadius: 1.5,
  },
  statusIndicatorClosed: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: CALENDAR_STATUS_COLORS.closed,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 18,
    rowGap: 8,
    marginTop: 12,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 11,
    color: '#A1A1AA',
    fontWeight: '600',
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BookScreen() {
  const { colors, isDark } = useTheme();
  const { profile, backendUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── State ──
  const [step, setStep] = useState(0);

  // Step 0 — Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Step 1 — Service (loaded on mount)
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);

  // Step 1 — Vehicle type for pricing
  const [vehicleType, setVehicleType] = useState<VehicleTypeKey>('sedan');
  // Which SPF package is selected (key)
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);

  // Step 1 — Schedule & Details
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [phone, setPhone] = useState('' );

  const [notes, setNotes] = useState('');

  // Add Vehicle form
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  // "Why Advanced?" bottom sheet
  const [whyOpen, setWhyOpen] = useState(false);

  // ── Per-card spring animations (4 packages × scale + opacity + checkmark) ──
  const scaleSpf80  = useSharedValue(1);
  const scaleSpf89  = useSharedValue(1);
  const scaleSpf99  = useSharedValue(1);
  const scaleSpf101 = useSharedValue(1);
  const opacSpf80   = useSharedValue(1);
  const opacSpf89   = useSharedValue(1);
  const opacSpf99   = useSharedValue(1);
  const opacSpf101  = useSharedValue(1);
  const chkSpf80    = useSharedValue(0);
  const chkSpf89    = useSharedValue(0);
  const chkSpf99    = useSharedValue(0);
  const chkSpf101   = useSharedValue(0);

  const cardAnimSpf80  = useAnimatedStyle(() => ({ transform: [{ scale: scaleSpf80.value }],  opacity: opacSpf80.value  }));
  const cardAnimSpf89  = useAnimatedStyle(() => ({ transform: [{ scale: scaleSpf89.value }],  opacity: opacSpf89.value  }));
  const cardAnimSpf99  = useAnimatedStyle(() => ({ transform: [{ scale: scaleSpf99.value }],  opacity: opacSpf99.value  }));
  const cardAnimSpf101 = useAnimatedStyle(() => ({ transform: [{ scale: scaleSpf101.value }], opacity: opacSpf101.value }));
  const chkAnimSpf80   = useAnimatedStyle(() => ({ transform: [{ scale: chkSpf80.value }]  }));
  const chkAnimSpf89   = useAnimatedStyle(() => ({ transform: [{ scale: chkSpf89.value }]  }));
  const chkAnimSpf99   = useAnimatedStyle(() => ({ transform: [{ scale: chkSpf99.value }]  }));
  const chkAnimSpf101  = useAnimatedStyle(() => ({ transform: [{ scale: chkSpf101.value }] }));

  // Validation Errors
  const [phoneError, setPhoneError] = useState('');

  // Step 2 — Payment proof
  const [downpaymentProof, setDownpaymentProof] = useState<string | null>(null);

  // Step 4 (UI: step 5 of 6) — Terms & Conditions
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [tcScrolledToBottom, setTcScrolledToBottom] = useState(false);
  const tcViewportHRef = useRef(0);
  const prevStepForTermsRef = useRef(step);

  useEffect(() => {
    const prev = prevStepForTermsRef.current;
    prevStepForTermsRef.current = step;
    if (step === 4 && prev !== 4) {
      setTcScrolledToBottom(false);
      setAgreedToTerms(false);
    }
  }, [step]);

  // General
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const dateScrollRef = useRef<ScrollView>(null);

  // ── Calendar availability state (mirrors web CustomerDashboard) ──
  type SlotStatus = 'AVAILABLE' | 'FULL' | 'CLOSED';
  const [monthAvailability, setMonthAvailability] = useState<DayAvailabilityMap>({});
  const [monthAvailLoading, setMonthAvailLoading] = useState(false);
  const [slotStatuses, setSlotStatuses] = useState<{ time: string; status: SlotStatus }[]>([]);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [businessDate, setBusinessDate] = useState<string | null>(null);
  const [, setBusinessTimeZone] = useState<string | null>(null);
  const monthAvailabilityRequestRef = useRef(0);
  const slotAvailabilityRequestRef = useRef(0);
  const selectedDateRef = useRef<string | null>(null);
  const stepRef = useRef(step);
  const visibleCalendarMonthRef = useRef({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  selectedDateRef.current = selectedDate;
  stepRef.current = step;

  const fetchMonthAvailability = useCallback(async (y: number, m: number) => {
    const requestId = ++monthAvailabilityRequestRef.current;
    setMonthAvailLoading(true);
    const fallbackBusinessDate = businessDate || getLocalIsoDate(new Date());
    const daysInM = new Date(y, m + 1, 0).getDate();
    const result: DayAvailabilityMap = {};

    for (let d = 1; d <= daysInM; d++) {
      const iso  = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isPast = iso < fallbackBusinessDate;
      result[iso] = {
        status: 'closed',
        unavailable: true,
        errorCode: isPast ? 'PAST_DATE' : 'AVAILABILITY_UNCONFIRMED',
        reason: isPast
          ? 'Past date is no longer available for booking.'
          : 'Live availability could not be confirmed for this date.',
        closureType: null,
        remaining: 0,
        booked: null,
        capacity: null,
      };
    }

    try {
      const { apiClient } = await import('@/services/api/client');
      const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInM).padStart(2, '0')}`;
      const res = await apiClient.get(`/slots/range?start=${start}&end=${end}`);
      if (requestId !== monthAvailabilityRequestRef.current) return;
      const rows: SlotRangeRow[] = Array.isArray(res.data?.data) ? res.data.data : [];
      if (res.data?.success !== true || rows.length === 0) {
        throw new Error('Availability range was not returned by the server.');
      }
      const serverBusinessDate = isIsoDate(res.data?.businessDate)
        ? res.data.businessDate
        : fallbackBusinessDate;
      const serverTimeZone = typeof res.data?.businessTimeZone === 'string'
        ? res.data.businessTimeZone
        : typeof res.data?.timeZone === 'string'
          ? res.data.timeZone
          : null;
      setBusinessDate(serverBusinessDate);
      if (serverTimeZone) setBusinessTimeZone(serverTimeZone);

      for (const iso of Object.keys(result)) {
        const isPast = iso < serverBusinessDate;
        result[iso] = {
          ...result[iso],
          errorCode: isPast ? 'PAST_DATE' : 'AVAILABILITY_UNCONFIRMED',
          reason: isPast
            ? 'Past date is no longer available for booking.'
            : 'Live availability could not be confirmed for this date.',
        };
      }

      for (const row of rows) {
        const iso = typeof row.date === 'string' ? row.date : '';
        if (!iso || !Object.prototype.hasOwnProperty.call(result, iso)) continue;
        if (iso < serverBusinessDate) continue;

        const apiStatus = String(row.status || '').toUpperCase();
        const knownStatus = ['AVAILABLE', 'ALMOST_FULL', 'FULL', 'OVER_CAPACITY', 'CLOSED'].includes(apiStatus);
        const remaining = typeof row.availableSlots === 'number'
          ? row.availableSlots
          : Number.NaN;
        const booked = typeof row.bookedSlots === 'number' ? row.bookedSlots : Number.NaN;
        const capacity = typeof row.dailyCapacity === 'number' ? row.dailyCapacity : Number.NaN;
        const hasValidRemaining = Number.isFinite(remaining) && remaining >= 0;
        const hasValidDailyCounts = Number.isFinite(booked)
          && booked >= 0
          && Number.isFinite(capacity)
          && capacity >= 0;
        if (!knownStatus || !hasValidRemaining || !hasValidDailyCounts) continue;
        const isClosed = !!row.isClosed || apiStatus === 'CLOSED';
        const isFull = !isClosed && (apiStatus === 'FULL' || (remaining !== null && remaining <= 0));
        const status: DayAvailabilityStatus = isClosed ? 'closed' : isFull ? 'full' : 'available';
        const emergencyClosed = getEmergencyClosureType(row);
        const closureType = emergencyClosed
          ? 'emergency'
          : (row.closureType || row.closedReason || null);
        const closedReason = emergencyClosed
          ? EMERGENCY_CLOSURE_MESSAGE
          : row.closureReason || row.closureLabel
            || (closureType === 'recurring'
              ? 'The shop is closed on this day.'
              : 'This date is unavailable for booking.');

        result[iso] = {
          status,
          unavailable: status !== 'available',
          errorCode: isClosed
            ? emergencyClosed
              ? 'EMERGENCY_CLOSED'
              : closureType === 'recurring'
                ? 'CLOSED_BY_RECURRING_DAY'
                : 'CLOSED_BY_SCHEDULED_CLOSURE'
            : isFull
              ? 'DATE_FULL'
              : null,
          reason: isClosed
            ? closedReason
            : isFull
              ? 'All appointment times for this date are booked.'
              : '',
          closureType: isClosed ? closureType : null,
          remaining,
          booked,
          capacity,
        };
      }
    } catch {
      if (requestId === monthAvailabilityRequestRef.current) {
        Toast.show('Could not load live calendar availability. Please try again.', 'error');
      }
    }
    finally {
      if (requestId === monthAvailabilityRequestRef.current) {
        setMonthAvailability(result);
        setMonthAvailLoading(false);
      }
    }
  }, [businessDate]);

  const fetchSlotsForDate = useCallback(async (iso: string) => {
    if (!iso) return;
    const requestId = ++slotAvailabilityRequestRef.current;
    setSlotsLoading(true);
    setSlotStatuses([]);
    setScheduleMessage('');
    try {
      const { apiClient } = await import('@/services/api/client');
      const res = await apiClient.get(`/orders/available-slots?date=${iso}`);
      if (requestId !== slotAvailabilityRequestRef.current) return;
      if (res.data?.success !== true) {
        throw new Error('Availability was not returned by the server.');
      }
      const {
        unavailable,
        errorCode,
        message,
        slots,
        emergencyClosed,
        businessDate: responseBusinessDate,
        businessTimeZone: responseBusinessTimeZone,
      } = normalizeAvailableSlotsPayload(res.data);
      if (isIsoDate(responseBusinessDate)) setBusinessDate(responseBusinessDate);
      if (responseBusinessTimeZone) setBusinessTimeZone(responseBusinessTimeZone);

      if (emergencyClosed) {
        setSlotStatuses([]);
        setSelectedTime(null);
        setScheduleMessage(EMERGENCY_CLOSURE_MESSAGE);
        setMonthAvailability((current) => ({
          ...current,
          [iso]: {
            status: 'closed',
            unavailable: true,
            reason: EMERGENCY_CLOSURE_MESSAGE,
            errorCode: 'EMERGENCY_CLOSED',
            closureType: 'emergency',
            remaining: 0,
            booked: current[iso]?.booked ?? null,
            capacity: current[iso]?.capacity ?? 0,
          },
        }));
        setStep(2);
        Toast.show(EMERGENCY_CLOSURE_MESSAGE, 'error');
        return;
      }

      const derived = slots.reduce<{ time: string; status: SlotStatus }[]>((rows, slot) => {
        const displayTime = String(slot.label || slot.time || '').trim();
        if (!displayTime) return rows;

        const rawStatus = String(slot.status || '').toUpperCase();
        const startMinutes = getSlotStartMinutes(String(slot.time || slot.label || ''));
        const knownStatus = ['AVAILABLE', 'ALMOST_FULL', 'FULL', 'OVER_CAPACITY'].includes(rawStatus);
        const capacity = typeof slot.capacity === 'number' ? slot.capacity : Number.NaN;
        const booked = typeof slot.booked === 'number' ? slot.booked : Number.NaN;
        const available = typeof slot.available === 'number' ? slot.available : Number.NaN;
        const hasValidCounts = Number.isFinite(capacity)
          && Number.isInteger(capacity)
          && capacity >= 0
          && Number.isFinite(booked)
          && Number.isInteger(booked)
          && booked >= 0
          && Number.isFinite(available)
          && Number.isInteger(available)
          && available >= 0
          && available === Math.max(0, capacity - booked);

        let status: SlotStatus = 'CLOSED';
        if (knownStatus && hasValidCounts && startMinutes !== null) {
          status = rawStatus === 'FULL'
            || rawStatus === 'OVER_CAPACITY'
            || available <= 0
            || booked >= capacity
            ? 'FULL'
            : 'AVAILABLE';
        }
        if (unavailable) status = errorCode === 'DATE_FULL' ? 'FULL' : 'CLOSED';
        rows.push({ time: displayTime, status });
        return rows;
      }, []);

      setSlotStatuses(derived);
      setSelectedTime((current) => (
        current && !derived.some((slot) => slot.time === current && slot.status === 'AVAILABLE')
          ? null
          : current
      ));

      if (message) {
        setScheduleMessage(message);
      } else if (derived.length === 0) {
        setScheduleMessage('No bookable time options were generated for this date.');
      }
    } catch {
      if (requestId === slotAvailabilityRequestRef.current) {
        setSlotStatuses([]);
        setSelectedTime(null);
        setScheduleMessage('Live time availability could not be confirmed. Please try again.');
      }
    } finally {
      if (requestId === slotAvailabilityRequestRef.current) setSlotsLoading(false);
    }
  }, [businessDate]);

  useEffect(() => {
    if (step !== 2) return;
    const now = new Date();
    visibleCalendarMonthRef.current = { year: now.getFullYear(), month: now.getMonth() };
    setMonthAvailability({});
    fetchMonthAvailability(now.getFullYear(), now.getMonth());
  }, [step, fetchMonthAvailability]);

  useEffect(() => {
    let disposed = false;
    let socket: Awaited<ReturnType<typeof getSharedSocket>> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refreshAvailability = () => {
      if (selectedDateRef.current) setSlotsLoading(true);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        if (disposed) return;
        const { year, month } = visibleCalendarMonthRef.current;
        setMonthAvailability({});
        void fetchMonthAvailability(year, month);
        if (selectedDateRef.current) {
          void fetchSlotsForDate(selectedDateRef.current);
        }
      }, 150);
    };

    const handleDbChange = (payload: { collection?: string }) => {
      if (
        payload?.collection === 'orders'
        || payload?.collection === 'shopavailabilities'
        || payload?.collection === 'scheduledclosures'
      ) refreshAvailability();
    };

    void getSharedSocket().then((sharedSocket) => {
      if (disposed) return;
      socket = sharedSocket;
      socket.on('availability_updated', refreshAvailability);
      socket.on('db_change', handleDbChange);
      socket.on('booking_updated', refreshAvailability);
    });

    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      socket?.off('availability_updated', refreshAvailability);
      socket?.off('db_change', handleDbChange);
      socket?.off('booking_updated', refreshAvailability);
    };
  }, [fetchMonthAvailability, fetchSlotsForDate]);

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
            // Auto-select the first vehicle so package cards are always visible
            if (v.length > 0) {
              setSelectedVehicle(prev => prev ?? v[0]);
              setVehicleType(getVehiclePriceKey(v[0].vehicleType || ''));
            }
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

  useEffect(() => {
    const fromProfile = (profile?.phone || '').trim();
    const fromBackend = (backendUser?.phone || '').trim();
    const p = fromProfile || fromBackend;
    if (p) setPhone(p);
  }, [profile?.phone, backendUser?.phone]);

  // ── AI Scan Pre-fill ─────────────────────────────────────────────────
  // Optional deep-link query params let other screens (e.g. AI Scan flow)
  // launch the booking wizard with the vehicle, package, and notes already
  // filled, jumping the user past Step 1 ("Service") so they only have to
  // pick a date/time/payment.
  //
  // Supported params:
  //   ?vehicleId=<id>   — pre-select an existing vehicle
  //   ?pkg=spf80|spf89|spf99|spf101 — pre-select an SPF package
  //   ?notes=<text>     — populate the notes field with the AI summary
  //   ?step=1|2|3       — advance to a later step (default 1 = "Details")
  // ─────────────────────────────────────────────────────────────────────
  const prefillParams = useLocalSearchParams<{
    vehicleId?: string;
    pkg?: string;
    notes?: string;
    step?: string;
  }>();
  const prefillAppliedRef = useRef(false);

  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillParams || (Array.isArray(vehicles) && vehicles.length === 0 && vehiclesLoading)) {
      return;
    }

    const requestedVehicleId = prefillParams.vehicleId
      ? String(prefillParams.vehicleId)
      : null;
    const requestedPkg = prefillParams.pkg ? String(prefillParams.pkg).toLowerCase() : null;
    const requestedNotes = prefillParams.notes ? String(prefillParams.notes) : null;
    const requestedStep = prefillParams.step ? Number(prefillParams.step) : NaN;

    if (!requestedVehicleId && !requestedPkg && !requestedNotes && !Number.isFinite(requestedStep)) {
      return;
    }

    if (requestedVehicleId && vehicles.length > 0) {
      const match = vehicles.find((v) => v.id === requestedVehicleId || v._id === requestedVehicleId);
      if (match) {
        setSelectedVehicle(match);
        setVehicleType(getVehiclePriceKey(match.vehicleType || ''));
      }
    }

    if (requestedPkg && SPF_PACKAGES.some((p) => p.key === requestedPkg)) {
      const pkg = SPF_PACKAGES.find((p) => p.key === requestedPkg)!;
      const priceKey = getVehiclePriceKey(
        (vehicles.find((v) => v.id === requestedVehicleId)?.vehicleType) || vehicleType || 'sedan'
      );
      const price = pkg.prices[priceKey] || pkg.prices.sedan || 0;
      // Re-use the existing select handler to drive its animations
      setTimeout(() => selectPkg(pkg.key, price ?? 0), 60);
    }

    if (requestedNotes) {
      setNotes(requestedNotes);
    }

    if (Number.isFinite(requestedStep) && requestedStep > 0) {
      setTimeout(() => setStep(Math.min(5, Math.max(0, requestedStep))), 120);
    }

    prefillAppliedRef.current = true;
  }, [prefillParams, vehicles, vehiclesLoading, vehicleType]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Navigation ──
  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(step + 1);
  };
  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => Math.max(0, s - 1));
  };

  // ── Package selection with spring animation ──────────────────────────────
  const PKG_SCALES: Record<string, ReturnType<typeof useSharedValue<number>>> = {
    spf80: scaleSpf80, spf89: scaleSpf89, spf99: scaleSpf99, spf101: scaleSpf101 };
  const PKG_OPACS: Record<string, ReturnType<typeof useSharedValue<number>>> = {
    spf80: opacSpf80,  spf89: opacSpf89,  spf99: opacSpf99,  spf101: opacSpf101  };
  const PKG_CHKS: Record<string, ReturnType<typeof useSharedValue<number>>> = {
    spf80: chkSpf80,   spf89: chkSpf89,   spf99: chkSpf99,   spf101: chkSpf101   };

  const selectPkg = useCallback((key: string, price: number) => {
    const allKeys = ['spf80', 'spf89', 'spf99', 'spf101'];
    // Dim non-selected, brighten selected + animate checkmark (no scale bounce)
    allKeys.forEach((k) => {
      PKG_OPACS[k].value = withTiming(k === key ? 1 : 0.45, { duration: 220 });
      PKG_CHKS[k].value  = withSpring(k === key ? 1 : 0, { damping: 12, stiffness: 300 });
    });
    // Business logic
    setSelectedPkg(key);
    const pkg = SPF_PACKAGES.find(p => p.key === key);
    const matched = services.find(sv => sv.name.toLowerCase().includes(pkg?.label?.toLowerCase() ?? ''))
      || (services.length > 0 ? services[0] : null);
    if (matched) setSelectedService({ ...matched, price });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, [services, PKG_SCALES, PKG_OPACS, PKG_CHKS]);

  const PKG_CARD_ANIMS: Record<string, ReturnType<typeof useAnimatedStyle>> = {
    spf80: cardAnimSpf80, spf89: cardAnimSpf89, spf99: cardAnimSpf99, spf101: cardAnimSpf101 };
  const PKG_CHK_ANIMS: Record<string, ReturnType<typeof useAnimatedStyle>> = {
    spf80: chkAnimSpf80,  spf89: chkAnimSpf89,  spf99: chkAnimSpf99,  spf101: chkAnimSpf101  };

  const reset = () => {
    setStep(0);
    setSelectedVehicle(null);
    setSelectedService(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setPhone('');
    setNotes('');
    setDownpaymentProof(null);
    setAgreedToTerms(false);
    setTcScrolledToBottom(false);
    setIsSuccess(false);
    setShowAddVehicle(false);
    setPhoneError('');
  };
  const handleConfirm = async () => {
    const effectivePkg = selectedPkg ? SPF_PACKAGES.find(p => p.key === selectedPkg) : null;
    const effectivePrice = effectivePkg ? effectivePkg.prices[vehicleType] : selectedService?.price;
    const effectiveName = selectedService?.name || effectivePkg?.label || '';
    const selectedAvailability = selectedDate ? monthAvailability[selectedDate] : undefined;
    const selectedSlotStillAvailable = !!selectedTime
      && slotStatuses.some((slot) => slot.time === selectedTime && slot.status === 'AVAILABLE');
    if (
      !effectiveName
      || !selectedDate
      || !selectedTime
      || slotsLoading
      || selectedAvailability?.unavailable
      || !selectedSlotStillAvailable
    ) {
      setStep(2);
      Toast.show(
        selectedAvailability?.errorCode === 'EMERGENCY_CLOSED'
          ? EMERGENCY_CLOSURE_MESSAGE
          : 'Please select an available appointment date and time.',
        'error',
      );
      return;
    }
    setIsSubmitting(true);

    try {
      // 🔍 DEBUG: Verify outbound booking payload (remove after verification)
      console.log('🔍 [BOOKING_PAYLOAD] Outbound:', {
        customerName: profile?.full_name,
        customerPhone: (profile?.phone || phone).trim() || undefined,
        vehiclePlate: selectedVehicle?.plateNumber,
        vehicleYear: selectedVehicle?.year?.toString(),
        vehicleMake: selectedVehicle?.make,
        vehicleModel: selectedVehicle?.model,
        vehicleColor: selectedVehicle?.color,
        serviceType: effectiveName,
        vehicleCategory: vehicleType,
        date: selectedDate,
        time: selectedTime,
      });
      await bookingService.createBooking({
        service: selectedService || { id: selectedPkg!, name: effectiveName, price: effectivePrice!, tag: 'Premium', description: '', icon: 'sparkles-outline', duration: '' },
        date: selectedDate,
        time: selectedTime,
        customerName: (profile?.full_name || '').trim(),
        customerPhone: (profile?.phone || phone).trim(),
        notes: notes.trim() || undefined,
        vehiclePlate: selectedVehicle?.plateNumber,
        vehicleYear: selectedVehicle?.year?.toString(),
        vehicleMake: selectedVehicle?.make,
        vehicleModel: selectedVehicle?.model,
        vehicleColor: selectedVehicle?.color,
        vehicleId: selectedVehicle?._id || selectedVehicle?.id,
        downpaymentProof: downpaymentProof || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateCache('/bookings');
      reset();
      router.push('/(customer)/track');
    } catch (error: any) {
      const errorPayload = error?.response?.data || {};
      const status = Number(error?.response?.status || 0);
      const errorCode = String(errorPayload?.errorCode || '').toUpperCase();
      const emergencyClosed = errorCode === 'EMERGENCY_CLOSED'
        || errorPayload?.emergencyClosed === true
        || String(errorPayload?.closureType || errorPayload?.closedReason || '').toLowerCase() === 'emergency';
      const message = emergencyClosed
        ? EMERGENCY_CLOSURE_MESSAGE
        : getApiErrorMessage(error, 'Something went wrong. Please try again.');
      if (emergencyClosed || status === 409) {
        const affectedDate = selectedDate;
        setSelectedTime(null);
        setScheduleMessage(message);
        setStep(2);
        if (affectedDate && emergencyClosed) {
          setMonthAvailability((current) => ({
            ...current,
            [affectedDate]: {
              status: 'closed',
              unavailable: true,
              reason: EMERGENCY_CLOSURE_MESSAGE,
              errorCode: 'EMERGENCY_CLOSED',
              closureType: 'emergency',
              remaining: 0,
              booked: current[affectedDate]?.booked ?? null,
              capacity: current[affectedDate]?.capacity ?? 0,
            },
          }));
        }
        const { year, month } = visibleCalendarMonthRef.current;
        void fetchMonthAvailability(year, month);
        if (affectedDate) void fetchSlotsForDate(affectedDate);
      }
      Toast.show(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Computed ──
  const displayCustomerName = (profile?.full_name || '').trim();
  const displayCustomerPhone = (profile?.phone || phone).trim();

  const selectedDayAvailability = selectedDate ? monthAvailability[selectedDate] : undefined;
  const selectedTimeIsAvailable = !!selectedTime
    && slotStatuses.some((slot) => slot.time === selectedTime && slot.status === 'AVAILABLE');
  const scheduleIsKnownAvailable = !!selectedDate
    && selectedTimeIsAvailable
    && !slotsLoading
    && selectedDayAvailability?.status === 'available'
    && !selectedDayAvailability.unavailable;
  const canProceedStep0 = !!selectedVehicle && (!!selectedService || !!selectedPkg); // Service: vehicle MUST be selected + package
  const canProceedStep1 = phone.replace(/\D/g, '').length >= 10;                  // Details: valid contact no.
  const canProceedStep2 = scheduleIsKnownAvailable;                                // Schedule: server-confirmed date + time
  const canProceedStep3 = scheduleIsKnownAvailable;                                // Review remains guarded during live refresh
  const canProceedStep4 = agreedToTerms && tcScrolledToBottom && scheduleIsKnownAvailable;
  const canConfirmBooking = canProceedStep4 && scheduleIsKnownAvailable;
  const availableTimeOptionCount = slotStatuses.filter((slot) => slot.status === 'AVAILABLE').length;
  const selectedDateCapacityLabel = !selectedDate
    ? ''
    : selectedDayAvailability?.status === 'full'
      ? 'Fully Booked'
      : selectedDayAvailability?.status === 'closed'
        ? selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED'
          ? 'Emergency Closed'
          : 'Closed'
        : typeof selectedDayAvailability?.remaining === 'number'
          ? `${selectedDayAvailability.remaining} appointment${selectedDayAvailability.remaining === 1 ? '' : 's'} remaining`
          : 'Checking daily availability';
  const timeOptionCountLabel = !selectedDate
    ? 'Select a date first'
    : slotsLoading
      ? 'Checking available times'
      : selectedDayAvailability?.status === 'full' || selectedDayAvailability?.status === 'closed'
        ? 'No time options available'
        : `${availableTimeOptionCount} available time option${availableTimeOptionCount === 1 ? '' : 's'}`;

  // ─────────────────────────────────────────────────────────────────────────
  // Success screen
  // ─────────────────────────────────────────────────────────────────────────
  if (isSuccess) {
    const WORKFLOW_STEPS = [
      { key: 'booking', label: 'Booking Submitted', icon: 'document-text', active: true, ts: 'Just now' },
      { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle', active: false, ts: '—' },
      { key: 'ingress', label: 'Vehicle Pre-Assessment', icon: 'clipboard', active: false, ts: '—' },
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
            <Text style={s4.heroLabel}>BOOKING SUCCESSFUL</Text>
            <Text style={s4.heroTitle}>Your booking is{`\n`}successful.</Text>
            <Text style={s4.heroSub}>
              Saved as{' '}
              <Text style={{ color: PRIMARY, fontWeight: '700' }}>{'“Pending”'}</Text>.
              {' '}Your booking is forwarded to our Sales Dashboard. We will confirm in{' '}
              <Text style={{ color: '#fff', fontWeight: '600' }}>1–3 minutes</Text>.
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
                { icon: 'sparkles-outline', label: 'Service', value: selectedService?.name || (selectedPkg ? SPF_PACKAGES.find(p => p.key === selectedPkg)?.label || '—' : '—') + (selectedPkg ? ` (${VEHICLE_OPTIONS.find(v => v.key === vehicleType)?.label})` : '') },
                { icon: 'calendar-outline', label: 'Schedule', value: `${formatIsoDateForDisplay(selectedDate)} • ${selectedTime}` },
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
          contentContainerStyle={[
            ss.content,
            {
              paddingBottom: TabBarContentHeight + insets.bottom + (step === 2 ? 72 : 32),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ═══════════════════════════════════════════════════
              STEP 0 — CHOOSE SERVICE  (mirrors web Step 1 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 0 && (
            <Animated.View entering={FadeInDown.duration(200)} style={ss.stepWrap}>

              {/* ── Hero ── */}
              <Animated.View entering={FadeInDown.delay(60).duration(200)} style={ss.heroSection}>
                <Text style={ss.heroLabel}>STEP 1 OF 6</Text>
                <Text style={ss.heroTitle}>Book a{'\n'}Service</Text>
                <Text style={ss.heroSub}>Choose your vehicle, then pick a package.</Text>
              </Animated.View>

              {/* ══ SECTION 1: YOUR VEHICLE ══ */}
              <Animated.View entering={FadeInDown.delay(120).duration(200)} style={{ gap: 10 }}>
                <View style={svc.stepSectionHeader}>
                  <View style={svc.stepNumBadge}>
                    <Text style={svc.stepNumText}>1</Text>
                  </View>
                  <Text style={svc.stepSectionTitle}>Your Vehicle</Text>
                </View>

                {vehiclesLoading ? (
                  <View style={ss.loadingBox}>
                    <ActivityIndicator size="small" color={PRIMARY} />
                    <Text style={ss.loadingText}>Loading vehicles…</Text>
                  </View>
                ) : vehicles.length === 0 ? (
                  /* Empty state — tap to add first vehicle */
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { setShowAddVehicle(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                    style={svc.addVehicleEmptyCard}
                  >
                    <View style={svc.addVehicleIconWrap}>
                      <Ionicons name="car-sport-outline" size={28} color={PRIMARY} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={svc.addVehicleEmptyTitle}>Add Your Vehicle</Text>
                      <Text style={svc.addVehicleEmptySub}>Register your car to get started with a booking.</Text>
                    </View>
                    <View style={svc.addVehicleArrow}>
                      <Ionicons name="chevron-forward" size={16} color={ON_PRIMARY} />
                    </View>
                  </TouchableOpacity>
                ) : (
                  /* Vehicle row cards — full-width, easy to tap */
                  <View style={{ gap: 8 }}>
                    {vehicles.map((v) => {
                      const isActive = selectedVehicle?.id === v.id;
                      const typeLabel = VEHICLE_OPTIONS.find(o =>
                        o.key === getVehiclePriceKey(v.vehicleType || '')
                      )?.label || v.vehicleType || '';
                      return (
                        <TouchableOpacity
                          key={v.id}
                          activeOpacity={0.82}
                          onPress={() => {
                            setSelectedVehicle(v);
                            setVehicleType(getVehiclePriceKey(v.vehicleType || ''));
                            setSelectedPkg(null);
                            setSelectedService(null);
                            Haptics.selectionAsync();
                          }}
                          style={[svc.vehicleRow, isActive && svc.vehicleRowActive]}
                        >
                          {/* Car icon */}
                          <View style={[svc.vehicleIconWrap, isActive && svc.vehicleIconWrapActive]}>
                            <Ionicons name="car-sport-outline" size={20} color={isActive ? ON_PRIMARY : PRIMARY} />
                          </View>

                          {/* Name + type */}
                          <View style={{ flex: 1 }}>
                            <Text style={[svc.vehicleRowName, isActive && { color: PRIMARY }]}>
                              {`${v.make} ${v.model}`.trim()}
                            </Text>
                            {typeLabel ? (
                              <Text style={svc.vehicleRowType}>{typeLabel}</Text>
                            ) : null}
                          </View>

                          {/* Radio indicator */}
                          <View style={[svc.radioOuter, isActive && svc.radioOuterActive]}>
                            {isActive && <View style={svc.radioInner} />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Add another vehicle — subtle secondary action */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => { setShowAddVehicle(true); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      style={svc.addVehicleSecondary}
                    >
                      <Ionicons name="add-circle-outline" size={16} color={PRIMARY} />
                      <Text style={svc.addVehicleSecondaryText}>Add Another Vehicle</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Animated.View>

              <AddVehicleModal
                visible={showAddVehicle}
                onClose={() => setShowAddVehicle(false)}
                onVehicleAdded={(v) => {
                  setVehicles((prev) => [...prev, v]);
                  setSelectedVehicle(v);
                  setVehicleType(getVehiclePriceKey(v.vehicleType || ''));
                  setShowAddVehicle(false);
                }}
              />

              {/* ══ SECTION 2: CHOOSE PACKAGE ══ */}
              <Animated.View entering={FadeInDown.delay(200).duration(200)} style={{ gap: 10 }}>
                <View style={svc.stepSectionHeader}>
                  <View style={[svc.stepNumBadge, !selectedVehicle && { backgroundColor: SURFACE_TOP }]}>
                    <Text style={[svc.stepNumText, !selectedVehicle && { color: MUTED }]}>2</Text>
                  </View>
                  <Text style={[svc.stepSectionTitle, !selectedVehicle && { color: MUTED }]}>Choose Package</Text>
                  {selectedVehicle && (
                    <Text style={svc.pricingForLabel}>
                      for {VEHICLE_OPTIONS.find(o => o.key === vehicleType)?.label || vehicleType}
                    </Text>
                  )}
                </View>

                {!selectedVehicle ? (
                  <View style={svc.packageLockedCard}>
                    <Ionicons name="lock-closed-outline" size={20} color={MUTED} />
                    <Text style={svc.packageLockedText}>Select your vehicle above to see packages</Text>
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    {SPF_PACKAGES.map((pkg, idx) => {
                      const price = pkg.prices[vehicleType];
                      if (price === null) return null;
                      const isHero     = pkg.key === 'spf89';
                      const isSelected = selectedPkg === pkg.key;
                      return (
                        <Animated.View
                          key={pkg.key}
                          entering={FadeInDown.delay(idx * 40).duration(200)}
                        >
                          <Animated.View style={PKG_CARD_ANIMS[pkg.key] as any}>
                            <TouchableOpacity
                              activeOpacity={1}
                              onPress={() => selectPkg(pkg.key, price)}
                              style={[
                                pkgCard.base,
                                isHero     && pkgCard.hero,
                                isSelected && pkgCard.selected,
                                isSelected && isHero && pkgCard.heroSelected,
                              ]}
                            >
                              {/* Hero gradient overlay */}
                              {isHero && (
                                <LinearGradient
                                  colors={['#1A1208', '#0F0F0F']}
                                  start={{ x: 0, y: 0 }}
                                  end={{ x: 1, y: 1 }}
                                  style={StyleSheet.absoluteFill}
                                />
                              )}

                              <View style={{ gap: 6 }}>
                                {/* Tier label */}
                                <Text style={pkgCard.tier}>{pkg.tier.toUpperCase()}</Text>

                                {/* Name + price row */}
                                <View style={pkgCard.nameRow}>
                                  <Text style={pkgCard.name}>{pkg.label} — {pkg.tier}</Text>
                                  {/* Animated checkmark */}
                                  <Animated.View style={[pkgCard.checkCircle, isSelected && pkgCard.checkCircleActive, PKG_CHK_ANIMS[pkg.key] as any]}>
                                    <Ionicons name="checkmark" size={13} color={isSelected ? '#0A0A0A' : 'transparent'} />
                                  </Animated.View>
                                </View>

                                {/* Price */}
                                <Text style={[pkgCard.price, isHero && { color: '#F97316' }]}>
                                  ₱{price.toLocaleString()}
                                </Text>

                                {/* Tagline */}
                                <Text style={pkgCard.tagline}>{PKG_DURATIONS[pkg.key]}</Text>

                                <Text style={pkgCard.description}>{pkg.description}</Text>

                                {/* Social proof — SPF 89 only */}
                                {isHero && (
                                  <Text style={pkgCard.socialProof}>
                                    78% of AutoSPF+ customers choose this package
                                  </Text>
                                )}

                                {/* Divider */}
                                <View style={pkgCard.divider} />

                                {/* Features */}
                                <View style={{ gap: 0 }}>
                                  {pkg.features.map((feat, fi) => {
                                    // Color savings in green
                                    const saveMatch = feat.match(/(.*?)\s*\(save (₱[\d,]+)\)(.*)/);
                                    return (
                                      <Text key={fi} style={pkgCard.feature}>
                                        {saveMatch ? (
                                          <>
                                            {saveMatch[1].trim()}
                                            <Text style={{ color: '#4ADE80' }}> · saves {saveMatch[2]}</Text>
                                          </>
                                        ) : feat}
                                      </Text>
                                    );
                                  })}
                                </View>

                                {/* "Why customers love this" — SPF 89 only */}
                                {isHero && (
                                  <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => setWhyOpen(true)}
                                    style={pkgCard.whyBtn}
                                  >
                                    <Text style={pkgCard.whyBtnText}>Why customers love this</Text>
                                    <Ionicons name="arrow-forward" size={12} color="#F97316" />
                                  </TouchableOpacity>
                                )}
                              </View>
                            </TouchableOpacity>
                          </Animated.View>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}
              </Animated.View>

              {/* Continue */}
              <TouchableOpacity
                activeOpacity={0.88}
                disabled={!canProceedStep0}
                onPress={goNext}
                style={{ opacity: canProceedStep0 ? 1 : 0.4 }}
              >
                <LinearGradient colors={[PRIMARY_CTR, PRIMARY]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={ss.gradientBtn}>
                  <Text style={ss.gradientBtnText}>Continue</Text>
                  <Ionicons name="chevron-forward" size={18} color={ON_PRIMARY} />
                </LinearGradient>
              </TouchableOpacity>
            </Animated.View>
          )}


          {/* ═══════════════════════════════════════════════════
              STEP 1 — YOUR DETAILS  (web Step 2 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 1 && (() => {
            const effectivePkg = selectedPkg ? SPF_PACKAGES.find(p => p.key === selectedPkg) : null;
            const effectivePrice: number = effectivePkg ? (effectivePkg.prices[vehicleType] ?? 0) : (selectedService?.price ?? 0);
            const effectiveName = selectedService?.name || effectivePkg?.label || '—';
            return (
              <Animated.View entering={FadeInDown.duration(200)} style={ss.stepWrap}>
                <View style={ss.editorialHeader}>
                  <Text style={ss.editorialLabel}>STEP 2 OF 6</Text>
                  <Text style={ss.editorialTitle}>Your{'\n'}Details</Text>
                  <Text style={ss.editorialSub}>Confirm your contact details and review your selection.</Text>
                </View>

                {/* ── Customer Info ── */}
                <Animated.View entering={FadeInDown.delay(80).duration(200)}>
                  <View style={s1.sectionHeader}>
                    <View style={s1.sectionIconWrap}>
                      <Ionicons name="person-outline" size={14} color={PRIMARY} />
                    </View>
                    <Text style={ss.sectionLabel}>CUSTOMER INFO</Text>
                  </View>

                  {/* Full Name – read-only */}
                  <View style={dt.fieldGroup}>
                    <Text style={dt.fieldLabel}>FULL NAME</Text>
                    <View style={dt.readOnlyRow}>
                      <Ionicons name="person-outline" size={15} color={MUTED} />
                      <Text style={dt.readOnlyValue} numberOfLines={1}>{profile?.full_name || '—'}</Text>
                      <View style={dt.autoFillBadge}><Text style={dt.autoFillText}>Auto-filled</Text></View>
                    </View>
                    <Text style={dt.hintText}>Auto-filled from your profile</Text>
                  </View>

                  {/* Contact No. – editable */}
                  <View style={[dt.fieldGroup, { marginTop: 12 }]}>
                    <Text style={dt.fieldLabel}>CONTACT NO. <Text style={{ color: '#ef4444' }}>*</Text></Text>
                    <PremiumInput
                      label=""
                      iconName="call-outline"
                      placeholder="09XXXXXXXXX"
                      value={phone}
                      onChangeText={(t) => { setPhone(t); setPhoneError(''); }}
                      keyboardType="phone-pad"
                      maxLength={13}
                    />
                    {phoneError ? <Text style={dt.errorText}>{phoneError}</Text> : null}
                  </View>
                </Animated.View>

                {/* ── Vehicle Details – 2×2 grid (mirrors web) ── */}
                <Animated.View entering={FadeInDown.delay(140).duration(200)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={s1.sectionHeader}>
                      <View style={s1.sectionIconWrap}>
                        <Ionicons name="car-outline" size={14} color={PRIMARY} />
                      </View>
                      <Text style={ss.sectionLabel}>VEHICLE DETAILS</Text>
                    </View>
                    <TouchableOpacity onPress={() => setStep(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: PRIMARY }}>Edit Vehicle</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 2×2 grid: Brand | Model then Color | Plate */}
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                    {[
                      { label: 'Brand', icon: 'car-outline', value: selectedVehicle?.make || '—' },
                      { label: 'Model', icon: 'car-sport-outline', value: selectedVehicle?.model || '—' },
                    ].map(({ label, icon, value }) => (
                      <View key={label} style={[dt.gridCell, { flex: 1 }]}>
                        <Text style={dt.gridLabel}>{label.toUpperCase()}</Text>
                        <View style={dt.gridValueRow}>
                          <Ionicons name={icon as any} size={13} color={MUTED} />
                          <Text style={dt.gridValue} numberOfLines={1}>{value}</Text>
                          <Ionicons name="lock-closed-outline" size={11} color="#d1d5db" />
                        </View>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    {[
                      { label: 'Color', icon: 'color-palette-outline', value: selectedVehicle?.color || '—' },
                      { label: 'Plate No.', icon: 'card-outline', value: selectedVehicle?.plateNumber?.toUpperCase() || '—' },
                    ].map(({ label, icon, value }) => (
                      <View key={label} style={[dt.gridCell, { flex: 1 }]}>
                        <Text style={dt.gridLabel}>{label.toUpperCase()}</Text>
                        <View style={dt.gridValueRow}>
                          <Ionicons name={icon as any} size={13} color={MUTED} />
                          <Text style={dt.gridValue} numberOfLines={1}>{value}</Text>
                          <Ionicons name="lock-closed-outline" size={11} color="#d1d5db" />
                        </View>
                      </View>
                    ))}
                  </View>
                  <Text style={[dt.hintText, { marginTop: 6 }]}>Auto-filled from your garage</Text>
                </Animated.View>

                {/* ── Car Service – read-only with Edit button ── */}
                <Animated.View entering={FadeInDown.delay(200).duration(200)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={s1.sectionHeader}>
                      <View style={s1.sectionIconWrap}>
                        <Ionicons name="sparkles-outline" size={14} color={PRIMARY} />
                      </View>
                      <Text style={ss.sectionLabel}>CAR SERVICE</Text>
                    </View>
                    <TouchableOpacity onPress={() => setStep(0)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: PRIMARY }}>Edit Service</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={dt.serviceCard}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={PRIMARY} />
                    <Text style={dt.serviceName} numberOfLines={2}>{effectiveName}</Text>
                    <Text style={dt.servicePrice}>₱{effectivePrice.toLocaleString()}</Text>
                  </View>
                </Animated.View>

                <View style={ss.btnRow}>
                  <TouchableOpacity activeOpacity={0.85} onPress={goBack} style={[ss.outlineBtn, { flex: 1 }]}>
                    <Text style={ss.outlineBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    disabled={!canProceedStep1}
                    onPress={() => {
                      const digits = phone.replace(/\D/g, '');
                      if (digits.length < 10) { setPhoneError('Enter a valid contact number'); return; }
                      goNext();
                    }}
                    style={{ flex: 2, opacity: canProceedStep1 ? 1 : 0.4 }}
                  >
                    <LinearGradient colors={[PRIMARY_CTR, PRIMARY]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={ss.gradientBtn}>
                      <Text style={ss.gradientBtnText}>Continue</Text>
                      <Ionicons name="chevron-forward" size={18} color={ON_PRIMARY} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
          })()}

          {/* ═══════════════════════════════════════════════════
              STEP 2 — SCHEDULE  (web Step 3 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 2 && (
            <Animated.View entering={FadeInDown.duration(200)} style={[ss.stepWrap, sch.scheduleWrap]}>

              {/* ── Calendar ── */}
              <MonthCalendar
                selectedDate={selectedDate}
                onSelectDate={(dateKey, iso) => {
                  setSelectedDate(iso || dateKey);
                  setSelectedTime('');
                  setSlotStatuses([]);
                  setScheduleMessage('');
                  fetchSlotsForDate(iso);
                }}
                monthAvailability={monthAvailability}
                loading={monthAvailLoading}
                businessDate={businessDate}
                onMonthChange={(y, m) => {
                  visibleCalendarMonthRef.current = { year: y, month: m };
                  setMonthAvailability({});
                  setSelectedDate(null);
                  setSelectedTime('');
                  setSlotStatuses([]);
                  setScheduleMessage('');
                  fetchMonthAvailability(y, m);
                }}
              />

              {/* ── Preferred Time ── */}
              <View style={sch.sectionCard}>
                <View style={sch.timeSectionHeader}>
                  <Text style={sch.timeSectionLabel}>PREFERRED TIME</Text>
                  <Text style={sch.timeOptionCount}>{timeOptionCountLabel}</Text>
                </View>

                {selectedDate ? (
                  <View style={sch.dateSummary}>
                    <View style={sch.dateSummaryBlock}>
                      <Text style={sch.dateSummaryLabel}>SELECTED DATE</Text>
                      <Text style={sch.dateSummaryDate}>{formatIsoDateForDisplay(selectedDate)}</Text>
                    </View>
                    <View style={[sch.dateSummaryBlock, sch.dateSummaryCapacityBlock]}>
                      <Text style={sch.dateSummaryLabel}>AVAILABILITY</Text>
                      <Text style={[
                        sch.dateSummaryCapacity,
                        selectedDayAvailability?.status === 'full' && sch.dateSummaryCapacityFull,
                        selectedDayAvailability?.status === 'closed' && sch.dateSummaryCapacityClosed,
                      ]}>
                        {selectedDateCapacityLabel}
                      </Text>
                      {typeof selectedDayAvailability?.booked === 'number'
                        && typeof selectedDayAvailability?.capacity === 'number' ? (
                          <Text style={sch.dateSummaryMeta}>
                            {selectedDayAvailability.booked} / {selectedDayAvailability.capacity} booked
                          </Text>
                        ) : null}
                    </View>
                  </View>
                ) : null}

                {!!scheduleMessage && (
                  <View style={sch.scheduleMessage}>
                    <Ionicons name="information-circle-outline" size={16} color={Palette.accent} />
                    <Text style={sch.scheduleMessageText}>{scheduleMessage}</Text>
                  </View>
                )}

                {!selectedDate ? (
                  <View style={sch.emptyState}>
                    <View style={sch.emptyIconWrap}>
                      <Ionicons name="time-outline" size={20} color={Palette.accent} />
                    </View>
                    <Text style={sch.emptyTitle}>Choose an appointment date</Text>
                    <Text style={sch.emptyText}>Select an available date to view time slots.</Text>
                  </View>
                ) : selectedDayAvailability?.status === 'full' ? (
                  <View style={sch.emptyState}>
                    <View style={sch.emptyIconWrap}>
                      <Ionicons name="calendar-outline" size={20} color="#EF4444" />
                    </View>
                    <Text style={sch.emptyTitle}>No times available</Text>
                    <Text style={sch.emptyText}>All appointment times for this date are booked.</Text>
                  </View>
                ) : selectedDayAvailability?.status === 'closed' ? (
                  <View style={sch.emptyState}>
                    <View style={sch.emptyIconWrap}>
                      <Ionicons
                        name="calendar-outline"
                        size={20}
                        color={selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED' ? '#EF4444' : '#94A3B8'}
                      />
                    </View>
                    <Text style={[
                      sch.emptyTitle,
                      selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED' && { color: '#EF4444' },
                    ]}>
                      {selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED'
                        ? 'Emergency closure'
                        : 'Date unavailable'}
                    </Text>
                    <Text style={sch.emptyText}>
                      {selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED'
                        ? EMERGENCY_CLOSURE_MESSAGE
                        : 'No appointment times are offered on this closed date.'}
                    </Text>
                  </View>
                ) : slotsLoading ? (
                  <View style={sch.emptyState}>
                    <ActivityIndicator size="small" color={Palette.accent} />
                    <Text style={sch.emptyTitle}>Checking availability…</Text>
                  </View>
                ) : slotStatuses.length === 0 ? (
                  <View style={sch.emptyState}>
                    <View style={sch.emptyIconWrap}>
                      <Ionicons name="calendar-outline" size={20} color="#94A3B8" />
                    </View>
                    <Text style={sch.emptyTitle}>No times available</Text>
                    <Text style={sch.emptyText}>Choose another available date to continue.</Text>
                  </View>
                ) : (
                  <Animated.View entering={FadeInDown.delay(80).duration(200)}>
                    <View style={s2.timeGrid}>
                      {slotStatuses.map(({ time: t, status }) => {
                        const isActive   = selectedTime === t;
                        const isFull     = status === 'FULL';
                        const isClosed   = status === 'CLOSED';
                        const isDisabled = isFull || isClosed;
                        const slotStatusLabel = isFull ? 'Booked' : isClosed ? 'Closed' : 'Available';
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => {
                              if (isDisabled) return;
                              setSelectedTime(t);
                              Haptics.selectionAsync();
                            }}
                            activeOpacity={isDisabled ? 1 : 0.85}
                            accessibilityRole="button"
                            accessibilityLabel={`${t}, ${slotStatusLabel}`}
                            accessibilityState={{ disabled: isDisabled, selected: isActive }}
                            style={[
                              s2.timePill,
                              isActive   && s2.timePillSelected,
                              isFull     && s2.timePillFull,
                              isClosed   && s2.timePillClosed,
                            ]}
                          >
                            {isActive ? (
                              <LinearGradient
                                colors={[Palette.accentDark, Palette.accent]}
                                start={{ x: 0, y: 0.5 }}
                                end={{ x: 1, y: 0.5 }}
                                style={s2.timePillGradient}
                              >
                                <Text style={s2.timeTextSelected}>{t}</Text>
                              </LinearGradient>
                            ) : (
                              <View style={s2.timePillContent}>
                                <Text style={[
                                  s2.timeText,
                                  isFull   && s2.timeTextFull,
                                  isClosed && s2.timeTextClosed,
                                ]}>{t}</Text>
                                {isFull   && <Text style={s2.timeStatusBooked}>Booked</Text>}
                                {isClosed && <Text style={s2.timeStatusClosed}>Closed</Text>}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}
              </View>

              {/* ── Notes ── */}
              <View style={sch.sectionCard}>
                <View style={sch.notesHeader}>
                  <Text style={sch.sectionLabel}>
                    NOTES <Text style={sch.optional}>(optional)</Text>
                  </Text>
                  <Text style={[sch.counter, notes.length > 180 && { color: '#EF4444' }]}>{notes.length}/200</Text>
                </View>
                <TextInput
                  style={sch.notesInput}
                  placeholder="Any special requests..."
                  placeholderTextColor="#71717A"
                  value={notes}
                  onChangeText={setNotes}
                  maxLength={200}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  accessibilityLabel="Optional booking notes"
                />
              </View>

              {/* Navigation — Schedule */}
              <View style={[ss.btnRow, sch.actionRow]}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={goBack}
                  style={[ss.outlineBtn, sch.backButton, { flex: 1 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Go back to booking details"
                >
                  <Text style={ss.outlineBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={!canProceedStep2}
                  onPress={goNext}
                  style={{ flex: 2 }}
                  accessibilityRole="button"
                  accessibilityLabel="Continue to booking review"
                  accessibilityState={{ disabled: !canProceedStep2 }}
                >
                  {canProceedStep2 ? (
                    <LinearGradient
                      colors={[Palette.accentDark, Palette.accent]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={ss.gradientBtn}
                    >
                      <Text style={sch.continueText}>Continue</Text>
                      <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
                    </LinearGradient>
                  ) : (
                    <View style={[ss.gradientBtn, sch.continueDisabled]}>
                      <Text style={sch.continueDisabledText}>Continue</Text>
                      <Ionicons name="chevron-forward" size={18} color="#71717A" />
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 3 — REVIEW BOOKING  (web Step 4 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 3 && (() => {
            const effectivePkg   = selectedPkg ? SPF_PACKAGES.find(p => p.key === selectedPkg) : null;
            const effectivePrice: number = effectivePkg ? (effectivePkg.prices[vehicleType] ?? 0) : (selectedService?.price ?? 0);
            const effectiveName  = selectedService?.name || effectivePkg?.label || '—';
            const RESERVATION_FEE = 500;
            const balance = Math.max(0, effectivePrice - RESERVATION_FEE);

            const formattedDate = formatIsoDateForDisplay(selectedDate, true);

            return (
              <Animated.View entering={FadeInDown.duration(200)} style={ss.stepWrap}>

                {/* Page heading */}
                <View style={rv.heading}>
                  <View style={rv.headingIcon}>
                    <Ionicons name="clipboard-outline" size={22} color="#fff" />
                  </View>
                  <View>
                    <Text style={rv.headingTitle}>Review Your Booking</Text>
                    <Text style={rv.headingSub}>Please confirm all details before proceeding</Text>
                  </View>
                </View>

                {/* ── CUSTOMER ── */}
                <View style={rv.section}>
                  <Text style={rv.sectionLabel}>CUSTOMER</Text>
                  <View style={rv.card}>
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="person-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Name</Text>
                      </View>
                      <Text style={rv.rowVal}>{displayCustomerName || '—'}</Text>
                    </View>
                    <View style={rv.divider} />
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="call-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Contact</Text>
                      </View>
                      <Text style={rv.rowVal}>{displayCustomerPhone || '—'}</Text>
                    </View>
                  </View>
                </View>

                {/* ── VEHICLE ── */}
                <View style={rv.section}>
                  <Text style={rv.sectionLabel}>VEHICLE</Text>
                  <View style={rv.card}>
                    <View style={rv.row}>
                      <Text style={rv.rowKey}>Brand &amp; Model</Text>
                      <Text style={rv.rowVal}>
                        {selectedVehicle ? `${selectedVehicle.make} ${selectedVehicle.model}`.trim() : '—'}
                      </Text>
                    </View>
                    <View style={rv.divider} />
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="color-palette-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Color</Text>
                      </View>
                      <Text style={rv.rowVal}>{selectedVehicle?.color || '—'}</Text>
                    </View>
                    <View style={rv.divider} />
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="card-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Plate</Text>
                      </View>
                      <Text style={rv.rowVal}>{selectedVehicle?.plateNumber?.toUpperCase() || '—'}</Text>
                    </View>
                  </View>
                </View>

                {/* ── SERVICE & SCHEDULE ── */}
                <View style={rv.section}>
                  <Text style={rv.sectionLabel}>SERVICE &amp; SCHEDULE</Text>
                  <View style={rv.card}>
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="shield-checkmark-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Service</Text>
                      </View>
                      <Text style={rv.rowVal} numberOfLines={2}>{effectiveName}</Text>
                    </View>
                    <View style={rv.divider} />
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="calendar-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Date</Text>
                      </View>
                      <Text style={rv.rowVal} numberOfLines={2}>{formattedDate}</Text>
                    </View>
                    <View style={rv.divider} />
                    <View style={rv.row}>
                      <View style={rv.rowLeft}>
                        <Ionicons name="time-outline" size={15} color="#9ca3af" />
                        <Text style={rv.rowKey}>Time</Text>
                      </View>
                      <Text style={rv.rowVal}>{selectedTime || '—'}</Text>
                    </View>
                    {notes.trim() !== '' && (
                      <>
                        <View style={rv.divider} />
                        <View style={[rv.row, { alignItems: 'flex-start' }]}>
                          <View style={[rv.rowLeft, { marginTop: 1 }]}>
                            <Ionicons name="document-text-outline" size={15} color="#9ca3af" />
                            <Text style={rv.rowKey}>Notes</Text>
                          </View>
                          <Text style={[rv.rowVal, { flex: 1, textAlign: 'right' }]} numberOfLines={4}>{notes}</Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>

                {/* ── TOTAL PRICE CARD ── */}
                <View style={rv.priceCard}>
                  {/* Total row */}
                  <View style={rv.priceTotalRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="pricetag-outline" size={16} color={PRIMARY} />
                      <Text style={rv.priceTotalLabel}>Total Service Price</Text>
                    </View>
                    <Text style={rv.priceTotalValue}>₱{effectivePrice.toLocaleString()}</Text>
                  </View>

                  <View style={rv.priceDivider} />

                  {/* GCash reservation fee */}
                  <View style={rv.priceRow}>
                    <View style={rv.priceRowLeft}>
                      <Ionicons name="phone-portrait-outline" size={15} color="#f97316" />
                      <View>
                        <Text style={[rv.priceRowTitle, { color: '#f97316' }]}>GCash Reservation Fee — Due Now</Text>
                        <Text style={rv.priceRowSub}>Fixed fee to secure your slot</Text>
                      </View>
                    </View>
                    <Text style={[rv.priceRowAmt, { color: '#f97316' }]}>₱{RESERVATION_FEE.toLocaleString()}</Text>
                  </View>

                  <View style={rv.priceDivider} />

                  {/* Balance */}
                  <View style={rv.priceRow}>
                    <View style={rv.priceRowLeft}>
                      <Ionicons name="storefront-outline" size={15} color="#22c55e" />
                      <View>
                        <Text style={[rv.priceRowTitle, { color: '#22c55e' }]}>Balance — Pay Onsite</Text>
                        <Text style={rv.priceRowSub}>Settle in full on your appointment day</Text>
                      </View>
                    </View>
                    <Text style={[rv.priceRowAmt, { color: '#22c55e' }]}>₱{balance.toLocaleString()}</Text>
                  </View>
                </View>

                {/* ── Notes (shown if filled, matching web) ── */}
                {notes.trim() !== '' && (
                  <View style={{ padding: 14, borderRadius: 12, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a' }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#92400e', marginBottom: 4 }}>Special Requests</Text>
                    <Text style={{ fontSize: 12, color: '#78350f', lineHeight: 18 }}>{notes}</Text>
                  </View>
                )}

                {/* Navigation — Review → Terms */}
                <View style={[ss.btnRow, { marginTop: 8 }]}>
                  <TouchableOpacity activeOpacity={0.85} onPress={goBack} style={[ss.outlineBtn, { flex: 1 }]}>
                    <Text style={ss.outlineBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    disabled={!canProceedStep3}
                    onPress={goNext}
                    style={{ flex: 2, opacity: canProceedStep3 ? 1 : 0.4 }}
                  >
                    <LinearGradient colors={[PRIMARY_CTR, PRIMARY]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={ss.gradientBtn}>
                      <Text style={ss.gradientBtnText}>Continue</Text>
                      <Ionicons name="arrow-forward" size={18} color={ON_PRIMARY} />
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
          })()}

          {/* ═══════════════════════════════════════════════════
              STEP 4 — TERMS & CONDITIONS  (web Step 5 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 4 && (
            <Animated.View entering={FadeInDown.duration(200)} style={ss.stepWrap}>
              <View style={ss.editorialHeader}>
                  <Text style={ss.editorialLabel}>STEP 5 OF 6</Text>
                <Text style={ss.editorialTitle}>Terms &amp;{'\n'}Conditions</Text>
                <Text style={ss.editorialSub}>Read and agree to proceed to payment.</Text>
              </View>

              <View>
                <Text style={tc.docTitle}>{BOOKING_TERMS_DOCUMENT_TITLE}</Text>
                <Text style={tc.intro}>{BOOKING_TERMS_INTRO}</Text>
                <Text style={tc.heading}>Full text (scroll to the end)</Text>
                <ScrollView
                  style={tc.scrollBox}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  onLayout={(e) => {
                    tcViewportHRef.current = e.nativeEvent.layout.height;
                  }}
                  onContentSizeChange={(_, contentHeight) => {
                    if (contentHeight <= tcViewportHRef.current + 12) setTcScrolledToBottom(true);
                  }}
                  onScroll={({ nativeEvent }) => {
                    const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                    if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 20) setTcScrolledToBottom(true);
                  }}
                  scrollEventThrottle={32}
                >
                  {BOOKING_TERMS_SECTIONS.map((sec) => (
                    <View key={sec.id} style={{ marginBottom: 14 }}>
                      <Text style={tc.sectionHeading}>{sec.title}</Text>
                      <Text style={tc.body}>{sec.body}</Text>
                    </View>
                  ))}
                  <View style={{ height: 8 }} />
                </ScrollView>
                {!tcScrolledToBottom && (
                  <Text style={tc.scrollHint}>Scroll to the bottom to enable the agreement checkbox.</Text>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={!tcScrolledToBottom}
                onPress={() => {
                  if (!tcScrolledToBottom) return;
                  setAgreedToTerms(!agreedToTerms);
                  Haptics.selectionAsync();
                }}
                style={[tc.checkRow, !tcScrolledToBottom && { opacity: 0.45 }, agreedToTerms && tc.checkRowActive]}
              >
                <View style={[tc.checkbox, agreedToTerms && tc.checkboxActive]}>
                  {agreedToTerms && <Ionicons name="checkmark" size={14} color={ON_PRIMARY} />}
                </View>
                <Text style={[tc.checkText, agreedToTerms && { color: '#fff' }]}>
                  I have read and agree to the{' '}
                  <Text style={{ color: PRIMARY, fontWeight: '600' }}>Terms and Conditions</Text>
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}> *</Text>
                </Text>
              </TouchableOpacity>

              <View style={ss.btnRow}>
                <TouchableOpacity activeOpacity={0.85} onPress={goBack} style={[ss.outlineBtn, { flex: 1 }]}>
                  <Text style={ss.outlineBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={!canProceedStep4}
                  onPress={goNext}
                  style={{ flex: 2, opacity: canProceedStep4 ? 1 : 0.4 }}
                >
                  <LinearGradient colors={[PRIMARY_CTR, PRIMARY]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={ss.gradientBtn}>
                    <Text style={ss.gradientBtnText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={18} color={ON_PRIMARY} />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 5 — GCASH PAYMENT  (web Step 6 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 5 && (() => {
            const effectivePkg   = selectedPkg ? SPF_PACKAGES.find(p => p.key === selectedPkg) : null;
            const effectivePrice: number = effectivePkg ? (effectivePkg.prices[vehicleType] ?? 0) : (selectedService?.price ?? 0);
            const RESERVATION_FEE = 500;
            const balance = Math.max(0, effectivePrice - RESERVATION_FEE);
            const canSubmit = !!downpaymentProof && !isSubmitting && canConfirmBooking;
            return (
              <Animated.View entering={FadeInDown.duration(200)} style={ss.stepWrap}>
                <View style={ss.editorialHeader}>
                  <Text style={ss.editorialLabel}>STEP 6 OF 6</Text>
                  <Text style={ss.editorialTitle}>GCash{'\n'}Payment</Text>
                  <Text style={ss.editorialSub}>Scan the QR and upload your receipt to confirm your booking.</Text>
                </View>

                {/* GCash banner */}
                <View style={pay.banner}>
                  <View style={pay.bannerTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                      <View>
                        <Text style={pay.bannerTitle}>Send via GCash Now</Text>
                        <Text style={pay.bannerSub}>Fixed reservation fee to confirm your slot</Text>
                      </View>
                    </View>
                    <Text style={pay.bannerAmt}>₱{RESERVATION_FEE.toLocaleString()}</Text>
                  </View>
                  <View style={pay.bannerBalance}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="storefront-outline" size={13} color="#92400e" />
                      <Text style={pay.bannerBalLabel}>Remaining balance due onsite</Text>
                    </View>
                    <Text style={pay.bannerBalAmt}>₱{balance.toLocaleString()}</Text>
                  </View>
                </View>

                {/* QR Code */}
                <View style={pay.qrSection}>
                  <Text style={pay.qrLabel}>SCAN TO PAY VIA GCASH</Text>
                  <View style={pay.qrFrame}>
                    <Image source={require('../../../assets/gcash-qr.png')} style={pay.qrImage} resizeMode="contain" />
                  </View>
                  <Text style={pay.qrHint}>Screenshot the QR or scan directly from GCash app</Text>
                </View>

                {/* Upload GCash Receipt */}
                <View>
                  <View style={pay.uploadHeader}>
                    <Text style={pay.uploadTitle}>UPLOAD GCASH RECEIPT</Text>
                    {!downpaymentProof
                      ? <Text style={pay.uploadRequired}>Required</Text>
                      : <Text style={pay.uploadDone}>✓ Uploaded</Text>}
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[pay.uploadBox, downpaymentProof && pay.uploadBoxDone]}
                    onPress={async () => {
                      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.7, base64: true });
                      if (!result.canceled && result.assets[0]?.base64) {
                        const mime = result.assets[0].mimeType || 'image/jpeg';
                        setDownpaymentProof(`data:${mime};base64,${result.assets[0].base64}`);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      }
                    }}
                  >
                    {downpaymentProof ? (
                      <>
                        <Image source={{ uri: downpaymentProof }} style={pay.proofThumb} resizeMode="cover" />
                        <View style={pay.proofOverlay}>
                          <Ionicons name="checkmark-circle" size={20} color="#16a34a" />
                          <Text style={pay.proofOverlayText}>Tap to Change</Text>
                        </View>
                      </>
                    ) : (
                      <View style={pay.uploadInner}>
                        <View style={pay.uploadIcon}>
                          <Ionicons name="cloud-upload-outline" size={22} color="#9ca3af" />
                        </View>
                        <Text style={pay.uploadPrompt}>Tap to upload GCash receipt</Text>
                        <Text style={pay.uploadPromptSub}>JPG or PNG photo of your transaction</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={pay.infoBox}>
                  <Ionicons name="information-circle-outline" size={15} color="#0284c7" style={{ marginTop: 1, flexShrink: 0 }} />
                  <Text style={pay.infoText}>
                    Your booking will be <Text style={{ fontWeight: '700' }}>pending confirmation</Text> until our team verifies your payment. The remaining balance is collected{' '}
                    <Text style={{ fontWeight: '700' }}>on the day of your appointment</Text> at our shop.
                  </Text>
                </View>

                <View style={ss.btnRow}>
                  <TouchableOpacity activeOpacity={0.85} onPress={goBack} disabled={isSubmitting} style={[ss.outlineBtn, { flex: 1 }]}>
                    <Text style={ss.outlineBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    disabled={!canSubmit}
                    onPress={handleConfirm}
                    style={{ flex: 2, opacity: canSubmit ? 1 : 0.4 }}
                  >
                    <LinearGradient colors={[PRIMARY_CTR, PRIMARY]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={ss.gradientBtn}>
                      {isSubmitting
                        ? <ActivityIndicator size="small" color={ON_PRIMARY} />
                        : <><Ionicons name="checkmark-circle" size={18} color={ON_PRIMARY} /><Text style={ss.gradientBtnText}>Confirm Booking</Text></>
                      }
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            );
          })()}

        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── "Why Advanced?" Bottom Sheet ─────────────────────────── */}
      <Modal visible={whyOpen} transparent animationType="slide" onRequestClose={() => setWhyOpen(false)}>
        <TouchableOpacity style={why.backdrop} activeOpacity={1} onPress={() => setWhyOpen(false)} />
        <View style={why.sheet}>
          <View style={why.handle} />
          <Text style={why.title}>Why 78% choose SPF 89</Text>
          <Text style={why.sub}>The Advanced package hits the sweet spot on every dimension</Text>
          <View style={why.bullets}>
            {[
              { icon: 'shield-checkmark-outline', heading: 'Best balance of cost vs protection', body: '5-year graphene coating at a price point that makes financial sense for most vehicle owners.' },
              { icon: 'repeat-outline',           heading: 'Free annual reboost included', body: 'One Reboost/Maintenance visit (₱1,500 value) keeps your coating performing like new — at no extra cost.' },
              { icon: 'trending-up-outline',      heading: 'Highest resale value boost', body: 'Professionally coated cars retain 8–12% more resale value than uncoated — this package is the minimum threshold.' },
            ].map((b, i) => (
              <View key={i} style={why.bullet}>
                <View style={why.bulletIcon}>
                  <Ionicons name={b.icon as any} size={18} color="#F97316" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={why.bulletHeading}>{b.heading}</Text>
                  <Text style={why.bulletBody}>{b.body}</Text>
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity activeOpacity={0.85} onPress={() => setWhyOpen(false)} style={why.closeBtn}>
            <Text style={why.closeBtnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  /* ── Vertical Pricing Cards (mirrors website) ── */
  pricingCard: {
    borderRadius: 24,
    backgroundColor: SURFACE_MID,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
    }),
  },
  pricingAccentBar: {
    height: 4,
    width: '100%',
  },
  pricingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  pricingName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.01 * 18,
  },
  pricingDuration: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '400',
  },
  pricingCheckBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  pricingCheckEmpty: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
    marginTop: 2,
    flexShrink: 0,
  },
  pricingPriceRow: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 3,
  },
  pricingPriceLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  pricingPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.02 * 32,
  },
  pricingPriceSub: {
    fontSize: 10,
    color: MUTED,
    fontStyle: 'italic',
  },
  pricingDivider: {
    height: 1,
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  featureText: {
    fontSize: 13,
    color: DIM_TEXT,
    lineHeight: 18,
    flex: 1,
  },

  /* ── Vehicle Type Chips ── */
  vehicleChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: SURFACE_MID,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  vehicleChipActive: {
    backgroundColor: PRIMARY,
    borderColor: PRIMARY,
    ...Platform.select({
      ios: {
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
    }),
  },
  vehicleChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
  },
  vehicleChipTextActive: {
    color: ON_PRIMARY,
    fontWeight: '700',
  },
  vehicleTypeCaption: {
    fontSize: 10,
    color: MUTED,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
    letterSpacing: 0.4,
  },

  /* ── Package Badge Row ── */
  pkgBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  pkgBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    flex: 1,
  },
  popularPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  popularPillText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },

  /* ── Price — original + discount ── */
  priceOriginalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  originalPriceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  originalPriceText: {
    fontSize: 11,
    color: MUTED,
    textDecorationLine: 'line-through',
  },
  discountPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  discountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#EF4444',
    letterSpacing: 0.4,
  },
  tintBundleText: {
    fontSize: 11,
    fontWeight: '600',
    color: PRIMARY,
    marginTop: 4,
    fontStyle: 'italic',
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
    width: '47.8%',
    minHeight: 48,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: SURFACE_HIGH,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
  },
  timePillSelected: {
    borderColor: 'rgba(255,107,53,0.75)',
    ...Platform.select({
      ios: {
        shadowColor: Palette.accent,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
      },
      android: { elevation: 4 },
    }),
  },
  timePillGradient: {
    minHeight: 48,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  timePillContent: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E4E4E7',
    textAlign: 'center',
  },
  timeTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  timeTextFull: { color: '#F87171' },
  timeTextClosed: { color: '#A1A1AA' },
  timeStatusBooked: { fontSize: 9, color: '#F87171', fontWeight: '700' },
  timeStatusClosed: { fontSize: 9, color: '#A1A1AA', fontWeight: '600' },

  /* ── Time slot status variants ── */
  timePillFull: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.20)',
  },
  timePillClosed: {
    backgroundColor: 'rgba(148,163,184,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.12)',
    opacity: 0.6,
  },

  /* ── "Select a date" empty state ── */
  timeEmptyState: {
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: SURFACE_MID,
    borderRadius: 16,
  },
  timeEmptyText: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* ── Notes Card ── */
  notesCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 24,
    padding: 18,
  },

  /* legacy spacer used below features list */
  _featureSpacer: { height: 20 },
});

/** Step 2 — Review & Payment Kinetic Gallery styles */
/** Terms & Conditions step */
const tc = StyleSheet.create({
  docTitle: { fontSize: 17, fontWeight: '700', color: SECONDARY, marginBottom: 8, letterSpacing: -0.2 },
  intro: { fontSize: 13, color: DIM_TEXT, lineHeight: 20, marginBottom: 12 },
  heading: { fontSize: 10, fontWeight: '700', color: DIM_TEXT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  scrollBox: { maxHeight: 240, borderWidth: 1, borderColor: GHOST, borderRadius: 10, padding: 14, backgroundColor: SURFACE_HIGH },
  body:        { fontSize: 12, color: SECONDARY, lineHeight: 20, marginBottom: 0 },
  sectionHeading: { fontSize: 12, fontWeight: '700', color: SECONDARY, marginBottom: 6 },
  sectionTitle: { fontSize: 10, fontWeight: '700', color: PRIMARY, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4, marginBottom: 4 },
  scrollHint: { fontSize: 11, fontWeight: '600', color: '#ea580c', marginTop: 6, textAlign: 'center' },
  checkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: SURFACE_MID, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  checkRowActive: { backgroundColor: 'rgba(255,183,125,0.06)', borderColor: 'rgba(255,183,125,0.3)' },
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: SURFACE_HIGH, alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  checkboxActive: { backgroundColor: PRIMARY },
  checkText: { flex: 1, color: DIM_TEXT, fontSize: 13, lineHeight: 20 },
});

/** GCash Payment step */
const pay = StyleSheet.create({
  banner: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: `${PRIMARY}50` },
  bannerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: PRIMARY_CTR,
  },
  bannerTitle: { fontSize: 12, color: ON_PRIMARY, fontWeight: '700', opacity: 0.9 },
  bannerSub:   { fontSize: 10, color: ON_PRIMARY, marginTop: 2, opacity: 0.7 },
  bannerAmt:   { fontSize: 28, fontWeight: '900', color: ON_PRIMARY, letterSpacing: -0.5 },
  bannerBalance: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: SURFACE_HIGH,
  },
  bannerBalLabel: { fontSize: 12, color: DIM_TEXT, fontWeight: '600' },
  bannerBalAmt:   { fontSize: 14, fontWeight: '700', color: PRIMARY },

  qrSection: { alignItems: 'center' },
  qrLabel:   { fontSize: 10, fontWeight: '700', color: DIM_TEXT, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 },
  qrFrame: {
    padding: 12, backgroundColor: '#fff', borderRadius: 16,
    shadowColor: PRIMARY, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  qrImage: { width: 180, height: 180 },
  qrHint:  { fontSize: 11, color: MUTED, marginTop: 10, textAlign: 'center' },

  uploadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  uploadTitle:    { fontSize: 11, fontWeight: '700', color: SECONDARY, textTransform: 'uppercase', letterSpacing: 0.5 },
  uploadRequired: { fontSize: 10, fontWeight: '600', color: '#ef4444' },
  uploadDone:     { fontSize: 10, fontWeight: '600', color: '#4ade80' },
  uploadBox: {
    borderWidth: 2, borderStyle: 'dashed', borderColor: GHOST,
    borderRadius: 14, minHeight: 120,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE_HIGH, overflow: 'hidden',
  },
  uploadBoxDone: { borderColor: 'rgba(74,222,128,0.45)', backgroundColor: 'rgba(74,222,128,0.06)' },
  uploadInner: { alignItems: 'center', gap: 6 },
  uploadIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: SURFACE_TOP, alignItems: 'center', justifyContent: 'center' },
  uploadPrompt:    { fontSize: 13, fontWeight: '600', color: SECONDARY },
  uploadPromptSub: { fontSize: 11, color: MUTED },
  proofThumb: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  proofOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(13,13,18,0.82)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: GHOST,
  },
  proofOverlayText: { fontSize: 12, fontWeight: '600', color: SECONDARY },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(133,207,255,0.06)', borderWidth: 1, borderColor: 'rgba(133,207,255,0.22)',
  },
  infoText: { flex: 1, fontSize: 12, color: TERTIARY, lineHeight: 19 },
});

/** Review Booking step */
const rv = StyleSheet.create({
  heading: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
    marginBottom: 20,
  },
  headingIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: SURFACE_HIGH,
    alignItems: 'center', justifyContent: 'center',
  },
  headingTitle: { fontSize: 18, fontWeight: '700', color: '#FFFFFF', lineHeight: 22 },
  headingSub:   { fontSize: 12, color: DIM_TEXT, marginTop: 2, lineHeight: 17 },

  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: DIM_TEXT,
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8, marginLeft: 2,
  },
  card: {
    backgroundColor: SURFACE_HIGH,
    borderRadius: 14,
    borderWidth: 1, borderColor: GHOST,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowKey:  { fontSize: 13, color: DIM_TEXT, fontWeight: '500' },
  rowVal:  { fontSize: 13, color: SECONDARY, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: GHOST, marginHorizontal: 14 },

  /* Price breakdown card */
  priceCard: {
    backgroundColor: SURFACE_MID,
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: `${PRIMARY}30`,
    marginBottom: 16,
  },
  priceTotalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  priceTotalLabel: { fontSize: 14, fontWeight: '600', color: '#f8fafc' },
  priceTotalValue: { fontSize: 22, fontWeight: '900', color: '#ffffff', letterSpacing: -0.5 },
  priceDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.10)', marginHorizontal: 16 },
  priceRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  priceRowLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  priceRowTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  priceRowSub:   { fontSize: 11, color: '#64748b', marginTop: 2 },
  priceRowAmt:   { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
});

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

/** Step 0 — Vehicle selection glassmorphism */
/** Step 1 — Details screen styles */
const dt = StyleSheet.create({
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '700', color: MUTED, letterSpacing: 0.8, marginBottom: 4 },
  readOnlyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: SURFACE_HIGH,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: GHOST,
  },
  readOnlyValue: { flex: 1, fontSize: 14, color: SECONDARY, fontWeight: '500' },
  autoFillBadge: { backgroundColor: 'rgba(74,222,128,0.08)', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  autoFillText: { fontSize: 10, color: '#4ade80', fontWeight: '600' },
  hintText: { fontSize: 11, color: MUTED, marginTop: 4, paddingHorizontal: 2 },
  errorText: { fontSize: 11, color: '#ef4444', marginTop: 3 },
  summaryCard: {
    backgroundColor: SURFACE_HIGH,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GHOST,
    overflow: 'hidden',
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  summaryKey: { fontSize: 13, color: DIM_TEXT },
  summaryVal: { fontSize: 14, color: SECONDARY, fontWeight: '600', textAlign: 'right', flex: 1, marginLeft: 16 },
  summaryDivider: { height: 1, backgroundColor: GHOST, marginHorizontal: 16 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${PRIMARY}12`,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: `${PRIMARY}30`,
  },
  serviceName: { flex: 1, fontSize: 14, color: '#FFFFFF', fontWeight: '600' },
  servicePrice: { fontSize: 16, color: PRIMARY, fontWeight: '700' },
  gridCell: {
    backgroundColor: SURFACE_HIGH,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GHOST,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  gridLabel: { fontSize: 9, fontWeight: '700', color: MUTED, letterSpacing: 0.8 },
  gridValueRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  gridValue: { flex: 1, fontSize: 13, fontWeight: '600', color: SECONDARY },
});

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

// ── Schedule step styles (mirrors web layout) ──────────────────────────────
const sch = StyleSheet.create({
  scheduleWrap: {
    gap: 24,
  },
  sectionCard: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: '#E4E4E7',
  },
  dateSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    backgroundColor: SURFACE_HIGH,
    padding: 12,
  },
  dateSummaryBlock: {
    flex: 1,
    gap: 4,
  },
  dateSummaryCapacityBlock: {
    alignItems: 'flex-end',
  },
  dateSummaryLabel: {
    color: '#8B8B94',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  dateSummaryDate: {
    color: '#F4F4F5',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  dateSummaryCapacity: {
    color: '#22c55e',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'right',
  },
  dateSummaryCapacityFull: {
    color: '#EF4444',
  },
  dateSummaryCapacityClosed: {
    color: MUTED,
  },
  dateSummaryMeta: {
    color: '#8B8B94',
    fontSize: 10,
    fontWeight: '500',
  },
  timeSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  timeSectionLabel: {
    color: '#E4E4E7',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  timeOptionCount: {
    flex: 1,
    color: '#A1A1AA',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'right',
  },
  scheduleMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,53,0.22)',
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,53,0.07)',
  },
  scheduleMessageText: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 12,
    lineHeight: 18,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    backgroundColor: SURFACE_HIGH,
  },
  emptyIconWrap: {
    width: 36,
    height: 36,
    marginBottom: 2,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,53,0.08)',
  },
  emptyTitle: {
    fontSize: 13,
    color: '#E4E4E7',
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 17,
    color: '#A1A1AA',
    textAlign: 'center',
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  optional: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0,
    textTransform: 'none',
    color: '#A1A1AA',
  },
  counter: {
    fontSize: 11,
    color: '#A1A1AA',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 14,
    lineHeight: 20,
    color: '#F4F4F5',
    backgroundColor: SURFACE_HIGH,
    minHeight: 128,
    textAlignVertical: 'top',
  },
  actionRow: {
    marginTop: 0,
  },
  backButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: SURFACE,
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
  continueDisabled: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: SURFACE_HIGH,
    opacity: 0.78,
  },
  continueDisabledText: {
    color: '#71717A',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.15,
  },
});

// ── Service step (Step 0) — mirrors web's Choose Service card style ───────
// ── Step 0 (Choose Service) — mobile-native dark design language ─────────────
const svc = StyleSheet.create({
  // "No vehicles" amber notice (dark-theme tonal amber)
  noVehicleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: `${PRIMARY}18`,
    borderWidth: 1,
    borderColor: `${PRIMARY}40`,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noVehicleText: {
    fontSize: 12,
    color: PRIMARY,
    fontWeight: '500',
    flex: 1,
    lineHeight: 18,
  },
  // ── Section header with numbered badge ──
  stepSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  stepNumBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: `${PRIMARY_CTR}35`,
    borderWidth: 1,
    borderColor: `${PRIMARY}60`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '800',
    color: PRIMARY,
  },
  stepSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: SECONDARY,
    letterSpacing: 0.3,
    flex: 1,
  },
  pricingForLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: DIM_TEXT,
  },
  // ── Full-width vehicle row card ──
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE_HIGH,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: GHOST,
  },
  vehicleRowActive: {
    backgroundColor: `${PRIMARY_CTR}18`,
    borderColor: `${PRIMARY}70`,
    ...Platform.select({
      ios: { shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${PRIMARY}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleIconWrapActive: {
    backgroundColor: PRIMARY_CTR,
  },
  vehicleRowName: {
    fontSize: 15,
    fontWeight: '700',
    color: SECONDARY,
    letterSpacing: -0.2,
  },
  vehicleRowType: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    marginTop: 2,
  },
  // Radio button
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: MUTED,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOuterActive: {
    borderColor: PRIMARY,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: PRIMARY,
  },
  // Add another vehicle — subtle secondary row
  addVehicleSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignSelf: 'flex-start',
  },
  addVehicleSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY,
  },
  // Locked package placeholder
  packageLockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: SURFACE_HIGH,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderWidth: 1,
    borderColor: GHOST,
    borderStyle: 'dashed',
  },
  packageLockedText: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
  },
  // Package card check badge placeholder (unselected)
  checkBadgeEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: GHOST,
  },
  // Add vehicle arrow badge
  addVehicleArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PRIMARY_CTR,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  // Empty state — prominent add-vehicle card when no vehicles registered
  addVehicleEmptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: `${PRIMARY_CTR}18`,
    borderWidth: 1,
    borderColor: `${PRIMARY}50`,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  addVehicleIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: `${PRIMARY_CTR}25`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addVehicleEmptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: PRIMARY,
    marginBottom: 3,
  },
  addVehicleEmptySub: {
    fontSize: 12,
    color: DIM_TEXT,
    lineHeight: 17,
  },
  // Vehicle selector chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: SURFACE_HIGH,
    borderWidth: 1,
    borderColor: GHOST,
  },
  chipActive: {
    backgroundColor: `${PRIMARY_CTR}30`,
    borderColor: PRIMARY,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: SECONDARY,
  },
  chipTextActive: {
    color: PRIMARY,
  },
  chipBadge: {
    backgroundColor: SURFACE_TOP,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipBadgeActive: {
    backgroundColor: `${PRIMARY_CTR}40`,
  },
  chipBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: MUTED,
  },
  // Package card — dark tonal surface, mobile depth
  card: {
    backgroundColor: SURFACE_HIGH,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: GHOST,
    overflow: 'hidden',
    position: 'relative',
  },
  cardSelected: {
    borderColor: `${PRIMARY}80`,
    backgroundColor: `${PRIMARY_CTR}15`,
    ...Platform.select({
      ios: { shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 12 },
      android: { elevation: 4 },
    }),
  },
  selectedBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: PRIMARY,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 21,
  },
  cardDuration: {
    fontSize: 12,
    fontWeight: '400',
    color: DIM_TEXT,
    marginTop: 3,
  },
  cardPrice: {
    fontSize: 17,
    fontWeight: '900',
    color: SECONDARY,
    letterSpacing: -0.5,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDivider: {
    height: 1,
    backgroundColor: GHOST,
    marginVertical: 14,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: MUTED,
    marginTop: 6,
    flexShrink: 0,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '400',
    color: SECONDARY,
    flex: 1,
    lineHeight: 19,
  },
});

// ── Package cards — world-class redesign ──────────────────────────────────────
const pkgCard = StyleSheet.create({
  base: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#111111',
    padding: 20,
    overflow: 'hidden',
  },
  hero: {
    borderColor: 'rgba(249,115,22,0.28)',
    paddingVertical: 24,
    paddingHorizontal: 22,
    ...Platform.select({
      ios: { shadowColor: '#F97316', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.18, shadowRadius: 24 },
      android: { elevation: 8 },
    }),
  },
  selected: {
    borderColor: 'rgba(249,115,22,0.6)',
  },
  heroSelected: {
    borderColor: '#F97316',
    ...Platform.select({
      ios: { shadowOpacity: 0.35, shadowRadius: 32 },
    }),
  },
  tier: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 26,
  },
  price: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -1.5,
    lineHeight: 38,
  },
  tagline: {
    fontSize: 12,
    fontStyle: 'italic',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 17,
  },
  description: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
    marginTop: 6,
  },
  socialProof: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(249,115,22,0.75)',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 14,
  },
  feature: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 26,
  },
  whyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  whyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F97316',
  },
  // Animated checkmark circle
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkCircleActive: {
    backgroundColor: '#F97316',
    borderColor: '#F97316',
  },
});

// ── "Why Advanced?" Bottom Sheet ─────────────────────────────────────────────
const why = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: 'rgba(249,115,22,0.2)',
    gap: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: -8,
    lineHeight: 19,
  },
  bullets: { gap: 18 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  bulletIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(249,115,22,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  bulletHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  bulletBody: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    lineHeight: 18,
  },
  closeBtn: {
    backgroundColor: '#F97316',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0A0A0A',
    letterSpacing: 0.3,
  },
});
