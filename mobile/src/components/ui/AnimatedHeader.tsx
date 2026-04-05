/**
 * AnimatedHeader — Sticky header with blur, logo, notification bell
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette } from '@/constants/theme';

interface AnimatedHeaderProps {
  notifCount?: number;
}

export default function AnimatedHeader({ notifCount = 0 }: AnimatedHeaderProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <BlurView
        intensity={Platform.OS === 'ios' ? 80 : 120}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)' },
        ]}
      />

      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoLetter}>A</Text>
          </View>
          <View>
            <Text style={[styles.logoTitle, { color: colors.text }]}>
              AutoSPF<Text style={{ color: Palette.accent }}>+</Text>
            </Text>
            <Text style={[styles.logoSub, { color: colors.textMuted }]}>
              CUSTOMER PORTAL
            </Text>
          </View>
        </View>

        {/* Right actions */}
        <View style={styles.rightRow}>
          <TouchableOpacity
            onPress={toggleTheme}
            style={[styles.themeBtn, { backgroundColor: colors.cardAlt, borderColor: colors.border }]}
          >
            <Ionicons
              name={isDark ? 'sunny' : 'moon'}
              size={14}
              color={isDark ? Palette.accent : colors.text}
            />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/(screens)/notifications')}
            style={styles.bellBtn}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {notifCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{notifCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.avatar}>
            <Text style={styles.avatarText}>IT</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
    zIndex: 50,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.accent,
  },
  logoLetter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  logoTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 17,
  },
  logoSub: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  themeBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  bellBtn: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.accent,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
});
