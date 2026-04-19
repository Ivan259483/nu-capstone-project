import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type StepKey =
  | 'uploading'
  | 'analyzing'
  | 'generating_3d'
  | 'estimating_cost'
  | 'awaiting_confirmation'
  | 'confirmed';

type VisualState = 'inactive' | 'active' | 'completed' | 'error';

type WorkflowStatus =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'generating_3d'
  | 'rendering_ar'
  | 'estimating_cost'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'timeout'
  | 'failed';

interface StepDef {
  key: StepKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface DerivedStepState {
  visualState: VisualState;
  completed: boolean;
  active: boolean;
  error: boolean;
}

interface WorkflowStepperProps {
  currentStatus: string;
  isUploadComplete?: boolean;
}

interface DerivedPresentation {
  steps: DerivedStepState[];
  completedCount: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

const STEPS: StepDef[] = [
  { key: 'uploading', label: 'UPLOAD', icon: 'cloud-upload-outline' },
  { key: 'analyzing', label: 'DETECT', icon: 'scan-outline' },
  { key: 'generating_3d', label: '3D', icon: 'cube-outline' },
  { key: 'estimating_cost', label: 'ESTIMATE', icon: 'calculator-outline' },
  { key: 'awaiting_confirmation', label: 'REVIEW', icon: 'eye-outline' },
  { key: 'confirmed', label: 'CONFIRM', icon: 'checkmark-done-outline' },
];

const TOKENS = {
  background: '#0D0D0F',
  accent: '#FF4D1C',
  accentGlow: 'rgba(255, 77, 28, 0.32)',
  accentSoft: 'rgba(255, 77, 28, 0.18)',
  accentBorder: 'rgba(255, 77, 28, 0.18)',
  accentFillSoft: 'rgba(255, 77, 28, 0.16)',
  railMuted: 'rgba(255,255,255,0.08)',
  railBorder: 'rgba(255,255,255,0.04)',
  nodeMuted: '#17171B',
  mutedBorder: 'rgba(255,255,255,0.10)',
  errorAccent: '#FF7A59',
  errorFill: 'rgba(255, 122, 89, 0.18)',
  labelDim: 'rgba(255,255,255,0.42)',
  labelBright: '#FFFFFF',
  labelSoft: 'rgba(255,255,255,0.78)',
  overlay: 'rgba(13,13,15,0.78)',
} as const;

const NODE_SIZE = 30;
const ACTIVE_RING_SIZE = 42;
const TRACK_HEIGHT = 3;
const DIGIT_HEIGHT = 16;
const MOUNT_STAGGER = 80;
const ACTIVE_RAIL_FILL = 0.62;
const CHECK_PATH = 'M3.5 8.7 L6.6 11.6 L12.5 5.6';
const CHECK_PATH_LENGTH = 14;

const HEADER_FONT_FAMILY = Platform.select({
  ios: 'SF Pro Display',
  web: 'Inter',
  default: undefined,
});

const BODY_FONT_FAMILY = Platform.select({
  ios: 'SF Pro Text',
  web: 'Inter',
  default: undefined,
});

function useReducedMotionEnabled() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) {
          setReducedMotion(Boolean(value));
        }
      })
      .catch(() => {
        if (mounted) {
          setReducedMotion(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value) => {
        setReducedMotion(Boolean(value));
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

function useSupportsHover() {
  const [supportsHover, setSupportsHover] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const query = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setSupportsHover(query.matches);

    update();

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }

    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  return supportsHover;
}

function makeInactiveSteps(): DerivedStepState[] {
  return STEPS.map(() => ({
    visualState: 'inactive',
    completed: false,
    active: false,
    error: false,
  }));
}

function stepIndex(step: StepKey) {
  return STEPS.findIndex((item) => item.key === step);
}

function markCompleted(
  steps: DerivedStepState[],
  keys: StepKey[],
) {
  keys.forEach((key) => {
    const index = stepIndex(key);
    steps[index] = {
      visualState: 'completed',
      completed: true,
      active: false,
      error: false,
    };
  });
}

function markActive(steps: DerivedStepState[], key: StepKey) {
  const index = stepIndex(key);
  steps[index] = {
    visualState: 'active',
    completed: false,
    active: true,
    error: false,
  };
}

function markError(steps: DerivedStepState[], key: StepKey) {
  const index = stepIndex(key);
  steps[index] = {
    visualState: 'error',
    completed: false,
    active: false,
    error: true,
  };
}

function normalizeStatus(status: string): WorkflowStatus {
  const knownStatuses: WorkflowStatus[] = [
    'idle',
    'uploading',
    'analyzing',
    'generating_3d',
    'rendering_ar',
    'estimating_cost',
    'awaiting_confirmation',
    'confirmed',
    'timeout',
    'failed',
  ];

  return knownStatuses.includes(status as WorkflowStatus)
    ? (status as WorkflowStatus)
    : 'idle';
}

function deriveErrorStep(status: WorkflowStatus): StepKey | null {
  switch (status) {
    case 'uploading':
      return 'uploading';
    case 'analyzing':
      return 'analyzing';
    case 'generating_3d':
    case 'rendering_ar':
      return 'generating_3d';
    case 'estimating_cost':
      return 'estimating_cost';
    case 'awaiting_confirmation':
      return 'awaiting_confirmation';
    case 'confirmed':
      return 'confirmed';
    default:
      return null;
  }
}

function countCompleted(steps: DerivedStepState[]): number {
  return steps.filter((s) => s.visualState === 'completed').length;
}

function deriveErrorPresentation(
  lastMeaningfulStatus: WorkflowStatus,
  isUploadComplete: boolean,
): DerivedPresentation {
  const steps = makeInactiveSteps();
  const errorStep = deriveErrorStep(lastMeaningfulStatus);

  if (!errorStep) {
    if (isUploadComplete) {
      markCompleted(steps, ['uploading']);
    }
    return { steps, completedCount: countCompleted(steps) };
  }

  const completedBeforeError: Record<StepKey, StepKey[]> = {
    uploading: [],
    analyzing: ['uploading'],
    generating_3d: ['uploading', 'analyzing'],
    estimating_cost: ['uploading', 'analyzing', 'generating_3d'],
    awaiting_confirmation: ['uploading', 'analyzing', 'generating_3d', 'estimating_cost'],
    confirmed: ['uploading', 'analyzing', 'generating_3d', 'estimating_cost', 'awaiting_confirmation'],
  };

  const completedKeys = completedBeforeError[errorStep];
  markCompleted(steps, completedKeys);
  markError(steps, errorStep);

  return {
    steps,
    completedCount: countCompleted(steps),
  };
}

function derivePresentation(
  currentStatus: WorkflowStatus,
  isUploadComplete: boolean,
  lastMeaningfulStatus: WorkflowStatus,
  confirmationPhase: number,
): DerivedPresentation {
  const steps = makeInactiveSteps();

  // Guard: if no upload has happened, any status beyond idle/uploading
  // is stale (e.g. persisted across Expo Fast Refresh or tab navigation).
  // Treat it as idle so the counter shows 0/6 on a clean screen.
  const effectiveStatus =
    !isUploadComplete &&
    currentStatus !== 'idle' &&
    currentStatus !== 'uploading' &&
    currentStatus !== 'failed' &&
    currentStatus !== 'timeout'
      ? 'idle'
      : currentStatus;

  switch (effectiveStatus) {
    case 'idle':
      if (isUploadComplete) {
        markCompleted(steps, ['uploading']);
      }
      break;

    case 'uploading':
      if (isUploadComplete) {
        markCompleted(steps, ['uploading']);
      } else {
        markActive(steps, 'uploading');
      }
      break;

    case 'analyzing':
      markCompleted(steps, ['uploading']);
      markActive(steps, 'analyzing');
      break;

    case 'generating_3d':
      markCompleted(steps, ['uploading', 'analyzing']);
      markActive(steps, 'generating_3d');
      break;

    case 'rendering_ar':
      markCompleted(steps, ['uploading', 'analyzing', 'generating_3d']);
      break;

    case 'estimating_cost':
      markCompleted(steps, ['uploading', 'analyzing', 'generating_3d']);
      markActive(steps, 'estimating_cost');
      break;

    case 'awaiting_confirmation':
      markCompleted(steps, ['uploading', 'analyzing', 'generating_3d', 'estimating_cost']);
      markActive(steps, 'awaiting_confirmation');
      break;

    case 'confirmed':
      if (confirmationPhase === 0) {
        markCompleted(steps, ['uploading', 'analyzing', 'generating_3d', 'estimating_cost']);
        markActive(steps, 'awaiting_confirmation');
      } else if (confirmationPhase === 1) {
        markCompleted(steps, [
          'uploading',
          'analyzing',
          'generating_3d',
          'estimating_cost',
          'awaiting_confirmation',
        ]);
        markActive(steps, 'confirmed');
      } else {
        markCompleted(steps, [
          'uploading',
          'analyzing',
          'generating_3d',
          'estimating_cost',
          'awaiting_confirmation',
          'confirmed',
        ]);
      }
      break;

    case 'timeout':
    case 'failed':
      return deriveErrorPresentation(lastMeaningfulStatus, isUploadComplete);

    default:
      break;
  }

  return { steps, completedCount: countCompleted(steps) };
}

function PremiumCounter({
  completedCount,
  reducedMotion,
}: {
  completedCount: number;
  reducedMotion: boolean;
}) {
  const translateY = useSharedValue(-completedCount * DIGIT_HEIGHT);

  useEffect(() => {
    translateY.value = reducedMotion
      ? withTiming(-completedCount * DIGIT_HEIGHT, { duration: 120 })
      : withSpring(-completedCount * DIGIT_HEIGHT, {
          damping: 15,
          stiffness: 170,
          mass: 0.9,
        });
  }, [completedCount, reducedMotion, translateY]);

  const stackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <View style={styles.counterPill}>
      <View style={styles.counterDigitMask}>
        <Animated.View style={stackStyle}>
          {Array.from({ length: 7 }, (_, value) => (
            <Text key={value} style={styles.counterDigit}>
              {value}
            </Text>
          ))}
        </Animated.View>
      </View>
      <Text style={styles.counterDivider}>/</Text>
      <Text style={styles.counterTotal}>{STEPS.length}</Text>
    </View>
  );
}

function CheckmarkStroke({
  completed,
  reducedMotion,
}: {
  completed: boolean;
  reducedMotion: boolean;
}) {
  const progress = useSharedValue(completed ? 1 : 0);

  useEffect(() => {
    progress.value = completed
      ? withDelay(
          reducedMotion ? 20 : 120,
          withTiming(1, {
            duration: reducedMotion ? 120 : 320,
            easing: Easing.out(Easing.cubic),
          })
        )
      : withTiming(0, { duration: 120 });
  }, [completed, reducedMotion, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_PATH_LENGTH * (1 - progress.value),
    opacity: progress.value,
  }));

  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <AnimatedPath
        animatedProps={animatedProps}
        d={CHECK_PATH}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={CHECK_PATH_LENGTH}
      />
    </Svg>
  );
}

function ActiveArc({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  const rotation = useSharedValue(0);
  const visibility = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    visibility.value = withTiming(active ? 1 : 0, {
      duration: reducedMotion ? 100 : 220,
    });

    if (active && !reducedMotion) {
      rotation.value = 0;
      rotation.value = withRepeat(
        withTiming(1, {
          duration: 2600,
          easing: Easing.linear,
        }),
        -1,
        false
      );
      return;
    }

    cancelAnimation(rotation);
    rotation.value = withTiming(0, { duration: 160 });
  }, [active, reducedMotion, rotation, visibility]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: visibility.value,
    transform: [
      {
        rotate: `${rotation.value * 360}deg`,
      },
    ],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.arcWrap, animatedStyle]}>
      <Svg width={ACTIVE_RING_SIZE} height={ACTIVE_RING_SIZE} viewBox="0 0 42 42">
        <Defs>
          <SvgLinearGradient id="workflowArc" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#FF9A76" />
            <Stop offset="55%" stopColor={TOKENS.accent} />
            <Stop offset="100%" stopColor="#FFD0C2" />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx="21"
          cy="21"
          r="18"
          fill="none"
          stroke="url(#workflowArc)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray="44 120"
        />
      </Svg>
    </Animated.View>
  );
}

function SparkDot({
  index,
  reducedMotion,
}: {
  index: number;
  reducedMotion: boolean;
}) {
  const phase = useSharedValue(0);
  const configs = [
    { x0: -5, y0: -16, x1: -10, y1: -24, delay: 0 },
    { x0: 12, y0: -12, x1: 18, y1: -18, delay: 100 },
    { x0: 15, y0: 4, x1: 22, y1: 0, delay: 180 },
    { x0: -10, y0: 12, x1: -16, y1: 18, delay: 260 },
  ] as const;

  const config = configs[index];

  useEffect(() => {
    if (reducedMotion) {
      phase.value = 0;
      return;
    }

    phase.value = withDelay(
      config.delay,
      withRepeat(
        withTiming(1, {
          duration: 1100,
          easing: Easing.out(Easing.cubic),
        }),
        -1,
        false
      )
    );

    return () => {
      cancelAnimation(phase);
      phase.value = 0;
    };
  }, [config.delay, phase, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(phase.value, [0, 0.25, 0.75, 1], [0, 0.95, 0.3, 0]),
    transform: [
      {
        translateX: interpolate(phase.value, [0, 1], [config.x0, config.x1]),
      },
      {
        translateY: interpolate(phase.value, [0, 1], [config.y0, config.y1]),
      },
      {
        scale: interpolate(phase.value, [0, 0.25, 1], [0.35, 1, 0.5]),
      },
    ],
  }));

  return <Animated.View style={[styles.sparkDot, animatedStyle]} />;
}

function SparkCluster({
  active,
  reducedMotion,
}: {
  active: boolean;
  reducedMotion: boolean;
}) {
  if (!active || reducedMotion) {
    return null;
  }

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {Array.from({ length: 4 }, (_, index) => (
        <SparkDot key={index} index={index} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

function ConnectorRail({
  state,
  index,
  reducedMotion,
}: {
  state: DerivedStepState;
  index: number;
  reducedMotion: boolean;
}) {
  const fillTarget = state.completed ? 1 : state.active ? ACTIVE_RAIL_FILL : 0;
  const fill = useSharedValue(fillTarget);
  const shimmer = useSharedValue(-0.4);
  const shimmerOpacity = useSharedValue(0);
  const [trackWidth, setTrackWidth] = useState(0);
  const previousTarget = useRef(fillTarget);

  useEffect(() => {
    fill.value = reducedMotion
      ? withTiming(fillTarget, { duration: 120 })
      : withSpring(fillTarget, {
          damping: 18,
          stiffness: 165,
          mass: 0.9,
        });

    if (reducedMotion || fillTarget <= 0) {
      cancelAnimation(shimmer);
      cancelAnimation(shimmerOpacity);
      shimmerOpacity.value = 0;
      shimmer.value = -0.4;
      previousTarget.current = fillTarget;
      return;
    }

    const increased = fillTarget > previousTarget.current;
    previousTarget.current = fillTarget;

    if (state.active || increased) {
      shimmer.value = -0.4;
      shimmerOpacity.value = 1;
      shimmer.value = withRepeat(
        withTiming(1.2, {
          duration: 1200,
          easing: Easing.linear,
        }),
        state.active ? -1 : 1,
        false
      );

      if (!state.active) {
        shimmerOpacity.value = withSequence(
          withTiming(1, { duration: 100 }),
          withDelay(780, withTiming(0, { duration: 200 }))
        );
      }
      return;
    }

    cancelAnimation(shimmer);
    cancelAnimation(shimmerOpacity);
    shimmerOpacity.value = withTiming(0, { duration: 160 });
  }, [fill, fillTarget, reducedMotion, shimmer, shimmerOpacity, state.active]);

  const fillStyle = useAnimatedStyle(() => {
    const widthOffset = trackWidth > 0 ? ((1 - fill.value) * trackWidth) / 2 : 0;
    return {
      transform: [
        { translateX: -widthOffset },
        { scaleX: fill.value },
      ],
    };
  });

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmerOpacity.value,
    transform: [
      {
        translateX: trackWidth > 0
          ? interpolate(shimmer.value, [-0.4, 1.2], [-trackWidth * 0.3, trackWidth])
          : 0,
      },
    ],
  }));

  return (
    <View
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.railTrack}
    >
      <Animated.View style={[styles.railFillMask, fillStyle]}>
        <LinearGradient
          colors={['#FF7A59', TOKENS.accent, '#FFC1B0']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <Animated.View style={[styles.railShimmer, shimmerStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.95)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
      <View style={[styles.railEndCap, index % 2 === 0 && styles.railEndCapDim]} />
    </View>
  );
}

function StepNode({
  step,
  state,
  index,
  reducedMotion,
  supportsHover,
}: {
  step: StepDef;
  state: DerivedStepState;
  index: number;
  reducedMotion: boolean;
  supportsHover: boolean;
}) {
  const mount = useSharedValue(0);
  const pulse = useSharedValue(0);
  const hover = useSharedValue(0);
  const emphasisScale = useSharedValue(1);
  const tone = useSharedValue(
    state.error ? 3 : state.completed ? 2 : state.active ? 1 : 0
  );
  const ring = useSharedValue(state.active ? 1 : 0);
  const glow = useSharedValue(state.completed ? 1 : state.active ? 0.8 : state.error ? 0.5 : 0);
  const labelEmphasis = useSharedValue(
    state.active || state.completed || state.error ? 1 : 0
  );
  const iconOpacity = useSharedValue(state.completed ? 0 : 1);
  const checkOpacity = useSharedValue(state.completed ? 1 : 0);

  useEffect(() => {
    mount.value = withDelay(
      index * MOUNT_STAGGER,
      reducedMotion
        ? withTiming(1, { duration: 180 })
        : withSpring(1, {
            damping: 14,
            stiffness: 180,
            mass: 0.9,
          })
    );
  }, [index, mount, reducedMotion]);

  useEffect(() => {
    tone.value = withTiming(
      state.error ? 3 : state.completed ? 2 : state.active ? 1 : 0,
      { duration: reducedMotion ? 120 : 240 }
    );
    ring.value = reducedMotion
      ? withTiming(state.active ? 1 : 0, { duration: 120 })
      : withSpring(state.active ? 1 : 0, {
          damping: 16,
          stiffness: 175,
          mass: 0.9,
        });
    glow.value = reducedMotion
      ? withTiming(state.completed ? 1 : state.active ? 0.75 : state.error ? 0.45 : 0, {
          duration: 120,
        })
      : withSpring(state.completed ? 1 : state.active ? 0.75 : state.error ? 0.45 : 0, {
          damping: 17,
          stiffness: 165,
        });
    labelEmphasis.value = reducedMotion
      ? withTiming(state.active || state.completed || state.error ? 1 : 0, { duration: 120 })
      : withSpring(state.active || state.completed || state.error ? 1 : 0, {
          damping: 16,
          stiffness: 170,
        });
    iconOpacity.value = state.completed
      ? withDelay(
          reducedMotion ? 20 : 110,
          withTiming(0, { duration: reducedMotion ? 80 : 150 })
        )
      : withTiming(1, { duration: 160 });
    checkOpacity.value = state.completed
      ? withDelay(
          reducedMotion ? 20 : 120,
          withTiming(1, { duration: reducedMotion ? 80 : 180 })
        )
      : withTiming(0, { duration: 100 });

    if (state.completed) {
      emphasisScale.value = reducedMotion
        ? withTiming(1, { duration: 120 })
        : withSequence(
            withTiming(0.96, { duration: 60 }),
            withTiming(1.06, {
              duration: 140,
              easing: Easing.out(Easing.cubic),
            }),
            withSpring(1, { damping: 15, stiffness: 170 })
          );
      return;
    }

    emphasisScale.value = withTiming(1, { duration: 160 });
  }, [
    checkOpacity,
    emphasisScale,
    glow,
    iconOpacity,
    labelEmphasis,
    reducedMotion,
    ring,
    state.active,
    state.completed,
    state.error,
    tone,
  ]);

  useEffect(() => {
    if (state.active && !reducedMotion) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, {
            duration: 900,
            easing: Easing.inOut(Easing.quad),
          }),
          withTiming(0, {
            duration: 900,
            easing: Easing.inOut(Easing.quad),
          })
        ),
        -1,
        false
      );
      return;
    }

    cancelAnimation(pulse);
    pulse.value = withTiming(0, { duration: 140 });
  }, [pulse, reducedMotion, state.active]);

  const handleHoverIn = () => {
    if (!supportsHover) {
      return;
    }
    hover.value = withSpring(1, {
      damping: 14,
      stiffness: 180,
    });
  };

  const handleHoverOut = () => {
    if (!supportsHover) {
      return;
    }
    hover.value = withSpring(0, {
      damping: 16,
      stiffness: 180,
    });
  };

  const wrapperStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [
      {
        translateY:
          interpolate(mount.value, [0, 1], [10, 0]) +
          interpolate(hover.value, [0, 1], [0, -2]),
      },
      { scale: interpolate(mount.value, [0, 1], [0.86, 1]) },
      { scale: emphasisScale.value },
      { scale: interpolate(hover.value, [0, 1], [1, 1.03]) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity:
      state.completed
        ? 0.28 + glow.value * 0.1
        : state.error
          ? 0.12 + glow.value * 0.08
          : state.active
            ? (reducedMotion ? 0.22 : 0.28 + pulse.value * 0.18)
            : 0,
    transform: [
      {
        scale:
          state.completed
            ? 1.18
            : state.error
              ? 1.04
              : state.active
                ? 1 + (reducedMotion ? 0.02 : pulse.value * 0.08)
                : 1,
      },
    ],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value,
    transform: [
      {
        scale: 1 + interpolate(pulse.value, [0, 1], [0, reducedMotion ? 0 : 0.08]),
      },
    ],
  }));

  const surfaceStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      tone.value,
      [0, 1, 2, 3],
      [
        TOKENS.nodeMuted,
        TOKENS.accentFillSoft,
        TOKENS.accent,
        TOKENS.errorFill,
      ]
    ),
    borderColor: interpolateColor(
      tone.value,
      [0, 1, 2, 3],
      [
        TOKENS.mutedBorder,
        'rgba(255, 77, 28, 0.64)',
        'rgba(255, 255, 255, 0.22)',
        TOKENS.errorAccent,
      ]
    ),
    shadowOpacity: interpolate(tone.value, [0, 1, 2, 3], [0.06, 0.14, 0.28, 0.12]),
  }));

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  const checkStyle = useAnimatedStyle(() => ({
    opacity: checkOpacity.value,
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity:
      mount.value *
      interpolate(labelEmphasis.value, [0, 1], [0.58, state.error ? 0.92 : 1]),
    transform: [
      {
        translateY:
          interpolate(mount.value, [0, 1], [6, 0]) +
          interpolate(labelEmphasis.value, [0, 1], [4, 0]),
      },
    ],
  }));

  const iconColor = state.completed
    ? '#FFFFFF'
    : state.error
      ? TOKENS.errorAccent
      : state.active
        ? TOKENS.labelBright
        : TOKENS.labelDim;

  const labelColor = state.completed
    ? TOKENS.labelBright
    : state.error
      ? TOKENS.errorAccent
      : state.active
        ? TOKENS.labelBright
        : TOKENS.labelDim;

  return (
    <Pressable
      accessible={false}
      onHoverIn={supportsHover ? handleHoverIn : undefined}
      onHoverOut={supportsHover ? handleHoverOut : undefined}
      style={styles.nodePressable}
    >
      <Animated.View style={[styles.nodeColumn, wrapperStyle]}>
        <View style={styles.nodeStage}>
          <SparkCluster active={state.active} reducedMotion={reducedMotion} />
          <Animated.View
            style={[
              styles.nodeGlow,
              { backgroundColor: state.error ? TOKENS.errorAccent : TOKENS.accent },
              glowStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.nodeRing,
              { borderColor: TOKENS.accent },
              ringStyle,
            ]}
          />
          <ActiveArc active={state.active} reducedMotion={reducedMotion} />
          <Animated.View
            style={[
              styles.nodeSurface,
              {
                shadowColor: state.error ? TOKENS.errorAccent : TOKENS.accent,
                elevation: state.active || state.completed ? 8 : 1,
              },
              surfaceStyle,
            ]}
          >
            <Animated.View style={[styles.nodeIconWrap, iconStyle]}>
              <Ionicons name={step.icon} size={14} color={iconColor} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.nodeCheckWrap, checkStyle]}>
              <CheckmarkStroke completed={state.completed} reducedMotion={reducedMotion} />
            </Animated.View>
          </Animated.View>
        </View>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.stepLabel,
            {
              color: labelColor,
              fontWeight: state.active || state.completed ? '700' : '600',
            },
            labelStyle,
          ]}
        >
          {step.label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

export default function WorkflowStepper({
  currentStatus,
  isUploadComplete = false,
}: WorkflowStepperProps) {
  const reducedMotion = useReducedMotionEnabled();
  const supportsHover = useSupportsHover();
  const normalizedStatus = normalizeStatus(currentStatus);
  const lastMeaningfulStatusRef = useRef<WorkflowStatus>('idle');
  const previousStatusRef = useRef<WorkflowStatus>(normalizedStatus);
  const [confirmationPhase, setConfirmationPhase] = useState(
    normalizedStatus === 'confirmed' ? 2 : 0
  );

  useEffect(() => {
    if (normalizedStatus !== 'failed' && normalizedStatus !== 'timeout') {
      lastMeaningfulStatusRef.current = normalizedStatus;
    }
  }, [normalizedStatus]);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    let reviewTimer: ReturnType<typeof setTimeout> | undefined;
    let confirmTimer: ReturnType<typeof setTimeout> | undefined;

    if (normalizedStatus === 'confirmed') {
      if (previousStatus !== 'confirmed') {
        setConfirmationPhase(0);
        reviewTimer = setTimeout(
          () => setConfirmationPhase(1),
          reducedMotion ? 140 : 260
        );
        confirmTimer = setTimeout(
          () => setConfirmationPhase(2),
          reducedMotion ? 280 : 620
        );
      }
    } else {
      setConfirmationPhase(0);
    }

    previousStatusRef.current = normalizedStatus;

    return () => {
      if (reviewTimer) {
        clearTimeout(reviewTimer);
      }
      if (confirmTimer) {
        clearTimeout(confirmTimer);
      }
    };
  }, [normalizedStatus, reducedMotion]);

  const presentation = useMemo(
    () =>
      derivePresentation(
        normalizedStatus,
        isUploadComplete,
        lastMeaningfulStatusRef.current,
        confirmationPhase
      ),
    [confirmationPhase, isUploadComplete, normalizedStatus]
  );

  console.log('[WorkflowStepper]', {
    currentStatus,
    isUploadComplete,
    normalizedStatus,
    confirmationPhase,
    completedCount: presentation.completedCount,
    steps: presentation.steps.map(s => s.visualState),
  });

  return (
    <Animated.View
      entering={FadeIn.duration(reducedMotion ? 180 : 420)}
      style={styles.cardFrame}
    >
      <View style={styles.outerBloom} pointerEvents="none" />
      <View style={styles.cardShell}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 42 : 86}
          tint="dark"
          style={StyleSheet.absoluteFillObject}
        />
        <View style={[StyleSheet.absoluteFillObject, styles.cardOverlay]} pointerEvents="none" />
        <LinearGradient
          colors={['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.01)', 'transparent']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.cardHighlight}
        />
        <View style={styles.header}>
          <View style={styles.headerMeta}>
            <View style={styles.headerDot} />
            <Text style={styles.headerTitle}>Workflow Progress</Text>
          </View>
          <PremiumCounter
            key={presentation.completedCount}
            completedCount={presentation.completedCount}
            reducedMotion={reducedMotion}
          />
        </View>

        <View style={styles.stepsRow}>
          {STEPS.map((step, index) => {
            const isLast = index === STEPS.length - 1;
            return (
              <View key={step.key} style={styles.stepColumn}>
                <View style={styles.visualRow}>
                  {!isLast && (
                    <View style={styles.connectorSlot}>
                      <ConnectorRail
                        index={index}
                        state={presentation.steps[index]}
                        reducedMotion={reducedMotion}
                      />
                    </View>
                  )}
                  <StepNode
                    step={step}
                    state={presentation.steps[index]}
                    index={index}
                    reducedMotion={reducedMotion}
                    supportsHover={supportsHover}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardFrame: {
    position: 'relative',
    marginBottom: 2,
  },

  outerBloom: {
    position: 'absolute',
    top: 12,
    left: 18,
    right: 18,
    bottom: -8,
    borderRadius: 28,
    backgroundColor: TOKENS.accentGlow,
    opacity: 0.16,
    shadowColor: TOKENS.accent,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
  },

  cardShell: {
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: TOKENS.accentBorder,
    backgroundColor: TOKENS.background,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.36,
    shadowRadius: 28,
    elevation: 16,
  },

  cardOverlay: {
    backgroundColor: TOKENS.overlay,
  },

  cardHighlight: {
    ...StyleSheet.absoluteFillObject,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    marginRight: 10,
    backgroundColor: TOKENS.accent,
    shadowColor: TOKENS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 8,
  },

  headerTitle: {
    color: TOKENS.labelBright,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.28,
    fontFamily: HEADER_FONT_FAMILY,
  },

  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 77, 28, 0.22)',
    backgroundColor: 'rgba(255, 77, 28, 0.08)',
  },

  counterDigitMask: {
    height: DIGIT_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },

  counterDigit: {
    height: DIGIT_HEIGHT,
    color: TOKENS.accent,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: DIGIT_HEIGHT,
    textAlign: 'center',
    fontFamily: BODY_FONT_FAMILY,
  },

  counterDivider: {
    marginLeft: 5,
    marginRight: 4,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: BODY_FONT_FAMILY,
  },

  counterTotal: {
    color: TOKENS.labelBright,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: BODY_FONT_FAMILY,
  },

  stepsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  stepColumn: {
    flex: 1,
    alignItems: 'center',
    overflow: 'visible',
  },

  visualRow: {
    width: '100%',
    alignItems: 'center',
    overflow: 'visible',
  },

  connectorSlot: {
    position: 'absolute',
    left: '50%',
    width: '100%',
    top: 21 - TRACK_HEIGHT / 2,
    height: TRACK_HEIGHT,
    zIndex: 0,
  },

  railTrack: {
    width: '100%',
    height: TRACK_HEIGHT,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: TOKENS.railMuted,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TOKENS.railBorder,
  },

  railFillMask: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },

  railShimmer: {
    position: 'absolute',
    top: -1,
    bottom: -1,
    width: 24,
    borderRadius: 999,
    overflow: 'hidden',
  },

  railEndCap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },

  railEndCapDim: {
    opacity: 0.4,
  },

  nodePressable: {
    width: '100%',
    alignItems: 'center',
  },

  nodeColumn: {
    width: '100%',
    alignItems: 'center',
  },

  nodeStage: {
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE + 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },

  nodeGlow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
  },

  nodeRing: {
    position: 'absolute',
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    borderRadius: ACTIVE_RING_SIZE / 2,
    borderWidth: 1.25,
  },

  arcWrap: {
    position: 'absolute',
    width: ACTIVE_RING_SIZE,
    height: ACTIVE_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  nodeSurface: {
    width: NODE_SIZE,
    height: NODE_SIZE,
    borderRadius: NODE_SIZE / 2,
    borderWidth: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
  },

  nodeIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  nodeCheckWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sparkDot: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 3.5,
    height: 3.5,
    borderRadius: 999,
    marginLeft: -1.75,
    marginTop: -1.75,
    backgroundColor: '#FFD6CA',
  },

  stepLabel: {
    marginTop: 10,
    fontSize: 10,
    lineHeight: 12,
    textAlign: 'center',
    letterSpacing: 0.72,
    textTransform: 'uppercase',
    fontFamily: BODY_FONT_FAMILY,
  },
});
