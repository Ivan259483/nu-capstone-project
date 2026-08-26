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
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, Glass, TabBarContentHeight } from '@/constants/theme';
import AskAiFab from '@/components/ui/AskAiFab';
import { useAuth } from '@/context/AuthContext';
import { isCustomerRole } from '@/services/api/roles';

const SHOW_FLOATING_AI_CHATBOT = false;

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
  const inactiveColor = 'rgba(255, 255, 255, 0.56)';

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={() => { scale.value = withTiming(0.98, { duration:100 }); }}
      onPressOut={() => { scale.value = withTiming(1, { duration:140 }); }}
      activeOpacity={0.7}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityState={{ selected:isFocused }}
      accessibilityLabel={label}
    >
      <Animated.View style={[styles.tabButtonInner, animStyle]}>
        <Ionicons
          name={isFocused ? iconName : inactiveIconName}
          size={21}
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

  // Booking is a focused transaction. Its own Back / Continue controls replace
  // the global destinations until the user leaves the booking route.
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
        intensity={Glass.intensity}
        tint={Glass.tint}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(5, 7, 10, 0.90)' },
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
    gap: 2,
    width: 62,
    height: 46,
    borderRadius: 16,
  },
  tabLabel: {
    fontSize: 9,
    marginTop: 1,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: Palette.accent,
  },
});
