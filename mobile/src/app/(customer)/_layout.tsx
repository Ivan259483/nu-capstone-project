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
import { Palette, Glass, Shadows } from '@/constants/theme';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  book: 'add-circle',
  track: 'navigate',
  scan: 'scan',
  settings: 'settings',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  book: 'Book',
  track: 'Tracker',
  scan: 'AI Scan',
  settings: 'Settings',
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
  const { colors } = useTheme();
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

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.tabButtonInner, animStyle]}>
        <Ionicons
          name={isFocused ? iconName : inactiveIconName}
          size={24}
          color={isFocused ? Palette.accent : colors.textSecondary}
          style={isFocused && Shadows.glow}
        />
        <Animated.Text
          style={[
            styles.tabLabel,
            {
              color: isFocused ? Palette.accent : colors.textSecondary,
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

function CustomTabBar({ state, navigation }: any) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 60 + insets.bottom,
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
          { backgroundColor: 'rgba(17, 17, 24, 0.85)' },
        ]}
      />
      <View style={styles.tabBarInner}>
        {state.routes.map((route: any, index: number) => {
          const isFocused = state.index === index;
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
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
        sceneStyle: { backgroundColor: colors.background },
        freezeOnBlur: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="book" options={{ title: 'Book' }} />
      <Tabs.Screen name="track" options={{ title: 'Tracker' }} />
      <Tabs.Screen name="scan" options={{ title: 'AI Scan' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(200, 169, 110, 0.15)',
  },
  tabBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: {
    fontSize: 10,
    marginTop: 2,
  },
  activeUnderline: {
    position: 'absolute',
    bottom: -10,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: Palette.accent,
    ...Shadows.glow,
  },
});
