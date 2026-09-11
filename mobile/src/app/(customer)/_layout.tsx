/**
 * Tab Layout — AutoSPF+ 5-Tab Bottom Navigation
 * Full-width flush tab bar with safe area inset support.
 */

import React, { useEffect } from 'react';
import { Tabs } from 'expo-router';
import {
  View,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, TabBarContentHeight } from '@/constants/theme';
import AskAiFab from '@/components/ui/AskAiFab';
import { useAuth } from '@/context/AuthContext';
import { isCustomerRole } from '@/services/api/roles';
import { Motion, reducedMotionDuration } from '@/constants/motion';

const SHOW_FLOATING_AI_CHATBOT = false;

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  track: 'navigate',
  settings: 'person',
};

const TAB_LABELS: Record<string, string> = {
  index: 'Home',
  book: 'Book',
  track: 'Tracker',
  scan: 'AI Scan',
  settings: 'Profile',
};

const INACTIVE_ICON_COLOR = 'rgba(255, 255, 255, 0.63)';
const TAB_BLUR_INTENSITY = 28;

function BookTabIcon({ isFocused }: { isFocused: boolean }) {
  const color = isFocused ? Palette.accent : INACTIVE_ICON_COLOR;
  const strokeWidth = isFocused ? 1.9 : 1.65;

  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 5.25h10A2.25 2.25 0 0 1 19.25 7.5v9.25A2.25 2.25 0 0 1 17 19H7a2.25 2.25 0 0 1-2.25-2.25V7.5A2.25 2.25 0 0 1 7 5.25Z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
      />
      <Line
        x1="4.75"
        y1="9"
        x2="19.25"
        y2="9"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      <Line
        x1="8.5"
        y1="3.75"
        x2="8.5"
        y2="6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Line
        x1="15.5"
        y1="3.75"
        x2="15.5"
        y2="6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M12 11.5v5M9.5 14h5"
        stroke={color}
        strokeWidth={isFocused ? 2.1 : 1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function AiScanTabIcon({ isFocused }: { isFocused: boolean }) {
  const color = isFocused ? Palette.accent : INACTIVE_ICON_COLOR;
  const strokeWidth = isFocused ? 2 : 1.7;

  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8.25 4.25H6.5A2.25 2.25 0 0 0 4.25 6.5v1.75M15.75 4.25h1.75a2.25 2.25 0 0 1 2.25 2.25v1.75M19.75 15.75v1.75a2.25 2.25 0 0 1-2.25 2.25h-1.75M8.25 19.75H6.5a2.25 2.25 0 0 1-2.25-2.25v-1.75"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M7.5 12h2.75M13.75 12h2.75"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Circle
        cx="12"
        cy="12"
        r="1.45"
        fill={isFocused ? Palette.accent : 'none'}
        stroke={color}
        strokeWidth={isFocused ? 1.5 : 1.35}
      />
    </Svg>
  );
}

function TabIcon({ route, isFocused }: { route: string; isFocused: boolean }) {
  if (route === 'book') return <BookTabIcon isFocused={isFocused} />;
  if (route === 'scan') return <AiScanTabIcon isFocused={isFocused} />;

  const iconName = TAB_ICONS[route] || 'ellipse';
  const inactiveIconName = iconName.endsWith('-outline')
    ? iconName
    : (`${iconName}-outline` as keyof typeof Ionicons.glyphMap);

  return (
    <Ionicons
      name={isFocused ? iconName : inactiveIconName}
      size={21}
      color={isFocused ? Palette.accent : INACTIVE_ICON_COLOR}
    />
  );
}

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
  const reducedMotion = useReducedMotion();

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {

    onPress();
  };

  const label = TAB_LABELS[route] || route;

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={() => {
        if (reducedMotion) return;
        scale.value = withTiming(Motion.scale.compactPress, {
          duration: reducedMotionDuration(reducedMotion, Motion.duration.instant),
          easing: Motion.easing.standard,
        });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, {
          duration: reducedMotionDuration(reducedMotion, Motion.duration.fast),
          easing: Motion.easing.enter,
        });
      }}
      activeOpacity={0.84}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityState={{ selected:isFocused }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.tabButtonInner, animStyle]}>
        <View style={styles.iconSlot}>
          <TabIcon route={route} isFocused={isFocused} />
        </View>
        <Animated.Text
          style={[
            styles.tabLabel,
            {
              color: isFocused ? Palette.accent : INACTIVE_ICON_COLOR,
              fontWeight: isFocused ? '700' : '500',
            },
          ]}
        >
          {label}
        </Animated.Text>

        {isFocused && <Animated.View style={styles.activeIndicator} />}
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

  if (activeRouteName === 'book') return null;

  return (
    <View
      style={[
        styles.tabBarContainer,
        {
          height: TabBarContentHeight + insets.bottom,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      <BlurView
        intensity={TAB_BLUR_INTENSITY}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(5, 7, 10, 0.94)' },
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
  const { initialized, token, profile, signOut } = useAuth();
  const isAuthorizedCustomer = Boolean(token && profile && isCustomerRole(profile.role));

  useEffect(() => {
    if (initialized && !isAuthorizedCustomer && (token || profile)) {
      void signOut();
    }
  }, [initialized, isAuthorizedCustomer, profile, signOut, token]);

  if (!initialized) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  // The root auth guard owns navigation to Login. Rendering a second Redirect
  // here would race that guard while this protected navigator is unmounting.
  if (!isAuthorizedCustomer) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
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
      {SHOW_FLOATING_AI_CHATBOT && <AskAiFab />}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 124, 30, 0.14)',
  },
  tabBarInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 7,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
  },
  tabButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 62,
    height: 48,
    borderRadius: 16,
  },
  iconSlot: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.12,
    marginTop: 2,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 14,
    height: 1.5,
    borderRadius: 2,
    backgroundColor: Palette.accent,
  },
});
