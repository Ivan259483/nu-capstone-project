/**
 * Tab Layout — AutoSPF+ 5-Tab Bottom Navigation
 * Full-width flush tab bar with safe area inset support.
 */

import React from 'react';
import { Tabs } from 'expo-router';
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, Glass } from '@/constants/theme';
import AskAiFab from '@/components/ui/AskAiFab';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  book: 'add-circle',
  track: 'navigate',
  scan: 'scan',
  settings: 'person',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  book: 'Book',
  track: 'Tracker',
  scan: 'AI Scan',
  settings: 'Profile',
};

function TabBarButton({
  route,
  isFocused,
  onPress,
}: {
  route: string;
  isFocused: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const iconName = TAB_ICONS[route] || 'ellipse';
  const inactiveIconName = iconName.endsWith('-outline')
    ? iconName
    : (`${iconName}-outline` as keyof typeof Ionicons.glyphMap);
  const label = TAB_LABELS[route] || route;
  const inactiveColor = 'rgba(255, 255, 255, 0.38)';

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.tabButtonInner, animStyle]}>
        <Ionicons
          name={isFocused ? iconName : inactiveIconName}
          size={22}
          color={isFocused ? Palette.accent : inactiveColor}
        />
        <Animated.Text
          style={[
            styles.tabLabel,
            {
              color: isFocused ? Palette.accent : inactiveColor,
              fontWeight: isFocused ? '700' : '500',
            },
          ]}
        >
          {label}
        </Animated.Text>

        {/* Active Gold Underline Indicator */}
        {isFocused && (
          <Animated.View style={styles.activeUnderline} />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

const VISIBLE_TAB_NAMES = new Set(['index', 'book', 'track', 'scan', 'settings']);

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = (state.routes as any[]).filter((r) =>
    VISIBLE_TAB_NAMES.has(r.name)
  );
  const activeRouteName = (state.routes as any[])[state.index]?.name as string;

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <BlurView
        intensity={Glass.intensity}
        tint={Glass.tint}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(10, 10, 16, 0.74)' },
        ]}
      />
      <View style={styles.tabBarInner}>
        {visibleRoutes.map((route) => {
          const isFocused = activeRouteName === route.name;
          const onPress = () => {
            if (!isFocused) {
              navigation.navigate(route.name);
            }
          };
          return (
            <TabBarButton
              key={route.key}
              route={route.name}
              isFocused={isFocused}
              onPress={onPress}
            />
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
          sceneStyle: { backgroundColor: colors.background },
          freezeOnBlur: true,
        }}
      >
        {/* ── Visible bottom tabs (5 total) ───────────────────────────── */}
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="book" options={{ title: 'Book' }} />
        <Tabs.Screen name="track" options={{ title: 'Tracker' }} />
        <Tabs.Screen name="scan" options={{ title: 'AI Scan' }} />
        <Tabs.Screen name="settings" options={{ title: 'Profile' }} />
      </Tabs>

      {/* Floating Ask AI button — appears on all customer tabs */}
      <AskAiFab />
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    paddingHorizontal: 10,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    fontSize: 9.5,
    marginTop: 1,
  },
  activeUnderline: {
    position: 'absolute',
    bottom: -8,
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: Palette.accent,
    shadowColor: Palette.accent,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});
