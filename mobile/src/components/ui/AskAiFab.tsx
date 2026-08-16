/**
 * AskAiFab — compact premium chat entry that stays clear of navigation.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  Easing,
  interpolate,
  FadeIn,
  type SharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ChatOverlay from '@/components/ChatOverlay';

// ── Orb palette — brand orange / amber (no purple or blue) ───────────────────
const ORB_COLORS = [
  '#FF6B35',
  '#FF8F5C',
  '#EA580C',
  '#FFB089',
  '#CC5214',
  '#FF6B35',
  '#FFF5F0',
  '#FF8533',
];

const DOT_COUNT = 7;
const ORB_RADIUS = 9;
const DOT_SIZE = 4;

const ORB_SIZE = 40;

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
      withTiming(2 * Math.PI, { duration: 3500, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

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
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setChatVisible(true);
  };

  return (
    <>
      <Animated.View
        style={[
          styles.fabWrapper,
          { bottom: 80 + insets.bottom },
        ]}
        entering={FadeIn.delay(500).duration(240)}
      >
        <Animated.View style={styles.fab}>
          <TouchableOpacity
            onPress={handlePress}
            activeOpacity={0.82}
            style={styles.touchable}
            accessibilityRole="button"
            accessibilityLabel="Open AI assistant"
          >
            <SpinningOrb size={ORB_SIZE} />
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
    right: 20,
    zIndex: 999,
  },
  fab: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: 'rgba(8, 10, 14, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.38)',
    shadowColor: '#FF6B35',
    shadowOpacity: 0.20,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
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
});
