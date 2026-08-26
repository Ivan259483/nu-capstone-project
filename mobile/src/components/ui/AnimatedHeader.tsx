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
import { useAuth } from '@/context/AuthContext';
import { Palette } from '@/constants/theme';
import { useNotifications } from '@/context/NotificationsContext';

interface AnimatedHeaderProps {
  notifCount?: number;
  compact?: boolean;
}

export default function AnimatedHeader({ notifCount, compact = false }: AnimatedHeaderProps) {
  const { colors, isDark } = useTheme();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const badgeCount = notifCount ?? unreadCount;

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

      <View style={[styles.inner, compact && styles.innerCompact]}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, compact && styles.logoIconCompact]}>
            <Text style={[styles.logoLetter, compact && styles.logoLetterCompact]}>A</Text>
          </View>
          <View>
            <Text style={[styles.logoTitle, compact && styles.logoTitleCompact, { color: colors.text }]}>
              AutoSPF<Text style={{ color: Palette.accent }}>+</Text>
            </Text>
            <Text style={[styles.logoSub, compact && styles.logoSubCompact, { color: colors.textMuted }]}>
              CUSTOMER PORTAL
            </Text>
          </View>
        </View>

        {/* Right actions */}
        <View style={styles.rightRow}>
          <TouchableOpacity
            onPress={() => router.push('/(screens)/notifications')}
            style={styles.bellBtn}
          >
            <Ionicons name="notifications-outline" size={compact ? 20 : 22} color={colors.text} />
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.avatarTouchTarget}>
            <View style={[styles.avatar, compact && styles.avatarCompact]}>
              <Text style={[styles.avatarText, compact && styles.avatarTextCompact]}>
                {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'U'}
              </Text>
            </View>
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
    paddingVertical: 7,
  },
  innerCompact: {
    paddingVertical: 0,
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
  logoIconCompact: {
    width: 27,
    height: 27,
    borderRadius: 9,
  },
  logoLetter: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  logoLetterCompact: {
    fontSize: 13,
  },
  logoTitle: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 17,
  },
  logoTitleCompact: {
    fontSize: 14,
    lineHeight: 16,
  },
  logoSub: {
    fontSize: 9,
    fontWeight: '500',
    letterSpacing: 0.6,
  },
  logoSubCompact: {
    fontSize: 8,
    lineHeight: 10,
    letterSpacing: 0.55,
  },
  rightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellBtn: {
    position: 'relative',
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 3,
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
  avatarCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },
  avatarTextCompact: {
    fontSize: 11,
  },
  avatarTouchTarget: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
