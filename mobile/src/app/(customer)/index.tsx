/**
 * AutoSPF+ — Home Dashboard · v5 FINAL
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  ARCHITECTURE
 *  ─────────────────────────────────────────────────
 *  Tokens          → D (design tokens)
 *  Atoms           → Pulse · Shim · Tap · CountUp · FloatBadge
 *  Molecules       → GBCard · Specular · Rail · SectionEye
 *  Sections        → HeaderSection · HeroSection · StatsSection
 *                    TrustSection · QuickSection · ServicesSection
 *                    PromoSection · HistorySection · CareSection
 *                    LoyaltySection
 *  Screen          → HomeScreen (orchestrator)
 *  Styles          → $ (shared StyleSheet)
 *
 *  ANIMATIONS (Reanimated v3)
 *  ─────────────────────────────────────────────────
 *  1. Scroll-driven parallax on hero card (translateY)
 *  2. Scroll-driven header fade/scale collapse
 *  3. Scroll-driven frosted app-bar reveal
 *  4. CountUp — animated number counter on stats reveal
 *  5. FloatBadge — continuous sine-wave float on hero icon
 *  6. PulsingDot — live indicator with ring emission
 *  7. GoldShimmer — skeleton loading with animated grad
 *  8. Spring-scale on every Tap pressable (bouncy physics)
 *  9. Staggered FadeInUp on each section (variable delay)
 * 10. SlideInRight on horizontal scroll card entries
 * 11. Rail fill width animates from 0% on mount
 * 12. Loyalty progress bar animates in on section enter
 *
 *  HOMEPAGE CONTENT (what belongs here for a car service app)
 *  ─────────────────────────────────────────────────
 *  1. Greeting + profile         (personalisation, trust)
 *  2. Live job tracker / Book CTA (primary intent, most used)
 *  3. Stats summary              (progress, social proof)
 *  4. Trust badges               (authority, credibility)
 *  5. Quick actions bento        (navigation shortcuts)
 *  6. Services gallery           (discovery, upsell)
 *  7. Current promo / deal       (conversion, urgency)
 *  8. Recent history             (re-booking, habit)
 *  9. After-care tips            (retention, care)
 * 10. Loyalty progress           (gamification, retention)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import React, { useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  Dimensions, Platform, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeInRight, SlideInRight,
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  withRepeat, withTiming, withSequence,
withDelay, Easing, interpolate, Extrapolation,
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
  bookingShowsCustomerLiveTracker,
  pickCustomerLiveTrackerBooking,
} from '@/utils/customer-live-tracker-pick';
import {
  resolveCustomerHomeRailStep,
} from '@/utils/customer-home-rail-step';
import { useNotifications } from '@/context/NotificationsContext';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VIEWPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { width: W } = Dimensions.get('window');
const IOS = Platform.OS === 'ios';
const SERVICE_CARD_WIDTH = (W - 54) / 2;
const USE_STACKED_SERVICE_FOOTER = SERVICE_CARD_WIDTH < 200;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const D = {
  // Canvas — obsidian with warmth
  bg:  '#05070A',
  s0:  '#070A0F',
  s1:  '#0A0D13',
  s2:  '#0F131B',
  s3:  '#151A24',

  // PRIMARY BRAND — amber/orange
  A:   '#FF7C1E',
  AL:  '#FFA855',
  AD:  '#C55000',
  Ag:  'rgba(255,124,30,0.24)',
  Af:  'rgba(255,124,30,0.11)',
  Ab:  'rgba(255,124,30,0.18)',
  Ag2: 'rgba(255,124,30,0.05)',

  // GOLD — prestige
  Go:     '#CFA840',
  GoL:    '#EEC84A',
  Gof:    'rgba(207,168,64,0.11)',
  Gob:    'rgba(207,168,64,0.20)',

  // SEMANTIC
  G: '#2DDBA6', Gf: 'rgba(45,219,166,0.11)', Gb: 'rgba(45,219,166,0.22)',
  B: '#4F91FF', Bf: 'rgba(79,145,255,0.11)', Bb: 'rgba(79,145,255,0.22)',
  V: '#9874FF', Vf: 'rgba(152,116,255,0.11)',Vb: 'rgba(152,116,255,0.22)',
  R: '#F87171', Rf: 'rgba(248,113,113,0.11)',
  Y: '#F5B820', Yf: 'rgba(245,184,32,0.11)', Yb: 'rgba(245,184,32,0.22)',
  C: '#22D3EE', Cf: 'rgba(34,211,238,0.11)',

  // WHITE ALPHA RAMP
  w100: '#FFFFFF',
  w92:  'rgba(255,255,255,0.92)',
  w75:  'rgba(255,255,255,0.75)',
  w55:  'rgba(255,255,255,0.55)',
  w38:  'rgba(255,255,255,0.38)',
  w24:  'rgba(255,255,255,0.24)',
  w16:  'rgba(255,255,255,0.16)',
  w10:  'rgba(255,255,255,0.10)',
  w07:  'rgba(255,255,255,0.07)',
  w04:  'rgba(255,255,255,0.04)',
  w02:  'rgba(255,255,255,0.02)',
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRADIENT BORDER PRESETS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GB = {
  amber:   [D.Ab, 'rgba(255,124,30,0.06)', D.Ab]    as const,
  neutral: [D.w16, D.w04, D.w10]                   as const,
  gold:    [D.Gob, D.Gof, D.Gob]                   as const,
  green:   [D.Gb, D.Gf, D.Gb]                      as const,
  blue:    [D.Bb, D.Bf, D.Bb]                      as const,
  violet:  [D.Vb, D.Vf, D.Vb]                      as const,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATIC DATA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Home 8-step rail labels (must match `CUSTOMER_HOME_RAIL_LABELS` in customer-home-rail-step.ts)
const STEPS = ['Booked', 'Confirmed', 'Assigned', 'Checked in', 'In Service', 'QC', 'Payment', 'Released'];

const TRUST = [
  { icon:'shield-checkmark-outline' as const, label:'LTFRB Certified' },
  { icon:'ribbon-outline'           as const, label:'Licensed Shop'   },
  { icon:'checkmark-circle-outline' as const, label:'Insured Work'    },
  { icon:'star-outline'             as const, label:'Rated 4.9'       },
];

const PROMOS = [
  { badge:'LIMITED', title:'Free Interior Detailing', sub:'Book any tint package this month', save:'₱800 value', icon:'sparkles' as const },
];

const CARE_TIPS = [
  { icon:'close-circle-outline' as const, tag:'Critical',  tip:'Keep windows closed for 7 days after installation.' },
  { icon:'water-outline'        as const, tag:'Normal',    tip:'Water bubbles are normal — they vanish within 30 days.' },
  { icon:'brush-outline'        as const, tag:'Reminder',  tip:'Do not clean interior glass for the first 2 weeks.' },
  { icon:'sunny-outline'        as const, tag:'Pro Tip',   tip:'Shade parking accelerates film curing significantly.' },
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
// ATOM: Ambient background orbs (very slow, barely visible)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const OrbConfig = [
  { w:360, h:360, top:-170, right:-150, color:'rgba(255,124,30,0.16)', d:15000 },
  { w:260, h:260, top:590, left:-145, color:'rgba(255,124,30,0.08)', d:21000 },
] as const;

function AmbientOrb({ orb, index }: { orb: typeof OrbConfig[number]; index: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: orb.d, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
  }, [orb.d, progress]);

  const anim = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0,0.5,1],[0.06,0.13,0.06]),
    transform:[
      {translateX: interpolate(progress.value,[0,1],[0,index%2===0?42:-36])},
      {translateY: interpolate(progress.value,[0,1],[0,index%2===0?28:32])},
    ],
  }));

  const horizontalPosition =
    'right' in orb ? { right: orb.right } : { left: orb.left };

  return (
    <Animated.View
      style={[
        $.orb,
        {
          width: orb.w,
          height: orb.h,
          top: orb.top,
          backgroundColor: orb.color,
          ...horizontalPosition,
        },
        anim,
      ]}
    />
  );
}

function Orbs() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {OrbConfig.map((orb, index) => (
        <AmbientOrb key={orb.d} orb={orb} index={index} />
      ))}
    </View>
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
// ATOM: Float badge — sine wave up/down animation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function FloatBadge({ children, style }: { children: React.ReactNode; style?: any }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming( 0, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, [y]);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
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
  children, onPress, style, h = 'Light', targetScale = 0.98,
}: {
  children: React.ReactNode; onPress?: () => void;
  style?: any; h?: 'Light'|'Medium'|'Heavy'; targetScale?: number;
}) {
  const sc = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  return (
    <Animated.View style={[anim, style]}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle[h]); onPress?.(); }}
        onPressIn={() => { sc.value = withTiming(targetScale, { duration: 220 }); }}
        onPressOut={() => { sc.value = withTiming(1, { duration: 220 }); }}
        style={{ flex: 1 }}
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
  profile, name, scrollY, active, completed, router, unreadCount,
}: any) {
  const hdrAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [0,110], [0,-10], Extrapolation.CLAMP) }],
    opacity: interpolate(scrollY.value, [0,80], [1,0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[$.hdr, hdrAnim]}>
      {/* Name block */}
      <View style={$.hdrCopy}>
        <Animated.Text entering={FadeIn.delay(60).duration(380)} style={$.greet}>
          {greet()}
        </Animated.Text>
        <Text style={$.nameText} numberOfLines={1}>
          {name}
        </Text>
        {(active.length > 0 || completed > 0) && (
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={$.summPill}>
            <View style={{ width:5, height:5, borderRadius:3, backgroundColor: active.length > 0 ? D.A : D.G }} />
            <Text style={$.summTxt}>
              {active.length > 0
                ? `${active.length} ${active.length === 1 ? 'service' : 'services'} in progress`
                : 'All services complete'}
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Action cluster */}
      <View style={$.hdrActions}>
        <Tap onPress={() => router.push('/(screens)/notifications')} targetScale={0.92}>
          <View style={$.bellBtn}>
            <Ionicons name="notifications-outline" size={18} color={D.w55} />
            {unreadCount > 0 && (
              <View style={$.notifBubble}>
                <Text style={$.notifTxt}>{unreadCount > 99 ? '99+' : String(unreadCount)}</Text>
              </View>
            )}
          </View>
        </Tap>
        <Tap onPress={() => router.push('/(customer)/settings')} targetScale={0.93}>
          <LinearGradient colors={[D.A, D.Go]} start={{x:0,y:0}} end={{x:1,y:1}} style={$.avRing}>
            <View style={$.avCore}>
              {profile?.avatar_url
                ? <Image source={profile.avatar_url} style={{width:'100%',height:'100%'}} contentFit="cover" />
                : <Text style={$.avChar}>{(profile?.full_name?.charAt(0)||'?').toUpperCase()}</Text>
              }
            </View>
          </LinearGradient>
        </Tap>
      </View>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Hero — live tracker OR book CTA (scroll-parallax)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HeroSection({ job, isLoading, step, router }: {
  job: BookingRecord | null;
  isLoading: boolean;
  step: number;
  router: ReturnType<typeof useRouter>;
}) {
  if (isLoading) return <Shim w={W-44} h={240} r={32} />;

  if (job) {
    const context = getTrackingContext(job, step);
    return (
      <Animated.View entering={FadeIn.duration(240)}>
        <Tap onPress={() => router.push({ pathname:'/(customer)/track', params:{ id:job.id } })} h="Light">
          <GBCard colors={GB.amber} radius={26} style={sh(D.A, 0.14, 22, 7)}>
            <LinearGradient
              colors={['rgba(255,124,30,0.11)','rgba(207,168,64,0.04)','transparent']}
              start={{x:0,y:0}} end={{x:1.2,y:1.2}}
              style={StyleSheet.absoluteFill}
            />
            <Spec op={0.04} />
            <View style={$.trGlow} />

            <View style={$.trBody}>
              <View style={$.trRow1}>
                <View style={$.livePill}>
                  {job.status === 'pending_confirmation' ? (
                    <>
                      <Ionicons name="time-outline" size={12} color={D.A} />
                      <Text style={$.liveTxt} numberOfLines={1} adjustsFontSizeToFit>PENDING CONFIRMATION</Text>
                    </>
                  ) : (
                    <>
                      <Pulse color={D.A} size={6} />
                      <Text style={$.liveTxt} numberOfLines={1}>LIVE  TRACKING</Text>
                    </>
                  )}
                </View>
              </View>

              <Animated.Text entering={FadeInDown.delay(300).duration(200)} style={$.trVeh} numberOfLines={1} adjustsFontSizeToFit>
                {String(job.vehicleMake||'')} {String(job.vehicleModel||'')}
              </Animated.Text>
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

              <Rail step={step} />

              <View style={$.trFooter}>
                <View style={$.trContext}>
                  <Ionicons name={context.icon} size={13} color={D.w38} />
                  <Text style={$.trContextText} numberOfLines={2}>{context.text}</Text>
                </View>
                <View style={$.trViewBtn}>
                  <Text style={$.trViewTxt}>View Details</Text>
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
      <Tap onPress={() => router.push('/(customer)/book')} h="Medium">
        <View style={$.heroCard}>
          <LinearGradient
            colors={['#D85A1B','#A3320B','#5F1609']}
            start={{x:0,y:0}} end={{x:1.1,y:1.1}}
            style={StyleSheet.absoluteFill}
          />
          {/* Specular diagonal shine */}
          <LinearGradient
            colors={['rgba(255,255,255,0.09)','rgba(255,255,255,0.03)','transparent']}
            start={{x:0,y:0}} end={{x:0.8,y:0.55}}
            style={StyleSheet.absoluteFill}
          />
          {/* Depth circles */}
          <View style={[$.hC, {width:220,height:220,top:-72,right:-72,opacity:0.055}]} />
          <View style={[$.hC, {width:150,height:150,top:48, right:-18,opacity:0.04}]} />
          <View style={[$.hC, {width:90, height:90, bottom:-28,left:66,  opacity:0.045}]} />
          {/* Gold chassis line */}
          <LinearGradient
            colors={['transparent','rgba(255,216,110,0.20)','transparent']}
            start={{x:0,y:0}} end={{x:1,y:0}}
            style={$.heroLine}
          />
          <View style={$.heroBody}>
            {/* Top row */}
            <View style={$.heroTopRow}>
              <View>
                <Text style={$.heroBrand}>AUTOSPF+</Text>
                <Text style={$.heroEye}>PREMIUM AUTO CARE · SINCE 2023</Text>
              </View>
              {/* Floating car badge */}
              <FloatBadge>
                <GBCard
                  colors={['rgba(255,255,255,0.26)','rgba(255,255,255,0.10)','rgba(255,255,255,0.22)']}
                  radius={16} bg="transparent"
                  style={{ width:54, height:54, ...sh('#000',0.18,10,4) }}
                >
                  <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
                    <Ionicons name="car-sport" size={24} color="rgba(255,255,255,0.95)" />
                  </View>
                </GBCard>
              </FloatBadge>
            </View>

            {/* Headline */}
            <View>
              <Text style={$.heroH1}>Schedule Your{'\n'}Next Service</Text>
              <Text style={$.heroSub}>Tinting  ·  PPF  ·  Detailing  ·  Coating</Text>
            </View>

            {/* CTA + meta */}
            <View style={$.heroBot}>
              <View style={$.heroCTA}>
                <Text style={$.heroCTATxt}>Book Now</Text>
                <View style={$.heroCTAdge}>
                  <Ionicons name="arrow-forward" size={13} color="#81270A" />
                </View>
              </View>
              <View style={$.heroMeta}>
                {[
                  {i:'time-outline'  as const, t:'2–4 hrs'},
                  {i:'star-outline'  as const, t:'Rated 4.9'},
                  {i:'ribbon-outline'as const, t:'Certified'},
                ].map(m=>(
                  <View key={m.t} style={$.heroMetaChip}>
                    <Ionicons name={m.i} size={9} color="rgba(255,255,255,0.44)" />
                    <Text style={$.heroMetaTxt}>{m.t}</Text>
                  </View>
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
// SECTION: Stats — restrained three-column summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
type StatCellConfig = {
  n: number;
  lbl: string;
  col: string;
  ic: keyof typeof Ionicons.glyphMap;
};

function StatCell({
  cell,
  index,
}: {
  cell: StatCellConfig;
  index: number;
}) {
  return (
    <React.Fragment>
      {index > 0 && <View style={$.statDiv} />}
      <View style={$.statCell}>
        <Text style={[$.statN, { color:cell.col }]}>{cell.n}</Text>
        <View style={$.statMeta}>
          <Ionicons name={cell.ic} size={13} color={cell.col} />
          <Text style={$.statLbl}>{cell.lbl}</Text>
        </View>
      </View>
    </React.Fragment>
  );
}

function StatsSection({ active, completed, total }: { active:number; completed:number; total:number }) {
  const cells: StatCellConfig[] = [
    { n:active,    lbl:'Active',    col:D.A,   ic:'flash-outline' },
    { n:completed, lbl:'Completed', col:D.G,   ic:'checkmark-done-outline' },
    { n:total,     lbl:'Total Jobs',col:D.w92, ic:'layers-outline' },
  ];

  return (
    <Animated.View entering={FadeInUp.delay(260).duration(200)}>
      <GBCard colors={GB.neutral} radius={22} style={sh('#000',0.20,10,3)}>
        <View style={$.statsRow}>
          {cells.map((cell, index) => (
            <StatCell key={cell.lbl} cell={cell} index={index} />
          ))}
        </View>
      </GBCard>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Trust badges — authority horizontal strip
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TrustSection() {
  return (
    <Animated.View entering={FadeIn.delay(285).duration(500)}>
      <View style={$.trustGrid}>
        {TRUST.map((t, i) => (
          <Animated.View
            key={t.label}
            entering={SlideInRight.delay(300 + i * 50).duration(200)}
            style={$.trustChipWrap}
          >
            <View style={$.trustChip}>
              <Ionicons name={t.icon} size={13} color={D.A} />
              <Text style={$.trustTxt} numberOfLines={1}>{t.label}</Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Quick actions — balanced two-column grid
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function QuickSection({ router, completed }: any) {
  const actions = [
    { icon:'calendar-outline' as const, n:'New Booking', sub:'Schedule premium care', r:'/(customer)/book', primary:true, badge:0 },
    { icon:'navigate-outline' as const, n:'Track My Car', sub:'Follow live progress', r:'/(customer)/track', primary:false, badge:0 },
    { icon:'scan-outline' as const, n:'AI Scan', sub:'Instant assessment', r:'/(customer)/scan', primary:false, badge:0 },
    { icon:'receipt-outline' as const, n:'Service Records', sub:'History and receipts', r:'/(screens)/appointments', primary:false, badge:completed },
  ] as const;

  return (
    <Animated.View entering={FadeInUp.delay(320).duration(200)}>
      <Eye label="Quick Access" />
      <View style={$.qaGrid}>
        {actions.map((action, i) => (
          <Animated.View key={action.n} entering={FadeInDown.delay(350+i*55).duration(200)} style={$.qaGridItem}>
            <Tap onPress={() => router.push(action.r as any)} h={action.primary ? 'Medium' : 'Light'} style={{flex:1}}>
              <GBCard colors={action.primary ? GB.amber : GB.neutral} radius={22} bg={D.s1} style={{flex:1,...sh(action.primary ? D.A : '#000',action.primary ? 0.18 : 0.14,12,4)}}>
                {action.primary && <LinearGradient colors={[D.Af,'transparent']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} />}
                <View style={$.qaCardBody}>
                  <View style={$.qaCardTop}>
                    <View style={[$.qaSmIcon, action.primary && $.qaSmIconPrimary]}>
                      <Ionicons name={action.icon} size={19} color={D.A} />
                    </View>
                    {action.badge > 0 ? (
                      <View style={$.qaBadge}><Text style={$.qaBadgeTxt}>{action.badge}</Text></View>
                    ) : (
                      <Ionicons name="arrow-up-outline" size={14} color={D.w24} style={{transform:[{rotate:'45deg'}]}} />
                    )}
                  </View>
                  <Text style={$.qaSmName}>{action.n}</Text>
                  <Text style={$.qaSubLbl} numberOfLines={1}>{action.sub}</Text>
                </View>
              </GBCard>
            </Tap>
          </Animated.View>
        ))}
      </View>
      <Animated.View entering={FadeInUp.delay(480).duration(200)} style={{marginTop:10}}>
        <Tap onPress={() => router.push('/(screens)/payments')}>
          <GBCard colors={GB.neutral} radius={20} bg={D.s1} style={sh('#000',0.14,10,3)}>
            <View style={$.qaWideBody}>
              <View style={$.qaSmIcon}>
                <Ionicons name="wallet-outline" size={18} color={D.A} />
              </View>
              <View style={{flex:1,marginLeft:14}}>
                <Text style={$.qaSmName}>Payment History</Text>
                <Text style={$.qaSubLbl}>Transactions and receipts</Text>
              </View>
              <Ionicons name="chevron-forward" size={15} color={D.w38} style={{marginLeft:8}} />
            </View>
          </GBCard>
        </Tap>
      </Animated.View>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Services — horizontal gallery 240 px cards
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const SERVICE_CATEGORY_GRADIENTS: Record<string, readonly [string, string]> = {
  Exterior: ['#713014', '#C75A21'],
  Interior: ['#182033', '#3B4E72'],
  Complete: ['#3A2117', '#9A4824'],
  Engine: ['#18211F', '#406D60'],
  Premium: ['#211B35', '#68489C'],
};

const formatServicePrice = (price: number | null, isStartingPrice: boolean) => {
  if (price === null) return 'Price unavailable';
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
          <Shim w={(W-54)/2} h={240} r={26} />
          <Shim w={(W-54)/2} h={240} r={26} />
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
          const gradient = service.catalogCard?.accentFrom && service.catalogCard?.accentTo
            ? [service.catalogCard.accentFrom, service.catalogCard.accentTo] as const
            : SERVICE_CATEGORY_GRADIENTS[service.tag] || ['#26211F', '#754125'] as const;
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
                  colors={['rgba(255,255,255,0.15)','rgba(255,255,255,0.05)','transparent']}
                  start={{x:0,y:0}} end={{x:1,y:0.65}}
                  style={StyleSheet.absoluteFill}
                />
                {/* Depth orb */}
                <View style={$.svcOrb} />

                {/* Glass icon top-left */}
                <GBCard
                  colors={['rgba(255,255,255,0.28)','rgba(255,255,255,0.10)','rgba(255,255,255,0.22)']}
                  radius={15} bg="rgba(255,255,255,0.10)"
                  style={{width:48,height:48,...sh('#000',0.12,6,2)}}
                >
                  <View style={{flex:1,alignItems:'center',justifyContent:'center'}}>
                    <Ionicons name={service.icon as keyof typeof Ionicons.glyphMap} size={19} color="rgba(255,255,255,0.96)" />
                  </View>
                </GBCard>

                <View style={{flex:1}} />
                {service.catalogCard?.badge ? (
                  <Text style={$.svcBadge} numberOfLines={1}>{service.catalogCard.badge}</Text>
                ) : null}
                <Text style={$.svcName} numberOfLines={2}>{service.name}</Text>
                {metadata ? <Text style={$.svcTag} numberOfLines={2}>{metadata}</Text> : null}
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
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, [glow]);
  const glowAnim = useAnimatedStyle(() => ({ opacity: interpolate(glow.value, [0,1], [0.06,0.16]) }));

  return (
    <Animated.View entering={FadeInUp.delay(430).duration(200)}>
      <Eye label="Current Offer" />
      <Tap onPress={() => router.push('/(customer)/book')} h="Medium">
        <GBCard colors={GB.gold} radius={26} style={sh(D.Go,0.18,22,7)}>
          <LinearGradient
            colors={['rgba(207,168,64,0.10)','rgba(207,168,64,0.04)','transparent']}
            start={{x:0,y:0}} end={{x:1,y:1}}
            style={StyleSheet.absoluteFill}
          />
          {/* Breathe glow overlay */}
          <Animated.View style={[{...StyleSheet.absoluteFillObject, backgroundColor:D.Go}, glowAnim]} pointerEvents="none" />
          <Spec op={0.04} />

          <View style={$.promoBody}>
            <View style={$.promoLeft}>
              <View style={$.promoBadge}>
                <Ionicons name="flash" size={10} color={D.bg} />
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
        <GBCard colors={GB.neutral} radius={26} style={sh('#000',0.22,12,4)}>
          <LinearGradient colors={['rgba(255,124,30,0.06)','transparent']} style={StyleSheet.absoluteFill} />
          <View style={$.emptyInner}>
            <Animated.View entering={FadeInDown.delay(520).duration(200)} style={$.emptyIconOuter}>
              <LinearGradient colors={[D.Af, D.Ag2]} start={{x:0,y:0}} end={{x:1,y:1}} style={$.emptyIconBg}>
                <Ionicons name="car-sport-outline" size={32} color={D.A} />
              </LinearGradient>
            </Animated.View>
            <Text style={$.emptyH}>No service history yet</Text>
            <Text style={$.emptySub}>Your completed appointments will appear here with one-tap re-booking.</Text>
            <Tap onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(customer)/book'); }}>
              <LinearGradient
                colors={[D.AL, D.A, D.AD]}
                start={{x:0,y:0}} end={{x:1,y:0}}
                style={$.emptyBtn}
              >
                <Text style={$.emptyBtnTxt}>Schedule First Service</Text>
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
// SECTION: After-care tips (conditional — recent completed job)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CareSection({ freshJob }: { freshJob: any }) {
  if (!freshJob) return null;
  const isTint = freshJob.serviceName?.toLowerCase().includes('tint');
  const tips = isTint ? CARE_TIPS : CARE_TIPS.slice(1);

  return (
    <Animated.View entering={FadeInUp.delay(530).duration(200)}>
      <Eye label="After-Care Guide" />
      <GBCard colors={GB.gold} radius={26} style={sh(D.Go,0.14,18,5)}>
        <LinearGradient
          colors={['rgba(207,168,64,0.08)','transparent']}
          start={{x:0,y:0}} end={{x:1,y:1}}
          style={StyleSheet.absoluteFill}
        />
        {/* Gold accent top bar */}
        <LinearGradient colors={[D.Go,D.GoL]} start={{x:0,y:0}} end={{x:1,y:0}} style={$.careBar} />
        <View style={$.careHead}>
          <View style={$.careIconBg}>
            <Ionicons name="bulb-outline" size={16} color={D.Go} />
          </View>
          <View style={{flex:1}}>
            <Text style={$.careEye}>CARE INSTRUCTIONS FOR</Text>
            <Text style={$.careSvc}>{freshJob.serviceName}</Text>
          </View>
          <View style={$.careLiveBadge}>
            <Pulse color={D.Go} size={5} />
            <Text style={$.careLiveTxt}>Active</Text>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={$.tipScroll}>
          {tips.map((t, i) => (
            <Animated.View key={i} entering={SlideInRight.delay(550+i*60).duration(200)} style={$.tipCard}>
              <View style={$.tipIconBg}>
                <Ionicons name={t.icon} size={15} color={D.Go} />
              </View>
              <View style={$.tipTagPill}>
                <Text style={$.tipTagTxt}>{t.tag}</Text>
              </View>
              <Text style={$.tipBody}>{t.tip}</Text>
            </Animated.View>
          ))}
        </ScrollView>
      </GBCard>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Loyalty — gamified progress to next tier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LoyaltySection({ completed, router }: { completed: number; router: any }) {
  const barAnim = useSharedValue(0);
  useEffect(() => {
    barAnim.value = withDelay(200, withTiming(Math.min(completed / 5, 1), {
      duration: 1100, easing: Easing.out(Easing.exp),
    }));
  }, [barAnim, completed]);
  const fillWidth = useAnimatedStyle(() => ({ width: `${barAnim.value * 100}%` as any }));
  const isGold = completed >= 5;

  return (
    <Animated.View entering={FadeInUp.delay(575).duration(200)}>
      <Tap onPress={() => router.push('/(screens)/appointments')}>
        <GBCard colors={GB.gold} radius={26} style={sh(D.Go,0.18,20,7)}>
          <LinearGradient
            colors={['rgba(207,168,64,0.11)','rgba(207,168,64,0.03)','transparent']}
            start={{x:0,y:0}} end={{x:1,y:1}}
            style={StyleSheet.absoluteFill}
          />
          <Spec op={0.04} />
          <View style={$.loyRow}>
            <LinearGradient colors={[D.Go,D.GoL]} start={{x:0,y:0}} end={{x:1,y:1}} style={$.loyIconBg}>
              <Ionicons name="trophy-outline" size={18} color={D.bg} />
            </LinearGradient>
            <View style={{flex:1}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:4}}>
                <Text style={$.loyH}>AutoSPF+ Rewards</Text>
                {isGold && (
                  <View style={$.loyGoldBadge}>
                    <Text style={$.loyGoldTxt}>GOLD  🏆</Text>
                  </View>
                )}
              </View>
              <Text style={$.loySub}>
                {isGold
                  ? `You've completed ${completed} services! Enjoy Gold perks.`
                  : `${completed} of 5 services — ${5 - completed} more to Gold status`}
              </Text>

              {/* Animated progress bar */}
              <View style={$.loyBar}>
                <Animated.View style={[$.loyFill, fillWidth]}>
                  <LinearGradient colors={[D.GoL, D.Go]} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill} />
                </Animated.View>
                {/* Milestone dots */}
                {[1,2,3,4,5].map(n => (
                  <View key={n} style={[$.loyMileDot, {left:`${(n/5)*100}%` as any, backgroundColor: completed>=n ? D.GoL : D.w16}]} />
                ))}
              </View>
              <View style={{flexDirection:'row',justifyContent:'space-between',marginTop:4}}>
                <Text style={$.loyMileLbl}>Starter</Text>
                <Text style={[$.loyMileLbl,isGold&&{color:D.Go}]}>Gold  ✦</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={14} color={D.w24} style={{marginLeft:12}} />
          </View>
        </GBCard>
      </Tap>
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
  const scrollY = useSharedValue(0);
  const { unreadCount } = useNotifications();

  const { data: bookings = [], refetch: refetchBookings, isRefetching, isLoading } = useQuery({
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

  const active = bookings
    .filter((b: BookingRecord) => isBookingCountedAsActiveOnHome(b.status))
    .sort(
      (a: BookingRecord, b: BookingRecord) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  const trackerScope = bookings.filter((b: BookingRecord) => bookingShowsCustomerLiveTracker(b));
  const job = pickCustomerLiveTrackerBooking(trackerScope) ?? active[0] ?? null;
  const completed = bookings.filter((b: any) => ['completed','released','paid'].includes(b.status));
  const history = completed.slice(0, 5);
  const totalSpend = history.reduce((s: number, b: any) => s + (b.totalPrice || 0), 0);
  const d7 = new Date(); d7.setDate(d7.getDate()-7);
  const freshJob = completed.find((b: any) =>
    new Date((b.completedAt||b.updatedAt||new Date()) as string).getTime() > d7.getTime()
  ) || null;

  const heroStep = job ? resolveCustomerHomeRailStep(job) : 0;

  const name = getFirstName(profile?.full_name);

  const onScroll = useAnimatedScrollHandler({ onScroll: e => { scrollY.value = e.contentOffset.y; } });
  const barAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60, 100], [0, 0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={$.screen}>
      <Orbs />

      {/* Frosted scroll app-bar reveals on scroll */}
      <Animated.View style={[$.appBar, { height:insets.top + 62 }, barAnim]} pointerEvents="none">
        <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(5,5,8,0.97)','rgba(5,5,8,0.45)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.ScrollView
        style={$.scroll}
        contentContainerStyle={[
          $.body,
          {
            paddingTop:insets.top + 14,
            paddingBottom:86 + insets.bottom,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={isRefetching || servicesQuery.isRefetching || vehiclesQuery.isRefetching} onRefresh={refreshHome} tintColor={D.A} />}
      >
        {/* 1. HEADER */}
        <HeaderSection
          profile={profile} name={name} scrollY={scrollY}
          active={active} completed={completed.length} router={router}
          unreadCount={unreadCount}
        />

        {/* 2. HERO (parallax + parallax scroll) */}
        <View style={$.sect}>
          <HeroSection
            job={job} isLoading={isLoading}
            step={heroStep} router={router}
          />
        </View>

        {/* 3. STATS (only when data exists) */}
        {bookings.length > 0 && (
          <View style={$.sectCompact}>
            <StatsSection active={active.length} completed={completed.length} total={bookings.length} />
          </View>
        )}

        {/* 4. TRUST BADGES */}
        <View style={$.sectSpacious}>
          <TrustSection />
        </View>

        {/* 5. QUICK ACTIONS */}
        <View style={$.sect}>
          <QuickSection router={router} completed={completed.length} />
        </View>

        {/* 6. SERVICES */}
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

        {/* 7. CURRENT PROMO */}
        <View style={$.sect}>
          <PromoSection router={router} />
        </View>

        {/* 8. RECENT HISTORY */}
        <View style={$.sect}>
          <HistorySection history={history} isLoading={isLoading} totalSpend={totalSpend} router={router} />
        </View>

        {/* 9. AFTER-CARE (conditional) */}
        {freshJob && (
          <View style={$.sect}>
            <CareSection freshJob={freshJob} />
          </View>
        )}

        {/* 10. LOYALTY (when has bookings) */}
        {bookings.length > 0 && (
          <View style={$.sect}>
            <LoyaltySection completed={completed.length} router={router} />
          </View>
        )}

        {/* FIRST-VISIT brand CTA */}
        {!job && bookings.length === 0 && !isLoading && (
          <Animated.View entering={FadeInUp.delay(640).duration(200)} style={[$.sect,{marginBottom:20}]}>
            <Tap onPress={() => router.push('/(customer)/book')}>
              <GBCard colors={GB.amber} radius={22} style={sh(D.A,0.10,10,3)}>
                <LinearGradient colors={['rgba(255,124,30,0.08)','transparent']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} />
                <View style={$.brandRow}>
                  <View style={$.brandIconBg}>
                    <Ionicons name="sparkles" size={18} color={D.Go} />
                  </View>
                  <View style={{flex:1}}>
                    <Text style={$.brandH}>Your vehicle deserves the best.</Text>
                    <Text style={$.brandSub}>Join 200+ satisfied AutoSPF+ customers today.</Text>
                  </View>
                  <View style={$.brandArr}>
                    <Ionicons name="arrow-forward" size={14} color={D.A} />
                  </View>
                </View>
              </GBCard>
            </Tap>
          </Animated.View>
        )}
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
  body:    { paddingHorizontal:20 },
  sect:    { marginBottom:24 },
  sectCompact:{ marginBottom:20 },
  sectSpacious:{ marginBottom:32 },
  orb:     { position:'absolute', borderRadius:999 },
  appBar:  { position:'absolute', top:0, left:0, right:0, zIndex:10, overflow:'hidden' },

  // ── HEADER ────────────────────────────────────────────────────
  hdr:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:36 },
  hdrCopy:  { flex:1, minWidth:0, paddingTop:1 },
  greet:    { fontSize:12, color:D.w38, fontWeight:'600', letterSpacing:0.2, marginBottom:5 },
  nameText: { fontSize:W <= 375 ? 34 : 38, fontWeight:'800', color:D.w100, letterSpacing:-1.1, lineHeight:W <= 375 ? 38 : 42 },
  summPill: {
    flexDirection:'row', alignItems:'center', gap:7, alignSelf:'flex-start',
    backgroundColor:'rgba(255,255,255,0.045)', borderRadius:20, paddingHorizontal:10, paddingVertical:5,
    borderWidth:1, borderColor:D.w07, marginTop:14,
  },
  summTxt:  { fontSize:10, color:D.w55, fontWeight:'600' },
  hdrActions:{ flexDirection:'row', alignItems:'center', gap:10, marginTop:2, flexShrink:0 },
  bellBtn:{
    width:44, height:44, borderRadius:15, backgroundColor:'rgba(255,255,255,0.045)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.08)', alignItems:'center', justifyContent:'center',
    ...sh('#000',0.14,7,2),
  },
  notifBubble:{
    position:'absolute', top:6, right:6, minWidth:16, height:16, borderRadius:8,
    backgroundColor:D.A, borderWidth:1.5, borderColor:D.bg,
    alignItems:'center', justifyContent:'center', paddingHorizontal:3,
  },
  notifTxt: { color:'#fff', fontSize:8, fontWeight:'900' },
  avRing:   { width:44, height:44, borderRadius:15, padding:1.2, ...sh(D.A,0.18,10,3) },
  avCore:   { flex:1, borderRadius:13.8, backgroundColor:D.s1, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  avChar:   { color:D.w100, fontWeight:'800', fontSize:15 },

  // ── TRACKER CARD ──────────────────────────────────────────────
  trGlow: { position:'absolute', top:-90, right:-90, width:220, height:220, borderRadius:110, backgroundColor:'rgba(255,124,30,0.055)' },
  trBody: { padding:22 },
  trRow1: { flexDirection:'row', alignItems:'center', marginBottom:20 },
  livePill:{
    flexDirection:'row', alignItems:'center', gap:8,
    backgroundColor:'rgba(255,124,30,0.085)', paddingHorizontal:11, paddingVertical:7, borderRadius:22,
    borderWidth:1, borderColor:'rgba(255,124,30,0.16)', flexShrink:1,
  },
  liveTxt:   { color:D.A, fontSize:9, fontWeight:'900', letterSpacing:1.4, flexShrink:1 },
  plateBadge:{ flexDirection:'row', alignItems:'center', gap:5, backgroundColor:'rgba(255,255,255,0.028)', paddingHorizontal:9, paddingVertical:5, borderRadius:10, borderWidth:1, borderColor:'rgba(255,255,255,0.055)', flexShrink:0 },
  plateNum:  { color:D.w55, fontSize:10, fontWeight:'700', letterSpacing:1.4 },
  trVeh:     { fontSize:29, fontWeight:'800', color:D.w100, letterSpacing:-0.7, marginBottom:10 },
  trMetaRow: { flexDirection:'row', alignItems:'center', gap:10 },
  trSvcRow:  { flex:1, minWidth:0, flexDirection:'row', alignItems:'center', gap:7 },
  trSvc:     { fontSize:12, color:D.w55, fontWeight:'600', flex:1 },
  trFooter:  { flexDirection:'row', alignItems:'center', gap:12, paddingTop:15, borderTopWidth:1, borderTopColor:D.w07 },
  trContext: { flex:1, minWidth:0, flexDirection:'row', alignItems:'center', gap:7 },
  trContextText:{ flex:1, fontSize:10.5, lineHeight:15, color:D.w55, fontWeight:'600' },
  trViewBtn: {
    marginLeft:'auto', flexDirection:'row', alignItems:'center', gap:7,
    minHeight:38, paddingHorizontal:14, paddingVertical:8, borderRadius:12,
    backgroundColor:D.A, ...sh(D.A,0.15,8,3),
  },
  trViewTxt: { color:D.bg, fontSize:11, fontWeight:'800', letterSpacing:0.2 },

  // ── HERO BOOK CTA ─────────────────────────────────────────────
  heroCard:  { borderRadius:30, overflow:'hidden', minHeight:246, ...sh('#B33A12',0.34,28,10) },
  hC:        { position:'absolute', borderRadius:999, backgroundColor:'#fff' },
  heroLine:  { position:'absolute', top:'38%', left:0, right:0, height:1.5 },
  heroBody:  { padding:26, flex:1, minHeight:246, justifyContent:'space-between' },
  heroTopRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' },
  heroBrand: { fontSize:9, color:'rgba(255,255,255,0.50)', fontWeight:'800', letterSpacing:2.5, marginBottom:4 },
  heroEye:   { fontSize:10, color:'rgba(255,255,255,0.44)', fontWeight:'600', letterSpacing:1.6 },
  heroH1:    { fontSize:33, fontWeight:'900', color:'#fff', lineHeight:38, letterSpacing:-0.9, marginBottom:9 },
  heroSub:   { fontSize:12, color:'rgba(255,255,255,0.46)', fontWeight:'500', letterSpacing:0.5 },
  heroBot:   { gap:10 },
  heroCTA:{
    flexDirection:'row', alignItems:'center', backgroundColor:'rgba(255,255,255,0.94)',
    borderRadius:17, alignSelf:'flex-start', paddingVertical:1, paddingLeft:18,
    borderWidth:1, borderColor:'rgba(255,255,255,0.42)',
    ...sh('#000',0.16,7,3),
  },
  heroCTATxt:  { fontSize:14, fontWeight:'800', color:'#81270A', paddingRight:5 },
  heroCTAdge:  { width:34, height:34, margin:4, borderRadius:13, backgroundColor:'rgba(129,39,10,0.10)', alignItems:'center', justifyContent:'center' },
  heroMeta:    { flexDirection:'row', gap:12 },
  heroMetaChip:{ flexDirection:'row', alignItems:'center', gap:4 },
  heroMetaTxt: { fontSize:11, color:'rgba(255,255,255,0.40)', fontWeight:'500' },

  // ── STATS ────────────────────────────────────────────────────
  statsRow:   { flexDirection:'row', paddingVertical:17, paddingHorizontal:4 },
  statDiv:    { width:StyleSheet.hairlineWidth, height:44, backgroundColor:'rgba(255,255,255,0.055)', alignSelf:'center' },
  statCell:   { flex:1, alignItems:'center', justifyContent:'center', gap:6, paddingHorizontal:6 },
  statMeta:   { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5 },
  statN:      { fontSize:29, lineHeight:31, fontWeight:'800', letterSpacing:-0.5 },
  statLbl:    { fontSize:8.5, color:D.w38, fontWeight:'700', letterSpacing:0.65, textTransform:'uppercase' },

  // ── TRUST ────────────────────────────────────────────────────
  trustGrid:{ flexDirection:'row', flexWrap:'wrap', gap:8 },
  trustChipWrap:{ width:'48%' },
  trustChip:{
    flexDirection:'row', alignItems:'center', gap:6,
    backgroundColor:'rgba(255,124,30,0.055)', borderWidth:1, borderColor:'rgba(255,124,30,0.12)',
    height:42, paddingHorizontal:11, borderRadius:13,
  },
  trustTxt:{ fontSize:10, color:D.w55, fontWeight:'700', flexShrink:1 },

  // ── EYEBROW ──────────────────────────────────────────────────
  eyeRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  eyeL:   { flexDirection:'row', alignItems:'center', gap:8 },
  eyeDash:{ width:3, height:14, borderRadius:2, backgroundColor:D.A },
  eyeLabel:{ fontSize:10, color:D.w55, fontWeight:'800', letterSpacing:3.4, textTransform:'uppercase' },
  eyeCta: { fontSize:12, color:D.A, fontWeight:'700', letterSpacing:0.2 },

  // ── QUICK ACTIONS ────────────────────────────────────────────
  qaGrid:       { flexDirection:'row', flexWrap:'wrap', gap:10 },
  qaGridItem:   { width:'48%', minHeight:132 },
  qaCardBody:   { flex:1, padding:16 },
  qaCardTop:    { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:18 },
  qaSubLbl:     { fontSize:10, color:D.w38, fontWeight:'500', marginTop:5 },
  qaSmIcon:     { width:38, height:38, borderRadius:13, backgroundColor:D.w04, borderWidth:1, borderColor:D.w07, alignItems:'center', justifyContent:'center' },
  qaSmIconPrimary:{ backgroundColor:D.Af, borderColor:D.Ab },
  qaSmName:     { fontSize:14, fontWeight:'700', color:D.w92, letterSpacing:-0.2 },
  qaWideBody:   { flexDirection:'row', alignItems:'center', padding:14 },
  qaBadge:      { minWidth:26, height:26, paddingHorizontal:7, borderRadius:9, backgroundColor:D.Gf, borderWidth:1, borderColor:D.Gb, alignItems:'center', justifyContent:'center' },
  qaBadgeTxt:   { color:D.G, fontSize:11, fontWeight:'800' },

  // ── SERVICES ─────────────────────────────────────────────────
  svcWrap:  { width:SERVICE_CARD_WIDTH, marginLeft:11, borderRadius:26, overflow:'hidden', ...sh('#000',0.46,18,8) },
  svcCard:  { height:240, padding:18, justifyContent:'flex-end' },
  svcCardNarrow:{ height:252 },
  svcLoadingRow:{ flexDirection:'row', gap:11 },
  svcStateCard:{ minHeight:112, borderRadius:20, borderWidth:1, borderColor:D.w07, backgroundColor:D.w04, padding:18, flexDirection:'row', alignItems:'center', gap:12 },
  svcStateText:{ flex:1, color:D.w55, fontSize:12, fontWeight:'600', lineHeight:18 },
  svcRetry:{ color:D.A, fontSize:12, fontWeight:'800' },
  svcOrb:   { position:'absolute', top:-55, right:-55, width:150, height:150, borderRadius:75, backgroundColor:'rgba(255,255,255,0.10)' },
  svcBadge: { alignSelf:'flex-start', color:'rgba(255,255,255,0.82)', fontSize:8, fontWeight:'900', letterSpacing:1.2, marginBottom:7 },
  svcName:  { fontSize:18, fontWeight:'800', color:'#fff', lineHeight:22, marginBottom:4, letterSpacing:-0.4 },
  svcTag:   { fontSize:10, color:'rgba(255,255,255,0.56)', fontWeight:'600', letterSpacing:0.3, marginBottom:12 },
  svcFoot:  { flexDirection:'row', alignItems:'center', width:'100%', gap:6 },
  svcFootNarrow:{ flexDirection:'column', alignItems:'stretch' },
  svcPrBadge:{ flex:1, minWidth:0, backgroundColor:'rgba(0,0,0,0.22)', paddingHorizontal:7, paddingVertical:4, borderRadius:10 },
  svcPrBadgeNarrow:{ flex:0, alignSelf:'stretch' },
  svcPr:    { fontSize:11, color:'rgba(255,255,255,0.80)', fontWeight:'700' },
  svcBookPill:{ flexShrink:0, minHeight:30, backgroundColor:'rgba(255,255,255,0.22)', borderWidth:1, borderColor:'rgba(255,255,255,0.15)', paddingHorizontal:10, paddingVertical:6, borderRadius:12, alignItems:'center', justifyContent:'center' },
  svcBookPillNarrow:{ alignSelf:'stretch' },
  svcBookTxt: { fontSize:10, fontWeight:'800', color:'#fff', letterSpacing:0.6 },

  // ── PROMO ────────────────────────────────────────────────────
  promoBody:   { flexDirection:'row', alignItems:'center', padding:20, gap:16 },
  promoLeft:   { flex:1, gap:6 },
  promoBadge:  { flexDirection:'row', alignItems:'center', gap:5, backgroundColor:D.Go, paddingHorizontal:9, paddingVertical:4, borderRadius:9, alignSelf:'flex-start' },
  promoBadgeTxt:{ fontSize:9, color:D.bg, fontWeight:'900', letterSpacing:1.5 },
  promoTitle:  { fontSize:17, fontWeight:'800', color:D.w92, letterSpacing:-0.3 },
  promoSub:    { fontSize:12, color:D.w55, fontWeight:'500' },
  promoSaveRow:{ flexDirection:'row', alignItems:'center', gap:5 },
  promoSaveTxt:{ fontSize:11, color:D.AL, fontWeight:'700' },
  promoRight:  { alignItems:'center', gap:12 },
  promoIconBg: { width:52, height:52, borderRadius:18, backgroundColor:D.Gof, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:D.Gob },
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
  emptyInner:   { alignItems:'center', padding:40, paddingTop:44 },
  emptyIconOuter:{ marginBottom:22 },
  emptyIconBg:  { width:84, height:84, borderRadius:28, alignItems:'center', justifyContent:'center', ...sh(D.A,0.25,14,5) },
  emptyH:       { color:D.w75, fontSize:17, fontWeight:'700', marginBottom:8 },
  emptySub:     { color:D.w38, fontSize:13, fontWeight:'500', textAlign:'center', lineHeight:20, marginBottom:28 },
  emptyBtn:     { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:26, paddingVertical:14, borderRadius:19, ...sh(D.A,0.46,18,7) },
  emptyBtnTxt:  { color:'#fff', fontSize:14, fontWeight:'800', letterSpacing:0.2 },

  // ── AFTER-CARE ────────────────────────────────────────────────
  careBar:      { height:2.5 },
  careHead:     { flexDirection:'row', alignItems:'center', gap:12, padding:18, paddingBottom:14 },
  careIconBg:   { width:42, height:42, borderRadius:14, backgroundColor:D.Gof, alignItems:'center', justifyContent:'center' },
  careEye:      { fontSize:9, color:D.Go, fontWeight:'800', letterSpacing:2.8, marginBottom:3 },
  careSvc:      { fontSize:14, fontWeight:'700', color:D.w92 },
  careLiveBadge:{ flexDirection:'row', alignItems:'center', gap:5, backgroundColor:D.Gof, paddingHorizontal:10, paddingVertical:5, borderRadius:10, borderWidth:1, borderColor:D.Gob },
  careLiveTxt:  { fontSize:10, color:D.Go, fontWeight:'700' },
  tipScroll:    { paddingHorizontal:16, paddingBottom:20, gap:10 },
  tipCard:      { width:200, borderRadius:18, padding:16, backgroundColor:D.s2, borderWidth:1, borderColor:D.w07, gap:9 },
  tipIconBg:    { width:34, height:34, borderRadius:11, backgroundColor:D.Gof, alignItems:'center', justifyContent:'center' },
  tipTagPill:   { backgroundColor:D.Gof, paddingHorizontal:8, paddingVertical:3, borderRadius:7, alignSelf:'flex-start' },
  tipTagTxt:    { fontSize:9, color:D.Go, fontWeight:'800', letterSpacing:0.5 },
  tipBody:      { fontSize:12, color:D.w55, lineHeight:18, fontWeight:'500' },

  // ── LOYALTY ───────────────────────────────────────────────────
  loyRow:     { flexDirection:'row', alignItems:'center', padding:18, gap:14 },
  loyIconBg:  { width:46, height:46, borderRadius:16, alignItems:'center', justifyContent:'center', flexShrink:0, ...sh(D.Go,0.30,10,3) },
  loyH:       { fontSize:15, fontWeight:'700', color:D.w92 },
  loyGoldBadge:{ backgroundColor:D.Gof, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:D.Gob },
  loyGoldTxt: { fontSize:9, color:D.Go, fontWeight:'800', letterSpacing:0.5 },
  loySub:     { fontSize:11, color:D.w55, fontWeight:'500', marginBottom:10 },
  loyBar:     { height:5, backgroundColor:D.w07, borderRadius:3, overflow:'visible', marginBottom:6, position:'relative' },
  loyFill:    { height:'100%', borderRadius:3 },
  loyMileDot: { position:'absolute', top:-2, width:9, height:9, borderRadius:5, marginLeft:-4.5 },
  loyMileLbl: { fontSize:9, color:D.w38, fontWeight:'700' },

  // ── BRAND CTA ─────────────────────────────────────────────────
  brandRow:   { flexDirection:'row', alignItems:'center', gap:14, padding:18 },
  brandIconBg:{ width:44, height:44, borderRadius:15, backgroundColor:D.Gof, alignItems:'center', justifyContent:'center', flexShrink:0 },
  brandH:     { fontSize:14, fontWeight:'700', color:D.w92, marginBottom:4 },
  brandSub:   { fontSize:12, color:D.w38, fontWeight:'500', lineHeight:18 },
  brandArr:   { width:34, height:34, borderRadius:11, backgroundColor:D.Af, alignItems:'center', justifyContent:'center', flexShrink:0 },
});
