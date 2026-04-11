/**
 * Settings Screen — Premium Customer Profile Hub
 * 
 * Clean grouped-list navigation with no inline modals.
 * Each profile action navigates to its own dedicated screen for a native feel.
 *
 * Groups:
 *   1. Profile         → Edit Profile, Upload Photo, Saved Vehicles, Address
 *   2. Security        → Change Password, Biometric Lock
 *   3. Preferences     → Preferred Branch/Staff, Notifications, Dark Mode
 *   4. Support & Legal → AI Chat, Help Center, Privacy Policy
 *   5. Session Control → Sign Out, Delete Account
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/api/authService';
import { useTheme } from '@/hooks/useThemeContext';
import { Palette, TabBarHeight } from '@/constants/theme';
import AnimatedHeader from '@/components/ui/AnimatedHeader';
import ChatOverlay from '@/components/ChatOverlay';
import { Toast } from '@/components/ui/PremiumToast';

// ── Shared Profile Header ──
import ProfileHeader from '@/features/settings/components/ProfileHeader';

// ══════════════════════════════════════════════════════════════════
//  UTILITY COMPONENTS
// ══════════════════════════════════════════════════════════════════

const SettingsGroup = ({
  title,
  children,
  delay = 100,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
}) => (
  <Animated.View
    entering={FadeInUp.delay(delay).springify().damping(18)}
    style={s.groupContainer}
  >
    <Text style={s.groupTitle}>{title}</Text>
    <View style={s.groupCard}>{children}</View>
  </Animated.View>
);

const SettingsRow = ({
  iconName,
  title,
  subtitle,
  onPress,
  rightElement,
  danger,
}: {
  iconName: any;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  danger?: boolean;
}) => (
  <TouchableOpacity
    style={s.rowContainer}
    onPress={onPress}
    disabled={!onPress}
    activeOpacity={0.7}
  >
    <View style={[s.iconBox, danger && s.iconBoxDanger]}>
      <Ionicons
        name={iconName}
        size={18}
        color={danger ? '#EF4444' : Palette.accent}
      />
    </View>
    <View style={s.rowTextContainer}>
      <Text style={[s.rowTitle, danger && { color: '#EF4444' }]}>{title}</Text>
      {subtitle && <Text style={s.rowSubtitle}>{subtitle}</Text>}
    </View>
    <View style={s.rowRight}>
      {rightElement ||
        (onPress && (
          <Ionicons
            name="chevron-forward"
            size={18}
            color="rgba(255,255,255,0.2)"
          />
        ))}
    </View>
  </TouchableOpacity>
);

const Div = () => <View style={s.rowDivider} />;

// ══════════════════════════════════════════════════════════════════
//  MAIN SETTINGS SCREEN
// ══════════════════════════════════════════════════════════════════

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { profile, user, signOut, refreshProfile } = useAuth();
  const router = useRouter();

  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // ── Security ──
  const [appLockEnabled, setAppLockEnabled] = useState(false);
  const [biometricSupported, setBiometricSupported] = useState(false);

  useEffect(() => {
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      setBiometricSupported(compatible);
      const locked = await AsyncStorage.getItem('@autospf_app_lock');
      if (locked === 'true') setAppLockEnabled(true);
    })();
  }, []);

  // ── Navigation helper ──
  const nav = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  // ── Avatar picker ──
  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets[0]?.base64 && user) {
        setIsUpdatingAvatar(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const base64Avatar = `data:image/jpeg;base64,${result.assets[0].base64}`;
        await authService.updateUserBackendProfile(user, {
          avatar: base64Avatar,
        });
        await refreshProfile();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile picture.');
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  // ── Biometric toggle ──
  const toggleAppLock = async () => {
    try {
      if (!appLockEnabled) {
        if (!biometricSupported) {
          Toast.show('Biometrics not supported on this device', 'error');
          return;
        }
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Authenticate to enable App Lock',
          cancelLabel: 'Cancel',
        });
        if (result.success) {
          await AsyncStorage.setItem('@autospf_app_lock', 'true');
          setAppLockEnabled(true);
          Toast.show('Biometric App Lock Enabled', 'success');
        }
      } else {
        await AsyncStorage.setItem('@autospf_app_lock', 'false');
        setAppLockEnabled(false);
        Toast.show('Biometric App Lock Disabled', 'success');
      }
    } catch {
      Toast.show('Failed to change security preferences', 'error');
    }
  };

  // ── Logout ──
  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await signOut();
          router.replace('/');
        },
      },
    ]);
  };

  // ── Delete Account ──
  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action is completely irreversible. All your data, vehicles, and bookings will be permanently deleted from AutoSPF+ servers. Are you absolutely sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            Toast.show(
              'Please contact support to process account deletion.',
              'error'
            );
          },
        },
      ]
    );
  };

  // ══════════════════════════════════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════════════════════════════════

  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <AnimatedHeader />

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: TabBarHeight + 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar + Name + Badges ── */}
        <ProfileHeader
          profile={profile}
          isUpdatingAvatar={isUpdatingAvatar}
          onPickImage={handlePickImage}
        />

        <View style={{ marginTop: 12 }}>
          {/* ═══ GROUP 1 · PROFILE ═══ */}
          <SettingsGroup title="Profile" delay={150}>
            <SettingsRow
              iconName="person-outline"
              title="Edit Profile"
              subtitle="Name, email, and account details"
              onPress={() => nav('/(screens)/edit-profile')}
            />
            <Div />
            <SettingsRow
              iconName="camera-outline"
              title="Upload Profile Photo"
              subtitle="Change your avatar image"
              onPress={handlePickImage}
            />
            <Div />
            <SettingsRow
              iconName="car-sport-outline"
              title="Saved Vehicles"
              subtitle="Manage your registered cars"
              onPress={() => nav('/(screens)/vehicles')}
            />
            <Div />
            <SettingsRow
              iconName="location-outline"
              title="Address & Location"
              subtitle="Home, work, or pick-up address"
              onPress={() => nav('/(screens)/address')}
            />
          </SettingsGroup>

          {/* ═══ GROUP 2 · SECURITY ═══ */}
          <SettingsGroup title="Security" delay={200}>
            <SettingsRow
              iconName="key-outline"
              title="Change Password"
              subtitle="Update your vault key safely"
              onPress={() => nav('/(screens)/change-password')}
            />
            <Div />
            <SettingsRow
              iconName="finger-print-outline"
              title="Biometric App Lock"
              subtitle="Require Face ID / Touch ID"
              onPress={toggleAppLock}
              rightElement={
                <Switch
                  value={appLockEnabled}
                  onValueChange={toggleAppLock}
                  trackColor={{
                    false: 'rgba(255,255,255,0.1)',
                    true: Palette.accent,
                  }}
                  thumbColor="#FFF"
                />
              }
            />
          </SettingsGroup>

          {/* ═══ GROUP 3 · PREFERENCES ═══ */}
          <SettingsGroup title="Preferences" delay={250}>
            <SettingsRow
              iconName="business-outline"
              title="Preferred Branch & Staff"
              subtitle="Set your go-to location and technician"
              onPress={() => nav('/(screens)/preferred-branch')}
            />
            <Div />
            <SettingsRow
              iconName="notifications-outline"
              title="Notification Preferences"
              subtitle="Control what alerts you receive"
              onPress={() => nav('/(screens)/notification-preferences')}
            />
            <Div />
            <SettingsRow
              iconName={isDark ? 'moon-outline' : 'sunny-outline'}
              title="Dark Mode"
              subtitle="Gold & Dark aesthetic"
              onPress={toggleTheme}
              rightElement={
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{
                    false: 'rgba(255,255,255,0.1)',
                    true: Palette.accent,
                  }}
                  thumbColor="#FFF"
                />
              }
            />
          </SettingsGroup>

          {/* ═══ GROUP 4 · SUPPORT & LEGAL ═══ */}
          <SettingsGroup title="Support & Legal" delay={300}>
            <SettingsRow
              iconName="chatbubbles-outline"
              title="Talk to AutoSPF AI"
              subtitle="24/7 intelligent assistant"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setChatOpen(true);
              }}
            />
            <Div />
            <SettingsRow
              iconName="help-buoy-outline"
              title="Help Center"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Toast.show('Launching Help Center…', 'info');
              }}
            />
            <Div />
            <SettingsRow
              iconName="shield-checkmark-outline"
              title="Privacy Policy & Terms"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Toast.show('Loading Legal Terms…', 'info');
              }}
            />
          </SettingsGroup>

          {/* ═══ GROUP 5 · SESSION CONTROL ═══ */}
          <SettingsGroup title="Session Control" delay={350}>
            <SettingsRow
              iconName="log-out-outline"
              title="Sign Out"
              danger
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                handleLogout();
              }}
            />
            <Div />
            <SettingsRow
              iconName="trash-outline"
              title="Delete Account"
              danger
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                handleDeleteAccount();
              }}
            />
          </SettingsGroup>
        </View>

        {/* ═══ Version Footer ═══ */}
        <Animated.View
          entering={FadeInUp.delay(400).springify().damping(18)}
          style={s.footer}
        >
          <View style={s.footerDivider} />
          <Text style={s.footerBrand}>AutoSPF+</Text>
          <Text style={s.footerVersion}>Version 1.1.0 · Build 2026.04</Text>
          <Text style={s.footerCopy}>
            © 2026 AutoSPF+ Philippines. All rights reserved.
          </Text>
        </Animated.View>
      </ScrollView>

      {/* ── AI Chat Overlay ── */}
      <ChatOverlay visible={chatOpen} onClose={() => setChatOpen(false)} />
    </View>
  );
}

// ══════════════════════════════════════════════════════════════════
//  STYLES
// ══════════════════════════════════════════════════════════════════

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 24, paddingTop: 60 },

  // List Group UI
  groupContainer: {
    marginBottom: 28,
  },
  groupTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A9A',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 12,
    marginLeft: 8,
  },
  groupCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingVertical: 18,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginLeft: 54,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconBoxDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  rowTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#8A8A9A',
  },
  rowRight: {
    paddingLeft: 8,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },

  // Footer UI
  footer: {
    alignItems: 'center',
    marginTop: 16,
    gap: 4,
  },
  footerDivider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 16,
  },
  footerBrand: {
    fontSize: 16,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.12)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  footerVersion: {
    fontSize: 11,
    color: '#4A4A58',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  footerCopy: {
    fontSize: 10,
    color: '#3A3A48',
    fontWeight: '400',
    marginTop: 2,
  },
});
