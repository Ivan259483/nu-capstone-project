/**
 * Book Screen — Premium 6-Step Service Booking Wizard
 * ═══════════════════════════════════════════════════════
 * "The Kinetic Gallery" Design System
 * 
 * Obsidian surfaces · Warm amber accents · Editorial typography
 * Glassmorphism · Tonal depth · No hard borders
 * 
 * Step 0: Service · Step 1: Details · Step 2: Schedule
 * Step 3: Review · Step 4: Terms · Step 5: Payment
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
  Keyboard,
  type KeyboardEvent,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Modal,
  AppState,
  BackHandler,
  Animated as RNAnimated,
  PanResponder,
  type LayoutChangeEvent,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeInRight,
  FadeOutDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// expo-blur available if needed for future glassmorphism enhancements
import { useAuth } from '@/context/AuthContext';
import { apiClient, getApiErrorMessage, invalidateCache } from '@/services/api/client';
import { bookingService } from '@/services/api/bookingService';
import {
  getPackageKeyFromServiceName,
  serviceService,
} from '@/services/api/serviceService';
import { vehicleService } from '@/services/api/vehicleService';
import { getSharedSocket } from '@/hooks/useRealtimeSync';
import type { ServiceOption, Vehicle } from '@/services/api/types';
import { Palette } from '@/constants/theme';
import { Toast } from '@/components/ui/PremiumToast';
import AddVehicleModal from '@/components/booking/AddVehicleModal';
import {
  bookingDraftStorage,
  type BookingDraftV1,
} from '@/services/storage/bookingDraftStorage';
import {
  BOOKING_TERMS_DOCUMENT_TITLE,
  BOOKING_TERMS_INTRO,
  BOOKING_TERMS_SECTIONS,
} from '@/constants/bookingTerms';
import type { VehicleTypeKey } from '@/constants/spfPricing';
import {
  PAYMENT_PROOF_PICKER_OPTIONS,
  paymentProofDataUrlFromAsset,
} from '@/utils/payment-proof-image';

// ─── Kinetic Gallery Design Tokens ───────────────────────────────────────────

// Surface tiers aligned exactly with global theme.ts colors for UI consistency
const SURFACE_LOW    = '#040405';   // surface_container_lowest
const SURFACE        = '#0D0D12';   // base surface (theme.dark.card)
const SURFACE_MID    = '#0D0D12';   // surface_container
const SURFACE_HIGH   = '#16161D';   // surface_container_high (theme.dark.cardAlt)
const SURFACE_TOP    = '#27272A';   // surface_container_highest (theme.dark.border)

// Brand accents (warm amber — used sparingly)
const PRIMARY        = '#FFB77D';   // primary
const PRIMARY_CTR    = '#FF8C00';   // primary_container
const ON_PRIMARY     = '#4D2600';   // on_primary (dark text on accent)

// Functional tones
const SECONDARY      = '#C6C6C7';   // secondary text
const MUTED          = '#555555';   // muted elements
const DIM_TEXT       = '#777777';   // dim body text
const GHOST          = 'rgba(255,255,255,0.08)'; // ghost border

const VEHICLE_OPTIONS: { key: VehicleTypeKey; label: string; icon: string }[] = [
  { key: 'hatchback', label: 'Hatchback',       icon: 'car-outline' },
  { key: 'sedan',     label: 'Sedan',            icon: 'car-sport-outline' },
  { key: 'midsized',  label: 'Midsized',         icon: 'car-sport-outline' },
  { key: 'suv',       label: 'SUV',              icon: 'car-outline' },
  { key: 'pickup',    label: 'Pick Up',          icon: 'car-outline' },
  { key: 'largesuv',  label: 'Large SUV / Van',  icon: 'bus-outline' },
  { key: 'highend',   label: 'High-end Sedan',   icon: 'diamond-outline' },
];

const STEP_LABELS = ['Service', 'Details', 'Schedule', 'Review', 'Terms', 'Payment'];

type BookingPackagePrice =
  | { status: 'available'; value: number }
  | { status: 'unavailable'; value: null }
  | { status: 'error'; value: null };

type BookingCatalogPackage = {
  key: string;
  service: ServiceOption;
  name: string;
  tier: string;
  badge: string | null;
  badgeColor: string;
  protection: string | null;
  estimatedDuration: string | null;
  tagline: string | null;
  description: string | null;
  features: string[];
  fullInclusions: PackageInclusion[];
  ppfCoverage: string[];
  tintIncluded: boolean;
  tintDetails: string | null;
  undercoatingIncluded: boolean;
  undercoatingDetails: string | null;
  undercoatingSavingsLabel: string | null;
  originalPrice: number | null;
  bundlePrice: number | null;
  bundleLabel: string | null;
  promotionPercent: number | null;
  price: BookingPackagePrice;
};

type PackageInclusion = {
  group: string;
  title: string;
  detail?: string | null;
  savingsLabel?: string | null;
};

type PackageFeatureParts = {
  title: string;
  detail?: string;
  savings?: string;
};

/**
 * Turns the existing package feature strings into presentation-only sections.
 * Separates backend feature copy into presentation-only sections without
 * changing its wording.
 */
const getPackageFeatureParts = (feature: string): PackageFeatureParts => {
  const savingsMatch = feature.match(/\(save\s+(₱[\d,]+)\)/i);
  let content = feature
    .replace(/\(save\s+₱[\d,]+\)/i, '')
    .replace(/^FREE\s+/i, '')
    .trim();

  const colonIndex = content.indexOf(':');
  if (colonIndex >= 0) {
    return {
      title: content.slice(0, colonIndex).trim(),
      detail: content.slice(colonIndex + 1).trim(),
      savings: savingsMatch?.[1],
    };
  }

  const detailMatches = [...content.matchAll(/\(([^)]+)\)/g)].map((match) => match[1].trim());
  if (detailMatches.length > 0) {
    content = content.replace(/\s*\([^)]+\)/g, '').trim();
  }

  return {
    title: content,
    detail: detailMatches.length > 0 ? detailMatches.join(' · ') : undefined,
    savings: savingsMatch?.[1],
  };
};

const normalizeProtectionLabel = (value?: string | null): string | null => {
  const label = String(value || '').trim();
  if (!label) return null;
  const yearsMatch = label.match(/^(\d+)\s+years?(?:\s+protection)?$/i);
  if (yearsMatch) return `${yearsMatch[1]}-Year Protection`;
  if (/protection/i.test(label)) return label;
  return label;
};

const normalizeServiceDurationLabel = (value?: string | null): string | null => {
  const label = String(value || '').trim();
  if (!label) return null;
  return label
    .replace(/(\d)\s*-\s*(\d)/g, '$1–$2')
    .replace(/\bhours?\b/gi, 'hr');
};

const getPhilippineMobileDigits = (value?: string | null): string | null => {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^639\d{9}$/.test(digits)) return digits.slice(2);
  if (/^09\d{9}$/.test(digits)) return digits.slice(1);
  if (/^9\d{9}$/.test(digits)) return digits;
  return null;
};

const isValidPhilippineMobile = (value?: string | null): boolean =>
  getPhilippineMobileDigits(value) !== null;

const formatPhilippineMobile = (value?: string | null): string => {
  const localDigits = getPhilippineMobileDigits(value);
  if (!localDigits) return String(value || '').trim() || '—';
  return `+63 ${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)} ${localDigits.slice(6)}`;
};

const getPackageDisplayName = (name: string): string =>
  name.replace(/\s+ALL[-\s]?IN\s*$/i, '').trim();

const getPublishedOptionalPrice = (
  service: ServiceOption,
  vehicleType: VehicleTypeKey,
  field: 'original' | 'addon',
): number | null => {
  const apiKey = vehicleType === 'largesuv' ? 'largeSuv' : vehicleType;
  const raw = service.pricing?.[apiKey]?.[field];
  if (raw === undefined || raw === null || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
    return null;
  }
  return Number(raw);
};

// Maps a garage vehicle type to the public service pricing key.
const getVehiclePriceKey = (type: string): VehicleTypeKey => {
  const map: Record<string, VehicleTypeKey> = {
    'hatchback': 'hatchback', 'sedan': 'sedan', 'midsized': 'midsized',
    'suv': 'suv', 'pick up': 'pickup', 'pickup': 'pickup',
    'large suv / van': 'largesuv', 'large suv': 'largesuv', 'van': 'largesuv',
    'highend': 'highend', 'highend sedan': 'highend', 'high-end sedan': 'highend',
  };
  return map[type?.toLowerCase()] || 'hatchback';
};

const getPackageBadgeColor = (service: ServiceOption): string => {
  const badge = String(service.catalogCard?.badge || '').toLowerCase();
  if (service.catalogCard?.popular || /recommend|popular/.test(badge)) return '#22C55E';
  if (/all[-\s]?in|flagship/.test(badge)) return '#C9AF83';
  if (/promo|offer|off|sale|save/.test(badge)) return '#F59E0B';
  if (/premium/.test(badge)) return '#A1A1AA';
  return '#A1A1AA';
};

const getVisiblePackageBadge = (pkg: BookingCatalogPackage): string | null => {
  if (!pkg.badge) return null;
  const promotionBadge = /special|promo|offer|off|sale|save/i.test(pkg.badge);
  if (promotionBadge && pkg.promotionPercent === null) return null;
  return pkg.badge;
};

const getPublishedPriceState = (
  service: ServiceOption,
  vehicleType: VehicleTypeKey,
): BookingPackagePrice => {
  const apiKey = vehicleType === 'largesuv' ? 'largeSuv' : vehicleType;
  const richEntry = service.pricing?.[apiKey];
  const hasRichPrice = !!richEntry && Object.prototype.hasOwnProperty.call(richEntry, 'base');
  const legacyPrices = service.prices;
  const hasLegacyPrice = !!legacyPrices && (
    Object.prototype.hasOwnProperty.call(legacyPrices, vehicleType)
    || Object.prototype.hasOwnProperty.call(legacyPrices, apiKey)
  );
  const hasHatchbackBase = vehicleType === 'hatchback' && service.basePrice !== undefined;
  const raw = hasRichPrice
    ? richEntry?.base
    : hasLegacyPrice
      ? legacyPrices?.[vehicleType] ?? legacyPrices?.[apiKey]
      : hasHatchbackBase
        ? service.basePrice
        : undefined;

  if (raw === null) return { status: 'unavailable', value: null };
  if (raw === undefined || !Number.isFinite(Number(raw)) || Number(raw) < 0) {
    return { status: 'error', value: null };
  }
  return { status: 'available', value: Number(raw) };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Month Calendar logic is encapsulated below

// ─── Sub-Components ───────────────────────────────────────────────────────────

/** Focused booking chrome shared by every step. */
function BookingWizardHeader({
  current,
  topInset,
  onBack,
  onClose,
}: {
  current: number;
  topInset: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const total = STEP_LABELS.length; // 6
  const pct = Math.round(((current + 1) / total) * 100);
  return (
    <View style={[progress.container, { paddingTop: Math.max(topInset, 10) + 8 }]}>
      <View style={progress.headerRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={current === 0 ? 'Exit booking' : `Back to ${STEP_LABELS[current - 1]}`}
          hitSlop={8}
          onPress={onBack}
          style={progress.iconButton}
        >
          <Ionicons name="chevron-back" size={21} color="#F4F4F5" />
        </TouchableOpacity>

        <View style={progress.titleGroup}>
          <Text style={progress.title}>Book a Service</Text>
          <Text style={progress.stepText}>{current + 1} of {total} · {STEP_LABELS[current]}</Text>
        </View>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Close booking"
          hitSlop={8}
          onPress={onClose}
          style={progress.iconButton}
        >
          <Ionicons name="close" size={20} color="#A1A1AA" />
        </TouchableOpacity>
      </View>

      <View
        style={progress.track}
        accessibilityRole="progressbar"
        accessibilityLabel={`${STEP_LABELS[current]}, step ${current + 1} of ${total}`}
        accessibilityValue={{ min: 1, max: total, now: current + 1 }}
      >
        <View style={[progress.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function PackageSelectButton({
  label,
  selected,
  disabled,
  onPress,
  children,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Animated.View style={animatedStyle}>
      <TouchableOpacity
        activeOpacity={0.92}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityHint={disabled ? 'Price could not be loaded' : 'Selects this service package'}
        accessibilityState={{ checked: selected, disabled: Boolean(disabled) }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => { scale.value = withTiming(0.988, { duration: 130 }); }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        style={pkgCard.selectArea}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}

function BookingContinueButton({
  enabled,
  busy,
  accessibilityLabel,
  onPress,
}: {
  enabled: boolean;
  busy: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[bookingCta.buttonWrap, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={0.94}
        disabled={!enabled || busy}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !enabled, busy }}
        onPress={onPress}
        onPressIn={() => {
          if (enabled && !busy) scale.value = withTiming(0.98, { duration: 130 });
        }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 150 }); }}
        style={[bookingCta.button, enabled ? bookingCta.buttonEnabled : bookingCta.buttonDisabled]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={ON_PRIMARY} />
        ) : (
          <>
            <Text style={[bookingCta.buttonText, !enabled && bookingCta.buttonTextDisabled]}>
              Continue
            </Text>
            <Ionicons
              name="arrow-forward"
              size={18}
              color={enabled ? ON_PRIMARY : '#85858D'}
            />
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function DetailsSectionHeader({
  icon,
  label,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={s1.sectionHeaderRow}>
      <View style={s1.sectionHeader}>
        <View style={s1.sectionIconWrap}>
          <Ionicons name={icon} size={13} color="rgba(255,183,125,0.82)" />
        </View>
        <Text style={s1.sectionLabel}>{label}</Text>
      </View>
      {actionLabel && onAction ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          onPress={onAction}
          style={s1.changeAction}
        >
          <Text style={s1.changeActionText}>{actionLabel}</Text>
          <Ionicons name="chevron-forward" size={12} color="rgba(255,183,125,0.64)" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** Shared package mark with distinct selected and inclusion treatments. */
function PackageCheck({
  size,
  checkSize,
  treatment,
}: {
  size: number;
  checkSize: number;
  treatment: 'selected' | 'inclusion';
}) {
  const isSelected = treatment === 'selected';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isSelected ? PRIMARY_CTR : 'rgba(255,255,255,0.025)',
        borderWidth: isSelected ? 0 : 1,
        borderColor: isSelected ? 'transparent' : 'rgba(255,183,125,0.14)',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Ionicons
        name="checkmark"
        size={checkSize}
        color={isSelected ? ON_PRIMARY : 'rgba(255,183,125,0.82)'}
      />
    </View>
  );
}

const progress = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: SURFACE_LOW,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    gap: 10,
    marginBottom: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  titleGroup: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: '#F7F7F8',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  stepText: {
    color: '#8B8B94',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 1,
  },
  track: {
    height: 2,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  fill: {
    height: 2,
    borderRadius: 999,
    backgroundColor: Palette.accent,
  },
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
  availableTimes: number | null;
};
type DayAvailabilityMap = Record<string, DayAvailabilityInfo>;
type SlotStatus = 'AVAILABLE' | 'FULL' | 'CLOSED';

type AvailableSlotsPayload = {
  success?: boolean;
  slots?: {
    time?: string;
    label?: string;
    status?: string;
    available?: number;
    booked?: number;
    capacity?: number;
    blockedByDailyCapacity?: boolean;
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
  remaining?: number | null;
  availableSlots?: number | null;
  bookedCount?: number | null;
  slotsLimit?: number | null;
  dailyCapacity?: number | null;
  totalCapacity?: number | null;
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
  const capacity = typeof payload?.dailyCapacity === 'number'
    ? payload.dailyCapacity
    : typeof payload?.slotsLimit === 'number'
      ? payload.slotsLimit
      : typeof payload?.totalCapacity === 'number'
        ? payload.totalCapacity
        : Number.NaN;
  const booked = typeof payload?.bookedCount === 'number' ? payload.bookedCount : Number.NaN;
  const remaining = typeof payload?.remaining === 'number'
    ? payload.remaining
    : typeof payload?.availableSlots === 'number'
      ? payload.availableSlots
      : Number.NaN;
  const hasValidDailyAvailability = Number.isFinite(capacity)
    && capacity >= 0
    && Number.isFinite(booked)
    && booked >= 0
    && Number.isFinite(remaining)
    && remaining >= 0;
  return {
    slots,
    unavailable,
    errorCode,
    message,
    closureType,
    emergencyClosed,
    businessDate,
    businessTimeZone,
    dailyAvailability: hasValidDailyAvailability ? { capacity, booked, remaining } : null,
  };
};

type NormalizedAvailableSlotsPayload = ReturnType<typeof normalizeAvailableSlotsPayload>;

const getDayAvailabilityFromSlots = (
  current: DayAvailabilityInfo | undefined,
  normalized: NormalizedAvailableSlotsPayload,
  availableTimes: number,
): DayAvailabilityInfo => {
  const daily = normalized.dailyAvailability;
  const errorCode = normalized.errorCode;
  const capacityReached = errorCode === 'DATE_FULL'
    || Boolean(daily && daily.capacity > 0 && daily.remaining <= 0);
  const closed = normalized.emergencyClosed || (normalized.unavailable && !capacityReached);
  const status: DayAvailabilityStatus = closed ? 'closed' : capacityReached ? 'full' : 'available';
  const closureType: DayAvailabilityInfo['closureType'] = normalized.emergencyClosed
    ? 'emergency'
    : normalized.closureType === 'recurring'
      ? 'recurring'
      : normalized.closureType
        ? 'closure'
        : null;

  return {
    status,
    unavailable: normalized.unavailable || status !== 'available',
    reason: normalized.emergencyClosed
      ? EMERGENCY_CLOSURE_MESSAGE
      : normalized.message
        || (status === 'full'
          ? 'All appointment times for this date are booked.'
          : status === 'closed'
            ? 'This date is unavailable for booking.'
            : ''),
    errorCode: errorCode || (status === 'full'
      ? 'DATE_FULL'
      : status === 'closed'
        ? current?.errorCode || 'DATE_UNAVAILABLE'
        : null),
    closureType: status === 'closed' ? closureType : null,
    remaining: daily?.remaining ?? current?.remaining ?? null,
    booked: daily?.booked ?? current?.booked ?? null,
    capacity: daily?.capacity ?? current?.capacity ?? null,
    availableTimes,
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
  availableTimeOptions?: number;
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

const getDateFromIso = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDaysToIso = (value: string, days: number): string => {
  const date = getDateFromIso(value) || new Date();
  date.setDate(date.getDate() + days);
  return getLocalIsoDate(date);
};

const getUpcomingDateWindow = (
  selectedDate: string | null,
  businessDate: string | null,
): string[] => {
  const earliestDate = isIsoDate(businessDate) ? businessDate : getLocalIsoDate(new Date());
  const centeredStart = isIsoDate(selectedDate) ? addDaysToIso(selectedDate, -2) : earliestDate;
  const start = centeredStart < earliestDate ? earliestDate : centeredStart;
  return Array.from({ length: 5 }, (_, index) => addDaysToIso(start, index));
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

const formatScheduleFooterDate = (value: string | null): string => {
  if (!value) return 'Choose an arrival time';
  const date = getDateFromIso(value);
  if (!date) return value;
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const formatScheduleSelectedDate = (value: string | null): string => {
  const date = value ? getDateFromIso(value) : null;
  if (!date) return value || '—';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
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

const deriveSlotStatuses = (
  slots: NonNullable<AvailableSlotsPayload['slots']>,
  unavailable: boolean,
  errorCode: string | null,
): { time: string; status: SlotStatus }[] => slots.reduce<{ time: string; status: SlotStatus }[]>((rows, slot) => {
  const displayTime = String(slot.label || slot.time || '').trim();
  if (!displayTime) return rows;

  const rawStatus = String(slot.status || '').toUpperCase();
  const startMinutes = getSlotStartMinutes(String(slot.time || slot.label || ''));
  const knownStatus = ['AVAILABLE', 'ALMOST_FULL', 'FULL', 'OVER_CAPACITY'].includes(rawStatus);
  const capacity = typeof slot.capacity === 'number' ? slot.capacity : Number.NaN;
  const booked = typeof slot.booked === 'number' ? slot.booked : Number.NaN;
  const available = typeof slot.available === 'number' ? slot.available : Number.NaN;
  const blockedByDailyCapacity = slot.blockedByDailyCapacity === true;
  const intrinsicAvailable = Math.max(0, capacity - booked);
  const hasValidCounts = Number.isFinite(capacity)
    && Number.isInteger(capacity)
    && capacity >= 0
    && Number.isFinite(booked)
    && Number.isInteger(booked)
    && booked >= 0
    && Number.isFinite(available)
    && Number.isInteger(available)
    && available >= 0
    && (
      available === intrinsicAvailable
      || (blockedByDailyCapacity && booked === 0 && available === 0 && intrinsicAvailable === 1)
    );

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

const getSelectedDateParts = (value: string | null) => {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return {
    day: String(date.getDate()).padStart(2, '0'),
    weekday: date.toLocaleDateString('en-US', { weekday: 'long' }),
    monthYear: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase(),
  };
};

type CalendarGridItem = {
  day: number;
  isCurrentMonth: boolean;
  dateKey: string;
  iso: string;
  isPast: boolean;
};

function CalendarDay({
  item,
  selectedDate,
  todayKey,
  monthAvailability,
  loading,
  onSelectDate,
}: {
  item: CalendarGridItem;
  selectedDate: string | null;
  todayKey: string;
  monthAvailability: DayAvailabilityMap;
  loading: boolean;
  onSelectDate: (dateKey: string, iso: string) => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isSelected = item.isCurrentMonth && selectedDate === item.dateKey;
  const isStaticDisabled = !item.isCurrentMonth || item.isPast;
  const dayInfo = item.isCurrentMonth && !item.isPast ? monthAvailability[item.iso] : undefined;
  const availStatus = dayInfo?.status;
  const isUnavailable = !dayInfo || !!dayInfo.unavailable || availStatus === 'closed' || availStatus === 'full';
  const isToday = item.isCurrentMonth && item.iso === todayKey;
  const isEmergencyClosed = dayInfo?.errorCode === 'EMERGENCY_CLOSED' || dayInfo?.closureType === 'emergency';
  const statusLabel = isEmergencyClosed
    ? 'Emergency'
    : dayInfo?.status === 'full'
    ? 'Full'
    : dayInfo?.status === 'closed'
      ? 'Closed'
      : loading && !dayInfo
        ? 'Checking'
        : '';

  return (
    <Animated.View style={[cal.dayCell, animatedStyle]}>
      <TouchableOpacity
        activeOpacity={isStaticDisabled || isUnavailable ? 1 : 0.82}
        disabled={isStaticDisabled || isUnavailable}
        accessibilityRole="button"
        accessibilityState={{ disabled: isStaticDisabled || isUnavailable, selected: isSelected }}
        accessibilityLabel={dayInfo && !item.isPast
          ? `${item.iso}: ${availStatus === 'closed'
            ? dayInfo.errorCode === 'EMERGENCY_CLOSED' || dayInfo.closureType === 'emergency'
              ? 'Emergency Closed'
              : 'Closed'
            : availStatus === 'full'
              ? 'Fully Booked'
              : `${dayInfo.availableTimes ?? dayInfo.remaining ?? 0} available start times`}`
          : undefined}
        onPressIn={() => {
          if (!isStaticDisabled && !isUnavailable) scale.value = withTiming(0.985, { duration: 120 });
        }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
        onPress={() => {
          if (isStaticDisabled || isUnavailable) return;
          onSelectDate(item.dateKey, item.iso);
        }}
        style={cal.dayTouchTarget}
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
        <Text style={[
          cal.dayStatusText,
          isEmergencyClosed && cal.dayStatusTextEmergency,
          isSelected && cal.dayStatusTextSelected,
        ]}>{statusLabel}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function TimeSlotButton({
  time,
  status,
  selected,
  onSelect,
}: {
  time: string;
  status: 'AVAILABLE' | 'FULL' | 'CLOSED';
  selected: boolean;
  onSelect: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const isFull = status === 'FULL';
  const isClosed = status === 'CLOSED';
  const disabled = isFull || isClosed;
  const statusLabel = isFull ? 'Unavailable' : isClosed ? 'Closed' : 'Available';

  return (
    <Animated.View style={[s2.timeSlotWrapper, animatedStyle]}>
      <TouchableOpacity
        onPress={() => {
          if (disabled) return;
          onSelect();
        }}
        onPressIn={() => {
          if (!disabled) scale.value = withTiming(0.985, { duration: 120 });
        }}
        onPressOut={() => { scale.value = withTiming(1, { duration: 140 }); }}
        activeOpacity={disabled ? 1 : 0.88}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${time}, ${statusLabel}`}
        accessibilityState={{ disabled, selected }}
        style={[
          s2.timePill,
          selected && s2.timePillSelected,
          isFull && s2.timePillFull,
          isClosed && s2.timePillClosed,
        ]}
      >
        {selected ? (
          <View style={s2.timePillSelectedContent}>
            <Text style={s2.timeTextSelected}>{time}</Text>
            <Ionicons name="checkmark" size={14} color={PRIMARY} />
          </View>
        ) : (
          <View style={s2.timePillContent}>
            <Text style={[
              s2.timeText,
              isFull && s2.timeTextFull,
              isClosed && s2.timeTextClosed,
            ]}>{time}</Text>
            {isFull && <Text style={s2.timeStatusBooked}>Unavailable</Text>}
            {isClosed && <Text style={s2.timeStatusClosed}>Closed</Text>}
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

function UpcomingDateRail({
  selectedDate,
  businessDate,
  monthAvailability,
  loading,
  calendarOpen,
  onSelectDate,
  onToggleCalendar,
}: {
  selectedDate: string | null;
  businessDate: string | null;
  monthAvailability: DayAvailabilityMap;
  loading: boolean;
  calendarOpen: boolean;
  onSelectDate: (iso: string) => void;
  onToggleCalendar: () => void;
}) {
  const dates = getUpcomingDateWindow(selectedDate, businessDate);
  const firstDate = getDateFromIso(dates[0]);
  const lastDate = getDateFromIso(dates[dates.length - 1]);
  const monthLabel = firstDate && lastDate
    ? firstDate.getMonth() === lastDate.getMonth()
      ? firstDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${firstDate.toLocaleDateString('en-US', { month: 'short' })}–${lastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    : '';

  return (
    <View style={dateRail.container}>
      <View style={dateRail.header}>
        <Text style={dateRail.monthLabel}>{monthLabel.toUpperCase()}</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={calendarOpen ? 'Hide full calendar' : 'Open full calendar'}
          onPress={onToggleCalendar}
          activeOpacity={0.7}
          style={dateRail.calendarAction}
        >
          <Text style={dateRail.calendarActionText}>{calendarOpen ? 'Hide calendar' : 'View calendar'}</Text>
          <Ionicons name={calendarOpen ? 'chevron-up' : 'chevron-forward'} size={13} color={PRIMARY} />
        </TouchableOpacity>
      </View>
      {!calendarOpen ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={dateRail.list}
        >
          {dates.map((iso) => {
            const date = getDateFromIso(iso)!;
            const info = monthAvailability[iso];
            const selected = selectedDate === iso;
            const disabled = !info || info.unavailable || info.status !== 'available';
            const emergencyClosed = info?.errorCode === 'EMERGENCY_CLOSED' || info?.closureType === 'emergency';
            const availabilityLabel = !info
              ? loading ? 'Checking' : 'Unavailable'
              : emergencyClosed
                ? 'Emergency'
                : info.status === 'closed'
                  ? 'Closed'
                  : info.status === 'full'
                    ? 'Full'
                    : info.availableTimes !== null
                      ? `${info.availableTimes} ${info.availableTimes === 1 ? 'time' : 'times'}`
                      : 'Available';
            const accessibilityAvailabilityLabel = emergencyClosed
              ? 'Emergency closed'
              : info?.status === 'full'
                ? 'Fully booked'
                : availabilityLabel;
            return (
              <TouchableOpacity
                key={iso}
                accessibilityRole="button"
                accessibilityState={{ disabled, selected }}
                accessibilityLabel={`${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${accessibilityAvailabilityLabel}`}
                disabled={disabled}
                activeOpacity={0.78}
                onPress={() => onSelectDate(iso)}
                style={[dateRail.item, selected && dateRail.itemSelected, disabled && dateRail.itemDisabled]}
              >
                <Text style={[dateRail.weekday, selected && dateRail.weekdaySelected]}>
                  {date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                </Text>
                <View style={[dateRail.dayCircle, selected && dateRail.dayCircleSelected]}>
                  <Text style={[dateRail.day, selected && dateRail.daySelected]}>{date.getDate()}</Text>
                </View>
                <Text style={[
                  dateRail.availability,
                  emergencyClosed && dateRail.availabilityEmergency,
                  selected && dateRail.availabilitySelected,
                ]} numberOfLines={1}>
                  {availabilityLabel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const appliedBusinessDateRef = useRef<string | null>(null);

  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const todayKey = isIsoDate(businessDate) ? businessDate : getLocalIsoDate(new Date());
  const earliestMonthKey = todayKey.slice(0, 7);
  const previousMonth = new Date(year, month - 1, 1);
  const canGoPrevious = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}` >= earliestMonthKey;

  useEffect(() => {
    if (selectedDate || !isIsoDate(businessDate) || appliedBusinessDateRef.current === businessDate) return;
    appliedBusinessDateRef.current = businessDate;
    const [businessYear, businessMonth, businessDay] = businessDate.split('-').map(Number);
    setCurrentMonth((current) => {
      if (current.getFullYear() === businessYear && current.getMonth() === businessMonth - 1) return current;
      const next = new Date(businessYear, businessMonth - 1, businessDay);
      onMonthChange?.(businessYear, businessMonth - 1);
      return next;
    });
  }, [businessDate, onMonthChange, selectedDate]);

  useEffect(() => {
    if (!isIsoDate(selectedDate)) return;
    const [selectedYear, selectedMonth, selectedDay] = selectedDate.split('-').map(Number);
    setCurrentMonth((current) => {
      if (current.getFullYear() === selectedYear && current.getMonth() === selectedMonth - 1) return current;
      return new Date(selectedYear, selectedMonth - 1, selectedDay);
    });
  }, [selectedDate]);

  const prevMonth = () => {
    if (!canGoPrevious) return;
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

  const grid: CalendarGridItem[] = [];

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
    <View style={cal.container}>
      <View style={cal.header}>
        <Text style={cal.monthTitle}>{MONTH_NAMES_FULL[month]} {year}</Text>
        <View style={cal.monthControls}>
          <TouchableOpacity
            onPress={prevMonth}
            disabled={!canGoPrevious}
            activeOpacity={0.65}
            style={[cal.arrowBtn, !canGoPrevious && cal.arrowBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Show previous month"
            accessibilityState={{ disabled: !canGoPrevious }}
          >
            <Ionicons name="chevron-back" size={19} color={SECONDARY} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={nextMonth}
            activeOpacity={0.65}
            style={cal.arrowBtn}
            accessibilityRole="button"
            accessibilityLabel="Show next month"
          >
            <Ionicons name="chevron-forward" size={19} color={SECONDARY} />
          </TouchableOpacity>
        </View>
      </View>

      <Animated.View key={`${year}-${month}`} entering={FadeInRight.duration(160)}>
        <View style={cal.weekdays}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={cal.weekdayText}>{d}</Text>
          ))}
        </View>

        <View style={cal.grid}>
          {grid.map((item, idx) => (
            <CalendarDay
              key={`${item.iso || 'adjacent'}-${idx}`}
              item={item}
              selectedDate={selectedDate}
              todayKey={todayKey}
              monthAvailability={monthAvailability}
              loading={loading}
              onSelectDate={onSelectDate}
            />
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const dateRail = StyleSheet.create({
  container: { gap: 10 },
  header: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  monthLabel: {
    color: '#A1A1AA',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.9,
  },
  calendarAction: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 8,
  },
  calendarActionText: { color: PRIMARY, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  list: { gap: 8, paddingRight: 2 },
  item: {
    width: 62,
    minHeight: 78,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#111113',
    paddingHorizontal: 5,
    paddingVertical: 6,
  },
  itemSelected: {
    borderColor: 'rgba(255,140,0,0.55)',
    backgroundColor: 'rgba(255,140,0,0.07)',
  },
  itemDisabled: { opacity: 0.48 },
  weekday: { color: '#71717A', fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.5 },
  weekdaySelected: { color: PRIMARY },
  dayCircle: {
    width: 30,
    height: 30,
    marginVertical: 2,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: { backgroundColor: PRIMARY_CTR },
  day: { color: '#F4F4F5', fontSize: 17, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  daySelected: { color: ON_PRIMARY },
  availability: { width: '100%', color: '#8B8B91', fontSize: 9, lineHeight: 12, textAlign: 'center' },
  availabilityEmergency: { color: '#F87171' },
  availabilitySelected: { color: '#D4D4D8', fontWeight: '600' },
});

const cal = StyleSheet.create({
  container: {
    paddingTop: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  monthTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: '#F7F7F8',
    letterSpacing: -0.25,
  },
  monthControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: { opacity: 0.28 },
  weekdays: {
    flexDirection: 'row',
    marginBottom: 1,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#71717A',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    height: 36,
  },
  dayTouchTarget: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E4E4E7',
    width: 28,
    height: 28,
    textAlign: 'center',
    lineHeight: 28,
    borderRadius: 14,
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,140,0,0.72)',
  },
  dayTextSelected: {
    backgroundColor: PRIMARY_CTR,
    borderColor: PRIMARY_CTR,
    color: ON_PRIMARY,
    fontWeight: '700',
  },
  dayStatusText: { height: 8, color: '#5F5F66', fontSize: 6, lineHeight: 8, fontWeight: '600' },
  dayStatusTextEmergency: { color: '#F87171', fontSize: 6 },
  dayStatusTextSelected: { color: 'transparent' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BookScreen() {
  const { profile, backendUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const prefillParams = useLocalSearchParams<{
    vehicleId?: string;
    serviceId?: string;
    pkg?: string;
    notes?: string;
    step?: string;
  }>();
  const draftOwnerId = profile?.id || profile?.backend_id || profile?.firebase_uid || '';

  // ── State ──
  const [step, setStep] = useState(0);

  // Step 0 — Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehiclesLoading, setVehiclesLoading] = useState(true);
  const [vehiclesError, setVehiclesError] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Step 1 — Service (loaded on mount)
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState('');
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
  const [isNotesEditing, setIsNotesEditing] = useState(false);
  const notesInputFocusedRef = useRef(false);

  // Add Vehicle form
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const vehicleModalTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [packageDetailsKey, setPackageDetailsKey] = useState<string | null>(null);
  const packageSheetTranslateY = useRef(new RNAnimated.Value(0)).current;
  const [isContinuing, setIsContinuing] = useState(false);
  const [stepOneDockHeight, setStepOneDockHeight] = useState(0);
  const [stepTwoDockHeight, setStepTwoDockHeight] = useState(0);
  const [scheduleDockHeight, setScheduleDockHeight] = useState(0);
  const [isPhoneEditing, setIsPhoneEditing] = useState(false);
  const [isDetailsContinuing, setIsDetailsContinuing] = useState(false);
  const [isScheduleContinuing, setIsScheduleContinuing] = useState(false);
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  // Durable draft hydration is intentionally separated from ordinary field state
  // so default vehicle/profile values are never persisted before the customer acts.
  const [draftDecisionResolved, setDraftDecisionResolved] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<BookingDraftV1 | null>(null);
  const draftPromptShownRef = useRef(false);
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoredStepRef = useRef<number | null>(null);
  const prefillAppliedRef = useRef(false);

  const closePackageDetails = useCallback(() => {
    packageSheetTranslateY.setValue(0);
    setPackageDetailsKey(null);
  }, [packageSheetTranslateY]);

  const packageSheetPanResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderMove: (_event, gesture) => {
      packageSheetTranslateY.setValue(Math.max(0, gesture.dy));
    },
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 72 || gesture.vy > 0.9) {
        RNAnimated.timing(packageSheetTranslateY, {
          toValue: 520,
          duration: 170,
          useNativeDriver: true,
        }).start(closePackageDetails);
        return;
      }
      RNAnimated.spring(packageSheetTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 240,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
    onPanResponderTerminate: () => {
      RNAnimated.spring(packageSheetTranslateY, {
        toValue: 0,
        damping: 22,
        stiffness: 240,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
    },
  })).current;

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

  useEffect(() => {
    if (step === 0) setIsContinuing(false);
    if (step !== 1) {
      setIsPhoneEditing(false);
      setIsDetailsContinuing(false);
    }
  }, [step]);

  // ── Calendar availability state (mirrors web CustomerDashboard) ──
  const [monthAvailability, setMonthAvailability] = useState<DayAvailabilityMap>({});
  const [monthAvailLoading, setMonthAvailLoading] = useState(false);
  const [slotStatuses, setSlotStatuses] = useState<{ time: string; status: SlotStatus }[]>([]);
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [businessDate, setBusinessDate] = useState<string | null>(null);
  const [, setBusinessTimeZone] = useState<string | null>(null);
  const monthAvailabilityRequestRef = useRef<Record<string, number>>({});
  const pendingMonthAvailabilityRef = useRef(new Set<string>());
  const slotAvailabilityRequestRef = useRef(0);
  const selectedDateRef = useRef<string | null>(null);
  const selectedTimeRef = useRef<string | null>(null);
  const stepRef = useRef(step);
  const visibleCalendarMonthRef = useRef({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  });
  selectedDateRef.current = selectedDate;
  selectedTimeRef.current = selectedTime;
  stepRef.current = step;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const handleKeyboardShow = (event: KeyboardEvent) => {
      if (stepRef.current !== 2 || !notesInputFocusedRef.current) return;
      Keyboard.scheduleLayoutAnimation(event);
      setIsNotesEditing(true);
    };
    const handleKeyboardHide = (event: KeyboardEvent) => {
      if (stepRef.current !== 2) return;
      Keyboard.scheduleLayoutAnimation(event);
      setIsNotesEditing(false);
    };
    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (step === 2) return;
    notesInputFocusedRef.current = false;
    setIsNotesEditing(false);
  }, [step]);

  useFocusEffect(
    useCallback(() => {
      setIsNotesEditing(false);
      return () => {
        notesInputFocusedRef.current = false;
        Keyboard.dismiss();
      };
    }, [])
  );

  const fetchMonthAvailability = useCallback(async (y: number, m: number) => {
    const requestKey = `${y}-${m}`;
    const requestId = (monthAvailabilityRequestRef.current[requestKey] || 0) + 1;
    monthAvailabilityRequestRef.current[requestKey] = requestId;
    pendingMonthAvailabilityRef.current.add(requestKey);
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
        availableTimes: null,
      };
    }

    try {
      const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(daysInM).padStart(2, '0')}`;
      const res = await apiClient.get(`/slots/range?start=${start}&end=${end}`);
      if (requestId !== monthAvailabilityRequestRef.current[requestKey]) return;
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
        const availableTimes = typeof row.availableTimeOptions === 'number'
          ? row.availableTimeOptions
          : Number.NaN;
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
          availableTimes: Number.isFinite(availableTimes) && availableTimes >= 0
            ? availableTimes
            : null,
        };
      }
    } catch {
      if (requestId === monthAvailabilityRequestRef.current[requestKey]) {
        Toast.show('Could not load live calendar availability. Please try again.', 'error');
      }
    }
    finally {
      if (requestId === monthAvailabilityRequestRef.current[requestKey]) {
        setMonthAvailability((current) => ({ ...current, ...result }));
        pendingMonthAvailabilityRef.current.delete(requestKey);
        setMonthAvailLoading(pendingMonthAvailabilityRef.current.size > 0);
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
      const res = await apiClient.get(`/orders/available-slots?date=${iso}`);
      if (requestId !== slotAvailabilityRequestRef.current) return;
      if (res.data?.success !== true) {
        throw new Error('Availability was not returned by the server.');
      }
      const normalized = normalizeAvailableSlotsPayload(res.data);
      const {
        unavailable,
        errorCode,
        message,
        slots,
        emergencyClosed,
        businessDate: responseBusinessDate,
        businessTimeZone: responseBusinessTimeZone,
      } = normalized;
      if (isIsoDate(responseBusinessDate)) setBusinessDate(responseBusinessDate);
      if (responseBusinessTimeZone) setBusinessTimeZone(responseBusinessTimeZone);

      if (emergencyClosed) {
        setSlotStatuses([]);
        selectedTimeRef.current = null;
        setSelectedTime(null);
        setScheduleMessage(EMERGENCY_CLOSURE_MESSAGE);
        setMonthAvailability((current) => ({
          ...current,
          [iso]: getDayAvailabilityFromSlots(current[iso], normalized, 0),
        }));
        setStep(2);
        Toast.show(EMERGENCY_CLOSURE_MESSAGE, 'error');
        return;
      }

      const derived = deriveSlotStatuses(slots, unavailable, errorCode);
      const previouslySelectedTime = selectedTimeRef.current;
      const lostSelectedTime = Boolean(
        previouslySelectedTime
        && !derived.some((slot) => slot.time === previouslySelectedTime && slot.status === 'AVAILABLE')
      );
      const availableTimes = derived.filter((slot) => slot.status === 'AVAILABLE').length;
      const refreshedDayAvailability = getDayAvailabilityFromSlots(
        undefined,
        normalized,
        availableTimes,
      );

      setSlotStatuses(derived);
      setMonthAvailability((current) => ({
        ...current,
        [iso]: getDayAvailabilityFromSlots(current[iso], normalized, availableTimes),
      }));
      if (lostSelectedTime) {
        selectedTimeRef.current = null;
        setSelectedTime(null);
        const previousSlot = derived.find((slot) => slot.time === previouslySelectedTime);
        const conflictMessage = refreshedDayAvailability.status === 'full'
          ? `${formatIsoDateForDisplay(iso)} is now fully booked. Choose another available date.`
          : refreshedDayAvailability.status === 'closed'
            ? `${formatIsoDateForDisplay(iso)} is now closed. Choose another available date.`
            : previousSlot?.status === 'FULL'
              ? `${previouslySelectedTime} was just booked. Choose another available time to continue.`
              : `${previouslySelectedTime} is no longer available. Choose another available time to continue.`;
        setScheduleMessage(conflictMessage);
        Toast.show(conflictMessage, 'warning');
      }
      setSelectedTime((current) => (
        current && !derived.some((slot) => slot.time === current && slot.status === 'AVAILABLE')
          ? null
          : current
      ));

      if (!lostSelectedTime && message) {
        setScheduleMessage(message);
      } else if (!lostSelectedTime && derived.length === 0) {
        setScheduleMessage('No bookable time options were generated for this date.');
      }
    } catch {
      if (requestId === slotAvailabilityRequestRef.current) {
        setSlotStatuses([]);
        selectedTimeRef.current = null;
        setSelectedTime(null);
        setScheduleMessage('Live time availability could not be confirmed. Please try again.');
      }
    } finally {
      if (requestId === slotAvailabilityRequestRef.current) setSlotsLoading(false);
    }
  }, []);

  const selectScheduleDate = useCallback((iso: string) => {
    if (!iso) return;
    if (selectedDateRef.current !== iso) {
      selectedDateRef.current = iso;
      selectedTimeRef.current = null;
      setSelectedDate(iso);
      setSelectedTime(null);
      setDraftDirty(true);
    }
    setSlotStatuses([]);
    setScheduleMessage('');
    void fetchSlotsForDate(iso);
    Haptics.selectionAsync();
  }, [fetchSlotsForDate]);

  useEffect(() => {
    if (step !== 2) return;
    const selectedParts = selectedDateRef.current?.match(/^(\d{4})-(\d{2})-\d{2}$/);
    const now = new Date();
    const year = selectedParts ? Number(selectedParts[1]) : now.getFullYear();
    const month = selectedParts ? Number(selectedParts[2]) - 1 : now.getMonth();
    visibleCalendarMonthRef.current = { year, month };

    const railMonths = getUpcomingDateWindow(selectedDate, businessDate).reduce<{ year: number; month: number }[]>(
      (months, iso) => {
        const date = getDateFromIso(iso);
        if (!date) return months;
        const exists = months.some((entry) => (
          entry.year === date.getFullYear() && entry.month === date.getMonth()
        ));
        if (!exists) months.push({ year: date.getFullYear(), month: date.getMonth() });
        return months;
      },
      [],
    );
    if (!railMonths.some((entry) => entry.year === year && entry.month === month)) {
      railMonths.unshift({ year, month });
    }

    void Promise.all(railMonths.map((entry) => fetchMonthAvailability(entry.year, entry.month)));
  }, [businessDate, fetchMonthAvailability, selectedDate, step]);

  useEffect(() => {
    if (step === 2 && selectedDateRef.current) {
      void fetchSlotsForDate(selectedDateRef.current);
    }
  }, [fetchSlotsForDate, step]);

  const refreshCurrentAvailability = useCallback(() => {
    if (stepRef.current !== 2) return;
    const visibleMonth = visibleCalendarMonthRef.current;
    const months = getUpcomingDateWindow(selectedDateRef.current, businessDate).reduce<{ year: number; month: number }[]>(
      (entries, iso) => {
        const date = getDateFromIso(iso);
        if (!date) return entries;
        const year = date.getFullYear();
        const month = date.getMonth();
        if (!entries.some((entry) => entry.year === year && entry.month === month)) {
          entries.push({ year, month });
        }
        return entries;
      },
      [visibleMonth],
    );
    void Promise.all(months.map((entry) => fetchMonthAvailability(entry.year, entry.month)));
    if (selectedDateRef.current) {
      void fetchSlotsForDate(selectedDateRef.current);
    }
  }, [businessDate, fetchMonthAvailability, fetchSlotsForDate]);

  useFocusEffect(
    useCallback(() => {
      refreshCurrentAvailability();
    }, [refreshCurrentAvailability])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshCurrentAvailability();
    });
    return () => subscription.remove();
  }, [refreshCurrentAvailability]);

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

  useEffect(() => {
    if (step !== 2 || !isIsoDate(businessDate)) return;
    const railStart = getDateFromIso(businessDate);
    const railEnd = getDateFromIso(addDaysToIso(businessDate, 4));
    if (!railStart || !railEnd || railStart.getMonth() === railEnd.getMonth()) return;
    void fetchMonthAvailability(railEnd.getFullYear(), railEnd.getMonth());
  }, [businessDate, fetchMonthAvailability, step]);

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
  const loadVehicles = useCallback(async () => {
    setVehiclesLoading(true);
    setVehiclesError('');
    try {
      const nextVehicles = await vehicleService.getMyVehicles();
      setVehicles(nextVehicles);
      setSelectedVehicle((current) => {
        let nextSelected: Vehicle | null = null;
        if (current) {
          nextSelected = nextVehicles.find((vehicle) =>
            vehicle.id === current.id || vehicle._id === current._id
          ) ?? null;
        }
        nextSelected ??= nextVehicles[0] ?? null;
        return nextSelected;
      });
    } catch (error) {
      setVehiclesError(getApiErrorMessage(error, 'Unable to load your vehicles.'));
    } finally {
      setVehiclesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVehicle) setVehicleType(getVehiclePriceKey(selectedVehicle.vehicleType || ''));
  }, [selectedVehicle]);

  const loadServices = useCallback(async () => {
    setServicesLoading(true);
    setServicesError('');
    try {
      setServices(await serviceService.getPublishedServices());
    } catch (error) {
      setServicesError(getApiErrorMessage(error, 'Unable to load packages.'));
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const retryServices = useCallback(() => {
    invalidateCache('/services/published');
    return loadServices();
  }, [loadServices]);

  useFocusEffect(
    useCallback(() => {
      void loadVehicles();
      void loadServices();
    }, [loadServices, loadVehicles])
  );

  useEffect(() => {
    const fromProfile = (profile?.phone || '').trim();
    const fromBackend = (backendUser?.phone || '').trim();
    const p = fromProfile || fromBackend;
    if (p) setPhone(p);
  }, [profile?.phone, backendUser?.phone]);

  const bookingPackages = React.useMemo<BookingCatalogPackage[]>(() => services
    .map((service) => {
      const key = getPackageKeyFromServiceName(service.name);
      if (!key) return null;
      const features = Array.isArray(service.catalogCard?.features)
        ? service.catalogCard.features.map((feature) => feature.trim()).filter(Boolean)
        : [];
      const structuredInclusions = Array.isArray(service.catalogCard?.fullInclusions)
        ? service.catalogCard.fullInclusions
          .map((item) => ({
            group: String(item.group || '').trim(),
            title: String(item.title || '').trim(),
            detail: String(item.detail || '').trim() || null,
            savingsLabel: String(item.savingsLabel || '').trim() || null,
          }))
          .filter((item) => Boolean(item.group && item.title))
        : [];
      const fullInclusions: PackageInclusion[] = structuredInclusions.length
        ? structuredInclusions
        : features.map((rawFeature) => {
          const feature = getPackageFeatureParts(rawFeature);
          return {
            group: 'Package Inclusions',
            title: feature.title,
            detail: feature.detail || null,
            savingsLabel: feature.savings ? `Save ${feature.savings}` : null,
          };
        });
      const price = getPublishedPriceState(service, vehicleType);
      const originalPrice = getPublishedOptionalPrice(service, vehicleType, 'original');
      const bundlePrice = getPublishedOptionalPrice(service, vehicleType, 'addon');
      const addonLabel = service.catalogCard?.addonLabel?.trim() || null;
      const hasPublishedBundle = price.status === 'available'
        && bundlePrice !== null
        && bundlePrice > price.value
        && Boolean(addonLabel);
      const promotionPercent = price.status === 'available'
        && originalPrice !== null
        && originalPrice > price.value
        ? Math.round((1 - (price.value / originalPrice)) * 100)
        : null;
      return {
        key,
        service,
        name: getPackageDisplayName(service.name),
        tier: service.catalogCard?.tierLabel?.trim() || service.tag || 'Service',
        badge: service.catalogCard?.badge?.trim() || null,
        badgeColor: getPackageBadgeColor(service),
        protection: normalizeProtectionLabel(service.catalogCard?.warrantyLabel),
        estimatedDuration: normalizeServiceDurationLabel(service.duration),
        tagline: service.catalogCard?.tagline?.trim() || null,
        description: service.description?.trim() || null,
        features,
        fullInclusions,
        ppfCoverage: Array.isArray(service.catalogCard?.ppfCoverage)
          ? service.catalogCard.ppfCoverage.map((area) => area.trim()).filter(Boolean)
          : [],
        tintIncluded: Boolean(service.catalogCard?.tintIncluded),
        tintDetails: service.catalogCard?.tintDetails?.trim() || null,
        undercoatingIncluded: Boolean(service.catalogCard?.undercoatingIncluded),
        undercoatingDetails: service.catalogCard?.undercoatingDetails?.trim() || null,
        undercoatingSavingsLabel: service.catalogCard?.undercoatingSavingsLabel?.trim() || null,
        originalPrice,
        bundlePrice,
        bundleLabel: hasPublishedBundle
          ? `${getPackageDisplayName(service.name)} + ${addonLabel}`
          : null,
        promotionPercent,
        price,
      } satisfies BookingCatalogPackage;
    })
    .filter((pkg): pkg is BookingCatalogPackage => pkg !== null)
    .sort((a, b) => {
      const aOrder = a.service.displayOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.service.displayOrder ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    }), [services, vehicleType]);

  useEffect(() => {
    if (!selectedPkg || servicesLoading || servicesError) return;
    const currentService = services.find((service) =>
      getPackageKeyFromServiceName(service.name) === selectedPkg
    );
    const priceState = currentService
      ? getPublishedPriceState(currentService, vehicleType)
      : null;
    if (currentService && priceState?.status === 'available') {
      setSelectedService((current) => (
        current?.id === currentService.id && current.price === priceState.value
          ? current
          : { ...currentService, price: priceState.value }
      ));
      return;
    }
    if (selectedService) {
      setSelectedPkg(null);
      setSelectedService(null);
      if (draftDecisionResolved) {
        Toast.show('Your selected package is no longer available for this vehicle.', 'warning');
      }
    }
  }, [draftDecisionResolved, selectedPkg, selectedService, services, servicesError, servicesLoading, vehicleType]);

  const clearLocalDraftFields = useCallback(() => {
    const defaultVehicle = vehicles[0] ?? null;
    setStep(0);
    setSelectedVehicle(defaultVehicle);
    setVehicleType(getVehiclePriceKey(defaultVehicle?.vehicleType || ''));
    setSelectedService(null);
    setSelectedPkg(null);
    setSelectedDate(null);
    setSelectedTime(null);
    selectedDateRef.current = null;
    selectedTimeRef.current = null;
    setPhone(profile?.phone || backendUser?.phone || '');
    setNotes('');
    setDownpaymentProof(null);
    setAgreedToTerms(false);
    setTcScrolledToBottom(false);
    setIsSuccess(false);
    setShowAddVehicle(false);
    setShowVehiclePicker(false);
    setPackageDetailsKey(null);
    setIsContinuing(false);
    setIsPhoneEditing(false);
    setIsDetailsContinuing(false);
    setIsScheduleContinuing(false);
    setShowFullCalendar(false);
    setPhoneError('');
    setDraftDirty(false);
    restoredStepRef.current = null;
  }, [backendUser?.phone, profile?.phone, vehicles]);

  const selectPackage = useCallback((pkg: BookingCatalogPackage) => {
    if (pkg.price.status !== 'available') return;
    setSelectedPkg(pkg.key);
    setSelectedService({ ...pkg.service, price: pkg.price.value });
    setDraftDirty(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const applyPersistedDraft = useCallback((draft: BookingDraftV1) => {
    const draftVehicle = vehicles.find((vehicle) =>
      vehicle.id === draft.selectedVehicleId || vehicle._id === draft.selectedVehicleId
    ) ?? null;
    const resolvedVehicle = draftVehicle || vehicles[0] || null;
    const nextVehicleType = getVehiclePriceKey(resolvedVehicle?.vehicleType || '');
    const draftService = services.find((service) => service.id === draft.selectedServiceId)
      || services.find((service) => getPackageKeyFromServiceName(service.name) === draft.packageKey)
      || null;
    const packageKey = getPackageKeyFromServiceName(draftService?.name);
    const priceState = draftService
      ? getPublishedPriceState(draftService, nextVehicleType)
      : null;

    setSelectedVehicle(resolvedVehicle);
    setVehicleType(nextVehicleType);
    if (draftService && packageKey && priceState?.status === 'available') {
      setSelectedPkg(packageKey);
      setSelectedService({ ...draftService, price: priceState.value });
    } else {
      setSelectedPkg(null);
      setSelectedService(null);
    }
    setPhone(draft.phone || profile?.phone || backendUser?.phone || '');
    setNotes(draft.notes);
    setSelectedDate(draft.selectedDate);
    setSelectedTime(draft.selectedTime);
    setAgreedToTerms(false);
    setTcScrolledToBottom(false);
    setDownpaymentProof(null);

    let targetStep = Math.min(4, Math.max(0, draft.intendedStep));
    if (!draftVehicle || !draftService || priceState?.status !== 'available') targetStep = 0;
    else if (draft.phone.replace(/\D/g, '').length < 10) targetStep = Math.min(targetStep, 1);
    else if (targetStep > 2) {
      restoredStepRef.current = targetStep;
      targetStep = 2;
    }
    setStep(targetStep);
    setDraftDirty(true);
    setDraftDecisionResolved(true);
    setPendingDraft(null);
    prefillAppliedRef.current = true;

    if (!draftVehicle || !draftService) {
      Toast.show('Some saved booking details changed. Please review your vehicle and package.', 'warning');
    } else if (priceState?.status !== 'available') {
      Toast.show('Your saved package is no longer available for this vehicle.', 'warning');
    }
  }, [backendUser?.phone, profile?.phone, services, vehicles]);

  useFocusEffect(
    useCallback(() => {
      if (!draftOwnerId) {
        setDraftDecisionResolved(true);
        return undefined;
      }
      let active = true;
      setDraftDecisionResolved(false);
      setPendingDraft(null);
      draftPromptShownRef.current = false;
      prefillAppliedRef.current = false;
      void bookingDraftStorage.load(draftOwnerId)
        .then((draft) => {
          if (!active) return;
          setPendingDraft(draft);
          if (!draft) setDraftDecisionResolved(true);
        })
        .catch(() => {
          if (active) setDraftDecisionResolved(true);
        });
      return () => { active = false; };
    }, [draftOwnerId])
  );

  useEffect(() => {
    const draft = pendingDraft;
    if (
      !draft
      || draftPromptShownRef.current
      || vehiclesLoading
      || servicesLoading
      || Boolean(vehiclesError)
      || Boolean(servicesError)
    ) return;
    draftPromptShownRef.current = true;
    const hasIncomingSelection = Boolean(
      prefillParams.vehicleId || prefillParams.serviceId || prefillParams.pkg || prefillParams.notes
    );
    Alert.alert(
      'Resume booking?',
      hasIncomingSelection
        ? 'You have a saved booking. Resume it, or start with the new selection you just opened?'
        : 'Continue your saved AutoSPF+ booking, or start over?',
      [
        {
          text: hasIncomingSelection ? 'Use New Selection' : 'Start Over',
          style: 'destructive',
          onPress: async () => {
            try {
              await bookingDraftStorage.clear();
              clearLocalDraftFields();
              setPendingDraft(null);
              setDraftDecisionResolved(true);
            } catch {
              Toast.show('Unable to clear the saved booking. Please try again.', 'error');
              applyPersistedDraft(draft);
            }
          },
        },
        { text: 'Resume Booking', onPress: () => applyPersistedDraft(draft) },
      ],
      { cancelable: false },
    );
  }, [
    applyPersistedDraft,
    clearLocalDraftFields,
    pendingDraft,
    prefillParams,
    servicesError,
    servicesLoading,
    vehiclesError,
    vehiclesLoading,
  ]);

  // ── AI Scan Pre-fill ─────────────────────────────────────────────────
  // Optional deep-link query params let other screens (e.g. AI Scan flow)
  // launch the booking wizard with the vehicle, package, and notes already
  // filled, jumping the user past Step 1 ("Service") so they only have to
  // pick a date/time/payment.
  //
  // Supported params:
  //   ?vehicleId=<id>   — pre-select an existing vehicle
  //   ?serviceId=<id>   — pre-select an exact published backend service
  //   ?pkg=spf80|spf89|spf99|spf101 — pre-select an SPF package
  //   ?notes=<text>     — populate the notes field with the AI summary
  //   ?step=1|2|3       — advance to a later step (default 1 = "Details")
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    if (!prefillParams || vehiclesLoading || servicesLoading || !draftDecisionResolved) {
      return;
    }

    const requestedVehicleId = prefillParams.vehicleId
      ? String(prefillParams.vehicleId)
      : null;
    const requestedServiceId = prefillParams.serviceId
      ? String(prefillParams.serviceId)
      : null;
    const requestedPkg = prefillParams.pkg ? String(prefillParams.pkg).toLowerCase() : null;
    const requestedNotes = prefillParams.notes ? String(prefillParams.notes) : null;
    const requestedStep = prefillParams.step ? Number(prefillParams.step) : NaN;

    if (!requestedVehicleId && !requestedServiceId && !requestedPkg && !requestedNotes && !Number.isFinite(requestedStep)) {
      return;
    }

    if (requestedVehicleId && vehicles.length > 0) {
      const match = vehicles.find((v) => v.id === requestedVehicleId || v._id === requestedVehicleId);
      if (match) {
        setSelectedVehicle(match);
        setVehicleType(getVehiclePriceKey(match.vehicleType || ''));
      }
    }

    const priceVehicle = vehicles.find((vehicle) =>
      vehicle.id === requestedVehicleId || vehicle._id === requestedVehicleId
    ) || selectedVehicle || vehicles[0];
    const requestedService = requestedServiceId
      ? services.find((service) => service.id === requestedServiceId)
      : requestedPkg
        ? services.find((service) => getPackageKeyFromServiceName(service.name) === requestedPkg)
        : null;
    const requestedServicePackageKey = getPackageKeyFromServiceName(requestedService?.name);
    let prefillCanAdvance = false;
    if (requestedService && requestedServicePackageKey && priceVehicle) {
      const priceState = getPublishedPriceState(
        requestedService,
        getVehiclePriceKey(priceVehicle.vehicleType || ''),
      );
      if (priceState.status === 'available') {
        setSelectedPkg(requestedServicePackageKey);
        setSelectedService({ ...requestedService, price: priceState.value });
        prefillCanAdvance = true;
      }
    }

    if (requestedNotes) {
      setNotes(requestedNotes);
    }

    if (Number.isFinite(requestedStep) && requestedStep > 0 && prefillCanAdvance) {
      setTimeout(() => setStep(Math.min(5, Math.max(0, requestedStep))), 120);
    } else if (Number.isFinite(requestedStep) && requestedStep > 0) {
      Toast.show('Please choose an available vehicle and package to continue.', 'warning');
    }

    setDraftDirty(true);
    prefillAppliedRef.current = true;
  }, [draftDecisionResolved, prefillParams, vehicles, vehiclesLoading, services, servicesLoading, selectedVehicle]);

  // ── Navigation ──
  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDraftDirty(true);
    setStep((current) => Math.min(5, current + 1));
  };
  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep((s) => Math.max(0, s - 1));
  };

  const selectVehicle = useCallback((vehicle: Vehicle) => {
    const nextType = getVehiclePriceKey(vehicle.vehicleType || '');
    setSelectedVehicle(vehicle);
    setVehicleType(nextType);
    setShowVehiclePicker(false);
    setDraftDirty(true);

    if (selectedPkg) {
      const matchingService = services.find((service) =>
        getPackageKeyFromServiceName(service.name) === selectedPkg
      );
      const priceState = matchingService
        ? getPublishedPriceState(matchingService, nextType)
        : null;
      if (matchingService && priceState?.status === 'available') {
        setSelectedService({ ...matchingService, price: priceState.value });
      } else {
        setSelectedPkg(null);
        setSelectedService(null);
        Toast.show('Your selected package is not available for this vehicle type. Please choose another package.', 'warning');
      }
    }
    Haptics.selectionAsync();
  }, [selectedPkg, services]);

  const openVehicleEditor = useCallback((vehicle: Vehicle) => {
    setShowVehiclePicker(false);
    if (vehicleModalTransitionRef.current) clearTimeout(vehicleModalTransitionRef.current);
    vehicleModalTransitionRef.current = setTimeout(() => {
      setEditingVehicle(vehicle);
      vehicleModalTransitionRef.current = null;
    }, 240);
    Haptics.selectionAsync();
  }, []);

  const closeVehicleEditor = useCallback(() => {
    setEditingVehicle(null);
    if (vehicleModalTransitionRef.current) clearTimeout(vehicleModalTransitionRef.current);
    vehicleModalTransitionRef.current = setTimeout(() => {
      setShowVehiclePicker(true);
      vehicleModalTransitionRef.current = null;
    }, 240);
  }, []);

  const handleVehicleUpdated = useCallback((updatedVehicle: Vehicle) => {
    const updatedId = updatedVehicle._id || updatedVehicle.id;
    const selectedId = selectedVehicle?._id || selectedVehicle?.id;
    const wasSelected = Boolean(updatedId && selectedId && updatedId === selectedId);

    setVehicles((current) => current.map((vehicle) => (
      (vehicle._id || vehicle.id) === updatedId ? updatedVehicle : vehicle
    )));

    if (wasSelected) selectVehicle(updatedVehicle);
    closeVehicleEditor();
  }, [closeVehicleEditor, selectVehicle, selectedVehicle]);

  useEffect(() => () => {
    if (vehicleModalTransitionRef.current) clearTimeout(vehicleModalTransitionRef.current);
  }, []);

  const flushBookingDraft = useCallback(async () => {
    if (!draftOwnerId || !draftDecisionResolved || !draftDirty) return;
    await bookingDraftStorage.save({
      ownerId: draftOwnerId,
      intendedStep: step,
      selectedVehicleId: selectedVehicle?._id || selectedVehicle?.id || null,
      selectedServiceId: selectedService?.id || null,
      packageKey: selectedPkg,
      phone,
      notes,
      selectedDate,
      selectedTime,
    });
  }, [
    draftDecisionResolved,
    draftDirty,
    draftOwnerId,
    notes,
    phone,
    selectedDate,
    selectedPkg,
    selectedService?.id,
    selectedTime,
    selectedVehicle?._id,
    selectedVehicle?.id,
    step,
  ]);

  useEffect(() => {
    if (!draftDecisionResolved || !draftDirty) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      void flushBookingDraft().catch(() => undefined);
    }, 350);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
  }, [draftDecisionResolved, draftDirty, flushBookingDraft]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'inactive' || nextState === 'background') {
        void flushBookingDraft().catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [flushBookingDraft]);

  const leaveBooking = useCallback(() => {
    clearLocalDraftFields();
    setDraftDecisionResolved(false);
    router.replace('/(customer)');
  }, [clearLocalDraftFields, router]);

  const requestExit = useCallback(() => {
    if (!draftDirty) {
      leaveBooking();
      return;
    }
    Alert.alert(
      'Leave booking?',
      'Save this booking to resume later, or discard your selections.',
      [
        { text: 'Keep Booking', style: 'cancel' },
        {
          text: 'Discard Booking',
          style: 'destructive',
          onPress: async () => {
            try {
              await bookingDraftStorage.clear();
              setDraftDirty(false);
              leaveBooking();
            } catch {
              Toast.show('Unable to discard the saved booking. Please try again.', 'error');
            }
          },
        },
        {
          text: 'Save & Exit',
          onPress: () => {
            void flushBookingDraft()
              .then(leaveBooking)
              .catch(() => Toast.show('Unable to save your booking. Please try again.', 'error'));
          },
        },
      ],
    );
  }, [draftDirty, flushBookingDraft, leaveBooking]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (packageDetailsKey) {
        closePackageDetails();
        return true;
      }
      if (showVehiclePicker) {
        setShowVehiclePicker(false);
        return true;
      }
      if (showAddVehicle) {
        setShowAddVehicle(false);
        return true;
      }
      if (step > 0) {
        goBack();
        return true;
      }
      requestExit();
      return true;
    });
    return () => subscription.remove();
  }, [closePackageDetails, packageDetailsKey, requestExit, showAddVehicle, showVehiclePicker, step]);

  const reset = () => {
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    void bookingDraftStorage.clear();
    clearLocalDraftFields();
  };
  const handleConfirm = async () => {
    const effectivePrice = selectedService?.price ?? null;
    const effectiveName = selectedService?.name || '';
    const selectedAvailability = selectedDate ? monthAvailability[selectedDate] : undefined;
    const selectedSlotStillAvailable = !!selectedTime
      && slotStatuses.some((slot) => slot.time === selectedTime && slot.status === 'AVAILABLE');
    if (
      !effectiveName
      || effectivePrice === null
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
        customerPhone: (phone || profile?.phone || backendUser?.phone || '').trim() || undefined,
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
        service: selectedService!,
        date: selectedDate,
        time: selectedTime,
        customerName: (profile?.full_name || '').trim(),
        customerPhone: (phone || profile?.phone || backendUser?.phone || '').trim(),
        notes: notes.trim() || undefined,
        vehiclePlate: selectedVehicle?.plateNumber,
        vehicleYear: selectedVehicle?.year?.toString(),
        vehicleMake: selectedVehicle?.make,
        vehicleModel: selectedVehicle?.model,
        vehicleColor: selectedVehicle?.color,
        vehicleId: selectedVehicle?._id || selectedVehicle?.id,
        downpaymentProof: downpaymentProof || undefined,
        reservationPaymentAmount: 500,
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
      const dailyCapacityReached = errorCode === 'DATE_FULL'
        || errorCode === 'DAILY_CAPACITY_REACHED'
        || errorCode === 'DAILY_CAPACITY_EXCEEDED';
      const conflictedTime = selectedTime;
      const message = emergencyClosed
        ? EMERGENCY_CLOSURE_MESSAGE
        : status === 409 && dailyCapacityReached && selectedDate
          ? `${formatIsoDateForDisplay(selectedDate)} is now fully booked. Choose another available date.`
        : status === 409 && conflictedTime
          ? `${conflictedTime} was just booked. Choose another available time to continue.`
        : getApiErrorMessage(error, 'Something went wrong. Please try again.');
      if (emergencyClosed || status === 409) {
        const affectedDate = selectedDate;
        selectedTimeRef.current = null;
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
              availableTimes: 0,
            },
          }));
        }
        const { year, month } = visibleCalendarMonthRef.current;
        void fetchMonthAvailability(year, month);
        if (affectedDate) {
          void fetchSlotsForDate(affectedDate).then(() => {
            if (selectedDateRef.current === affectedDate) setScheduleMessage(message);
          });
        }
      }
      Toast.show(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Computed ──
  const displayCustomerName = (profile?.full_name || '').trim();
  const displayCustomerPhone = (phone || profile?.phone || backendUser?.phone || '').trim();
  const profilePhoneDigits = String(profile?.phone || backendUser?.phone || '').replace(/\D/g, '');
  const phoneIsFromProfile = Boolean(profilePhoneDigits)
    && phone.replace(/\D/g, '') === profilePhoneDigits;

  const selectedDayAvailability = selectedDate ? monthAvailability[selectedDate] : undefined;
  const selectedTimeIsAvailable = !!selectedTime
    && slotStatuses.some((slot) => slot.time === selectedTime && slot.status === 'AVAILABLE');
  const scheduleIsKnownAvailable = !!selectedDate
    && selectedTimeIsAvailable
    && !slotsLoading
    && !monthAvailLoading
    && selectedDayAvailability?.status === 'available'
    && !selectedDayAvailability.unavailable
    && typeof selectedDayAvailability.remaining === 'number'
    && selectedDayAvailability.remaining > 0
    && typeof selectedDayAvailability.capacity === 'number'
    && selectedDayAvailability.capacity > 0
    && typeof selectedDayAvailability.booked === 'number';
  const canProceedStep0 = !vehiclesLoading
    && !servicesLoading
    && !vehiclesError
    && !servicesError
    && !!selectedVehicle
    && !!selectedService
    && Number.isFinite(selectedService.price);
  const canProceedStep1 = isValidPhilippineMobile(phone);                         // Details: valid PH mobile no.
  const canProceedStep2 = scheduleIsKnownAvailable
    && !!selectedVehicle
    && !!selectedService
    && !!selectedPkg
    && !isScheduleContinuing;                                                       // Schedule: server-confirmed date + time
  const canProceedStep3 = scheduleIsKnownAvailable;                                // Review remains guarded during live refresh
  const canProceedStep4 = agreedToTerms && tcScrolledToBottom && scheduleIsKnownAvailable;
  const canConfirmBooking = canProceedStep4 && scheduleIsKnownAvailable;
  const packageDetails = packageDetailsKey
    ? bookingPackages.find((pkg) => pkg.key === packageDetailsKey) ?? null
    : null;
  const packageDetailGroups = React.useMemo(() => {
    if (!packageDetails) return [];
    const grouped = new Map<string, PackageInclusion[]>();
    packageDetails.fullInclusions.forEach((inclusion) => {
      const items = grouped.get(inclusion.group) || [];
      items.push(inclusion);
      grouped.set(inclusion.group, items);
    });
    return Array.from(grouped.entries()).map(([title, inclusions]) => ({ title, inclusions }));
  }, [packageDetails]);
  const packageDetailsBadge = packageDetails ? getVisiblePackageBadge(packageDetails) : null;
  const selectedPackage = selectedPkg
    ? bookingPackages.find((pkg) => pkg.key === selectedPkg) ?? null
    : null;
  const selectedPackagePrice = selectedPackage?.price.status === 'available'
    ? selectedPackage.price.value
    : null;
  const stepOneGuidance = vehiclesLoading || servicesLoading
    ? 'Loading booking options'
    : vehiclesError || servicesError
      ? 'Retry loading to continue'
      : !selectedVehicle
        ? 'Select a vehicle to continue'
        : !selectedService
          ? 'Select a package to continue'
          : selectedPackage?.name ?? selectedService.name;

  const handleStepOneContinue = () => {
    if (!canProceedStep0 || isContinuing) return;
    setIsContinuing(true);
    setDraftDirty(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep(1);
  };

  const handleDetailsContinue = async () => {
    if (isDetailsContinuing) return;
    if (!isValidPhilippineMobile(phone)) {
      setPhoneError('Enter a valid Philippine mobile number.');
      setIsPhoneEditing(true);
      return;
    }
    if (!selectedVehicle || !selectedService || !selectedPkg) {
      Toast.show('Please review your vehicle and service selection.', 'warning');
      setStep(0);
      return;
    }

    setIsDetailsContinuing(true);
    try {
      invalidateCache('/customers/vehicles');
      invalidateCache('/services/published');
      const [freshVehicles, freshServices] = await Promise.all([
        vehicleService.getMyVehicles(),
        serviceService.getPublishedServices(),
      ]);
      setVehicles(freshVehicles);
      setServices(freshServices);

      const selectedVehicleId = selectedVehicle._id || selectedVehicle.id;
      const currentVehicle = freshVehicles.find((vehicle) =>
        vehicle._id === selectedVehicleId || vehicle.id === selectedVehicleId
      ) ?? null;
      if (!currentVehicle) {
        setSelectedVehicle(null);
        setSelectedService(null);
        setSelectedPkg(null);
        setStep(0);
        Toast.show('Your selected vehicle is no longer available. Please choose another vehicle.', 'warning');
        return;
      }

      const currentVehicleType = getVehiclePriceKey(currentVehicle.vehicleType || '');
      const currentService = freshServices.find((service) => service.id === selectedService.id)
        || freshServices.find((service) => getPackageKeyFromServiceName(service.name) === selectedPkg)
        || null;
      const currentPrice = currentService
        ? getPublishedPriceState(currentService, currentVehicleType)
        : null;

      setSelectedVehicle(currentVehicle);
      setVehicleType(currentVehicleType);
      if (!currentService || currentPrice?.status !== 'available') {
        setSelectedService(null);
        setSelectedPkg(null);
        setStep(0);
        Toast.show('Your selected package is no longer available for this vehicle.', 'warning');
        return;
      }

      const priceChanged = selectedService.price !== currentPrice.value;
      setSelectedService({ ...currentService, price: currentPrice.value });
      setDraftDirty(true);
      if (priceChanged) {
        Toast.show('Package pricing changed. Please review the updated total.', 'warning');
        return;
      }

      goNext();
    } catch (error) {
      Toast.show(getApiErrorMessage(error, 'Unable to verify your booking details. Please try again.'), 'error');
    } finally {
      setIsDetailsContinuing(false);
    }
  };

  const handleScheduleContinue = async () => {
    if (!canProceedStep2 || !selectedDate || !selectedTime || !selectedVehicle || !selectedService || !selectedPkg) {
      return;
    }

    const requestedDate = selectedDate;
    const requestedTime = selectedTime;
    const requestedVehicleId = selectedVehicle._id || selectedVehicle.id;
    setIsScheduleContinuing(true);

    try {
      invalidateCache('/customers/vehicles');
      invalidateCache('/services/published');
      const [availabilityResponse, freshVehicles, freshServices] = await Promise.all([
        apiClient.get(`/orders/available-slots?date=${requestedDate}`),
        vehicleService.getMyVehicles(),
        serviceService.getPublishedServices(),
      ]);

      if (selectedDateRef.current !== requestedDate || selectedTimeRef.current !== requestedTime) return;
      if (availabilityResponse.data?.success !== true) {
        throw new Error('Availability was not returned by the server.');
      }

      const normalized = normalizeAvailableSlotsPayload(availabilityResponse.data);
      const refreshedSlots = deriveSlotStatuses(
        normalized.slots,
        normalized.unavailable,
        normalized.errorCode,
      );
      const refreshedAvailableTimes = refreshedSlots.filter((slot) => slot.status === 'AVAILABLE').length;
      const refreshedDayAvailability = getDayAvailabilityFromSlots(
        undefined,
        normalized,
        refreshedAvailableTimes,
      );
      setSlotStatuses(refreshedSlots);
      setMonthAvailability((current) => ({
        ...current,
        [requestedDate]: getDayAvailabilityFromSlots(
          current[requestedDate],
          normalized,
          refreshedAvailableTimes,
        ),
      }));
      if (isIsoDate(normalized.businessDate)) setBusinessDate(normalized.businessDate);
      if (normalized.businessTimeZone) setBusinessTimeZone(normalized.businessTimeZone);

      const selectedSlot = refreshedSlots.find((slot) => slot.time === requestedTime);
      if (
        normalized.unavailable
        || refreshedDayAvailability.status !== 'available'
        || selectedSlot?.status !== 'AVAILABLE'
      ) {
        selectedTimeRef.current = null;
        setSelectedTime(null);
        setDraftDirty(true);
        const conflictMessage = normalized.emergencyClosed
          ? EMERGENCY_CLOSURE_MESSAGE
          : refreshedDayAvailability.status === 'full'
            ? `${formatIsoDateForDisplay(requestedDate)} is now fully booked. Choose another available date.`
            : refreshedDayAvailability.status === 'closed'
              ? `${formatIsoDateForDisplay(requestedDate)} is now closed. Choose another available date.`
              : selectedSlot?.status === 'FULL'
                ? `${requestedTime} was just booked. Choose another available time to continue.`
                : `${requestedTime} is no longer available. Choose another available time to continue.`;
        setScheduleMessage(conflictMessage);
        const { year, month } = visibleCalendarMonthRef.current;
        void fetchMonthAvailability(year, month);
        Toast.show(conflictMessage, normalized.emergencyClosed ? 'error' : 'warning');
        return;
      }
      if (!normalized.dailyAvailability) {
        const capacityMessage = 'Daily booking capacity could not be confirmed. Please try again.';
        setScheduleMessage(capacityMessage);
        Toast.show(capacityMessage, 'error');
        return;
      }

      const currentVehicle = freshVehicles.find((vehicle) =>
        vehicle._id === requestedVehicleId || vehicle.id === requestedVehicleId
      ) ?? null;
      if (!currentVehicle) {
        setVehicles(freshVehicles);
        setSelectedVehicle(null);
        setSelectedService(null);
        setSelectedPkg(null);
        setStep(0);
        Toast.show('Your selected vehicle is no longer available. Please choose another vehicle.', 'warning');
        return;
      }

      const currentVehicleType = getVehiclePriceKey(currentVehicle.vehicleType || '');
      const currentService = freshServices.find((service) => service.id === selectedService.id)
        || freshServices.find((service) => getPackageKeyFromServiceName(service.name) === selectedPkg)
        || null;
      const currentPrice = currentService
        ? getPublishedPriceState(currentService, currentVehicleType)
        : null;

      setVehicles(freshVehicles);
      setServices(freshServices);
      setSelectedVehicle(currentVehicle);
      setVehicleType(currentVehicleType);
      if (!currentService || currentPrice?.status !== 'available') {
        setSelectedService(null);
        setSelectedPkg(null);
        setStep(0);
        Toast.show('Your selected package is no longer available for this vehicle.', 'warning');
        return;
      }

      const priceChanged = selectedService.price !== currentPrice.value;
      setSelectedService({ ...currentService, price: currentPrice.value });
      setScheduleMessage('');
      setDraftDirty(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (priceChanged) {
        Toast.show('Package pricing was updated. Review the current total on the next step.', 'warning');
      }
      setStep(3);
    } catch (error) {
      Toast.show(getApiErrorMessage(error, 'Unable to verify this arrival time. Please try again.'), 'error');
    } finally {
      setIsScheduleContinuing(false);
    }
  };

  useEffect(() => {
    const targetStep = restoredStepRef.current;
    if (targetStep === null || step !== 2 || slotsLoading || monthAvailLoading) return;
    if (!selectedDate || !selectedDayAvailability) return;
    restoredStepRef.current = null;
    if (scheduleIsKnownAvailable) {
      setStep(targetStep);
    } else {
      Toast.show('Your saved appointment time changed. Please choose an available slot.', 'warning');
    }
  }, [
    monthAvailLoading,
    scheduleIsKnownAvailable,
    selectedDate,
    selectedDayAvailability,
    slotsLoading,
    step,
  ]);

  const availableTimeOptionCount = slotStatuses.filter((slot) => slot.status === 'AVAILABLE').length;
  const selectedDateParts = getSelectedDateParts(selectedDate);
  const timeOptionCountLabel = !selectedDate
    ? 'Select a date first'
    : slotsLoading
      ? 'Checking available start times'
      : selectedDayAvailability?.status === 'full' || selectedDayAvailability?.status === 'closed'
        ? '0 available start times'
        : `${availableTimeOptionCount} available start ${availableTimeOptionCount === 1 ? 'time' : 'times'}`;
  const selectedDateEmergencyClosed = selectedDayAvailability?.errorCode === 'EMERGENCY_CLOSED'
    || selectedDayAvailability?.closureType === 'emergency';
  const selectedDateCapacityLabel = !selectedDate
    ? ''
    : selectedDateEmergencyClosed
      ? 'Emergency closed'
      : selectedDayAvailability?.status === 'full'
        ? 'Fully booked'
        : selectedDayAvailability?.status === 'closed'
          ? 'Closed'
          : typeof selectedDayAvailability?.remaining === 'number'
            ? `${selectedDayAvailability.remaining} booking slot${selectedDayAvailability.remaining === 1 ? '' : 's'} remaining`
            : 'Checking daily capacity';
  const selectedServiceDuration = selectedPackage?.estimatedDuration
    || normalizeServiceDurationLabel(selectedService?.duration);
  const scheduleMessageIsConflict = /no longer available|just booked|now fully booked|emergency closure/i.test(scheduleMessage);

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
        <View style={{ height: insets.top }} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
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
                { icon: 'sparkles-outline', label: 'Service', value: `${selectedService?.name || '—'}${selectedService ? ` (${VEHICLE_OPTIONS.find(v => v.key === vehicleType)?.label})` : ''}` },
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
      <BookingWizardHeader
        current={step}
        topInset={insets.top}
        onBack={step === 0 ? requestExit : goBack}
        onClose={requestExit}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' && step !== 2 ? 'padding' : undefined}
      >
        <ScrollView
          style={ss.scroll}
          contentContainerStyle={[
            ss.content,
            {
              paddingBottom:
                step === 0
                  ? Math.max(stepOneDockHeight, 80) + 12
                  : step === 1
                    ? Math.max(stepTwoDockHeight, 76) + 12
                  : step === 2
                    ? Math.max(scheduleDockHeight, 92) + 12
                    : insets.bottom + 32,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios' && step === 2}
        >
          {/* ═══════════════════════════════════════════════════
              STEP 0 — CHOOSE SERVICE  (mirrors web Step 1 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 0 && (
            <Animated.View entering={FadeInDown.duration(200)} style={[ss.stepWrap, ss.stepOneWrap]}>

              {/* ── Hero ── */}
              <Animated.View entering={FadeInDown.delay(60).duration(200)} style={ss.heroSection}>
                <Text
                  style={ss.heroTitle}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                  minimumFontScale={0.86}
                >
                  Choose your service
                </Text>
                <Text style={ss.heroSub}>Select a package for your vehicle.</Text>
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
                  <View style={[svc.vehicleRow, skeleton.row]} accessibilityLabel="Loading vehicles">
                    <View style={[svc.vehicleIconWrap, skeleton.block]} />
                    <View style={{ flex: 1, gap: 8 }}>
                      <View style={[skeleton.line, { width: '58%' }]} />
                      <View style={[skeleton.lineSmall, { width: '34%' }]} />
                    </View>
                    <View style={[svc.radioOuter, skeleton.circle]} />
                  </View>
                ) : vehiclesError ? (
                  <View style={svc.inlineError}>
                    <Ionicons name="alert-circle-outline" size={18} color="#FCA5A5" />
                    <View style={{ flex: 1 }}>
                      <Text style={svc.inlineErrorTitle}>Unable to load your vehicles.</Text>
                      <Text style={svc.inlineErrorBody}>{vehiclesError}</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" onPress={() => void loadVehicles()} hitSlop={8}>
                      <Text style={svc.retryText}>Retry</Text>
                    </TouchableOpacity>
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
                  <View style={{ gap: 4 }}>
                    {selectedVehicle ? (
                      <TouchableOpacity
                        activeOpacity={0.86}
                        accessibilityRole="button"
                        accessibilityLabel={`Selected vehicle, ${selectedVehicle.make} ${selectedVehicle.model}. Change vehicle`}
                        onPress={() => setShowVehiclePicker(true)}
                        style={[svc.vehicleRow, svc.vehicleRowActive]}
                      >
                        <View style={[svc.vehicleIconWrap, svc.vehicleIconWrapActive]}>
                          <Ionicons name="car-sport-outline" size={20} color={ON_PRIMARY} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[svc.vehicleRowName, { color: '#FFFFFF' }]} numberOfLines={1}>
                            {`${selectedVehicle.make} ${selectedVehicle.model}`.trim()}
                          </Text>
                          <Text style={svc.vehicleRowType} numberOfLines={1}>
                            {VEHICLE_OPTIONS.find((option) => option.key === vehicleType)?.label || selectedVehicle.vehicleType || 'Vehicle'}
                          </Text>
                          <View style={svc.selectedVehicleMeta}>
                            <Ionicons name="checkmark-circle" size={13} color={PRIMARY} />
                            <Text style={svc.selectedVehicleMetaText}>Selected</Text>
                          </View>
                        </View>
                        <View style={svc.changeVehicleAction}>
                          <Text style={svc.changeVehicleText}>Change</Text>
                          <Ionicons name="chevron-forward" size={15} color={PRIMARY} />
                        </View>
                      </TouchableOpacity>
                    ) : null}

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
                visible={showAddVehicle || Boolean(editingVehicle)}
                vehicle={editingVehicle}
                onClose={() => {
                  if (editingVehicle) closeVehicleEditor();
                  else setShowAddVehicle(false);
                }}
                onVehicleAdded={(v) => {
                  setVehicles((prev) => [...prev, v]);
                  selectVehicle(v);
                  setShowAddVehicle(false);
                }}
                onVehicleUpdated={handleVehicleUpdated}
              />

              <Modal
                visible={showVehiclePicker}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={() => setShowVehiclePicker(false)}
              >
                <View style={vehiclePicker.overlay}>
                  <TouchableOpacity
                    activeOpacity={1}
                    accessibilityRole="button"
                    accessibilityLabel="Close vehicle selector"
                    onPress={() => setShowVehiclePicker(false)}
                    style={vehiclePicker.backdrop}
                  />
                  <View style={[vehiclePicker.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <View style={vehiclePicker.handle} />
                    <View style={vehiclePicker.header}>
                      <View>
                        <Text style={vehiclePicker.eyebrow}>YOUR GARAGE</Text>
                        <Text style={vehiclePicker.title}>Choose a vehicle</Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Close vehicle selector"
                        onPress={() => setShowVehiclePicker(false)}
                        style={vehiclePicker.closeButton}
                      >
                        <Ionicons name="close" size={19} color="#E4E4E7" />
                      </TouchableOpacity>
                    </View>
                    <ScrollView contentContainerStyle={vehiclePicker.list} showsVerticalScrollIndicator={false}>
                      {vehicles.map((vehicle) => {
                        const active = selectedVehicle?.id === vehicle.id || selectedVehicle?._id === vehicle._id;
                        const typeLabel = VEHICLE_OPTIONS.find((option) =>
                          option.key === getVehiclePriceKey(vehicle.vehicleType || '')
                        )?.label || vehicle.vehicleType || 'Vehicle';
                        return (
                          <View
                            key={vehicle.id || vehicle._id}
                            style={[vehiclePicker.row, active && vehiclePicker.rowActive]}
                          >
                            <TouchableOpacity
                              activeOpacity={0.84}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: active }}
                              accessibilityLabel={`${vehicle.make} ${vehicle.model}, ${typeLabel}`}
                              onPress={() => selectVehicle(vehicle)}
                              style={vehiclePicker.selectArea}
                            >
                              <Ionicons name="car-sport-outline" size={19} color={active ? PRIMARY : '#A1A1AA'} />
                              <View style={{ flex: 1 }}>
                                <Text style={vehiclePicker.rowTitle}>{`${vehicle.make} ${vehicle.model}`.trim()}</Text>
                                <Text style={vehiclePicker.rowSubtitle}>{typeLabel}</Text>
                              </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                              activeOpacity={0.72}
                              accessibilityRole="button"
                              accessibilityLabel={`Edit ${vehicle.make} ${vehicle.model}`}
                              onPress={() => openVehicleEditor(vehicle)}
                              style={vehiclePicker.editAction}
                              hitSlop={{ top: 6, bottom: 6 }}
                            >
                              <Ionicons name="pencil-outline" size={13} color={PRIMARY} />
                              <Text style={vehiclePicker.editText}>Edit</Text>
                              <Ionicons name="chevron-forward" size={12} color={PRIMARY} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              activeOpacity={0.75}
                              accessibilityRole="radio"
                              accessibilityState={{ checked: active }}
                              accessibilityLabel={`${active ? 'Selected' : 'Select'} ${vehicle.make} ${vehicle.model}`}
                              onPress={() => selectVehicle(vehicle)}
                              style={vehiclePicker.radioAction}
                            >
                              <View style={[svc.radioOuter, active && svc.radioOuterActive]}>
                                {active ? <View style={svc.radioInner} /> : null}
                              </View>
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </ScrollView>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      onPress={() => {
                        setShowVehiclePicker(false);
                        setShowAddVehicle(true);
                      }}
                      style={vehiclePicker.addButton}
                    >
                      <Ionicons name="add" size={18} color={ON_PRIMARY} />
                      <Text style={vehiclePicker.addButtonText}>Add another vehicle</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Modal>

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
                ) : servicesLoading ? (
                  <View style={{ gap: 10 }} accessibilityLabel="Loading packages">
                    {[0, 1].map((item) => (
                      <View key={item} style={[pkgCard.base, skeleton.packageCard]}>
                        <View style={[skeleton.lineSmall, { width: '28%' }]} />
                        <View style={[skeleton.line, { width: '66%', marginTop: 12 }]} />
                        <View style={[skeleton.lineLarge, { width: '42%', marginTop: 10 }]} />
                        <View style={[skeleton.lineSmall, { width: '76%', marginTop: 14 }]} />
                        <View style={[skeleton.lineSmall, { width: '68%', marginTop: 8 }]} />
                      </View>
                    ))}
                  </View>
                ) : servicesError ? (
                  <View style={svc.inlineError}>
                    <Ionicons name="alert-circle-outline" size={18} color="#FCA5A5" />
                    <View style={{ flex: 1 }}>
                      <Text style={svc.inlineErrorTitle}>Unable to load packages.</Text>
                      <Text style={svc.inlineErrorBody}>{servicesError}</Text>
                    </View>
                    <TouchableOpacity accessibilityRole="button" onPress={() => void retryServices()} hitSlop={8}>
                      <Text style={svc.retryText}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                ) : bookingPackages.filter((pkg) => pkg.price.status !== 'unavailable').length === 0 ? (
                  <View style={svc.packageLockedCard}>
                    <Ionicons name="information-circle-outline" size={20} color={MUTED} />
                    <Text style={svc.packageLockedText}>No packages are available for this vehicle right now.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {bookingPackages.filter((pkg) => pkg.price.status !== 'unavailable').map((pkg, idx) => {
                      const isSelected = selectedPkg === pkg.key;
                      const visibleBadge = getVisiblePackageBadge(pkg);
                      const packageSummary = pkg.tagline || pkg.description;
                      const compactFeatures = pkg.features
                        .slice(0, 3)
                        .map(getPackageFeatureParts);
                      const priceLabel = pkg.price.status === 'available'
                        ? `₱${pkg.price.value.toLocaleString()}`
                        : 'Unable to load price';
                      return (
                        <Animated.View
                          key={pkg.key}
                          entering={FadeInDown.delay(idx * 40).duration(200)}
                          style={[
                            pkgCard.base,
                            isSelected && pkgCard.selected,
                          ]}
                        >
                          <PackageSelectButton
                            label={`${pkg.name}, ${priceLabel}`}
                            selected={isSelected}
                            disabled={pkg.price.status !== 'available'}
                            onPress={() => selectPackage(pkg)}
                          >
                            <View style={pkgCard.topRow}>
                              <Text style={pkgCard.tier}>{pkg.tier.toUpperCase()}</Text>
                              {visibleBadge ? (
                                <View
                                  style={[
                                    pkgCard.badge,
                                    {
                                      borderColor: `${pkg.badgeColor}55`,
                                      backgroundColor: `${pkg.badgeColor}16`,
                                    },
                                  ]}
                                >
                                  <Text style={[pkgCard.badgeText, { color: pkg.badgeColor }]}>{visibleBadge}</Text>
                                </View>
                              ) : null}
                            </View>

                            <View style={pkgCard.nameRow}>
                              <Text style={pkgCard.name} numberOfLines={2}>{pkg.name}</Text>
                              {isSelected ? (
                                <PackageCheck size={26} checkSize={14} treatment="selected" />
                              ) : (
                                <View style={pkgCard.checkCircle} />
                              )}
                            </View>

                            <Text style={[pkgCard.price, pkg.price.status === 'error' && pkgCard.priceError]}>
                              {priceLabel}
                            </Text>

                            {packageSummary ? (
                              <Text style={pkgCard.tagline} numberOfLines={2} ellipsizeMode="tail">
                                {packageSummary}
                              </Text>
                            ) : null}

                            {pkg.protection || pkg.estimatedDuration ? (
                              <View style={pkgCard.metadataRow}>
                                {pkg.protection ? (
                                  <View style={pkgCard.metadataPill}>
                                    <Ionicons name="shield-checkmark-outline" size={12} color={PRIMARY} />
                                    <Text style={pkgCard.metadataText}>{pkg.protection}</Text>
                                  </View>
                                ) : null}
                                {pkg.estimatedDuration ? (
                                  <View style={[pkgCard.metadataPill, pkgCard.metadataPillNeutral]}>
                                    <Ionicons name="time-outline" size={12} color="#A1A1AA" />
                                    <Text style={[pkgCard.metadataText, pkgCard.metadataTextNeutral]}>
                                      {pkg.estimatedDuration} Service
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            ) : null}

                            {compactFeatures.length ? (
                              <View style={pkgCard.featurePreview}>
                                {compactFeatures.map((feature) => (
                                  <View key={`${pkg.key}-${feature.title}`} style={pkgCard.featureRow}>
                                    <PackageCheck size={14} checkSize={9} treatment="inclusion" />
                                    <Text style={pkgCard.featureText}>{feature.title}</Text>
                                  </View>
                                ))}
                              </View>
                            ) : null}
                          </PackageSelectButton>

                          {pkg.price.status === 'error' ? (
                            <TouchableOpacity
                              accessibilityRole="button"
                              accessibilityLabel={`Retry pricing for ${pkg.name}`}
                              onPress={() => void retryServices()}
                              style={pkgCard.priceRetry}
                            >
                              <Ionicons name="refresh" size={13} color={PRIMARY} />
                              <Text style={pkgCard.priceRetryText}>Retry pricing</Text>
                            </TouchableOpacity>
                          ) : null}

                          <View style={pkgCard.divider} />
                          <TouchableOpacity
                            activeOpacity={0.72}
                            accessibilityRole="button"
                            accessibilityLabel={`View full details for ${pkg.name}`}
                            onPress={() => setPackageDetailsKey(pkg.key)}
                            style={pkgCard.detailsButton}
                          >
                            <Text style={pkgCard.detailsButtonText}>View package details</Text>
                            <Ionicons name="chevron-forward" size={12} color="rgba(255,183,125,0.64)" />
                          </TouchableOpacity>
                        </Animated.View>
                      );
                    })}
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          )}


          {/* ═══════════════════════════════════════════════════
              STEP 1 — YOUR DETAILS  (web Step 2 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 1 && (() => {
            const effectivePrice: number = selectedService?.price ?? 0;
            const effectiveName = selectedService?.name || '—';
            const vehicleTypeLabel = VEHICLE_OPTIONS.find((option) => option.key === vehicleType)?.label
              || selectedVehicle?.vehicleType
              || 'Vehicle';
            const serviceMetadata = [
              selectedPackage?.protection,
              selectedPackage?.estimatedDuration ? `${selectedPackage.estimatedDuration} Service` : null,
            ].filter(Boolean).join(' · ');
            return (
              <Animated.View entering={FadeInDown.duration(200)} style={[ss.stepWrap, dt.stepWrap]}>
                <View style={dt.pageHeader}>
                  <Text style={dt.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.88}>
                    Review your details
                  </Text>
                  <Text style={dt.pageSubtitle}>Confirm your information before continuing.</Text>
                </View>

                {/* ── Customer Info ── */}
                <Animated.View entering={FadeInDown.delay(80).duration(200)}>
                  <DetailsSectionHeader icon="person-outline" label="CUSTOMER" />
                  <View style={dt.summaryCard}>
                    <Text style={dt.customerName} numberOfLines={1}>{displayCustomerName || '—'}</Text>
                    {isPhoneEditing ? (
                      <View style={dt.phoneEditBlock}>
                        <Text style={dt.editLabel}>
                          CONTACT NUMBER <Text style={dt.requiredMark}>*</Text>
                        </Text>
                        <View style={[dt.phoneInputRow, phoneError && dt.phoneInputRowError]}>
                          <Ionicons name="call-outline" size={15} color="#8B8B94" />
                          <TextInput
                            autoFocus
                            value={phone}
                            onChangeText={(value) => {
                              setPhone(value);
                              setPhoneError('');
                              setDraftDirty(true);
                            }}
                            onSubmitEditing={() => {
                              if (!isValidPhilippineMobile(phone)) {
                                setPhoneError('Enter a valid Philippine mobile number.');
                                return;
                              }
                              setIsPhoneEditing(false);
                            }}
                            keyboardType="phone-pad"
                            returnKeyType="done"
                            maxLength={18}
                            placeholder="09XXXXXXXXX"
                            placeholderTextColor="#55555F"
                            style={dt.phoneInput}
                          />
                          <TouchableOpacity
                            accessibilityRole="button"
                            accessibilityLabel="Save contact number"
                            hitSlop={8}
                            onPress={() => {
                              if (!isValidPhilippineMobile(phone)) {
                                setPhoneError('Enter a valid Philippine mobile number.');
                                return;
                              }
                              setIsPhoneEditing(false);
                            }}
                          >
                            <Text style={dt.doneText}>Done</Text>
                          </TouchableOpacity>
                        </View>
                        {phoneError ? <Text style={dt.errorText}>{phoneError}</Text> : null}
                      </View>
                    ) : (
                      <View style={dt.phoneReviewRow}>
                        <Text style={dt.customerPhone}>{formatPhilippineMobile(displayCustomerPhone)}</Text>
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel="Edit contact number"
                          hitSlop={8}
                          onPress={() => setIsPhoneEditing(true)}
                          style={dt.inlineAction}
                        >
                          <Text style={dt.inlineActionText}>Edit</Text>
                          <Ionicons name="chevron-forward" size={12} color="rgba(255,183,125,0.64)" />
                        </TouchableOpacity>
                      </View>
                    )}
                    <Text style={dt.helperText}>
                      {phoneIsFromProfile ? 'From your profile' : 'Contact number for this booking'}
                    </Text>
                  </View>
                </Animated.View>

                {/* ── Vehicle summary ── */}
                <Animated.View entering={FadeInDown.delay(140).duration(200)}>
                  <DetailsSectionHeader icon="car-outline" label="VEHICLE" actionLabel="Change" onAction={() => setStep(0)} />
                  <View style={dt.summaryCard}>
                    <View style={dt.vehicleIdentity}>
                      <View style={dt.vehicleIcon}>
                        <Ionicons name="car-sport-outline" size={18} color="rgba(255,183,125,0.82)" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={dt.vehicleName} numberOfLines={1}>
                          {[selectedVehicle?.make, selectedVehicle?.model].filter(Boolean).join(' ') || '—'}
                        </Text>
                        <Text style={dt.vehicleType}>{vehicleTypeLabel}</Text>
                      </View>
                    </View>
                    <View style={dt.cardDivider} />
                    <View style={dt.vehicleDetails}>
                      {[
                        { label: 'Brand', value: selectedVehicle?.make || '—' },
                        { label: 'Model', value: selectedVehicle?.model || '—' },
                        { label: 'Color', value: selectedVehicle?.color || '—' },
                        { label: 'Plate', value: selectedVehicle?.plateNumber?.toUpperCase() || '—' },
                      ].map((item, index, items) => (
                        <React.Fragment key={item.label}>
                          <View style={dt.detailRow}>
                            <Text style={dt.detailLabel}>{item.label}</Text>
                            <Text style={dt.detailValue} numberOfLines={1}>{item.value}</Text>
                          </View>
                          {index < items.length - 1 ? <View style={dt.detailDivider} /> : null}
                        </React.Fragment>
                      ))}
                    </View>
                  </View>
                </Animated.View>

                {/* ── Service summary ── */}
                <Animated.View entering={FadeInDown.delay(200).duration(200)}>
                  <DetailsSectionHeader icon="shield-checkmark-outline" label="SERVICE" actionLabel="Change" onAction={() => setStep(0)} />
                  <View style={[dt.summaryCard, dt.serviceCard]}>
                    <Text style={dt.serviceName} numberOfLines={2}>{effectiveName}</Text>
                    {serviceMetadata ? <Text style={dt.serviceMetadata}>{serviceMetadata}</Text> : null}
                    <Text style={dt.servicePrice}>₱{effectivePrice.toLocaleString()}</Text>
                  </View>
                </Animated.View>
              </Animated.View>
            );
          })()}

          {/* ═══════════════════════════════════════════════════
              STEP 2 — SCHEDULE  (web Step 3 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 2 && (
            <Animated.View entering={FadeInDown.duration(200)} style={[ss.stepWrap, sch.scheduleWrap]}>

              <View style={sch.pageHeading}>
                <Text style={sch.pageTitle}>Choose a date &amp; time</Text>
                <Text style={sch.pageSubtitle}>Select an available appointment.</Text>
              </View>

              <UpcomingDateRail
                selectedDate={selectedDate}
                businessDate={businessDate}
                monthAvailability={monthAvailability}
                loading={monthAvailLoading}
                calendarOpen={showFullCalendar}
                onSelectDate={selectScheduleDate}
                onToggleCalendar={() => setShowFullCalendar((current) => !current)}
              />

              {showFullCalendar ? (
                <Animated.View entering={FadeInDown.duration(160)} style={sch.fullCalendarSurface}>
                  <MonthCalendar
                    selectedDate={selectedDate}
                    onSelectDate={(_dateKey, iso) => {
                      selectScheduleDate(iso);
                      setShowFullCalendar(false);
                    }}
                    monthAvailability={monthAvailability}
                    loading={monthAvailLoading}
                    businessDate={businessDate}
                    onMonthChange={(y, m) => {
                      visibleCalendarMonthRef.current = { year: y, month: m };
                      void fetchMonthAvailability(y, m);
                    }}
                  />
                </Animated.View>
              ) : null}

              <View style={sch.sectionCard}>
                {selectedDate && selectedDateParts ? (
                  <View style={sch.selectedDateSummary}>
                    <Text style={sch.selectedDateLabel}>SELECTED DATE</Text>
                    <Text style={sch.selectedDateText}>{formatScheduleSelectedDate(selectedDate)}</Text>
                    <View style={sch.dailyCapacityRow}>
                      <View style={sch.availabilityRow}>
                        <View style={[
                          sch.availabilityDot,
                          (!selectedDayAvailability || slotsLoading) && sch.availabilityDotPending,
                          selectedDayAvailability?.status === 'full' && sch.availabilityDotFull,
                          selectedDayAvailability?.status === 'closed' && sch.availabilityDotClosed,
                          selectedDateEmergencyClosed && sch.availabilityDotEmergency,
                        ]} />
                        <Text style={[
                          sch.dailyCapacityText,
                          selectedDayAvailability?.status === 'available' && sch.dailyCapacityTextAvailable,
                          selectedDateEmergencyClosed && sch.dailyCapacityTextEmergency,
                        ]}>{selectedDateCapacityLabel}</Text>
                      </View>
                    </View>
                    <Text style={sch.availableStartTimesText}>{timeOptionCountLabel}</Text>
                  </View>
                ) : null}

                <View style={sch.timeSectionHeader}>
                  <View style={sch.timeSectionTitleRow}>
                    <Text style={sch.timeSectionLabel}>ARRIVAL TIME</Text>
                    <Text style={sch.timeRequirement}>Required</Text>
                  </View>
                  <Text style={sch.timeOptionCount}>{timeOptionCountLabel}</Text>
                  <Text style={sch.timeSectionHint}>Choose when you&apos;ll bring your vehicle in.</Text>
                  {selectedServiceDuration ? (
                    <Text style={sch.serviceDuration}>Estimated service duration: {selectedServiceDuration}</Text>
                  ) : null}
                </View>

                {!!scheduleMessage && (
                  <View style={[sch.scheduleMessage, scheduleMessageIsConflict && sch.scheduleMessageConflict]}>
                    <Ionicons
                      name={scheduleMessageIsConflict ? 'alert-circle-outline' : 'information-circle-outline'}
                      size={16}
                      color={scheduleMessageIsConflict ? '#F87171' : PRIMARY}
                    />
                    <Text style={[sch.scheduleMessageText, scheduleMessageIsConflict && sch.scheduleMessageTextConflict]}>
                      {scheduleMessage}
                    </Text>
                  </View>
                )}

                {!selectedDate ? (
                  <View style={sch.inlineState}>
                    <Ionicons name="time-outline" size={22} color="#A1A1AA" />
                    <View style={sch.inlineStateCopy}>
                      <Text style={sch.inlineStateTitle}>Select a date to view available times</Text>
                      <Text style={sch.inlineStateText}>Available dates are marked in the calendar.</Text>
                    </View>
                  </View>
                ) : selectedDayAvailability?.status === 'full' ? (
                  <View style={sch.inlineState}>
                    <Ionicons name="calendar-outline" size={22} color="#A1A1AA" />
                    <View style={sch.inlineStateCopy}>
                      <Text style={sch.inlineStateTitle}>Fully booked</Text>
                      <Text style={sch.inlineStateText}>Choose another available date.</Text>
                    </View>
                  </View>
                ) : selectedDayAvailability?.status === 'closed' ? (
                  <View style={sch.inlineState}>
                    <Ionicons
                      name="calendar-outline"
                      size={22}
                      color={selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED' ? '#EF4444' : '#A1A1AA'}
                    />
                    <View style={sch.inlineStateCopy}>
                      <Text style={[
                        sch.inlineStateTitle,
                        selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED' && { color: '#FCA5A5' },
                      ]}>
                        {selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED'
                          ? 'Emergency closure'
                          : 'Closed on this date'}
                      </Text>
                      <Text style={sch.inlineStateText}>
                        {selectedDayAvailability.errorCode === 'EMERGENCY_CLOSED'
                          ? EMERGENCY_CLOSURE_MESSAGE
                          : 'Choose another available date.'}
                      </Text>
                    </View>
                  </View>
                ) : slotsLoading ? (
                  <View
                    style={sch.slotSkeletonGrid}
                    accessibilityRole="progressbar"
                    accessibilityLabel="Checking available times"
                  >
                    {[0, 1, 2, 3].map((item) => (
                      <View key={item} style={sch.slotSkeleton} />
                    ))}
                  </View>
                ) : slotStatuses.length === 0 ? (
                  <View style={sch.inlineState}>
                    <Ionicons name="calendar-outline" size={22} color="#A1A1AA" />
                    <View style={sch.inlineStateCopy}>
                      <Text style={sch.inlineStateTitle}>No openings on this date</Text>
                      <Text style={sch.inlineStateText}>Choose another available date.</Text>
                    </View>
                  </View>
                ) : (
                  <Animated.View entering={FadeInDown.delay(80).duration(200)}>
                    <View style={s2.timeGrid}>
                      {slotStatuses.map(({ time: t, status }) => (
                        <TimeSlotButton
                          key={t}
                          time={t}
                          status={status}
                          selected={selectedTime === t}
                          onSelect={() => {
                            selectedTimeRef.current = t;
                            setSelectedTime(t);
                            setScheduleMessage('');
                            setDraftDirty(true);
                            Haptics.selectionAsync();
                          }}
                        />
                      ))}
                    </View>
                  </Animated.View>
                )}
              </View>

              {/* ── Notes ── */}
              <View style={sch.sectionCard}>
                <View style={sch.notesHeader}>
                  <Text style={sch.notesLabel}>Anything we should know?</Text>
                  <Text style={[sch.counter, notes.length > 180 && { color: '#EF4444' }]}>Optional · {notes.length}/200</Text>
                </View>
                <TextInput
                  style={sch.notesInput}
                  placeholder="Special requests, vehicle concerns, or arrival notes..."
                  placeholderTextColor="#71717A"
                  value={notes}
                  onChangeText={(value) => { setNotes(value); setDraftDirty(true); }}
                  maxLength={200}
                  multiline
                  numberOfLines={4}
                  scrollEnabled
                  returnKeyType="done"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  textAlignVertical="top"
                  accessibilityLabel="Optional booking notes"
                  onFocus={() => {
                    notesInputFocusedRef.current = true;
                    setIsNotesEditing(true);
                  }}
                  onBlur={() => {
                    notesInputFocusedRef.current = false;
                    if (!Keyboard.isVisible()) setIsNotesEditing(false);
                  }}
                />
              </View>

            </Animated.View>
          )}

          {/* ═══════════════════════════════════════════════════
              STEP 3 — REVIEW BOOKING  (web Step 4 of 6)
          ═══════════════════════════════════════════════════ */}
          {step === 3 && (() => {
            const effectivePrice: number = selectedService?.price ?? 0;
            const effectiveName  = selectedService?.name || '—';
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
            const effectivePrice: number = selectedService?.price ?? 0;
            const RESERVATION_FEE = 500;
            const balance = Math.max(0, effectivePrice - RESERVATION_FEE);
            const canSubmit = !!downpaymentProof && !isSubmitting && canConfirmBooking;
            return (
              <Animated.View entering={FadeInDown.duration(200)} style={ss.stepWrap}>
                <View style={ss.editorialHeader}>
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
                      try {
                        const result = await ImagePicker.launchImageLibraryAsync(PAYMENT_PROOF_PICKER_OPTIONS);
                        if (!result.canceled && result.assets[0]) {
                          setDownpaymentProof(paymentProofDataUrlFromAsset(result.assets[0]));
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                      } catch (error) {
                        Alert.alert('Receipt Not Selected', getApiErrorMessage(error));
                      }
                    }}
                  >
                    {downpaymentProof ? (
                      <>
                        <Image source={{ uri: downpaymentProof }} style={pay.proofThumb} resizeMode="contain" />
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

        {step === 2 && !isNotesEditing ? (
          <Animated.View
            entering={FadeInDown.duration(140)}
            exiting={FadeOutDown.duration(110)}
            style={[
              sch.actionDock,
              { paddingBottom: Math.max(insets.bottom, 12) },
            ]}
            onLayout={(event: LayoutChangeEvent) => setScheduleDockHeight(event.nativeEvent.layout.height)}
          >
            <View style={sch.dockContext} accessibilityLiveRegion="polite">
              <Text style={sch.dockContextDate} numberOfLines={1}>
                {selectedDate && selectedTime ? formatScheduleFooterDate(selectedDate) : 'Choose an arrival time'}
              </Text>
              {selectedDate && selectedTime ? <Text style={sch.dockContextTime}>{selectedTime}</Text> : null}
            </View>
            <View style={sch.dockActions}>
              <TouchableOpacity
                activeOpacity={0.68}
                onPress={goBack}
                style={sch.dockBackButton}
                accessibilityRole="button"
                accessibilityLabel="Go back to booking details"
              >
                <Ionicons name="chevron-back" size={17} color="#A1A1AA" />
                <Text style={sch.dockBackText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.82}
                disabled={!canProceedStep2}
                onPress={() => void handleScheduleContinue()}
                style={[
                  sch.dockContinueButton,
                  !canProceedStep2 && sch.dockContinueButtonDisabled,
                ]}
                accessibilityRole="button"
                accessibilityLabel={canProceedStep2
                  ? `Continue with ${formatScheduleFooterDate(selectedDate)} at ${selectedTime}`
                  : 'Choose an available date and arrival time to continue'}
                accessibilityState={{ disabled: !canProceedStep2, busy: isScheduleContinuing }}
              >
                {isScheduleContinuing ? (
                  <ActivityIndicator size="small" color={ON_PRIMARY} />
                ) : (
                  <>
                    <Text style={[
                      sch.dockContinueText,
                      !canProceedStep2 && sch.dockContinueTextDisabled,
                    ]}>Continue</Text>
                    <Ionicons
                      name="arrow-forward"
                      size={17}
                      color={canProceedStep2 ? ON_PRIMARY : '#71717A'}
                    />
                  </>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null}
      </KeyboardAvoidingView>

      {step === 0 ? (
        <View
          style={[
            bookingCta.container,
            { paddingBottom: Math.max(insets.bottom, 8) },
          ]}
          onLayout={(event: LayoutChangeEvent) => setStepOneDockHeight(event.nativeEvent.layout.height)}
        >
          <View style={bookingCta.summaryRow}>
            <Text
              style={[bookingCta.guidance, canProceedStep0 && bookingCta.guidanceReady]}
              numberOfLines={1}
            >
              {stepOneGuidance}
            </Text>
            {selectedPackagePrice !== null ? (
              <Text style={bookingCta.summaryPrice}>₱{selectedPackagePrice.toLocaleString()}</Text>
            ) : null}
          </View>
          <BookingContinueButton
            enabled={canProceedStep0}
            busy={isContinuing}
            accessibilityLabel={canProceedStep0
              ? `Continue with ${selectedPackage?.name || selectedService?.name}`
              : 'Continue to booking details'}
            onPress={handleStepOneContinue}
          />
        </View>
      ) : null}

      {step === 1 && !isPhoneEditing ? (
        <View
          style={[detailsDock.container, { paddingBottom: Math.max(insets.bottom, 8) }]}
          onLayout={(event: LayoutChangeEvent) => setStepTwoDockHeight(event.nativeEvent.layout.height)}
        >
          <TouchableOpacity
            activeOpacity={0.76}
            accessibilityRole="button"
            accessibilityLabel="Back to service selection"
            onPress={goBack}
            style={detailsDock.backButton}
          >
            <Ionicons name="chevron-back" size={16} color="#C6C6C7" />
            <Text style={detailsDock.backText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Continue to schedule"
            accessibilityState={{ disabled: !canProceedStep1, busy: isDetailsContinuing }}
            disabled={!canProceedStep1 || isDetailsContinuing}
            onPress={() => void handleDetailsContinue()}
            style={[
              detailsDock.continueButton,
              !canProceedStep1 && detailsDock.continueButtonDisabled,
            ]}
          >
            {isDetailsContinuing ? (
              <ActivityIndicator size="small" color={ON_PRIMARY} />
            ) : (
              <>
                <Text style={[
                  detailsDock.continueText,
                  !canProceedStep1 && detailsDock.continueTextDisabled,
                ]}>Continue</Text>
                <Ionicons
                  name="arrow-forward"
                  size={17}
                  color={canProceedStep1 ? ON_PRIMARY : '#85858D'}
                />
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={packageDetails !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closePackageDetails}
      >
        <View style={packageDetailsStyles.overlay}>
          <TouchableOpacity
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Close package details"
            onPress={closePackageDetails}
            style={packageDetailsStyles.backdrop}
          />

          {packageDetails ? (
            <RNAnimated.View
              style={[
                packageDetailsStyles.sheet,
                { paddingBottom: Math.max(insets.bottom, 16) },
                { transform: [{ translateY: packageSheetTranslateY }] },
              ]}
            >
              <View
                style={packageDetailsStyles.handleTouchArea}
                {...packageSheetPanResponder.panHandlers}
              >
                <View style={packageDetailsStyles.handle} />
              </View>
              <View style={packageDetailsStyles.header}>
                <View style={{ flex: 1 }}>
                  <View style={packageDetailsStyles.headerMetaRow}>
                    <Text style={packageDetailsStyles.eyebrow}>{packageDetails.tier}</Text>
                    {packageDetailsBadge ? (
                      <View
                        style={[
                          packageDetailsStyles.headerBadge,
                          {
                            borderColor: `${packageDetails.badgeColor}55`,
                            backgroundColor: `${packageDetails.badgeColor}16`,
                          },
                        ]}
                      >
                        <Text style={[packageDetailsStyles.headerBadgeText, { color: packageDetails.badgeColor }]}>
                          {packageDetailsBadge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={packageDetailsStyles.title}>{packageDetails.name}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Close package details"
                  onPress={closePackageDetails}
                  style={packageDetailsStyles.closeButton}
                >
                  <Ionicons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={packageDetailsStyles.scroll}
                contentContainerStyle={packageDetailsStyles.content}
                showsVerticalScrollIndicator={false}
              >
                <Text style={[
                  packageDetailsStyles.price,
                  packageDetails.price.status !== 'available' && packageDetailsStyles.priceUnavailable,
                ]}>
                  {packageDetails.price.status === 'available'
                    ? `₱${packageDetails.price.value.toLocaleString()}`
                    : 'Unable to load price'}
                </Text>
                {packageDetails.promotionPercent !== null && packageDetails.originalPrice !== null ? (
                  <View style={packageDetailsStyles.promotionRow}>
                    <View style={packageDetailsStyles.promotionBadge}>
                      <Text style={packageDetailsStyles.promotionBadgeText}>
                        {packageDetails.promotionPercent}% OFF PROMO
                      </Text>
                    </View>
                    <Text style={packageDetailsStyles.originalPrice}>
                      Original ₱{packageDetails.originalPrice.toLocaleString()}
                    </Text>
                  </View>
                ) : null}
                {packageDetails.tagline ? (
                  <Text style={packageDetailsStyles.tagline}>{packageDetails.tagline}</Text>
                ) : null}

                {packageDetails.protection || packageDetails.estimatedDuration ? (
                  <View style={packageDetailsStyles.specifications}>
                    {packageDetails.protection ? (
                      <View style={packageDetailsStyles.specificationColumn}>
                        <View style={packageDetailsStyles.specificationIcon}>
                          <Ionicons name="shield-checkmark-outline" size={17} color={PRIMARY} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={packageDetailsStyles.specificationLabel}>Protection</Text>
                          <Text style={packageDetailsStyles.specificationValue}>{packageDetails.protection}</Text>
                        </View>
                      </View>
                    ) : null}
                    {packageDetails.estimatedDuration ? (
                      <View style={packageDetailsStyles.specificationColumn}>
                        <View style={[packageDetailsStyles.specificationIcon, packageDetailsStyles.durationIcon]}>
                          <Ionicons name="time-outline" size={17} color="#A1A1AA" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={packageDetailsStyles.specificationLabel}>Estimated Service Time</Text>
                          <Text style={packageDetailsStyles.specificationValue}>{packageDetails.estimatedDuration}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {packageDetailGroups.length ? (
                  <View style={packageDetailsStyles.section}>
                    <Text style={packageDetailsStyles.sectionTitle}>What&apos;s included</Text>
                    <View style={packageDetailsStyles.detailGroups}>
                      {packageDetailGroups.map((group) => (
                        <View key={group.title} style={packageDetailsStyles.detailGroup}>
                          <Text style={packageDetailsStyles.groupTitle}>{group.title}</Text>
                          <View style={packageDetailsStyles.inclusionList}>
                            {group.inclusions.map((inclusion, inclusionIndex) => (
                              <View
                                key={`${group.title}-${inclusion.title}-${inclusionIndex}`}
                                style={packageDetailsStyles.inclusionRow}
                              >
                                <PackageCheck size={22} checkSize={12} treatment="inclusion" />
                                <View style={{ flex: 1 }}>
                                  <Text style={packageDetailsStyles.inclusionTitle}>{inclusion.title}</Text>
                                  {inclusion.detail ? (
                                    <Text style={packageDetailsStyles.inclusionDetail}>{inclusion.detail}</Text>
                                  ) : null}
                                  {inclusion.savingsLabel ? (
                                    <Text style={packageDetailsStyles.savings}>{inclusion.savingsLabel}</Text>
                                  ) : null}
                                </View>
                              </View>
                            ))}
                          </View>
                          {group.title === 'Paint Protection Film' && packageDetails.ppfCoverage.length ? (
                            <View style={packageDetailsStyles.coverageBlock}>
                              <Text style={packageDetailsStyles.coverageTitle}>PPF Coverage</Text>
                              <View style={packageDetailsStyles.coverageGrid}>
                                {packageDetails.ppfCoverage.map((area) => (
                                  <View key={area} style={packageDetailsStyles.coverageItem}>
                                    <View style={packageDetailsStyles.coverageDot} />
                                    <Text style={packageDetailsStyles.coverageText}>{area}</Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {packageDetails.description ? (
                  <View style={packageDetailsStyles.section}>
                    <Text style={packageDetailsStyles.sectionTitle}>Package notes</Text>
                    <Text style={packageDetailsStyles.description}>{packageDetails.description}</Text>
                  </View>
                ) : null}

                {packageDetails.bundleLabel && packageDetails.bundlePrice !== null ? (
                  <View style={packageDetailsStyles.section}>
                    <Text style={packageDetailsStyles.sectionTitle}>Related package</Text>
                    <View style={packageDetailsStyles.bundleRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={packageDetailsStyles.bundleName}>{packageDetails.bundleLabel}</Text>
                        <Text style={packageDetailsStyles.bundleNote}>Separate bundle · Not included in this package</Text>
                      </View>
                      <Text style={packageDetailsStyles.bundlePrice}>
                        ₱{packageDetails.bundlePrice.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </ScrollView>

              {selectedPkg === packageDetails.key ? (
                <View
                  accessibilityRole="text"
                  accessibilityLabel={`${packageDetails.name} is selected`}
                  style={packageDetailsStyles.selectedAction}
                >
                  <PackageCheck size={19} checkSize={12} treatment="selected" />
                  <Text style={packageDetailsStyles.selectedActionText}>Selected package</Text>
                </View>
              ) : packageDetails.price.status === 'available' ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${packageDetails.name}`}
                  onPress={() => {
                    selectPackage(packageDetails);
                    closePackageDetails();
                  }}
                >
                  <LinearGradient
                    colors={[PRIMARY_CTR, PRIMARY]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={packageDetailsStyles.selectButton}
                  >
                    <Text style={packageDetailsStyles.selectButtonText}>
                      Select package
                    </Text>
                    <Ionicons name="checkmark" size={18} color={ON_PRIMARY} />
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel="Retry package pricing"
                  onPress={() => void retryServices()}
                  style={packageDetailsStyles.retryAction}
                >
                  <Ionicons name="refresh" size={17} color={PRIMARY} />
                  <Text style={packageDetailsStyles.retryActionText}>Retry pricing</Text>
                </TouchableOpacity>
              )}
            </RNAnimated.View>
          ) : null}
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
  stepOneWrap: { gap: 20 },

  // ── Editorial Hero (Step 0) ──
  heroSection: {
    paddingTop: 6,
    paddingBottom: 2,
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
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.02 * 32,
    lineHeight: 36,
    marginBottom: 8,
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
    columnGap: 10,
    rowGap: 10,
  },
  timeSlotWrapper: {
    width: '48%',
  },
  timePill: {
    width: '100%',
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#121214',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
  },
  timePillSelected: {
    backgroundColor: 'rgba(255,140,0,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,140,0,0.58)',
  },
  timePillSelectedContent: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timePillContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  timeText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#E4E4E7',
    textAlign: 'center',
  },
  timeTextSelected: {
    color: '#F8F8F8',
    fontWeight: '700',
    fontSize: 15,
  },
  timeTextFull: { color: '#71717A' },
  timeTextClosed: { color: '#A1A1AA' },
  timeStatusBooked: { fontSize: 9, color: '#626269', fontWeight: '600' },
  timeStatusClosed: { fontSize: 9, color: '#A1A1AA', fontWeight: '600' },

  /* ── Time slot status variants ── */
  timePillFull: {
    backgroundColor: '#0D0D0F',
    borderColor: 'rgba(255,255,255,0.045)',
    opacity: 0.46,
  },
  timePillClosed: {
    backgroundColor: '#0D0D0F',
    borderColor: 'rgba(255,255,255,0.05)',
    opacity: 0.42,
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
  proofThumb: { ...StyleSheet.absoluteFillObject, backgroundColor: '#050507', opacity: 0.62 },
  proofOverlay: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(13,13,18,0.82)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: GHOST,
  },
  proofOverlayText: { fontSize: 12, fontWeight: '600', color: SECONDARY },

  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  infoText: { flex: 1, fontSize: 12, color: '#A1A1AA', lineHeight: 19 },
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
  stepWrap: {
    gap: 22,
  },
  pageHeader: {
    paddingTop: 5,
    paddingBottom: 1,
  },
  pageTitle: {
    color: '#F7F7F8',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.55,
  },
  pageSubtitle: {
    color: '#77777F',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    marginTop: 6,
  },
  summaryCard: {
    backgroundColor: '#121216',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  customerName: {
    color: '#F4F4F5',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
  },
  phoneReviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 7,
  },
  customerPhone: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 36,
  },
  inlineActionText: {
    color: 'rgba(255,183,125,0.68)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  helperText: {
    color: '#66666E',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '500',
    marginTop: 5,
  },
  phoneEditBlock: {
    marginTop: 10,
  },
  editLabel: {
    color: '#77777F',
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '600',
    letterSpacing: 0.65,
    marginBottom: 6,
  },
  requiredMark: {
    color: '#F87171',
  },
  phoneInputRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: '#0C0C0F',
    paddingHorizontal: 12,
  },
  phoneInputRowError: {
    borderColor: 'rgba(248,113,113,0.50)',
  },
  phoneInput: {
    flex: 1,
    height: 44,
    paddingVertical: 0,
    color: '#F4F4F5',
    fontSize: 14,
    fontWeight: '500',
  },
  doneText: {
    color: PRIMARY,
    fontSize: 11,
    fontWeight: '700',
  },
  errorText: {
    color: '#F87171',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    marginTop: 6,
  },
  vehicleIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  vehicleIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,183,125,0.07)',
  },
  vehicleName: {
    color: '#F4F4F5',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  vehicleType: {
    color: '#77777F',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 1,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 13,
  },
  vehicleDetails: {
    gap: 0,
  },
  detailRow: {
    minHeight: 31,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },
  detailLabel: {
    color: '#71717A',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '400',
  },
  detailValue: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    textAlign: 'right',
  },
  detailDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  serviceCard: {
    paddingVertical: 16,
  },
  serviceName: {
    color: '#F4F4F5',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  serviceMetadata: {
    color: '#77777F',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
    marginTop: 4,
  },
  servicePrice: {
    color: PRIMARY,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    marginTop: 12,
  },
});

const s1 = StyleSheet.create({
  sectionHeaderRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: 'rgba(255,183,125,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    color: '#8B8B94',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.65,
  },
  changeAction: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeActionText: {
    color: 'rgba(255,183,125,0.64)',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
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

// ── Schedule step — quiet automotive cockpit composition ──────────────────
const sch = StyleSheet.create({
  scheduleWrap: {
    gap: 20,
  },
  pageHeading: { gap: 4, marginBottom: 1 },
  pageTitle: {
    color: '#F7F7F8',
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    letterSpacing: -0.55,
  },
  pageSubtitle: { color: '#8B8B91', fontSize: 13, lineHeight: 18 },
  fullCalendarSurface: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0D0D0F',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  sectionCard: {
    backgroundColor: 'transparent',
  },
  sectionLabel: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '600',
    letterSpacing: -0.35,
    color: '#F4F4F5',
  },
  selectedAppointment: {
    paddingBottom: 18,
    marginBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  selectedAppointmentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 9,
  },
  selectedAppointmentLabel: {
    color: '#71717A',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
  },
  selectedDateSummary: {
    paddingBottom: 15,
    marginBottom: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 7,
  },
  selectedDateLabel: {
    color: '#71717A',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  selectedDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedDateText: {
    color: '#F4F4F5',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  dateLockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateDay: {
    color: '#F5F5F7',
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '600',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  dateIdentity: {
    gap: 1,
  },
  dateWeekday: {
    color: '#F5F5F7',
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '600',
  },
  dateMonthYear: {
    color: '#71717A',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  availabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  dailyCapacityRow: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dailyCapacityText: {
    flexShrink: 1,
    color: '#A1A1AA',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
  dailyCapacityTextAvailable: { color: '#86D9A0' },
  dailyCapacityTextEmergency: { color: '#FCA5A5' },
  availableStartTimesText: {
    color: '#71717A',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  availabilityDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22C55E',
    flexShrink: 0,
  },
  availabilityDotFull: {
    backgroundColor: '#71717A',
  },
  availabilityDotPending: {
    backgroundColor: '#71717A',
  },
  availabilityDotClosed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#8B8B91',
  },
  availabilityDotEmergency: {
    backgroundColor: '#EF4444',
    borderWidth: 0,
  },
  timeSectionHeader: {
    marginBottom: 13,
  },
  timeSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  timeSectionLabel: {
    color: '#B8B8BC',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.05,
  },
  timeSectionHint: {
    color: '#71717A',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  timeRequirement: {
    color: '#A1A1AA',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
  },
  serviceDuration: {
    color: '#A1A1AA',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  timeOptionCount: {
    color: '#A1A1AA',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  scheduleMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 13,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,183,125,0.045)',
    borderWidth: 1,
    borderColor: 'rgba(255,183,125,0.10)',
  },
  scheduleMessageConflict: {
    backgroundColor: 'rgba(239,68,68,0.055)',
    borderColor: 'rgba(239,68,68,0.16)',
  },
  scheduleMessageText: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 12,
    lineHeight: 18,
  },
  scheduleMessageTextConflict: { color: '#FCA5A5' },
  inlineState: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  inlineStateCopy: {
    flex: 1,
    gap: 3,
  },
  inlineStateTitle: {
    fontSize: 14,
    lineHeight: 19,
    color: '#E4E4E7',
    fontWeight: '600',
  },
  inlineStateText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#71717A',
  },
  slotSkeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 10,
    rowGap: 10,
  },
  slotSkeleton: {
    width: '48%',
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 9,
  },
  notesLabel: {
    flex: 1,
    color: '#D4D4D8',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  counter: {
    fontSize: 11,
    color: '#71717A',
  },
  notesInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 15,
    paddingHorizontal: 15,
    paddingTop: 13,
    paddingBottom: 13,
    fontSize: 14,
    lineHeight: 20,
    color: '#F4F4F5',
    backgroundColor: '#121214',
    minHeight: 94,
    maxHeight: 124,
    textAlignVertical: 'top',
  },
  actionDock: {
    minHeight: 92,
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 7,
    backgroundColor: '#09090A',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  dockContext: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
  },
  dockContextDate: { flex: 1, color: '#D4D4D8', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  dockContextTime: { color: PRIMARY, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  dockActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dockBackButton: {
    width: '35%',
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
  },
  dockBackText: {
    color: '#A1A1AA',
    fontSize: 14,
    fontWeight: '500',
  },
  dockContinueButton: {
    flex: 1,
    minHeight: 48,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 15,
    backgroundColor: PRIMARY_CTR,
  },
  dockContinueButtonDisabled: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  dockContinueText: {
    color: ON_PRIMARY,
    fontSize: 15,
    fontWeight: '600',
  },
  dockContinueTextDisabled: {
    color: '#71717A',
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
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SURFACE_HIGH,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: GHOST,
  },
  vehicleRowActive: {
    backgroundColor: 'rgba(255,140,0,0.025)',
    borderColor: 'rgba(255,183,125,0.20)',
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
  selectedVehicleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  selectedVehicleMetaText: {
    color: PRIMARY,
    fontSize: 10,
    fontWeight: '700',
  },
  changeVehicleAction: {
    minWidth: 66,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  changeVehicleText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '700',
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
    flex: 1,
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
  },
  inlineError: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(127,29,29,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(248,113,113,0.20)',
  },
  inlineErrorTitle: {
    color: '#F4F4F5',
    fontSize: 12,
    fontWeight: '700',
  },
  inlineErrorBody: {
    color: '#8B8B94',
    fontSize: 10,
    lineHeight: 14,
    marginTop: 2,
  },
  retryText: {
    color: PRIMARY,
    fontSize: 12,
    fontWeight: '800',
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

const skeleton = StyleSheet.create({
  row: {
    borderColor: 'rgba(255,255,255,0.04)',
  },
  packageCard: {
    minHeight: 184,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  block: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  circle: {
    borderColor: 'rgba(255,255,255,0.08)',
  },
  line: {
    height: 13,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  lineSmall: {
    height: 9,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  lineLarge: {
    height: 25,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.075)',
  },
});

const vehiclePicker = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    maxHeight: '76%',
    paddingHorizontal: 18,
    paddingTop: 11,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#111113',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,183,125,0.20)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  eyebrow: {
    color: PRIMARY,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    marginTop: 3,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  list: {
    gap: 8,
    paddingBottom: 12,
  },
  row: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#17171B',
    overflow: 'hidden',
  },
  rowActive: {
    borderColor: 'rgba(255,183,125,0.55)',
    backgroundColor: 'rgba(255,140,0,0.08)',
  },
  selectArea: {
    minHeight: 66,
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingVertical: 11,
  },
  editAction: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 7,
  },
  editText: {
    color: PRIMARY,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  radioAction: {
    width: 44,
    minHeight: 66,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 10,
  },
  rowTitle: {
    color: '#F4F4F5',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: '#71717A',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  addButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 15,
    backgroundColor: PRIMARY,
  },
  addButtonText: {
    color: ON_PRIMARY,
    fontSize: 14,
    fontWeight: '800',
  },
});

// ── Compact package selection cards ──────────────────────────────────────────
const pkgCard = StyleSheet.create({
  base: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.065)',
    backgroundColor: '#111111',
    overflow: 'hidden',
  },
  selected: {
    borderColor: 'rgba(255,183,125,0.34)',
    backgroundColor: 'rgba(255,140,0,0.035)',
  },
  selectArea: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 5,
  },
  tier: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 2.2,
    color: 'rgba(255,255,255,0.48)',
    textTransform: 'uppercase',
  },
  badge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 1,
  },
  badgeText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 22,
  },
  price: {
    fontSize: 23,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.7,
    lineHeight: 28,
    marginTop: 3,
  },
  priceError: {
    color: '#FCA5A5',
    fontSize: 15,
    lineHeight: 22,
    letterSpacing: 0,
    marginTop: 7,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 8,
  },
  metadataPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    backgroundColor: 'rgba(255,183,125,0.08)',
  },
  metadataPillNeutral: {
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  metadataText: {
    fontSize: 10,
    fontWeight: '600',
    color: PRIMARY,
  },
  metadataTextNeutral: {
    color: '#A1A1AA',
  },
  tagline: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.52)',
    marginTop: 6,
  },
  featurePreview: {
    gap: 8,
    marginTop: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 17,
  },
  priceRetry: {
    minHeight: 38,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 6,
  },
  priceRetryText: {
    color: PRIMARY,
    fontSize: 11,
    fontWeight: '700',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.018)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 20,
  },
  detailsButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  detailsButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,183,125,0.64)',
  },
});

const bookingCta = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
    backgroundColor: 'rgba(4,4,5,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  summaryRow: {
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 3,
  },
  guidance: {
    fontSize: 11,
    fontWeight: '600',
    color: '#71717A',
    maxWidth: '100%',
  },
  guidanceReady: {
    color: PRIMARY,
  },
  summaryPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  buttonWrap: {
    width: 148,
    flexShrink: 0,
  },
  button: {
    minHeight: 46,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
  },
  buttonEnabled: {
    backgroundColor: PRIMARY_CTR,
  },
  buttonDisabled: {
    backgroundColor: '#202024',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
    color: ON_PRIMARY,
  },
  buttonTextDisabled: {
    color: '#85858D',
  },
});

const detailsDock = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: 'rgba(4,4,5,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
    }),
  },
  backButton: {
    flex: 0.38,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#121216',
  },
  backText: {
    color: '#C6C6C7',
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    flex: 0.62,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 16,
    backgroundColor: PRIMARY_CTR,
  },
  continueButtonDisabled: {
    backgroundColor: '#202024',
  },
  continueText: {
    color: ON_PRIMARY,
    fontSize: 14,
    fontWeight: '800',
  },
  continueTextDisabled: {
    color: '#85858D',
  },
});

const packageDetailsStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: '#111111',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(249,115,22,0.24)',
    overflow: 'hidden',
  },
  handleTouchArea: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignSelf: 'center',
    marginTop: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    color: PRIMARY,
    textTransform: 'uppercase',
  },
  headerBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  headerBadgeText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
  },
  title: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexShrink: 1,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  content: {
    paddingTop: 16,
    paddingBottom: 28,
  },
  price: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -1.2,
    color: '#F97316',
  },
  priceUnavailable: {
    color: '#FCA5A5',
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0,
  },
  tagline: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.52)',
    marginTop: 2,
  },
  promotionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 6,
  },
  promotionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(245,158,11,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.28)',
  },
  promotionBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    color: '#FBBF24',
  },
  originalPrice: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
    textDecorationLine: 'line-through',
  },
  specifications: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 20,
    paddingVertical: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  specificationColumn: {
    minWidth: 140,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  specificationIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,183,125,0.09)',
  },
  durationIcon: {
    backgroundColor: 'rgba(255,255,255,0.055)',
  },
  specificationLabel: {
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.42)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  specificationValue: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    color: '#F4F4F5',
    marginTop: 2,
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.66)',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.58)',
    marginBottom: 14,
  },
  detailGroups: {
    gap: 24,
  },
  detailGroup: {
    gap: 13,
  },
  groupTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  inclusionList: {
    gap: 15,
  },
  inclusionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  inclusionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: '#F4F4F5',
  },
  inclusionDetail: {
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
  },
  savings: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    color: PRIMARY,
    marginTop: 3,
  },
  coverageBlock: {
    paddingTop: 3,
  },
  coverageTitle: {
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.42)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 9,
  },
  coverageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 12,
    rowGap: 8,
  },
  coverageItem: {
    width: '47%',
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  coverageDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: PRIMARY,
  },
  coverageText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.68)',
  },
  bundleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  bundleName: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: '#F4F4F5',
  },
  bundleNote: {
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.50)',
    marginTop: 2,
  },
  bundlePrice: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: PRIMARY,
  },
  selectedAction: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,183,125,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,183,125,0.24)',
  },
  selectedActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: PRIMARY,
  },
  selectButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: ON_PRIMARY,
  },
  retryAction: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,183,125,0.28)',
    backgroundColor: 'rgba(255,183,125,0.07)',
  },
  retryActionText: {
    color: PRIMARY,
    fontSize: 14,
    fontWeight: '800',
  },
});
