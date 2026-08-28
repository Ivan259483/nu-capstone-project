/**
 * AutoSPF+ — Customer Home Dashboard
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  ARCHITECTURE
 *  ─────────────────────────────────────────────────
 *  Tokens          → D (design tokens)
 *  Atoms           → Pulse · Shim · Tap
 *  Molecules       → GBCard · Specular · Rail · SectionEye
 *  Sections        → HeaderSection · HeroSection · TrustSection
 *                    QuickSection · ServicesSection · PromoSection
 *                    HistorySection
 *  Screen          → HomeScreen (orchestrator)
 *  Styles          → $ (shared StyleSheet)
 *
 *  ANIMATIONS (Reanimated v3)
 *  ─────────────────────────────────────────────────
 *  Motion is intentionally limited to short entrance/press feedback and the
 *  live-status pulse. The header and canvas do not continuously animate.
 *
 *  HOMEPAGE CONTENT (what belongs here for a car service app)
 *  ─────────────────────────────────────────────────
 *  1. Greeting + profile         (personalisation, trust)
 *  2. Context-aware booking hero (book / appointment / service / payment)
 *  3. Compact trust strip
 *  4. Contextual utility actions
 *  5. Services gallery
 *  6. Current offer
 *  7. Recent service history
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Dimensions, Platform, RefreshControl, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeInRight, SlideInRight,
  useSharedValue, useAnimatedStyle,
  withRepeat, withTiming, withSequence,
  Easing, interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import { invalidateCache } from '@/services/api/client';
import {
  getServicePriceForVehicle,
  getServiceStartingPrice,
  getServiceVehiclePriceKey,
  serviceService,
} from '@/services/api/serviceService';
import { vehicleService } from '@/services/api/vehicleService';
import type { BookingRecord, ServiceOption, Vehicle } from '@/services/api/types';
import { isBookingCountedAsActiveOnHome } from '@/utils/customerBookingLifecycle';
import {
  bookingIsReadyForPickup,
  bookingShowsCustomerLiveTracker,
  pickCustomerLiveTrackerBooking,
} from '@/utils/customer-live-tracker-pick';
import {
  resolveCustomerHomeRailStep,
} from '@/utils/customer-home-rail-step';
import { useNotifications } from '@/context/NotificationsContext';
import { TabBarContentHeight } from '@/constants/theme';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VIEWPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { width: W } = Dimensions.get('window');
const IOS = Platform.OS === 'ios';
const SERVICE_CARD_WIDTH = (W - 54) / 2;
const USE_STACKED_SERVICE_FOOTER = SERVICE_CARD_WIDTH < 200;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const scaleForPhoneWidth = (width: number, min: number, max: number) => {
  const progress = clamp((width - 320) / 110, 0, 1);
  return min + (max - min) * progress;
};

const phoneMetric = (width: number, min: number, max: number) =>
  Math.round(scaleForPhoneWidth(width, min, max) * 10) / 10;

function getHomeHeroMetrics(width: number) {
  return {
    cardHeight:phoneMetric(width, 294, 330),
    cardRadius:phoneMetric(width, 20, 24),
    horizontalPadding:phoneMetric(width, 20, 24),
    topPadding:phoneMetric(width, 20, 21),
    bottomPadding:phoneMetric(width, 18, 20),
    headlineSize:phoneMetric(width, 30, 38),
    headlineLineHeight:phoneMetric(width, 36, 42),
    headlineTopGap:22,
    headlineCategoryGap:phoneMetric(width, 10, 12),
    serviceSize:phoneMetric(width, 9.5, 12.5),
    serviceGap:phoneMetric(width, 4.5, 7),
    ctaTopGap:phoneMetric(width, 12, 14),
    ctaHeight:phoneMetric(width, 50, 54),
    ctaFontSize:phoneMetric(width, 15.5, 17.5),
    ctaLeftPadding:phoneMetric(width, 16, 18),
    ctaTextPadding:phoneMetric(width, 12, 14),
    ctaArrowWidth:phoneMetric(width, 34, 38),
    metaTopGap:phoneMetric(width, 18, 20),
    metaHeight:phoneMetric(width, 22, 26),
    metaFontSize:phoneMetric(width, 10, 11.5),
    metaIconSize:phoneMetric(width, 12, 14),
    brandSize:phoneMetric(width, 8.5, 10),
    brandTagGap:phoneMetric(width, 4, 6),
    taglineSize:phoneMetric(width, 8, 9.5),
    taglineTracking:phoneMetric(width, 0.6, 0.85),
    carBadgeSize:phoneMetric(width, 46, 50),
    carIconSize:phoneMetric(width, 20, 23),
    metaRowGap:phoneMetric(width, 3, 5),
    metaChipGap:phoneMetric(width, 3, 4),
    upperCircleSize:phoneMetric(width, 210, 250),
    lowerCircleSize:phoneMetric(width, 160, 195),
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const D = {
  // Canvas — obsidian with warmth
  bg:  '#050505',
  s1:  '#0C0C0D',

  // PRIMARY BRAND — amber/orange
  A:   '#FF7C1E',
  AL:  '#FFA855',
  AD:  '#C55000',
  Af:  'rgba(255,124,30,0.11)',
  Ab:  'rgba(255,124,30,0.18)',
  Ag2: 'rgba(255,124,30,0.05)',

  // Warm copper support tone — never used as a separate accent family
  Go:     '#D65A1A',
  Gof:    'rgba(214,90,26,0.10)',
  Gob:    'rgba(214,90,26,0.20)',

  // SEMANTIC
  G: '#2DDBA6', Gf: 'rgba(45,219,166,0.11)', Gb: 'rgba(45,219,166,0.22)',

  // WHITE ALPHA RAMP
  w100: '#FBF8F4',
  w92:  'rgba(255,255,255,0.92)',
  w75:  'rgba(255,255,255,0.75)',
  w55:  'rgba(255,255,255,0.55)',
  w38:  'rgba(255,255,255,0.38)',
  w24:  'rgba(255,255,255,0.24)',
  w16:  'rgba(255,255,255,0.16)',
  w10:  'rgba(255,255,255,0.10)',
  w07:  'rgba(255,255,255,0.07)',
  w04:  'rgba(255,255,255,0.04)',
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRADIENT BORDER PRESETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GB = {
  amber:   [D.Ab, 'rgba(255,124,30,0.06)', D.Ab]    as const,
  neutral: [D.w16, D.w04, D.w10]                   as const,
};

const SPACE = {
  xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, section:32, page:20,
} as const;

const RADIUS = {
  control:14, icon:16, card:22, hero:28,
} as const;

const TYPE = {
  sectionTracking:1.9,
  bodyColor:D.w55,
  supportingColor:D.w55,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATIC DATA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Home 8-step rail labels (must match `CUSTOMER_HOME_RAIL_LABELS` in customer-home-rail-step.ts)
const STEPS = ['Booked', 'Confirmed', 'Assigned', 'Checked in', 'In Service', 'QC', 'Payment', 'Released'];

const TRUST = [
  { icon:'shield-checkmark-outline' as const, label:'LTFRB' },
  { icon:'ribbon-outline'           as const, label:'Licensed' },
  { icon:'checkmark-circle-outline' as const, label:'Insured' },
  { icon:'star-outline'             as const, label:'4.9 Rating' },
];

const PROMOS = [
  { badge:'LIMITED', title:'Free Interior Detailing', sub:'Book any tint package this month', save:'₱800 value', icon:'sparkles-outline' as const },
];

const greet = (date = new Date()) => {
  let h = date.getHours();

  try {
    const hourPart = new Intl.DateTimeFormat('en-PH', {
      timeZone:'Asia/Manila',
      hour:'numeric',
      hourCycle:'h23',
    }).formatToParts(date).find((part) => part.type === 'hour');
    const philippineHour = Number(hourPart?.value);
    if (Number.isFinite(philippineHour)) h = philippineHour;
  } catch {
    // Fall back to the device-local hour if the runtime lacks time-zone data.
  }

  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const getFirstName = (fullName?: string | null) => {
  const firstName = fullName?.trim().split(/\s+/)[0];
  if (!firstName) return 'Customer';
  return firstName.charAt(0).toLocaleUpperCase('en-PH') + firstName.slice(1);
};

function getTrackingContext(job: BookingRecord, step: number): {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
} {
  const assignedName =
    job.assignedDetailer?.name?.trim() ||
    job.serviceStaffAssignments?.find((assignment) => assignment.name?.trim())?.name?.trim();

  if (assignedName) {
    return { icon:'person-outline', text:`Technician · ${assignedName}` };
  }

  const updatedValue =
    job.serviceTrackingUpdatedAt ||
    job.customerStatusUpdatedAt ||
    job.updatedAt;
  const updatedAt = updatedValue ? new Date(updatedValue).getTime() : Number.NaN;

  if (Number.isFinite(updatedAt)) {
    const elapsedMinutes = Math.max(0, Math.floor((Date.now() - updatedAt) / 60_000));
    if (elapsedMinutes < 1) return { icon:'time-outline', text:'Updated just now' };
    if (elapsedMinutes < 60) {
      return {
        icon:'time-outline',
        text:`Last updated ${elapsedMinutes} ${elapsedMinutes === 1 ? 'minute' : 'minutes'} ago`,
      };
    }
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) {
      return {
        icon:'time-outline',
        text:`Last updated ${elapsedHours} ${elapsedHours === 1 ? 'hour' : 'hours'} ago`,
      };
    }
  }

  const stageContext = [
    'Booking received',
    'Service booking confirmed',
    'Technician assignment pending',
    'Vehicle arrived at the shop',
    'Service work is in progress',
    'Quality inspection underway',
    'Awaiting payment confirmation',
    'Vehicle ready for release',
  ] as const;

  return {
    icon:step === 3 ? 'location-outline' : 'information-circle-outline',
    text:stageContext[step] ?? 'Service status updated',
  };
}

const sh = (c: string, o = 0.25, r = 14, y = 6) =>
  IOS ? { shadowColor:c, shadowOpacity:o, shadowRadius:r, shadowOffset:{width:0,height:y} }
      : { elevation: Math.round(r / 3) } as any;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Gradient Border Card
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function GBCard({
  colors = GB.neutral, radius = 26, bg = D.s1, style, inner, children,
}: {
  colors?: readonly [string,string,string];
  radius?: number; bg?: string; style?: any; inner?: any;
  children: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={colors as any}
      start={{x:0,y:0}} end={{x:1,y:1}}
      style={[{borderRadius:radius, padding:1.2}, style]}
    >
      <View style={[{borderRadius:radius-1.2, backgroundColor:bg, overflow:'hidden', flex:1}, inner]}>
        {children}
      </View>
    </LinearGradient>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Specular highlight overlay (diagonal glass shine)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Spec({ op = 0.06 }: { op?: number }) {
  return (
    <LinearGradient
      colors={[`rgba(255,255,255,${op+0.05})`,`rgba(255,255,255,${op})`, 'transparent']}
      start={{x:0,y:0}} end={{x:1,y:0.6}}
      style={{position:'absolute',top:0,left:0,right:0,height:'60%'}}
      pointerEvents="none"
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Pulse dot — live tracking indicator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Pulse({ color = D.A, size = 7 }: { color?: string; size?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withSequence(
      withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 1500, easing: Easing.in(Easing.cubic) }),
    ), -1, false);
  }, [p]);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0,1], [1,2.4]) }],
    opacity:   interpolate(p.value, [0,0.25,1], [0.5,0.10,0]),
  }));
  return (
    <View style={{ width:size+4, height:size+4, alignItems:'center', justifyContent:'center' }}>
      <Animated.View style={[{position:'absolute',width:size,height:size,borderRadius:size/2,backgroundColor:color}, ring]} />
      <View style={{ width:size, height:size, borderRadius:size/2, backgroundColor:color,
        ...sh(color, 0.8, 6, 0) }} />
    </View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Count-up number — spring entrance with bounce
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Shimmer skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Shim({ w, h, r = 14 }: { w: number; h: number; r?: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, [x]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(x.value, [-1,1], [-w, w]) }] }));
  return (
    <View style={{ width:w, height:h, borderRadius:r, backgroundColor:D.w07, overflow:'hidden' }}>
      <Animated.View style={[{position:'absolute',top:0,bottom:0,width:w*0.55}, slide]}>
        <LinearGradient
          colors={['transparent','rgba(255,255,255,0.09)','transparent']}
          start={{x:0,y:0}} end={{x:1,y:0}}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Haptic spring pressable
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Tap({
  children, onPress, style, h = 'Light', targetScale = 0.98, accessibilityLabel,
}: {
  children: React.ReactNode; onPress?: () => void;
  style?: any; h?: 'Light'|'Medium'|'Heavy'; targetScale?: number;
  accessibilityLabel?: string;
}) {
  const sc = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle[h]); onPress?.(); }}
        onPressIn={() => { sc.value = withTiming(targetScale, { duration: 140 }); }}
        onPressOut={() => { sc.value = withTiming(1, { duration: 160 }); }}
        style={{ flex: 1 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >{children}</Pressable>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MOLECULE: Section eyebrow (amber dash + small caps label)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Eye({ label, cta, onCta }: { label: string; cta?: string; onCta?: () => void }) {
  return (
    <View style={$.eyeRow}>
      <View style={$.eyeL}>
        <View style={$.eyeDash} />
        <Text style={$.eyeLabel}>{label}</Text>
      </View>
      {cta && <Pressable onPress={onCta} hitSlop={12}><Text style={$.eyeCta}>{cta} →</Text></Pressable>}
    </View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MOLECULE: premium 8-stage progress rail
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Rail({ step }: { step: number }) {
  const safeStep = Math.min(Math.max(step, 0), STEPS.length - 1);
  const nextLabel = safeStep < STEPS.length - 1 ? STEPS[safeStep + 1] : 'Complete';

  return (
    <View style={rl.wrap}>
      <View style={rl.head}>
        <View>
          <Text style={rl.eyebrow}>CURRENT STAGE</Text>
          <Text style={rl.current}>{STEPS[safeStep]}</Text>
        </View>
        <Text style={rl.count}>STEP {safeStep + 1} OF {STEPS.length}</Text>
      </View>
      <View style={rl.segments}>
        {STEPS.map((lbl, i) => {
          const done = i < safeStep;
          const active = i === safeStep;
          return (
            <Animated.View
              key={lbl}
              entering={FadeInDown.delay(420 + i * 35).duration(180)}
              style={[rl.segment, done && rl.segmentDone, active && rl.segmentActive]}
            />
          );
        })}
      </View>
      <View style={rl.foot}>
        <View style={rl.completeLabel}>
          <Ionicons
            name={safeStep > 0 ? 'checkmark-circle' : 'ellipse-outline'}
            size={12}
            color={safeStep > 0 ? D.G : D.w24}
          />
          <Text style={rl.doneText}>{safeStep} completed</Text>
        </View>
        <Text style={rl.nextText}>Next · {nextLabel}</Text>
      </View>
    </View>
  );
}
const rl = StyleSheet.create({
  wrap:          { width:'100%', marginTop:22, marginBottom:20, padding:16, borderRadius:18, backgroundColor:'rgba(255,255,255,0.035)', borderWidth:1, borderColor:D.w07 },
  head:          { flexDirection:'row', alignItems:'flex-end', justifyContent:'space-between', gap:12 },
  eyebrow:       { color:D.w38, fontSize:8, fontWeight:'800', letterSpacing:1.8, marginBottom:4 },
  current:       { color:D.w92, fontSize:16, fontWeight:'800', letterSpacing:-0.2 },
  count:         { color:D.A, fontSize:9, fontWeight:'800', letterSpacing:1.1, marginBottom:2 },
  segments:      { flexDirection:'row', gap:5, marginVertical:14 },
  segment:       { flex:1, height:4, borderRadius:4, backgroundColor:D.w10 },
  segmentDone:   { backgroundColor:'rgba(45,219,166,0.58)' },
  segmentActive: { height:6, marginTop:-1, backgroundColor:D.A, ...sh(D.A,0.18,6,0) },
  foot:          { flexDirection:'row', alignItems:'center', justifyContent:'space-between', gap:10 },
  completeLabel: { flexDirection:'row', alignItems:'center', gap:5 },
  doneText:      { color:D.w55, fontSize:10, fontWeight:'600' },
  nextText:      { color:D.w38, fontSize:10, fontWeight:'600' },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Header — parallax collapse, name, status pill
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HeaderSection({
  profile, name, router, unreadCount,
}: any) {
  const { width } = useWindowDimensions();
  const controlSize = phoneMetric(width, 44, 48);
  const controlRadius = phoneMetric(width, 14, 16);
  const nameSize = phoneMetric(width, 28, 33.5);

  return (
    <Animated.View entering={FadeIn.duration(260)} style={$.hdr}>
      {/* Name block */}
      <View style={$.hdrCopy}>
        <Animated.Text entering={FadeIn.delay(60).duration(380)} style={$.greet}>
          {greet()},
        </Animated.Text>
        <Text
          style={[$.nameText, { fontSize:nameSize, lineHeight:nameSize + 4 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {name}
        </Text>
      </View>

      {/* Action cluster */}
      <View style={$.hdrActions}>
        <Tap onPress={() => router.push('/(screens)/notifications')} targetScale={0.97} accessibilityLabel="Open notifications">
          <View style={[$.bellBtn, { width:controlSize, height:controlSize, borderRadius:controlRadius }]}>
            <Ionicons name="notifications-outline" size={18} color={D.w55} />
            {unreadCount > 0 && (
              <View style={$.notifBubble}>
                <Text style={$.notifTxt}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
              </View>
            )}
          </View>
        </Tap>
        <Tap onPress={() => router.push('/(customer)/settings')} targetScale={0.97} accessibilityLabel="Open profile">
          <View style={[$.avRing, { width:controlSize, height:controlSize, borderRadius:controlRadius }]}>
            <View style={[$.avCore, { borderRadius:Math.max(0, controlRadius - 2.2) }]}>
              {profile?.avatar_url
                ? <Image source={profile.avatar_url} style={{width:'100%',height:'100%'}} contentFit="cover" />
                : <Text style={$.avChar}>{(profile?.full_name?.charAt(0)||'?').toUpperCase()}</Text>
              }
            </View>
          </View>
        </Tap>
      </View>
    </Animated.View>
  );
}

type HomeHeroMode = 'book' | 'upcoming' | 'active' | 'payment' | 'ready';

function resolveHomeHeroMode(job: BookingRecord | null, step: number): HomeHeroMode {
  if (!job) return 'book';
  const status = String(job.status || '').trim().toLowerCase().replace(/-/g, '_');
  const paymentPaid = String(job.paymentStatus || '').trim().toLowerCase() === 'paid';
  if (bookingIsReadyForPickup(job)) return 'ready';
  if (!paymentPaid && (status === 'ready_for_payment' || status === 'completed' || step >= 6)) return 'payment';
  if (step >= 3) return 'active';
  return 'upcoming';
}

function formatBookingSchedule(job: BookingRecord): string {
  const rawDate = String(job.bookingDate || job.date || '').trim();
  const rawTime = String(job.bookingTime || job.time || '').trim();
  let dateLabel = rawDate || 'Date to be confirmed';

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    const [year, month, day] = rawDate.split('-').map(Number);
    dateLabel = new Intl.DateTimeFormat('en-PH', { month:'short', day:'numeric' })
      .format(new Date(year, month - 1, day));
  } else if (rawDate) {
    const parsed = new Date(rawDate);
    if (!Number.isNaN(parsed.getTime())) {
      dateLabel = new Intl.DateTimeFormat('en-PH', { month:'short', day:'numeric' }).format(parsed);
    }
  }

  let timeLabel = rawTime;
  const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    timeLabel = `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
  }
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

function getOutstandingAmount(job: BookingRecord): number | null {
  const total = Number(job.totalPrice || job.totalAmount || 0);
  if (total <= 0) return null;
  const paid = Number(job.downPaymentAmount || 0) + Number(job.finalPaymentAmount || 0);
  return Math.max(0, total - paid);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Hero — booking, appointment, live service, or payment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HeroSection({ job, isLoading, step, router }: {
  job: BookingRecord | null;
  isLoading: boolean;
  step: number;
  router: ReturnType<typeof useRouter>;
}) {
  const { width } = useWindowDimensions();
  const hero = getHomeHeroMetrics(width);

  if (isLoading) return <Shim w={Math.max(0, width - SPACE.page * 2)} h={hero.cardHeight} r={hero.cardRadius} />;

  if (job) {
    const mode = resolveHomeHeroMode(job, step);
    const context = getTrackingContext(job, step);
    const isUpcoming = mode === 'upcoming';
    const isPayment = mode === 'payment';
    const isReady = mode === 'ready';
    const actionLabel = isPayment ? 'View Payment' : isUpcoming ? 'View Booking' : isReady ? 'View Pickup' : 'Track My Car';
    const actionRoute = isPayment
      ? { pathname:'/(screens)/payments' as const, params:{ orderId:job.id } }
      : { pathname:'/(customer)/track' as const, params:{ id:job.id } };
    const status = String(job.status || '').trim().toLowerCase().replace(/-/g, '_');
    const isAwaitingConfirmation = status === 'pending' || status === 'pending_confirmation';
    const outstandingAmount = getOutstandingAmount(job);
    const eyebrow = isPayment
      ? 'PAYMENT PENDING'
      : isReady
        ? 'READY FOR PICKUP'
        : isUpcoming
          ? (isAwaitingConfirmation ? 'REQUEST RECEIVED' : 'APPOINTMENT CONFIRMED')
          : 'IN PROGRESS';
    const headline = isPayment
      ? 'Service completed'
      : isReady
        ? 'Your vehicle is ready for pickup'
        : isUpcoming
          ? (isAwaitingConfirmation ? 'We’re confirming your appointment' : 'Your appointment is confirmed')
          : 'Your vehicle is being serviced';

    return (
      <Animated.View entering={FadeIn.duration(240)}>
        <Tap onPress={() => router.push(actionRoute as any)} h="Light" accessibilityLabel={actionLabel}>
          <GBCard
            colors={['rgba(238,103,42,0.34)','rgba(130,50,22,0.12)','rgba(238,103,42,0.18)']}
            radius={26}
            bg="#120D0B"
            style={sh('#5B2110', 0.18, 18, 6)}
          >
            <LinearGradient
              colors={['rgba(160,55,20,0.34)','rgba(83,31,17,0.17)','transparent']}
              start={{x:0,y:0}} end={{x:1.2,y:1.2}}
              style={StyleSheet.absoluteFill}
            />
            <Spec op={0.04} />
            <View style={$.trGlow} />

            <View style={$.trBody}>
              <View style={$.trRow1}>
                <View style={$.livePill}>
                  {mode === 'active' ? <Pulse color={D.A} size={6} /> : (
                    <Ionicons name={isPayment ? 'card-outline' : isReady ? 'car-sport-outline' : 'calendar-outline'} size={12} color={D.A} />
                  )}
                  <Text style={$.liveTxt} numberOfLines={1} adjustsFontSizeToFit>{eyebrow}</Text>
                </View>
              </View>

              <Animated.Text entering={FadeInDown.delay(180).duration(200)} style={$.trHeadline} numberOfLines={2}>
                {headline}
              </Animated.Text>
              <Text style={$.trVeh} numberOfLines={1} adjustsFontSizeToFit>
                {[job.vehicleMake, job.vehicleModel].filter(Boolean).join(' ') || 'Your vehicle'}
              </Text>
              <View style={$.trMetaRow}>
                <View style={$.trSvcRow}>
                  <Ionicons name="sparkles-outline" size={13} color={D.A} />
                  <Text style={$.trSvc} numberOfLines={1}>{job.serviceName}</Text>
                </View>
                <View style={$.plateBadge}>
                  <Ionicons name="car-outline" size={10} color={D.w38} />
                  <Text style={$.plateNum}>{String(job.vehiclePlate||'—').slice(0,9).toUpperCase()}</Text>
                </View>
              </View>

              {isUpcoming ? (
                <View style={$.appointmentSummary}>
                  <Ionicons name="calendar-clear-outline" size={17} color={D.A} />
                  <Text style={$.appointmentSchedule}>{formatBookingSchedule(job)}</Text>
                </View>
              ) : isPayment ? (
                <View style={$.paymentSummary}>
                  <View>
                    <Text style={$.paymentLabel}>AMOUNT DUE</Text>
                    <Text style={$.paymentAmount}>
                      {outstandingAmount === null ? 'Review total' : `₱${outstandingAmount.toLocaleString('en-PH')}`}
                    </Text>
                  </View>
                  <Text style={$.paymentHint}>Complete payment to finish your service</Text>
                </View>
              ) : (
                <Rail step={step} />
              )}

              <View style={$.trFooter}>
                <View style={$.trContext}>
                  <Ionicons name={isUpcoming ? 'information-circle-outline' : context.icon} size={13} color={D.w38} />
                  <Text style={$.trContextText} numberOfLines={2}>
                    {isUpcoming
                      ? 'We’ll keep this status synced with your booking.'
                      : isPayment
                        ? 'Your service total is ready for review.'
                        : isReady
                          ? 'Review the latest release and pickup details.'
                        : context.text}
                  </Text>
                </View>
                <View style={$.trViewBtn}>
                  <Text style={$.trViewTxt}>{actionLabel}</Text>
                  <Ionicons name="arrow-forward" size={13} color={D.bg} />
                </View>
              </View>
            </View>
          </GBCard>
        </Tap>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(240)}>
      <Tap onPress={() => router.push('/(customer)/book')} h="Medium" accessibilityLabel="Book a service">
        <View style={[$.heroCard, {
          minHeight:hero.cardHeight,
          borderRadius:hero.cardRadius,
        }]}>
          <LinearGradient
            colors={['#B4491B','#67230F','#150C09']}
            locations={[0,0.46,1]}
            start={{x:0,y:0}} end={{x:1.08,y:1.04}}
            style={StyleSheet.absoluteFill}
          />
          {/* Restrained copper lift; no animated or glossy treatment. */}
          <LinearGradient
            colors={['rgba(255,166,105,0.075)','rgba(132,47,20,0.025)','rgba(0,0,0,0.10)']}
            start={{x:0,y:0}} end={{x:0.92,y:0.72}}
            style={StyleSheet.absoluteFill}
          />
          {/* Depth circles */}
          <View style={[$.hC, {
            width:hero.upperCircleSize,
            height:hero.upperCircleSize,
            top:-hero.upperCircleSize * 0.2,
            right:-hero.upperCircleSize * 0.31,
          }]} />
          <View style={[$.hC, {
            width:hero.lowerCircleSize,
            height:hero.lowerCircleSize,
            top:hero.cardHeight * 0.47,
            right:-hero.lowerCircleSize * 0.32,
          }]} />
          <View style={[$.heroBody, {
            minHeight:hero.cardHeight,
            paddingHorizontal:hero.horizontalPadding,
            paddingTop:hero.topPadding,
            paddingBottom:hero.bottomPadding,
          }]}>
            <View style={[$.heroCarBadge, {
              width:hero.carBadgeSize,
              height:hero.carBadgeSize,
              borderRadius:hero.carBadgeSize * 0.3,
              top:hero.topPadding,
              right:hero.horizontalPadding,
            }]}>
              <Ionicons name="car-sport-outline" size={hero.carIconSize} color="#F2C1A4" />
            </View>

            {/* Top row */}
            <View style={$.heroTopRow}>
              <View style={[$.heroBrandCopy, {
                paddingRight:hero.carBadgeSize + SPACE.md,
              }]}>
                <Text style={[$.heroBrand, {
                  fontSize:hero.brandSize,
                  marginBottom:hero.brandTagGap,
                }]}>AUTOSPF+</Text>
                <Text
                  style={[$.heroEye, {
                    fontSize:hero.taglineSize,
                    letterSpacing:hero.taglineTracking,
                  }]}
                  numberOfLines={1}
                >
                  PREMIUM AUTO CARE · SINCE 2023
                </Text>
              </View>
            </View>

            {/* Headline */}
            <View style={{ marginTop:hero.headlineTopGap }}>
              <Text style={[$.heroH1, {
                fontSize:hero.headlineSize,
                lineHeight:hero.headlineLineHeight,
                marginBottom:hero.headlineCategoryGap,
              }]}>
                Schedule Your{'\n'}Next Service
              </Text>
              <View style={[$.heroServiceRow, { gap:hero.serviceGap }]}>
                {['Tinting', 'PPF', 'Detailing', 'Coating'].map((label, index) => (
                  <React.Fragment key={label}>
                    {index > 0 && (
                      <Text style={[$.heroServiceDot, { fontSize:hero.serviceSize }]}>·</Text>
                    )}
                    <Text style={[$.heroServiceLabel, { fontSize:hero.serviceSize }]}>{label}</Text>
                  </React.Fragment>
                ))}
              </View>
            </View>

            {/* CTA followed by a stable full-width metadata row */}
            <View style={[$.heroBot, { marginTop:hero.ctaTopGap }]}>
              <View style={[$.heroCTA, {
                height:hero.ctaHeight,
                borderRadius:hero.ctaHeight * 0.29,
                paddingLeft:hero.ctaLeftPadding,
              }]}>
                <Text style={[$.heroCTATxt, {
                  fontSize:hero.ctaFontSize,
                  paddingRight:hero.ctaTextPadding,
                }]}>Book Now</Text>
                <View style={[$.heroCTAdge, { width:hero.ctaArrowWidth }]}>
                  <Ionicons name="arrow-forward" size={phoneMetric(width, 17, 19)} color="#C14D16" />
                </View>
              </View>
              <View style={[$.heroMeta, {
                minHeight:hero.metaHeight,
                marginTop:hero.metaTopGap,
                gap:hero.metaRowGap,
              }]}>
                {[
                  {i:'time-outline'  as const, t:'2–4 hrs'},
                  {i:'star-outline'  as const, t:'Rated 4.9'},
                  {i:'ribbon-outline'as const, t:'Certified'},
                ].map((m, index)=>(
                  <React.Fragment key={m.t}>
                    {index > 0 && <View style={$.heroMetaDivider} />}
                    <View style={[$.heroMetaChip, { gap:hero.metaChipGap }]}>
                      <Ionicons name={m.i} size={hero.metaIconSize} color="#F07A3D" />
                      <Text style={[$.heroMetaTxt, { fontSize:hero.metaFontSize }]} numberOfLines={1}>{m.t}</Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          </View>
        </View>
      </Tap>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Trust badges — authority horizontal strip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TrustSection() {
  return (
    <Animated.View entering={FadeIn.delay(285).duration(500)}>
      <View style={$.trustStrip}>
        {TRUST.map((t, i) => (
          <React.Fragment key={t.label}>
            {i > 0 && <View style={$.trustDivider} />}
            <View style={$.trustItem}>
              <Ionicons name={t.icon} size={12} color={D.A} />
              <Text style={$.trustTxt} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Quick actions — balanced two-column grid
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function QuickSection({ router, completed, job, step, isLoading }: {
  router: ReturnType<typeof useRouter>;
  completed: number;
  job: BookingRecord | null;
  step: number;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <View>
        <Eye label="Quick Actions" />
        <View style={$.qaGrid}>
          {[0,1,2,3].map((item) => <Shim key={item} w={(W-52)/2} h={94} r={RADIUS.control} />)}
        </View>
      </View>
    );
  }

  const mode = resolveHomeHeroMode(job, step);
  const bookingRoute = job
    ? { pathname:'/(customer)/track' as const, params:{ id:job.id } }
    : '/(screens)/appointments';
  const paymentRoute = job && mode === 'payment'
    ? { pathname:'/(screens)/payments' as const, params:{ orderId:job.id } }
    : '/(screens)/payments';
  const actions = mode === 'book' ? [
    { icon:'car-sport-outline' as const, n:'My Vehicle', sub:'Garage and details', r:'/(screens)/vehicles', badge:0 },
    { icon:'scan-outline' as const, n:'AI Assessment', sub:'Check visible damage', r:'/(customer)/scan', badge:0 },
    { icon:'receipt-outline' as const, n:'Service Records', sub:'History and receipts', r:'/(screens)/appointments', badge:completed },
    { icon:'wallet-outline' as const, n:'Payments', sub:'Transactions and receipts', r:'/(screens)/payments', badge:0 },
  ] : [
    { icon:mode === 'payment' ? 'card-outline' as const : mode === 'active' ? 'navigate-outline' as const : mode === 'ready' ? 'car-sport-outline' as const : 'calendar-outline' as const,
      n:mode === 'payment' ? 'View Payment' : mode === 'active' ? 'Track Service' : mode === 'ready' ? 'Pickup Status' : 'View Booking',
      sub:mode === 'payment' ? 'Complete your balance' : mode === 'active' ? 'Follow live progress' : mode === 'ready' ? 'Release and pickup details' : 'Appointment details',
      r:mode === 'payment' ? paymentRoute : bookingRoute, badge:0 },
    { icon:'car-sport-outline' as const, n:'My Vehicle', sub:'Garage and details', r:'/(screens)/vehicles', badge:0 },
    { icon:'receipt-outline' as const, n:'Service Records', sub:'History and receipts', r:'/(screens)/appointments', badge:completed },
    { icon:'wallet-outline' as const, n:'Payments', sub:'Transactions and receipts', r:paymentRoute, badge:0 },
  ];

  return (
    <Animated.View entering={FadeInUp.delay(320).duration(200)}>
      <Eye label="Quick Actions" />
      <View style={$.qaGrid}>
        {actions.map((action, i) => (
          <Animated.View key={action.n} entering={FadeInDown.delay(350+i*55).duration(200)} style={$.qaGridItem}>
            <Tap onPress={() => router.push(action.r as any)} h="Light" style={{flex:1}} accessibilityLabel={action.n}>
              <GBCard colors={GB.neutral} radius={18} bg={D.s1} style={{flex:1}}>
                <View style={$.qaCardBody}>
                  <View style={$.qaCardTop}>
                    <View style={$.qaSmIcon}>
                      <Ionicons name={action.icon} size={18} color={D.A} />
                    </View>
                    <View style={$.qaTopRight}>
                      {action.badge > 0 && (
                        <View style={$.qaBadge}><Text style={$.qaBadgeTxt}>{action.badge}</Text></View>
                      )}
                      <View style={$.qaArrow}>
                        <Ionicons name="arrow-forward" size={12} color={D.w38} />
                      </View>
                    </View>
                  </View>
                  <Text style={$.qaSmName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>{action.n}</Text>
                  <Text style={$.qaSubLbl} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{action.sub}</Text>
                </View>
              </GBCard>
            </Tap>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Services — horizontal gallery 240 px cards
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const formatServicePrice = (price: number | null, isStartingPrice: boolean) => {
  if (price === null) return 'Price on request';
  return `${isStartingPrice ? 'From ' : ''}₱${price.toLocaleString('en-PH')}`;
};

function ServicesSection({
  router,
  services,
  vehicle,
  isLoading,
  hasError,
  onRetry,
}: {
  router: ReturnType<typeof useRouter>;
  services: ServiceOption[];
  vehicle: Vehicle | null;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  const visibleServices = services.slice(0, 4);

  return (
    <Animated.View entering={FadeInUp.delay(400).duration(200)}>
      <Eye label="Our Services" cta="View All" onCta={() => router.push('/(customer)/book')} />
      {isLoading ? (
        <View style={$.svcLoadingRow}>
          <Shim w={(W-54)/2} h={USE_STACKED_SERVICE_FOOTER ? 252 : 220} r={RADIUS.card} />
          <Shim w={(W-54)/2} h={USE_STACKED_SERVICE_FOOTER ? 252 : 220} r={RADIUS.card} />
        </View>
      ) : hasError ? (
        <View style={$.svcStateCard}>
          <Ionicons name="cloud-offline-outline" size={20} color={D.w38} />
          <Text style={$.svcStateText}>Services are temporarily unavailable.</Text>
          <Pressable onPress={onRetry} hitSlop={10}>
            <Text style={$.svcRetry}>Retry</Text>
          </Pressable>
        </View>
      ) : visibleServices.length === 0 ? (
        <View style={$.svcStateCard}>
          <Ionicons name="information-circle-outline" size={20} color={D.w38} />
          <Text style={$.svcStateText}>No services are available right now.</Text>
        </View>
      ) : (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:22}}>
        {visibleServices.map((service, i) => {
          const vehiclePriceKey = getServiceVehiclePriceKey(vehicle?.vehicleType);
          const exactVehiclePrice = vehiclePriceKey
            ? getServicePriceForVehicle(service, vehicle?.vehicleType)
            : null;
          const price = vehiclePriceKey ? exactVehiclePrice : getServiceStartingPrice(service);
          const isRecommended = /recommend/i.test(service.catalogCard?.badge || '');
          const gradient = isRecommended
            ? ['#131820', '#1B222B'] as const
            : ['#171A20', '#241814'] as const;
          const metadata = service.catalogCard?.tagline
            || service.description
            || [service.tag, service.duration].filter(Boolean).join(' · ');

          return (
          <Animated.View key={service.id} entering={SlideInRight.delay(420+i*65).duration(200)}>
            <Tap
              onPress={() => router.push({
                pathname: '/(customer)/book',
                params: {
                  serviceId: service.id,
                  ...(vehicle?.id ? { vehicleId: vehicle.id } : {}),
                },
              })}
              style={[$.svcWrap, i===0&&{marginLeft:0}]}
            >
              <LinearGradient
                colors={gradient}
                start={{x:0,y:0}}
                end={{x:1,y:1}}
                style={[$.svcCard, USE_STACKED_SERVICE_FOOTER && $.svcCardNarrow]}
              >
                {/* Specular */}
                <LinearGradient
                  colors={['rgba(255,255,255,0.09)','rgba(255,255,255,0.025)','transparent']}
                  start={{x:0,y:0}} end={{x:1,y:0.65}}
                  style={StyleSheet.absoluteFill}
                />
                {/* Depth orb */}
                <View style={$.svcOrb} />

                {/* Glass icon top-left */}
                <GBCard
                  colors={['rgba(255,255,255,0.28)','rgba(255,255,255,0.10)','rgba(255,255,255,0.22)']}
                  radius={RADIUS.control} bg="rgba(255,255,255,0.075)"
                  style={{width:44,height:44}}
                >
                  <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
                    <Ionicons name={service.icon as keyof typeof Ionicons.glyphMap} size={18} color="rgba(255,255,255,0.90)" />
                  </View>
                </GBCard>

                <View style={{flex:1}} />
                <View style={$.svcBadgeSlot}>
                  {service.catalogCard?.badge ? (
                    <View style={[
                      $.svcBadgePill,
                      isRecommended && $.svcBadgeRecommended,
                    ]}>
                      <Text style={[
                        $.svcBadge,
                        isRecommended && $.svcBadgeRecommendedText,
                      ]} numberOfLines={1}>{service.catalogCard.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={$.svcName} numberOfLines={2}>{service.name}</Text>
                <Text style={$.svcTag} numberOfLines={2}>{metadata || ' '}</Text>
                <View style={[$.svcFoot, USE_STACKED_SERVICE_FOOTER && $.svcFootNarrow]}>
                  <View style={[$.svcPrBadge, USE_STACKED_SERVICE_FOOTER && $.svcPrBadgeNarrow]}>
                    <Text
                      style={$.svcPr}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      {formatServicePrice(price, !vehiclePriceKey)}
                    </Text>
                  </View>
                  <View style={[$.svcBookPill, USE_STACKED_SERVICE_FOOTER && $.svcBookPillNarrow]}>
                    <Text style={$.svcBookTxt}>Book  →</Text>
                  </View>
                </View>
              </LinearGradient>
            </Tap>
          </Animated.View>
        )})}
      </ScrollView>
      )}
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Promo — current offer/deal banner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PromoSection({ router }: any) {
  const p = PROMOS[0];

  return (
    <Animated.View entering={FadeInUp.delay(430).duration(200)}>
      <Eye label="Current Offer" />
      <Tap onPress={() => router.push('/(customer)/book')} h="Medium" accessibilityLabel="Book the current offer">
        <GBCard colors={GB.neutral} radius={RADIUS.card}>
          <LinearGradient
            colors={['rgba(207,168,64,0.055)','rgba(255,124,30,0.02)','transparent']}
            start={{x:0,y:0}} end={{x:1,y:1}}
            style={StyleSheet.absoluteFill}
          />

          <View style={$.promoBody}>
            <View style={$.promoLeft}>
              <View style={$.promoBadge}>
                <Ionicons name="pricetag-outline" size={10} color={D.bg} />
                <Text style={$.promoBadgeTxt}>{p.badge}</Text>
              </View>
              <Text style={$.promoTitle}>{p.title}</Text>
              <Text style={$.promoSub}>{p.sub}</Text>
              <View style={$.promoSaveRow}>
                <Ionicons name="pricetag-outline" size={10} color={D.AL} />
                <Text style={$.promoSaveTxt}>Includes {p.save}</Text>
              </View>
            </View>
            <View style={$.promoRight}>
              <View style={$.promoIconBg}>
                <Ionicons name={p.icon as any} size={22} color={D.Go} />
              </View>
              <View style={$.promoArrow}>
                <Ionicons name="arrow-forward" size={13} color={D.Go} />
              </View>
            </View>
          </View>
        </GBCard>
      </Tap>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Recent history — Revolut transaction list container
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HistorySection({ history, isLoading, totalSpend, router }: any) {
  return (
    <Animated.View entering={FadeInUp.delay(500).duration(200)}>
      <Eye
        label="Recent Services"
        cta={history.length > 0 ? 'See All' : undefined}
        onCta={() => router.push('/(screens)/appointments')}
      />

      {isLoading ? (
        <GBCard colors={GB.neutral} radius={26}>
          {[0,1,2].map(i => (
            <View key={i} style={$.histSkRow}>
              <Shim w={44} h={44} r={14} />
              <View style={{flex:1,gap:8,marginLeft:14}}>
                <Shim w={W-190} h={14} r={6} />
                <Shim w={W-240} h={11} r={5} />
              </View>
              <Shim w={64} h={14} r={6} />
            </View>
          ))}
        </GBCard>

      ) : history.length > 0 ? (
        <GBCard colors={GB.neutral} radius={26} style={sh('#000',0.28,16,5)}>
          {/* Total spend header */}
          <View style={$.histHdr}>
            <View>
              <Text style={$.histHdrEye}>LIFETIME SPEND</Text>
              <Animated.Text entering={FadeInDown.delay(520).duration(200)} style={$.histHdrAmt}>
                ₱{totalSpend.toLocaleString()}
              </Animated.Text>
            </View>
            <View style={$.histHdrRight}>
              <View style={$.histHdrBadge}>
                <Text style={$.histHdrBadgeTxt}>{history.length} service{history.length !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          </View>
          <View style={$.histDivHdr} />

          {history.map((item: any, i: number) => (
            <React.Fragment key={item.id}>
              {i > 0 && <View style={$.histDiv} />}
              <Animated.View entering={FadeInRight.delay(540 + i*55).duration(200)}>
                <Tap onPress={() => router.push('/(screens)/appointments')} style={$.histRow}>
                  <View style={$.histBubble}>
                    <Ionicons name="checkmark-circle" size={18} color={D.G} />
                  </View>
                  <View style={$.histInfo}>
                    <Text style={$.histName} numberOfLines={1}>{item.serviceName}</Text>
                    <View style={$.histMeta}>
                      <Ionicons name="calendar-outline" size={9} color={D.w38} />
                      <Text style={$.histDate}>{item.bookingDate||item.date||'—'}</Text>
                      {item.vehicleMake && (
                        <>
                          <Text style={[$.histDate,{marginHorizontal:2}]}>·</Text>
                          <Text style={$.histDate} numberOfLines={1}>{item.vehicleMake}</Text>
                        </>
                      )}
                    </View>
                  </View>
                  <View style={$.histEnd}>
                    <Text style={$.histPrice}>₱{item.totalPrice?.toLocaleString()||'—'}</Text>
                    <Pressable
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(customer)/book'); }}
                      style={$.rebookPill} hitSlop={10}
                    >
                      <Text style={$.rebookTxt}>Re-book</Text>
                    </Pressable>
                  </View>
                </Tap>
              </Animated.View>
            </React.Fragment>
          ))}

          <View style={$.histFoot}>
            <Pressable onPress={() => router.push('/(screens)/appointments')} style={$.histFootBtn} hitSlop={8}>
              <Text style={$.histFootTxt}>View full service history</Text>
              <Ionicons name="arrow-forward" size={12} color={D.w38} />
            </Pressable>
          </View>
        </GBCard>

      ) : (
        <GBCard colors={GB.neutral} radius={RADIUS.card}>
          <LinearGradient colors={['rgba(255,124,30,0.06)','transparent']} style={StyleSheet.absoluteFill} />
          <View style={$.emptyInner}>
            <Animated.View entering={FadeInDown.delay(520).duration(200)} style={$.emptyIconOuter}>
              <LinearGradient colors={[D.Af, D.Ag2]} start={{x:0,y:0}} end={{x:1,y:1}} style={$.emptyIconBg}>
                <Ionicons name="car-sport-outline" size={26} color={D.A} />
              </LinearGradient>
            </Animated.View>
            <Text style={$.emptyH}>No services yet</Text>
            <Text style={$.emptySub}>Your completed services will appear here.</Text>
            <Tap onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(customer)/book'); }}>
              <LinearGradient
                colors={[D.AL, D.A, D.AD]}
                start={{x:0,y:0}} end={{x:1,y:0}}
                style={$.emptyBtn}
              >
                <Text style={$.emptyBtnTxt}>Book Your First Service</Text>
                <Ionicons name="arrow-forward-circle-outline" size={17} color="#fff" />
              </LinearGradient>
            </Tap>
          </View>
        </GBCard>
      )}
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCREEN ORCHESTRATOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function HomeScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { unreadCount } = useNotifications();

  const {
    data: bookings = [],
    refetch: refetchBookings,
    isRefetching,
    isLoading,
    isError: bookingsFailed,
  } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => bookingService.getMyBookings(),
    enabled: !!profile?.id,
  });

  const servicesQuery = useQuery({
    queryKey: ['services'],
    queryFn: () => serviceService.getPublishedServices(),
    enabled: !!profile?.id,
  });
  const vehiclesQuery = useQuery({
    queryKey: ['vehicles'],
    queryFn: () => vehicleService.getMyVehicles(),
    enabled: !!profile?.id,
  });
  const pricingVehicle = vehiclesQuery.data?.[0] || null;

  const refreshHome = useCallback(async () => {
    invalidateCache('/services');
    await Promise.all([
      refetchBookings(),
      servicesQuery.refetch(),
      vehiclesQuery.refetch(),
    ]);
  }, [refetchBookings, servicesQuery, vehiclesQuery]);

  const { job, completed, history, totalSpend } = useMemo(() => {
    const activeRows = bookings
      .filter((b: BookingRecord) => isBookingCountedAsActiveOnHome(b.status))
      .sort(
        (a: BookingRecord, b: BookingRecord) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );
    const trackerRows = bookings.filter((b: BookingRecord) => bookingShowsCustomerLiveTracker(b));
    const primaryJob = pickCustomerLiveTrackerBooking(trackerRows) ?? activeRows[0] ?? null;
    const completedRows = bookings.filter((b: BookingRecord) =>
      ['completed','released','paid'].includes(String(b.status || '').toLowerCase())
    );
    const recentHistory = completedRows.slice(0, 3);

    return {
      job:primaryJob,
      completed:completedRows,
      history:recentHistory,
      totalSpend:recentHistory.reduce((sum, booking) => sum + Number(booking.totalPrice || 0), 0),
    };
  }, [bookings]);

  const heroStep = job ? resolveCustomerHomeRailStep(job) : 0;

  const name = getFirstName(profile?.full_name);

  return (
    <View style={$.screen}>
      <View
        pointerEvents="none"
        style={[$.topChrome, { height:insets.top + SPACE.md }]}
      />
      <Animated.ScrollView
        style={$.scroll}
        contentContainerStyle={[
          $.body,
          {
            paddingTop:insets.top + SPACE.lg,
            paddingBottom:TabBarContentHeight + insets.bottom + SPACE.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        refreshControl={<RefreshControl refreshing={isRefetching || servicesQuery.isRefetching || vehiclesQuery.isRefetching} onRefresh={refreshHome} tintColor={D.A} />}
      >
        {/* 1. HEADER */}
        <HeaderSection
          profile={profile} name={name} router={router}
          unreadCount={unreadCount}
        />

        {/* 2. STATE-AWARE HERO */}
        <View style={$.heroSection}>
          <HeroSection
            job={job} isLoading={isLoading}
            step={heroStep} router={router}
          />
        </View>

        {bookingsFailed && (
          <View style={$.inlineError} accessibilityRole="alert">
            <Ionicons name="cloud-offline-outline" size={17} color={D.w55} />
            <Text style={$.inlineErrorText}>Unable to load your latest booking status.</Text>
            <Pressable onPress={() => void refetchBookings()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Retry bookings">
              <Text style={$.inlineRetry}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* 3. COMPACT TRUST STRIP */}
        <View style={$.sectCompact}>
          <TrustSection />
        </View>

        {/* 4. CONTEXTUAL QUICK ACTIONS */}
        <View style={$.sect}>
          <QuickSection
            router={router}
            completed={completed.length}
            job={job}
            step={heroStep}
            isLoading={isLoading}
          />
        </View>

        {/* 5. SERVICES */}
        <View style={$.sect}>
          <ServicesSection
            router={router}
            services={servicesQuery.data || []}
            vehicle={pricingVehicle}
            isLoading={servicesQuery.isLoading || vehiclesQuery.isLoading}
            hasError={servicesQuery.isError}
            onRetry={() => {
              invalidateCache('/services');
              void servicesQuery.refetch();
            }}
          />
        </View>

        {/* 6. CURRENT PROMO */}
        <View style={$.sect}>
          <PromoSection router={router} />
        </View>

        {/* 7. RECENT HISTORY */}
        <View style={$.sect}>
          <HistorySection history={history} isLoading={isLoading} totalSpend={totalSpend} router={router} />
        </View>

      </Animated.ScrollView>
    </View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GLOBAL STYLESHEET
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const $ = StyleSheet.create({
  screen:  { flex:1, backgroundColor:D.bg },
  scroll:  { flex:1, zIndex:1 },
  topChrome:{
    position:'absolute', top:0, left:0, right:0, zIndex:20,
    backgroundColor:'rgba(5,5,5,0.98)',
    borderBottomWidth:StyleSheet.hairlineWidth,
    borderBottomColor:'rgba(255,255,255,0.035)',
  },
  body:    { paddingHorizontal:SPACE.page },
  sect:    { marginBottom:SPACE.section },
  heroSection:{ marginBottom:22 },
  sectCompact:{ marginBottom:SPACE.xl },
  inlineError:{
    minHeight:48, marginTop:-16, marginBottom:20, paddingHorizontal:14,
    flexDirection:'row', alignItems:'center', gap:10, borderRadius:14,
    backgroundColor:D.w04, borderWidth:1, borderColor:D.w07,
  },
  inlineErrorText:{ flex:1, color:D.w55, fontSize:11.5, fontWeight:'600' },
  inlineRetry:{ color:D.A, fontSize:11.5, fontWeight:'800' },

  // ── HEADER ────────────────────────────────────────────────────
  hdr:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', gap:SPACE.md, marginBottom:SPACE.xxl },
  hdrCopy:  { flex:1, minWidth:0, paddingTop:1 },
  greet:    { fontSize:13, color:'rgba(237,229,221,0.58)', fontWeight:'500', letterSpacing:0.1 },
  nameText: { fontWeight:'800', color:D.w100, letterSpacing:-0.9 },
  hdrActions:{ flexDirection:'row', alignItems:'center', gap:8, flexShrink:0 },
  bellBtn:{
    backgroundColor:'#101011',
    borderWidth:1, borderColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center',
    ...sh('#000',0.10,5,2),
  },
  notifBubble:{
    position:'absolute', top:6, right:6, minWidth:16, height:16, borderRadius:8,
    backgroundColor:D.A, borderWidth:1.5, borderColor:D.bg,
    alignItems:'center', justifyContent:'center', paddingHorizontal:3,
  },
  notifTxt: { color:'#fff', fontSize:8, fontWeight:'900' },
  avRing:   {
    padding:1.2, backgroundColor:'#101011', borderWidth:1.2,
    borderColor:'rgba(255,112,32,0.82)',
  },
  avCore:   { flex:1, backgroundColor:'#0C0C0D', alignItems:'center', justifyContent:'center', overflow:'hidden' },
  avChar:   { color:D.w100, fontWeight:'800', fontSize:15 },

  // ── TRACKER CARD ──────────────────────────────────────────────
  trGlow: { position:'absolute', top:-90, right:-90, width:220, height:220, borderRadius:110, backgroundColor:'rgba(255,124,30,0.055)' },
  trBody: { padding:SPACE.xl },
  trRow1: { flexDirection:'row', alignItems:'center', marginBottom:SPACE.md },
  livePill:{
    flexDirection:'row', alignItems:'center', gap:8,
    backgroundColor:'rgba(255,124,30,0.085)', paddingHorizontal:11, paddingVertical:7, borderRadius:22,
    borderWidth:1, borderColor:'rgba(255,124,30,0.16)', flexShrink:1,
  },
  liveTxt:   { color:D.A, fontSize:9, fontWeight:'900', letterSpacing:1.4, flexShrink:1 },
  plateBadge:{ flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(255,255,255,0.028)', paddingHorizontal:9, paddingVertical:5, borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,0.055)', flexShrink:0 },
  plateNum:  { color:D.w55, fontSize:10, fontWeight:'700', letterSpacing:1.4 },
  trHeadline:{ fontSize:23, lineHeight:28, fontWeight:'800', color:'#FFF8F1', letterSpacing:-0.5, marginBottom:8 },
  trVeh:     { fontSize:14, fontWeight:'700', color:D.w75, letterSpacing:-0.2, marginBottom:9 },
  trMetaRow: { flexDirection:'row', alignItems:'center', gap:10 },
  trSvcRow:  { flex:1, minWidth:0, flexDirection:'row', alignItems:'center', gap:7 },
  trSvc:     { fontSize:12, color:D.w55, fontWeight:'600', flex:1 },
  trFooter:  { flexDirection:'row', alignItems:'center', gap:12, paddingTop:15, borderTopWidth:1, borderTopColor:D.w07 },
  trContext: { flex:1, minWidth:0, flexDirection:'row', alignItems:'center', gap:7 },
  trContextText:{ flex:1, fontSize:10.5, lineHeight:15, color:D.w55, fontWeight:'600' },
  trViewBtn: {
    marginLeft:'auto', flexDirection:'row', alignItems:'center', gap:7,
    minHeight:38, paddingHorizontal:14, paddingVertical:8, borderRadius:12,
    backgroundColor:'#F2E6D7', ...sh('#000',0.12,6,2),
  },
  trViewTxt: { color:'#3A1B10', fontSize:11, fontWeight:'800', letterSpacing:0.2 },
  appointmentSummary:{
    minHeight:54, marginTop:17, marginBottom:17, paddingHorizontal:14,
    flexDirection:'row', alignItems:'center', gap:10, borderRadius:15,
    backgroundColor:D.w04, borderWidth:1, borderColor:D.w07,
  },
  appointmentSchedule:{ color:D.w92, fontSize:14, fontWeight:'700' },
  paymentSummary:{
    marginTop:17, marginBottom:17, padding:14, borderRadius:15,
    flexDirection:'row', alignItems:'flex-end', justifyContent:'space-between', gap:16,
    backgroundColor:D.w04, borderWidth:1, borderColor:D.w07,
  },
  paymentLabel:{ color:D.w38, fontSize:8.5, fontWeight:'800', letterSpacing:1.5, marginBottom:4 },
  paymentAmount:{ color:D.w100, fontSize:25, fontWeight:'900', letterSpacing:-0.4 },
  paymentHint:{ flex:1, color:D.w55, fontSize:10.5, lineHeight:15, textAlign:'right', fontWeight:'600' },

  // ── HERO BOOK CTA ─────────────────────────────────────────────
  heroCard:  {
    borderRadius:RADIUS.hero, overflow:'hidden',
    borderWidth:1, borderColor:'rgba(236,112,55,0.24)',
    ...sh('#4B1B0E',0.18,14,5),
  },
  hC:        {
    position:'absolute', borderRadius:999,
    backgroundColor:'rgba(17,9,7,0.11)',
    borderWidth:1, borderColor:'rgba(229,91,35,0.07)',
  },
  heroBody:  {
    flex:1, justifyContent:'flex-start',
  },
  heroTopRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' },
  heroBrandCopy:{ flex:1, minWidth:0 },
  heroBrand: { color:'#FF8445', fontWeight:'800', letterSpacing:1.55 },
  heroEye:   { color:'rgba(242,205,183,0.76)', fontWeight:'500' },
  heroCarBadge:{
    position:'absolute', zIndex:2, flexShrink:0,
    backgroundColor:'rgba(45,20,13,0.58)', borderWidth:1,
    borderColor:'rgba(245,147,95,0.24)', alignItems:'center', justifyContent:'center',
  },
  heroH1:    {
    fontWeight:'800', color:'#FFF8F1', letterSpacing:-1.05,
  },
  heroServiceRow:{ flexDirection:'row', alignItems:'center' },
  heroServiceLabel:{ color:'rgba(239,216,202,0.82)', fontWeight:'500', letterSpacing:-0.05 },
  heroServiceDot:{ color:'#F16D2E', fontWeight:'800' },
  heroBot:   { width:'100%', alignItems:'flex-start' },
  heroCTA:{
    flexDirection:'row', alignItems:'center', overflow:'hidden',
    backgroundColor:'#F3E8D9', alignSelf:'flex-start',
    borderWidth:1, borderColor:'rgba(255,247,235,0.58)',
    ...sh('#000',0.14,6,2),
  },
  heroCTATxt:  { fontWeight:'800', color:'#37190F', letterSpacing:-0.25 },
  heroCTAdge:  { alignSelf:'stretch', backgroundColor:'rgba(168,63,18,0.085)', alignItems:'center', justifyContent:'center' },
  heroMeta:    { width:'100%', flexDirection:'row', alignItems:'center' },
  heroMetaChip:{ flex:1, minWidth:0, flexDirection:'row', alignItems:'center', justifyContent:'center' },
  heroMetaDivider:{ width:StyleSheet.hairlineWidth, height:18, backgroundColor:'rgba(242,220,205,0.14)' },
  heroMetaTxt: { color:'rgba(238,219,207,0.80)', fontWeight:'600', letterSpacing:-0.1 },

  // ── TRUST ────────────────────────────────────────────────────
  trustStrip:{
    height:48, flexDirection:'row', alignItems:'center', borderRadius:RADIUS.control,
    backgroundColor:D.w04, borderWidth:1, borderColor:D.w07, paddingHorizontal:SPACE.sm,
  },
  trustItem:{ flex:1, minWidth:0, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5 },
  trustDivider:{ width:StyleSheet.hairlineWidth, height:16, backgroundColor:D.w07 },
  trustTxt:{ flex:1, minWidth:0, fontSize:9, color:TYPE.bodyColor, fontWeight:'700', textAlign:'center' },

  // ── EYEBROW ──────────────────────────────────────────────────
  eyeRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:SPACE.md },
  eyeL:   { flexDirection:'row', alignItems:'center', gap:SPACE.sm },
  eyeDash:{ width:2, height:12, borderRadius:1, backgroundColor:D.A },
  eyeLabel:{ fontSize:10, lineHeight:12, color:D.w55, fontWeight:'800', letterSpacing:TYPE.sectionTracking, textTransform:'uppercase' },
  eyeCta: { fontSize:12, color:D.A, fontWeight:'700', letterSpacing:0.2 },

  // ── QUICK ACTIONS ────────────────────────────────────────────
  qaGrid:       { flexDirection:'row', flexWrap:'wrap', gap:SPACE.md },
  qaGridItem:   { width:'48%', minHeight:92 },
  qaCardBody:   { flex:1, padding:SPACE.md },
  qaCardTop:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:SPACE.sm },
  qaTopRight:   { flexDirection:'row', alignItems:'center', gap:SPACE.xs },
  qaArrow:      { width:24, height:24, borderRadius:12, alignItems:'center', justifyContent:'center', backgroundColor:D.w04 },
  qaSubLbl:     { fontSize:9.5, color:TYPE.supportingColor, fontWeight:'500', marginTop:SPACE.xs },
  qaSmIcon:     { width:32, height:32, borderRadius:12, backgroundColor:D.w04, borderWidth:1, borderColor:D.w07, alignItems:'center', justifyContent:'center' },
  qaSmName:     { fontSize:13.5, fontWeight:'700', color:D.w92, letterSpacing:-0.15 },
  qaBadge:      { minWidth:22, height:22, paddingHorizontal:6, borderRadius:8, backgroundColor:D.Gf, borderWidth:1, borderColor:D.Gb, alignItems:'center', justifyContent:'center' },
  qaBadgeTxt:   { color:D.G, fontSize:10, fontWeight:'800' },

  // ── SERVICES ─────────────────────────────────────────────────
  svcWrap:  { width:SERVICE_CARD_WIDTH, marginLeft:14, borderRadius:RADIUS.card, overflow:'hidden', ...sh('#000',0.28,12,5) },
  svcCard:  { height:220, padding:SPACE.lg, justifyContent:'flex-end', borderWidth:1, borderColor:D.w07 },
  svcCardNarrow:{ height:252 },
  svcLoadingRow:{ flexDirection:'row', gap:14 },
  svcStateCard:{ minHeight:112, borderRadius:20, borderWidth:1, borderColor:D.w07, backgroundColor:D.w04, padding:18, flexDirection:'row', alignItems:'center', gap:12 },
  svcStateText:{ flex:1, color:D.w55, fontSize:12, fontWeight:'600', lineHeight:18 },
  svcRetry:{ color:D.A, fontSize:12, fontWeight:'800' },
  svcOrb:   { position:'absolute', top:-52, right:-52, width:138, height:138, borderRadius:69, backgroundColor:'rgba(255,255,255,0.055)' },
  svcBadgeSlot:{ minHeight:23, justifyContent:'flex-start', marginBottom:SPACE.xs },
  svcBadgePill:{ alignSelf:'flex-start', paddingHorizontal:7, paddingVertical:4, borderRadius:7, backgroundColor:D.Af },
  svcBadgeRecommended:{ backgroundColor:D.Gf, borderWidth:1, borderColor:D.Gb },
  svcBadge: { color:D.AL, fontSize:8, fontWeight:'900', letterSpacing:1 },
  svcBadgeRecommendedText:{ color:D.G },
  svcName:  { minHeight:44, fontSize:17, fontWeight:'800', color:'#fff', lineHeight:21, letterSpacing:-0.35 },
  svcTag:   { minHeight:28, fontSize:10, lineHeight:14, color:'rgba(255,255,255,0.62)', fontWeight:'600', letterSpacing:0.2, marginBottom:SPACE.sm },
  svcFoot:  { flexDirection:'row', alignItems:'center', width:'100%', gap:6 },
  svcFootNarrow:{ flexDirection:'column', alignItems:'stretch' },
  svcPrBadge:{ flex:1, minWidth:0, backgroundColor:'rgba(0,0,0,0.20)', paddingHorizontal:7, paddingVertical:5, borderRadius:10 },
  svcPrBadgeNarrow:{ flex:0, alignSelf:'stretch' },
  svcPr:    { fontSize:11, color:'rgba(255,255,255,0.80)', fontWeight:'700' },
  svcBookPill:{ flexShrink:0, minHeight:32, backgroundColor:'rgba(255,255,255,0.16)', borderWidth:1, borderColor:'rgba(255,255,255,0.12)', paddingHorizontal:10, paddingVertical:6, borderRadius:12, alignItems:'center', justifyContent:'center' },
  svcBookPillNarrow:{ alignSelf:'stretch' },
  svcBookTxt: { fontSize:10, fontWeight:'800', color:'#fff', letterSpacing:0.6 },

  // ── PROMO ────────────────────────────────────────────────────
  promoBody:   { flexDirection:'row', alignItems:'center', padding:SPACE.lg, gap:SPACE.lg },
  promoLeft:   { flex:1 },
  promoBadge:  { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:D.Go, paddingHorizontal:9, paddingVertical:4, borderRadius:9, alignSelf:'flex-start' },
  promoBadgeTxt:{ fontSize:9, color:D.bg, fontWeight:'900', letterSpacing:1.5 },
  promoTitle:  { fontSize:17, fontWeight:'800', color:D.w92, letterSpacing:-0.3, marginTop:SPACE.sm },
  promoSub:    { fontSize:12, lineHeight:17, color:TYPE.bodyColor, fontWeight:'500', marginTop:SPACE.xs },
  promoSaveRow:{ flexDirection:'row', alignItems:'center', gap:5, marginTop:SPACE.sm },
  promoSaveTxt:{ fontSize:11, color:D.AL, fontWeight:'700' },
  promoRight:  { alignItems:'center', gap:12 },
  promoIconBg: { width:48, height:48, borderRadius:16, backgroundColor:D.Gof, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:D.Gob },
  promoArrow:  { width:34, height:34, borderRadius:11, backgroundColor:D.Gof, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:D.Gob },

  // ── HISTORY ──────────────────────────────────────────────────
  histSkRow:  { flexDirection:'row', alignItems:'center', padding:18 },
  histHdr:    { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:18, paddingBottom:14 },
  histHdrEye: { fontSize:9, color:D.w38, fontWeight:'800', letterSpacing:2.8, marginBottom:4 },
  histHdrAmt: { fontSize:28, fontWeight:'900', color:D.w100, letterSpacing:-0.6 },
  histHdrRight:{ alignItems:'flex-end' },
  histHdrBadge:{ backgroundColor:D.w07, paddingHorizontal:10, paddingVertical:5, borderRadius:10, borderWidth:1, borderColor:D.w10 },
  histHdrBadgeTxt:{ fontSize:11, color:D.w55, fontWeight:'600' },
  histDivHdr: { height:1, backgroundColor:D.w07, marginHorizontal:18 },
  histDiv:    { height:1, backgroundColor:D.w07, marginHorizontal:18 },
  histRow:    { flexDirection:'row', alignItems:'center', paddingHorizontal:18, paddingVertical:16 },
  histBubble: { width:44, height:44, borderRadius:15, backgroundColor:D.Gf, alignItems:'center', justifyContent:'center', marginRight:14, flexShrink:0 },
  histInfo:   { flex:1, gap:5 },
  histName:   { color:D.w92, fontSize:14, fontWeight:'700', letterSpacing:-0.2 },
  histMeta:   { flexDirection:'row', alignItems:'center', gap:4 },
  histDate:   { color:D.w38, fontSize:11, fontWeight:'500' },
  histEnd:    { alignItems:'flex-end', gap:7, flexShrink:0 },
  histPrice:  { color:D.w100, fontSize:15, fontWeight:'800' },
  rebookPill: { paddingHorizontal:10, paddingVertical:4, borderRadius:9, borderWidth:1, borderColor:D.Ab, backgroundColor:D.Af },
  rebookTxt:  { color:D.A, fontSize:10, fontWeight:'800', letterSpacing:0.3 },
  histFoot:   { borderTopWidth:1, borderTopColor:D.w07, paddingVertical:14, paddingHorizontal:18 },
  histFootBtn:{ flexDirection:'row', alignItems:'center', gap:6 },
  histFootTxt:{ fontSize:12, color:D.w38, fontWeight:'600' },

  // ── EMPTY STATE ───────────────────────────────────────────────
  emptyInner:   { minHeight:232, alignItems:'center', justifyContent:'center', padding:SPACE.xl },
  emptyIconOuter:{ marginBottom:SPACE.md },
  emptyIconBg:  { width:52, height:52, borderRadius:RADIUS.icon, alignItems:'center', justifyContent:'center' },
  emptyH:       { color:D.w75, fontSize:17, fontWeight:'700', marginBottom:8 },
  emptySub:     { color:TYPE.supportingColor, fontSize:12.5, fontWeight:'500', textAlign:'center', lineHeight:18, marginBottom:SPACE.lg, maxWidth:260 },
  emptyBtn:     { minHeight:44, flexDirection:'row', alignItems:'center', gap:9, paddingHorizontal:20, paddingVertical:11, borderRadius:15 },
  emptyBtnTxt:  { color:'#fff', fontSize:14, fontWeight:'800', letterSpacing:0.2 },

});
