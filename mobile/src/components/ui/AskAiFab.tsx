/**
 * AskAiFab — Meta AI-style floating button
 *
 * 1. Pops in as a full pill ("Ask AI" + spinning orb)
 * 2. After 3 seconds, collapses to just the spinning orb
 * 3. Stays as a small orb permanently — tap to open ChatOverlay
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withRepeat,
  Easing,
  interpolate,
  FadeIn,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ChatOverlay from '@/components/ChatOverlay';

// ── Orb palette — Meta AI vibe ───────────────────────────────────────────────
const ORB_COLORS = [
  '#9B5DE5',
  '#7B61FF',
  '#3A86FF',
  '#56CFE1',
  '#5E60CE',
  '#6930C3',
  '#9B5DE5',
  '#C77DFF',
];

const DOT_COUNT = 8;
const ORB_RADIUS = 10;
const DOT_SIZE = 5;

// ── Timings ───────────────────────────────────────────────────────────────────
const PILL_WIDTH  = 120;  // expanded width
const ORB_SIZE    = 40;   // collapsed diameter
const COLLAPSE_DELAY = 2800; // ms before shrinking

// ── Spinning dot ─────────────────────────────────────────────────────────────
function OrbDot({ index, rotation }: { index: number; rotation: SharedValue<number> }) {
  const angleOffset = (index / DOT_COUNT) * 2 * Math.PI;

  const animStyle = useAnimatedStyle(() => {
    const angle = rotation.value + angleOffset;
    const x = Math.cos(angle) * ORB_RADIUS;
    const y = Math.sin(angle) * ORB_RADIUS;
    const scale = interpolate(Math.sin(angle), [-1, 1], [0.5, 1.0]);
    const opacity = interpolate(Math.sin(angle), [-1, 1], [0.35, 1.0]);
    return {
      transform: [{ translateX: x }, { translateY: y }, { scale }],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: ORB_COLORS[index % ORB_COLORS.length] },
        animStyle,
      ]}
    />
  );
}

function SpinningOrb({ size = ORB_SIZE }: { size?: number }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(2 * Math.PI, { duration: 2000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  return (
    <View style={[styles.orbContainer, { width: size, height: size }]}>
      {Array.from({ length: DOT_COUNT }).map((_, i) => (
        <OrbDot key={i} index={i} rotation={rotation} />
      ))}
    </View>
  );
}

// ── Main FAB ─────────────────────────────────────────────────────────────────
export default function AskAiFab() {
  const [chatVisible, setChatVisible] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Shared values
  const fabWidth   = useSharedValue(PILL_WIDTH);
  const fabScale   = useSharedValue(0);
  const textOpacity = useSharedValue(1);

  useEffect(() => {
    // 1. Pop in
    fabScale.value = withSpring(1, { damping: 14, stiffness: 130 });

    // 2. After delay, collapse to orb
    const timer = setTimeout(() => {
      fabWidth.value = withTiming(ORB_SIZE, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
      textOpacity.value = withTiming(0, { duration: 180 });
      setTimeout(() => setCollapsed(true), 360);
    }, COLLAPSE_DELAY);

    return () => clearTimeout(timer);
  }, []);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: fabScale.value }],
    width: fabWidth.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChatVisible(true);
  };

  return (
    <>
      <Animated.View
        style={styles.fabWrapper}
        entering={FadeIn.delay(400).duration(300)}
      >
        <Animated.View style={[styles.fab, containerStyle]}>
          <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.82}
            style={styles.touchable}
          >
            <SpinningOrb size={ORB_SIZE} />
            {!collapsed && (
              <Animated.Text style={[styles.label, textStyle]}>
                Ask AI
              </Animated.Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <ChatOverlay visible={chatVisible} onClose={() => setChatVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  fabWrapper: {
    position: 'absolute',
    bottom: 96,
    right: 16,
    zIndex: 999,
  },
  fab: {
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: 'rgba(20, 16, 34, 0.92)',
    borderWidth: 1.5,
    borderColor: 'rgba(155, 93, 229, 0.5)',
    shadowColor: '#9B5DE5',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 12,
    overflow: 'hidden',
  },
  touchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbContainer: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  dot: {
    position: 'absolute',
    top: (ORB_SIZE / 2) - (DOT_SIZE / 2),
    left: (ORB_SIZE / 2) - (DOT_SIZE / 2),
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
    marginLeft: 4,
    marginRight: 10,
    flexShrink: 1,
  },
});
