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

import React, { useCallback, useEffect, useRef } from 'react';
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
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeInRight, SlideInRight,
  useSharedValue, useAnimatedStyle, useAnimatedScrollHandler,
  useAnimatedProps, withRepeat, withTiming, withSequence,
withDelay, Easing, interpolate, Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/context/AuthContext';
import { bookingService } from '@/services/api/bookingService';
import { TabBarHeight } from '@/constants/theme';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VIEWPORT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const { width: W, height: H } = Dimensions.get('window');
const IOS = Platform.OS === 'ios';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DESIGN TOKENS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const D = {
  // Canvas — obsidian with warmth
  bg:  '#050508',
  s0:  '#080810',
  s1:  '#0C0C18',
  s2:  '#101022',
  s3:  '#141430',

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
type SI = { label: string; color: string; fill: string; icon: string; step: number };
const STATUS: Record<string, SI> = {
  pending:       { label:'Booked',                 color:D.Y, fill:D.Yf, icon:'receipt-outline',           step:0 },
  confirmed:     { label:'Confirmed',              color:D.B, fill:D.Bf, icon:'checkmark-circle-outline',  step:1 },
  assigned:      { label:'Technician Assigned',    color:D.V, fill:D.Vf, icon:'person-outline',            step:2 },
  received:      { label:'Checked-In',             color:D.C, fill:D.Cf, icon:'car-outline',               step:3 },
  queued:        { label:'In Queue',               color:D.Y, fill:D.Yf, icon:'time-outline',              step:1 },
  'in-progress': { label:'In Service',             color:D.A, fill:D.Af, icon:'construct-outline',         step:4 },
  in_progress:   { label:'In Service',             color:D.A, fill:D.Af, icon:'construct-outline',         step:4 },
  completed:     { label:'Quality Check',          color:D.G, fill:D.Gf, icon:'shield-checkmark-outline',  step:5 },
  quality_check: { label:'Quality Check',          color:D.G, fill:D.Gf, icon:'shield-checkmark-outline',  step:5 },
  paid:          { label:'Payment Settled',        color:D.G, fill:D.Gf, icon:'card-outline',              step:6 },
  ready:         { label:'Ready for Pickup',       color:D.G, fill:D.Gf, icon:'checkmark-done-outline',    step:6 },
  released:      { label:'Released',               color:D.G, fill:D.Gf, icon:'car-sport-outline',         step:7 },
  cancelled:     { label:'Cancelled',              color:D.R, fill:D.Rf, icon:'close-circle-outline',      step:0 },
};

// Matches the 8-stage WORKFLOW_PIPELINE in track.tsx
const STEPS = ['Booked', 'Confirmed', 'Assigned', 'Checked-In', 'In Service', 'QC', 'Payment', 'Released'];

const SERVICES = [
  { icon:'color-filter'     as const, name:'Window\nTinting',   tag:'UV  ·  Heat  ·  Privacy',  price:'₱2,500+', g:['#C44A08','#FF8030'] as const },
  { icon:'sparkles'         as const, name:'Premium\nDetail',   tag:'Interior  ·  Exterior',     price:'₱3,800+', g:['#1E50CC','#5490FF'] as const },
  { icon:'shield-checkmark' as const, name:'Paint\nProtection', tag:'PPF  ·  Ceramic Coat',      price:'₱12,000+',g:['#0A8860','#28CCB2'] as const },
  { icon:'water'            as const, name:'Nano\nCoating',     tag:'Hydrophobic Shield',         price:'₱6,500+', g:['#5A24C0','#9060FF'] as const },
];

const TRUST = [
  { icon:'shield-checkmark-outline' as const, label:'LTFRB Certified' },
  { icon:'ribbon-outline'           as const, label:'Licensed Shop'   },
  { icon:'checkmark-circle-outline' as const, label:'Insured Work'    },
  { icon:'star-outline'             as const, label:'4.9 ★ Rated'     },
  { icon:'people-outline'           as const, label:'200+ Customers'  },
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

const greet = () => {
  const h = new Date().getHours();
  if (h < 5)  return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

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
  { w:380, h:380, top:-140, right:-100, color:D.Ag, d:13000 },
  { w:300, h:300, top:400,  left:-110, color:'rgba(207,168,64,0.13)', d:18000 },
  { w:260, h:260, top:740,  right:-90, color:'rgba(79,145,255,0.12)', d:22000 },
] as const;

function Orbs() {
  const vs = OrbConfig.map(() => useSharedValue(0));
  useEffect(() => {
    vs.forEach((v, i) => {
      v.value = withRepeat(withTiming(1, { duration: OrbConfig[i].d, easing: Easing.inOut(Easing.sin) }), -1, true);
    });
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {OrbConfig.map((o, i) => {
        const anim = useAnimatedStyle(() => ({
          opacity: interpolate(vs[i].value, [0,0.5,1],[0.12,0.28,0.12]),
          transform:[
            {translateX: interpolate(vs[i].value,[0,1],[0,i%2===0?42:-36])},
            {translateY: interpolate(vs[i].value,[0,1],[0,i%2===0?28:32])},
          ],
        }));
        return (
          <Animated.View key={i}
            style={[$.orb,{width:o.w,height:o.h,top:(o as any).top,right:(o as any).right,left:(o as any).left,backgroundColor:o.color},anim]}
          />
        );
      })}
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
      withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 1100, easing: Easing.in(Easing.cubic) }),
    ), -1, false);
  }, []);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(p.value, [0,1], [1,3.5]) }],
    opacity:   interpolate(p.value, [0,0.25,1], [0.8,0.15,0]),
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
        withTiming(-6, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming( 0, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      ), -1, false,
    );
  }, []);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Count-up number — spring entrance with bounce
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CountBounce({ n, color, delay = 0 }: { n: number; color: string; delay?: number }) {
  const sc = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    sc.value = withDelay(delay, withTiming(1, { duration: 220 }));
    op.value = withDelay(delay, withTiming(1, { duration: 300 }));
  }, [n]);
  const anim = useAnimatedStyle(() => ({
    transform: [{ scale: sc.value }],
    opacity: op.value,
  }));
  return (
    <Animated.Text style={[$.statN, { color }, anim]}>
      {n}
    </Animated.Text>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ATOM: Shimmer skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Shim({ w, h, r = 14 }: { w: number; h: number; r?: number }) {
  const x = useSharedValue(-1);
  useEffect(() => {
    x.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, false);
  }, []);
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
  children, onPress, style, h = 'Light', targetScale = 0.955,
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
// MOLECULE: 8-step progress rail (animated fill width)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Rail({ step }: { step: number }) {
  const pct = useSharedValue(0);
  useEffect(() => {
    const target = Math.min((step / (STEPS.length - 1)) * 100, 100);
    pct.value = withTiming(target, { duration: 900, easing: Easing.out(Easing.exp) });
  }, [step]);
  const fillAnim = useAnimatedStyle(() => ({ width: `${pct.value}%` as any }));

  return (
    <View style={rl.wrap}>
      <View style={rl.track}>
        <Animated.View style={[rl.fill, fillAnim]}>
          <LinearGradient colors={[D.A, D.G]} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill} />
        </Animated.View>
      </View>
      <View style={rl.row}>
        {STEPS.map((lbl, i) => {
          const done = i < step, active = i === step;
          return (
            <Animated.View key={lbl} entering={FadeInDown.delay(500 + i * 50).duration(200)} style={rl.col}>
              <View style={[rl.node, done && rl.nodeDone, active && rl.nodeActive]}>
                {done
                  ? <Ionicons name="checkmark-sharp" size={9} color="#fff" />
                  : active
                    ? <View style={rl.aDot} />
                    : <View style={rl.eDot} />}
              </View>
              <Text style={[rl.lbl, done && {color:D.G}, active && {color:D.w92,fontWeight:'700'}]} numberOfLines={1} adjustsFontSizeToFit>
                {lbl}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}
const rl = StyleSheet.create({
  wrap:      { width:'100%', paddingVertical:18 },
  track:     { position:'absolute', top:20, left:'6%', right:'6%', height:2, backgroundColor:D.w07, borderRadius:2, overflow:'hidden' },
  fill:      { height:'100%', borderRadius:2 },
  row:       { flexDirection:'row', justifyContent:'space-between' },
  col:       { alignItems:'center', width: `${100/8}%` as any },
  node:      {
    width:24, height:24, borderRadius:12,
    backgroundColor:D.s2, borderWidth:1.5, borderColor:D.w16,
    alignItems:'center', justifyContent:'center', marginBottom:5,
  },
  nodeDone:  {
    backgroundColor:D.G, borderColor:D.Gb,
    ...IOS?{shadowColor:D.G,shadowOpacity:0.55,shadowRadius:8,shadowOffset:{width:0,height:2}}:{elevation:4},
  },
  nodeActive:{
    backgroundColor:D.A, borderWidth:2, borderColor:D.Ab,
    ...IOS?{shadowColor:D.A,shadowOpacity:0.65,shadowRadius:10,shadowOffset:{width:0,height:2}}:{elevation:6},
  },
  aDot:{ width:8, height:8, borderRadius:4, backgroundColor:'#fff' },
  eDot:{ width:3, height:3, borderRadius:1.5, backgroundColor:D.w24 },
  lbl:{ fontSize:7, color:D.w38, fontWeight:'600', textAlign:'center', lineHeight:10 },
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Header — parallax collapse, name, status pill
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HeaderSection({
  profile, name, scrollY, active, completed, router,
}: any) {
  const hdrAnim = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [0,110], [0,-20], Extrapolation.CLAMP) },
      { scale:      interpolate(scrollY.value, [0,110], [1,0.92], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollY.value, [0,80], [1,0], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[$.hdr, hdrAnim]}>
      {/* Name block */}
      <View style={{ flex:1 }}>
        <Animated.Text entering={FadeIn.delay(60).duration(380)} style={$.greet}>
          {greet()}
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(130).duration(200)} style={$.nameText} numberOfLines={1} adjustsFontSizeToFit>
          {name}
        </Animated.Text>
        {(active.length > 0 || completed > 0) && (
          <Animated.View entering={FadeIn.delay(300).duration(400)} style={$.summPill}>
            <View style={{ width:5, height:5, borderRadius:3, backgroundColor: active.length > 0 ? D.A : D.G }} />
            <Text style={$.summTxt}>
              {active.length > 0 ? `${active.length} active` : 'All clear'} · {completed} done
            </Text>
          </Animated.View>
        )}
      </View>

      {/* Action cluster */}
      <View style={$.hdrActions}>
        <Tap onPress={() => router.push('/(screens)/appointments')} targetScale={0.92}>
          <View style={$.bellBtn}>
            <Ionicons name="notifications-outline" size={18} color={D.w55} />
            {active.length > 0 && (
              <View style={$.notifBubble}>
                <Text style={$.notifTxt}>{active.length > 9 ? '9+' : String(active.length)}</Text>
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
function HeroSection({ job, isLoading, st, stepFor, router, scrollY }: any) {
  // Hero parallax (card moves at 40% of scroll speed — depth illusion)
  const heroParallax = useAnimatedStyle(() => ({
    transform: [{
      translateY: interpolate(scrollY.value, [0, 300], [0, -55], Extrapolation.CLAMP),
    }],
  }));

  if (isLoading) return <Shim w={W-44} h={240} r={32} />;

  if (job) {
    return (
      <Animated.View style={heroParallax}>
        <Tap onPress={() => router.push({ pathname:'/(customer)/track', params:{ id:job.id } })} h="Light">
          <GBCard colors={GB.amber} radius={30} style={sh(D.A, 0.22, 32, 10)}>
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
                  <Pulse color={D.A} size={6} />
                  <Text style={$.liveTxt}>LIVE  TRACKING</Text>
                </View>
                <View style={$.plateBadge}>
                  <Ionicons name="car-outline" size={10} color={D.w38} />
                  <Text style={$.plateNum}>{String(job.vehiclePlate||'—').slice(0,9).toUpperCase()}</Text>
                </View>
              </View>

              <Animated.Text entering={FadeInDown.delay(300).duration(200)} style={$.trVeh} numberOfLines={1} adjustsFontSizeToFit>
                {String(job.vehicleMake||'')} {String(job.vehicleModel||'')}
              </Animated.Text>
              <Text style={$.trSvc}>{job.serviceName}</Text>

              <Rail step={stepFor()} />

              <View style={$.trFooter}>
                <View style={[$.stPill, {backgroundColor:st?.fill}]}>
                  <Ionicons name={st?.icon as any||'ellipse'} size={11} color={st?.color} />
                  <Text style={[$.stTxt, {color:st?.color}]}>{st?.label}</Text>
                </View>
                <View style={$.trViewBtn}>
                  <Text style={$.trViewTxt}>View Details</Text>
                  <Ionicons name="chevron-forward" size={11} color={D.w38} />
                </View>
              </View>
            </View>
          </GBCard>
        </Tap>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={heroParallax}>
      <Tap onPress={() => router.push('/(customer)/book')} h="Medium">
        <View style={$.heroCard}>
          <LinearGradient
            colors={['#FF8C28','#E25A08','#B83C00']}
            start={{x:0,y:0}} end={{x:1.1,y:1.1}}
            style={StyleSheet.absoluteFill}
          />
          {/* Specular diagonal shine */}
          <LinearGradient
            colors={['rgba(255,255,255,0.12)','rgba(255,255,255,0.05)','transparent']}
            start={{x:0,y:0}} end={{x:0.8,y:0.55}}
            style={StyleSheet.absoluteFill}
          />
          {/* Depth circles */}
          <View style={[$.hC, {width:220,height:220,top:-72,right:-72,opacity:0.11}]} />
          <View style={[$.hC, {width:150,height:150,top:48, right:-18,opacity:0.07}]} />
          <View style={[$.hC, {width:90, height:90, bottom:-28,left:66,  opacity:0.08}]} />
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
                  <Ionicons name="arrow-forward" size={13} color={D.AD} />
                </View>
              </View>
              <View style={$.heroMeta}>
                {[
                  {i:'time-outline'  as const, t:'2–4 hrs'},
                  {i:'star-outline'  as const, t:'4.9 ★'},
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
// SECTION: Stats — animated CountBounce numbers + mini bars
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function StatsSection({ active, completed, total }: { active:number; completed:number; total:number }) {
  const cells = [
    { n:active,    lbl:'Active',    col:D.A, fi:D.Af, ic:'flash-outline'          as const, delay:0   },
    { n:completed, lbl:'Completed', col:D.G, fi:D.Gf, ic:'checkmark-done-outline' as const, delay:80  },
    { n:total,     lbl:'Total Jobs',col:D.B, fi:D.Bf, ic:'layers-outline'         as const, delay:160 },
  ] as const;

  const barW = useSharedValue(0);
  useEffect(() => {
    barW.value = withDelay(400, withTiming(1, { duration: 800, easing: Easing.out(Easing.exp) }));
  }, [total]);

  return (
    <Animated.View entering={FadeInUp.delay(260).duration(200)}>
      <GBCard colors={GB.neutral} radius={26} style={sh('#000',0.30,14,4)}>
        <View style={$.statsRow}>
          {cells.map((s, i) => {
            const barAnim = useAnimatedStyle(() => ({
              width: `${barW.value * Math.round((s.n / Math.max(total, 1)) * 100)}%` as any,
            }));
            return (
              <React.Fragment key={s.lbl}>
                {i > 0 && <View style={$.statDiv} />}
                <View style={$.statCell}>
                  <Animated.View entering={FadeInDown.delay(280 + s.delay).duration(200)} style={[$.statIconBg, {backgroundColor:s.fi}]}>
                    <Ionicons name={s.ic} size={13} color={s.col} />
                  </Animated.View>
                  <CountBounce n={s.n} color={s.col} delay={300 + s.delay} />
                  <Text style={$.statLbl}>{s.lbl}</Text>
                  <View style={$.statBar}>
                    <Animated.View style={[$.statBarFill, {backgroundColor:s.col}, barAnim]} />
                  </View>
                </View>
              </React.Fragment>
            );
          })}
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={$.trustScroll}>
        {TRUST.map((t, i) => (
          <Animated.View key={t.label} entering={SlideInRight.delay(300 + i * 50).duration(200)}>
            <View style={$.trustChip}>
              <Ionicons name={t.icon} size={12} color={D.Go} />
              <Text style={$.trustTxt}>{t.label}</Text>
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SECTION: Quick actions — asymmetric bento
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function QuickSection({ router, completed }: any) {
  const compact = [
    { icon:'navigate-outline' as const, n:'Track My Car',  sub:'Live job status',   col:D.B, fi:D.Bf, gb:GB.blue,   r:'/(customer)/track' },
    { icon:'scan-outline'     as const, n:'AI Scan',       sub:'Instant diagnosis', col:D.V, fi:D.Vf, gb:GB.violet, r:'/(customer)/scan'  },
  ] as const;

  return (
    <Animated.View entering={FadeInUp.delay(320).duration(200)}>
      <Eye label="Quick Access" />
      <View style={$.qaRow}>
        {/* TALL — Book Now */}
        <Animated.View entering={FadeInDown.delay(355).duration(200)} style={$.qaLeft}>
          <Tap onPress={() => router.push('/(customer)/book')} h="Medium" style={{flex:1}}>
            <GBCard colors={GB.amber} radius={26} bg={D.s1} style={{flex:1,...sh(D.A,0.24,16,6)}}>
              <LinearGradient
                colors={[D.Af,'transparent']}
                start={{x:0,y:0}} end={{x:1,y:1}}
                style={StyleSheet.absoluteFill}
              />
              <Spec op={0.03} />
              <View style={[$.qaRail,{backgroundColor:D.A}]} />
              <View style={$.qaTallBody}>
                <Animated.View entering={FadeIn.delay(390).duration(400)} style={[$.qaIconBig,{backgroundColor:D.Af}]}>
                  <Ionicons name="calendar-outline" size={24} color={D.A} />
                </Animated.View>
                <View style={{flex:1}} />
                <Text style={$.qaTallName}>New{'\n'}Booking</Text>
                <Text style={$.qaSubLbl}>Schedule a service</Text>
                <View style={$.qaChev}>
                  <Ionicons name="arrow-forward" size={13} color={D.A} />
                </View>
              </View>
            </GBCard>
          </Tap>
        </Animated.View>

        {/* RIGHT stack */}
        <View style={$.qaRight}>
          {compact.map((a, i) => (
            <Animated.View key={a.n} entering={FadeInRight.delay(370+i*65).duration(200)} style={{flex:1}}>
              <Tap onPress={() => router.push(a.r as any)} style={{flex:1}}>
                <GBCard colors={a.gb} radius={22} bg={D.s1} style={{flex:1,...sh('#000',0.18,10,3)}}>
                  <LinearGradient colors={[a.fi,'transparent']} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} />
                  <Spec op={0.03} />
                  <View style={[$.qaRail,{backgroundColor:a.col}]} />
                  <View style={$.qaSmBody}>
                    <View style={[$.qaSmIcon,{backgroundColor:a.fi}]}>
                      <Ionicons name={a.icon} size={18} color={a.col} />
                    </View>
                    <View style={{flex:1,marginLeft:12}}>
                      <Text style={$.qaSmName}>{a.n}</Text>
                      <Text style={$.qaSubLbl}>{a.sub}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={11} color={D.w24} />
                  </View>
                </GBCard>
              </Tap>
            </Animated.View>
          ))}
        </View>
      </View>

      {/* Full-width: My Records */}
      <Animated.View entering={FadeInUp.delay(445).duration(200)} style={{marginTop:10}}>
        <Tap onPress={() => router.push('/(screens)/appointments')}>
          <GBCard colors={GB.green} radius={22} bg={D.s1} style={sh('#000',0.16,10,3)}>
            <LinearGradient colors={[D.Gf,'transparent']} start={{x:0,y:0}} end={{x:1,y:0}} style={StyleSheet.absoluteFill} />
            <View style={[$.qaRail,{backgroundColor:D.G}]} />
            <View style={$.qaWideBody}>
              <View style={[$.qaSmIcon,{backgroundColor:D.Gf}]}>
                <Ionicons name="receipt-outline" size={18} color={D.G} />
              </View>
              <View style={{flex:1,marginLeft:14}}>
                <Text style={$.qaSmName}>My Service Records</Text>
                <Text style={$.qaSubLbl}>Full history · receipts · re-booking</Text>
              </View>
              {completed > 0 && (
                <View style={[$.qaBadge,{backgroundColor:D.Gf}]}>
                  <Text style={[$.qaBadgeTxt,{color:D.G}]}>{completed}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={13} color={D.w24} style={{marginLeft:8}} />
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
function ServicesSection({ router }: any) {
  return (
    <Animated.View entering={FadeInUp.delay(400).duration(200)}>
      <Eye label="Our Services" cta="View All" onCta={() => router.push('/(customer)/book')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingRight:22}}>
        {SERVICES.map((svc, i) => (
          <Animated.View key={svc.name} entering={SlideInRight.delay(420+i*65).duration(200)}>
            <Tap
              onPress={() => router.push('/(customer)/book')}
              style={[$.svcWrap, i===0&&{marginLeft:0}]}
            >
              <LinearGradient colors={svc.g} start={{x:0,y:0}} end={{x:1,y:1}} style={$.svcCard}>
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
                    <Ionicons name={svc.icon} size={19} color="rgba(255,255,255,0.96)" />
                  </View>
                </GBCard>

                <View style={{flex:1}} />
                <Text style={$.svcName}>{svc.name}</Text>
                <Text style={$.svcTag}>{svc.tag}</Text>
                <View style={$.svcFoot}>
                  <View style={$.svcPrBadge}>
                    <Text style={$.svcPr}>{svc.price}</Text>
                  </View>
                  <View style={$.svcBookPill}>
                    <Text style={$.svcBookTxt}>Book  →</Text>
                  </View>
                </View>
              </LinearGradient>
            </Tap>
          </Animated.View>
        ))}
      </ScrollView>
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
  }, []);
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
  }, [completed]);
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
  const scrollY = useSharedValue(0);

  const { data: bookings = [], refetch, isRefetching, isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => bookingService.getMyBookings(),
    enabled: !!profile?.id,
  });

  const active = bookings
    .filter((b: any) => !['completed','released','cancelled','failed'].includes(b.status))
    .sort((a: any, b: any) => new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime());
  const job = active[0] || null;
  const completed = bookings.filter((b: any) => ['completed','released','paid'].includes(b.status));
  const history = completed.slice(0, 5);
  const totalSpend = history.reduce((s: number, b: any) => s + (b.totalPrice || 0), 0);
  const d7 = new Date(); d7.setDate(d7.getDate()-7);
  const freshJob = completed.find((b: any) =>
    new Date((b.completedAt||b.updatedAt||new Date()) as string).getTime() > d7.getTime()
  ) || null;

  const st: SI | null = job ? STATUS[job.status] || {
    label: String(job.status||'').replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()),
    color:D.w55, fill:D.w04, icon:'ellipse-outline', step:0,
  } : null;

  const stepFor = useCallback((): number => {
    if (!job) return 0;
    const si = STATUS[job.status];
    return si?.step ?? 0;
  }, [job]);

  const fn = profile?.full_name?.split(' ')[0] || 'Friend';
  const name = fn.charAt(0).toUpperCase() + fn.slice(1).toLowerCase();

  const onScroll = useAnimatedScrollHandler({ onScroll: e => { scrollY.value = e.contentOffset.y; } });
  const barAnim = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 60, 100], [0, 0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={$.screen}>
      <Orbs />

      {/* Frosted scroll app-bar reveals on scroll */}
      <Animated.View style={[$.appBar, barAnim]} pointerEvents="none">
        <BlurView intensity={65} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(5,5,8,0.97)','rgba(5,5,8,0.45)']} style={StyleSheet.absoluteFill} />
      </Animated.View>

      <Animated.ScrollView
        style={$.scroll}
        contentContainerStyle={[$.body, { paddingBottom: TabBarHeight + 190 }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={D.A} />}
      >
        {/* 1. HEADER */}
        <HeaderSection
          profile={profile} name={name} scrollY={scrollY}
          active={active} completed={completed.length} router={router}
        />

        {/* 2. HERO (parallax + parallax scroll) */}
        <View style={$.sect}>
          <HeroSection
            job={job} isLoading={isLoading} st={st}
            stepFor={stepFor} router={router} scrollY={scrollY}
          />
        </View>

        {/* 3. STATS (only when data exists) */}
        {bookings.length > 0 && (
          <View style={[$.sect,{marginTop:-4}]}>
            <StatsSection active={active.length} completed={completed.length} total={bookings.length} />
          </View>
        )}

        {/* 4. TRUST BADGES */}
        <View style={[$.sect,{marginTop:-8}]}>
          <TrustSection />
        </View>

        {/* 5. QUICK ACTIONS */}
        <View style={$.sect}>
          <QuickSection router={router} completed={completed.length} />
        </View>

        {/* 6. SERVICES */}
        <View style={$.sect}>
          <ServicesSection router={router} />
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
  body:    { paddingHorizontal:22, paddingTop: IOS ? 68 : 52 },
  sect:    { marginBottom:28 },
  orb:     { position:'absolute', borderRadius:999 },
  appBar:  { position:'absolute', top:0, left:0, right:0, height: IOS?108:80, zIndex:10, overflow:'hidden' },

  // ── HEADER ────────────────────────────────────────────────────
  hdr:      { flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', marginBottom:30 },
  greet:    { fontSize:13, color:D.w38, fontWeight:'500', marginBottom:5 },
  nameText: { fontSize:48, fontWeight:'900', color:D.w100, letterSpacing:-2.2, lineHeight:52 },
  summPill: {
    flexDirection:'row', alignItems:'center', gap:7, alignSelf:'flex-start',
    backgroundColor:D.w07, borderRadius:20, paddingHorizontal:11, paddingVertical:5,
    borderWidth:1, borderColor:D.w10, marginTop:10,
  },
  summTxt:  { fontSize:11, color:D.w55, fontWeight:'600' },
  hdrActions:{ flexDirection:'row', alignItems:'center', gap:10, marginTop:6 },
  bellBtn:{
    width:44, height:44, borderRadius:15, backgroundColor:D.w07,
    borderWidth:1, borderColor:D.w10, alignItems:'center', justifyContent:'center',
    ...sh('#000',0.18,8,2),
  },
  notifBubble:{
    position:'absolute', top:7, right:7, minWidth:17, height:17, borderRadius:9,
    backgroundColor:D.A, borderWidth:1.5, borderColor:D.bg,
    alignItems:'center', justifyContent:'center', paddingHorizontal:3,
  },
  notifTxt: { color:'#fff', fontSize:8, fontWeight:'900' },
  avRing:   { width:50, height:50, borderRadius:25, padding:2.5, ...sh(D.A,0.45,16,5) },
  avCore:   { flex:1, borderRadius:22.5, backgroundColor:D.s0, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  avChar:   { color:D.w100, fontWeight:'800', fontSize:17 },

  // ── TRACKER CARD ──────────────────────────────────────────────
  trGlow: { position:'absolute', top:-70, right:-70, width:200, height:200, borderRadius:100, backgroundColor:'rgba(255,124,30,0.08)' },
  trBody: { padding:24 },
  trRow1: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:22 },
  livePill:{
    flexDirection:'row', alignItems:'center', gap:8,
    backgroundColor:'rgba(255,124,30,0.10)', paddingHorizontal:13, paddingVertical:7, borderRadius:22,
    borderWidth:1, borderColor:'rgba(255,124,30,0.14)',
  },
  liveTxt:   { color:D.A, fontSize:10, fontWeight:'900', letterSpacing:2.8 },
  plateBadge:{ flexDirection:'row', alignItems:'center', gap:5, backgroundColor:D.w07, paddingHorizontal:11, paddingVertical:5, borderRadius:11, borderWidth:1, borderColor:D.w10 },
  plateNum:  { color:D.w55, fontSize:11, fontWeight:'700', letterSpacing:2.2 },
  trVeh:     { fontSize:32, fontWeight:'900', color:D.w100, letterSpacing:-0.8, marginBottom:5 },
  trSvc:     { fontSize:13, color:D.w38, fontWeight:'600' },
  trFooter:  { flexDirection:'row', alignItems:'center', paddingTop:14, borderTopWidth:1, borderTopColor:D.w07 },
  stPill:    { flexDirection:'row', alignItems:'center', gap:6, paddingHorizontal:11, paddingVertical:5, borderRadius:18 },
  stTxt:     { fontSize:11, fontWeight:'700' },
  trViewBtn: {
    marginLeft:'auto', flexDirection:'row', alignItems:'center', gap:4,
    paddingHorizontal:14, paddingVertical:7, borderRadius:12,
    backgroundColor:D.w07, borderWidth:1, borderColor:D.w10,
  },
  trViewTxt: { color:D.w38, fontSize:11, fontWeight:'700', letterSpacing:0.3 },

  // ── HERO BOOK CTA ─────────────────────────────────────────────
  heroCard:  { borderRadius:30, overflow:'hidden', minHeight:246, ...sh(D.A,0.58,44,18) },
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
    flexDirection:'row', alignItems:'center', backgroundColor:'#fff',
    borderRadius:18, alignSelf:'flex-start', paddingVertical:2, paddingLeft:20,
    ...sh('#000',0.18,8,4),
  },
  heroCTATxt:  { fontSize:14, fontWeight:'800', color:D.AD, paddingRight:4 },
  heroCTAdge:  { width:38, height:38, margin:4, borderRadius:14, backgroundColor:'rgba(200,85,0,0.12)', alignItems:'center', justifyContent:'center' },
  heroMeta:    { flexDirection:'row', gap:12 },
  heroMetaChip:{ flexDirection:'row', alignItems:'center', gap:4 },
  heroMetaTxt: { fontSize:11, color:'rgba(255,255,255,0.40)', fontWeight:'500' },

  // ── STATS ────────────────────────────────────────────────────
  statsRow:   { flexDirection:'row', paddingVertical:20 },
  statDiv:    { width:1, height:50, backgroundColor:D.w07, alignSelf:'center' },
  statCell:   { flex:1, alignItems:'center', gap:4 },
  statIconBg: { width:30, height:30, borderRadius:10, alignItems:'center', justifyContent:'center' },
  statN:      { fontSize:30, fontWeight:'900', letterSpacing:-0.6 },
  statLbl:    { fontSize:9, color:D.w38, fontWeight:'700', letterSpacing:2.2, textTransform:'uppercase' },
  statBar:    { width:44, height:3, backgroundColor:D.w07, borderRadius:2, overflow:'hidden', marginTop:2 },
  statBarFill:{ height:'100%', borderRadius:2, opacity:0.75 },

  // ── TRUST ────────────────────────────────────────────────────
  trustScroll:{ paddingRight:22, gap:8 },
  trustChip:{
    flexDirection:'row', alignItems:'center', gap:6,
    backgroundColor:D.Gof, borderWidth:1, borderColor:D.Gob,
    paddingHorizontal:13, paddingVertical:7, borderRadius:20,
  },
  trustTxt:{ fontSize:11, color:D.Go, fontWeight:'700', letterSpacing:0.3 },

  // ── EYEBROW ──────────────────────────────────────────────────
  eyeRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:14 },
  eyeL:   { flexDirection:'row', alignItems:'center', gap:8 },
  eyeDash:{ width:3, height:14, borderRadius:2, backgroundColor:D.A },
  eyeLabel:{ fontSize:10, color:D.w55, fontWeight:'800', letterSpacing:3.4, textTransform:'uppercase' },
  eyeCta: { fontSize:12, color:D.A, fontWeight:'700', letterSpacing:0.2 },

  // ── QUICK ACTIONS ────────────────────────────────────────────
  qaRow:    { flexDirection:'row', gap:10 },
  qaLeft:   { flex:0.95 },
  qaRight:  { flex:1.05, gap:10 },
  qaRail:   { position:'absolute', top:0, left:0, right:0, height:2.5, opacity:0.40 },
  qaTallBody:{ flex:1, padding:18 },
  qaIconBig: { width:52, height:52, borderRadius:18, alignItems:'center', justifyContent:'center' },
  qaTallName:{ fontSize:19, fontWeight:'800', color:D.w92, lineHeight:23, letterSpacing:-0.5 },
  qaSubLbl:  { fontSize:11, color:D.w38, fontWeight:'500', marginTop:4 },
  qaChev:    { marginTop:12, width:32, height:32, borderRadius:11, backgroundColor:D.Af, alignItems:'center', justifyContent:'center', alignSelf:'flex-start' },
  qaSmBody:  { flexDirection:'row', alignItems:'center', padding:16, paddingTop:18, flex:1, minHeight:90 },
  qaSmIcon:  { width:42, height:42, borderRadius:14, alignItems:'center', justifyContent:'center' },
  qaSmName:  { fontSize:13, fontWeight:'700', color:D.w92, letterSpacing:-0.2 },
  qaWideBody:{ flexDirection:'row', alignItems:'center', padding:16, paddingTop:18 },
  qaBadge:   { width:28, height:28, borderRadius:9, alignItems:'center', justifyContent:'center' },
  qaBadgeTxt:{ fontSize:12, fontWeight:'800' },

  // ── SERVICES ─────────────────────────────────────────────────
  svcWrap:  { width:(W-54)/2.0, marginLeft:11, borderRadius:26, overflow:'hidden', ...sh('#000',0.46,18,8) },
  svcCard:  { height:240, padding:18, justifyContent:'flex-end' },
  svcOrb:   { position:'absolute', top:-55, right:-55, width:150, height:150, borderRadius:75, backgroundColor:'rgba(255,255,255,0.10)' },
  svcName:  { fontSize:18, fontWeight:'800', color:'#fff', lineHeight:22, marginBottom:4, letterSpacing:-0.4 },
  svcTag:   { fontSize:10, color:'rgba(255,255,255,0.56)', fontWeight:'600', letterSpacing:0.3, marginBottom:12 },
  svcFoot:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  svcPrBadge:{ backgroundColor:'rgba(0,0,0,0.22)', paddingHorizontal:10, paddingVertical:4, borderRadius:10 },
  svcPr:    { fontSize:11, color:'rgba(255,255,255,0.80)', fontWeight:'700' },
  svcBookPill:{ backgroundColor:'rgba(255,255,255,0.22)', borderWidth:1, borderColor:'rgba(255,255,255,0.15)', paddingHorizontal:12, paddingVertical:6, borderRadius:12 },
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
