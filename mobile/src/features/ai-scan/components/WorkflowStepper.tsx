import React, { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withSpring,
  withDelay,
  interpolate,
  Easing,
  FadeIn,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/* ═══════════════════════════════════════════════════════════════════════════════
 * PREMIUM WORKFLOW STEPPER — v5  «International Grade»
 *
 * Tesla Service · Porsche Connect · Mercedes MBUX aesthetic
 *
 * Architecture:
 *   Each step is a flex:1 column containing:
 *     [visual row] = circle + connecting rail (extends to next step)
 *     [label]      = centered text under circle
 *
 * The rail extends rightward out of the column via negative margins,
 * ensuring it connects perfectly to the next step's circle center.
 * ═══════════════════════════════════════════════════════════════════════════════ */

const ACCENT = '#FF6B35';
const ACCENT_WARM = '#FF8A50';
const SUCCESS = '#10B981';
const SUCCESS_GLOW = '#34D399';
const NODE_SIZE = 28;

interface StepDef {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const STEPS: StepDef[] = [
  { key: 'uploading',             label: 'UPLOAD',   icon: 'cloud-upload-outline' },
  { key: 'analyzing',             label: 'DETECT',   icon: 'scan-outline' },
  { key: 'generating_3d',         label: '3D',       icon: 'cube-outline' },
  { key: 'estimating_cost',       label: 'ESTIMATE', icon: 'calculator-outline' },
  { key: 'awaiting_confirmation', label: 'REVIEW',   icon: 'eye-outline' },
  { key: 'confirmed',             label: 'CONFIRM',  icon: 'checkmark-done-outline' },
];

const STATUS_ORDER: Record<string, number> = {
  idle: 0,
  uploading: 1,
  analyzing: 2,
  generating_3d: 3,
  rendering_ar: 3.5,
  estimating_cost: 4,
  awaiting_confirmation: 5,
  confirmed: 6,
  timeout: -1,
  failed: -1,
};

/* ─── Breathing Glow ────────────────────────────────────────────────── */
function GlowHalo() {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.ease) })
      ),
      -1, true
    );
  }, []);

  const outer = useAnimatedStyle(() => ({
    opacity: 0.06 + p.value * 0.1,
    transform: [{ scale: 1 + p.value * 0.5 }],
  }));
  const inner = useAnimatedStyle(() => ({
    opacity: 0.12 + p.value * 0.2,
    transform: [{ scale: 1 + p.value * 0.25 }],
  }));

  return (
    <>
      <Animated.View style={[st.halo, { width: 44, height: 44, borderRadius: 22 }, outer]} />
      <Animated.View style={[st.halo, { width: 36, height: 36, borderRadius: 18 }, inner]} />
    </>
  );
}

/* ─── Success Burst ─────────────────────────────────────────────────── */
function Burst() {
  const s = useSharedValue(0.6);
  const o = useSharedValue(0);
  useEffect(() => {
    o.value = withSequence(
      withTiming(0.6, { duration: 150 }),
      withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
    s.value = withTiming(1.8, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, []);
  const a = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ scale: s.value }],
  }));
  return <Animated.View style={[st.burst, a]} />;
}

/* ─── Rail Shimmer ──────────────────────────────────────────────────── */
function Shimmer() {
  const x = useSharedValue(-0.3);
  useEffect(() => {
    x.value = withRepeat(
      withTiming(1.3, { duration: 1800, easing: Easing.linear }),
      -1, false
    );
  }, []);
  const a = useAnimatedStyle(() => ({
    left: `${x.value * 100}%` as any,
    opacity: interpolate(x.value, [-0.3, 0.2, 0.8, 1.3], [0, 0.6, 0.6, 0]),
  }));
  return <Animated.View style={[st.shimmer, a]} />;
}

/* ─── Node Circle ───────────────────────────────────────────────────── */
function StepCircle({
  step, index, done, active,
}: {
  step: StepDef; index: number; done: boolean; active: boolean;
}) {
  const sc = useSharedValue(0);

  useEffect(() => {
    sc.value = withDelay(index * 60, withSpring(1, { damping: 13, stiffness: 180, mass: 0.6 }));
  }, []);

  useEffect(() => {
    if (done) {
      sc.value = withSequence(
        withTiming(1.2, { duration: 160, easing: Easing.out(Easing.cubic) }),
        withSpring(1, { damping: 10, stiffness: 160 })
      );
    } else if (active) {
      sc.value = withSpring(1.04, { damping: 10, stiffness: 140 });
    }
  }, [done, active]);

  const anim = useAnimatedStyle(() => ({ transform: [{ scale: sc.value }] }));
  const bg = done ? SUCCESS : active ? ACCENT : 'rgba(20,20,32,0.95)';
  const bc = done ? SUCCESS_GLOW : active ? ACCENT_WARM : 'rgba(255,255,255,0.06)';
  const ic = done || active ? '#fff' : 'rgba(255,255,255,0.13)';

  return (
    <View style={st.nodeWrap}>
      {active && <GlowHalo />}
      {done && <Burst />}
      <Animated.View
        style={[
          st.node,
          {
            backgroundColor: bg,
            borderColor: bc,
            shadowColor: done ? SUCCESS : active ? ACCENT : 'transparent',
            shadowOpacity: done ? 0.5 : active ? 0.55 : 0,
            shadowRadius: done ? 8 : active ? 10 : 0,
          },
          anim,
        ]}
      >
        <Ionicons
          name={done ? 'checkmark-sharp' : step.icon}
          size={done ? 14 : 12}
          color={ic}
        />
      </Animated.View>
    </View>
  );
}

/* ─── Connecting Rail ───────────────────────────────────────────────── */
function Rail({ done, active, idx }: { done: boolean; active: boolean; idx: number }) {
  const w = useSharedValue(0);
  useEffect(() => {
    const t = done ? 100 : active ? 50 : 0;
    w.value = withDelay(idx * 45, withTiming(t, { duration: 550, easing: Easing.out(Easing.cubic) }));
  }, [done, active]);
  const a = useAnimatedStyle(() => ({ width: `${w.value}%` as any }));
  return (
    <View style={st.railTrack}>
      <Animated.View style={[st.railFill, a]}>
        <LinearGradient
          colors={done ? [SUCCESS, SUCCESS_GLOW] : [ACCENT, ACCENT_WARM]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        {active && <Shimmer />}
      </Animated.View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * MAIN STEPPER
 * ═══════════════════════════════════════════════════════════════════════════════ */
interface Props {
  currentStatus: string;
  isUploadComplete?: boolean;
}

export default function WorkflowStepper({ currentStatus, isUploadComplete }: Props) {
  const rank = STATUS_ORDER[currentStatus] ?? 0;

  const doneCount = useMemo(() => {
    let c = 0;
    for (const s of STEPS) {
      const r = STATUS_ORDER[s.key] ?? 0;
      if (rank > r) c++;
      else if (s.key === 'uploading' && isUploadComplete) c++;
    }
    return c;
  }, [rank, isUploadComplete]);

  const states = useMemo(() =>
    STEPS.map((step, i) => {
      const sr = STATUS_ORDER[step.key] ?? i + 1;
      let done = rank > sr;
      let active = currentStatus === step.key ||
        (step.key === 'awaiting_confirmation' && currentStatus === 'rendering_ar');
      if (step.key === 'uploading' && isUploadComplete && rank < sr) {
        done = true;
        active = false;
      }
      return { done, active };
    }),
    [rank, currentStatus, isUploadComplete]
  );

  return (
    <Animated.View entering={FadeIn.duration(400)} style={st.card}>
      {/* Header */}
      <View style={st.header}>
        <View style={st.headerL}>
          <View style={st.dot} />
          <Text style={st.title}>Workflow</Text>
        </View>
        <View style={st.chip}>
          <Text style={st.chipTxt}>{doneCount} / {STEPS.length}</Text>
          <View style={st.chipTrack}>
            <View style={[st.chipFill, { width: `${(doneCount / STEPS.length) * 100}%` }]} />
          </View>
        </View>
      </View>

      {/* Steps */}
      <View style={st.stepRow}>
        {STEPS.map((step, i) => {
          const { done, active } = states[i];
          const last = i === STEPS.length - 1;

          return (
            <View key={step.key} style={st.stepCol}>
              {/* Visual: node centered, rail behind */}
              <View style={st.visual}>
                {/* Rail — starts at center, extends right to next column */}
                {!last && (
                  <View style={st.railPos}>
                    <Rail done={done} active={active} idx={i} />
                  </View>
                )}
                {/* Node — always centered */}
                <StepCircle step={step} index={i} done={done} active={active} />
              </View>

              {/* Label — centered under node */}
              <Text
                style={[
                  st.label,
                  {
                    color: done ? SUCCESS
                      : active ? '#fff'
                      : 'rgba(255,255,255,0.18)',
                  },
                ]}
                numberOfLines={1}
              >
                {step.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Animated.View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════════ */
const st = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(12,12,18,0.92)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    paddingTop: 16,
    paddingBottom: 18,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 2,
  },
  headerL: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  title: { color: '#f0f0f5', fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },

  /* Chip */
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: 'rgba(255,107,53,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,107,53,0.12)',
    borderRadius: 999,
    paddingHorizontal: 11, paddingVertical: 5,
  },
  chipTxt: { color: ACCENT, fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  chipTrack: {
    width: 34, height: 3, borderRadius: 2,
    backgroundColor: 'rgba(255,107,53,0.1)',
    overflow: 'hidden',
  },
  chipFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },

  /* Step layout — flex:1 columns in a row */
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepCol: {
    flex: 1,
    alignItems: 'center',
    overflow: 'visible',
  },
  visual: {
    width: '100%',
    height: NODE_SIZE + 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  railPos: {
    position: 'absolute',
    left: '50%',
    width: '100%',
    top: '50%',
    marginTop: -1.25,
    height: 2.5,
    zIndex: 0,
  },

  /* Label */
  label: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 7,
  },

  /* Node */
  nodeWrap: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    backgroundColor: ACCENT,
    zIndex: 0,
  },
  burst: {
    position: 'absolute',
    width: NODE_SIZE, height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 2,
    borderColor: SUCCESS_GLOW,
    zIndex: 0,
  },
  node: {
    width: NODE_SIZE, height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },

  /* Rail */
  railTrack: {
    width: '100%',
    height: 2.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 2,
    overflow: 'hidden',
    zIndex: 1,
  },
  railFill: {
    height: '100%',
    borderRadius: 2,
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    width: '18%',
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
});
